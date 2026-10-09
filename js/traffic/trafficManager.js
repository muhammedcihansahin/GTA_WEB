import * as THREE from 'three';

/**
 * NPC Araç Renk Paleti (Klasik GTA San Andreas Araç Boyaları)
 */
const NPC_COLORS = [
  0x1f382b, // Grove Green
  0x8a1c14, // Candy Red
  0x1c2b3c, // Midnight Blue
  0x2b2b2b, // Shadow Black
  0xc0c5c8, // Silver Metallic
  0xd97724, // San Fierro Sun Orange
  0x4a235a, // Deep Purple
  0x7d6608, // Gold Dust
  0x5d6d7e, // Steel Grey
  0xf4f6f7  // Classic White
];

/**
 * ProceduralCarBuilder - Harici asset gerektirmeyen, hafif ve şık GTA tarzı sedan üretici
 */
class ProceduralCarBuilder {
  static createCar(colorHex) {
    const carGroup = new THREE.Group();
    carGroup.name = 'ProceduralNpcCar';

    // 1. Gövde (Alt Şasi)
    const bodyGeo = new THREE.BoxGeometry(1.85, 0.60, 4.2);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: colorHex,
      roughness: 0.35,
      metalness: 0.5
    });
    const bodyMesh = new THREE.Mesh(bodyGeo, bodyMat);
    bodyMesh.position.y = 0.55;
    bodyMesh.castShadow = true;
    bodyMesh.receiveShadow = true;
    carGroup.add(bodyMesh);

    // 2. Kabin ve Karartılmış Camlar
    const cabinGeo = new THREE.BoxGeometry(1.55, 0.52, 2.1);
    const cabinMat = new THREE.MeshStandardMaterial({
      color: 0x11161b,
      roughness: 0.15,
      metalness: 0.85
    });
    const cabinMesh = new THREE.Mesh(cabinGeo, cabinMat);
    cabinMesh.position.set(0, 1.05, -0.2);
    cabinMesh.castShadow = true;
    carGroup.add(cabinMesh);

    // 3. Farlar (Ön sıcak sarı/beyaz, Arka kırmızı)
    const lightMatFront = new THREE.MeshBasicMaterial({ color: 0xfff3cc });
    const lightMatRear = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const lightGeo = new THREE.BoxGeometry(0.32, 0.14, 0.05);

    const flLight = new THREE.Mesh(lightGeo, lightMatFront);
    flLight.position.set(-0.65, 0.60, 2.11);
    const frLight = new THREE.Mesh(lightGeo, lightMatFront);
    frLight.position.set(0.65, 0.60, 2.11);

    const rlLight = new THREE.Mesh(lightGeo, lightMatRear);
    rlLight.position.set(-0.65, 0.62, -2.11);
    const rrLight = new THREE.Mesh(lightGeo, lightMatRear);
    rrLight.position.set(0.65, 0.62, -2.11);

    carGroup.add(flLight, frLight, rlLight, rrLight);

    // 4. Tekerlekler (4 adet silindir, ön tekerlekler steerHub + rollHub, arka tekerlekler rollHub)
    const wheelGeo = new THREE.CylinderGeometry(0.34, 0.34, 0.26, 12);
    wheelGeo.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 });

    const wheelConfigs = [
      { pos: [-0.92, 0.34, 1.25], isFront: true },  // Ön Sol
      { pos: [0.92, 0.34, 1.25], isFront: true },   // Ön Sağ
      { pos: [-0.92, 0.34, -1.25], isFront: false }, // Arka Sol
      { pos: [0.92, 0.34, -1.25], isFront: false }  // Arka Sağ
    ];

    const steerNodes = [];
    const rollNodes = [];
    wheelConfigs.forEach(({ pos, isFront }) => {
      const wheelMesh = new THREE.Mesh(wheelGeo, wheelMat);
      wheelMesh.castShadow = true;

      const rollHub = new THREE.Group();
      rollHub.name = isFront ? 'ProceduralFrontRollHub' : 'ProceduralRearRollHub';
      rollHub.add(wheelMesh);
      rollNodes.push(rollHub);

      if (isFront) {
        const steerHub = new THREE.Group();
        steerHub.name = 'ProceduralFrontSteerHub';
        steerHub.position.set(pos[0], pos[1], pos[2]);
        steerHub.add(rollHub);
        carGroup.add(steerHub);
        steerNodes.push(steerHub);
      } else {
        rollHub.position.set(pos[0], pos[1], pos[2]);
        carGroup.add(rollHub);
      }
    });

    return { rootVisual: carGroup, rollNodes, steerNodes, wheelNodes: rollNodes };
  }
}

/**
 * NpcVehicle - Tek bir otonom kinematik trafik aracı
 */
export class NpcVehicle {
  constructor(id, colorHex, terrainManager, templateScene = null, modelOptions = {}) {
    this.id = id;
    this.terrain = terrainManager;
    this.colorHex = colorHex;

    this.root = new THREE.Group();
    this.root.name = `NPC_Vehicle_${id}`;

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.pitch = 0;
    this.roll = 0;
    this.speed = 0;
    this.targetSpeed = 10.0; // ~36 km/h
    this.accel = 4.8; // Kademeli yumuşak ivmelenme
    this.brakeForce = 12.5; // Yumuşak kademeli frenleme

    // Yol ağı seyir durumu
    this.currentEdge = null;
    this.targetNode = null;
    this.distanceOnEdge = 0;
    this.laneOffset = 1.75; // Sağ şerit merkez ofseti (metre)

    // Kavşak, Trafik Işığı ve Deadlock Durum Değişkenleri
    this.stoppedTimer = 0; // Hareketsizlik süresi (saniye)
    this.deadlockTimer = 0; // Deadlock kurtarma süresi
    this.isWaitingLight = false; // Kırmızı/sarı ışıkta bekleme durumu
    this.isWaitingIntersection = false; // Kavşak token/rezervasyon bekleme durumu
    this.isCreeping = false; // Deadlock aşma yavaş sürünme durumu (Creep)
    this.currentIntersection = null; // Rezerve edilen ortak IntersectionBlock
    this.reservedNode = null; // Rezerve edilen RoadNode

    // Anti-Clipping ve Gecikmeli Kavşak Tahliyesi (ADIM 6)
    this._clearingIntersection = null; // Kavşaktan çıkarken tahliye edilen IntersectionBlock
    this._clearingNode = null; // Kavşaktan çıkarken tahliye edilen RoadNode
    this._clearedDistOnNewEdge = 0; // Yeni kenarda kat edilen emniyetli tahliye mesafesi

    // Tekerlek referansları & Direksiyon
    this.wheelNodes = []; // Geriye dönük uyumluluk
    this.rollNodes = [];  // 4 tekerlek yuvarlanma düğümü (X rotasyonu)
    this.steerNodes = []; // 2 ön tekerlek direksiyon düğümü (Y rotasyonu)
    this.wheelRoll = 0;
    this.steerAngle = 0;
    this.wheelRadius = 0.34;
    this.visualGroup = null;

    // ADIM 3: Model & Şablon Kimliği (Carjacking Model Sadakati)
    this.templateScene = null;
    this.modelOptions = {};
    this.vehicleType = 'sedan';
    this.vehicleName = 'Traffic Car';

    // GC dostu geçici vektörler
    this._forward = new THREE.Vector3();
    this._sampledPos = new THREE.Vector3();
    this._sampledTangent = new THREE.Vector3();
    this._tempVec = new THREE.Vector3();
    this._transitionOffset = new THREE.Vector3(); // ADIM 8: Kavşak ve viraj şerit geçiş ofseti (Teleport snapping önleyici)
    this.collisionOffset = new THREE.Vector3(); // ADIM 2: Araç-Araç Çarpışma ve İtme Ofseti

    // Görsel modeli oluştur
    if (templateScene) {
      this.applyTemplateScene(templateScene, modelOptions);
    } else {
      this._initVisual();
    }
  }

