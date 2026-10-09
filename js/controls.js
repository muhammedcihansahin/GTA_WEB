import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

export class CameraManager {
  constructor(camera, domElement, scene, audioManager = null, characterManager = null, vehicleManager = null, collisionManager = null) {
    this.camera = camera;
    this.domElement = domElement;
    this.scene = scene;
    this.audioManager = audioManager;
    this.characterManager = characterManager;
    this.vehicleManager = vehicleManager;
    this.collisionManager = collisionManager;

    this.currentMode = 'roam'; // 'orbit' | 'roam' | 'auto'

    // Target tracking
    this.modelCenter = new THREE.Vector3(0, 0, 0);
    this.modelRadius = 15;

    // Orbit Controls
    this.orbitControls = new OrbitControls(this.camera, this.domElement);
    this.orbitControls.enableDamping = true;
    this.orbitControls.dampingFactor = 0.05;
    this.orbitControls.screenSpacePanning = true;
    this.orbitControls.minDistance = 1;
    this.orbitControls.maxDistance = 600;
    this.orbitControls.maxPolarAngle = Math.PI / 2 + 0.05; // allow slightly below horizontal
    this.orbitControls.target.set(0, 1.5, 0);

    // Free Roam / FPS Controls State
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      up: false,
      down: false,
      sprint: false
    };

    this.velocity = new THREE.Vector3();
    this.direction = new THREE.Vector3();
    this.moveSpeed = 16.0; // units/sec
    this.sprintMultiplier = 2.4;

    // Mouse look state for Free Roam
    this.euler = new THREE.Euler(0, 0, 0, 'YXZ');
    this.isPointerLocked = false;
    this.mouseSensitivity = 0.0022;

    // Camera animation / tweening state
    this.isTweening = false;
    this.tweenStartPos = new THREE.Vector3();
    this.tweenEndPos = new THREE.Vector3();
    this.tweenStartTarget = new THREE.Vector3();
    this.tweenEndTarget = new THREE.Vector3();
    this.tweenProgress = 0;
    this.tweenDuration = 1.0; // seconds

    // Cinematic Auto Tour
    this.autoTourAngle = 0;
    this.autoTourSpeed = 0.25; // radians per second
    this.autoTourHeight = 6;
    this.autoTourRadius = 24;

    // Compass UI Cache & Vector Pool
    this.compassNeedle = document.getElementById('compass-needle');
    this.compassDegLabel = document.getElementById('compass-deg');
    this._compassDir = new THREE.Vector3();
    this._roamForward = new THREE.Vector3();
    this._roamRight = new THREE.Vector3();
    this._roamLookTarget = new THREE.Vector3();
    this._roamNearColliders = [];

