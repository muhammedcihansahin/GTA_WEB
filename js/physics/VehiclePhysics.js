/**
 * @file VehiclePhysics.js
 * @description RaycastVehicle physics controller for Three.js using cannon-es.
 * 
 * Features:
 * 1. Chassis RigidBody with realistic mass, center-of-mass (CoM) lowering, and linear/angular damping.
 * 2. 4 independent RaycastWheel objects with configurable spring stiffness, damping, compression, and travel limit.
 * 3. Realistic tire physics: frictionSlip (traction/drift control) and rollInfluence (anti-rollover stabilization).
 * 4. Flexible drivetrain: RWD, FWD, and AWD engine force distribution, 4-wheel braking & handbrake support, Ackermann-friendly steering.
 * 5. Zero-GC render-loop synchronization between Cannon-es physics and Three.js visual GLTF meshes.
 * 6. Seamless direct integration with VehicleLoader output ({ chassis, wheels, metrics }).
 */

import * as THREE from 'three';
import * as CANNON from 'cannon-es';

export class VehiclePhysics {
  /**
   * @param {Object} [options={}]
   * @param {CANNON.World} [options.world] - Cannon-es fizik dünyası referansı.
   * @param {THREE.Object3D} [options.chassisMesh] - Görsel gövde grubu/modeli.
   * @param {Object|Array<THREE.Object3D>} [options.wheelMeshes] - { fl, fr, rl, rr } veya [fl, fr, rl, rr] tekerlek pivotları.
   * @param {Object} [options.vehicleData] - VehicleLoader.extractVehicleHierarchy() çıktısı ({ chassis, wheels, metrics }).
   * @param {number} [options.mass=1500] - Araç kütlesi (kg).
   * @param {THREE.Vector3|Object} [options.dimensions] - Şasi boyutları { width: 1.8, height: 0.8, depth: 4.2 }.
   * @param {CANNON.Vec3|THREE.Vector3} [options.centerOfMassOffset] - Ağırlık merkezi ofseti (Varsayılan Y: -0.25).
   * @param {number} [options.linearDamping=0.15] - Lineer hava/yuvarlanma direnci.
   * @param {number} [options.angularDamping=0.55] - Savrulma ve takla sönümlemesi.
   * @param {Object} [options.suspension] - Süspansiyon ayarları.
   * @param {Object} [options.wheelOptions] - Tekerlek ve yol tutuş parametreleri.
   */
  constructor(options = {}) {
    // 1. Fizik Dünyası (Verilmemişse yerel bir dünya oluştur)
    this.world = options.world || new CANNON.World({
      gravity: new CANNON.Vec3(0, -9.82, 0)
    });
    this.ownsWorld = !options.world;

    // 2. Görsel Bileşenler & Metrikler
    let chassisMesh = options.chassisMesh || null;
    let wheelMeshes = options.wheelMeshes || null;
    let metrics = options.metrics || null;

    if (options.vehicleData) {
      chassisMesh = options.vehicleData.chassis || chassisMesh;
      wheelMeshes = options.vehicleData.wheels || wheelMeshes;
      metrics = options.vehicleData.metrics || metrics;
    }

    this.chassisMesh = chassisMesh;
    this.wheelMeshes = this._normalizeWheelMeshes(wheelMeshes);

    // 3. Şasi ve Boyut Parametreleri
    this.mass = options.mass !== undefined ? options.mass : 1500;
    this.linearDamping = options.linearDamping !== undefined ? options.linearDamping : 0.15;
    this.angularDamping = options.angularDamping !== undefined ? options.angularDamping : 0.55;

    const dims = options.dimensions || (metrics ? {
      width: (metrics.trackWidth || 1.6) + 0.2,
      height: 0.8,
      depth: (metrics.wheelBase || 2.6) + 1.2
    } : { width: 1.8, height: 0.8, depth: 4.2 });

    this.dimensions = {
      width: dims.width || dims.x || 1.8,
      height: dims.height || dims.y || 0.8,
      depth: dims.depth || dims.z || 4.2
    };

    // Ağırlık merkezi (Center of Mass): Fizik kutusu gövde merkezinden yukarı ötelenerek
    // gövdenin kütle merkezi yere yaklaştırılır (devrilme önlenir).
    const comY = options.centerOfMassOffset ? (options.centerOfMassOffset.y || 0) : -0.22;
    this.centerOfMassOffset = new CANNON.Vec3(0, comY, 0);

    // 4. Süspansiyon & Tekerlek Ayarları (Zemine batmayı ve sonsuz zıplamayı önleyici ayarlar)
    this.suspensionConfig = {
      stiffness: 35.0,              // Süspansiyon yay sertliği
      damping: 2.8,                 // Gevşeme sönümlemesi (dampingRelaxation) - sonsuz zıplamayı keser
      compression: 4.5,             // Sıkışma sönümlemesi (dampingCompression) - sert çukurlarda dibe vurmayı önler
      restLength: 0.35,             // Yayın dinlenme uzunluğu (metre)
      maxTravel: 0.28,              // İzin verilen maksimum hareket payı
      maxForce: 100000,             // Maksimum yay taşıma gücü (N)
      ...(options.suspension || {})
    };

    const avgWheelRadius = (metrics && metrics.wheelRadius) ? metrics.wheelRadius : 0.34;
    this.wheelConfig = {
      radius: avgWheelRadius,
      frictionSlip: 3.8,            // Tekerlek sürtünme katsayısı (buz gibi kaymayı önler)
      rollInfluence: 0.08,          // Virajda savrulma/yana yatma katsayısı (0.05-0.1 devrilmeyi engeller)
      customSlidingRotationalSpeed: -30,
      useCustomSlidingRotationalSpeed: true,
      ...(options.wheelOptions || {})
    };

    // Tekerlek Ofsetleri (FL, FR, RL, RR)
    this.wheelOffsets = this._computeWheelOffsets(metrics, this.dimensions);

    // 5. Şasi RigidBody Oluştur
    this._createChassisBody();

    // 6. RaycastVehicle Oluştur & Tekerlekleri Ekle
    this._createRaycastVehicle();

    // 7. Sıfır-GC Matematik ve Senkronizasyon Nesneleri
    this._vSyncPos = new THREE.Vector3();
    this._vSyncQuat = new THREE.Quaternion();
    this._tmpForward = new CANNON.Vec3();
  }

