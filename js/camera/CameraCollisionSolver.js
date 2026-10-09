import * as THREE from 'three';
import { CollisionLayer } from '../physics/CollisionManager.js';

/**
 * CameraCollisionSolver
 * 
 * GTA San Andreas / GTA V tarzı üçüncü şahıs kamera occlusion ve çarpışma çözücü.
 * - Karakter ve araç pivotundan ideal kamera konumuna doğru Spherecast atar.
 * - "Hard-in, Soft-out" prensibiyle çalışır: Duvara çarpınca içeri hızlı çekilir,
 *   engelden çıkınca yumuşak yaylanarak (spring/lerp) eski mesafesine döner.
 * - Hysteresis ve minimum mesafe garantisiyle ince nesnelerde ani zıplamayı önler.
 * - Zemin kotunu (Terrain Elevation) denetler; kamera asla yer altına batmaz.
 * - Sıfır-GC (Zero per-frame allocation) prensibiyle çalışır.
 */
export class CameraCollisionSolver {
  /**
   * @param {import('../physics/CollisionManager.js').CollisionManager} collisionManager 
   * @param {Object} options 
   */
  constructor(collisionManager, options = {}) {
    this.collisionManager = collisionManager;

    // Temel Geometri ve Güvenlik Parametreleri
    this.sphereRadius = options.sphereRadius !== undefined ? options.sphereRadius : 0.24; // Lens küre yarıçapı
    this.safeMargin = options.safeMargin !== undefined ? options.safeMargin : 0.18;   // Duvarın önünde bırakılacak pay
    this.minDistance = options.minDistance !== undefined ? options.minDistance : 0.65; // Minimum kamera mesafesi
    this.minGroundClearance = options.minGroundClearance !== undefined ? options.minGroundClearance : 0.40; // Zemin üstü minimum pay
    this.occlusionLayers = options.occlusionLayers !== undefined ? options.occlusionLayers : (CollisionLayer.BUILDING | CollisionLayer.PROPS | CollisionLayer.VEHICLE);

    // Hard-in (anında/hızlı çekilme) & Soft-out (yumuşak geri açılma) yay katsayıları
    this.hardInFactor = options.hardInFactor !== undefined ? options.hardInFactor : 0.85; // İçeri girerken sönümleme hızı
    this.softOutFactor = options.softOutFactor !== undefined ? options.softOutFactor : 0.10; // Dışarı çıkarken sönümleme hızı

    // Dinamik Mesafe Oranı [0.0 - 1.0] (1.0 = engelsiz tam mesafe)
    this.currentDistanceRatio = 1.0;
    this.targetDistanceRatio = 1.0;

    // Hysteresis & İnce Engel Yumuşatması
    this.lastHitDistance = 999;
    this.occlusionActive = false;

    // Dinamik Pitch Yükseltmesi (Dar alanda aracı/karakteri tepeden görme)
    this.pitchElevationBoost = 0.0;
    this.maxPitchBoost = options.maxPitchBoost !== undefined ? options.maxPitchBoost : 0.28; // ~16 derece

    // Dinamik Omuz Ofseti
    this.currentShoulderFactor = 1.0;

    // Zero-GC Dahili Vektörler
    this._tmpRayDir = new THREE.Vector3();
    this._tmpDesiredPos = new THREE.Vector3();
    this._tmpResultPos = new THREE.Vector3();
    this._tmpShoulderDir = new THREE.Vector3();
    this._tmpSidePivot = new THREE.Vector3();
    this._tmpGroundCheck = new THREE.Vector3();
  }

  /**
   * Çözücünün durumunu sıfırlar (araçtan inip binme, respawn vb. anlarında)
   */
  reset() {
    this.currentDistanceRatio = 1.0;
    this.targetDistanceRatio = 1.0;
    this.pitchElevationBoost = 0.0;
    this.currentShoulderFactor = 1.0;
    this.occlusionActive = false;
  }

