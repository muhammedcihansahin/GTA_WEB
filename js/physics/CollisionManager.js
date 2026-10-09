import * as THREE from 'three';
import { PARCEL_PLOTS } from '../parcels.js';
import { VehicleCollisionSolver } from './VehicleCollisionSolver.js';

/**
 * Katman (Bitmask) Tanımları
 */
export const CollisionLayer = {
  NONE: 0,
  TERRAIN: 1 << 0,   // 1
  BUILDING: 1 << 1,  // 2
  SIDEWALK: 1 << 2,  // 4
  VEHICLE: 1 << 3,   // 8
  PED: 1 << 4,       // 16
  CAMERA: 1 << 5,    // 32
  TRIGGER: 1 << 6,   // 64
  PROPS: 1 << 7,     // 128
  ALL: 0xFFFFFFFF
};

/**
 * CollisionManager
 * Merkezi Mekansal Izgara (Spatial Hash Grid) tabanlı çarpışma, zemin (ground query),
 * raycast ve spherecast yöneticisi.
 * Sıfır-GC (Zero per-frame allocation) prensibiyle çalışır.
 */
export class CollisionManager {
  constructor(cellSize = 20) {
    this.cellSize = cellSize;
    this.grid = new Map();
    this.allColliders = [];
    this.collidersById = new Map();

    this.scene = null;
    this.terrainManager = null;

    // Zero-GC Yeniden Kullanılabilir Hesaplama Değişkenleri
    this._tmpNearList = [];
    this._tmpVec3A = new THREE.Vector3();
    this._tmpVec3B = new THREE.Vector3();
    this._tmpRayDir = new THREE.Vector3();

    // Reusable Return Nesneleri
    this._groundInfo = {
      elevation: 0,
      normal: new THREE.Vector3(0, 1, 0),
      surfaceType: 'terrain',
      isWalkable: true,
      hit: true
    };

    this._raycastHit = {
      hit: false,
      distance: Infinity,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      collider: null
    };

    this._spherecastHit = {
      hit: false,
      distance: Infinity,
      point: new THREE.Vector3(),
      normal: new THREE.Vector3(),
      collider: null
    };

    // Debug Görselleştirme
    this.debugEnabled = false;
    this.debugGroup = null;
    this._debugBoxes = [];
    this._debugLineSegments = null;

    // Klavye dinleyicisi (KeyK / F3 ile açılıp kapanır)
    this._onKeyDown = (e) => {
      if (e.code === 'KeyK' || e.code === 'F3') {
        this.setDebugEnabled(!this.debugEnabled);
      }
    };
    if (typeof window !== 'undefined') {
      window.addEventListener('keydown', this._onKeyDown);
    }

    // Parsel verilerini başlangıçta otomatik yükle
    this.initFromParcels(PARCEL_PLOTS);

    // ADIM 2: Dinamik Araç Katı Kalkan ve Çarpışma Çözücü
    this.vehicleSolver = new VehicleCollisionSolver();
  }

  /**
   * Sahne ve TerrainManager referanslarını bağlar.
   */
  init(scene, terrainManager = null) {
    this.scene = scene;
    if (terrainManager) {
      this.terrainManager = terrainManager;
    }

    if (this.scene && !this.debugGroup) {
      this.debugGroup = new THREE.Group();
      this.debugGroup.name = 'CollisionDebugGroup';
      this.debugGroup.visible = false;
      this.scene.add(this.debugGroup);
    }

    return this;
  }

  _getKey(cellX, cellZ) {
    return `${cellX},${cellZ}`;
  }

  _getCoords(val) {
    return Math.floor(val / this.cellSize);
  }

