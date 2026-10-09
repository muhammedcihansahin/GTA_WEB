import * as THREE from 'three';
import { pedestrianModelCatalog } from './PedestrianModelCatalog.js';
import { pedestrianAudio } from './PedestrianAudio.js';
import { gangTerritoryManager, Faction } from './GangTerritoryManager.js';

/**
 * Yaya Durumları (State Machine)
 */
export const PedestrianState = {
  IDLE: 'IDLE',
  WALKING: 'WALKING',
  CROSSING: 'CROSSING',
  FLEEING: 'FLEEING',
  STUMBLING: 'STUMBLING',
  KNOCKED_DOWN: 'KNOCKED_DOWN',
  GETTING_UP: 'GETTING_UP',
  CONFRONTING: 'CONFRONTING',
  COMBAT_RANGED: 'COMBAT_RANGED',
  BRAWL_MELEE: 'BRAWL_MELEE',
  TAUNTING: 'TAUNTING'
};

/**
 * GTA San Andreas Tarzı Yaya Renk Paleti
 */
const PEDESTRIAN_SHIRT_COLORS = [
  0x2e7d32, // Grove Green
  0x1565c0, // Blue Tee
  0xc62828, // Ballas / Red Shirt
  0xef6c00, // San Fierro Orange
  0x424242, // Dark Grey Tee
  0xf5f5f5, // White Tank Top
  0xfbc02d, // Mustard Yellow
  0x6a1b9a  // Purple Hoodie
];

const PEDESTRIAN_PANTS_COLORS = [
  0x1c2833, // Dark Denim
  0x2c3e50, // Blue Jeans
  0x784212, // Brown Chinos
  0x616161, // Grey Trousers
  0x17202a  // Black Pants
];

const SKIN_TONES = [
  0x8d5524,
  0xc68642,
  0xe0ac69,
  0xf1c27d,
  0x4a2c11
];

/**
 * ProceduralPedestrianBuilder - Hafif, şık, performansı yüksek GTA sokak yayası üretici
 * Eklemli omuz ve kalça pivotları sayesinde yürüme/koşma salınımları gerçekçidir.
 */
class ProceduralPedestrianBuilder {
  static createPedestrian(shirtColor, pantsColor, skinColor) {
    const root = new THREE.Group();
    root.name = 'PedestrianMesh';

    // 1. Gövde / Tişört (Torso)
    const torsoGeo = new THREE.BoxGeometry(0.46, 0.58, 0.26);
    const torsoMat = new THREE.MeshStandardMaterial({
      color: shirtColor,
      roughness: 0.8,
      metalness: 0.1
    });
    const torso = new THREE.Mesh(torsoGeo, torsoMat);
    torso.position.y = 1.06;
    torso.castShadow = true;
    torso.receiveShadow = true;
    root.add(torso);

    // 2. Kafa & Boyun
    const headGeo = new THREE.BoxGeometry(0.24, 0.26, 0.24);
    const headMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.7,
      metalness: 0.05
    });
    const head = new THREE.Mesh(headGeo, headMat);
    head.position.set(0, 1.48, 0);
    head.castShadow = true;
    root.add(head);

    // Şapka veya Saç (Varyasyon)
    if (Math.random() > 0.4) {
      const capGeo = new THREE.BoxGeometry(0.26, 0.08, 0.28);
      const capMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
      const cap = new THREE.Mesh(capGeo, capMat);
      cap.position.set(0, 1.62, 0.02);
      root.add(cap);
    }

    // 3. Kollar (Omuz Pivotları - Gövde yanına anatomik oturur)
    const armGeo = new THREE.BoxGeometry(0.11, 0.50, 0.12);
    armGeo.translate(0, -0.24, 0); // Tam omuz mafsalından dönsün
    const armMat = new THREE.MeshStandardMaterial({
      color: skinColor,
      roughness: 0.7
    });

    const leftArmPivot = new THREE.Group();
    leftArmPivot.position.set(-0.28, 1.28, 0);
    const leftArm = new THREE.Mesh(armGeo, armMat);
    leftArm.castShadow = true;
    leftArmPivot.add(leftArm);
    root.add(leftArmPivot);

    const rightArmPivot = new THREE.Group();
    rightArmPivot.position.set(0.28, 1.28, 0);
    const rightArm = new THREE.Mesh(armGeo, armMat);
    rightArm.castShadow = true;
    rightArmPivot.add(rightArm);
    root.add(rightArmPivot);

    // 4. Bacaklar (Kalça Pivotları)
    const legGeo = new THREE.BoxGeometry(0.16, 0.68, 0.18);
    legGeo.translate(0, -0.32, 0); // Üstten dönsün
    const pantsMat = new THREE.MeshStandardMaterial({
      color: pantsColor,
      roughness: 0.85
    });

    const leftLegPivot = new THREE.Group();
    leftLegPivot.position.set(-0.13, 0.76, 0);
    const leftLeg = new THREE.Mesh(legGeo, pantsMat);
    leftLeg.castShadow = true;
    leftLegPivot.add(leftLeg);
    root.add(leftLegPivot);

    const rightLegPivot = new THREE.Group();
    rightLegPivot.position.set(0.13, 0.76, 0);
    const rightLeg = new THREE.Mesh(legGeo, pantsMat);
    rightLeg.castShadow = true;
    rightLegPivot.add(rightLeg);
    root.add(rightLegPivot);

    // Ayakkabılar
    const shoeGeo = new THREE.BoxGeometry(0.17, 0.10, 0.24);
    const shoeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.9 });
    const leftShoe = new THREE.Mesh(shoeGeo, shoeMat);
    leftShoe.position.set(0, -0.66, 0.03);
    leftLegPivot.add(leftShoe);

    const rightShoe = new THREE.Mesh(shoeGeo, shoeMat);
    rightShoe.position.set(0, -0.66, 0.03);
    rightLegPivot.add(rightShoe);

    return {
      root,
      torso,
      head,
      leftArmPivot,
      rightArmPivot,
      leftLegPivot,
      rightLegPivot
    };
  }
}

/**
 * Pedestrian - Tekil Yaya Nesnesi (FSM, Navigasyon, Kaçış ve Kinematik)
 */