  _initVisual() {
    if (this.visualGroup) {
      this.root.remove(this.visualGroup);
    }
    // ADIM 1: Eğer TrafficManager'da hazır GLB şablonu varsa doğrudan GLB modeli kullan
    const mgr = window.trafficManager;
    if (mgr?.templatePool && mgr.templatePool.length > 0) {
      const item = mgr.templatePool[Math.floor(Math.random() * mgr.templatePool.length)];
      if (item && item.scene) {
        const opts = Object.assign({}, item.options || {}, {
          vehicleType: item.type || 'sedan',
          vehicleName: item.name || 'Traffic Car'
        });
        this.applyTemplateScene(item.scene, opts);
        return;
      }
    }
    const built = ProceduralCarBuilder.createCar(this.colorHex);
    this.visualGroup = built.rootVisual;
    this.rollNodes = built.rollNodes;
    this.steerNodes = built.steerNodes;
    this.wheelNodes = built.wheelNodes;
    this.root.add(this.visualGroup);
  }

  /**
   * GLB Şablon Sahnesini Dinamik BoundingBox Zemin Normalizasyonu ile Uygular
   * @param {THREE.Object3D} templateScene
   * @param {Object} [modelOptions={}]
   */
  applyTemplateScene(templateScene, modelOptions = {}) {
    if (!templateScene) return;

    // ADIM 3: Şablon ve model meta verilerini sakla (Carjacking esnasında aracın Nissan'a dönüşmesini önler)
    this.templateScene = templateScene;
    this.modelOptions = modelOptions;
    this.vehicleType = modelOptions.vehicleType || modelOptions.type || this.vehicleType || 'sedan';
    this.vehicleName = modelOptions.vehicleName || modelOptions.name || this.vehicleName || 'Traffic Car';

    if (this.visualGroup) {
      this.root.remove(this.visualGroup);
      this.visualGroup = null;
      this.wheelNodes = [];
      this.rollNodes = [];
      this.steerNodes = [];
    }

    const scale = modelOptions.scale !== undefined ? modelOptions.scale : 1.0;
    const cloned = templateScene.clone(true);

    // Paylaşımlı Materyal Optimizasyonu (ADIM 5):
    // Cam, jant, lastik, far ve iç mekan materyalleri şablon üzerinden paylaşılır (sıfır shader/draw call israfı).
    // Yalnızca araç dış kaporta rengi (body paint) için materyal izole klonlanır.
    const isBodyPaint = (matName, meshName) => {
      const str = `${matName || ''} ${meshName || ''}`.toLowerCase();
      const isPaint = str.includes('paint') || str.includes('body') || (str.includes('car') && !str.includes('carpet'));
      const isExcluded = str.includes('window') || str.includes('glass') || str.includes('tire') || str.includes('wheel') || str.includes('seat') || str.includes('interior') || str.includes('caliper');
      return isPaint && !isExcluded;
    };

    // Tekerlek Düğümleri Tespiti (Roll ve Steer) ve Seçici Materyal Yönetimi
    this.rollNodes = [];
    this.steerNodes = [];
    const wheelRegex = /(wheel|tire|tyre|rotor|jant|lastik)/i;

    cloned.traverse(child => {
      if (child.isMesh) {
        child.castShadow = true;
        child.receiveShadow = true;

        // Tekerlek nodeları
        if (wheelRegex.test(child.name)) {
          this.rollNodes.push(child);
          const nameLower = child.name.toLowerCase();
          if (nameLower.includes('fl') || nameLower.includes('fr') || nameLower.includes('front') || nameLower.includes('lf') || nameLower.includes('rf') || nameLower.includes('ön')) {
            this.steerNodes.push(child);
          }
        }

        // Materyal optimizasyonu
        if (child.material) {
          if (Array.isArray(child.material)) {
            child.material = child.material.map(m => {
              if (!m) return m;
              const nameStr = `${m.name || ''} ${child.name || ''}`.toLowerCase();
              if (isBodyPaint(m.name, child.name)) {
                const paintMat = m.clone();
                paintMat.color = new THREE.Color(this.colorHex);
                paintMat.metalness = 0.6;
                paintMat.roughness = 0.35;
                return paintMat;
              }
              // Paylaşımlı cam / lastik özellikleri
              if (nameStr.includes('window') || nameStr.includes('glass')) {
                m.transparent = true;
                m.opacity = 0.65;
                m.depthWrite = false;
                if (m.color) m.color.setHex(0x1a2530);
                m.roughness = 0.08;
                m.metalness = 0.2;
              } else if (nameStr.includes('tire') || nameStr.includes('rubber') || nameStr.includes('wheel')) {
                if (m.color) m.color.setHex(0x222222);
                m.roughness = 0.9;
                m.metalness = 0.05;
              }
              return m;
            });
          } else {
            const m = child.material;
            const nameStr = `${m.name || ''} ${child.name || ''}`.toLowerCase();
            if (isBodyPaint(m.name, child.name)) {
              const paintMat = m.clone();
              paintMat.color = new THREE.Color(this.colorHex);
              paintMat.metalness = 0.6;
              paintMat.roughness = 0.35;
              child.material = paintMat;
            } else {
              // Paylaşımlı cam / lastik özellikleri
              if (nameStr.includes('window') || nameStr.includes('glass')) {
                m.transparent = true;
                m.opacity = 0.65;
                m.depthWrite = false;
                if (m.color) m.color.setHex(0x1a2530);
                m.roughness = 0.08;
                m.metalness = 0.2;
              } else if (nameStr.includes('tire') || nameStr.includes('rubber') || nameStr.includes('wheel')) {
                if (m.color) m.color.setHex(0x222222);
                m.roughness = 0.9;
                m.metalness = 0.05;
              }
            }
          }
        }
      }
    });

    this.wheelNodes = this.rollNodes;

    const carGroup = new THREE.Group();
    carGroup.name = `NpcGlbCar_${this.id}`;

    // Kanonik İleri Yön Konteyneri: GLTF standart modelleri -Z yönüne bakar, Three.js ileri sürüş +Z'dir
    const rawBodyContainer = new THREE.Group();
    rawBodyContainer.name = 'RawBodyContainer';
    rawBodyContainer.add(cloned);

    const rotY = modelOptions.rotationY !== undefined ? modelOptions.rotationY : Math.PI;
    rawBodyContainer.rotation.y = rotY;
    rawBodyContainer.scale.set(scale, scale, scale);

    // Dinamik Bounding Box ile Zemin Tabanı ve Merkez Hesaplama
    rawBodyContainer.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(rawBodyContainer);
    const lowestY = box.min.y;
    const center = new THREE.Vector3();
    box.getCenter(center);

    const extraY = modelOptions.yOffset !== undefined ? modelOptions.yOffset : 0;
    const extraZ = modelOptions.zOffset !== undefined ? modelOptions.zOffset : 0;

    // Ağırlık merkezini (X, Z) pivot orijinine çek, tekerlek tabanını (Y) zemine oturt
    rawBodyContainer.position.set(
      -center.x,
      -lowestY + extraY,
      -center.z + extraZ * scale
    );
    carGroup.add(rawBodyContainer);

    this.visualGroup = carGroup;
    this.root.add(this.visualGroup);
  }