  /**
   * Tekerlek referanslarını standart dizi [FL, FR, RL, RR] formatına dönüştürür
   */
  _normalizeWheelMeshes(wheels) {
    if (!wheels) return [null, null, null, null];
    if (Array.isArray(wheels)) return wheels;
    return [
      wheels.fl || wheels.FL || null,
      wheels.fr || wheels.FR || null,
      wheels.rl || wheels.RL || null,
      wheels.rr || wheels.RR || null
    ];
  }

  /**
   * 4 Tekerlek için şasiye göre yerel bağlantı noktalarını hesaplar
   */
  _computeWheelOffsets(metrics, dimensions) {
    if (metrics && metrics.offsets) {
      return {
        fl: new CANNON.Vec3(metrics.offsets.fl.x, metrics.offsets.fl.y || 0, metrics.offsets.fl.z),
        fr: new CANNON.Vec3(metrics.offsets.fr.x, metrics.offsets.fr.y || 0, metrics.offsets.fr.z),
        rl: new CANNON.Vec3(metrics.offsets.rl.x, metrics.offsets.rl.y || 0, metrics.offsets.rl.z),
        rr: new CANNON.Vec3(metrics.offsets.rr.x, metrics.offsets.rr.y || 0, metrics.offsets.rr.z)
      };
    }

    const halfW = dimensions.width * 0.45;
    const halfD = dimensions.depth * 0.35;
    const attachY = 0.0; // Şasi bağlantı yüksekliği

    return {
      fl: new CANNON.Vec3(-halfW, attachY, -halfD),
      fr: new CANNON.Vec3(halfW, attachY, -halfD),
      rl: new CANNON.Vec3(-halfW, attachY, halfD),
      rr: new CANNON.Vec3(halfW, attachY, halfD)
    };
  }