export class Pedestrian {
  /**
   * @param {number} id
   * @param {Object} [terrainManager=null]
   * @param {PedestrianManager} [manager=null]
   */
  constructor(id, terrainManager = null, manager = null) {
    this.id = id;
    this.terrain = terrainManager;
    this.manager = manager;

    // Balistik Çarpışma ve Ragdoll Parametreleri (ADIM 9)
    this.impulseVelocity = new THREE.Vector3();
    this.verticalVelocity = 0;
    this.isAirborne = false;
    this.tumblePitch = Math.PI / 2;
    this.knockedDownDuration = 2.6; // Yerde bekleme süresi
    this.gettingUpDuration = 1.0;   // Ayağa kalkış süresi
    this.stumbleDuration = 0.85;    // Sendeleme süresi

    this.state = PedestrianState.IDLE;
    this.isActive = false;

    // ADIM 10 & 11: Çete & Çatışma Parametreleri
    this.faction = Faction.CIVILIAN;
    this.isArmed = false;
    this.isWarEnemy = false;
    this.combatTarget = null;
    this.combatTimer = 0;
    this.shootCooldown = 0;
    this.greetCooldown = 0;
    this.scanCooldown = Math.random() * 0.4;

    this.position = new THREE.Vector3();
    this.heading = 0;
    this.targetHeading = 0;
    this.speed = 0;
    this.baseWalkSpeed = 1.35;
    this.baseRunSpeed = 4.2;

    // Graf ve Rota
    /** @type {import('./SidewalkGraph.js').SidewalkEdge|null} */
    this.currentEdge = null;
    /** @type {import('./SidewalkGraph.js').SidewalkNode|null} */
    this.targetNode = null;
    this.distanceOnEdge = 0;

    // Zamanlayıcılar (FSM)
    this.stateTimer = 0;
    this.idleDuration = 2.0;
    this.fleeDuration = 3.0;
    this.fleeDirection = new THREE.Vector3();

    // Animasyon Salınım Fazı
    this.animPhase = Math.random() * Math.PI * 2;

    // 3D Model ve Animasyon Referansları
    this.controller = null;
    this.modelKey = 'procedural';

    const shirtColor = PEDESTRIAN_SHIRT_COLORS[id % PEDESTRIAN_SHIRT_COLORS.length];
    const pantsColor = PEDESTRIAN_PANTS_COLORS[(id * 3) % PEDESTRIAN_PANTS_COLORS.length];
    const skinColor = SKIN_TONES[(id * 2) % SKIN_TONES.length];

    this.visuals = ProceduralPedestrianBuilder.createPedestrian(shirtColor, pantsColor, skinColor);
    this.root = this.visuals.root;
    this.root.visible = false;

    // Sıfır GC için önbellek vektörleri
    this._tempVec = new THREE.Vector3();
    this._targetPos = new THREE.Vector3();
  }

  /**
   * Yayanın görsel modelini GLB model katalog instance'ı ile günceller
   * @param {{ root: THREE.Group, controller: import('./PedestrianModelCatalog.js').PedestrianVisualController, modelKey: string }} instance
   */
  setVisualInstance(instance) {
    if (!instance || !instance.root) return;
    const parent = this.root.parent;
    if (parent) {
      parent.remove(this.root);
    }
    this.root = instance.root;
    this.controller = instance.controller;
    this.modelKey = instance.modelKey;
    this.visuals = null;
    this.root.visible = this.isActive;
    if (this.isArmed && this.controller) {
      this.controller.equipWeapon();
    }
    this._updateTransform();
    if (parent) {
      parent.add(this.root);
    }
  }

  /**
   * Belirtilen düğüm veya kenarda yayayı aktif eder
   * @param {import('./SidewalkGraph.js').SidewalkNode} startNode
   * @param {import('./SidewalkGraph.js').SidewalkEdge} initialEdge
   */
  spawn(startNode, initialEdge) {
    this.isActive = true;
    this.root.visible = true;

    this.position.copy(startNode.position);
    this.currentEdge = initialEdge;
    this.targetNode = initialEdge ? initialEdge.toNode : startNode;
    this.distanceOnEdge = 0;

    if (this.currentEdge) {
      this.heading = Math.atan2(this.currentEdge.direction.x, this.currentEdge.direction.z);
      this.targetHeading = this.heading;
    }

    this.state = PedestrianState.WALKING;
    this.speed = this.baseWalkSpeed;
    this.stateTimer = 0;

    // ADIM 10: Çete ve Bölge Ataması
    const zone = gangTerritoryManager.getZoneAt(this.position.x, this.position.z);
    this.faction = gangTerritoryManager.getRandomFactionForZone(zone.id);
    this.isArmed = (this.faction !== Faction.CIVILIAN && Math.random() < 0.35);
    this.combatTarget = null;
    this.combatTimer = 0;
    this.shootCooldown = 0;
    this.greetCooldown = 0;

    // Prosedürel tişört rengi güncellemesi
    if (this.visuals && this.visuals.torso) {
      if (this.faction === Faction.GROVE) {
        this.visuals.torso.material.color.setHex(0x2e7d32); // Grove Yeşili
      } else if (this.faction === Faction.BALLAS) {
        this.visuals.torso.material.color.setHex(0x6a1b9a); // Ballas Moru
      }
    }

    // 3D GLB Model controller silah donatımı
    if (this.controller && this.isArmed) {
      this.controller.equipWeapon();
    }

    this._updateTransform();
  }

  despawn() {
    this.isActive = false;
    this.isWarEnemy = false;
    this.root.visible = false;
    this.currentEdge = null;
    this.targetNode = null;
    this.speed = 0;
    this.state = PedestrianState.IDLE;
  }

  /**
   * Tehdit algılandığında kaçış durumuna geçer
   * @param {THREE.Vector3} threatPos
   * @param {THREE.Vector3} threatVelocity
   */
  triggerFlee(threatPos, threatVelocity = null) {
    if (this.state === PedestrianState.KNOCKED_DOWN) return;

    this.state = PedestrianState.FLEEING;
    this.stateTimer = 0;
    this.fleeDuration = 2.5 + Math.random() * 1.5;

    // Tehditten zıt yöne kaç
    this.fleeDirection.subVectors(this.position, threatPos);
    this.fleeDirection.y = 0;

    if (this.fleeDirection.lengthSq() < 0.01) {
      this.fleeDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5);
    }
    this.fleeDirection.normalize();

    // Aracın gidiş yönüne dik kaçış payı ekle (yan kaldırıma sıçrama)
    if (threatVelocity && threatVelocity.lengthSq() > 1.0) {
      const threatFwd = this._tempVec.copy(threatVelocity).normalize();
      const perp = new THREE.Vector3(-threatFwd.z, 0, threatFwd.x);
      // Hangi taraf yayaya daha yakınsa o tarafa meyil et
      const sideDot = this.fleeDirection.dot(perp);
      if (sideDot < 0) perp.negate();
      this.fleeDirection.addScaledVector(perp, 0.8).normalize();
    }

