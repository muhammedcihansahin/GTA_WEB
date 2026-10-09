import * as THREE from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

/**
 * Model Tipleri ve Desteklenen Mafsal Mimarileri
 */
export const PedModelType = {
  EMBEDDED_MIXER: 'EMBEDDED_MIXER',     // Gömülü AnimationMixer klibi (character.glb)
  HIERARCHICAL: 'HIERARCHICAL',         // Orijinal GTA III mafsal hiyerarşisi (claude)
  BIPED_RIG: 'BIPED_RIG',               // 3ds Max Biped Skinned Rig (mellstroy)
  RIGIFY_SKINNED: 'RIGIFY_SKINNED',     // Blender Rigify Skinned Rig (man_dressed_in_suit)
  RIGID_ZUP: 'RIGID_ZUP'                // Tek parça Z-Up model (cop, michael, tracey)
};

/**
 * Desteklenen 3D GLB Yaya Karakter Tanımları
 */
export const PEDESTRIAN_MODEL_CONFIGS = [
  {
    key: 'claude',
    name: 'Claude Speed (GTA III)',
    path: 'glbler/charachters/claude_speed_gta_iii_2001_pc.glb',
    type: PedModelType.HIERARCHICAL,
    targetHeight: 1.82,
    rotX: 0,
    armPitchAxis: new THREE.Vector3(-1, 0, 0),
    legPitchAxis: new THREE.Vector3(-1, 0, 0),
    jointNames: {
      leftArm: 'Supperarml',
      leftForeArm: 'Slowerarml',
      rightArm: 'Supperarmr',
      rightForeArm: 'Slowerarmr',
      leftLeg: 'Supperlegl',
      leftLowerLeg: 'Slowerlegl',
      rightLeg: 'Supperlegr',
      rightLowerLeg: 'Slowerlegr',
      torso: 'Storso',
      head: 'Shead'
    }
  },
  {
    key: 'character',
    name: 'GTA Citizen (Mixamo)',
    path: 'glbler/charachters/character.glb',
    type: PedModelType.EMBEDDED_MIXER,
    targetHeight: 1.80,
    rotX: 0
  },
  {
    key: 'mellstroy',
    name: 'Mellstroy (Biped Rig)',
    path: 'glbler/charachters/mellstroy.glb',
    type: PedModelType.BIPED_RIG,
    targetHeight: 1.83,
    rotX: 0,
    jointNames: {
      leftArm: ' L UpperArm_09',
      leftForeArm: ' L ForeArm_010',
      rightArm: ' R UpperArm_015',
      rightForeArm: ' R ForeArm_016',
      leftLeg: ' L Thigh_023',
      leftLowerLeg: ' L Calf_024',
      rightLeg: ' R Thigh_027',
      rightLowerLeg: ' R Calf_028',
      pelvis: ' Pelvis_01',
      torso: ' Spine_02',
      head: ' Head_00'
    }
  },
  {
    key: 'suit_man',
    name: 'Man In Suit',
    path: 'glbler/charachters/man_dressed_in_suit.glb',
    type: PedModelType.RIGIFY_SKINNED,
    targetHeight: 1.78,
    rotX: 0,
    jointNames: {
      leftArm: 'upper_arm.L_016',
      leftForeArm: 'forearm.L_025',
      rightArm: 'upper_arm.R_017',
      rightForeArm: 'forearm.R_026',
      leftLeg: 'thigh.L_02',
      leftLowerLeg: 'shin.L_05',
      rightLeg: 'thigh.R_03',
      rightLowerLeg: 'shin.R_06',
      torso: 'spine_01',
      head: 'head_015'
    }
  },
  {
    key: 'cop',
    name: 'LSPD Officer',
    path: 'glbler/charachters/gta_cop.glb',
    type: PedModelType.RIGID_ZUP,
    targetHeight: 1.82,
    rotX: 0 // Sketchfab GLTF root matrisi zaten Y-Up'a dönüştürmüş durumdadır
  },
  {
    key: 'michael',
    name: 'Michael De Santa',
    path: 'glbler/charachters/michael_gta_5_read_rules.glb',
    type: PedModelType.RIGID_ZUP,
    targetHeight: 1.80,
    rotX: 0 // Sketchfab GLTF root matrisi zaten Y-Up'a dönüştürmüş durumdadır
  },
  {
    key: 'tracey',
    name: 'Tracey De Santa',
    path: 'glbler/charachters/gta_5_tracey.glb',
    type: PedModelType.RIGID_ZUP,
    targetHeight: 1.70,
    rotX: 0 // Sketchfab GLTF root matrisi zaten Y-Up'a dönüştürmüş durumdadır
  }
];