  /**
   * Dar sokak ve duvar diplerinde sağ omuz ofsetinin binaya girmesini denetler.
   * Sağda engel varsa omuz ofsetini yumuşakça daraltır.
   * 
   * @param {THREE.Vector3} pivot Karakter gövde/göğüs merkezi
   * @param {number} cameraYaw Karakter kamera yatay açısı
   * @param {number} desiredShoulderOffset İstenen omuz ofseti (örn. 0.42m)
   * @param {number} delta Zaman adımı (sn)
   * @returns {number} Güvenli omuz ofseti
   */
  solveShoulderOffset(pivot, cameraYaw, desiredShoulderOffset, delta = 0.016) {
    if (!this.collisionManager || Math.abs(desiredShoulderOffset) < 0.001) {
      this.currentShoulderFactor = 1.0;
      return desiredShoulderOffset;
    }

    // Sağ yön vektörü (Sağ omuz doğrultusu: Yaw + 90 derece)
    const rightYaw = cameraYaw + Math.PI * 0.5;
    this._tmpShoulderDir.set(Math.sin(rightYaw), 0, Math.cos(rightYaw)).normalize();

    const checkDist = Math.abs(desiredShoulderOffset) + this.sphereRadius + this.safeMargin;
    const hit = this.collisionManager.spherecast(
      pivot,
      this._tmpShoulderDir,
      this.sphereRadius * 0.8,
      checkDist,
      this.occlusionLayers
    );

    let targetFactor = 1.0;
    if (hit && hit.hit && hit.distance < checkDist) {
      const allowedDist = Math.max(0.0, hit.distance - this.safeMargin - this.sphereRadius * 0.8);
      targetFactor = Math.min(1.0, allowedDist / Math.abs(desiredShoulderOffset));
    }

    // Hard-in / soft-out mantığı omuz için de geçerli
    if (targetFactor < this.currentShoulderFactor) {
      const inSpeed = 1.0 - Math.pow(1.0 - this.hardInFactor, delta * 60);
      this.currentShoulderFactor = THREE.MathUtils.lerp(this.currentShoulderFactor, targetFactor, inSpeed);
    } else {
      const outSpeed = 1.0 - Math.pow(1.0 - this.softOutFactor, delta * 60);
      this.currentShoulderFactor = THREE.MathUtils.lerp(this.currentShoulderFactor, targetFactor, outSpeed);
    }

    return desiredShoulderOffset * this.currentShoulderFactor;
  }