  /**
   * Yol kenarı üzerinde belirli bir mesafedeki konumu ve teğet vektörünü hesaplar
   */
  sampleEdge(edge, dist, outPos, outTangent) {
    const wp = edge.waypoints;
    if (!wp || wp.length === 0) {
      outPos.copy(this.position);
      outTangent.set(0, 0, 1);
      return;
    }

    const clampedDist = THREE.MathUtils.clamp(dist, 0, edge.length);
    let accum = 0;

    for (let i = 0; i < wp.length - 1; i++) {
      const p1 = wp[i];
      const p2 = wp[i + 1];
      const segLen = p1.distanceTo(p2);

      if (accum + segLen >= clampedDist || i === wp.length - 2) {
        const segT = segLen > 0.001 ? (clampedDist - accum) / segLen : 0;
        outPos.lerpVectors(p1, p2, THREE.MathUtils.clamp(segT, 0, 1));
        outTangent.subVectors(p2, p1).normalize();

        // Sağ şerit için yatay normal ofseti ekle
        if (Math.abs(this.laneOffset) > 0.01) {
          const normX = outTangent.z;
          const normZ = -outTangent.x;
          outPos.x += normX * this.laneOffset;
          outPos.z += normZ * this.laneOffset;
        }
        return;
      }
      accum += segLen;
    }

    const last = wp[wp.length - 1];
    const prev = wp[wp.length - 2] || last;
    outPos.copy(last);
    outTangent.subVectors(last, prev).normalize();
  }

  /**
   * Aracı belirlenen yol kenarına yerleştirir
   */
  /**
   * Aracı belirlenen yol kenarına yerleştirir ve durumunu sıfırlar
   */
  spawn(spawnData) {
    // Önceki rezervasyonları temizle
    if (this.currentIntersection) {
      this.currentIntersection.leave(this.id);
      this.currentIntersection = null;
    }
    if (this.reservedNode) {
      this.reservedNode.releaseReservation(this.id);
      this.reservedNode = null;
    }
    if (this._clearingIntersection) {
      this._clearingIntersection.leave(this.id);
      this._clearingIntersection = null;
    }
    if (this._clearingNode) {
      this._clearingNode.releaseReservation(this.id);
      this._clearingNode = null;
    }
    this._clearedDistOnNewEdge = 0;

    this.stoppedTimer = 0;
    this.deadlockTimer = 0;
    this.isWaitingLight = false;
    this.isWaitingIntersection = false;
    this.isCreeping = false;

    this.currentEdge = spawnData.edge;
    this.targetNode = spawnData.targetNode || spawnData.edge?.toNode;
    this.distanceOnEdge = spawnData.distanceOnEdge ?? Math.random() * (this.currentEdge ? this.currentEdge.length * 0.7 : 0);
    this.speed = 4.0 + Math.random() * 4.0;

    if (this.currentEdge) {
      this.sampleEdge(this.currentEdge, this.distanceOnEdge, this._sampledPos, this._sampledTangent);
      this.position.copy(this._sampledPos);
      this.heading = Math.atan2(this._sampledTangent.x, this._sampledTangent.z);
    } else if (spawnData.position) {
      this.position.copy(spawnData.position);
      this.heading = spawnData.heading || 0;
    }

    this.steerAngle = 0;
    this.wheelRoll = 0;
    this._transitionOffset.set(0, 0, 0);
    if (this.steerNodes) {
      for (let i = 0; i < this.steerNodes.length; i++) {
        this.steerNodes[i].rotation.y = 0;
      }
    }

    this._updateGroundAlignment(0, true);
    this._updateTransform();
  }

