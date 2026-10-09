import * as THREE from 'three';

/**
 * SpatialChunkManager - Sektör Tabanlı Mekânsal Bölümleme, Frustum Güvenlik Konisi ve Histerezis LOD Yöneticisi
 * Şehir binalarını, çevre objelerini ve yol parçalarını ızgara sektörlerine (chunk) dağıtır.
 * - 360° Oyuncu Çekirdek Güvenlik Alanı (90m içindeki sektörler açıktır, arkaya dönünce asla silinmez)
 * - Konservatif Frustum Güvenlik Konisi (AABB 35m marjla genişletilerek kadraja girmeden önce açılır)
 * - Asimetrik Çift Yönlü Histerezis (Görünür yapma 0ms anlık, görünmez yapma 1.2s gecikmeli grace period)
 * - Reaktif Kamera Dönüş Algılayıcısı (Hızlı fare hareketlerinde 80ms throttle bypass edilir)
 */
export class SpatialChunkManager {
  constructor(scene, options = {}) {
    this.scene = scene;
    this.chunkSize = options.chunkSize || 80; // 80x80 metre sektörler
    this.cullDistance = options.cullDistance || 240; // Bu mesafenin ötesi tamamen gizlenir
    this.lodDistance = options.lodDistance || 120;   // Bu mesafenin ötesinde gölgeler & detaylar kapanır

    this.cullDistSq = this.cullDistance * this.cullDistance;
    this.lodDistSq = this.lodDistance * this.lodDistance;

    // Histerezis ve Güvenlik Parametreleri
    this.innerCoreRadius = options.innerCoreRadius || 90; // 90m daimi 360° görünürlük çemberi
    this.innerCoreDistSq = this.innerCoreRadius * this.innerCoreRadius; // 8100 m²
    this.frustumMargin = options.frustumMargin || 35; // Kadraja girmeden önce erken yakalama marjı (metre)
    this.hideDelay = options.hideDelay || 1.2; // Kadrajdan çıktıktan sonra açık kalma süresi (saniye)

    // chunkKey (ör: "0,0", "1,-2") -> ChunkData
    this.chunks = new Map();

    // Frustum testi ve AABB hesaplamaları için sıfır GC geçici matris & nesneler
    this._cameraFrustum = new THREE.Frustum();
    this._projScreenMatrix = new THREE.Matrix4();
    this._box = new THREE.Box3();
    this._expandedBox = new THREE.Box3();
    this._vMin = new THREE.Vector3();
    this._vMax = new THREE.Vector3();

    // Reaktif kamera dönüş takibi (hızlı dönüşlerde 0-lag güncelleme)
    this._lastCameraQuat = new THREE.Quaternion();
    this._hasInitQuat = false;

    this.lastPlayerChunkKey = '';
    this._throttleTimer = 0;
  }

  getChunkKey(x, z) {
    const cx = Math.floor(x / this.chunkSize);
    const cz = Math.floor(z / this.chunkSize);
    return `${cx},${cz}`;
  }

  getOrCreateChunk(cx, cz) {
    const key = `${cx},${cz}`;
    let chunk = this.chunks.get(key);
    if (!chunk) {
      const minX = cx * this.chunkSize;
      const minZ = cz * this.chunkSize;
      const maxX = minX + this.chunkSize;
      const maxZ = minZ + this.chunkSize;
      const centerX = (minX + maxX) / 2;
      const centerZ = (minZ + maxZ) / 2;

      chunk = {
        key,
        cx,
        cz,
        centerX,
        centerZ,
        bounds: new THREE.Box3(
          new THREE.Vector3(minX, -5, minZ),
          new THREE.Vector3(maxX, 45, maxZ)
        ),
        objects: [],        // Bu sektördeki Three.js nesneleri
        shadowMeshes: [],   // Gölge atan nesneler
        isVisible: true,
        lodLevel: 0,        // 0: full, 1: mid (no shadows), 2: culled
        hideGraceTimer: this.hideDelay // Histerezis sönümleme sayacı
      };
      this.chunks.set(key, chunk);
    }
    return chunk;
  }