  /**
   * Şasi rijit gövdesini (RigidBody) oluşturur ve dünyaya ekler
   */
  _createChassisBody() {
    this.chassisBody = new CANNON.Body({
      mass: this.mass,
      linearDamping: this.linearDamping,
      angularDamping: this.angularDamping
    });

    // Şasi Çarpışma Şekli (Kutu)
    const halfExtents = new CANNON.Vec3(
      this.dimensions.width * 0.5,
      this.dimensions.height * 0.5,
      this.dimensions.depth * 0.5
    );
    const chassisShape = new CANNON.Box(halfExtents);

    // Kütle merkezini aşağı çekmek için şekli gövde orijininden yukarı öteleriz
    const shapeOffset = new CANNON.Vec3(0, -this.centerOfMassOffset.y, 0);
    this.chassisBody.addShape(chassisShape, shapeOffset);

    // Varsayılan güvenli başlangıç pozisyonu
    this.chassisBody.position.set(0, 1.0, 0);
    this.chassisBody.quaternion.set(0, 0, 0, 1);

    this.world.addBody(this.chassisBody);
  }

  /**
   * RaycastVehicle nesnesini ve 4 WheelInfo profilini oluşturur
   */
  _createRaycastVehicle() {
    this.vehicle = new CANNON.RaycastVehicle({
      chassisBody: this.chassisBody,
      indexRightAxis: 0,   // X ekseni
      indexUpAxis: 1,      // Y ekseni (Yukarı)
      indexForwardAxis: 2  // Z ekseni
    });

    // Tekerlek şablonu (Süspansiyon & Sürtünme)
    const wheelOptions = {
      radius: this.wheelConfig.radius,
      directionLocal: new CANNON.Vec3(0, -1, 0), // Aşağı doğru ışın atar
      axleLocal: new CANNON.Vec3(-1, 0, 0),      // Tekerlek dönme ekseni
      suspensionStiffness: this.suspensionConfig.stiffness,
      suspensionRestLength: this.suspensionConfig.restLength,
      maxSuspensionForce: this.suspensionConfig.maxForce,
      maxSuspensionTravel: this.suspensionConfig.maxTravel,
      dampingCompression: this.suspensionConfig.compression,
      dampingRelaxation: this.suspensionConfig.damping,
      frictionSlip: this.wheelConfig.frictionSlip,
      rollInfluence: this.wheelConfig.rollInfluence,
      customSlidingRotationalSpeed: this.wheelConfig.customSlidingRotationalSpeed,
      useCustomSlidingRotationalSpeed: this.wheelConfig.useCustomSlidingRotationalSpeed
    };

    // 4 Tekerleğin sırayla eklenmesi:
    // 0: FL (Ön Sol), 1: FR (Ön Sağ), 2: RL (Arka Sol), 3: RR (Arka Sağ)
    const positions = [
      this.wheelOffsets.fl,
      this.wheelOffsets.fr,
      this.wheelOffsets.rl,
      this.wheelOffsets.rr
    ];

    for (let i = 0; i < 4; i++) {
      this.vehicle.addWheel({
        ...wheelOptions,
        chassisConnectionPointLocal: positions[i],
        isFrontWheel: i < 2
      });
    }

    this.vehicle.addToWorld(this.world);
  }

  /* =========================================================================
   * SÜRÜŞ KONTROLLERİ (Engine Force, Steering, Braking)
   * ========================================================================= */

