/**
 * FirefighterMissionManager.js - GTA San Andreas Tarzı İtfaiye Yan Görevi FSM & Su Jeti (ADIM 1)
 * 
 * Özellikler:
 * 1. 12 Kademeli Yangın Söndürme Görevi (Level 1 - 12)
 * 2. Dinamik Yangın Odakları (Burning Vehicles & Pedestrians):
 *    - 3D Alev & Duman Partikülleri, dans eden ışık titremesi, alev can barı
 * 3. Tazyikli Su Jeti Mekaniği (Water Cannon):
 *    - İtfaiye tavan su nozülünden yüksek hızlı su damlacıkları akışı
 *    - Web Audio tazyikli su jeti ve alev cızırtısı/buharlaşma sesi
 * 4. Dinamik Süre ve Terk Sayacı (20s)
 * 5. Seviye 12 Ödülü: CJ Kalıcı Yanmazlık (Fireproof) Yeteneği + $10,000
 */

import * as THREE from 'three';
import { emergencyAudio } from './EmergencyAudio.js';

export class FirefighterMissionManager {
  constructor(scene, camera, vehicleManager, characterManager, uiManager) {
    this.scene = scene;
    this.camera = camera;
    this.vehicleManager = vehicleManager;
    this.characterManager = characterManager;
    this.uiManager = uiManager;

    this.isActive = false;
    this.currentLevel = 1;
    this.maxLevel = 12;
    this.timeRemaining = 0;
    this.abandonTimer = 0;
    this.isAbandoned = false;

    // Aktif Yangın Odakları
    this.fires = [];
    this.firesExtinguishedThisLevel = 0;
    this.totalFiresThisLevel = 0;

    // Tazyikli Su Jeti Partikül Sistemi
    this.isSprayingWater = false;
    this.waterParticles = [];
    this.maxWaterParticles = 120;
    this.waterParticleGroup = new THREE.Group();
    this.waterParticleGroup.name = 'WaterSpray_Particles';
    this.scene.add(this.waterParticleGroup);
    this._initWaterParticles();

    // Giriş Kontrolleri (Fare Sol Tık & Space)
    this._isPointerDown = false;
    this._isSpaceDown = false;
    this._bindControls();

    // Global Referans
    window.firefighterMission = this;
  }