/**
 * Sıfır GC için paylaşımlı geçici hesaplama nesneleri
 */
const _tempQuat = new THREE.Quaternion();
const _tempQuat2 = new THREE.Quaternion();
const _box = new THREE.Box3();
const _size = new THREE.Vector3();

/**
 * PedestrianVisualController
 * Her yaya klonu için özelleşmiş, uzuvları koruyan görsel ve animasyon yöneticisi
 */
export class PedestrianVisualController {
  constructor(config, rootGroup, modelWrapper, animationClips = null) {
    this.config = config;
    this.root = rootGroup;
    this.modelWrapper = modelWrapper;
    this.animationClips = animationClips;

    // ADIM 3: NaN bozulmasını önlemek için baseY güvenli ataması
    this.baseY = (modelWrapper && typeof modelWrapper.position.y === 'number' && !isNaN(modelWrapper.position.y))
      ? modelWrapper.position.y
      : 0;

    this.type = config.type;
    this.mixer = null;
    this.walkAction = null;
    this.gunMesh = null;

    // Mafsal ve Kemik Referansları
    this.joints = {};

    this._initRig();
  }

  /**
   * Çete üyesi için sağ ele düşük poligonlu 9mm tabanca donatır
   */
  equipWeapon() {
    if (this.gunMesh) return;
    const gunGroup = new THREE.Group();
    gunGroup.name = 'PedGunMesh';

    // Namlu (Gövde)
    const barrelGeo = new THREE.BoxGeometry(0.04, 0.05, 0.16);
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x1b1b1b, metalness: 0.8, roughness: 0.25 });
    const barrel = new THREE.Mesh(barrelGeo, darkMat);
    barrel.position.set(0, 0.03, 0.05);
    gunGroup.add(barrel);

    // Kabza
    const gripGeo = new THREE.BoxGeometry(0.032, 0.09, 0.045);
    const gripMat = new THREE.MeshStandardMaterial({ color: 0x332014, roughness: 0.8 });
    const grip = new THREE.Mesh(gripGeo, gripMat);
    grip.position.set(0, -0.03, -0.01);
    grip.rotation.x = 0.22;
    gunGroup.add(grip);

    gunGroup.scale.set(0.9, 0.9, 0.9);

    const targetJoint = this.joints.rightForeArm || this.joints.rightArm;
    if (targetJoint) {
      gunGroup.position.set(0, -0.28, 0.06);
      targetJoint.add(gunGroup);
    } else {
      gunGroup.position.set(0.26, 0.92, 0.18);
      this.modelWrapper.add(gunGroup);
    }
    this.gunMesh = gunGroup;
  }

  _initRig() {
    if (this.type === PedModelType.EMBEDDED_MIXER && this.animationClips && this.animationClips.length > 0) {
      // 1. Gömülü AnimationMixer
      this.mixer = new THREE.AnimationMixer(this.modelWrapper);
      const walkClip = this.animationClips.find(c => c.name.toLowerCase().includes('walk') || c.name.includes('mixamo')) || this.animationClips[0];
      if (walkClip) {
        this.walkAction = this.mixer.clipAction(walkClip);
        this.walkAction.play();
        this.walkAction.timeScale = 1.0;
      }
    } else if (this.config.jointNames) {
      // 2. Mafsallı / İskeletli Rig (Kemik ve Rest-Pose tespiti)
      const names = this.config.jointNames;
      this.modelWrapper.traverse(child => {
        for (const [key, targetName] of Object.entries(names)) {
          if (child.name === targetName || child.name.trim() === targetName.trim()) {
            this.joints[key] = child;
            if (!child.userData.restQuaternion) {
              child.userData.restQuaternion = child.quaternion.clone();
            }
          }
        }
      });

      // Dünya ve Model dönüşüm matrislerini güncelle
      this.modelWrapper.updateMatrixWorld(true);

      const _qWrapperWorld = new THREE.Quaternion();
      const _qChildWorld = new THREE.Quaternion();
      this.modelWrapper.getWorldQuaternion(_qWrapperWorld);

      // Her kemik için model eksenine göre yerel eksenleri hesapla (Local Pitch, Roll, Yaw)
      for (const [key, joint] of Object.entries(this.joints)) {
        if (!joint) continue;
        joint.getWorldQuaternion(_qChildWorld);
        const qRel = _qWrapperWorld.clone().invert().multiply(_qChildWorld);
        const invQRel = qRel.clone().invert();

        // Model lateral pitch referans ekseni: (-1, 0, 0)
        joint.userData.localPitchAxis = new THREE.Vector3(-1, 0, 0).applyQuaternion(invQRel).normalize();
        // Model roll referans ekseni: (0, 0, 1)
        joint.userData.localRollAxis = new THREE.Vector3(0, 0, 1).applyQuaternion(invQRel).normalize();
        // Model yaw referans ekseni: (0, 1, 0)
        joint.userData.localYawAxis = new THREE.Vector3(0, 1, 0).applyQuaternion(invQRel).normalize();
      }
    }

    // Başlangıç dikey konum ofseti (ayakların taban kotuna sıfırlanması)
    this.baseY = this.modelWrapper.position.y;
  }

  /**
   * Her animasyon adımında çağrılır
   * @param {number} delta - Geçen süre
   * @param {number} speed - Yayanın anlık hızı
   * @param {string} state - FSM durumu ('IDLE', 'WALKING', 'CROSSING', 'FLEEING', 'STUMBLING', 'KNOCKED_DOWN', 'GETTING_UP')
   * @param {number} animPhase - Yürüme salınım fazı
   * @param {number} [lodDist=0] - Oyuncuya mesafe (LOD için)
   * @param {number} [stateProgress=0] - Durum geçiş ilerlemesi (0.0 - 1.0, örn. GETTING_UP için)
   * @param {number} [tumblePitch=Math.PI / 2] - Darbe yönüne göre yere yatış açısı
   */
  update(delta, speed, state, animPhase, lodDist = 0, stateProgress = 0, tumblePitch = Math.PI / 2) {
    if (state === 'KNOCKED_DOWN') {
      // 1. Yere Devrilme: Model darbe yönüne göre asfalta yatar
      this.modelWrapper.rotation.x = this.config.rotX + tumblePitch;
      this.modelWrapper.rotation.z = 0;
      this.modelWrapper.position.y = 0.22;
      if (this.mixer) this.mixer.timeScale = 0;
      this._relaxJointsToRest(delta * 4);
      return;
    }

    if (state === 'GETTING_UP') {
      // 2. Ayağa Kalkış Geçişi: 0.0'dan 1.0'a pürüzsüz kuaterniyon doğrultma
      const fallenRotX = this.config.rotX + tumblePitch;
      this.modelWrapper.rotation.x = THREE.MathUtils.lerp(fallenRotX, this.config.rotX, stateProgress);
      this.modelWrapper.rotation.z = 0;
      this.modelWrapper.position.y = THREE.MathUtils.lerp(0.22, this.baseY, stateProgress);
      if (this.mixer) this.mixer.timeScale = 0;
      this._relaxJointsToRest(delta * 3);
      return;
    }

    if (state === 'STUMBLING') {
      // 3. Sendeleme: Arkaya ve yana yalpalama
      this.modelWrapper.rotation.x = this.config.rotX - 0.26;
      this.modelWrapper.rotation.z = Math.sin(animPhase * 3) * 0.16;
      this.modelWrapper.position.y = this.baseY;
      if (this.mixer) {
        this.walkAction.timeScale = 0.4;
        this.mixer.update(delta);
      } else {
        this._updateStumbleJoints(delta, animPhase);
      }
      return;
    }

    if (state === 'CONFRONTING' || state === 'COMBAT_RANGED' || state === 'BRAWL_MELEE' || state === 'TAUNTING') {
      // 4. Çete Çatışma Duruşları (Sataşma, Nişan Alma, Yumruk ve Alay Etme)
      this.modelWrapper.rotation.x = this.config.rotX;
      this.modelWrapper.position.y = this.baseY;
      if (this.mixer) {
        this.walkAction.timeScale = 0.12;
        this.mixer.update(delta * 0.2);
      }
      this._updateCombatJoints(delta, state, animPhase);
      return;
    }

    // Normal ayakta duruş rotasyonu
    this.modelWrapper.rotation.x = this.config.rotX;
    this.modelWrapper.position.y = this.baseY;

    const isMoving = (speed > 0.1);

    // 1. EMBEDDED_MIXER (character.glb)
    if (this.mixer) {
      if (isMoving) {
        const speedScale = Math.max(0.6, speed / 1.35);
        this.walkAction.timeScale = speedScale;
        this.mixer.update(delta);
      } else {
        // IDLE: Çok yavaş nefes alma / bekleme salınımı
        this.walkAction.timeScale = 0.15;
        this.mixer.update(delta * 0.3);
      }
      return;
    }

    // Mesafe LOD'si: 60m ötesinde mafsal salınımı yapma (60 FPS koruması)
    if (lodDist > 65) return;

    // 2. HIERARCHICAL & RIGIFY & BIPED RIG UZUV ANİMASYONU
    if (this.type === PedModelType.HIERARCHICAL || this.type === PedModelType.BIPED_RIG || this.type === PedModelType.RIGIFY_SKINNED) {
      this._updateJointAnimation(delta, speed, isMoving, animPhase);
      return;
    }

    // 3. RIGID_ZUP (Tek parça Z-Up modeller: cop, michael, tracey)
    if (this.type === PedModelType.RIGID_ZUP) {
      this._updateRigidAnimation(delta, isMoving, animPhase);
    }
  }

  /**
   * Çarpışma ve ayağa kalkış anında kemikleri Rest-Pose duruşuna pürüzsüzce gevşetir
   */
  _relaxJointsToRest(alpha) {
    const t = Math.min(1.0, alpha);
    for (const joint of Object.values(this.joints)) {
      if (joint && joint.userData.restQuaternion) {
        joint.quaternion.slerp(joint.userData.restQuaternion, t);
      }
    }
  }

  /**
   * Sendeleme sırasında kolların ve bacakların denge bulması
   */
  _updateStumbleJoints(delta, animPhase) {
    const { leftArm, rightArm, leftForeArm, rightForeArm, leftLowerLeg, rightLowerLeg } = this.joints;

    const stumbleSwing = Math.sin(animPhase * 3) * 0.48;
    if (leftArm && leftArm.userData.restQuaternion) {
      const pitchAxis = leftArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, stumbleSwing);
      leftArm.quaternion.copy(leftArm.userData.restQuaternion).multiply(_tempQuat);
    }
    if (rightArm && rightArm.userData.restQuaternion) {
      const pitchAxis = rightArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, -stumbleSwing);
      rightArm.quaternion.copy(rightArm.userData.restQuaternion).multiply(_tempQuat);
    }
    // Sendelemede dirsekler kırılır
    if (leftForeArm && leftForeArm.userData.restQuaternion) {
      const pitchAxis = leftForeArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, 0.45 + Math.abs(stumbleSwing) * 0.25);
      leftForeArm.quaternion.copy(leftForeArm.userData.restQuaternion).multiply(_tempQuat);
    }
    if (rightForeArm && rightForeArm.userData.restQuaternion) {
      const pitchAxis = rightForeArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, 0.45 + Math.abs(stumbleSwing) * 0.25);
      rightForeArm.quaternion.copy(rightForeArm.userData.restQuaternion).multiply(_tempQuat);
    }
    // Dizler hafif şok emme bükülüşü
    if (leftLowerLeg && leftLowerLeg.userData.restQuaternion) {
      const pitchAxis = leftLowerLeg.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, -0.32);
      leftLowerLeg.quaternion.copy(leftLowerLeg.userData.restQuaternion).multiply(_tempQuat);
    }
    if (rightLowerLeg && rightLowerLeg.userData.restQuaternion) {
      const pitchAxis = rightLowerLeg.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, -0.32);
      rightLowerLeg.quaternion.copy(rightLowerLeg.userData.restQuaternion).multiply(_tempQuat);
    }
  }

  /**
   * Çete durumlarında uzuv duruşları (Sataşma, Nişan alma, Yumruk ve Alay)
   */
  _updateCombatJoints(delta, state, animPhase) {
    const { leftArm, rightArm, leftForeArm, rightForeArm } = this.joints;

    let rightArmAngle = 0;
    let leftArmAngle = 0;
    let rightElbowAngle = 0.28;
    let leftElbowAngle = 0.28;

    if (state === 'CONFRONTING') {
      // Tehditkâr duruş: Sağ kol hafif ileri, sol kol kalçada
      rightArmAngle = 0.75 + Math.sin(animPhase * 2) * 0.08;
      leftArmAngle = -0.25;
      rightElbowAngle = 0.45;
      leftElbowAngle = 0.75;
    } else if (state === 'COMBAT_RANGED') {
      // Nişan alma: Sağ kol hedefe tam ileri doğrultulu (~90 derece), dirsek düz, hafif geri tepme titremesi
      rightArmAngle = 1.45 + (Math.random() - 0.5) * 0.04;
      leftArmAngle = 0.35;
      rightElbowAngle = 0.12;
      leftElbowAngle = 0.85;
    } else if (state === 'BRAWL_MELEE') {
      // Hızlı yumruk salınımı
      const punchPhase = Math.sin(animPhase * 7);
      rightArmAngle = 0.6 + punchPhase * 0.9;
      leftArmAngle = -0.35 + punchPhase * 0.4;
      rightElbowAngle = Math.max(0.15, 0.8 - punchPhase * 0.6);
      leftElbowAngle = Math.max(0.2, 0.4 + punchPhase * 0.5);
    } else if (state === 'TAUNTING') {
      // Alay etme / zafer salınımı: iki kol havada yumruk sallama
      rightArmAngle = 1.2 + Math.sin(animPhase * 3) * 0.35;
      leftArmAngle = 1.2 - Math.sin(animPhase * 3) * 0.35;
      rightElbowAngle = 0.75 + Math.sin(animPhase * 3) * 0.25;
      leftElbowAngle = 0.75 - Math.sin(animPhase * 3) * 0.25;
    }

    if (rightArm && rightArm.userData.restQuaternion) {
      const pitchAxis = rightArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, rightArmAngle);
      rightArm.quaternion.copy(rightArm.userData.restQuaternion).multiply(_tempQuat);
    }
    if (leftArm && leftArm.userData.restQuaternion) {
      const pitchAxis = leftArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, leftArmAngle);
      leftArm.quaternion.copy(leftArm.userData.restQuaternion).multiply(_tempQuat);
    }
    if (rightForeArm && rightForeArm.userData.restQuaternion) {
      const pitchAxis = rightForeArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, rightElbowAngle);
      rightForeArm.quaternion.copy(rightForeArm.userData.restQuaternion).multiply(_tempQuat);
    }
    if (leftForeArm && leftForeArm.userData.restQuaternion) {
      const pitchAxis = leftForeArm.userData.localPitchAxis || new THREE.Vector3(-1, 0, 0);
      _tempQuat.setFromAxisAngle(pitchAxis, leftElbowAngle);
      leftForeArm.quaternion.copy(leftForeArm.userData.restQuaternion).multiply(_tempQuat);
    }
  }

  /**
   * İki Kademeli Mafsal Kinematiği (Two-Bone Kinematic Joint Articulation)
   * Uyluk, Diz, Üst Kol, Dirsek ve Omurga tam senkronize salınır
   */
  _updateJointAnimation(delta, speed, isMoving, animPhase) {
    const {
      leftArm, rightArm,
      leftForeArm, rightForeArm,
      leftLeg, rightLeg,
      leftLowerLeg, rightLowerLeg,
      torso, head
    } = this.joints;

    if (isMoving) {
      // 1. Hareket Halinde Bacak & Kol Salınımı
      const stride = Math.min(0.68, 0.46 + (speed / 4.2) * 0.22);
      const armSwing = Math.sin(animPhase) * stride;
      const legSwing = Math.sin(animPhase) * (stride * 1.15);

      // Sol Kol (Öne doğru salınırken +armSwing)
      if (leftArm && leftArm.userData.restQuaternion) {
        const pitchAxis = leftArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, armSwing);
        leftArm.quaternion.copy(leftArm.userData.restQuaternion).multiply(_tempQuat);
      }
      // Sağ Kol (Zıt fazda salınır: -armSwing)
      if (rightArm && rightArm.userData.restQuaternion) {
        const pitchAxis = rightArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, -armSwing);
        rightArm.quaternion.copy(rightArm.userData.restQuaternion).multiply(_tempQuat);
      }

      // Sol Dirsek (Öne salınırken dirsek fleksör açısı artar)
      if (leftForeArm && leftForeArm.userData.restQuaternion) {
        const pitchAxis = leftForeArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        const elbowAngle = 0.28 + Math.max(0, armSwing) * 0.42;
        _tempQuat.setFromAxisAngle(pitchAxis, elbowAngle);
        leftForeArm.quaternion.copy(leftForeArm.userData.restQuaternion).multiply(_tempQuat);
      }
      // Sağ Dirsek
      if (rightForeArm && rightForeArm.userData.restQuaternion) {
        const pitchAxis = rightForeArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        const elbowAngle = 0.28 + Math.max(0, -armSwing) * 0.42;
        _tempQuat.setFromAxisAngle(pitchAxis, elbowAngle);
        rightForeArm.quaternion.copy(rightForeArm.userData.restQuaternion).multiply(_tempQuat);
      }

      // Sol Bacak / Sağ Bacak (Kalça Hips)
      if (leftLeg && leftLeg.userData.restQuaternion) {
        const pitchAxis = leftLeg.userData.localPitchAxis || this.config.legPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, -legSwing);
        leftLeg.quaternion.copy(leftLeg.userData.restQuaternion).multiply(_tempQuat);
      }
      if (rightLeg && rightLeg.userData.restQuaternion) {
        const pitchAxis = rightLeg.userData.localPitchAxis || this.config.legPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, legSwing);
        rightLeg.quaternion.copy(rightLeg.userData.restQuaternion).multiply(_tempQuat);
      }

      // Dizler (Knee Kinematics):
      // Bacak arkadayken ve öne geçerken diz arkaya bükülür (flexion); yere basarken düzleşir
      const kneeMaxFlex = 0.58 + Math.min(0.38, (speed / 4.0) * 0.35);
      const rightKneeFlex = -Math.max(0, Math.cos(animPhase)) * kneeMaxFlex;
      const leftKneeFlex = -Math.max(0, -Math.cos(animPhase)) * kneeMaxFlex;

      if (leftLowerLeg && leftLowerLeg.userData.restQuaternion) {
        const pitchAxis = leftLowerLeg.userData.localPitchAxis || this.config.legPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, leftKneeFlex);
        leftLowerLeg.quaternion.copy(leftLowerLeg.userData.restQuaternion).multiply(_tempQuat);
      }
      if (rightLowerLeg && rightLowerLeg.userData.restQuaternion) {
        const pitchAxis = rightLowerLeg.userData.localPitchAxis || this.config.legPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, rightKneeFlex);
        rightLowerLeg.quaternion.copy(rightLowerLeg.userData.restQuaternion).multiply(_tempQuat);
      }

      // Omurga (Torso / Spine): Adım atarken zıt gövde torsiyonu (Twist & Roll)
      if (torso && torso.userData.restQuaternion) {
        const yawAxis = torso.userData.localYawAxis || new THREE.Vector3(0, 1, 0);
        const rollAxis = torso.userData.localRollAxis || new THREE.Vector3(0, 0, 1);
        const torsoTwist = Math.sin(animPhase) * 0.055;
        const torsoRoll = Math.cos(animPhase) * 0.025;
        _tempQuat.setFromAxisAngle(yawAxis, torsoTwist);
        _tempQuat2.setFromAxisAngle(rollAxis, torsoRoll);
        torso.quaternion.copy(torso.userData.restQuaternion).multiply(_tempQuat).multiply(_tempQuat2);
      }

      // Kafa (Head): Göz hizasını sabit tutma (hafif karşı eğim)
      if (head && head.userData.restQuaternion) {
        const yawAxis = head.userData.localYawAxis || new THREE.Vector3(0, 1, 0);
        const headTwist = -Math.sin(animPhase) * 0.035;
        _tempQuat.setFromAxisAngle(yawAxis, headTwist);
        head.quaternion.copy(head.userData.restQuaternion).multiply(_tempQuat);
      }

      // Hafif dikey adım yaylanması
      this.modelWrapper.position.y = this.baseY + Math.abs(Math.sin(animPhase * 2)) * 0.035;
    } else {
      // 2. IDLE (Dururken nefes alma & dinlenme duruşu)
      const breathe = Math.sin(animPhase * 0.6) * 0.035;
      const weightShift = Math.sin(animPhase * 0.3) * 0.02;

      // Kollar serbest dinlenme açısında
      if (leftArm && leftArm.userData.restQuaternion) {
        const pitchAxis = leftArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, breathe);
        leftArm.quaternion.slerp(_tempQuat.copy(leftArm.userData.restQuaternion).multiply(_tempQuat), 0.1);
      }
      if (rightArm && rightArm.userData.restQuaternion) {
        const pitchAxis = rightArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, -breathe);
        rightArm.quaternion.slerp(_tempQuat.copy(rightArm.userData.restQuaternion).multiply(_tempQuat), 0.1);
      }

      // Dirsek dinlenme bükülüşü (~13 derece)
      if (leftForeArm && leftForeArm.userData.restQuaternion) {
        const pitchAxis = leftForeArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, 0.22);
        leftForeArm.quaternion.slerp(_tempQuat.copy(leftForeArm.userData.restQuaternion).multiply(_tempQuat), 0.1);
      }
      if (rightForeArm && rightForeArm.userData.restQuaternion) {
        const pitchAxis = rightForeArm.userData.localPitchAxis || this.config.armPitchAxis || new THREE.Vector3(-1, 0, 0);
        _tempQuat.setFromAxisAngle(pitchAxis, 0.22);
        rightForeArm.quaternion.slerp(_tempQuat.copy(rightForeArm.userData.restQuaternion).multiply(_tempQuat), 0.1);
      }

      // Bacaklar ve Dizler Rest-Pose'a slerp
      if (leftLeg && leftLeg.userData.restQuaternion) {
        leftLeg.quaternion.slerp(leftLeg.userData.restQuaternion, 0.15);
      }
      if (rightLeg && rightLeg.userData.restQuaternion) {
        rightLeg.quaternion.slerp(rightLeg.userData.restQuaternion, 0.15);
      }
      if (leftLowerLeg && leftLowerLeg.userData.restQuaternion) {
        leftLowerLeg.quaternion.slerp(leftLowerLeg.userData.restQuaternion, 0.15);
      }
      if (rightLowerLeg && rightLowerLeg.userData.restQuaternion) {
        rightLowerLeg.quaternion.slerp(rightLowerLeg.userData.restQuaternion, 0.15);
      }

      // Omurga nefes alma ve hafif ağırlık meyli
      if (torso && torso.userData.restQuaternion) {
        const rollAxis = torso.userData.localRollAxis || new THREE.Vector3(0, 0, 1);
        _tempQuat.setFromAxisAngle(rollAxis, weightShift);
        torso.quaternion.slerp(_tempQuat.copy(torso.userData.restQuaternion).multiply(_tempQuat), 0.1);
      }

      // Kafa hafif etrafa bakınma salınımı
      if (head && head.userData.restQuaternion) {
        const yawAxis = head.userData.localYawAxis || new THREE.Vector3(0, 1, 0);
        const headLook = Math.sin(animPhase * 0.4) * 0.06;
        _tempQuat.setFromAxisAngle(yawAxis, headLook);
        head.quaternion.slerp(_tempQuat.copy(head.userData.restQuaternion).multiply(_tempQuat), 0.08);
      }

      this.modelWrapper.position.y = this.baseY;
    }
  }

  /**
   * Rijit modeller için gövde ağırlık salınımı
   */
  _updateRigidAnimation(delta, isMoving, animPhase) {
    this.modelWrapper.rotation.x = this.config.rotX || 0;
    if (isMoving) {
      // Yürürken doğal gövde ağırlık aktarımı (Roll salınımı)
      this.modelWrapper.rotation.z = Math.sin(animPhase) * 0.022;
      // Dikey adım yaylanması
      this.modelWrapper.position.y = this.baseY + Math.abs(Math.sin(animPhase * 2)) * 0.024;
    } else {
      this.modelWrapper.rotation.z = 0;
      this.modelWrapper.position.y = this.baseY;
    }
  }
}