    this.initEvents();
  }

  initEvents() {
    // Keyboard listeners
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Pointer Lock for Free Roam
    this.domElement.addEventListener('click', () => {
      if (this.currentMode === 'roam' && !this.isPointerLocked && !this.characterManager) {
        try {
          const req = this.domElement.requestPointerLock?.();
          if (req && req.catch) req.catch(() => {});
        } catch (_) {}
      }
    });

    document.addEventListener('pointerlockchange', () => {
      this.isPointerLocked = document.pointerLockElement === this.domElement;
      const crosshair = document.getElementById('crosshair');
      if (crosshair && !this.characterManager?.isAiming) {
        crosshair.classList.add('hidden');
      }
    });

    // Mouse movement in pointer lock
    document.addEventListener('mousemove', (e) => {
      if (this.currentMode === 'roam' && this.isPointerLocked) {
        const movementX = e.movementX || 0;
        const movementY = e.movementY || 0;

        this.euler.setFromQuaternion(this.camera.quaternion);
        this.euler.y -= movementX * this.mouseSensitivity;
        this.euler.x -= movementY * this.mouseSensitivity;

        // Clamp vertical look to [-85 deg, +85 deg]
        const maxPitch = Math.PI / 2 - 0.05;
        this.euler.x = Math.max(-maxPitch, Math.min(maxPitch, this.euler.x));

        this.camera.quaternion.setFromEuler(this.euler);
      }
    });
  }

  onKeyDown(e) {
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
      case 'Space':
        this.keys.up = true;
        break;
      case 'KeyC':
        this.keys.down = true;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = true;
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
      case 'Space':
        this.keys.up = false;
        break;
      case 'KeyC':
        this.keys.down = false;
        break;
      case 'ShiftLeft':
      case 'ShiftRight':
        this.keys.sprint = false;
        break;
    }
  }

  setCharacterManager(cm) {
    this.characterManager = cm;
  }

  setMode(mode) {
    this.currentMode = mode;
    this.isTweening = false;

    const crosshair = document.getElementById('crosshair');
    const guideOrbit = document.getElementById('guide-content-orbit');
    const guideFps = document.getElementById('guide-content-fps');
    const guideTitle = document.getElementById('guide-mode-title');

    if (mode === 'orbit') {
      if (this.characterManager) {
        this.characterManager.setActive(false);
      }
      this.orbitControls.enabled = true;
      this.orbitControls.autoRotate = false;
      if (document.pointerLockElement === this.domElement) {
        document.exitPointerLock?.();
      }
      crosshair?.classList.add('hidden');
      guideOrbit?.classList.remove('hidden');
      guideFps?.classList.add('hidden');
      if (guideTitle) guideTitle.textContent = 'Yörünge Kontrolleri';
    } else if (mode === 'roam') {
      this.orbitControls.enabled = false;
      if (this.characterManager) {
        this.characterManager.setActive(true);
      } else {
        this.euler.setFromQuaternion(this.camera.quaternion);
      }
      crosshair?.classList.add('hidden');
      guideOrbit?.classList.add('hidden');
      guideFps?.classList.remove('hidden');
      if (guideTitle) guideTitle.textContent = 'Karakter Kontrolleri (3. Şahıs)';
    } else if (mode === 'auto') {
      if (this.characterManager) {
        this.characterManager.setActive(false);
      }
      this.orbitControls.enabled = true;
      this.orbitControls.autoRotate = true;
      this.orbitControls.autoRotateSpeed = 1.2;
      if (document.pointerLockElement === this.domElement) {
        document.exitPointerLock?.();
      }
      crosshair?.classList.add('hidden');
      guideOrbit?.classList.remove('hidden');
      guideFps?.classList.add('hidden');
      if (guideTitle) guideTitle.textContent = 'Sinematik Tur (Drone)';
    }
  }

  setModelBounds(center, radius) {
    this.modelCenter.copy(center);
    this.modelRadius = radius;

    this.orbitControls.target.copy(center);
    this.autoTourRadius = radius * 1.6;
    this.autoTourHeight = radius * 0.55;

    // Reset default camera perspective only in orbit mode
    if (this.currentMode === 'orbit') {
      this.setPreset('front');
    }
  }

  setPreset(presetKey) {
    const c = this.modelCenter;
    const r = this.modelRadius;

    let targetPos = new THREE.Vector3();
    let targetLook = c.clone();

    switch (presetKey) {
      case 'front':
        targetPos.set(c.x, c.y + r * 0.25, c.z + r * 1.35);
        targetLook.set(c.x, c.y + r * 0.2, c.z);
        break;
      case 'iso':
        targetPos.set(c.x + r * 1.1, c.y + r * 0.95, c.z + r * 1.1);
        targetLook.set(c.x, c.y + r * 0.1, c.z);
        break;
      case 'interior':
        // Inside room view: placed inside living room looking at furniture
        targetPos.set(c.x, c.y + 1.6, c.z + 1.2);
        targetLook.set(c.x, c.y + 1.4, c.z - 4);
        break;
      case 'top':
        // Top-down blueprint view
        targetPos.set(c.x + 0.001, c.y + r * 1.65, c.z);
        targetLook.set(c.x, 0, c.z);
        break;
      case 'neighborhood':
      case 'city':
        // Panoramic high aerial view of the entire neighborhood
        targetPos.set(0, 68, 125);
        targetLook.set(0, 6, 20);
        break;
      case 'reset':
      default:
        targetPos.set(c.x + r * 0.85, c.y + r * 0.65, c.z + r * 1.25);
        targetLook.set(c.x, c.y + r * 0.15, c.z);
        break;
    }

    this.animateTo(targetPos, targetLook);
  }

  animateTo(targetPos, targetLook, duration = 1.0) {
    this.audioManager?.playWhoosh();
    this.isTweening = true;
    this.tweenStartPos.copy(this.camera.position);
    this.tweenEndPos.copy(targetPos);
    this.tweenStartTarget.copy(this.orbitControls.target);
    this.tweenEndTarget.copy(targetLook);
    this.tweenProgress = 0;
    this.tweenDuration = duration;
  }

  update(delta) {
    this.updateCompass();

    // Handle camera smooth tweening
    if (this.isTweening) {
      this.tweenProgress += delta / this.tweenDuration;
      if (this.tweenProgress >= 1.0) {
        this.tweenProgress = 1.0;
        this.isTweening = false;
      }

      // Smooth ease-in-out curve
      const t = 0.5 - 0.5 * Math.cos(this.tweenProgress * Math.PI);
      this.camera.position.lerpVectors(this.tweenStartPos, this.tweenEndPos, t);
      this.orbitControls.target.lerpVectors(this.tweenStartTarget, this.tweenEndTarget, t);

      if (this.currentMode === 'orbit') {
        this.orbitControls.update();
      }
      return;
    }

    // Update by mode
    if (this.currentMode === 'orbit' || this.currentMode === 'auto') {
      this.orbitControls.update();
    } else if (this.currentMode === 'roam') {
      if (this.vehicleManager && this.vehicleManager.activeVehicle) {
        // Araç sürüş kamerası VehicleManager tarafından yönetilir
        return;
      }
      if (this.characterManager && this.characterManager.isActive) {
        this.characterManager.updateCamera(this.camera, delta);
      } else {
        this.updateFreeRoam(delta);
      }
    }
  }

  setVehicleManager(vm) {
    this.vehicleManager = vm;
  }

  updateCompass() {
    if (!this.compassNeedle && !this.compassDegLabel) {
      this.compassNeedle = document.getElementById('compass-needle');
      this.compassDegLabel = document.getElementById('compass-deg');
    }
    const needle = this.compassNeedle;
    const degLabel = this.compassDegLabel;
    if (!needle && !degLabel) return;

    this.camera.getWorldDirection(this._compassDir);
    const angle = Math.atan2(this._compassDir.x, this._compassDir.z);
    const deg = Math.round(((-angle * 180 / Math.PI) + 360) % 360);

    if (needle) {
      needle.style.transform = `rotate(${deg}deg)`;
    }
    if (degLabel) {
      let card = 'K';
      if (deg >= 23 && deg < 68) card = 'KD';
      else if (deg >= 68 && deg < 113) card = 'D';
      else if (deg >= 113 && deg < 158) card = 'GD';
      else if (deg >= 158 && deg < 203) card = 'G';
      else if (deg >= 203 && deg < 248) card = 'GB';
      else if (deg >= 248 && deg < 293) card = 'B';
      else if (deg >= 293 && deg < 338) card = 'KB';
      degLabel.textContent = `${deg}° ${card}`;
    }
  }

  updateFreeRoam(delta) {
    // Movement calculation
    const speed = this.moveSpeed * (this.keys.sprint ? this.sprintMultiplier : 1.0);
    this.velocity.set(0, 0, 0);

    // Camera forward and right vectors projected onto XZ plane
    const forward = this._roamForward.set(0, 0, -1).applyQuaternion(this.camera.quaternion);
    const right = this._roamRight.set(1, 0, 0).applyQuaternion(this.camera.quaternion);

    if (this.keys.forward) this.velocity.add(forward);
    if (this.keys.backward) this.velocity.sub(forward);
    if (this.keys.right) this.velocity.add(right);
    if (this.keys.left) this.velocity.sub(right);
    if (this.keys.up) this.velocity.y += 1;
    if (this.keys.down) this.velocity.y -= 1;

    if (this.velocity.lengthSq() > 0) {
      this.velocity.normalize().multiplyScalar(speed * delta);
      this.camera.position.add(this.velocity);

      // Play footstep if moving horizontally on ground level
      if (Math.abs(this.velocity.x) > 0.001 || Math.abs(this.velocity.z) > 0.001) {
        if (this.camera.position.y < 3.0) {
          this.audioManager?.playFootstep(this.keys.sprint);
        }
      }

      // Keep at street eye-level above ground and sidewalk
      if (this.camera.position.y < 1.7) {
        this.camera.position.y = 1.7;
      }

      // Duvar/bina çarpışma kayması (Slide)
      if (this.collisionManager) {
        this.collisionManager.resolveCircleSlide(this.camera.position, 0.4, 0.1, this._roamNearColliders);
      }
    }

    // Keep orbit controls target in sync with forward view (Zero-allocation)
    this._roamLookTarget.copy(this.camera.position).addScaledVector(forward, 5);
    this.orbitControls.target.copy(this._roamLookTarget);
  }
}