  /**
   * Su Jeti Havuzunu Hazırlar (Zero GC Particle Pool)
   */
  _initWaterParticles() {
    const geom = new THREE.SphereGeometry(0.12, 6, 6);
    const mat = new THREE.MeshBasicMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.75
    });

    for (let i = 0; i < this.maxWaterParticles; i++) {
      const mesh = new THREE.Mesh(geom, mat);
      mesh.visible = false;
      this.waterParticleGroup.add(mesh);
      this.waterParticles.push({
        mesh,
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        life: 0,
        maxLife: 1.0,
        active: false
      });
    }
  }

  /**
   * Fare ve Klavye Kontrollerini Dinler
   */
  _bindControls() {
    window.addEventListener('mousedown', (e) => {
      if (e.button === 0) this._isPointerDown = true;
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this._isPointerDown = false;
    });

    window.addEventListener('keydown', (e) => {
      if (e.code === 'Space') {
        const activeVeh = this.vehicleManager?.activeVehicle;
        if (activeVeh && activeVeh.type === 'fire_truck') {
          this._isSpaceDown = true;
        }
      }
    });
    window.addEventListener('keyup', (e) => {
      if (e.code === 'Space') this._isSpaceDown = false;
    });
  }

  /**
   * Görevi Başlat / Aç-Kapa
   */
  toggleMission() {
    const activeVeh = this.vehicleManager?.activeVehicle;
    if (!this.isActive) {
      if (!activeVeh || activeVeh.type !== 'fire_truck') {
        this.showNotification('İtfaiye görevine başlamak için bir İTFAİYE ARACINDA olmalısın!', 2500);
        return;
      }
      this.startMission();
    } else {
      this.cancelMission('İtfaiye Görevi İptal Edildi.');
    }
  }

  /**
   * Firefighter Görevini Başlatır
   */
  startMission(startLevel = 1) {
    this.isActive = true;
    this.currentLevel = startLevel;
    this.isAbandoned = false;
    this.abandonTimer = 0;
    this.firesExtinguishedThisLevel = 0;

    const activeVeh = this.vehicleManager?.activeVehicle;
    if (activeVeh && activeVeh.userData?.updateSirens) {
      activeVeh.sirenActive = true;
      emergencyAudio.startSiren('wail', activeVeh.position);
    }

    emergencyAudio.playMissionStartChime();
    this.showMissionBanner(`FIREFIGHTER MISSION`, `LEVEL ${this.currentLevel}`);

    this._setupLevel(this.currentLevel);
    console.log(`🚒 [FirefighterMission] Level ${this.currentLevel} başlatıldı!`);
  }

  /**
   * Seviye Kurulumu: Yangın Odaklarını Belirler
   */
  _setupLevel(level) {
    this._clearFires();
    this.totalFiresThisLevel = level;
    this.firesExtinguishedThisLevel = 0;
    this.timeRemaining = 45 + (level * 32);

    const candidateSpots = [
      new THREE.Vector3(-14.0, 0.08, 16.0),
      new THREE.Vector3(12.0, 0.08, 22.0),
      new THREE.Vector3(-26.0, 0.08, -12.0),
      new THREE.Vector3(8.0, 0.08, -24.0),
      new THREE.Vector3(26.0, 0.08, 10.0),
      new THREE.Vector3(-32.0, 0.08, 15.0),
      new THREE.Vector3(18.0, 0.08, -35.0),
      new THREE.Vector3(-6.0, 0.08, -48.0),
      new THREE.Vector3(34.0, 0.08, -6.0),
      new THREE.Vector3(-18.0, 0.08, 42.0),
      new THREE.Vector3(24.0, 0.08, 34.0),
      new THREE.Vector3(-2.0, 0.08, 52.0)
    ];

    const shuffled = [...candidateSpots].sort(() => 0.5 - Math.random());
    const count = Math.min(level, candidateSpots.length);

    for (let i = 0; i < count; i++) {
      const f = this._createFireTarget(shuffled[i], i + 1);
      this.fires.push(f);
      this.scene.add(f.group);
    }
  }

  /**
   * 3D Yanan Hedef (Alev & Duman & Alev Işığı)
   */
  _createFireTarget(pos, id) {
    const group = new THREE.Group();
    group.name = `FireTarget_${id}`;
    group.position.copy(pos);

    // Yanan Araç / Enkaz Gövdesi
    const wreckMat = new THREE.MeshStandardMaterial({
      color: 0x1a1a1a,
      roughness: 0.95
    });
    const wreckGeom = new THREE.BoxGeometry(2.0, 0.9, 4.0);
    const wreck = new THREE.Mesh(wreckGeom, wreckMat);
    wreck.position.y = 0.45;
    wreck.castShadow = true;
    group.add(wreck);

    // Titreyen Alev Işığı (Turuncu/Sarı)
    const fireLight = new THREE.PointLight(0xff6600, 2.5, 14, 1.5);
    fireLight.position.set(0, 1.2, 0);
    group.add(fireLight);

    // 3D Dans Eden Alev Blokları
    const flameMat = new THREE.MeshBasicMaterial({
      color: 0xff3300,
      transparent: true,
      opacity: 0.85
    });
    const flameInnerMat = new THREE.MeshBasicMaterial({
      color: 0xffcc00,
      transparent: true,
      opacity: 0.9
    });

    const flames = [];
    for (let i = 0; i < 5; i++) {
      const h = 0.9 + Math.random() * 0.7;
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.35, h, 8), (i % 2 === 0 ? flameMat : flameInnerMat));
      cone.position.set(
        (Math.random() - 0.5) * 1.4,
        0.9 + h * 0.5,
        (Math.random() - 0.5) * 2.6
      );
      group.add(cone);
      flames.push({
        mesh: cone,
        baseY: cone.position.y,
        speed: 8 + Math.random() * 6,
        phase: Math.random() * Math.PI * 2
      });
    }

    return {
      id,
      group,
      wreck,
      fireLight,
      flames,
      position: pos.clone(),
      health: 100, // Alev canı
      isExtinguished: false
    };
  }

  /**
   * Kare Başı Güncelleme Döngüsü
   */
  update(dt) {
    if (!this.isActive) return;

    // 1. İtfaiye Aracında mıyız?
    const activeVeh = this.vehicleManager?.activeVehicle;
    const isInsideFireTruck = (activeVeh && activeVeh.type === 'fire_truck');

    if (!isInsideFireTruck) {
      if (!this.isAbandoned) {
        this.isAbandoned = true;
        this.abandonTimer = 20.0;
        this.showNotification('İtfaiye aracına dön! Görev iptal ediliyor: 20s', 2000);
      }
      this.abandonTimer -= dt;
      if (this.abandonTimer <= 0) {
        this.failMission('İtfaiye Aracını Terk Ettin! Görev Başarısız.');
        return;
      }
    } else {
      if (this.isAbandoned) {
        this.isAbandoned = false;
        this.abandonTimer = 0;
        this.showNotification('İtfaiye aracına geri dönüldü!', 1500);
      }
    }

    // 2. Zaman Sayacı
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.failMission('Süre Bitti! Yangın şehre yayıldı.');
      return;
    }

    // 3. Su Jeti ve Taret Kontrolü
    const wantSpray = (this._isPointerDown || this._isSpaceDown) && isInsideFireTruck;
    this._updateWaterCannon(dt, activeVeh, wantSpray);

    // 4. Yangın Odaklarının Dans Eden Alevleri ve Söndürme Kontrolü
    this._updateFires(dt);

    // 5. HUD Ekran Çizimi
    this._renderHUD();
  }

  /**
   * Tazyikli Su Jeti Püskürtme ve Partikül Fiziği
   */
  _updateWaterCannon(dt, fireTruck, wantSpray) {
    if (wantSpray && !this.isSprayingWater) {
      this.isSprayingWater = true;
      emergencyAudio.startWaterSpray();
    } else if (!wantSpray && this.isSprayingWater) {
      this.isSprayingWater = false;
      emergencyAudio.stopWaterSpray();
    }

    let nozzlePos = null;
    let forwardDir = null;

    if (fireTruck) {
      const rootMesh = fireTruck.root?.children[0]?.children[0]; // chassis / body
      if (rootMesh && rootMesh.userData?.getNozzleWorldPos) {
        nozzlePos = rootMesh.userData.getNozzleWorldPos();
      } else {
        nozzlePos = fireTruck.position.clone().add(new THREE.Vector3(0, 2.5, 0));
      }

      // Aracın baktığı yön (Heading)
      forwardDir = new THREE.Vector3(
        -Math.sin(fireTruck.heading),
        0.08, // Hafif yukarı açılı
        -Math.cos(fireTruck.heading)
      ).normalize();
    }

    // Su partiküllerini fışkırt
    if (wantSpray && nozzlePos && forwardDir) {
      for (let k = 0; k < 3; k++) {
        const p = this.waterParticles.find(part => !part.active);
        if (p) {
          p.active = true;
          p.mesh.visible = true;
          p.life = 0;
          p.maxLife = 0.95;
          p.pos.copy(nozzlePos);

          // Püskürme koni saçılması
          const spread = 0.08;
          const spreadX = (Math.random() - 0.5) * spread;
          const spreadY = (Math.random() - 0.5) * spread;
          const spreadZ = (Math.random() - 0.5) * spread;

          const sprayVel = forwardDir.clone().add(new THREE.Vector3(spreadX, spreadY, spreadZ)).multiplyScalar(32.0);
          p.vel.copy(sprayVel);
          p.mesh.position.copy(p.pos);
        }
      }
    }

    // Aktif su partiküllerini ilerlet
    for (const p of this.waterParticles) {
      if (!p.active) continue;

      p.life += dt;
      if (p.life >= p.maxLife || p.pos.y < 0.05) {
        p.active = false;
        p.mesh.visible = false;
        continue;
      }

      // Yerçekimi ve hava direnci
      p.vel.y -= 14.0 * dt;
      p.pos.addScaledVector(p.vel, dt);
      p.mesh.position.copy(p.pos);

      // Yangın odaklarıyla çarpışma kontrolü
      for (const fire of this.fires) {
        if (fire.isExtinguished) continue;

        const d = p.pos.distanceTo(fire.position);
        if (d < 3.2) {
          // Su alevle buluştu!
          fire.health -= dt * 65.0; // Yangını hızla söndür
          emergencyAudio.playExtinguishSizzle();

          // Partikülü söndürme buharına dönüştür ve yok et
          p.active = false;
          p.mesh.visible = false;
          break;
        }
      }
    }
  }

  /**
   * Yangın Odaklarının Canı ve Görsellerini Günceller
   */
  _updateFires(dt) {
    const t = Date.now() * 0.001;

    for (const fire of this.fires) {
      if (fire.isExtinguished) continue;

      // Alev ışığı titremesi
      if (fire.fireLight) {
        const ratio = Math.max(0, fire.health / 100);
        fire.fireLight.intensity = (1.8 + Math.sin(t * 18.0) * 0.8) * ratio;
      }

      // Dans eden alevler
      for (const fl of fire.flames) {
        const s = Math.sin(t * fl.speed + fl.phase);
        fl.mesh.scale.set(1 + s * 0.25, 1 + s * 0.35, 1 + s * 0.25);
      }

      // Yangın tamamen söndü mü?
      if (fire.health <= 0) {
        this._extinguishFire(fire);
      }
    }
  }

  /**
   * Yangını Söndürme
   */
  _extinguishFire(fire) {
    fire.isExtinguished = true;
    fire.health = 0;
    this.firesExtinguishedThisLevel++;
    this.timeRemaining += 25.0; // Her söndürülen yangın için +25 saniye

    // Alevleri ve ışığı kapat
    if (fire.fireLight) fire.fireLight.intensity = 0;
    for (const fl of fire.flames) {
      fl.mesh.visible = false;
    }

    emergencyAudio.playPatientRescueDing();
    this.showNotification(`Yangın Söndürüldü! (${this.firesExtinguishedThisLevel}/${this.totalFiresThisLevel}) +25s`, 2500);

    // Seviyedeki tüm yangınlar bitti mi?
    if (this.firesExtinguishedThisLevel >= this.totalFiresThisLevel) {
      this._completeLevel();
    }
  }

  /**
   * Seviye Tamamlama
   */
  _completeLevel() {
    emergencyAudio.playMissionSuccessFanfare();
    const bonus = this.currentLevel * 500;
    if (window.app?.addMoney) {
      window.app.addMoney(bonus);
    }

    this.showMissionBanner(`FIREFIGHTER LEVEL ${this.currentLevel} PASSED!`, `Ödül: $${bonus}`);

    if (this.currentLevel >= this.maxLevel) {
      this._completeEntireMission();
    } else {
      this.currentLevel++;
      setTimeout(() => {
        if (this.isActive) {
          this._setupLevel(this.currentLevel);
          this.showMissionBanner(`FIREFIGHTER MISSION`, `LEVEL ${this.currentLevel}`);
        }
      }, 3500);
    }
  }

  /**
   * 12 Seviyenin Tamamı Başarıyla Bitirildiğinde
   */
  _completeEntireMission() {
    this.isActive = false;
    this._clearFires();

    // CJ Kalıcı Yanmazlık (Fireproof) Yeteneği
    if (window.app?.characterManager) {
      window.app.characterManager.isFireproof = true;
    }
    if (window.app?.addMoney) {
      window.app.addMoney(10000);
    }

    emergencyAudio.playMissionSuccessFanfare();
    this.showMissionBanner(
      `FIREFIGHTER MASTER!`,
      `CJ Kalıcı Olarak Yanmaz (Fireproof) Oldu! +$10,000`
    );
  }

  /**
   * Görev Başarısızlığı
   */
  failMission(reason) {
    this.isActive = false;
    this._clearFires();
    emergencyAudio.playMissionFailBuzzer();
    this.showMissionBanner(`FIREFIGHTER MISSION FAILED`, reason);
  }

  /**
   * Görevi İptal Et
   */
  cancelMission(reason = 'Görev İptal Edildi.') {
    this.isActive = false;
    this._clearFires();
    this.showNotification(reason, 2000);
  }

  /**
   * Yangınları Temizler
   */
  _clearFires() {
    for (const f of this.fires) {
      if (f.group && f.group.parent) {
        this.scene.remove(f.group);
      }
    }
    this.fires = [];
  }

  /**
   * HUD Arayüz Çizimi
   */
  _renderHUD() {
    let el = document.getElementById('gta-emergency-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta-emergency-hud';
      el.className = 'gta-emergency-hud-container';
      document.body.appendChild(el);
    }

    if (!this.isActive) {
      el.style.display = 'none';
      return;
    }

    el.style.display = 'block';

    const mins = Math.floor(Math.max(0, this.timeRemaining) / 60);
    const secs = Math.floor(Math.max(0, this.timeRemaining) % 60);
    const timeStr = `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;

    let subMsg = '';
    if (this.isAbandoned) {
      subMsg = `<div class="gta-emerg-warning">İTFAİYE ARACINA DÖN: ${Math.ceil(this.abandonTimer)}s</div>`;
    } else {
      const remainingFires = this.totalFiresThisLevel - this.firesExtinguishedThisLevel;
      subMsg = `<div class="gta-emerg-info">🔥 Kalan Yangınlar: ${remainingFires} • [Sol Tık/Space] Su Fışkırt</div>`;
    }

    el.innerHTML = `
      <div class="gta-emerg-header">FIREFIGHTER - LEVEL ${this.currentLevel}</div>
      <div class="gta-emerg-timer ${this.timeRemaining < 15 ? 'urgent' : ''}">TIME: ${timeStr}</div>
      ${subMsg}
    `;
  }

  showNotification(msg, duration = 2500) {
    if (this.uiManager?.showNotification) {
      this.uiManager.showNotification(msg, duration);
    } else {
      console.log(`[Firefighter] ${msg}`);
    }
  }

  showMissionBanner(title, sub) {
    let banner = document.getElementById('gta-mission-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.id = 'gta-mission-banner';
      banner.className = 'gta-mission-banner-box';
      document.body.appendChild(banner);
    }
    banner.innerHTML = `
      <div class="gta-banner-title">${title}</div>
      <div class="gta-banner-sub">${sub}</div>
    `;
    banner.classList.add('active');
    setTimeout(() => {
      banner.classList.remove('active');
    }, 3800);
  }
}