    this.targetHeading = Math.atan2(this.fleeDirection.x, this.fleeDirection.z);
    this.speed = this.baseRunSpeed;
  }

  /**
   * Her simülasyon adımında yayanın FSM ve hareketini günceller
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {Object} [playerVeh=null]
   * @param {Array<Object>} [npcVehicles=null]
   * @param {import('./SidewalkGraph.js').SidewalkGraph} sidewalkGraph
   * @param {boolean} [isDetailedLod=true]
   */
  update(delta, playerPos, playerVeh = null, npcVehicles = null, sidewalkGraph = null, isDetailedLod = true) {
    if (!this.isActive) return;

    // 1. Tehdit Taraması (Yaklaşan Araçlar veya Hızlı Oyuncu)
    this._checkThreats(playerPos, playerVeh, npcVehicles);

    // ADIM 10: Çete Tehdit ve Etkileşim Taraması (Grove vs Ballas vs CJ)
    this._scanForGangThreats(delta, playerPos);

    // 2. Durum Makinesi (State Machine)
    switch (this.state) {
      case PedestrianState.IDLE:
        this._updateIdle(delta, sidewalkGraph);
        break;

      case PedestrianState.WALKING:
        this._updateWalking(delta, sidewalkGraph, false);
        break;

      case PedestrianState.CROSSING:
        this._updateWalking(delta, sidewalkGraph, true);
        break;

      case PedestrianState.FLEEING:
        this._updateFleeing(delta, sidewalkGraph);
        break;

      case PedestrianState.STUMBLING:
        this._updateStumbling(delta);
        break;

      case PedestrianState.KNOCKED_DOWN:
        this._updateKnockedDown(delta, sidewalkGraph);
        break;

      case PedestrianState.GETTING_UP:
        this._updateGettingUp(delta, sidewalkGraph);
        break;

      case PedestrianState.CONFRONTING:
        this._updateConfronting(delta, playerPos);
        break;

      case PedestrianState.BRAWL_MELEE:
        this._updateBrawlMelee(delta, playerPos);
        break;

      case PedestrianState.COMBAT_RANGED:
        this._updateCombatRanged(delta, playerPos);
        break;

      case PedestrianState.TAUNTING:
        this._updateTaunting(delta, sidewalkGraph);
        break;
    }

    // 3. Yön (Heading) Yumuşatması
    this.heading = THREE.MathUtils.damp(this.heading, this.targetHeading, 10, delta);

    // 4. Zemin Kotu & Dönüşüm Güncellemesi (Havalanmış balistik düşüş hariç zemine hizalar)
    if (this.terrain && typeof this.terrain.getElevation === 'function') {
      const surfaceElev = this.terrain.getElevation(this.position.x, this.position.z);
      const isRoadLevel = (this.state === PedestrianState.CROSSING);
      const targetY = surfaceElev + (isRoadLevel ? 0.06 : 0.14);
      if (this.state !== PedestrianState.KNOCKED_DOWN || !this.isAirborne) {
        this.position.y = THREE.MathUtils.damp(this.position.y, targetY, 12, delta);
      }
    }

    this._updateTransform();

    // 5. Animasyon Güncellemesi (GLB Model Controller veya Prosedürel Küp Fallback)
    if (this.controller) {
      // Kinematik Adım Senkronizasyonu (L_stride ~ 0.71m -> animSpeed = 2*PI / 1.42 * speed = 4.42 * speed)
      const animSpeed = (this.speed > 0.1) ? this.speed * 4.42 : 1.8;
      this.animPhase += animSpeed * delta;
      const lodDist = playerPos ? this.position.distanceTo(playerPos) : 0;
      const stateProgress = (this.state === PedestrianState.GETTING_UP)
        ? Math.min(1.0, this.stateTimer / this.gettingUpDuration)
        : 0;
      this.controller.update(delta, this.speed, this.state, this.animPhase, lodDist, stateProgress, this.tumblePitch);
    } else {
      this._updateProceduralAnimation(delta);
    }
  }

  /**
   * Mesafe bazlı LOD seviyesini ayarlar (0: tam detay ve gölgeler, 1: gölgesiz)
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

  _checkThreats(playerPos, playerVeh, npcVehicles) {
    if (this.state === PedestrianState.FLEEING || this.state === PedestrianState.KNOCKED_DOWN || this.state === PedestrianState.GETTING_UP) return;

    // A) Oyuncu Araçla Yaklaşıyorsa veya Çarptıysa
    if (playerVeh && playerVeh.position) {
      const vehSpeed = playerVeh.speed !== undefined ? Math.abs(playerVeh.speed) : 0;
      this._tempVec.subVectors(this.position, playerVeh.position);
      const dist = this._tempVec.length();

      let fwd = null;
      if (playerVeh.getForwardVector) {
        fwd = playerVeh.getForwardVector();
      } else if (playerVeh.direction) {
        fwd = playerVeh.direction;
      }

      // Doğrudan Çarpışma Teması (< 2.3m ve hız > 1.8 m/s)
      if (dist < 2.3 && vehSpeed > 1.8) {
        this.onVehicleImpact(playerVeh.position, fwd, vehSpeed);
        return;
      }

      if (dist < 14.0 && vehSpeed > 3.0 && fwd) {
        this._tempVec.normalize();
        const dot = this._tempVec.dot(fwd);
        if (dot > 0.45) { // Araç yayaya doğru geliyor!
          this.triggerFlee(playerVeh.position, fwd);
          return;
        }
      }
    }

    // B) Oyuncu Koşarak Yayaya Çok Yaklaştıysa (< 2.2m)
    if (playerPos) {
      const distSq = this.position.distanceToSquared(playerPos);
      if (distSq < 2.2 * 2.2) {
        this.triggerFlee(playerPos);
        return;
      }
    }

    // C) NPC Araçlar Yaklaştıysa veya Çarptıysa
    if (npcVehicles && npcVehicles.length > 0) {
      for (let i = 0; i < npcVehicles.length; i++) {
        const npc = npcVehicles[i];
        if (!npc || npc.speed < 1.8) continue;

        this._tempVec.subVectors(this.position, npc.position);
        const dist = this._tempVec.length();

        // NPC ile Doğrudan Çarpışma
        if (dist < 2.3) {
          const npcFwd = new THREE.Vector3(Math.sin(npc.heading), 0, Math.cos(npc.heading));
          this.onVehicleImpact(npc.position, npcFwd, npc.speed);
          return;
        }

        if (dist < 10.0) {
          this._tempVec.normalize();
          const fwdX = Math.sin(npc.heading);
          const fwdZ = Math.cos(npc.heading);
          const dot = this._tempVec.x * fwdX + this._tempVec.z * fwdZ;
          if (dot > 0.5) {
            this.triggerFlee(npc.position);
            return;
          }
        }
      }
    }
  }

  _updateIdle(delta, sidewalkGraph) {
    this.speed = 0;
    this.stateTimer += delta;

    if (this.stateTimer >= this.idleDuration) {
      // Bekleme bitti, yürümeye geç
      this.stateTimer = 0;
      if (this.targetNode && sidewalkGraph) {
        const nextEdge = sidewalkGraph.getNextEdge(this.currentEdge, this.targetNode);
        if (nextEdge) {
          this.currentEdge = nextEdge;
          this.targetNode = nextEdge.toNode;
          this.distanceOnEdge = 0;
          this.state = nextEdge.isCrosswalk ? PedestrianState.CROSSING : PedestrianState.WALKING;
          this.speed = this.baseWalkSpeed;
        }
      }
    }
  }

  _updateWalking(delta, sidewalkGraph, isCrossing = false) {
    if (!this.currentEdge || !this.targetNode) {
      this.state = PedestrianState.IDLE;
      this.idleDuration = 1.0;
      return;
    }

    this.speed = isCrossing ? this.baseWalkSpeed * 1.25 : this.baseWalkSpeed;

    // Hedef yöne bak
    const dir = this.currentEdge.direction;
    this.targetHeading = Math.atan2(dir.x, dir.z);

    // İlerle
    this.distanceOnEdge += this.speed * delta;
    this.position.x = this.currentEdge.fromNode.position.x + dir.x * this.distanceOnEdge;
    this.position.z = this.currentEdge.fromNode.position.z + dir.z * this.distanceOnEdge;

    // Düğüme ulaşıldı mı?
    if (this.distanceOnEdge >= this.currentEdge.length) {
      const arrivedNode = this.targetNode;
      this.position.x = arrivedNode.position.x;
      this.position.z = arrivedNode.position.z;

      // Küçük olasılıkla (%25) durup çevreye baksın (sadece normal kaldırımda ise)
      if (!isCrossing && Math.random() < 0.25) {
        this.state = PedestrianState.IDLE;
        this.idleDuration = 1.5 + Math.random() * 2.5;
        this.stateTimer = 0;
        return;
      }

      // Yeni kenar seç
      if (sidewalkGraph) {
        const nextEdge = sidewalkGraph.getNextEdge(this.currentEdge, arrivedNode);
        if (nextEdge) {
          this.currentEdge = nextEdge;
          this.targetNode = nextEdge.toNode;
          this.distanceOnEdge = 0;
          this.state = nextEdge.isCrosswalk ? PedestrianState.CROSSING : PedestrianState.WALKING;
        } else {
          // Geri dön
          this.state = PedestrianState.IDLE;
          this.idleDuration = 1.0;
        }
      }
    }
  }

  _updateFleeing(delta, sidewalkGraph) {
    this.stateTimer += delta;
    this.speed = this.baseRunSpeed;

    // Kaçış vektörü boyunca koş
    this.position.x += this.fleeDirection.x * this.speed * delta;
    this.position.z += this.fleeDirection.z * this.speed * delta;
    this.targetHeading = Math.atan2(this.fleeDirection.x, this.fleeDirection.z);

    // Kaçış süresi dolduğunda en yakın kaldırım düğümünü bul ve normal yürüyüşe dön
    if (this.stateTimer >= this.fleeDuration) {
      this.stateTimer = 0;
      if (sidewalkGraph) {
        const nearest = sidewalkGraph.findNearestNode(this.position, 30);
        if (nearest && nearest.outgoingEdges.length > 0) {
          const edge = nearest.outgoingEdges[0];
          this.currentEdge = edge;
          this.targetNode = edge.toNode;
          this.distanceOnEdge = 0;
          this.state = PedestrianState.WALKING;
          this.speed = this.baseWalkSpeed;
          return;
        }
      }
      this.state = PedestrianState.WALKING;
      this.speed = this.baseWalkSpeed;
    }
  }

  /**
   * Araç çarptığında balistik kinetik itme, ses ve durum değişimini tetikler (ADIM 9)
   * @param {THREE.Vector3} vehPos - Aracın konumu
   * @param {THREE.Vector3|null} vehVel - Aracın hız/yön vektörü
   * @param {number} vehSpeed - Aracın büyüklük hızı (m/s)
   */
  onVehicleImpact(vehPos, vehVel, vehSpeed) {
    if (this.state === PedestrianState.KNOCKED_DOWN || this.state === PedestrianState.GETTING_UP) return;

    // 1. Çarpma Yönü Vektörü (Araçtan yayaya doğru)
    this._tempVec.copy(this.position).sub(vehPos);
    this._tempVec.y = 0;
    if (this._tempVec.lengthSq() < 0.001) {
      this._tempVec.set(0, 0, 1);
    } else {
      this._tempVec.normalize();
    }

    // 2. Darbe Açısı (Önden mi arkadan mı çarpıldı?)
    const pedFwdX = Math.sin(this.heading);
    const pedFwdZ = Math.cos(this.heading);
    const dot = this._tempVec.x * pedFwdX + this._tempVec.z * pedFwdZ;
    this.tumblePitch = (dot < 0) ? -Math.PI / 2 : Math.PI / 2;

    const kmh = vehSpeed * 3.6;

    if (kmh < 15) {
      // A) HAFİF TEMAS / SÜRTME (< 15 km/s) -> STUMBLING
      this.state = PedestrianState.STUMBLING;
      this.stateTimer = 0;
      this.speed = 0;
      this.impulseVelocity.copy(this._tempVec).multiplyScalar(2.4);
      this.isAirborne = false;
      this.verticalVelocity = 0;

      pedestrianAudio.playHitThud(this.position, 0.6);
      if (Math.random() > 0.4) {
        pedestrianAudio.playScream(this.position);
      }
    } else {
      // B) ORTA VEYA YÜKSEK ŞİDDETLİ DARBE (>= 15 km/s) -> KNOCKED_DOWN
      this.state = PedestrianState.KNOCKED_DOWN;
      this.stateTimer = 0;
      this.speed = 0;

      // Kinetik İtme Hesaplaması
      const impulseScale = Math.min(18.0, vehSpeed * 0.72);
      this.impulseVelocity.copy(this._tempVec).multiplyScalar(impulseScale);

      // Dikey Sıçrama (Balistik Havalanma)
      this.verticalVelocity = Math.min(5.2, 2.0 + vehSpeed * 0.16);
      this.isAirborne = true;

      // Sesler
      const intensity = Math.min(2.5, vehSpeed / 10);
      pedestrianAudio.playHitThud(this.position, intensity);
      pedestrianAudio.playScream(this.position);

      // Suç Bildirimi (Wanted Level)
      if (window.app?.wantedManager) {
        window.app.wantedManager.reportCrime('PEDESTRIAN_HIT');
      }

      // Çete Savaşı Provokasyon Bildirimi (ADIM 11)
      if (window.app?.gangWarManager) {
        window.app.gangWarManager.onPedestrianHarm(this, 'vehicle');
      }

      // Çevre Yayalarda Panik Dalgası (Crowd Panic)
      if (this.manager) {
        this.manager.triggerCrowdPanic(this.position, 22.0);
      }
    }
  }

  _updateStumbling(delta) {
    this.stateTimer += delta;
    this.speed = 0;

    // Sendeleme itme sönümlemesi
    this.position.x += this.impulseVelocity.x * delta;
    this.position.z += this.impulseVelocity.z * delta;
    this.impulseVelocity.multiplyScalar(Math.max(0, 1 - 4.5 * delta));

    if (this.stateTimer >= this.stumbleDuration) {
      // Sendeleme bitti, panikle kaçışa geç
      this.state = PedestrianState.FLEEING;
      this.stateTimer = 0;
      this.speed = this.baseRunSpeed;
      this.fleeDirection.copy(this._tempVec);
    }
  }

  _updateKnockedDown(delta, sidewalkGraph) {
    this.speed = 0;
    this.stateTimer += delta;

    if (!this.controller) {
      this.root.rotation.x = this.tumblePitch;
    }

    let groundY = 0.14;
    if (this.terrain && typeof this.terrain.getElevation === 'function') {
      groundY = this.terrain.getElevation(this.position.x, this.position.z) + 0.12;
    }

    if (this.isAirborne) {
      // Balistik Hareket: Yerçekimi ve yatay sürüklenme
      this.verticalVelocity -= 18.0 * delta;
      this.position.y += this.verticalVelocity * delta;

      this.position.x += this.impulseVelocity.x * delta;
      this.position.z += this.impulseVelocity.z * delta;
      this.impulseVelocity.multiplyScalar(Math.max(0, 1 - 1.8 * delta));

      if (this.position.y <= groundY) {
        this.position.y = groundY;
        this.isAirborne = false;
        this.verticalVelocity = 0;
        // Asfalta ilk çarpma sekmesi
        pedestrianAudio.playHitThud(this.position, 0.4);
      }
    } else {
      // Asfaltta sürtünerek durma
      this.position.y = groundY;
      if (this.impulseVelocity.lengthSq() > 0.01) {
        this.position.x += this.impulseVelocity.x * delta;
        this.position.z += this.impulseVelocity.z * delta;
        this.impulseVelocity.multiplyScalar(Math.max(0, 1 - 6.5 * delta));
      }
    }

    if (this.stateTimer >= this.knockedDownDuration && !this.isAirborne) {
      // Ayağa kalkış durumuna geç
      this.state = PedestrianState.GETTING_UP;
      this.stateTimer = 0;
    }
  }

  _updateGettingUp(delta, sidewalkGraph) {
    this.speed = 0;
    this.stateTimer += delta;
    const progress = Math.min(1.0, this.stateTimer / this.gettingUpDuration);

    if (!this.controller) {
      this.root.rotation.x = THREE.MathUtils.lerp(this.tumblePitch, 0, progress);
    }

    if (this.stateTimer >= this.gettingUpDuration) {
      // Ayağa kalktı, panikle kaçışa başla
      if (!this.controller) {
        this.root.rotation.x = 0;
      }
      this.state = PedestrianState.FLEEING;
      this.speed = this.baseRunSpeed;
      this.stateTimer = 0;
      this.fleeDuration = 4.0;
      this.fleeDirection.set(Math.random() - 0.5, 0, Math.random() - 0.5).normalize();
    }
  }

  /**
   * Çete üyeleri için yakındaki dost/düşman ve oyuncu taraması
   */
  _scanForGangThreats(delta, playerPos) {
    if (this.faction === Faction.CIVILIAN) return;
    if (this.state === PedestrianState.FLEEING ||
        this.state === PedestrianState.KNOCKED_DOWN ||
        this.state === PedestrianState.GETTING_UP ||
        this.state === PedestrianState.CONFRONTING ||
        this.state === PedestrianState.BRAWL_MELEE ||
        this.state === PedestrianState.COMBAT_RANGED ||
        this.state === PedestrianState.TAUNTING) return;

    this.greetCooldown = Math.max(0, this.greetCooldown - delta);
    this.scanCooldown -= delta;
    if (this.scanCooldown > 0) return;
    this.scanCooldown = 0.35 + Math.random() * 0.25;

    // 1. Oyuncu (CJ) Etkileşimi
    if (playerPos) {
      const distToPlayer = this.position.distanceTo(playerPos);
      if (this.faction === Faction.GROVE) {
        // Grove üyesi CJ'i 7 metre içinde görünce dostça selam verir
        if (distToPlayer < 7.0 && this.greetCooldown <= 0) {
          pedestrianAudio.playGangGreeting(this.position);
          this.greetCooldown = 18.0;
        }
      } else if (this.faction === Faction.BALLAS) {
        // Ballas üyesi CJ'i 11m içinde görünce tehdit algılar ve sataşır
        if (distToPlayer < 11.0) {
          this.combatTarget = 'player';
          this.state = PedestrianState.CONFRONTING;
          this.stateTimer = 0;
          this.speed = 0;
          pedestrianAudio.playGangTaunt(this.position, 'BALLAS');
          this.targetHeading = Math.atan2(playerPos.x - this.position.x, playerPos.z - this.position.z);
          return;
        }
      }
    }

    // 2. Karşı Çete Üyesi Taraması (Grove vs Ballas)
    if (this.manager && this.manager.pool) {
      const enemyFaction = (this.faction === Faction.GROVE) ? Faction.BALLAS : Faction.GROVE;
      let closestEnemy = null;
      let closestDistSq = 14.0 * 14.0;

      for (let i = 0; i < this.manager.pool.length; i++) {
        const other = this.manager.pool[i];
        if (!other.isActive || other === this) continue;
        if (other.state === PedestrianState.KNOCKED_DOWN || other.state === PedestrianState.GETTING_UP) continue;
        if (other.faction === enemyFaction) {
          const dSq = this.position.distanceToSquared(other.position);
          if (dSq < closestDistSq) {
            closestDistSq = dSq;
            closestEnemy = other;
          }
        }
      }

      if (closestEnemy) {
        this.combatTarget = closestEnemy;
        this.state = PedestrianState.CONFRONTING;
        this.stateTimer = 0;
        this.speed = 0;
        pedestrianAudio.playGangTaunt(this.position, this.faction);
        this.targetHeading = Math.atan2(closestEnemy.position.x - this.position.x, closestEnemy.position.z - this.position.z);

        // Karşı çete üyesi de karşılık versin
        if (closestEnemy.state !== PedestrianState.CONFRONTING &&
            closestEnemy.state !== PedestrianState.BRAWL_MELEE &&
            closestEnemy.state !== PedestrianState.COMBAT_RANGED) {
          closestEnemy.combatTarget = this;
          closestEnemy.state = PedestrianState.CONFRONTING;
          closestEnemy.stateTimer = 0;
          closestEnemy.speed = 0;
          closestEnemy.targetHeading = Math.atan2(this.position.x - closestEnemy.position.x, this.position.z - closestEnemy.position.z);
        }
      }
    }
  }

  _updateConfronting(delta, playerPos) {
    this.speed = 0;
    this.stateTimer += delta;

    let targetPos = null;
    if (this.combatTarget === 'player') {
      targetPos = playerPos;
    } else if (this.combatTarget && this.combatTarget.isActive) {
      targetPos = this.combatTarget.position;
    }

    if (!targetPos || this.position.distanceTo(targetPos) > 22.0) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      return;
    }

    this.targetHeading = Math.atan2(targetPos.x - this.position.x, targetPos.z - this.position.z);

    // 1.8 saniye sataşmadan sonra çatışmaya geç
    if (this.stateTimer >= 1.8) {
      this.stateTimer = 0;
      this.shootCooldown = 0.5 + Math.random() * 0.5;
      if (this.isArmed) {
        this.state = PedestrianState.COMBAT_RANGED;
      } else {
        this.state = PedestrianState.BRAWL_MELEE;
      }
    }
  }

  _updateBrawlMelee(delta, playerPos) {
    let targetPos = null;
    let targetObj = null;
    if (this.combatTarget === 'player') {
      targetPos = playerPos;
    } else if (this.combatTarget && this.combatTarget.isActive) {
      targetObj = this.combatTarget;
      targetPos = targetObj.position;
    }

    if (!targetPos) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      return;
    }

    // Hedef yere serildiyse alay et
    if (targetObj && (targetObj.state === PedestrianState.KNOCKED_DOWN || targetObj.state === PedestrianState.GETTING_UP)) {
      this.state = PedestrianState.TAUNTING;
      this.stateTimer = 0;
      this.speed = 0;
      return;
    }

    this._tempVec.subVectors(targetPos, this.position);
    this._tempVec.y = 0;
    const dist = this._tempVec.length();

    if (dist > 18.0) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      return;
    }

    this.targetHeading = Math.atan2(this._tempVec.x, this._tempVec.z);

    if (dist > 1.8) {
      this.speed = this.baseRunSpeed * 0.85;
      this._tempVec.normalize();
      this.position.addScaledVector(this._tempVec, this.speed * delta);
    } else {
      this.speed = 0;
      // Yumruk vurma periyodu
      this.shootCooldown -= delta;
      if (this.shootCooldown <= 0) {
        this.shootCooldown = 0.85;
        pedestrianAudio.playPunch3D(this.position);
        if (targetObj && targetObj.takeDamage) {
          targetObj.takeDamage(20, this.position);
        }
      }
    }
  }

  _updateCombatRanged(delta, playerPos) {
    let targetPos = null;
    let targetObj = null;
    if (this.combatTarget === 'player') {
      targetPos = playerPos;
    } else if (this.combatTarget && this.combatTarget.isActive) {
      targetObj = this.combatTarget;
      targetPos = targetObj.position;
    }

    if (!targetPos) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      return;
    }

    // Hedef düştüyse zafer duruşu
    if (targetObj && (targetObj.state === PedestrianState.KNOCKED_DOWN || targetObj.state === PedestrianState.GETTING_UP)) {
      this.state = PedestrianState.TAUNTING;
      this.stateTimer = 0;
      this.speed = 0;
      return;
    }

    this._tempVec.subVectors(targetPos, this.position);
    this._tempVec.y = 0;
    const dist = this._tempVec.length();

    if (dist > 25.0) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      return;
    }

    this.targetHeading = Math.atan2(this._tempVec.x, this._tempVec.z);

    // 6m - 12m menzil koruma
    if (dist > 12.0) {
      this.speed = 1.8;
      this._tempVec.normalize();
      this.position.addScaledVector(this._tempVec, this.speed * delta);
    } else if (dist < 4.0) {
      this.speed = 1.4;
      this._tempVec.normalize();
      this.position.addScaledVector(this._tempVec, -this.speed * delta); // Geri çekil
    } else {
      this.speed = 0;
    }

    // Ateş etme döngüsü
    this.shootCooldown -= delta;
    if (this.shootCooldown <= 0) {
      this.shootCooldown = 1.2 + Math.random() * 0.9;
      pedestrianAudio.playGunshot3D(this.position);

      // %65 isabet şansı
      if (Math.random() < 0.65) {
        if (targetObj && targetObj.takeBulletHit) {
          targetObj.takeBulletHit(this.position);
        }
      }
    }
  }

  _updateTaunting(delta, sidewalkGraph) {
    this.speed = 0;
    this.stateTimer += delta;

    if (this.stateTimer >= 2.5) {
      this.state = PedestrianState.WALKING;
      this.combatTarget = null;
      this.speed = this.baseWalkSpeed;
    }
  }

  /**
   * Mermi isabet ettiğinde balistik yere savrulma
   */
  takeBulletHit(attackerPos) {
    if (this.state === PedestrianState.KNOCKED_DOWN || this.state === PedestrianState.GETTING_UP) return;

    this._tempVec.copy(this.position).sub(attackerPos);
    this._tempVec.y = 0;
    if (this._tempVec.lengthSq() < 0.001) this._tempVec.set(0, 0, 1);
    this._tempVec.normalize();

    this.tumblePitch = Math.PI / 2;
    this.impulseVelocity.copy(this._tempVec).multiplyScalar(4.8);
    this.verticalVelocity = 2.0;
    this.isAirborne = true;
    this.state = PedestrianState.KNOCKED_DOWN;
    this.stateTimer = 0;
    this.knockedDownDuration = 3.2;

    pedestrianAudio.playScream(this.position);
    if (this.manager) {
      this.manager.triggerCrowdPanic(this.position, 18);
    }

    // Çete Savaşı Bildirimi (ADIM 11)
    if (window.app?.gangWarManager) {
      window.app.gangWarManager.onPedestrianHarm(this, 'player');
    }
  }

  /**
   * Yumruk darbesi aldığında sendeleme
   */
  takeDamage(amount, attackerPos) {
    if (this.state === PedestrianState.KNOCKED_DOWN || this.state === PedestrianState.GETTING_UP) return;

    this.state = PedestrianState.STUMBLING;
    this.stateTimer = 0;
    this.stumbleDuration = 0.85;
    pedestrianAudio.playPunch3D(this.position);

    // Çete Savaşı Bildirimi (ADIM 11)
    if (window.app?.gangWarManager) {
      window.app.gangWarManager.onPedestrianHarm(this, 'player');
    }
  }

  _updateProceduralAnimation(delta) {
    const isMoving = (this.speed > 0.1);

    if (isMoving) {
      const animSpeed = this.speed * 4.5;
      this.animPhase += animSpeed * delta;

      const armSwing = Math.sin(this.animPhase) * 0.55;
      const legSwing = Math.sin(this.animPhase) * 0.65;

      // Zıt kol ve bacak salınımı (Doğal dış açı ile gövdeye sürtünmeyi önler)
      this.visuals.leftArmPivot.rotation.x = -armSwing;
      this.visuals.leftArmPivot.rotation.z = -0.06;
      this.visuals.rightArmPivot.rotation.x = armSwing;
      this.visuals.rightArmPivot.rotation.z = 0.06;
      this.visuals.leftLegPivot.rotation.x = legSwing;
      this.visuals.rightLegPivot.rotation.x = -legSwing;

      // Gövde hafif dikey yaylanma
      this.visuals.torso.position.y = 1.06 + Math.abs(Math.sin(this.animPhase * 2)) * 0.04;
    } else {
      // IDLE nefes alma salınımı
      this.animPhase += 1.8 * delta;
      const breathe = Math.sin(this.animPhase) * 0.05;

      this.visuals.leftArmPivot.rotation.x = THREE.MathUtils.damp(this.visuals.leftArmPivot.rotation.x, breathe, 8, delta);
      this.visuals.leftArmPivot.rotation.z = -0.06;
      this.visuals.rightArmPivot.rotation.x = THREE.MathUtils.damp(this.visuals.rightArmPivot.rotation.x, -breathe, 8, delta);
      this.visuals.rightArmPivot.rotation.z = 0.06;
      this.visuals.leftLegPivot.rotation.x = THREE.MathUtils.damp(this.visuals.leftLegPivot.rotation.x, 0, 8, delta);
      this.visuals.rightLegPivot.rotation.x = THREE.MathUtils.damp(this.visuals.rightLegPivot.rotation.x, 0, 8, delta);
      this.visuals.torso.position.y = 1.06;
    }
  }

  _updateTransform() {
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
  }
}