  /**
   * Box3 veya {min, max} formatında AABB collider kaydeder.
   */
  addAABBCollider(id, box, layer = CollisionLayer.BUILDING, isWalkable = false) {
    if (!box) return null;

    const minX = box.min.x;
    const minY = box.min.y;
    const minZ = box.min.z;
    const maxX = box.max.x;
    const maxY = box.max.y;
    const maxZ = box.max.z;

    const colliderId = id || `col_${this.allColliders.length}`;

    // Mevcut varsa kaldır
    if (this.collidersById.has(colliderId)) {
      this.removeCollider(colliderId);
    }

    const collider = {
      id: colliderId,
      layer,
      type: layer === CollisionLayer.BUILDING ? 'building' : 'custom',
      minX, minY, minZ,
      maxX, maxY, maxZ,
      centerX: (minX + maxX) * 0.5,
      centerZ: (minZ + maxZ) * 0.5,
      halfW: (maxX - minX) * 0.5,
      halfD: (maxZ - minZ) * 0.5,
      isWalkable
    };

    this.allColliders.push(collider);
    this.collidersById.set(colliderId, collider);

    const minCellX = this._getCoords(minX);
    const maxCellX = this._getCoords(maxX);
    const minCellZ = this._getCoords(minZ);
    const maxCellZ = this._getCoords(maxZ);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = this._getKey(cx, cz);
        let list = this.grid.get(key);
        if (!list) {
          list = [];
          this.grid.set(key, list);
        }
        list.push(collider);
      }
    }

    if (this.debugEnabled) {
      this._rebuildDebugMeshes();
    }

    return collider;
  }

  /**
   * Eski addBox API'siyle uyumluluk köprüsü
   */
  addBox(minX, minY, minZ, maxX, maxY, maxZ, type = 'building', id = '', layer = CollisionLayer.BUILDING) {
    const box = {
      min: { x: minX, y: minY, z: minZ },
      max: { x: maxX, y: maxY, z: maxZ }
    };
    const col = this.addAABBCollider(id, box, layer, false);
    if (col) col.type = type;
    return col;
  }

  /**
   * Collider'ı ızgaradan ve kayıttan siler.
   */
  removeCollider(id) {
    const col = this.collidersById.get(id);
    if (!col) return false;

    this.collidersById.delete(id);
    const idx = this.allColliders.indexOf(col);
    if (idx !== -1) {
      this.allColliders.splice(idx, 1);
    }

    const minCellX = this._getCoords(col.minX);
    const maxCellX = this._getCoords(col.maxX);
    const minCellZ = this._getCoords(col.minZ);
    const maxCellZ = this._getCoords(col.maxZ);

    for (let cx = minCellX; cx <= maxCellX; cx++) {
      for (let cz = minCellZ; cz <= maxCellZ; cz++) {
        const key = this._getKey(cx, cz);
        const list = this.grid.get(key);
        if (list) {
          const listIdx = list.indexOf(col);
          if (listIdx !== -1) {
            list.splice(listIdx, 1);
          }
          if (list.length === 0) {
            this.grid.delete(key);
          }
        }
      }
    }

    if (this.debugEnabled) {
      this._rebuildDebugMeshes();
    }

    return true;
  }

  /**
   * Parsellerden binaları ekler.
   */
  initFromParcels(parcels) {
    if (!parcels || !parcels.length) return;

    for (let i = 0; i < parcels.length; i++) {
      const p = parcels[i];
      const halfW = (p.w * 0.65) * 0.5;
      const halfD = (p.d * 0.65) * 0.5;
      const minX = p.x - halfW;
      const maxX = p.x + halfW;
      const minZ = p.z - halfD;
      const maxZ = p.z + halfD;
      const minY = p.y || 0;
      const maxY = minY + 10.0;

      const box = {
        min: { x: minX, y: minY, z: minZ },
        max: { x: maxX, y: maxY, z: maxZ }
      };
      this.addAABBCollider(p.id || `parcel_${i}`, box, CollisionLayer.BUILDING, false);
    }
  }

  /**
   * Belirtilen (x, z) yarıçapındaki hücrelerdeki collider'ları döndürür.
   */
  getCollidersNear(x, z, radius, outList = this._tmpNearList) {
    outList.length = 0;
    const minCX = this._getCoords(x - radius);
    const maxCX = this._getCoords(x + radius);
    const minCZ = this._getCoords(z - radius);
    const maxCZ = this._getCoords(z + radius);

    for (let cx = minCX; cx <= maxCX; cx++) {
      for (let cz = minCZ; cz <= maxCZ; cz++) {
        const key = this._getKey(cx, cz);
        const list = this.grid.get(key);
        if (list) {
          for (let i = 0; i < list.length; i++) {
            const col = list[i];
            if (outList.indexOf(col) === -1) {
              outList.push(col);
            }
          }
        }
      }
    }
    return outList;
  }

  /**
   * Hibrit Zemin Sorgusu (Ground Query API)
   * Öncelik: Varsa üstüne basılabilir (walkable/rooftop) AABB, yoksa terrain.getElevation.
   */
  getGroundInfo(x, z, currentY = 0, entityType = 'ped') {
    const res = this._groundInfo;
    res.hit = true;
    res.normal.set(0, 1, 0);
    res.surfaceType = 'terrain';
    res.isWalkable = true;

    // 1. Temel arazi yüksekliği
    let elev = 0;
    if (this.terrainManager && typeof this.terrainManager.getElevation === 'function') {
      elev = this.terrainManager.getElevation(x, z);
    }
    res.elevation = elev;

    // 2. Walkable AABB kontrolü (çatı, merdiven, platform)
    const nearList = this.getCollidersNear(x, z, 1.0, this._tmpNearList);
    for (let i = 0; i < nearList.length; i++) {
      const col = nearList[i];
      if (x >= col.minX && x <= col.maxX && z >= col.minZ && z <= col.maxZ) {
        // Eğer walkable ise veya varlık çatının üstünde/yakınındaysa
        if (col.isWalkable || (currentY >= col.maxY - 0.6 && currentY <= col.maxY + 2.0)) {
          if (col.maxY > res.elevation) {
            res.elevation = col.maxY;
            res.surfaceType = col.type || 'building';
            res.isWalkable = true;
          }
        }
      }
    }

    return res;
  }

  /**
   * Yatay Hareket Çözücü (Horizontal Resolve API)
   * Konumu kaydırır ve opsiyonel hız vektörünü teğet düzeltir.
   */
  resolveMovement(position, radius, velocity = null, deltaTime = 0, layerMask = CollisionLayer.BUILDING | CollisionLayer.PROPS) {
    const nearList = this.getCollidersNear(position.x, position.z, radius + 2.0, this._tmpNearList);
    let collided = false;

    for (let i = 0; i < nearList.length; i++) {
      const col = nearList[i];
      if ((col.layer & layerMask) === 0) continue;

      // Y ekseni yükseklik aralığı kontrolü
      if (position.y + 1.8 < col.minY || position.y > col.maxY) continue;

      const halfW = col.halfW + radius;
      const halfD = col.halfD + radius;
      const dx = position.x - col.centerX;
      const dz = position.z - col.centerZ;

      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        collided = true;
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);

        if (overlapX < overlapZ) {
          const signX = Math.sign(dx || 1);
          position.x = col.centerX + signX * halfW;
          if (velocity && velocity.x * signX < 0) {
            velocity.x = 0; // Duvara dik hız bileşenini sıfırla, kaymayı sağla
          }
        } else {
          const signZ = Math.sign(dz || 1);
          position.z = col.centerZ + signZ * halfD;
          if (velocity && velocity.z * signZ < 0) {
            velocity.z = 0;
          }
        }
      }
    }

    return collided;
  }

  /**
   * Geriye dönük uyumlu çember kaydırma (resolveCircleSlide)
   */
  resolveCircleSlide(pos, radius, margin = 0.05, outNearList = []) {
    this.getCollidersNear(pos.x, pos.z, radius + 2.0, outNearList);

    let collided = false;
    for (let i = 0; i < outNearList.length; i++) {
      const col = outNearList[i];
      if (pos.y + 1.8 < col.minY || pos.y > col.maxY) continue;

      const halfW = col.halfW + radius + margin;
      const halfD = col.halfD + radius + margin;
      const dx = pos.x - col.centerX;
      const dz = pos.z - col.centerZ;

      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        collided = true;
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);

        if (overlapX < overlapZ) {
          pos.x = col.centerX + Math.sign(dx || 1) * halfW;
        } else {
          pos.z = col.centerZ + Math.sign(dz || 1) * halfD;
        }
      }
    }

    return collided;
  }

  /**
   * ADIM 2: Karakter - Araç Katı Kalkan Çarpışması (OBB Push-Out & Knockback)
   */
  resolveCharacterVehicleCollisions(pos, radius = 0.45, isDriving = false, vehicles = [], npcs = [], policePool = [], delta = 0.016, audioManager = null, charInstance = null) {
    if (this.vehicleSolver) {
      this.vehicleSolver.resolvePlayerVehicleCollisions(pos, radius, isDriving, vehicles, npcs, policePool, delta, audioManager, charInstance);
    }
  }

  /**
   * ADIM 2: Araç - Araç Çarpışması (3-Kapsül OBB Penetrasyon Ayrılması & Momentum İtme)
   */
  resolveVehicleVehicleCollisions(allVehicles = [], activeVehicle = null, npcs = [], policePool = [], delta = 0.016, onCrash = null) {
    if (this.vehicleSolver) {
      this.vehicleSolver.resolveVehicleVehicleCollisions(allVehicles, activeVehicle, npcs, policePool, delta, onCrash);
    }
  }

  /**
   * Araçlar için normal tabanlı kayma (slide) ve sönümlü sekme (soft-bounce) çözücü.
   * Teleport yapmaz, duvara dik hız bileşenini sönümler veya yumuşakça sektirir, teğetsel hızı sürtünmeyle kaydırır.
   */
  resolveVehicleSlide(pos, vel = null, radius = 1.0, restitution = 0.15, wallFriction = 0.70, outNearList = []) {
    this.getCollidersNear(pos.x, pos.z, radius + 2.5, outNearList);
    let collided = false;
    let hitNormalX = 0;
    let hitNormalZ = 0;

    for (let i = 0; i < outNearList.length; i++) {
      const col = outNearList[i];
      if (pos.y + 1.8 < col.minY || pos.y > col.maxY) continue;

      const halfW = col.halfW + radius;
      const halfD = col.halfD + radius;
      const dx = pos.x - col.centerX;
      const dz = pos.z - col.centerZ;

      if (Math.abs(dx) < halfW && Math.abs(dz) < halfD) {
        collided = true;
        const overlapX = halfW - Math.abs(dx);
        const overlapZ = halfD - Math.abs(dz);

        let nx = 0;
        let nz = 0;

        if (overlapX < overlapZ) {
          nx = Math.sign(dx || 1);
          pos.x = col.centerX + nx * halfW;
        } else {
          nz = Math.sign(dz || 1);
          pos.z = col.centerZ + nz * halfD;
        }

        hitNormalX += nx;
        hitNormalZ += nz;

        // Hız vektörü düzeltmesi (varsa)
        if (vel) {
          const vn = vel.x * nx + vel.z * nz;
          if (vn < 0) { // Duvar yönüne doğru hareket varsa
            // Normal doğrultusundaki hızı ters çevirip sönümle (soft bounce)
            vel.x -= (1.0 + restitution) * vn * nx;
            vel.z -= (1.0 + restitution) * vn * nz;

            // Duvar sürtünmesi (teğetsel hızı sönümle)
            vel.x *= wallFriction;
            vel.z *= wallFriction;
          }
        }
      }
    }

    const normLen = Math.hypot(hitNormalX, hitNormalZ);
    if (normLen > 0.0001) {
      hitNormalX /= normLen;
      hitNormalZ /= normLen;
    }

    return { collided, normalX: hitNormalX, normalZ: hitNormalZ };
  }

  /**
   * Raycast API (Slab Metodu)
   */
  raycast(origin, direction, distance = 100, layerMask = CollisionLayer.BUILDING | CollisionLayer.PROPS) {
    const outHit = this._raycastHit;
    outHit.hit = false;
    outHit.distance = distance;
    outHit.collider = null;

    const checkRadius = distance * 0.5 + 2.0;
    const midX = origin.x + direction.x * (distance * 0.5);
    const midZ = origin.z + direction.z * (distance * 0.5);

    const nearList = this.getCollidersNear(midX, midZ, checkRadius, this._tmpNearList);

    const invDirX = direction.x !== 0 ? 1.0 / direction.x : 1e12;
    const invDirY = direction.y !== 0 ? 1.0 / direction.y : 1e12;
    const invDirZ = direction.z !== 0 ? 1.0 / direction.z : 1e12;

    for (let i = 0; i < nearList.length; i++) {
      const col = nearList[i];
      if ((col.layer & layerMask) === 0) continue;

      const t1 = (col.minX - origin.x) * invDirX;
      const t2 = (col.maxX - origin.x) * invDirX;
      const t3 = (col.minY - origin.y) * invDirY;
      const t4 = (col.maxY - origin.y) * invDirY;
      const t5 = (col.minZ - origin.z) * invDirZ;
      const t6 = (col.maxZ - origin.z) * invDirZ;

      const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
      const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

      if (tmax < 0 || tmin > tmax) continue;

      const hitDist = tmin >= 0 ? tmin : tmax;
      if (hitDist >= 0 && hitDist < outHit.distance) {
        outHit.hit = true;
        outHit.distance = hitDist;
        outHit.point.copy(origin).addScaledVector(direction, hitDist);
        outHit.collider = col;

        // Yüzey normali hesabı
        const p = outHit.point;
        const eps = 0.001;
        if (Math.abs(p.x - col.minX) < eps) outHit.normal.set(-1, 0, 0);
        else if (Math.abs(p.x - col.maxX) < eps) outHit.normal.set(1, 0, 0);
        else if (Math.abs(p.y - col.minY) < eps) outHit.normal.set(0, -1, 0);
        else if (Math.abs(p.y - col.maxY) < eps) outHit.normal.set(0, 1, 0);
        else if (Math.abs(p.z - col.minZ) < eps) outHit.normal.set(0, 0, -1);
        else outHit.normal.set(0, 0, 1);
      }
    }

    return outHit;
  }

  /**
   * Geriye dönük uyumlu raycastClosest
   */
  raycastClosest(rayOrigin, rayDir, maxDist, outHit, outNearList = []) {
    const res = this.raycast(rayOrigin, rayDir, maxDist, CollisionLayer.ALL);
    if (res.hit) {
      outHit.hit = true;
      outHit.distance = res.distance;
      outHit.point.copy(res.point);
      if (outHit.normal) outHit.normal.copy(res.normal);
      return true;
    }
    outHit.hit = false;
    outHit.distance = maxDist;
    return false;
  }

  /**
   * Spherecast API
   * AABB kutularını radius kadar genişleterek raycast mantığı uygular.
   */
  spherecast(origin, direction, radius, distance = 100, layerMask = CollisionLayer.BUILDING | CollisionLayer.PROPS) {
    const outHit = this._spherecastHit;
    outHit.hit = false;
    outHit.distance = distance;
    outHit.collider = null;

    const checkRadius = distance * 0.5 + radius + 2.0;
    const midX = origin.x + direction.x * (distance * 0.5);
    const midZ = origin.z + direction.z * (distance * 0.5);

    const nearList = this.getCollidersNear(midX, midZ, checkRadius, this._tmpNearList);

    const invDirX = direction.x !== 0 ? 1.0 / direction.x : 1e12;
    const invDirY = direction.y !== 0 ? 1.0 / direction.y : 1e12;
    const invDirZ = direction.z !== 0 ? 1.0 / direction.z : 1e12;

    for (let i = 0; i < nearList.length; i++) {
      const col = nearList[i];
      if ((col.layer & layerMask) === 0) continue;

      // Radius ile genişletilmiş AABB
      const minX = col.minX - radius;
      const maxX = col.maxX + radius;
      const minY = col.minY - radius;
      const maxY = col.maxY + radius;
      const minZ = col.minZ - radius;
      const maxZ = col.maxZ + radius;

      const t1 = (minX - origin.x) * invDirX;
      const t2 = (maxX - origin.x) * invDirX;
      const t3 = (minY - origin.y) * invDirY;
      const t4 = (maxY - origin.y) * invDirY;
      const t5 = (minZ - origin.z) * invDirZ;
      const t6 = (maxZ - origin.z) * invDirZ;

      const tmin = Math.max(Math.max(Math.min(t1, t2), Math.min(t3, t4)), Math.min(t5, t6));
      const tmax = Math.min(Math.min(Math.max(t1, t2), Math.max(t3, t4)), Math.max(t5, t6));

      if (tmax < 0 || tmin > tmax) continue;

      const hitDist = tmin >= 0 ? tmin : tmax;
      if (hitDist >= 0 && hitDist < outHit.distance) {
        outHit.hit = true;
        outHit.distance = hitDist;
        outHit.point.copy(origin).addScaledVector(direction, hitDist);
        outHit.collider = col;
      }
    }

    return outHit;
  }

  /**
   * Debug Görselleştirme Durumu
   */
  setDebugEnabled(enabled) {
    this.debugEnabled = !!enabled;
    if (this.debugGroup) {
      this.debugGroup.visible = this.debugEnabled;
      if (this.debugEnabled) {
        this._rebuildDebugMeshes();
      }
    }
  }

  _rebuildDebugMeshes() {
    if (!this.debugGroup) return;

    // Eski debug nesnelerini temizle
    while (this.debugGroup.children.length > 0) {
      const child = this.debugGroup.children.pop();
      if (child.geometry) child.geometry.dispose();
      if (child.material) child.material.dispose();
    }

    // Tüm AABB'ler için tek bir LineSegments (performans ve sıfır GC için)
    const positions = [];
    for (let i = 0; i < this.allColliders.length; i++) {
      const c = this.allColliders[i];
      const { minX, minY, minZ, maxX, maxY, maxZ } = c;

      // 12 AABB kenarı
      // Alt dikdörtgen
      positions.push(minX, minY, minZ, maxX, minY, minZ);
      positions.push(maxX, minY, minZ, maxX, minY, maxZ);
      positions.push(maxX, minY, maxZ, minX, minY, maxZ);
      positions.push(minX, minY, maxZ, minX, minY, minZ);

      // Üst dikdörtgen
      positions.push(minX, maxY, minZ, maxX, maxY, minZ);
      positions.push(maxX, maxY, minZ, maxX, maxY, maxZ);
      positions.push(maxX, maxY, maxZ, minX, maxY, maxZ);
      positions.push(minX, maxY, maxZ, minX, maxY, minZ);

      // Dikey sütunlar
      positions.push(minX, minY, minZ, minX, maxY, minZ);
      positions.push(maxX, minY, minZ, maxX, maxY, minZ);
      positions.push(maxX, minY, maxZ, maxX, maxY, maxZ);
      positions.push(minX, minY, maxZ, minX, maxY, maxZ);
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
    const material = new THREE.LineBasicMaterial({
      color: 0xff3366,
      transparent: true,
      opacity: 0.75,
      depthTest: true
    });

    const lineSegments = new THREE.LineSegments(geometry, material);
    this.debugGroup.add(lineSegments);
  }
}