  /**
   * Her kare güncellemesi: Kinematik hareket, yumuşak frenleme, trafik ışığı, kavşak rezervasyonu ve deadlock kurtarma
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {Object} [playerVeh]
   * @param {NpcVehicle[]} [allNpcs]
   * @param {RoadGraph} [roadGraph]
   * @param {Array<Object>} [additionalObstacles=null] - İleride eklenebilecek yayalar/dinamik engeller
   */
  update(delta, playerPos, playerVeh, allNpcs, roadGraph, additionalObstacles = null) {
    if (!this.currentEdge) return;

    // 1. İleri Yön Vektörü
    this._forward.set(Math.sin(this.heading), 0, Math.cos(this.heading));

    // 2. Ön Mesafe ve Engel Kontrolü (Oyuncu, Diğer NPC'ler ve Ek Engeller) - ADIM 6 Anti-Clipping
    let desiredSpeed = this.targetSpeed;
    let minObstacleDist = 999;

    // Oyuncu kontrolü (360° Acil Kalkan + İleri Genişletilmiş Görüş Konisi)
    if (playerPos) {
      this._tempVec.subVectors(playerPos, this.position);
      const dist = this._tempVec.length();
      if (dist < 7.2) {
        minObstacleDist = Math.min(minObstacleDist, dist);
      } else if (dist < 24.0) {
        const dot = this._tempVec.normalize().dot(this._forward);
        if (dot > 0.20) { // Genişletilmiş ön koni (±78.5°)
          minObstacleDist = Math.min(minObstacleDist, dist);
        }
      }
    }

    // Diğer NPC araçlar (360° Her Yönden Kalkan + Genişletilmiş Ön Açı)
    if (allNpcs) {
      for (let i = 0; i < allNpcs.length; i++) {
        const other = allNpcs[i];
        if (other === this || !other.currentEdge) continue;

        this._tempVec.subVectors(other.position, this.position);
        const dist = this._tempVec.length();

        // A) 360 Derece Her Yönden Acil Yakınlık Kalkanı (Kavşak Dik/Yan T-bone Çarpışmalarını Kesin Önleme)
        if (dist < 7.2) {
          minObstacleDist = Math.min(minObstacleDist, dist);
        }
        // B) Genişletilmiş İleri Çarpışma Konisi (±78.5°, 157° Açıklık)
        else if (dist < 24.0) {
          const dot = this._tempVec.normalize().dot(this._forward);
          if (dot > 0.20) {
            minObstacleDist = Math.min(minObstacleDist, dist);
          }
        }
      }
    }

    // Gelecekteki yayalar ve dinamik engeller (P5 Uyumlu)
    if (additionalObstacles && additionalObstacles.length > 0) {
      for (let i = 0; i < additionalObstacles.length; i++) {
        const obs = additionalObstacles[i];
        const obsPos = obs.position || obs;
        this._tempVec.subVectors(obsPos, this.position);
        const dist = this._tempVec.length();
        if (dist < 7.0) {
          minObstacleDist = Math.min(minObstacleDist, dist);
        } else if (dist < 18.0) {
          const dot = this._tempVec.normalize().dot(this._forward);
          if (dot > 0.3) {
            minObstacleDist = Math.min(minObstacleDist, dist);
          }
        }
      }
    }

    // 3. Kademeli Yumuşak Fren Hız Profili ve Anti-Clipping (ADIM 6)
    // d_stop = 7.6m (Merkezler arası 7.6m -> Tampon tampona net 2.6m görsel boşluk)
    // d_brake = 18.0m (18 metreden itibaren yumuşak üstel frenleme)
    if (minObstacleDist < 7.6) {
      desiredSpeed = 0;
    } else if (this.speed < 0.25 && minObstacleDist < 8.8) {
      // Histerezis (Chatter Suppression): Duran araç önü en az 8.8m açılmadan yeniden kalkış yapmaz
      desiredSpeed = 0;
    } else if (minObstacleDist < 18.0) {
      // Üstel yumuşak yavaşlama eğrisi: v = v_target * ((d - 7.6) / 10.4)^1.35
      const ratio = Math.max(0, Math.min(1, (minObstacleDist - 7.6) / 10.4));
      desiredSpeed = this.targetSpeed * Math.pow(ratio, 1.35);
    }

    // 4. Kavşak ve Trafik Işığı Kontrolü
    const distToEnd = this.currentEdge.length - this.distanceOnEdge;
    this.isWaitingLight = false;
    this.isWaitingIntersection = false;

    if (distToEnd < 14.0) {
      const atNode = this.targetNode || this.currentEdge.toNode;
      if (atNode && atNode.isIntersection) {
        // A) Trafik Işığı Kontrolü
        const tlStatus = atNode.canPassTrafficLight(this.currentEdge.id, distToEnd, this.speed);
        if (!tlStatus.canPass) {
          this.isWaitingLight = true;
          if (distToEnd < 4.2) {
            desiredSpeed = 0;
          } else {
            desiredSpeed = Math.min(desiredSpeed, Math.max(0, (distToEnd - 4.2) * 1.1));
          }
        } else {
          // B) Kavşak Bloğu Rezervasyonu (Token Sistemi)
          if (roadGraph && atNode.intersectionId) {
            const interBlock = roadGraph.getIntersection(atNode.intersectionId);
            if (interBlock) {
              if (!interBlock.canEnter(this.id)) {
                // Kavşak meşgul! Giriş çizgisinde bekle ve kuyruğa adını kaydet
                this.isWaitingIntersection = true;
                if (distToEnd < 4.2) {
                  desiredSpeed = 0;
                } else {
                  desiredSpeed = Math.min(desiredSpeed, Math.max(0, (distToEnd - 4.2) * 1.1));
                }
                interBlock.requestEnter(this.id);
              } else {
                // Kavşağa giriş izni alındı
                interBlock.requestEnter(this.id);
                this.currentIntersection = interBlock;
              }
            }
          }

          // C) Düğüm Düzeyi Yerel Rezervasyon
          if (!this.isWaitingIntersection) {
            if (!atNode.requestReservation(this.id)) {
              this.isWaitingIntersection = true;
              if (distToEnd < 4.2) {
                desiredSpeed = 0;
              } else {
                desiredSpeed = Math.min(desiredSpeed, Math.max(0, (distToEnd - 4.2) * 1.1));
              }
            } else {
              this.reservedNode = atNode;
            }
          }
        }
      }
    }

    // 5. Deadlock Algılama ve Kurtarma (Timeout & Creep)
    if (this.speed < 0.25) {
      this.stoppedTimer += delta;
    } else {
      this.stoppedTimer = 0;
      this.deadlockTimer = 0;
      this.isCreeping = false;
    }

    // Kırmızı ışıkta DEĞİLSE ve 2.6 saniyeden uzun süredir duruyorsa deadlock recovery başlat:
    if (!this.isWaitingLight && this.stoppedTimer > 2.6) {
      this.deadlockTimer += delta;

      // 1. Aşama: Öncelikli Araç Düşük Hızla Creep (Sızma) Yapar
      if (this.id % 2 === 0 || this.deadlockTimer > 1.2) {
        this.isCreeping = true;
        desiredSpeed = Math.max(desiredSpeed, 1.8); // 1.8 m/s emniyetli sızma hızı
      }

      // 2. Aşama: 4.5 saniyeyi geçen aşırı tıkanmada çıkış kenarını yeniden seç
      if (this.deadlockTimer > 4.5) {
        if (this.currentIntersection) {
          this.currentIntersection.leave(this.id);
          this.currentIntersection = null;
        }
        if (this.reservedNode) {
          this.reservedNode.releaseReservation(this.id);
          this.reservedNode = null;
        }
        if (this._clearingIntersection) {
          this._clearingIntersection.leave(this.id);
          this._clearingIntersection = null;
        }
        if (this._clearingNode) {
          this._clearingNode.releaseReservation(this.id);
          this._clearingNode = null;
        }

        if (roadGraph && this.currentEdge) {
          const altEdge = roadGraph.getNextEdge(this.currentEdge, this.currentEdge.toNode, true);
          if (altEdge && altEdge !== this.currentEdge) {
            this.currentEdge = altEdge;
            this.targetNode = altEdge.toNode;
            this.distanceOnEdge = 0.5;
            this.stoppedTimer = 0;
            this.deadlockTimer = 0;
            this.isCreeping = false;
          }
        }
      }
    }

    // 6. Titreşim Önleyici (Chatter Suppression)
    if (desiredSpeed === 0 && this.speed < 0.35) {
      this.speed = 0;
    }

    // 7. İvmelenme / Yumuşak Frenleme
    if (this.speed < desiredSpeed) {
      this.speed = Math.min(this.speed + this.accel * delta, desiredSpeed);
    } else {
      this.speed = Math.max(this.speed - this.brakeForce * delta, desiredSpeed);
    }

    // 8. Kenar Boyunca İlerle
    this.distanceOnEdge += this.speed * delta;

    // ADIM 6: Gecikmeli Kavşak Tahliyesi: Yeni yolda en az 8.5 metre ilerledikten sonra kavşağı arkadakilere devret
    if (this._clearingIntersection || this._clearingNode) {
      this._clearedDistOnNewEdge += this.speed * delta;
      if (this._clearedDistOnNewEdge >= 8.5) {
        if (this._clearingIntersection) {
          this._clearingIntersection.leave(this.id);
          this._clearingIntersection = null;
        }
        if (this._clearingNode) {
          this._clearingNode.releaseReservation(this.id);
          this._clearingNode = null;
        }
        this._clearedDistOnNewEdge = 0;
      }
    }

    // 9. Kenar Sonu ve Kavşak Geçişi (ADIM 8: Overshoot Korunumu ve Sürekli Geçiş)
    if (this.distanceOnEdge >= this.currentEdge.length) {
      // ADIM 6: Kavşaktan çıkıldı: Rezervasyonu anında bırakma, yeni kenarda 8.5m ilerleyene kadar sakla
      if (this.currentIntersection) {
        if (this._clearingIntersection && this._clearingIntersection !== this.currentIntersection) {
          this._clearingIntersection.leave(this.id);
        }
        this._clearingIntersection = this.currentIntersection;
        this._clearingNode = this.reservedNode;
        this._clearedDistOnNewEdge = 0;
        this.currentIntersection = null;
        this.reservedNode = null;
      } else if (this.reservedNode) {
        if (this._clearingNode && this._clearingNode !== this.reservedNode) {
          this._clearingNode.releaseReservation(this.id);
        }
        this._clearingNode = this.reservedNode;
        this._clearedDistOnNewEdge = 0;
        this.reservedNode = null;
      }

      const overshoot = this.distanceOnEdge - this.currentEdge.length;
      const atNode = this.currentEdge.toNode;
      const nextEdge = roadGraph ? roadGraph.getNextEdge(this.currentEdge, atNode, false) : null;

      if (nextEdge) {
        // Eski anlık konumu sakla
        const prevX = this.position.x;
        const prevZ = this.position.z;

        this.currentEdge = nextEdge;
        this.targetNode = nextEdge.toNode;
        this.distanceOnEdge = Math.min(Math.max(0, overshoot), nextEdge.length * 0.5);

        // Yeni kenar üzerindeki yeni şerit başlangıç noktasını örnekle
        this.sampleEdge(this.currentEdge, this.distanceOnEdge, this._sampledPos, this._sampledTangent);

        // ADIM 8: Eski gerçek konum ile yeni kenar hedefi arasındaki farkı transitionOffset olarak yakala
        // Böylece araç tek bir render karesinde 2.5 - 4 metre yana ışınlanmak yerine tam bulunduğu noktadan
        // yeni şeride doğru yumuşak ve pürüzsüz bir yay çizerek akar (Teleport Snapping Önleyici).
        const dx = prevX - this._sampledPos.x;
        const dz = prevZ - this._sampledPos.z;
        const distSq = dx * dx + dz * dz;

        if (distSq > 0.0001 && distSq < 144.0) { // < 12 metre ise yumuşak geçiş sağla
          this._transitionOffset.set(dx, 0, dz);
        } else {
          this._transitionOffset.set(0, 0, 0);
        }
      } else {
        // Çıkmaz sokak sonu veya bağlantısız düğüm: Kenarı başa al
        this.distanceOnEdge = 0;
        this._transitionOffset.set(0, 0, 0);
      }
    }

    // 10. Konum ve Açıyı Güncelle (ADIM 8: Transition Blending & Heading Slew Rate)
    this.sampleEdge(this.currentEdge, this.distanceOnEdge, this._sampledPos, this._sampledTangent);

    // Geçiş ofsetini mesafeye ve zamana bağlı exponential decay ile sönümle
    if (this._transitionOffset.lengthSq() > 0.0001) {
      const decayRate = Math.max(3.5, this.speed * 0.9);
      const decay = Math.exp(-decayRate * delta);
      this._transitionOffset.multiplyScalar(decay);
      if (this._transitionOffset.lengthSq() < 0.0001) {
        this._transitionOffset.set(0, 0, 0);
      }
    }

    // ADIM 2: Çarpışma itme ofsetini zamanla sönümle (exponential decay)
    if (this.collisionOffset && this.collisionOffset.lengthSq() > 0.0001) {
      const colDecay = Math.exp(-4.2 * delta);
      this.collisionOffset.multiplyScalar(colDecay);
      if (this.collisionOffset.lengthSq() < 0.0001) {
        this.collisionOffset.set(0, 0, 0);
      }
    }

    // Araç yatay koordinatlarını harmanlanmış konum ve çarpışma ofseti ile güncelle
    this.position.x = this._sampledPos.x + this._transitionOffset.x + (this.collisionOffset ? this.collisionOffset.x : 0);
    this.position.z = this._sampledPos.z + this._transitionOffset.z + (this.collisionOffset ? this.collisionOffset.z : 0);

    // Heading yumuşatması (hıza duyarlı dönüş hızı ile virajda ani kırılmaları önleme)
    const targetHeading = Math.atan2(this._sampledTangent.x, this._sampledTangent.z);
    let diff = targetHeading - this.heading;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    const turnRate = THREE.MathUtils.clamp(this.speed * 0.8 + 3.2, 3.0, 7.5);
    this.heading += diff * Math.min(delta * turnRate, 1.0);

    // 11. Zemin Eğim ve Sürüş Yüksekliğini Uygula (Pitch, Roll & Ride Height)
    this._updateGroundAlignment(delta, false);

    // 12. Tekerlek Yuvarlanma (Roll) ve Ön Tekerlek Direksiyon (Steer) Animasyonu
    // A) Yuvarlanma (Roll): Araba +Z yönünde ilerlerken, Three.js sağ el kuralına göre
    // tekerleğin tepe noktasının ileriye gitmesi için +X ekseni etrafında negatif rotasyon gerekir.
    const effectiveRollNodes = (this.rollNodes && this.rollNodes.length > 0) ? this.rollNodes : this.wheelNodes;
    if (Math.abs(this.speed) > 0.02 && effectiveRollNodes.length > 0) {
      const radius = this.wheelRadius || 0.34;
      this.wheelRoll -= (this.speed * delta) / radius;
      if (this.wheelRoll < -Math.PI * 2) this.wheelRoll += Math.PI * 2;
      if (this.wheelRoll > Math.PI * 2) this.wheelRoll -= Math.PI * 2;

      for (let i = 0; i < effectiveRollNodes.length; i++) {
        effectiveRollNodes[i].rotation.x = this.wheelRoll;
      }
    }

    // B) Ön Tekerlek Direksiyon Açısı (Steering Yaw):
    // Virajlarda ve kavşak dönüşlerinde hedef açı ile mevcut gövde açısı arasındaki sapmaya göre
    // ön tekerlekler virajın içine doğru gerçekçi bir Ackermann açısıyla döner.
    if (this.steerNodes && this.steerNodes.length > 0) {
      const maxSteer = 0.55; // ~31.5 derece maksimum dönüş
      const targetSteer = Math.max(-maxSteer, Math.min(maxSteer, diff * 1.6));
      this.steerAngle += (targetSteer - this.steerAngle) * Math.min(delta * 10.0, 1.0);

      for (let i = 0; i < this.steerNodes.length; i++) {
        this.steerNodes[i].rotation.y = this.steerAngle;
      }
    }

    this._updateTransform();
  }