  /**
   * Araca motor gücü / tork uygular.
   * @param {number} force - Motor kuvveti (İleri pozitif, Geri negatif).
   * @param {'RWD'|'FWD'|'AWD'} [driveType='RWD'] - Çekiş sistemi.
   */
  applyEngineForce(force, driveType = 'RWD') {
    switch (driveType.toUpperCase()) {
      case 'FWD': // Önden Çekiş
        this.vehicle.applyEngineForce(force * 0.5, 0);
        this.vehicle.applyEngineForce(force * 0.5, 1);
        this.vehicle.applyEngineForce(0, 2);
        this.vehicle.applyEngineForce(0, 3);
        break;
      case 'AWD': // 4 Çeker
        const quarterForce = force * 0.25;
        this.vehicle.applyEngineForce(quarterForce, 0);
        this.vehicle.applyEngineForce(quarterForce, 1);
        this.vehicle.applyEngineForce(quarterForce, 2);
        this.vehicle.applyEngineForce(quarterForce, 3);
        break;
      case 'RWD': // Arkadan İtiş (Klasik Spor / GTA tarzı)
      default:
        this.vehicle.applyEngineForce(0, 0);
        this.vehicle.applyEngineForce(0, 1);
        this.vehicle.applyEngineForce(force * 0.5, 2);
        this.vehicle.applyEngineForce(force * 0.5, 3);
        break;
    }
  }

  /**
   * Ön tekerleklere direksiyon açısı verir.
   * @param {number} angleRad - Radyan cinsinden direksiyon açısı (Sola pozitif, Sağa negatif veya tersi).
   */
  setSteering(angleRad) {
    this.vehicle.setSteeringValue(angleRad, 0); // FL
    this.vehicle.setSteeringValue(angleRad, 1); // FR
  }

  /**
   * Tekerleklere fren kuvveti uygular.
   * @param {number} brakeForce - Fren kuvveti (Newton).
   * @param {'ALL'|'HANDBRAKE'|'FRONT'} [target='ALL'] - Fren uygulama modu.
   */
  setBrake(brakeForce, target = 'ALL') {
    if (target === 'HANDBRAKE') {
      // El freni: Yalnızca arka tekerlekleri kilitler (Drift başlatıcı)
      this.vehicle.setBrake(0, 0);
      this.vehicle.setBrake(0, 1);
      this.vehicle.setBrake(brakeForce, 2);
      this.vehicle.setBrake(brakeForce, 3);
    } else if (target === 'FRONT') {
      this.vehicle.setBrake(brakeForce, 0);
      this.vehicle.setBrake(brakeForce, 1);
      this.vehicle.setBrake(0, 2);
      this.vehicle.setBrake(0, 3);
    } else {
      // Normal servis freni: 4 tekerleğe dengeli fren
      const frontBrake = brakeForce * 0.6;
      const rearBrake = brakeForce * 0.4;
      this.vehicle.setBrake(frontBrake, 0);
      this.vehicle.setBrake(frontBrake, 1);
      this.vehicle.setBrake(rearBrake, 2);
      this.vehicle.setBrake(rearBrake, 3);
    }
  }

  /* =========================================================================
   * GÜNCELLEME & GÖRSEL SENKRONİZASYON (Zero-Jitter Render Loop Sync)
   * ========================================================================= */