/**
 * PedestrianManager - Yaya Orkestratörü, Havuzlama (Pooling) ve Mesafe Yönetimi
 */
export class PedestrianManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('./SidewalkGraph.js').SidewalkGraph} sidewalkGraph
   * @param {Object} [terrainManager=null]
   */
  constructor(scene, sidewalkGraph, terrainManager = null, assetManager = null) {
    this.scene = scene;
    this.sidewalkGraph = sidewalkGraph;
    this.terrain = terrainManager;
    this.assetManager = assetManager;

    this.group = new THREE.Group();
    this.group.name = 'PedestrianManagerGroup';
    if (this.scene) {
      this.scene.add(this.group);
    }

    /** @type {Pedestrian[]} */
    this.pool = [];
    this.maxPedestrians = 16; // Çete savaşları ve sokak kalabalığı için 16 yaya havuzu

    // Mesafe Eşikleri (metre)
    this.spawnMinDist = 18;
    this.spawnMaxDist = 65;
    this.despawnDistSq = 85 * 85;
    this.detailedLodDistSq = 42 * 42;

    // TrafficManager engelleri için önbellek listesi
    /** @type {Array<{ position: THREE.Vector3 }>} */
    this._obstacleList = [];

    if (this.sidewalkGraph && this.sidewalkGraph.nodes.size > 0) {
      this.initPool();
    }

    if (this.assetManager) {
      this.loadGLBModels(this.assetManager);
    }
  }

  /**
   * GLB Yaya Modellerini Arka Planda Yükler ve Havuzdaki Yayaları 3D Modellere Dönüştürür
   * @param {import('../assets/AssetManager.js').AssetManager} assetManager
   */
  async loadGLBModels(assetManager) {
    try {
      const loaded = await pedestrianModelCatalog.loadCatalog(assetManager);
      if (loaded) {
        this.upgradePoolToGLB();
      }
    } catch (err) {
      console.warn('⚠️ [PedestrianManager] GLB yaya modelleri yüklenemedi, prosedürel modeller aktif kalacak:', err);
    }
  }

  upgradePoolToGLB() {
    let upgradedCount = 0;
    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i];
      const instance = pedestrianModelCatalog.instantiatePedestrian(ped.id);
      if (instance) {
        ped.setVisualInstance(instance);
        upgradedCount++;
      }
    }
    console.log(`🚶 [PedestrianManager] ${upgradedCount}/${this.pool.length} yaya otantik 3D GLB modellerine ve iskelet animasyonlarına yükseltildi.`);
  }

  /**
   * Sabit yaya havuzunu oluşturur
   */
  initPool() {
    for (let i = 0; i < this.maxPedestrians; i++) {
      const ped = new Pedestrian(i, this.terrain, this);
      this.group.add(ped.root);
      this.pool.push(ped);
    }

    // GEÇİCİ TEŞHİS LOGU (Görsel Triage)
    console.group('🚶 [PEDESTRIAN TRIAGE DEBUG] Pedestrian Pool & Rig Report');
    console.log('Rig Architecture: Procedural Hierarchical Pivot Groups (No loaded GLB / No SkinnedMesh)');
    console.log('Pedestrian Bone / Joint List:');
    console.log('  - Root: THREE.Group (PedestrianMesh)');
    console.log('  - Torso: THREE.Mesh (BoxGeometry 0.46 x 0.58 x 0.26, pos y=1.06)');
    console.log('  - Head: THREE.Mesh (BoxGeometry 0.24 x 0.26 x 0.24, pos y=1.48)');
    console.log('  - LeftArmPivot: THREE.Group (pos: [-0.28, 1.28, 0], rot: X/Z)');
    console.log('  - RightArmPivot: THREE.Group (pos: [0.28, 1.28, 0], rot: X/Z)');
    console.log('  - LeftLegPivot: THREE.Group (pos: [-0.12, 0.76, 0], rot: X)');
    console.log('  - RightLegPivot: THREE.Group (pos: [0.12, 0.76, 0], rot: X)');
    console.log('Animation System: Procedural FSM Waveform (No THREE.AnimationMixer clips)');
    const clipReport = this.pool.map((p, idx) => ({
      pedId: idx,
      activeState: p.state,
      isActive: p.isActive,
      activeClipName: 'Procedural_FSM_Waveform'
    }));
    if (console.table) console.table(clipReport);
    console.groupEnd();
  }

  /**
   * Her simülasyon adımında (Fixed Timestep) çağrılır
   * @param {number} delta
   * @param {THREE.Vector3} playerPos
   * @param {Object} [playerVeh=null]
   * @param {Array<Object>} [npcVehicles=null]
   */
  update(delta, playerPos, playerVeh = null, npcVehicles = null) {
    if (!playerPos || !this.sidewalkGraph || this.pool.length === 0) return;

    this._frameTick = (this._frameTick || 0) + 1;
    this._obstacleList.length = 0;

    // Araç Çarpışma Kontrolü (Oyuncu ve NPC araçları için)
    if (playerVeh) {
      this.checkVehicleCollisions(playerVeh);
    }
    if (npcVehicles && npcVehicles.length > 0) {
      for (let v = 0; v < npcVehicles.length; v++) {
        this.checkVehicleCollisions(npcVehicles[v]);
      }
    }

    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i];

      if (!ped.isActive) {
        // İnaktif yayayı oyuncunun etrafındaki uygun bir kaldırım düğümünde spawn et
        this._spawnPedestrian(ped, playerPos);
        continue;
      }

      // Oyuncudan aşırı uzaklaşan yayaları geri dönüştür (Recycle)
      const distSq = ped.position.distanceToSquared(playerPos);
      if (distSq > this.despawnDistSq && !ped.isWarEnemy) {
        this._recyclePedestrian(ped, playerPos);
        continue;
      }

      // Tick LOD & Throttling:
      // < 30m: LOD 0 (Tam detay, her frame, gölgeler ve animasyon)
      // 30m - 60m: LOD 1 (Gölgesiz, her 2 frame'de bir güncelleme, animasyon yok)
      // > 60m: LOD 2 (Gölgesiz, her 3 frame'de bir güncelleme, animasyon yok)
      if (distSq < 900) {
        ped.setLOD(0);
        ped.update(delta, playerPos, playerVeh, npcVehicles, this.sidewalkGraph, true);
      } else if (distSq < 3600) {
        ped.setLOD(1);
        if ((this._frameTick + i) % 2 === 0) {
          ped.update(delta * 2, playerPos, playerVeh, npcVehicles, this.sidewalkGraph, false);
        }
      } else {
        ped.setLOD(1);
        if ((this._frameTick + i) % 3 === 0) {
          ped.update(delta * 3, playerPos, playerVeh, npcVehicles, this.sidewalkGraph, false);
        }
      }

      // Trafik engeli listesine ekle (Özellikle yoldan geçenler ve yakın yayalar)
      this._obstacleList.push({ position: ped.position });
    }
  }

  _spawnPedestrian(ped, playerPos) {
    const node = this.sidewalkGraph.getRandomSpawnNode(playerPos, this.spawnMinDist, this.spawnMaxDist);
    if (!node || node.outgoingEdges.length === 0) return;

    const edge = node.outgoingEdges[Math.floor(Math.random() * node.outgoingEdges.length)];
    ped.spawn(node, edge);
  }

  _recyclePedestrian(ped, playerPos) {
    if (ped.isWarEnemy) return; // Çete savaşı düşmanları savaş bitene kadar despawn edilmez
    ped.despawn();
    this._spawnPedestrian(ped, playerPos);
  }

  /**
   * Çete Savaşı için düşman hücum timi oluşturur (ADIM 11)
   * @param {THREE.Vector3} epicenter
   * @param {number} count
   * @param {number} armedCount
   * @param {number} waveNum
   * @returns {Pedestrian[]}
   */
  spawnWarSquad(epicenter, count, armedCount, waveNum) {
    const squad = [];
    let allocated = 0;

    // 1. Önce inaktif yayaları tahsis et
    for (let i = 0; i < this.pool.length && allocated < count; i++) {
      const ped = this.pool[i];
      if (!ped.isActive) {
        squad.push(ped);
        allocated++;
      }
    }

    // 2. Havuzda yetersizse en uzaktaki normal yayaları dönüştür
    if (allocated < count) {
      for (let i = 0; i < this.pool.length && allocated < count; i++) {
        const ped = this.pool[i];
        if (!ped.isWarEnemy && !squad.includes(ped)) {
          squad.push(ped);
          allocated++;
        }
      }
    }

    // 3. Tim üyelerini merkez üssün etrafında taktiksel çemberde konumlandır
    for (let i = 0; i < squad.length; i++) {
      const ped = squad[i];
      const angle = (i / squad.length) * Math.PI * 2 + (Math.random() * 0.4 - 0.2);
      const radius = 24.0 + Math.random() * 14.0;

      const sx = epicenter.x + Math.cos(angle) * radius;
      const sz = epicenter.z + Math.sin(angle) * radius;

      ped.isActive = true;
      ped.root.visible = true;
      ped.position.set(sx, 0.14, sz);

      if (this.terrain && typeof this.terrain.getElevation === 'function') {
        ped.position.y = this.terrain.getElevation(sx, sz) + 0.14;
      }

      ped.faction = Faction.BALLAS;
      ped.isArmed = (i < armedCount);
      ped.isWarEnemy = true;
      ped.combatTarget = 'player';
      ped.combatTimer = 0;
      ped.shootCooldown = 0.6 + Math.random() * 0.8;
      ped.baseRunSpeed = 4.2 + (waveNum * 0.35);
      ped.speed = ped.baseRunSpeed;

      // Ballas rengi ve silah
      if (ped.visuals && ped.visuals.torso) {
        ped.visuals.torso.material.color.setHex(0x6a1b9a); // Ballas Moru
      }
      if (ped.controller && ped.isArmed) {
        ped.controller.equipWeapon();
      }

      // Saldırı durumuna geçir
      ped.state = ped.isArmed ? PedestrianState.COMBAT_RANGED : PedestrianState.BRAWL_MELEE;
      ped.targetHeading = Math.atan2(epicenter.x - sx, epicenter.z - sz);
      ped.heading = ped.targetHeading;
      ped._updateTransform();
    }

    return squad;
  }

  /**
   * Oyuncu veya araç korna çaldığında etraftaki yayaları kaçırır (P5 Uyumlu)
   * @param {THREE.Vector3} hornPos
   * @param {number} [hornRadius=28]
   */
  onVehicleHorn(hornPos, hornRadius = 28) {
    if (!hornPos) return;
    const rSq = hornRadius * hornRadius;
    let soundTriggered = false;
    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i];
      if (ped.isActive && ped.position.distanceToSquared(hornPos) < rSq) {
        ped.triggerFlee(hornPos);
        if (!soundTriggered && Math.random() > 0.3) {
          pedestrianAudio.playHornReaction(ped.position);
          soundTriggered = true;
        }
      }
    }
  }

  /**
   * Çarpışma noktasının etrafındaki yayaları panik dalgasına sokar (Crowd Panic)
   * @param {THREE.Vector3} epicenter
   * @param {number} [radius=22.0]
   */
  triggerCrowdPanic(epicenter, radius = 22.0) {
    if (!epicenter) return;
    const rSq = radius * radius;
    let screamTriggered = false;

    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i];
      if (!ped.isActive) continue;
      if (ped.state === PedestrianState.KNOCKED_DOWN || ped.state === PedestrianState.GETTING_UP) continue;

      const dSq = ped.position.distanceToSquared(epicenter);
      if (dSq < rSq) {
        this._tempVec.copy(ped.position).sub(epicenter);
        this._tempVec.y = 0;
        if (this._tempVec.lengthSq() < 0.01) {
          this._tempVec.set(Math.random() - 0.5, 0, Math.random() - 0.5);
        }
        this._tempVec.normalize();

        ped.state = PedestrianState.FLEEING;
        ped.stateTimer = 0;
        ped.fleeDuration = 3.5 + Math.random() * 2.0;
        ped.speed = ped.baseRunSpeed;
        ped.fleeDirection.copy(this._tempVec);

        if (!screamTriggered && Math.random() > 0.45) {
          pedestrianAudio.playScream(ped.position);
          screamTriggered = true;
        }
      }
    }
  }

  /**
   * Belirtilen araç ile yaya havuzu arasındaki fiziksel çarpışmaları test eder
   * @param {Object} vehicle - VehicleManager.activeVehicle veya NPC araç
   */
  checkVehicleCollisions(vehicle) {
    if (!vehicle || !vehicle.position) return;

    const vehPos = vehicle.position;
    const vehSpeed = (vehicle.speed !== undefined) ? Math.abs(vehicle.speed) : 0;
    if (vehSpeed < 1.5) return;

    let vehVelocity = null;
    if (vehicle.getForwardVector) {
      vehVelocity = vehicle.getForwardVector().clone().multiplyScalar(vehicle.speed || vehSpeed);
    } else if (vehicle.heading !== undefined) {
      vehVelocity = new THREE.Vector3(Math.sin(vehicle.heading), 0, Math.cos(vehicle.heading)).multiplyScalar(vehSpeed);
    }

    const collisionRadiusSq = 2.3 * 2.3;

    for (let i = 0; i < this.pool.length; i++) {
      const ped = this.pool[i];
      if (!ped.isActive) continue;
      if (ped.state === PedestrianState.KNOCKED_DOWN || ped.state === PedestrianState.GETTING_UP) continue;

      const dSq = ped.position.distanceToSquared(vehPos);
      if (dSq < collisionRadiusSq) {
        ped.onVehicleImpact(vehPos, vehVelocity, vehSpeed);
      }
    }
  }

  /**
   * TrafficManager için yaya engellerini döndürür (Sıfır GC)
   * @returns {Array<{ position: THREE.Vector3 }>}
   */
  getObstacles() {
    return this._obstacleList;
  }

  destroy() {
    for (let i = 0; i < this.pool.length; i++) {
      this.pool[i].despawn();
    }
    if (this.group && this.scene) {
      this.scene.remove(this.group);
    }
    this.pool = [];
    this._obstacleList = [];
  }
}