  /**
   * Ön/arka ve sol/sağ aks zemin yüksekliklerini örnekleyerek boyuna (pitch) ve enine (roll) eğimleri hesaplar
   */
  _updateGroundAlignment(delta, snap = false) {
    const sinH = Math.sin(this.heading);
    const cosH = Math.cos(this.heading);

    const sampleH = (px, pz) => {
      if (!this.terrain) return 0.08;
      if (typeof this.terrain.getHeightAt === 'function') {
        return this.terrain.getHeightAt(px, pz) + 0.08;
      } else if (typeof this.terrain.getElevation === 'function') {
        return this.terrain.getElevation(px, pz) + 0.08;
      }
      return 0.08;
    };

    // Ön ve arka aks mesafeleri (m) ile iz genişliği
    const frontDist = 1.35;
    const rearDist = 1.25;
    const halfWidth = 0.75;

    // 1. Ön ve Arka aks zemin yükseklikleri
    const fx = this.position.x + sinH * frontDist;
    const fz = this.position.z + cosH * frontDist;
    const rx = this.position.x - sinH * rearDist;
    const rz = this.position.z - cosH * rearDist;

    const yFront = sampleH(fx, fz);
    const yRear = sampleH(rx, rz);

    // 2. Sol ve Sağ taraf zemin yükseklikleri
    const lx = this.position.x - cosH * halfWidth;
    const lz = this.position.z + sinH * halfWidth;
    const rxRight = this.position.x + cosH * halfWidth;
    const rzRight = this.position.z - sinH * halfWidth;

    const yLeft = sampleH(lx, lz);
    const yRight = sampleH(rxRight, rzRight);

    // 3. Hedef Pitch (burun yukarı/aşağı) ve Roll (sağa/sola yatma)
    // Three.js sağ el kuralı: Yerel X ekseni etrafında burun yukarı kalkması için negatif açı gerekir.
    const totalWheelBase = frontDist + rearDist;
    const rawPitch = -Math.atan2(yFront - yRear, totalWheelBase);
    const rawRoll = Math.atan2(yRight - yLeft, halfWidth * 2);

    // Eğimleri güvenli sınırda tut (aşırı viraj veya dik yokuşlarda aracın takla atmasını/dikilmesini engelle)
    const maxSlope = 0.18; // ~10.3 derece maksimum eğim
    const targetPitch = THREE.MathUtils.clamp(rawPitch, -maxSlope, maxSlope);
    const targetRoll = THREE.MathUtils.clamp(rawRoll, -maxSlope, maxSlope);

    // 4. Ağırlık merkezi zemin yüksekliği (Ride Height)
    const targetY = (yFront + yRear + yLeft + yRight) * 0.25;

    if (snap || delta <= 0) {
      this.pitch = targetPitch;
      this.roll = targetRoll;
      this.position.y = targetY;
    } else {
      const smoothSpeed = Math.min(delta * 12.0, 1.0);
      this.pitch += (targetPitch - this.pitch) * smoothSpeed;
      this.roll += (targetRoll - this.roll) * smoothSpeed;
      this.position.y += (targetY - this.position.y) * smoothSpeed;
    }
  }