  /**
   * Fizik simülasyonunu adımlar ve görsel Three.js modellerini fizik gövdeleriyle senkronize eder.
   * @param {number} deltaTime - Kare süresi (saniye).
   * @param {boolean} [stepPhysicsWorld=true] - Fizik dünyasını adım ayarı (Dışarıdan yönetilmiyorsa true).
   */
  update(deltaTime, stepPhysicsWorld = true) {
    // 1. Fizik Dünyasını Sabit Zaman Aralığı ile Adımla (Titreşimi / Jitter'ı önler)
    if (stepPhysicsWorld && this.world) {
      const dt = Math.min(deltaTime, 0.1);
      this.world.step(1 / 60, dt, 5);
    }

    // 2. Şasi Görsel Modeli Eşitlemesi
    if (this.chassisMesh) {
      // Fizik gövdesi kütle merkezi ofsetini görsel modele titreşimsiz yansıt
      this.chassisMesh.position.set(
        this.chassisBody.position.x,
        this.chassisBody.position.y + this.centerOfMassOffset.y,
        this.chassisBody.position.z
      );
      this.chassisMesh.quaternion.set(
        this.chassisBody.quaternion.x,
        this.chassisBody.quaternion.y,
        this.chassisBody.quaternion.z,
        this.chassisBody.quaternion.w
      );
    }

    // 3. 4 Tekerlek Görsel Pivotları Eşitlemesi
    const wheelCount = this.vehicle.wheelInfos.length;
    for (let i = 0; i < wheelCount; i++) {
      this.vehicle.updateWheelTransform(i);
      const transform = this.vehicle.wheelInfos[i].worldTransform;
      const wheelMesh = this.wheelMeshes[i];

      if (wheelMesh) {
        if (wheelMesh.parent && wheelMesh.parent.isObject3D && wheelMesh.parent.type !== 'Scene') {
          // Eğer wheelMesh şasinin veya başka bir grubun altındaysa yerel koordinata çevir (Çift rotasyonu önler)
          this._vSyncPos.set(transform.position.x, transform.position.y, transform.position.z);
          this._vSyncQuat.set(transform.quaternion.x, transform.quaternion.y, transform.quaternion.z, transform.quaternion.w);

          wheelMesh.parent.worldToLocal(this._vSyncPos);
          wheelMesh.position.copy(this._vSyncPos);

          const parentWorldQuat = new THREE.Quaternion();
          wheelMesh.parent.getWorldQuaternion(parentWorldQuat);
          wheelMesh.quaternion.copy(parentWorldQuat.invert().multiply(this._vSyncQuat));
        } else {
          wheelMesh.position.set(
            transform.position.x,
            transform.position.y,
            transform.position.z
          );
          wheelMesh.quaternion.set(
            transform.quaternion.x,
            transform.quaternion.y,
            transform.quaternion.z,
            transform.quaternion.w
          );
        }
      }
    }
  }

  /* =========================================================================
   * YARDIMCI VE DURUM SORGULAMA METODLARI
   * ========================================================================= */

  /**
   * Aracın km/saat cinsinden hızını döner.
   * @returns {number}
   */
  getSpeedKmh() {
    return this.chassisBody.velocity.length() * 3.6;
  }

  /**
   * Aracın m/s cinsinden hızını döner.
   * @returns {number}
   */
  getSpeedMps() {
    return this.chassisBody.velocity.length();
  }

  /**
   * En az bir tekerleğin zemine basıp basmadığını kontrol eder.
   * @returns {boolean}
   */
  isGrounded() {
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      if (this.vehicle.wheelInfos[i].raycastResult.hasHit) {
        return true;
      }
    }
    return false;
  }

  /**
   * 4 Tekerleğin ayrı ayrı zemin temas durumlarını döner.
   * @returns {boolean[]} [fl, fr, rl, rr]
   */
  getWheelContacts() {
    return this.vehicle.wheelInfos.map((w) => !!w.raycastResult.hasHit);
  }

  /**
   * Aracı belirtilen pozisyon ve rotasyona sıfırlar (hızları temizler).
   * @param {THREE.Vector3|CANNON.Vec3} position 
   * @param {THREE.Quaternion|CANNON.Quaternion} [quaternion] 
   */
  reset(position, quaternion = null) {
    this.chassisBody.position.set(position.x, position.y, position.z);
    this.chassisBody.velocity.set(0, 0, 0);
    this.chassisBody.angularVelocity.set(0, 0, 0);

    if (quaternion) {
      this.chassisBody.quaternion.set(quaternion.x, quaternion.y, quaternion.z, quaternion.w);
    } else {
      this.chassisBody.quaternion.set(0, 0, 0, 1);
    }

    // Tekerlek dönüşlerini ve süspansiyon hafızasını sıfırla
    for (let i = 0; i < this.vehicle.wheelInfos.length; i++) {
      this.vehicle.wheelInfos[i].rotation = 0;
      this.vehicle.wheelInfos[i].deltaRotation = 0;
      this.vehicle.setBrake(0, i);
      this.vehicle.applyEngineForce(0, i);
    }

    // Görselleri anında hizala
    this.update(0, false);
  }

  /**
   * Bellek ve fizik dünyası temizliği
   */
  dispose() {
    if (this.vehicle) {
      this.vehicle.removeFromWorld(this.world);
    }
    if (this.chassisBody) {
      this.world.removeBody(this.chassisBody);
    }
    this.chassisMesh = null;
    this.wheelMeshes = [null, null, null, null];
  }
}
