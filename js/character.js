import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { assetManager } from './assets/AssetManager.js';
import { PARCEL_PLOTS } from './parcels.js';
import { CameraCollisionSolver } from './camera/CameraCollisionSolver.js';
import { pedestrianAudio } from './pedestrian/PedestrianAudio.js';

export const WEAPON_SLOTS = [
  { id: 'fist', name: 'YUMRUK', icon: '👊', isFirearm: false, damage: 18, range: 2.2, spread: 0 },
  { id: 'pistol', name: '9MM TABANCA', icon: '🔫', isFirearm: true, damage: 35, range: 90, spread: 0 },
  { id: 'smg', name: 'MICRO SMG', icon: '⚡', isFirearm: true, damage: 24, range: 75, spread: 0.018 },
  { id: 'shotgun', name: 'POMPALI TÜFEK', icon: '💥', isFirearm: true, damage: 75, range: 45, spread: 0.045, pellets: 5 }
];

/**
 * CharacterManager - Gerçekçi 3. Şahıs GTA 5 Sokak Karakteri
 * Seçenek 2: Düz gri tişört, koyu kot pantolon, beyaz spor ayakkabılar, yapılı/kaslı erkek karakter.
 * Animasyonlar: Idle, Walk, Running, Jump, Hit/Attack (Yumruk)
 */
export class CharacterManager {
  constructor(scene, camera, domElement, audioManager = null, terrainManager = null, collisionManager = null) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.audioManager = audioManager;
    this.terrain = terrainManager;
    this.collisionManager = collisionManager;

    // Model ve animasyon durumu
    this.model = null;
    this.mixer = null;
    this.actions = {};
    this.currentAction = null;
    this.currentActionName = '';
    this.isLoaded = false;
    this.isActive = true;

    // Başlangıç konumu ve zemin kotu: Grove Street (CJ Evi önü sokak)
    this.groundY = 0.06;
    this.position = new THREE.Vector3(-12, this.groundY, 20);
    this.rotation = Math.PI; // Evi arkasına alıp sokağa baksın
    this.targetRotation = Math.PI;
    this.verticalVelocity = 0;
    this.isGrounded = true;
    this.isAttacking = false;
    this.attackTimeout = null;

    // Hız ve fizik parametreleri (Gerçekçi insan temposu)
    this.walkSpeed = 2.0;
    this.runSpeed = 5.6;
    this.gravity = 18.0;
    this.jumpForce = 7.5;

    // 3. Şahıs Kamera parametreleri
    this.cameraYaw = 0;
    this.cameraPitch = 0.22; // ~12 derece yukarıdan hafif izleme açısı
    this.cameraDistance = 4.4;
    this.cameraHeight = 1.75;
    this.mouseSensitivity = 0.003;
    this.isMouseDown = false;
    this.isAiming = false;
    this.currentCamDist = 4.4;
    this.currentShoulderOffset = 0;
    this.crosshair = document.getElementById('crosshair');
    this._lastAiming = null;

    // Merkezi GTA Tarzı Kamera Occlusion Çözücüsü
    this.cameraSolver = new CameraCollisionSolver(this.collisionManager, {
      sphereRadius: 0.22,
      safeMargin: 0.16,
      minDistance: 0.60,
      minGroundClearance: 0.35,
      hardInFactor: 0.88,
      softOutFactor: 0.12
    });

    // Performans için önceden tahsis edilen geçici vektörler (GC baskısını sıfırlar)
    this._tmpForward = new THREE.Vector3();
    this._tmpRight = new THREE.Vector3();
    this._tmpMoveDir = new THREE.Vector3();
    this._tmpTargetPos = new THREE.Vector3();
    this._tmpLookTarget = new THREE.Vector3();
    this._tmpRayDir = new THREE.Vector3();
    this._tmpHit = { hit: false, distance: Infinity, point: new THREE.Vector3() };
    this._nearColliders = [];