  _updateTransform() {
    this.root.position.copy(this.position);
    this.root.rotation.set(this.pitch, this.heading, this.roll, 'YXZ');
  }

  /**
   * Mesafe bazlı LOD seviyesini ayarlar (0: full detay ve gölge, 1-2: gölgesiz ve optimize)
   */
  setLOD(level) {
    if (this._lodLevel === level) return;
    this._lodLevel = level;
    const castShadow = (level === 0);
    this.root.traverse((child) => {
      if (child.isMesh) {
        child.castShadow = castShadow;
      }
    });
  }
}

/**
 * TrafficManager - MVP Trafik Orkestratörü ve Araç Havuz Yöneticisi
 */
export class TrafficManager {
  /**
   * @param {THREE.Scene} scene
   * @param {RoadGraph} roadGraph
   * @param {TerrainManager} terrainManager
   * @param {THREE.Object3D} [templateScene=null]
   */
  constructor(scene, roadGraph, terrainManager, templateScene = null) {
    this.scene = scene;
    this.roadGraph = roadGraph;
    this.terrain = terrainManager;
    this.templateScene = templateScene;
    this.templatePool = []; // [{ scene, options }]

    this.group = new THREE.Group();
    this.group.name = 'TrafficManagerGroup';
    if (this.scene) {
      this.scene.add(this.group);
    }

    /** @type {NpcVehicle[]} */
    this.npcs = [];
    this.maxNpcs = 6; // MVP için stabil 6 NPC araç

    // Dinamik Torus (Halka) ve Bubble Streaming Mesafe Kuralları (Metre) - ADIM 5
    this.spawnMinDist = 38.0;       // Torus R_min: 38m (Oyuncunun görüşünde/burnunda ani pop-in yasak)
    this.spawnMaxDist = 95.0;       // Torus R_max: 95m (Aktif sürüş ve çevre caddeleri)
    this.despawnDistSq = 130 * 130; // R_despawn: 130m (Uzaklaşan araçlar sessizce geri dönüştürülür)

    this._initialBubbleSpawned = false;
    this._tmpCamDir = new THREE.Vector3();
    this._tmpForwardDir = new THREE.Vector3();
    this._tmpVecA = new THREE.Vector3();

    if (typeof window !== 'undefined') {
      window.trafficManager = this;
    }

    if (this.roadGraph && this.roadGraph.edges && this.roadGraph.edges.length > 0) {
      this.initTraffic();
    }
  }

  /**
   * Çoklu araç model şablon havuzunu belirler ve NPC araçlarına dağıtır
   * @param {Array<{scene: THREE.Object3D, options: Object}>} pool
   */
  setTemplatePool(pool) {
    if (!Array.isArray(pool) || pool.length === 0) return;
    this.templatePool = pool;
    this.templateScene = pool[0]?.scene || null;
    for (let i = 0; i < this.npcs.length; i++) {
      const item = this.templatePool[i % this.templatePool.length];
      if (item && item.scene) {
        const opts = Object.assign({}, item.options || {}, {
          vehicleType: item.type || 'sedan',
          vehicleName: item.name || 'Traffic Car'
        });
        this.npcs[i].applyTemplateScene(item.scene, opts);
      }
    }
  }

  setTemplateScene(templateScene, options = {}) {
    if (!templateScene) return;
    this.templateScene = templateScene;
    this.templatePool = [{ scene: templateScene, options }];
    for (let i = 0; i < this.npcs.length; i++) {
      this.npcs[i].applyTemplateScene(templateScene, options);
    }
  }

  /**
   * Bir NPC aracı trafikten ve sahneden güvenle çıkartır (ADIM 16: Carjacking)
   */
  removeNpcVehicle(npc) {
    if (!npc) return false;
    const idx = this.npcs.indexOf(npc);
    if (idx !== -1) {
      this.npcs.splice(idx, 1);
      if (npc.root && npc.root.parent) {
        npc.root.parent.remove(npc.root);
      }
      return true;
    }
    return false;
  }