/**
 * PedestrianModelCatalog
 * Tüm 3D GLB modellerini tek merkezden asenkron yükler, normalizasyonunu yapar
 * ve SkeletonUtils tabanlı derin klonlama ile havuza yaya üretir.
 */
export class PedestrianModelCatalog {
  constructor() {
    this.templates = new Map(); // key -> { scene, config, animations }
    this.isLoaded = false;
    this.loadPromise = null;
  }

  /**
   * Tüm modelleri yükler ve normalize eder
   * @param {import('../assets/AssetManager.js').AssetManager} assetManager
   * @returns {Promise<boolean>}
   */
  async loadCatalog(assetManager) {
    if (this.isLoaded) return true;
    if (this.loadPromise) return this.loadPromise;

    this.loadPromise = (async () => {
      console.log('🚶 [PedestrianModelCatalog] GLB Yaya Karakter Modelleri Yükleniyor...');
      const startTime = performance.now();

      const loadPromises = PEDESTRIAN_MODEL_CONFIGS.map(async (config) => {
        try {
          // AssetManager üzerinden GLTF yükle (cache & retry destekli)
          const result = await assetManager.loadGLTF(config.path, { shouldClone: false });
          if (!result || !result.scene) {
            console.warn(`[PedestrianModelCatalog] ⚠️ Model sahnesi boş: ${config.key}`);
            return null;
          }

          const rawScene = result.scene;
          const animations = result.animations || [];

          // 1. Normalizasyon Taşıyıcısı (Wrapper)
          const wrapper = new THREE.Group();
          wrapper.name = `PedTemplate_${config.key}`;

          // Gölge ayarları
          rawScene.traverse(child => {
            if (child.isMesh) {
              child.castShadow = true;
              child.receiveShadow = true;
              if (child.material) {
                child.material.roughness = Math.max(0.6, child.material.roughness || 0.7);
              }
            }
          });

          // 2. Oryantasyon Düzeltmesi (Z-Up modeller için -90° X rotasyonu)
          if (config.rotX !== 0) {
            rawScene.rotation.x = config.rotX;
          }

          wrapper.add(rawScene);

          // 3. Boyut ve Yükseklik Normalizasyonu
          wrapper.updateMatrixWorld(true);
          _box.setFromObject(wrapper);
          _box.getSize(_size);

          const currentHeight = _size.y;
          if (currentHeight > 0.05) {
            let scaleFactor = config.targetHeight / currentHeight;
            // ADIM 3: Dev boyut (Giant scale) patlamasını önleyen güvenlik kelepçesi
            scaleFactor = THREE.MathUtils.clamp(scaleFactor, 0.0005, 3.0);
            rawScene.scale.setScalar(scaleFactor);
          }

          // 4. Ayak Taban Kotu Normalizasyonu (y = 0 kotuna sıfırlama)
          wrapper.updateMatrixWorld(true);
          _box.setFromObject(wrapper);
          const minY = _box.min.y;
          rawScene.position.y = -minY;

          // 5. Şablonu önbelleğe kaydet
          this.templates.set(config.key, {
            config,
            scene: wrapper,
            rawScene,
            animations
          });

          console.log(`[PedestrianModelCatalog] ✅ Hazır: ${config.name} (${config.key}) -> Boy: ${config.targetHeight}m`);
          return config.key;
        } catch (err) {
          console.error(`[PedestrianModelCatalog] ❌ Model yükleme hatası (${config.key}):`, err);
          return null;
        }
      });

      await Promise.all(loadPromises);

      const elapsed = ((performance.now() - startTime) / 1000).toFixed(2);
      this.isLoaded = this.templates.size > 0;
      console.log(`🚶 [PedestrianModelCatalog] ${this.templates.size}/${PEDESTRIAN_MODEL_CONFIGS.length} karakter modeli yüklendi (${elapsed}s)`);
      return this.isLoaded;
    })();

    return this.loadPromise;
  }