  /**
   * Bir nesneyi konumuna göre ilgili sektöre kaydeder
   */
  registerObject(object, worldPos = null) {
    if (!object) return;

    let pos = worldPos;
    if (!pos) {
      pos = new THREE.Vector3();
      object.getWorldPosition(pos);
    }

    const cx = Math.floor(pos.x / this.chunkSize);
    const cz = Math.floor(pos.z / this.chunkSize);
    const chunk = this.getOrCreateChunk(cx, cz);

    chunk.objects.push(object);

    // Gölge atan alt mesh'leri topla
    object.traverse((child) => {
      if (child.isMesh && child.castShadow) {
        chunk.shadowMeshes.push(child);
      }
    });
  }

  /**
   * Oyuncu ve kamera konumuna göre sektörleri günceller
   * @param {THREE.Camera} camera
   * @param {THREE.Vector3} playerPos
   * @param {number} delta
   */
  update(camera, playerPos, delta = 0.016) {
    if (!camera || !playerPos) return;

    // Hızlı kamera dönüş tespiti (mouse pan / hızlı dönüşlerde 0ms lag)
    let isFastRotating = false;
    if (!this._hasInitQuat) {
      this._lastCameraQuat.copy(camera.quaternion);
      this._hasInitQuat = true;
    } else {
      const angleDelta = camera.quaternion.angleTo(this._lastCameraQuat);
      if (angleDelta > 0.03) { // ~1.7 dereceden büyük dönüşlerde anında devreye gir
        isFastRotating = true;
      }
    }

    this._throttleTimer += delta;
    if (!isFastRotating && this._throttleTimer < 0.08) {
      return;
    }
    const elapsedSinceLast = this._throttleTimer;
    this._throttleTimer = 0;
    this._lastCameraQuat.copy(camera.quaternion);

    // Frustum matrisini güncelle
    this._projScreenMatrix.multiplyMatrices(camera.projectionMatrix, camera.matrixWorldInverse);
    this._cameraFrustum.setFromProjectionMatrix(this._projScreenMatrix);

    const px = playerPos.x;
    const pz = playerPos.z;

    for (const chunk of this.chunks.values()) {
      const dx = chunk.centerX - px;
      const dz = chunk.centerZ - pz;
      const distSq = dx * dx + dz * dz;

      // 1. Maksimum mesafe culling (240m ötesi daima elenir)
      if (distSq > this.cullDistSq) {
        chunk.hideGraceTimer = 0;
        if (chunk.isVisible) {
          this.setChunkVisibility(chunk, false);
        }
        continue;
      }

      // 2. 360° Çekirdek Güvenlik Alanı (90m içindeki tüm sektörler açıktır, arkaya dönünce asla silinmez)
      if (distSq <= this.innerCoreDistSq) {
        chunk.hideGraceTimer = this.hideDelay;
        if (!chunk.isVisible) {
          this.setChunkVisibility(chunk, true);
        }
      } else {
        // 3. Konservatif Güvenlik Frustum Testi (35m marjla genişletilmiş AABB)
        this._expandedBox.copy(chunk.bounds).expandByScalar(this.frustumMargin);
        const inFrustum = this._cameraFrustum.intersectsBox(this._expandedBox);

        if (inFrustum) {
          // Kadrajda veya kadraja girmek üzere: Anında aç ve grace timer'ı yenile
          chunk.hideGraceTimer = this.hideDelay;
          if (!chunk.isVisible) {
            this.setChunkVisibility(chunk, true);
          }
        } else {
          // Kadraj dışı: Hemen kapatma, histerezis süresi kadar açık tut
          if (chunk.isVisible) {
            chunk.hideGraceTimer -= elapsedSinceLast;
            if (chunk.hideGraceTimer <= 0) {
              this.setChunkVisibility(chunk, false);
            }
          }
        }
      }

      // 4. Mesafe Bazlı Detay / Gölge LOD'si (Yalnızca görünür sektörler için)
      if (chunk.isVisible) {
        if (distSq > this.lodDistSq) {
          if (chunk.lodLevel !== 1) {
            chunk.lodLevel = 1;
            this.setChunkShadows(chunk, false);
          }
        } else {
          if (chunk.lodLevel !== 0) {
            chunk.lodLevel = 0;
            this.setChunkShadows(chunk, true);
          }
        }
      }
    }
  }

  setChunkVisibility(chunk, visible) {
    chunk.isVisible = visible;
    const len = chunk.objects.length;
    for (let i = 0; i < len; i++) {
      chunk.objects[i].visible = visible;
    }
  }

  setChunkShadows(chunk, castShadow) {
    const len = chunk.shadowMeshes.length;
    for (let i = 0; i < len; i++) {
      chunk.shadowMeshes[i].castShadow = castShadow;
    }
  }
}