  /**
   * Belirli bir konuma manuel NPC araç koyar (Test / Carjacking desteği)
   */
  spawnNpcAtPosition(pos, heading = 0, colorHex = 0xd97724) {
    let tScene = this.templateScene;
    let tOpts = {};
    if (this.templatePool && this.templatePool.length > 0) {
      const item = this.templatePool[Math.floor(Math.random() * this.templatePool.length)];
      tScene = item.scene;
      tOpts = Object.assign({}, item.options || {}, {
        vehicleType: item.type || 'sedan',
        vehicleName: item.name || 'Traffic Car'
      });
    }
    const npcId = 1000 + this.npcs.length;
    const npc = new NpcVehicle(npcId, colorHex, this.terrain, tScene, tOpts);
    npc.position.copy(pos);
    npc.heading = heading;
    npc.speed = 0;
    npc.targetSpeed = 0;
    npc._updateTransform();
    this.group.add(npc.root);
    this.npcs.push(npc);
    return npc;
  }

  /**
   * Oyuncunun etrafındaki Torus (Halka) alanında yönlü ve çakışmasız spawn noktası üretir.
   * Forward-bias (%75 ön açı, %25 yan/arka açı) ve minimum 14m araç mesafesi (clearance) garantisi sağlar.
   */
  getStreamingSpawnPoint(playerPos, forwardDir = null, minDist = 38, maxDist = 95, excludeNpc = null, playerVeh = null) {
    if (!this.roadGraph || !this.roadGraph.edges || this.roadGraph.edges.length === 0 || !playerPos) {
      return null;
    }

    const edges = this.roadGraph.edges;
    const forwardCandidates = [];
    const rearCandidates = [];
    const minSq = minDist * minDist;
    const maxSq = maxDist * maxDist;

    // 1. Kenarları Torus mesafesi ve yön benzerliğine (dot product) göre grupla
    for (let i = 0; i < edges.length; i++) {
      const edge = edges[i];
      if (!edge.waypoints || edge.waypoints.length < 2) continue;

      // Kenar orta noktası
      edge.getLanePointAt(0.5, 0, this._tmpVecA);

      const dx = this._tmpVecA.x - playerPos.x;
      const dz = this._tmpVecA.z - playerPos.z;
      const distSq = dx * dx + dz * dz;

      if (distSq >= minSq && distSq <= maxSq) {
        if (forwardDir && (forwardDir.x !== 0 || forwardDir.z !== 0)) {
          const invLen = 1 / Math.max(Math.sqrt(distSq), 0.001);
          const toEdgeX = dx * invLen;
          const toEdgeZ = dz * invLen;
          const dot = toEdgeX * forwardDir.x + toEdgeZ * forwardDir.z;

          // dot >= -0.15: Ön 190 derecelik sektör (oyuncunun sürüş/kamera yönü)
          if (dot >= -0.15) {
            forwardCandidates.push(edge);
          } else {
            rearCandidates.push(edge);
          }
        } else {
          forwardCandidates.push(edge);
        }
      }
    }

    // 2. Havuz seçimi (%75 ön açı bias)
    let selectedPool = forwardCandidates;
    if (forwardCandidates.length > 0 && rearCandidates.length > 0) {
      selectedPool = Math.random() < 0.75 ? forwardCandidates : rearCandidates;
    } else if (forwardCandidates.length === 0 && rearCandidates.length > 0) {
      selectedPool = rearCandidates;
    } else if (forwardCandidates.length === 0 && rearCandidates.length === 0) {
      // Çok dar bir alandaysa veya kenar bulunamadıysa mesafeyi esnet
      for (let i = 0; i < edges.length; i++) {
        const edge = edges[i];
        edge.getLanePointAt(0.5, 0, this._tmpVecA);
        const dist = this._tmpVecA.distanceTo(playerPos);
        if (dist >= minDist * 0.7 && dist <= maxDist * 1.35) {
          selectedPool.push(edge);
        }
      }
      if (selectedPool.length === 0) {
        return this.roadGraph.getRandomSpawnPoint();
      }
    }

    // 3. Çakışmasız Nokta Arama (Clearance check: Diğer NPC'lerden >= 14m, oyuncudan >= 28m)
    const maxAttempts = Math.min(selectedPool.length * 2, 14);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const edge = selectedPool[Math.floor(Math.random() * selectedPool.length)];
      const t = 0.2 + Math.random() * 0.6; // Düğümlere yığılmayı önleyen [0.2, 0.8] bandı
      const candidatePos = new THREE.Vector3();
      edge.getLanePointAt(t, 0, candidatePos);

      // Oyuncuya mesafe kontrolü
      const distToPlayer = candidatePos.distanceTo(playerPos);
      if (distToPlayer < minDist) continue;

      if (playerVeh && playerVeh.position) {
        if (candidatePos.distanceTo(playerVeh.position) < 22.0) continue;
      }

      // Diğer NPC araçlarına mesafe kontrolü (Anti-Clipping)
      let clearanceOk = true;
      for (let j = 0; j < this.npcs.length; j++) {
        const otherNpc = this.npcs[j];
        if (otherNpc === excludeNpc) continue;
        if (candidatePos.distanceTo(otherNpc.position) < 14.0) {
          clearanceOk = false;
          break;
        }
      }

      if (clearanceOk) {
        return {
          edge,
          targetNode: edge.toNode,
          distanceOnEdge: t * edge.length,
          position: candidatePos,
          heading: edge.getHeadingAt(t)
        };
      }
    }