  /**
   * Havuzdaki bir yaya için bağımsız 3D model instance'ı üretir
   * @param {number} pedId - Yayanın benzersiz id'si
   * @returns {{ root: THREE.Group, controller: PedestrianVisualController, modelKey: string }|null}
   */
  instantiatePedestrian(pedId) {
    if (!this.isLoaded || this.templates.size === 0) return null;

    const availableKeys = Array.from(this.templates.keys());
    // ID bazlı dengeli model dağıtımı
    const modelKey = availableKeys[pedId % availableKeys.length];
    const templateData = this.templates.get(modelKey);
    if (!templateData) return null;

    const rootGroup = new THREE.Group();
    rootGroup.name = `Pedestrian_${pedId}_${modelKey}`;

    // SkeletonUtils ile bağımsız iskelet ve kemik kopyası
    let clonedScene = null;
    try {
      clonedScene = SkeletonUtils.clone(templateData.scene);
    } catch (e) {
      clonedScene = templateData.scene.clone(true);
    }

    rootGroup.add(clonedScene);

    // Klonun modelWrapper'ını bul
    const modelWrapper = clonedScene.children[0] || clonedScene;

    const controller = new PedestrianVisualController(
      templateData.config,
      rootGroup,
      modelWrapper,
      templateData.animations
    );

    return {
      root: rootGroup,
      controller,
      modelKey
    };
  }
}

// Tekil singleton instance
export const pedestrianModelCatalog = new PedestrianModelCatalog();
