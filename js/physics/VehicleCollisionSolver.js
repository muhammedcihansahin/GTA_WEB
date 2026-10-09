import * as THREE from 'three';
import { gameState } from '../gameplay/GameStateManager.js';

/**
 * VehicleCollisionSolver
 * 
 * GTA San Andreas Tarzı Oyuncu - Araç ve Araç - Araç Dinamik Katı Kalkan ve Çarpışma Fiziği Motoru.
 * - 2D OBB (Oriented Bounding Box) Minimum Translation Vector (MTV) Push-Out.
 * - 3-Segment Capsule / Multi-Sphere Araç - Araç Penetrasyon Çözümü.
 * - Elastik / Plastik Momentum & İtme (Impulse) Transferi.
 * - Hızlı Araç Çarpmasında Yayaya Knockback (Geri Savrulma) & Hasar Sistemi.
 * - Sıfır GC (Zero Per-Frame Garbage Collection Allocation).
 */
export class VehicleCollisionSolver {
  constructor() {
    // Zero-GC Yeniden Kullanılabilir Hesaplama Değişkenleri
    this._tmpLocal = new THREE.Vector2();
    this._tmpPushLocal = new THREE.Vector2();
    this._tmpPushWorld = new THREE.Vector3();
    this._tmpFwdA = new THREE.Vector2();
    this._tmpFwdB = new THREE.Vector2();
    this._tmpDiff = new THREE.Vector2();
    this._tmpSpheresA = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    this._tmpSpheresB = [new THREE.Vector2(), new THREE.Vector2(), new THREE.Vector2()];
    this._lastHitTime = 0;
  }

  /**
   * Bir aracın fiziksel gövde ebatlarını ve kütlesini döndürür.
   * @param {Object} veh 
   * @returns {{halfW: number, halfL: number, height: number, mass: number}}
   */
  getVehicleExtents(veh) {
    if (!veh) return { halfW: 1.05, halfL: 2.35, height: 1.60, mass: 1500 };

    if (veh.type === 'fire_truck') {
      return { halfW: 1.28, halfL: 3.35, height: 2.50, mass: 5500 };
    }
    if (veh.type === 'ambulance') {
      return { halfW: 1.18, halfL: 2.55, height: 2.15, mass: 2500 };
    }
    if (veh.isEmergency) {
      return { halfW: 1.08, halfL: 2.45, height: 1.65, mass: 1750 };
    }

    if (veh.handling) {
      const halfW = (veh.handling.trackWidth || 1.65) * 0.58;
      const halfL = (veh.handling.wheelBase || 2.70) * 0.88;
      const mass = veh.handling.mass || 1550;
      return { halfW, halfL, height: 1.60, mass };
    }

    return { halfW: 1.05, halfL: 2.35, height: 1.60, mass: 1450 };
  }

  /**
   * Oyuncu ile araçlar arasındaki katı kalkan (OBB Push-Out) ve çarpma hasarını çözer.
   * @param {THREE.Vector3} playerPos - Oyuncunun dünya konumu
   * @param {number} playerRadius - Oyuncunun çarpışma yarıçapı (~0.45m)
   * @param {boolean} isDriving - Oyuncunun araçta olup olmadığı
   * @param {Array} vehicles - VehicleManager drivable araçları
   * @param {Array} npcs - TrafficManager NPC araçları
   * @param {Array} policePool - PoliceManager polis araçları
   * @param {number} delta - Delta zamanı
   * @param {Object} audioManager - Ses yöneticisi
   * @param {Object} charInstance - Karakter örneği
   */
  resolvePlayerVehicleCollisions(playerPos, playerRadius = 0.45, isDriving = false, vehicles = [], npcs = [], policePool = [], delta = 0.016, audioManager = null, charInstance = null) {
    if (isDriving || !playerPos) return;

    const checkList = [];
    if (vehicles && vehicles.length) {
      for (let i = 0; i < vehicles.length; i++) {
        if (vehicles[i] && vehicles[i].position) checkList.push(vehicles[i]);
      }
    }
    if (npcs && npcs.length) {
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        if (npc && npc.position && npc.active !== false && npc.isSpawned !== false) checkList.push(npc);
      }
    }
    if (policePool && policePool.length) {
      for (let i = 0; i < policePool.length; i++) {
        const pol = policePool[i];
        if (pol && pol.position && pol.active) checkList.push(pol);
      }
    }