    // Giriş tuşları
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      sprint: false,
      jump: false,
      punch: false
    };

    // Ateşli Silah & 4 Slotlu Envanter Durumu (ADIM 14)
    this.weaponSlots = WEAPON_SLOTS;
    this.currentSlotIndex = 1; // 9mm Pistol ile başlar
    this.currentWeapon = 'pistol';
    this.ammo = 999;
    this.gunMesh = null;
    this.gunMuzzlePoint = null;
    this.gunFlashLight = null;
    this.gunFlashPlane = null;
    this._flashTimeout = null;
    this.recoilOffset = 0;

    // İskelet Kemikleri (Nişan pozu ve silah bağlama için)
    this.rightHandBone = null;
    this.rightForeArmBone = null;
    this.rightArmBone = null;
    this.spineBone = null;

    // Mermi İzi (Decal) Havuzu
    this.bulletHoles = [];
    this._bulletHoleGeo = new THREE.CircleGeometry(0.025, 12);
    this._bulletHoleMat = new THREE.MeshBasicMaterial({
      color: 0x181818,
      side: THREE.DoubleSide,
      depthWrite: false,
      polygonOffset: true,
      polygonOffsetFactor: -1.5,
      polygonOffsetUnits: -1.5
    });

    this.initEvents();
  }

  get collisionManager() {
    return this._collisionManager;
  }

  set collisionManager(cm) {
    this._collisionManager = cm;
    if (this.cameraSolver) {
      this.cameraSolver.collisionManager = cm;
    }
  }

  initEvents() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Sağ tık menüsünü engelle (nişan alırken menü açılmasın)
    window.addEventListener('contextmenu', (e) => {
      if (this.isActive) e.preventDefault();
    });

    // Fare tıklama ve sürükleme (Pointer lock zorunluluğu OLMADAN serbest kamera kontrolü)
    this.domElement.addEventListener('mousedown', (e) => {
      if (this.isActive) {
        this.isMouseDown = true;
        // Sol tık: Nişandayken ve silah kuşanılmışken ateş, nişan yokken mevcut yumruk
        if (e.button === 0) {
          if (this.isAiming && this.isCurrentWeaponFirearm()) {
            this.shoot();
          } else if (!this.isAttacking) {
            this.punch();
          }
        }
        // Sağ tık ile nişan alma
        if (e.button === 2) {
          this.setAiming(true);
        }
      }
    });

    // Fare Tekerleği (Scroll) ile Silah Değiştirme
    window.addEventListener('wheel', (e) => {
      if (this.isActive && !window.app?.vehicleManager?.isDriving) {
        this.cycleWeapon(e.deltaY > 0 ? 1 : -1);
      }
    }, { passive: true });

    window.addEventListener('mouseup', (e) => {
      this.isMouseDown = false;
      if (e.button === 2) {
        this.setAiming(false);
      }
    });

    // Fare hareketi: Tıklayıp sürüklerken veya fare kilitliyken kamerayı çevir
    window.addEventListener('mousemove', (e) => {
      if (!this.isActive) return;
      const isLocked = document.pointerLockElement === this.domElement;
      if (isLocked || this.isMouseDown) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        this.cameraYaw -= movementX * this.mouseSensitivity;
        this.cameraPitch += movementY * this.mouseSensitivity;

        // Dikey bakış sınırlandırması (-15° ile +45°)
        this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch, -0.25, 0.75);
      }
    });

    // Tuvale tıklandığında opsiyonel kilit dene (hata fırlatmadan sessizce yakala)
    this.domElement.addEventListener('click', () => {
      if (this.isActive && !document.pointerLockElement) {
        try {
          const req = this.domElement.requestPointerLock?.();
          if (req && req.catch) req.catch(() => {});
        } catch (_) {}
      }
    });
  }

  setAiming(aiming) {
    this.isAiming = aiming;
    if (this._lastAiming === this.isAiming) return;
    this._lastAiming = this.isAiming;
    if (this.crosshair) {
      if (this.isAiming) {
        this.crosshair.classList.remove('hidden');
      } else {
        this.crosshair.classList.add('hidden');
      }
    }
  }

  setActive(active) {
    this.isActive = active;
    if (!active) {
      this.setAiming(false);
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
    }
  }

  onKeyDown(e) {
    if (e.repeat) return;
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
        break;
      case 'Space':
        this.keys.jump = true;
        if (this.isActive && this.isGrounded && !this.isAttacking) {
          this.jump();
        }
        break;
      case 'KeyF':
      case 'KeyE':
        if (this.isActive && !this.isAttacking) {
          this.punch();
        }
        break;
      case 'KeyQ':
        this.cycleWeapon(1);
        break;
      case 'Digit1':
      case 'Numpad1':
        this.selectSlot(0); // 👊 Yumruk
        break;
      case 'Digit2':
      case 'Numpad2':
        this.selectSlot(1); // 🔫 9mm Tabanca
        break;
      case 'Digit3':
      case 'Numpad3':
        this.selectSlot(2); // ⚡ Micro SMG
        break;
      case 'Digit4':
      case 'Numpad4':
        this.selectSlot(3); // 💥 Pompalı Tüfek
        break;
      default:
        if (e.key === '1') this.selectSlot(0);
        else if (e.key === '2') this.selectSlot(1);
        else if (e.key === '3') this.selectSlot(2);
        else if (e.key === '4') this.selectSlot(3);
        break;
    }
  }

  onKeyUp(e) {
    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
      case 'Space':
        this.keys.jump = false;
        break;
    }
  }

  async load(onComplete = null) {
    try {
      console.log('⏳ Gerçekçi GTA 5 Sokak Karakteri Yükleniyor...');

      const { scene: characterScene } = await assetManager.loadGLTF('character_player');
      this.model = characterScene;
      this.model.name = 'GTA_Street_Character';

      // Boyutu insan boyuna (~1.80m) tam ölçekle (Modelin doğal yüksekliği ~1.84m)
      const targetHeight = 1.80;
      const nativeHeight = 1.84;
      const scale = targetHeight / nativeHeight;
      this.model.scale.setScalar(scale);

      // Konum ve rotasyon (ayakları tam asfalt kotuna oturt)
      this.model.position.copy(this.position);
      this.model.rotation.y = this.rotation;

      // Gölgeleri aç ve gerçekçi kumaş/ten materyal ayarlarını yap
      this.model.traverse((child) => {
        if (child.isMesh) {
          child.castShadow = true;
          child.receiveShadow = true;
          if (child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            mats.forEach(m => {
              if (m) {
                m.roughness = THREE.MathUtils.clamp(m.roughness || 0.7, 0.4, 0.9);
                m.metalness = THREE.MathUtils.clamp(m.metalness || 0.0, 0.0, 0.2);
              }
            });
          }
        }
      });

      this.scene.add(this.model);

      // --- ATEŞLİ SİLAH & İSKELET BAĞLANTISI ---
      this.gunMesh = this.createGunModel();

      let foundRightHand = null;
      let fallbackHand = null;

      this.model.traverse((child) => {
        if (child.isBone) {
          const lower = child.name.toLowerCase();

          // 1. Adında (küçük harfe çevirerek) hem "right" hem "hand" geçen ilk kemik (parmaklar hariç)
          if (!foundRightHand && lower.includes('right') && lower.includes('hand') &&
              !lower.includes('thumb') && !lower.includes('index') && !lower.includes('middle') && !lower.includes('ring') && !lower.includes('pinky')) {
            foundRightHand = child;
          }
          if (!fallbackHand && lower.includes('hand') && !lower.includes('thumb') && !lower.includes('index') && !lower.includes('middle')) {
            fallbackHand = child;
          }

          // 2. Nişan pozu kemikleri: RightArm, RightForeArm, Spine
          if (lower.includes('right')) {
            if (lower.includes('forearm')) {
              if (!this.rightForeArmBone) this.rightForeArmBone = child;
            } else if (lower.includes('arm')) {
              if (!this.rightArmBone) this.rightArmBone = child;
            }
          }
          if (lower.includes('spine')) {
            if (!this.spineBone) this.spineBone = child;
          }
        }
      });

      this.rightHandBone = foundRightHand || fallbackHand;

      if (foundRightHand) {
        console.log(`🔫 [Silah Sistemi] Bulunan el kemiği: "${foundRightHand.name}"`);
      } else if (fallbackHand) {
        console.warn(`⚠️ [Silah Sistemi] Sağ el kemiği bulunamadı, fallback el kemiği kullanılıyor: "${fallbackHand.name}"`);
      } else {
        console.warn('⚠️ [Silah Sistemi] Hiçbir el kemiği bulunamadı, sağ el civarı sabit nokta (fallback) kullanılıyor.');
      }

      console.log(`🦴 [Silah Sistemi] Nişan kemikleri: RightArm="${this.rightArmBone?.name || 'Yok'}", RightForeArm="${this.rightForeArmBone?.name || 'Yok'}", Spine="${this.spineBone?.name || 'Yok'}"`);

      // Silahı kemiğe (veya fallback noktasına) bağla
      if (this.rightHandBone) {
        this.rightHandBone.add(this.gunMesh);
        // Avuç içine oturması için yerel pozisyon ve rotasyon
        this.gunMesh.position.set(-0.02, 0.09, 0.03);
        this.gunMesh.rotation.set(-Math.PI / 2, 0, -Math.PI / 2);
      } else {
        // Fallback sabit nokta
        const fallbackPoint = new THREE.Object3D();
        fallbackPoint.name = 'HandFallbackPoint';
        fallbackPoint.position.set(0.35, 1.0, 0.1);
        this.model.add(fallbackPoint);
        fallbackPoint.add(this.gunMesh);
      }

      this.gunMesh.visible = (this.currentWeapon === 'gun');

      // Animasyon Mikseri
      this.mixer = new THREE.AnimationMixer(this.model);

      const animFiles = {
        idle: 'assets/models/character/anim/Idle.fbx',
        walk: 'assets/models/character/anim/walk.fbx',
        run: 'assets/models/character/anim/Running.fbx',
        jump: 'assets/models/character/anim/jump.fbx',
        hit: 'assets/models/character/anim/attack.fbx'
      };

      for (const [name, url] of Object.entries(animFiles)) {
        try {
          const animObj = await assetManager.loadFBX(url);
          if (animObj.animations && animObj.animations.length > 0) {
            const clip = animObj.animations[0];

            // Mixamo FBX'ten GLTF iskeletine hassas retargeting:
            // 1. Armature track'leri FBX koordinat farkından dolayı GLTF modelini bozduğu için filtrelenir
            // 2. Pozisyon track'leri kod tabanlı WASD hareketi için temizlenir
            // 3. Hips.quaternion Mixamo'daki +90° X rotasyon ofsetine karşı düzeltilir
            const qCorrection = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);
            const filteredTracks = [];

            for (const track of clip.tracks) {
              if (track.name.startsWith('Armature')) continue;
              if (track.name.endsWith('.position')) continue;

              if (track.name.includes('Hips.quaternion')) {
                const newValues = new Float32Array(track.values.length);
                const q = new THREE.Quaternion();
                for (let i = 0; i < track.values.length; i += 4) {
                  q.set(track.values[i], track.values[i + 1], track.values[i + 2], track.values[i + 3]);
                  q.premultiply(qCorrection);
                  newValues[i] = q.x;
                  newValues[i + 1] = q.y;
                  newValues[i + 2] = q.z;
                  newValues[i + 3] = q.w;
                }
                track.values = newValues;
              }
              filteredTracks.push(track);
            }

            clip.tracks = filteredTracks;
            const action = this.mixer.clipAction(clip);
            action.name = name;

            if (name === 'hit' || name === 'jump') {
              action.setLoop(THREE.LoopOnce);
              action.clampWhenFinished = true;
            } else {
              action.setLoop(THREE.LoopRepeat, Infinity);
            }
            if (name === 'walk' || name === 'run') {
              action.timeScale = 1.15;
            }
            this.actions[name] = action;
          }
        } catch (e) {
          console.warn(`Animasyon yüklenemedi: ${name}`, e);
        }
      }

      // Idle animasyonunu başlat
      if (this.actions.idle) {
        this.actions.idle.play();
        this.currentAction = this.actions.idle;
        this.currentActionName = 'idle';
      }

      this.isLoaded = true;
      if (this.isActive) {
        this.cameraYaw = this.rotation + Math.PI;
        this.cameraPitch = 0.22;
        this.snapCameraBehind();
      }
      console.log('✅ Gerçekçi GTA Sokak Karakteri Başarıyla Yüklendi! Animasyonlar:', Object.keys(this.actions));

      if (onComplete) onComplete(this);
    } catch (err) {
      console.error('❌ Karakter yükleme hatası:', err);
    }
  }

  fadeToAction(name, duration = 0.2) {
    const nextAction = this.actions[name];
    if (!nextAction || this.currentActionName === name) return;

    if (this.currentAction) {
      this.currentAction.fadeOut(duration);
    }

    const timeScale = (name === 'walk' || name === 'run') ? 1.15 : 1.0;

    nextAction
      .reset()
      .setEffectiveTimeScale(timeScale)
      .setEffectiveWeight(1)
      .fadeIn(duration)
      .play();

    this.currentAction = nextAction;
    this.currentActionName = name;
  }

  jump() {
    this.isGrounded = false;
    this.verticalVelocity = this.jumpForce;

    if (this.actions.jump) {
      this.fadeToAction('jump', 0.12);
    }
    this.audioManager?.playWhoosh();
  }

  punch() {
    if (!this.actions.hit) return;
    this.isAttacking = true;
    this.fadeToAction('hit', 0.08);
    this.audioManager?.playPunch?.() || this.audioManager?.playWhoosh();

    // Yakındaki yayaya yumruk isabet kontrolü
    if (window.app?.pedestrianManager?.pool) {
      for (const ped of window.app.pedestrianManager.pool) {
        if (!ped.isActive) continue;
        if (ped.state === 'KNOCKED_DOWN' || ped.state === 'GETTING_UP') continue;
        const d = ped.position.distanceTo(this.position);
        if (d < 2.2) {
          ped.takeDamage(25, this.position);
          break;
        }
      }
    }

    if (this.attackTimeout) clearTimeout(this.attackTimeout);
    this.attackTimeout = setTimeout(() => {
      this.isAttacking = false;
      this.determineBaseAction(0.18);
    }, 650);
  }

  determineBaseAction(duration = 0.2) {
    if (!this.isGrounded) return;
    const isMoving = this.keys.forward || this.keys.backward || this.keys.left || this.keys.right;

    if (isMoving) {
      if (this.keys.sprint && this.actions.run) {
        this.fadeToAction('run', duration);
      } else if (this.actions.walk) {
        this.fadeToAction('walk', duration);
      }
    } else if (this.actions.idle) {
      this.fadeToAction('idle', duration);
    }
  }

  setActive(active) {
    this.isActive = active;
    if (this.model) {
      this.model.visible = active;
    }
    if (this.gunMesh) {
      this.gunMesh.visible = active && (this.currentWeapon === 'gun');
    }
    if (!active) {
      this.setAiming(false);
      this.keys.forward = false;
      this.keys.backward = false;
      this.keys.left = false;
      this.keys.right = false;
      this.keys.sprint = false;
      this.keys.jump = false;
      if (this.crosshair) this.crosshair.classList.add('hidden');
    }
    if (active && this.model) {
      // Kamerayı hemen karakterin arkasına getir ve hizala
      this.cameraYaw = this.rotation + Math.PI;
      this.cameraPitch = 0.22;
      this.snapCameraBehind();
    }
  }

  snapCameraBehind() {
    const cosPitch = Math.cos(this.cameraPitch);
    const sinPitch = Math.sin(this.cameraPitch);
    const offsetX = Math.sin(this.cameraYaw) * cosPitch * this.cameraDistance;
    const offsetZ = Math.cos(this.cameraYaw) * cosPitch * this.cameraDistance;
    const offsetY = this.cameraHeight + sinPitch * this.cameraDistance;

    this.camera.position.set(
      this.position.x + offsetX,
      this.position.y + offsetY,
      this.position.z + offsetZ
    );
    const lookTarget = new THREE.Vector3(this.position.x, this.position.y + 1.4, this.position.z);
    this.camera.lookAt(lookTarget);
  }

  update(delta) {
    if (!this.isLoaded || !this.model) return;

    // Animasyon mikserini güncelle
    if (this.mixer) {
      this.mixer.update(delta);
    }

    // Nişan Alma Kemik Override'ı (mixer.update'ten HEMEN SONRA)
    if (this.isAiming && this.currentWeapon === 'gun') {
      this.applyAimBoneOverride(delta);
    }

    // Mermi izleri süre aşımı kontrolü (15 sn)
    this.updateBulletHoles();

    // Karakter modu aktifken hareket ve fizik hesapla
    if (this.isActive) {
      this.updateMovement(delta);
      this.updatePhysics(delta);
    }
  }

  updateMovement(delta) {
    // Kamera açısına göre ileri ve sağ yönler (GC dostu havuzlama)
    const forward = this._tmpForward.set(-Math.sin(this.cameraYaw), 0, -Math.cos(this.cameraYaw));
    const right = this._tmpRight.set(Math.cos(this.cameraYaw), 0, -Math.sin(this.cameraYaw));

    const moveDir = this._tmpMoveDir.set(0, 0, 0);
    if (this.keys.forward) moveDir.add(forward);
    if (this.keys.backward) moveDir.sub(forward);
    if (this.keys.right) moveDir.add(right);
    if (this.keys.left) moveDir.sub(right);

    const isMoving = moveDir.lengthSq() > 0.001;

    if (isMoving && !this.isAttacking) {
      moveDir.normalize();

      // Karakter yönünü hareket açısına hızlı ve pürüzsüz çevir (yanlamasına kaymayı önler)
      this.targetRotation = Math.atan2(moveDir.x, moveDir.z);
      
      let diff = this.targetRotation - this.rotation;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      this.rotation += diff * Math.min(1.0, 18.0 * delta);
      this.model.rotation.y = this.rotation;

      // Hız ve hareket uygulama
      const speed = (this.keys.sprint ? this.runSpeed : this.walkSpeed);
      this.position.addScaledVector(moveDir, speed * delta);

      // Ev / Bina duvarı çarpışma kontrolü (Slide / MTV tabanlı yumuşak kayma)
      if (this.collisionManager) {
        this.collisionManager.resolveCircleSlide(this.position, 0.45, 0.15, this._nearColliders);
      } else {
        for (const plot of PARCEL_PLOTS) {
          const halfW = (plot.w * 0.65) * 0.5;
          const halfD = (plot.d * 0.65) * 0.5;
          const dx = this.position.x - plot.x;
          const dz = this.position.z - plot.z;
          const margin = 0.6;
          if (Math.abs(dx) < halfW + margin && Math.abs(dz) < halfD + margin) {
            const overlapX = (halfW + margin) - Math.abs(dx);
            const overlapZ = (halfD + margin) - Math.abs(dz);
            if (overlapX < overlapZ) {
              this.position.x = plot.x + Math.sign(dx || 1) * (halfW + margin);
            } else {
              this.position.z = plot.z + Math.sign(dz || 1) * (halfD + margin);
            }
          }
        }
      }

      // Şehir ve arazi sınırları (-780m ile +780m)
      this.position.x = THREE.MathUtils.clamp(this.position.x, -780, 780);
      this.position.z = THREE.MathUtils.clamp(this.position.z, -780, 780);
      this.model.position.x = this.position.x;
      this.model.position.z = this.position.z;

      // Ayak sesi
      if (this.isGrounded) {
        this.audioManager?.playFootstep(this.keys.sprint);
      }

      // Animasyon
      if (!this.isAttacking && this.isGrounded) {
        this.determineBaseAction(0.12);
      }
    } else if (!this.isAttacking && this.isGrounded) {
      this.determineBaseAction(0.14);
    }

    // ADIM 2: Oyuncu - Araç Katı Kalkan Çarpışması (Duran ve Hareket Eden Araçlar)
    this.resolveVehicleCollisions(delta);
  }

  /**
   * ADIM 2: Oyuncu ile park halindeki ve hareketli tüm araçlar arasındaki katı kalkan fiziği
   */
  resolveVehicleCollisions(delta) {
    if (!this.collisionManager || !this.isActive) return;
    const vm = this.vehicleManager || window.app?.vehicleManager;
    const vehicles = vm ? vm.vehicles : [];
    const npcs = vm?.trafficManager?.npcs || window.trafficManager?.npcs || [];
    const policePool = vm?.policeManager?.pool || window.policeManager?.pool || [];

    this.collisionManager.resolveCharacterVehicleCollisions(
      this.position,
      0.45,
      !this.isActive,
      vehicles,
      npcs,
      policePool,
      delta,
      this.audioManager,
      this
    );

    if (this.model) {
      this.model.position.x = this.position.x;
      this.model.position.z = this.position.z;
    }
  }

  updatePhysics(delta) {
    let groundElev = 0;
    if (this.collisionManager && typeof this.collisionManager.getGroundInfo === 'function') {
      groundElev = this.collisionManager.getGroundInfo(this.position.x, this.position.z, this.position.y, 'ped').elevation;
    } else if (this.terrain) {
      groundElev = this.terrain.getElevation(this.position.x, this.position.z);
    }
    const currentGround = groundElev + this.groundY;

    // Zıplama ve yerçekimi
    if (!this.isGrounded) {
      this.verticalVelocity -= this.gravity * delta;
      this.position.y += this.verticalVelocity * delta;

      // Zemin çarpışması (asfalt/tepe kotu)
      if (this.position.y <= currentGround) {
        this.position.y = currentGround;
        this.verticalVelocity = 0;
        this.isGrounded = true;
        if (!this.isAttacking) {
          this.determineBaseAction(0.15);
        }
      }
      if (this.model) this.model.position.y = this.position.y;
    } else {
      // Yürürken arazi eğimini pürüzsüz takip et
      this.position.y = currentGround;
      if (this.model) this.model.position.y = this.position.y;
    }
  }

  updateCamera(camera, delta = 0.016) {
    if (!this.isActive) return;

    // Geri tepme sönümleme (Recoil recovery)
    if (Math.abs(this.recoilOffset) > 0.0001) {
      this.recoilOffset = THREE.MathUtils.lerp(this.recoilOffset, 0, 0.14);
    } else {
      this.recoilOffset = 0;
    }

    // Hedef mesafe
    const targetDist = this.isAiming ? 2.3 : this.cameraDistance;
    this.currentCamDist = THREE.MathUtils.lerp(this.currentCamDist || this.cameraDistance, targetDist, 0.16);

    // Dinamik Omuz Ofseti Çözümü: Dar sokak ve duvar diplerinde sağ omuz duvara girerse küçült
    const desiredShoulderOffset = this.isAiming ? 0.42 : 0.0;
    const safeShoulderOffset = this.cameraSolver
      ? this.cameraSolver.solveShoulderOffset(this.position, this.cameraYaw, desiredShoulderOffset, delta)
      : desiredShoulderOffset;
    this.currentShoulderOffset = THREE.MathUtils.lerp(this.currentShoulderOffset || 0, safeShoulderOffset, 0.18);

    // Geri tepme eklenmiş efektif pitch açısı
    const effPitch = this.cameraPitch - this.recoilOffset;

    // Karakterin arkasındaki ideal kamera konumu
    const cosPitch = Math.cos(effPitch);
    const sinPitch = Math.sin(effPitch);

    const sideX = Math.cos(this.cameraYaw) * this.currentShoulderOffset;
    const sideZ = -Math.sin(this.cameraYaw) * this.currentShoulderOffset;

    const offsetX = Math.sin(this.cameraYaw) * cosPitch * this.currentCamDist + sideX;
    const offsetZ = Math.cos(this.cameraYaw) * cosPitch * this.currentCamDist + sideZ;
    const offsetY = this.cameraHeight + sinPitch * this.currentCamDist;

    this._tmpTargetPos.set(
      this.position.x + offsetX,
      this.position.y + offsetY,
      this.position.z + offsetZ
    );

    // Kameranın baktığı hedef: Karakter hizası (omuz/göğüs kotu)
    this._tmpLookTarget.set(
      this.position.x + sideX * 0.4,
      this.position.y + (this.isAiming ? 1.45 : 1.35) + this.recoilOffset * 0.8,
      this.position.z + sideZ * 0.4
    );

    // --- KAMERA OCCLUSION KONTROLÜ (GTA Stili Spherecast Koruma) ---
    if (this.cameraSolver) {
      this.cameraSolver.solve(this._tmpLookTarget, this._tmpTargetPos, delta, this._tmpTargetPos, false);
    }

    // Akıcı ve net kamera takibi (Occlusion anında duvara girmemesi için daha hızlı kenetlenir)
    const isOccluded = this.cameraSolver && this.cameraSolver.isOccluded();
    const lerpSpeed = isOccluded ? 0.75 : 0.38;
    camera.position.lerp(this._tmpTargetPos, lerpSpeed);
    camera.lookAt(this._tmpLookTarget);
  }

  // ==========================================
  // ATEŞLİ SİLAH & NİŞAN SİSTEMİ METOTLARI
  // ==========================================

  createGunModel() {
    const gunGroup = new THREE.Group();
    gunGroup.name = 'Pistol_Weapon';

    const gunMat = new THREE.MeshStandardMaterial({
      color: 0x242424,
      metalness: 0.8,
      roughness: 0.35,
      envMapIntensity: 1.0
    });

    // Gövde (Slide / Sürgü) ~18cm (0.18m uzunluk x 0.035m genişlik x 0.042m yükseklik)
    const slideGeo = new THREE.BoxGeometry(0.035, 0.042, 0.18);
    const slide = new THREE.Mesh(slideGeo, gunMat);
    slide.position.set(0, 0.04, 0.02);
    slide.castShadow = true;
    gunGroup.add(slide);

    // Namlu (Barrel) ~7cm (0.07m uzunluk x 0.024m genişlik x 0.024m yükseklik)
    // Gövdenin ön ucunda devam eder, toplam uzunluk ~25cm
    const barrelGeo = new THREE.BoxGeometry(0.024, 0.024, 0.07);
    const barrel = new THREE.Mesh(barrelGeo, gunMat);
    barrel.position.set(0, 0.045, 0.145);
    barrel.castShadow = true;
    gunGroup.add(barrel);

    // Kabza (Grip) ~11cm, geriye doğru eğik (~14 derece)
    const gripGeo = new THREE.BoxGeometry(0.032, 0.11, 0.045);
    const grip = new THREE.Mesh(gripGeo, gunMat);
    grip.position.set(0, -0.025, -0.04);
    grip.rotation.x = -0.25; // geriye eğik kabza
    grip.castShadow = true;
    gunGroup.add(grip);

    // Tetik korkuluğu (Trigger guard)
    const guardGeo = new THREE.BoxGeometry(0.02, 0.03, 0.045);
    const guard = new THREE.Mesh(guardGeo, gunMat);
    guard.position.set(0, 0.0, 0.02);
    guard.castShadow = true;
    gunGroup.add(guard);

    // Namlu ucu referans noktası
    const muzzlePoint = new THREE.Object3D();
    muzzlePoint.name = 'MuzzlePoint';
    muzzlePoint.position.set(0, 0.045, 0.18);
    gunGroup.add(muzzlePoint);

    // Flaş Efekti: Küçük turuncu PointLight + parlak plane
    const flashLight = new THREE.PointLight(0xff8822, 0, 4);
    flashLight.name = 'MuzzleFlashLight';
    muzzlePoint.add(flashLight);

    const flashGeo = new THREE.PlaneGeometry(0.18, 0.18);
    const flashMat = new THREE.MeshBasicMaterial({
      color: 0xffdd44,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });
    const flashPlane = new THREE.Mesh(flashGeo, flashMat);
    flashPlane.name = 'MuzzleFlashPlane';
    flashPlane.visible = false;
    flashPlane.position.set(0, 0, 0.02);
    muzzlePoint.add(flashPlane);

    this.gunMuzzlePoint = muzzlePoint;
    this.gunFlashLight = flashLight;
    this.gunFlashPlane = flashPlane;

    return gunGroup;
  }

  isCurrentWeaponFirearm() {
    const slot = this.weaponSlots[this.currentSlotIndex];
    return slot && slot.isFirearm;
  }

  selectSlot(index) {
    if (index < 0 || index >= this.weaponSlots.length) return;
    this.currentSlotIndex = index;
    const slot = this.weaponSlots[index];
    this.currentWeapon = slot.id;

    if (this.gunMesh) {
      this.gunMesh.visible = slot.isFirearm && this.isActive;
    }

    pedestrianAudio.playWeaponSwitch();

    if (window.app?.gameState) {
      window.app.gameState.setWeapon(slot.id, slot.isFirearm ? this.ammo : 0);
    }
  }

  cycleWeapon(direction = 1) {
    const nextIdx = (this.currentSlotIndex + direction + this.weaponSlots.length) % this.weaponSlots.length;
    this.selectSlot(nextIdx);
  }

  selectWeapon(type) {
    const idx = this.weaponSlots.findIndex(w => w.id === type || (type === 'gun' && w.id === 'pistol'));
    if (idx !== -1) {
      this.selectSlot(idx);
    } else {
      this.selectSlot(0);
    }
  }

  shoot() {
    const slot = this.weaponSlots[this.currentSlotIndex];
    if (!this.isActive || !slot || !slot.isFirearm) return;
    if (this.ammo <= 0) return;

    this.ammo--;
    if (window.app?.gameState) {
      window.app.gameState.state.player.ammo = this.ammo;
      window.app.gameState.notify('player');
    }

    // 1. Web Audio Ateş Sesi
    if (this.audioManager?.playGunshot) {
      this.audioManager.playGunshot();
    } else {
      this.playSyntheticGunshot();
    }

    // 2. Namlu Ucu Flaşı (70ms)
    this.triggerMuzzleFlash();

    // 3. Kamera Geri Tepmesi (Shotgun için yüksek, SMG için hafif)
    const recoilMult = slot.id === 'shotgun' ? 2.2 : (slot.id === 'smg' ? 0.65 : 1.0);
    this.applyRecoil(recoilMult);

    // 4. Mermi Raycast (Shotgun çoklu saçma, diğerleri tek mermi)
    if (slot.id === 'shotgun') {
      const pellets = slot.pellets || 5;
      for (let i = 0; i < pellets; i++) {
        this.fireBulletRaycast(slot.spread);
      }
    } else {
      this.fireBulletRaycast(slot.spread);
    }
  }

  triggerMuzzleFlash() {
    if (this.gunFlashLight && this.gunFlashPlane) {
      this.gunFlashLight.intensity = 4.0;
      this.gunFlashPlane.visible = true;
      this.gunFlashPlane.rotation.z = Math.random() * Math.PI * 2;

      if (this._flashTimeout) clearTimeout(this._flashTimeout);
      this._flashTimeout = setTimeout(() => {
        if (this.gunFlashLight) this.gunFlashLight.intensity = 0;
        if (this.gunFlashPlane) this.gunFlashPlane.visible = false;
      }, 70);
    }
  }

  applyRecoil(multiplier = 1.0) {
    // 1.5° (~0.026 rad) anlık yukarı tepme
    this.recoilOffset += THREE.MathUtils.degToRad(1.5 * multiplier);
    // Kameraya hafif anlık dikey itiş
    this.cameraPitch = THREE.MathUtils.clamp(this.cameraPitch - THREE.MathUtils.degToRad(0.35 * multiplier), -0.25, 0.75);
  }

  fireBulletRaycast(spread = 0) {
    const raycaster = new THREE.Raycaster();
    const screenPos = new THREE.Vector2(
      (Math.random() - 0.5) * spread * 2,
      (Math.random() - 0.5) * spread * 2
    );
    raycaster.setFromCamera(screenPos, this.camera);
    raycaster.far = 300;

    // Sahnedeki tüm görünür nesneler ile kesişim (oyuncu modeli ve mermi izleri hariç)
    const hits = raycaster.intersectObjects(this.scene.children, true);
    let validHit = null;

    for (const hit of hits) {
      if (!hit.object.visible) continue;
      if (hit.object.name === 'BulletHole' || hit.object.name.startsWith('MuzzleFlash')) continue;

      // Oyuncunun kendi gövdesi olmasın
      let curr = hit.object;
      let isPlayer = false;
      while (curr) {
        if (curr === this.model) {
          isPlayer = true;
          break;
        }
        curr = curr.parent;
      }
      if (!isPlayer && hit.face && hit.point) {
        validHit = hit;
        break;
      }
    }

    if (validHit) {
      // Yaya kontrolü: vurulan nesne bir yayaya ait mi?
      let hitPed = null;
      if (window.app?.pedestrianManager?.pool) {
        for (const ped of window.app.pedestrianManager.pool) {
          if (!ped.isActive) continue;
          let p = validHit.object;
          while (p) {
            if (p === ped.root) {
              hitPed = ped;
              break;
            }
            p = p.parent;
          }
          if (hitPed) break;
        }
      }

      if (hitPed) {
        hitPed.takeBulletHit(this.position);
      } else {
        this.createBulletHole(validHit);
      }
    }
  }

  createBulletHole(hit) {
    if (!hit.face || !hit.point) return;

    // Yüzey normalini dünya koordinatına dönüştür
    const normal = hit.face.normal.clone();
    normal.transformDirection(hit.object.matrixWorld).normalize();

    const hole = new THREE.Mesh(this._bulletHoleGeo, this._bulletHoleMat);
    hole.name = 'BulletHole';

    // Normal yönünde 2.5mm dışa ofset (Z-fighting önleme)
    hole.position.copy(hit.point).addScaledVector(normal, 0.0025);

    // Daire normali (0, 0, 1)'dir. Yüzey normaline yönlendir:
    hole.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), normal);

    this.scene.add(hole);

    // Kuyruğa ekle: Maksimum 50 adet, 15 sn ömür
    const now = performance.now();
    this.bulletHoles.push({ mesh: hole, expires: now + 15000 });

    while (this.bulletHoles.length > 50) {
      const oldest = this.bulletHoles.shift();
      this.scene.remove(oldest.mesh);
    }
  }

  updateBulletHoles() {
    if (this.bulletHoles.length === 0) return;
    const now = performance.now();
    for (let i = this.bulletHoles.length - 1; i >= 0; i--) {
      if (now >= this.bulletHoles[i].expires) {
        const item = this.bulletHoles.splice(i, 1)[0];
        this.scene.remove(item.mesh);
      }
    }
  }

  applyAimBoneOverride(delta) {
    // 1. Karakteri kameranın yatay doğrultusuna yumuşakça çevir
    const targetHeading = this.cameraYaw - Math.PI;
    let diff = targetHeading - this.rotation;
    while (diff < -Math.PI) diff += Math.PI * 2;
    while (diff > Math.PI) diff -= Math.PI * 2;
    this.rotation += diff * Math.min(1.0, 16.0 * delta);
    this.model.rotation.y = this.rotation;

    // 2. Spine Kemiği: Gövdeyi 10-15° (~0.22 rad) kameraya çevir ve dikey eğime uyum sağla
    if (this.spineBone) {
      this.spineBone.rotation.y += 0.22;
      this.spineBone.rotation.x -= this.cameraPitch * 0.35;
    }

    // 3. Sağ Kol Kemikleri (RightArm, RightForeArm, RightHand):
    // Sağ kolu kameranın baktığı yöne doğru öne/yukarı kaldır
    if (this.rightArmBone) {
      this.rightArmBone.rotation.x = -1.25 - this.cameraPitch * 0.75;
      this.rightArmBone.rotation.y = 0.22;
      this.rightArmBone.rotation.z = -1.45;
    }
    if (this.rightForeArmBone) {
      this.rightForeArmBone.rotation.x = -0.15;
      this.rightForeArmBone.rotation.y = 0.12;
      this.rightForeArmBone.rotation.z = -0.22;
    }
    if (this.rightHandBone) {
      this.rightHandBone.rotation.x = 0.05;
      this.rightHandBone.rotation.y = 0.0;
      this.rightHandBone.rotation.z = 0.0;
    }
  }

  playSyntheticGunshot() {
    try {
      const AudioCtx = window.AudioContext || window.webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = new AudioCtx();
      const now = ctx.currentTime;
      const bufferSize = Math.floor(ctx.sampleRate * 0.16);
      const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.22));
      }

      const noise = ctx.createBufferSource();
      noise.buffer = buffer;

      const filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(1600, now);
      filter.frequency.exponentialRampToValueAtTime(120, now + 0.14);

      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.42, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.15);

      const osc = ctx.createOscillator();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(160, now);
      osc.frequency.exponentialRampToValueAtTime(25, now + 0.12);

      const oscGain = ctx.createGain();
      oscGain.gain.setValueAtTime(0.32, now);
      oscGain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

      noise.connect(filter);
      filter.connect(gain);
      gain.connect(ctx.destination);

      osc.connect(oscGain);
      oscGain.connect(ctx.destination);

      noise.start(now);
      osc.start(now);
      noise.stop(now + 0.16);
      osc.stop(now + 0.13);
    } catch (e) {}
  }
}