    // Havuzdaki rastgele bir kenarın geçerli noktasını döndür (fallback)
    const fallbackEdge = selectedPool[Math.floor(Math.random() * selectedPool.length)];
    const t = 0.25 + Math.random() * 0.5;
    const pos = new THREE.Vector3();
    fallbackEdge.getLanePointAt(t, 0, pos);
    return {
      edge: fallbackEdge,
      targetNode: fallbackEdge.toNode,
      distanceOnEdge: t * fallbackEdge.length,
      position: pos,
      heading: fallbackEdge.getHeadingAt(t)
    };
  }

  /**
   * Tüm araçları oyuncunun etrafındaki aktif Torus halkasına yeniden dağıtır
   */
  respawnAllInBubble(playerPos, forwardDir = null, playerVeh = null) {
    if (!playerPos || !this.roadGraph) return;
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      const spawnData = this.getStreamingSpawnPoint(playerPos, forwardDir, this.spawnMinDist, this.spawnMaxDist, npc, playerVeh);
      if (spawnData) {
        npc.spawn(spawnData);
      }
    }
    this._initialBubbleSpawned = true;
  }

  /**
   * 6 adet NPC aracı başlatır ve yol ağına dağıtır
   */
  initTraffic(focusPos = null, forwardDir = null) {
    if (!this.roadGraph || this.roadGraph.edges.length === 0) return;

    for (let i = 0; i < this.maxNpcs; i++) {
      const color = NPC_COLORS[i % NPC_COLORS.length];
      let tScene = this.templateScene;
      let tOpts = {};
      if (this.templatePool && this.templatePool.length > 0) {
        const item = this.templatePool[i % this.templatePool.length];
        tScene = item.scene;
        tOpts = item.options || {};
      }
      const npc = new NpcVehicle(i, color, this.terrain, tScene, tOpts);
      this.group.add(npc.root);
      this.npcs.push(npc);

      let spawnData = null;
      if (focusPos) {
        spawnData = this.getStreamingSpawnPoint(focusPos, forwardDir, this.spawnMinDist, this.spawnMaxDist, npc);
      }
      if (!spawnData) {
        spawnData = this.roadGraph.getRandomSpawnPoint();
      }
      if (spawnData) {
        npc.spawn(spawnData);
      }
    }
  }

  /**
   * Her simülasyon adımında çağrılır
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {Object} [playerVeh]
   * @param {Array<Object>} [additionalObstacles=null]
   * @param {THREE.Camera} [camera=null]
   */
  update(delta, playerPos, playerVeh = null, additionalObstacles = null, camera = null) {
    this._frameTick = (this._frameTick || 0) + 1;

    // 1. Yol Ağı Trafik Işıkları ve Kavşak Blok Zamanlayıcılarını Güncelle
    if (this.roadGraph && typeof this.roadGraph.update === 'function') {
      this.roadGraph.update(delta);
    }

    if (!playerPos || this.npcs.length === 0) return;

    // 2. Oyuncunun ileri yön vektörünü hesapla (Kamera veya araç yönelimi)
    let forwardDir = null;
    if (camera && typeof camera.getWorldDirection === 'function') {
      camera.getWorldDirection(this._tmpCamDir);
      this._tmpCamDir.y = 0;
      if (this._tmpCamDir.lengthSq() > 0.001) {
        this._tmpForwardDir.copy(this._tmpCamDir).normalize();
        forwardDir = this._tmpForwardDir;
      }
    }
    if (!forwardDir && playerVeh && playerVeh.heading !== undefined) {
      this._tmpForwardDir.set(-Math.sin(playerVeh.heading), 0, -Math.cos(playerVeh.heading)).normalize();
      forwardDir = this._tmpForwardDir;
    }

    // İlk kez geçerli bir oyuncu pozisyonu alındığında tüm araçları oyuncunun Torus halkasına dağıt
    if (!this._initialBubbleSpawned) {
      this.respawnAllInBubble(playerPos, forwardDir, playerVeh);
    }

    // 3. Her bir NPC aracını mesafe ve Tick LOD kademesine göre güncelle
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];

      // Oyuncudan aşırı uzaklaşan aracı oyuncunun ileri bölgesine Torus streaming ile recycle et
      const distSq = npc.position.distanceToSquared(playerPos);
      if (distSq > this.despawnDistSq) {
        this.recycleNpc(npc, playerPos, forwardDir, playerVeh);
        continue;
      }

      // Tick LOD & Throttling:
      // < 45m: LOD 0 (Tam detay, her frame simülasyon ve gölgeler)
      // 45m - 85m: LOD 1 (Gölgesiz, her 2 frame'de bir güncelleme)
      // > 85m: LOD 2 (Gölgesiz, her 3 frame'de bir güncelleme)
      if (distSq < 2025) {
        npc.setLOD(0);
        npc.update(delta, playerPos, playerVeh, this.npcs, this.roadGraph, additionalObstacles);
      } else if (distSq < 7225) {
        npc.setLOD(1);
        if ((this._frameTick + i) % 2 === 0) {
          npc.update(delta * 2, playerPos, playerVeh, this.npcs, this.roadGraph, additionalObstacles);
        }
      } else {
        npc.setLOD(2);
        if ((this._frameTick + i) % 3 === 0) {
          npc.update(delta * 3, playerPos, playerVeh, this.npcs, this.roadGraph, additionalObstacles);
        }
      }
    }

    // 4. Sert Kinematik Ayrıştırma Geçişi (ADIM 6: Zero-Penetration Hard Relaxation)
    this.applyVehicleSeparation();
  }

  /**
   * Sert Kinematik Ayrıştırma Geçişi (Hard Kinematic Relaxation Pass) - ADIM 6
   * İki aracın hiçbir koşulda iç içe geçemeyeceğini (sıfır penetrasyon) matematiksel olarak garanti eder.
   */
  applyVehicleSeparation() {
    const npcs = this.npcs;
    const count = npcs.length;
    const minSafeDist = 5.2; // Tampon tampona fiziksel temas sınırı (~4.9m araç boyu + 0.3m emniyet)
    const minSafeDistSq = minSafeDist * minSafeDist;

    for (let i = 0; i < count; i++) {
      const a = npcs[i];
      if (!a.currentEdge) continue;

      for (let j = i + 1; j < count; j++) {
        const b = npcs[j];
        if (!b.currentEdge) continue;

        const dx = b.position.x - a.position.x;
        const dz = b.position.z - a.position.z;
        const distSq = dx * dx + dz * dz;

        if (distSq < minSafeDistSq && distSq > 0.0001) {
          const dist = Math.sqrt(distSq);
          const overlap = minSafeDist - dist;

          // Hangi araç geride? A'nın ileri yön vektörüne göre B önde mi arkada mı?
          const dotA = (dx * a._forward.x + dz * a._forward.z) / dist;

          let trailingNpc = null;

          if (dotA > 0.25) {
            trailingNpc = a; // B önde, A arkada
          } else if (dotA < -0.25) {
            trailingNpc = b; // A önde, B arkada
          } else {
            // Yanal veya dik temas durumunda hızı düşük olan bekler
            trailingNpc = (a.speed <= b.speed) ? a : b;
          }

          // Gerideki aracı durdur ve güvenli mesafe kadar geriye it
          trailingNpc.speed = 0;
          trailingNpc.distanceOnEdge = Math.max(0, trailingNpc.distanceOnEdge - overlap * 0.7);

          // Pozisyonu ve şerit transformunu anında güncelle
          trailingNpc.sampleEdge(trailingNpc.currentEdge, trailingNpc.distanceOnEdge, trailingNpc._sampledPos, trailingNpc._sampledTangent);
          trailingNpc.position.copy(trailingNpc._sampledPos);
          trailingNpc._updateTransform();
        }
      }
    }
  }

  /**
   * Aracı sahneden silmeden oyuncunun önündeki yeni bir kenara taşır (Sıfır GC)
   */
  recycleNpc(npc, playerPos, forwardDir = null, playerVeh = null) {
    if (!this.roadGraph || !playerPos) return;

    const spawnData = this.getStreamingSpawnPoint(playerPos, forwardDir, this.spawnMinDist, this.spawnMaxDist, npc, playerVeh);
    if (spawnData) {
      npc.spawn(spawnData);
    }
  }

  destroy() {
    for (let i = 0; i < this.npcs.length; i++) {
      const npc = this.npcs[i];
      if (npc.currentIntersection) {
        npc.currentIntersection.leave(npc.id);
        npc.currentIntersection = null;
      }
      if (npc.reservedNode) {
        npc.reservedNode.releaseReservation(npc.id);
        npc.reservedNode = null;
      }
      if (npc._clearingIntersection) {
        npc._clearingIntersection.leave(npc.id);
        npc._clearingIntersection = null;
      }
      if (npc._clearingNode) {
        npc._clearingNode.releaseReservation(npc.id);
        npc._clearingNode = null;
      }
    }
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
    this.npcs = [];
  }
}