  /**
   * Ana Occlusion Çözücü
   * 
   * @param {THREE.Vector3} pivot Hedef odak noktası (Karakter baş/göğüs veya araç merkezi)
   * @param {THREE.Vector3} idealCamPos Engeller yokken kameranın durması gereken ideal konum
   * @param {number} delta Zaman adımı (sn)
   * @param {THREE.Vector3} [outCamPos] Çıktı pozisyonu (verilmezse dahili vektör döner)
   * @param {boolean} [applyPitchBoost=true] Dar alanda yukarıdan bakış açısı yükseltmesi uygulansın mı
   * @returns {THREE.Vector3} Engellerden arındırılmış güvenli kamera konumu
   */
  solve(pivot, idealCamPos, delta = 0.016, outCamPos = null, applyPitchBoost = false) {
    const out = outCamPos || this._tmpResultPos;

    if (!this.collisionManager) {
      out.copy(idealCamPos);
      return out;
    }

    // Pivot'tan ideal kamera konumuna olan mesafe ve doğrultu
    this._tmpRayDir.subVectors(idealCamPos, pivot);
    const idealDist = this._tmpRayDir.length();

    if (idealDist < 0.001) {
      out.copy(idealCamPos);
      return out;
    }

    this._tmpRayDir.multiplyScalar(1.0 / idealDist); // Normalize

    // 1. SPHERECAST İLE ENGEL SORGULAMA (AABB binalar, duvarlar, çatı ve nesneler)
    // Raycast Optimizasyonu (P8): Pivot ve ideal kamera konumu mikro düzeyde dahi değişmediyse spherecast atla
    if (!this._lastPivot) this._lastPivot = new THREE.Vector3();
    if (!this._lastIdeal) this._lastIdeal = new THREE.Vector3();

    const isStationary = this._lastPivot.distanceToSquared(pivot) < 0.0004 &&
                         this._lastIdeal.distanceToSquared(idealCamPos) < 0.0004;

    if (!isStationary) {
      this._lastPivot.copy(pivot);
      this._lastIdeal.copy(idealCamPos);

      const hit = this.collisionManager.spherecast(
        pivot,
        this._tmpRayDir,
        this.sphereRadius,
        idealDist,
        this.occlusionLayers
      );

      if (hit && hit.hit && hit.distance < idealDist) {
        // Bir engel bulundu: kamerayı engelin safeMargin kadar önüne çek
        const clampedHitDist = Math.max(this.minDistance, hit.distance - this.safeMargin);
        this.targetDistanceRatio = THREE.MathUtils.clamp(clampedHitDist / idealDist, 0.0, 1.0);
        this.occlusionActive = true;
        this.lastHitDistance = hit.distance;
      } else {
        // Engel yok, tam mesafeye dön
        this.targetDistanceRatio = 1.0;
        this.occlusionActive = false;
      }
    }

    // 2. HARD-IN / SOFT-OUT ASİMETRİK SÖNÜMLEME
    // Duvara girerken anında veya çok hızlı daralır; duvardan çıkınca yumuşakça süzülerek açılır.
    if (this.targetDistanceRatio < this.currentDistanceRatio) {
      // Daralma (Hard-in): Frame rate bağımsız hızlı lerp
      const inSpeed = 1.0 - Math.pow(1.0 - this.hardInFactor, delta * 60);
      this.currentDistanceRatio = THREE.MathUtils.lerp(this.currentDistanceRatio, this.targetDistanceRatio, inSpeed);
      // Çok ani yaklaşmalarda minimum mesafeye hemen kenetlen (duvar içine tek frame sızmasını engeller)
      if (this.targetDistanceRatio < this.currentDistanceRatio && (this.currentDistanceRatio - this.targetDistanceRatio) > 0.4) {
        this.currentDistanceRatio = this.targetDistanceRatio + 0.1;
      }
    } else {
      // Genişleme (Soft-out): Yumuşak yay süzülmesi
      const outSpeed = 1.0 - Math.pow(1.0 - this.softOutFactor, delta * 60);
      this.currentDistanceRatio = THREE.MathUtils.lerp(this.currentDistanceRatio, this.targetDistanceRatio, outSpeed);
    }

    // Efektif kamera mesafesi
    const effectiveDist = Math.max(this.minDistance, idealDist * this.currentDistanceRatio);

    // 3. DAR ALANDA PITCH ELEVATION BOOST (Araç ve garaj diplerinde görüşü kurtarma)
    let extraPitchY = 0.0;
    if (applyPitchBoost) {
      // Mesafe %50'nin altına indiğinde kamerayı hafif yukarı doğru kaldır
      const pinchFactor = THREE.MathUtils.clamp((0.65 - this.currentDistanceRatio) / 0.65, 0.0, 1.0);
      const targetBoost = pinchFactor * this.maxPitchBoost;
      this.pitchElevationBoost = THREE.MathUtils.lerp(this.pitchElevationBoost, targetBoost, delta * 8.0);
      extraPitchY = this.pitchElevationBoost * effectiveDist;
    } else {
      this.pitchElevationBoost = 0.0;
    }

    // Efektif kamera konumu hesaplama
    out.copy(pivot)
      .addScaledVector(this._tmpRayDir, effectiveDist);
    out.y += extraPitchY;

    // 4. ZEMİN KOTU GÜVENLİK KONTROLÜ (Terrain Elevation Clipping Prevention)
    // Kamera y pozisyonu zemin seviyesi altına veya zemine çok yakın kotlara inemez
    if (this.collisionManager.getGroundInfo) {
      const ground = this.collisionManager.getGroundInfo(out.x, out.z);
      const minAllowedY = ground.elevation + this.minGroundClearance;
      if (out.y < minAllowedY) {
        out.y = minAllowedY;
      }
    }

    return out;
  }

  /**
   * Çözücünün o an kamera mesafesini kısaltıp kısaltmadığını belirtir
   * @returns {boolean}
   */
  isOccluded() {
    return this.occlusionActive || this.currentDistanceRatio < 0.96;
  }

  /**
   * Aktif mesafe sıkıştırma oranı (1.0 = tam mesafe, 0.2 = aşırı daralmış)
   * @returns {number}
   */
  getCompressionRatio() {
    return this.currentDistanceRatio;
  }
}
