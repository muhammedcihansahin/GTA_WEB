/**
 * PickupManager.js - GTA San Andreas Tarzı Dünya İçi Toplanabilir Öğeler (ADIM 14)
 * Dönen 3D Kırmızı Can Kalbi, Çelik Yelek Zırhı, Düşen Para Desteleri ve Cephane Sandıkları.
 * Otantik Web Audio sesleri, dinamik ışıklar, HUD popupları ve respawn döngüsü.
 */
import * as THREE from 'three';
import { gameState } from './GameStateManager.js';
import { pedestrianAudio } from '../pedestrian/PedestrianAudio.js';

export const PickupType = {
  HEALTH: 'HEALTH',
  ARMOR: 'ARMOR',
  MONEY: 'MONEY',
  AMMO: 'AMMO'
};

export class PickupManager {
  constructor(scene) {
    this.scene = scene;
    this.pickups = [];
    this.pickupGroup = new THREE.Group();
    this.pickupGroup.name = 'WorldPickups';
    this.scene.add(this.pickupGroup);

    this.animTime = 0;

    // Statik Los Santos Dünya İçi Spawn Noktaları
    this._initStaticPickups();

    // Debug Kısayolları
    this._setupGlobalDebugHooks();
  }

  /* =========================================================
     1. STATİK DÜNYA İÇİ SPAWN NOKTALARI
     ========================================================= */
  _initStaticPickups() {
    // 1. Can Kalpleri (Kırmızı)
    this.createPickup(PickupType.HEALTH, new THREE.Vector3(-182, 0.6, -25), true, 45); // CJ Evi Arkası
    this.createPickup(PickupType.HEALTH, new THREE.Vector3(45, 0.6, -110), true, 45);  // Idlewood Benzinlik Arkası

    // 2. Çelik Yelek Zırhları (Mavi)
    this.createPickup(PickupType.ARMOR, new THREE.Vector3(-120, 0.6, -28), true, 60);  // Grove Giriş Köprü Altı
    this.createPickup(PickupType.ARMOR, new THREE.Vector3(85, 0.6, -160), true, 60);   // Idlewood Motel Arkası

    // 3. Cephane Sandığı (Sarı/Altın)
    this.createPickup(PickupType.AMMO, new THREE.Vector3(80, 0.6, -135), true, 40);    // Cluckin' Bell Otoparkı

    // 4. Nakit Para Destesi
    this.createPickup(PickupType.MONEY, new THREE.Vector3(-60, 0.6, 40), true, 30, 150); // Ganton Ara Sokak
  }

  /* =========================================================
     2. 3D PROCEDURAL MESH OLUŞTURUCULARI
     ========================================================= */
  _createHealthMesh() {
    const group = new THREE.Group();

    // 3D Kırmızı Kalp Mesh'i (Bileşik Küreler ve Koni)
    const heartMat = new THREE.MeshStandardMaterial({
      color: 0xef4444,
      roughness: 0.25,
      metalness: 0.4,
      emissive: 0x991b1b,
      emissiveIntensity: 0.35
    });

    const lobeGeom = new THREE.SphereGeometry(0.24, 16, 16);
    const leftLobe = new THREE.Mesh(lobeGeom, heartMat);
    leftLobe.position.set(-0.14, 0.14, 0);
    group.add(leftLobe);

    const rightLobe = new THREE.Mesh(lobeGeom, heartMat);
    rightLobe.position.set(0.14, 0.14, 0);
    group.add(rightLobe);

    const coneGeom = new THREE.ConeGeometry(0.36, 0.52, 16);
    coneGeom.rotateX(Math.PI);
    const cone = new THREE.Mesh(coneGeom, heartMat);
    cone.position.set(0, -0.12, 0);
    group.add(cone);

    // Kırmızı Işık Halesi
    const light = new THREE.PointLight(0xef4444, 1.2, 5.5);
    light.position.set(0, 0.2, 0);
    group.add(light);

    return group;
  }