    for (let i = 0; i < checkList.length; i++) {
      const veh = checkList[i];
      const vPos = veh.position;

      const dx = playerPos.x - vPos.x;
      const dz = playerPos.z - vPos.z;
      const distSq = dx * dx + dz * dz;

      // Hızlı mekansal eleme (6.5 metre dışındakileri atla)
      if (distSq > 42.25) continue;

      const ext = this.getVehicleExtents(veh);
      const vehY = vPos.y || 0;

      // Y ekseni yükseklik kontrolü (Tavanın üstünde yürüyorsa itme, platform yap)
      if (playerPos.y + 1.8 < vehY || playerPos.y > vehY + ext.height - 0.12) {
        continue;
      }

      // Aracın yönelim açısı (heading)
      const heading = (veh.heading !== undefined) ? veh.heading : (veh.root ? veh.root.rotation.y : 0);

      // Three.js koordinat dönüşüm vektörleri (Forward ve Right)
      const fwdX = -Math.sin(heading);
      const fwdZ = -Math.cos(heading);
      const rightX = Math.cos(heading);
      const rightZ = -Math.sin(heading);

      // Oyuncunun konumu aracın lokal koordinat sistemine izdüşürülür
      const localX = dx * rightX + dz * rightZ;
      const localZ = dx * fwdX + dz * fwdZ;

      const halfW = ext.halfW + playerRadius;
      const halfL = ext.halfL + playerRadius;

      // OBB Penetrasyon Kontrolü
      if (Math.abs(localX) < halfW && Math.abs(localZ) < halfL) {
        const overlapX = halfW - Math.abs(localX);
        const overlapZ = halfL - Math.abs(localZ);

        let pushLocalX = 0;
        let pushLocalZ = 0;

        // En küçük penetrasyon eksenine (Minimum Translation Vector) göre it
        if (overlapX < overlapZ) {
          pushLocalX = Math.sign(localX || 1) * overlapX;
        } else {
          pushLocalZ = Math.sign(localZ || 1) * overlapZ;
        }

        // Lokal itme vektörünü tekrar dünya koordinatlarına dönüştür
        const pushWorldX = pushLocalX * rightX + pushLocalZ * fwdX;
        const pushWorldZ = pushLocalX * rightZ + pushLocalZ * fwdZ;

        playerPos.x += pushWorldX;
        playerPos.z += pushWorldZ;

        // Hareket halindeki araç çarpması (Knockback & Ezilme Hasarı)
        const vehSpeed = Math.abs(veh.speed || (veh.velocity ? veh.velocity.length() : 0));
        if (vehSpeed > 2.0) {
          const moveSign = (veh.speed >= 0) ? 1 : -1;
          const knockMag = Math.min(3.5, vehSpeed * 0.22);
          playerPos.x += fwdX * moveSign * knockMag;
          playerPos.z += fwdZ * moveSign * knockMag;

          // Hasar ve ses (Korumalı cooldown ile saniyede maksimum 1-2 vuruş)
          const now = performance.now();
          if (now - this._lastHitTime > 600) {
            this._lastHitTime = now;
            const damage = Math.min(45, Math.max(6, Math.round(vehSpeed * 2.2)));
            gameState.damagePlayer(damage);

            if (audioManager?.playPunch) {
              audioManager.playPunch();
            } else if (audioManager?.playWhoosh) {
              audioManager.playWhoosh();
            }
          }
        }
      }
    }
  }

  /**
   * Araçlar arasındaki çarpışmaları, penetrasyon ayrılmalarını ve momentum transferini çözer.
   * @param {Array} allVehicles - VehicleManager'daki tüm sürülebilir araçlar
   * @param {Object} activeVehicle - Şu an oyuncunun bindiği aktif araç
   * @param {Array} npcs - TrafficManager'daki otonom NPC araçları
   * @param {Array} policePool - PoliceManager'daki polis devriye araçları
   * @param {number} delta - Delta süresi
   * @param {Function} onCrash - Çarpışma tok ses geri çağrımı
   */
  resolveVehicleVehicleCollisions(allVehicles = [], activeVehicle = null, npcs = [], policePool = [], delta = 0.016, onCrash = null) {
    if (!allVehicles || allVehicles.length === 0) return;

    // Test edilecek birincil aktif araçlar (özellikle oyuncunun sürdüğü araç ve hareket edenler)
    const primaries = [];
    if (activeVehicle) primaries.push(activeVehicle);
    for (let i = 0; i < allVehicles.length; i++) {
      const v = allVehicles[i];
      if (v !== activeVehicle && Math.abs(v.speed || 0) > 0.4) primaries.push(v);
    }
    if (primaries.length === 0 && allVehicles.length > 0) {
      primaries.push(allVehicles[0]);
    }

    // Hedef araç havuzu
    const targets = [];
    for (let i = 0; i < allVehicles.length; i++) targets.push(allVehicles[i]);
    if (npcs && npcs.length) {
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        if (npc && npc.position && npc.active !== false && npc.isSpawned !== false) targets.push(npc);
      }
    }
    if (policePool && policePool.length) {
      for (let i = 0; i < policePool.length; i++) {
        const pol = policePool[i];
        if (pol && pol.position && pol.active) targets.push(pol);
      }
    }

    for (let i = 0; i < primaries.length; i++) {
      const vehA = primaries[i];
      if (!vehA || !vehA.position) continue;

      for (let j = 0; j < targets.length; j++) {
        const vehB = targets[j];
        if (!vehB || vehA === vehB || !vehB.position) continue;

        this._resolvePairCollision(vehA, vehB, delta, onCrash);
      }
    }

    // NPC vs NPC Çarpışma Önleme (Kavşaklarda iç içe geçmeyi engeller)
    if (npcs && npcs.length > 1) {
      for (let i = 0; i < npcs.length; i++) {
        const nA = npcs[i];
        if (!nA || !nA.position || nA.active === false) continue;
        for (let j = i + 1; j < npcs.length; j++) {
          const nB = npcs[j];
          if (!nB || !nB.position || nB.active === false) continue;
          this._resolvePairCollision(nA, nB, delta, null);
        }
      }
    }
  }

  /**
   * İki araç arasındaki 3-kapsül çember çarpışmasını çözer.
   * @private
   */
  _resolvePairCollision(vehA, vehB, delta, onCrash) {
    const posA = vehA.position;
    const posB = vehB.position;

    const dx = posA.x - posB.x;
    const dz = posA.z - posB.z;
    const distSq = dx * dx + dz * dz;

    // 8.5 metre dışındaysa hiçbir hesap yapmadan çık
    if (distSq > 72.25) return false;

    const extA = this.getVehicleExtents(vehA);
    const extB = this.getVehicleExtents(vehB);

    const headA = (vehA.heading !== undefined) ? vehA.heading : (vehA.root ? vehA.root.rotation.y : 0);
    const headB = (vehB.heading !== undefined) ? vehB.heading : (vehB.root ? vehB.root.rotation.y : 0);

    const fwdAX = -Math.sin(headA);
    const fwdAZ = -Math.cos(headA);
    const fwdBX = -Math.sin(headB);
    const fwdBZ = -Math.cos(headB);

    const rA = extA.halfW * 0.95;
    const rB = extB.halfW * 0.95;
    const spanA = extA.halfL * 0.62;
    const spanB = extB.halfL * 0.62;

    // 3 Çember: Ön Tampon, Merkez, Arka Tampon
    this._tmpSpheresA[0].set(posA.x + fwdAX * spanA, posA.z + fwdAZ * spanA);
    this._tmpSpheresA[1].set(posA.x, posA.z);
    this._tmpSpheresA[2].set(posA.x - fwdAX * spanA, posA.z - fwdAZ * spanA);

    this._tmpSpheresB[0].set(posB.x + fwdBX * spanB, posB.z + fwdBZ * spanB);
    this._tmpSpheresB[1].set(posB.x, posB.z);
    this._tmpSpheresB[2].set(posB.x - fwdBX * spanB, posB.z - fwdBZ * spanB);

    let maxOverlap = 0;
    let normalX = 0;
    let normalZ = 0;

    const rSum = rA + rB;
    const rSumSq = rSum * rSum;

    for (let i = 0; i < 3; i++) {
      const sa = this._tmpSpheresA[i];
      for (let j = 0; j < 3; j++) {
        const sb = this._tmpSpheresB[j];
        const cdx = sa.x - sb.x;
        const cdz = sa.y - sb.y;
        const cDistSq = cdx * cdx + cdz * cdz;

        if (cDistSq < rSumSq) {
          const cDist = Math.sqrt(cDistSq) || 0.001;
          const overlap = rSum - cDist;
          if (overlap > maxOverlap) {
            maxOverlap = overlap;
            normalX = cdx / cDist;
            normalZ = cdz / cDist;
          }
        }
      }
    }

    if (maxOverlap <= 0.001) return false;

    // Kütle oranlarına göre penetrasyon ayırma (Separation)
    const mA = extA.mass;
    const mB = extB.mass;
    const totM = mA + mB;
    const wA = mB / totM;
    const wB = mA / totM;

    // A Aracını normal yönünde it
    posA.x += normalX * maxOverlap * wA;
    posA.z += normalZ * maxOverlap * wA;
    if (vehA.root) {
      vehA.root.position.x = posA.x;
      vehA.root.position.z = posA.z;
    }

    // B Aracını ters normal yönünde it
    if (vehB.collisionOffset) {
      vehB.collisionOffset.x -= normalX * maxOverlap * wB;
      vehB.collisionOffset.z -= normalZ * maxOverlap * wB;
    } else {
      posB.x -= normalX * maxOverlap * wB;
      posB.z -= normalZ * maxOverlap * wB;
      if (vehB.root) {
        vehB.root.position.x = posB.x;
        vehB.root.position.z = posB.z;
      }
    }

    // Hız & Momentum İtme (Impulse) Çözümü
    const vAx = vehA.velocity ? vehA.velocity.x : (fwdAX * (vehA.speed || 0));
    const vAz = vehA.velocity ? vehA.velocity.z : (fwdAZ * (vehA.speed || 0));
    const vBx = vehB.velocity ? vehB.velocity.x : (fwdBX * (vehB.speed || 0));
    const vBz = vehB.velocity ? vehB.velocity.z : (fwdBZ * (vehB.speed || 0));

    const relVx = vAx - vBx;
    const relVz = vAz - vBz;
    const vRelNorm = relVx * normalX + relVz * normalZ;

    // Eğer birbirlerine doğru yaklaşıyorlarsa impuls uygula
    if (vRelNorm < 0) {
      const restitution = 0.24;
      const reducedMass = (mA * mB) / totM;
      const impulseMag = -(1.0 + restitution) * vRelNorm * reducedMass;

      if (vehA.velocity) {
        vehA.velocity.x += (impulseMag / mA) * normalX;
        vehA.velocity.z += (impulseMag / mA) * normalZ;
        if (typeof vehA.syncSpeedFromVelocity === 'function') vehA.syncSpeedFromVelocity();
      } else if (vehA.speed !== undefined) {
        vehA.speed *= 0.65;
      }

      if (vehB.velocity) {
        vehB.velocity.x -= (impulseMag / mB) * normalX;
        vehB.velocity.z -= (impulseMag / mB) * normalZ;
        if (typeof vehB.syncSpeedFromVelocity === 'function') vehB.syncSpeedFromVelocity();
      } else if (vehB.speed !== undefined) {
        vehB.speed = Math.max(-2.0, vehB.speed - Math.abs(vRelNorm) * 0.45);
      }

      // Süspansiyon sarsıntı tepkisi (Pitch / Roll Shudder)
      const impactSpeed = Math.abs(vRelNorm);
      if (vehA.pitchRate !== undefined) {
        vehA.pitchRate += (Math.random() - 0.5) * 0.22 * Math.min(2.5, impactSpeed);
        vehA.rollRate += (Math.random() - 0.5) * 0.28 * Math.min(2.5, impactSpeed);
      }
      if (vehB.pitchRate !== undefined) {
        vehB.pitchRate += (Math.random() - 0.5) * 0.22 * Math.min(2.5, impactSpeed);
        vehB.rollRate += (Math.random() - 0.5) * 0.28 * Math.min(2.5, impactSpeed);
      }

      // Metal ezilme & tampon çarpışma ses efekti
      if (impactSpeed > 1.2 && typeof onCrash === 'function') {
        onCrash(impactSpeed);
      }
    }

    return true;
  }
}