  _createArmorMesh() {
    const group = new THREE.Group();

    // 3D Taktik Çelik Yelek (Koyu Mavi / Metalik Plaka)
    const vestMat = new THREE.MeshStandardMaterial({
      color: 0x1e3a8a, // Koyu Taktik Mavisi
      roughness: 0.4,
      metalness: 0.6,
      emissive: 0x1d4ed8,
      emissiveIntensity: 0.3
    });

    // Göğüs Plakası
    const chestGeom = new THREE.BoxGeometry(0.52, 0.58, 0.22);
    const chest = new THREE.Mesh(chestGeom, vestMat);
    group.add(chest);

    // Omuz Askıları
    const strapMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.8 });
    const strapGeom = new THREE.BoxGeometry(0.12, 0.22, 0.24);

    const leftStrap = new THREE.Mesh(strapGeom, strapMat);
    leftStrap.position.set(-0.2, 0.35, 0);
    group.add(leftStrap);

    const rightStrap = new THREE.Mesh(strapGeom, strapMat);
    rightStrap.position.set(0.2, 0.35, 0);
    group.add(rightStrap);

    // Mavi Işık Halesi
    const light = new THREE.PointLight(0x3b82f6, 1.2, 5.5);
    light.position.set(0, 0.2, 0);
    group.add(light);

    return group;
  }

  _createMoneyMesh() {
    const group = new THREE.Group();

    // Yeşil Banknot Destesi
    const billMat = new THREE.MeshStandardMaterial({
      color: 0x16a34a, // Otantik Dolar Yeşili
      roughness: 0.5,
      emissive: 0x15803d,
      emissiveIntensity: 0.3
    });
    const stackGeom = new THREE.BoxGeometry(0.48, 0.16, 0.26);
    const stack = new THREE.Mesh(stackGeom, billMat);
    group.add(stack);

    // Altın Para Bandı
    const bandMat = new THREE.MeshStandardMaterial({ color: 0xfacc15, metalness: 0.8, roughness: 0.3 });
    const bandGeom = new THREE.BoxGeometry(0.12, 0.17, 0.27);
    const band = new THREE.Mesh(bandGeom, bandMat);
    group.add(band);

    // Yeşil Işık Halesi
    const light = new THREE.PointLight(0x22c55e, 0.9, 4.0);
    light.position.set(0, 0.15, 0);
    group.add(light);

    return group;
  }

  _createAmmoMesh() {
    const group = new THREE.Group();

    // Askeri Yeşil Metal Sandık
    const boxMat = new THREE.MeshStandardMaterial({
      color: 0x4d7c0f, // Haki Yeşil
      roughness: 0.6,
      metalness: 0.5,
      emissive: 0x3f6212,
      emissiveIntensity: 0.25
    });
    const boxGeom = new THREE.BoxGeometry(0.42, 0.28, 0.32);
    const box = new THREE.Mesh(boxGeom, boxMat);
    group.add(box);

    // Sarı Pirinç Kovanlar
    const brassMat = new THREE.MeshStandardMaterial({ color: 0xeab308, metalness: 0.9, roughness: 0.2 });
    const bulletGeom = new THREE.CylinderGeometry(0.035, 0.035, 0.18, 8);
    for (let i = -1; i <= 1; i++) {
      const bullet = new THREE.Mesh(bulletGeom, brassMat);
      bullet.position.set(i * 0.1, 0.18, 0);
      group.add(bullet);
    }

    // Sarı Işık Halesi
    const light = new THREE.PointLight(0xfacc15, 1.1, 5.0);
    light.position.set(0, 0.2, 0);
    group.add(light);

    return group;
  }

  /* =========================================================
     3. TOPLANABİLİR ÖĞE ÜRETİMİ VE YÖNETİMİ
     ========================================================= */
  createPickup(type, position, isStatic = false, respawnDelay = 45, value = 100) {
    let mesh = null;
    switch (type) {
      case PickupType.HEALTH:
        mesh = this._createHealthMesh();
        break;
      case PickupType.ARMOR:
        mesh = this._createArmorMesh();
        break;
      case PickupType.MONEY:
        mesh = this._createMoneyMesh();
        break;
      case PickupType.AMMO:
        mesh = this._createAmmoMesh();
        break;
      default:
        mesh = this._createHealthMesh();
    }

    mesh.position.copy(position);
    this.pickupGroup.add(mesh);

    const pickup = {
      type,
      mesh,
      basePos: position.clone(),
      isStatic,
      respawnDelay,
      respawnTimer: 0,
      isActive: true,
      value,
      radius: 1.8
    };

    this.pickups.push(pickup);
    return pickup;
  }

  /**
   * Düşen düşmandan yere para bırakır
   */
  spawnMoneyAt(x, y, z, amount = 150) {
    const pos = new THREE.Vector3(x, y + 0.35, z);
    return this.createPickup(PickupType.MONEY, pos, false, 0, amount);
  }

  /* =========================================================
     4. ÇARPIŞMA VE ETKİLEŞİM DÖNGÜSÜ
     ========================================================= */
  update(delta, playerPos) {
    this.animTime += delta;

    this.pickups.forEach((pickup) => {
      // 1. Respawn Sayacı Kontrolü
      if (!pickup.isActive) {
        if (pickup.isStatic) {
          pickup.respawnTimer -= delta;
          if (pickup.respawnTimer <= 0) {
            pickup.isActive = true;
            pickup.mesh.visible = true;
          }
        }
        return;
      }

      // 2. Y ekseninde süzülme ve sürekli rotasyon animasyonu
      pickup.mesh.rotation.y += delta * 2.4;
      pickup.mesh.position.y = pickup.basePos.y + Math.sin(this.animTime * 3.2 + pickup.basePos.x) * 0.16;

      // 3. Oyuncu ile Mesafe Kontrolü
      const dist = playerPos.distanceTo(pickup.mesh.position);
      if (dist <= pickup.radius) {
        this._collectPickup(pickup);
      }
    });
  }

  _collectPickup(pickup) {
    let collected = false;

    switch (pickup.type) {
      case PickupType.HEALTH:
        if (gameState.state.player.health < gameState.state.player.maxHealth) {
          gameState.heal(50);
          pedestrianAudio.playPickupHealth();
          this._showPickupPopup('+50 CAN', '#ef4444');
          collected = true;
        }
        break;

      case PickupType.ARMOR:
        if (gameState.state.player.armor < gameState.state.player.maxArmor) {
          gameState.addArmor(100);
          pedestrianAudio.playPickupArmor();
          this._showPickupPopup('+100 ZIRH', '#3b82f6');
          collected = true;
        }
        break;

      case PickupType.MONEY:
        gameState.addMoney(pickup.value);
        pedestrianAudio.playPickupMoney();
        this._showPickupPopup(`+$${pickup.value}`, '#22c55e');
        collected = true;
        break;

      case PickupType.AMMO:
        gameState.addAmmo(50);
        if (window.app?.characterManager) {
          window.app.characterManager.ammo = (window.app.characterManager.ammo || 0) + 50;
        }
        pedestrianAudio.playPickupAmmo();
        this._showPickupPopup('+50 CEPHANE', '#facc15');
        collected = true;
        break;
    }

    if (collected) {
      pickup.isActive = false;
      pickup.mesh.visible = false;

      if (pickup.isStatic) {
        pickup.respawnTimer = pickup.respawnDelay;
      } else {
        // Dinamik bırakılan parayı sahneden tamamen kaldır
        this.pickupGroup.remove(pickup.mesh);
        const idx = this.pickups.indexOf(pickup);
        if (idx !== -1) this.pickups.splice(idx, 1);
      }
    }
  }

  _showPickupPopup(text, color = '#22c55e') {
    let popup = document.getElementById('pickup-notification-popup');
    if (!popup) {
      popup = document.createElement('div');
      popup.id = 'pickup-notification-popup';
      popup.style.cssText = `
        position: fixed;
        top: 28%;
        right: 45px;
        font-family: 'Pricedown', 'Impact', sans-serif;
        font-size: 32px;
        letter-spacing: 1.5px;
        text-shadow: -2px -2px 0 #000, 2px -2px 0 #000, -2px 2px 0 #000, 2px 2px 0 #000, 0 4px 12px rgba(0,0,0,0.85);
        z-index: 9999;
        pointer-events: none;
        opacity: 0;
        transform: translateY(10px) scale(0.9);
        transition: opacity 0.25s ease, transform 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      `;
      document.body.appendChild(popup);
    }

    popup.textContent = text;
    popup.style.color = color;
    popup.style.opacity = '1';
    popup.style.transform = 'translateY(0) scale(1)';

    if (this._popupTimeout) clearTimeout(this._popupTimeout);
    this._popupTimeout = setTimeout(() => {
      popup.style.opacity = '0';
      popup.style.transform = 'translateY(-12px) scale(0.9)';
    }, 2200);
  }

  /* =========================================================
     5. GELİŞTİRİCİ TEST VE KISAYOL METOTLARI
     ========================================================= */
  _setupGlobalDebugHooks() {
    window.spawnHealthPickupAhead = (dist = 4.0) => {
      const p = window.app?.characterManager?.position || new THREE.Vector3();
      const pos = new THREE.Vector3(p.x, p.y + 0.5, p.z - dist);
      this.createPickup(PickupType.HEALTH, pos, false, 0);
      console.log(`❤️ [PICKUP] Önünüze Can Kalbi yerleştirildi.`);
    };

    window.spawnArmorPickupAhead = (dist = 4.0) => {
      const p = window.app?.characterManager?.position || new THREE.Vector3();
      const pos = new THREE.Vector3(p.x, p.y + 0.5, p.z - dist);
      this.createPickup(PickupType.ARMOR, pos, false, 0);
      console.log(`🛡️ [PICKUP] Önünüze Çelik Yelek Zırhı yerleştirildi.`);
    };

    window.spawnMoneyPickupAhead = (dist = 4.0, amount = 250) => {
      const p = window.app?.characterManager?.position || new THREE.Vector3();
      const pos = new THREE.Vector3(p.x, p.y + 0.5, p.z - dist);
      this.createPickup(PickupType.MONEY, pos, false, 0, amount);
      console.log(`💵 [PICKUP] Önünüze $${amount} Nakit Para Destesi yerleştirildi.`);
    };

    window.spawnAmmoPickupAhead = (dist = 4.0) => {
      const p = window.app?.characterManager?.position || new THREE.Vector3();
      const pos = new THREE.Vector3(p.x, p.y + 0.5, p.z - dist);
      this.createPickup(PickupType.AMMO, pos, false, 0);
      console.log(`📦 [PICKUP] Önünüze Cephane Sandığı yerleştirildi.`);
    };

    window.teleportToPickup = (type = 'health') => {
      const t = type.toUpperCase();
      const p = this.pickups.find(item => item.type === t && item.isStatic);
      if (p && window.teleportPlayer) {
        window.teleportPlayer(p.basePos.x + 1.2, p.basePos.z);
        console.log(`📍 [PICKUP] ${t} konumuna ışınlanıldı.`);
      }
    };
  }
}
