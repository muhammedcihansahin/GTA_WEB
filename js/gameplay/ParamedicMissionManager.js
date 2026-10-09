/**
 * ParamedicMissionManager.js - GTA San Andreas Tarzı Ambulans Yan Görevi FSM (ADIM 1)
 * 
 * Özellikler:
 * 1. 12 Kademeli Görev Döngüsü (Level 1 - 12)
 * 2. Yaralı Hasta (Patient) FSM:
 *    - Yerde yatma, acı çekme animasyonu, ambulans yaklaştığında doğrulma
 *    - Ambulansın yanına/arkasına koşarak binme (Boarding FSM)
 *    - Ambulans kapasitesi (maksimum 3 hasta), aşamalı taşıma
 * 3. Los Santos County Hospital Acil Teslim Noktası (Drop-off Zone)
 * 4. Dinamik Süre ve Terk Sayacı (20s ambulanstan inme toleransı)
 * 5. Web Audio Retro Jingles (Başlangıç, Ding, Fanfar, Fail)
 * 6. Kalıcı Seviye 12 Ödülü: Maksimum Can Artışı (%150 Max Health)
 */

import * as THREE from 'three';
import { emergencyAudio } from './EmergencyAudio.js';

export class ParamedicMissionManager {
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

    // Hastane Kabul Koordinatları (Los Santos County Hospital Acil Girişi)
    this.hospitalPos = new THREE.Vector3(38.0, 0.08, -32.0);
    this.hospitalDropZoneRadius = 6.5;

    // Görev Nesneleri
    this.patients = []; // Aktif yaralılar listesi
    this.patientsInAmbulance = 0;
    this.maxAmbulanceCapacity = 3;
    this.patientsDeliveredThisLevel = 0;
    this.totalPatientsThisLevel = 0;

    // 3D Hastane Teslim Marker'ı
    this.dropZoneMarker = this._createDropZoneMarker();
    this.dropZoneMarker.visible = false;
    this.scene.add(this.dropZoneMarker);

    // Mini-Harita ve HUD için referans
    this.hospitalBlip = {
      type: 'hospital',
      position: this.hospitalPos,
      color: '#ffffff',
      icon: '🏥'
    };

    // Global erişim
    window.paramedicMission = this;
  }

  /**
   * 3D Parlayan Hastane Kabul Silindiri
   */
  _createDropZoneMarker() {
    const group = new THREE.Group();
    group.name = 'Hospital_DropZone_Marker';
    group.position.copy(this.hospitalPos);

    // Zemin Şeffaf Yeşil Halka
    const ringGeom = new THREE.RingGeometry(3.5, 4.2, 32);
    ringGeom.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0x00ff66,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    const ring = new THREE.Mesh(ringGeom, ringMat);
    group.add(ring);

    // Yükselen Şeffaf Koni / Silindir
    const cylGeom = new THREE.CylinderGeometry(4.2, 4.2, 3.5, 32, 1, true);
    const cylMat = new THREE.MeshBasicMaterial({
      color: 0x00ff88,
      transparent: true,
      opacity: 0.28,
      side: THREE.DoubleSide
    });
    const cyl = new THREE.Mesh(cylGeom, cylMat);
    cyl.position.y = 1.75;
    group.add(cyl);

    // Kırmızı/Yeşil Acil Artı Sembolü
    const crossGroup = new THREE.Group();
    crossGroup.position.y = 3.6;
    const barMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(1.6, 0.45, 0.15), barMat);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.45, 1.6, 0.15), barMat);
    crossGroup.add(hBar, vBar);
    group.add(crossGroup);

    group.userData = { ring, cyl, crossGroup };
    return group;
  }

  /**
   * Görevi Başlat / Aç-Kapa
   */
  toggleMission() {
    const activeVeh = this.vehicleManager?.activeVehicle;
    if (!this.isActive) {
      if (!activeVeh || activeVeh.type !== 'ambulance') {
        this.showNotification('Paramedic görevine başlamak için bir AMBULANS içinde olmalısın!', 2500);
        return;
      }
      this.startMission();
    } else {
      this.cancelMission('Paramedic Görevi İptal Edildi.');
    }
  }

  /**
   * Paramedic Görevini Başlatır
   */
  startMission(startLevel = 1) {
    this.isActive = true;
    this.currentLevel = startLevel;
    this.isAbandoned = false;
    this.abandonTimer = 0;
    this.patientsDeliveredThisLevel = 0;
    this.patientsInAmbulance = 0;

    // Siren ses ve flaşörünü otomatik aktif et
    const activeVeh = this.vehicleManager?.activeVehicle;
    if (activeVeh && activeVeh.userData?.updateSirens) {
      activeVeh.sirenActive = true;
      emergencyAudio.startSiren('yelp', activeVeh.position);
    }

    emergencyAudio.playMissionStartChime();
    this.showMissionBanner(`PARAMEDIC MISSION`, `LEVEL ${this.currentLevel}`);

    this._setupLevel(this.currentLevel);
    console.log(`🚑 [ParamedicMission] Level ${this.currentLevel} başlatıldı!`);
  }

  /**
   * Seviyeyi Kurar: Hastaları Spawn Eder ve Süreyi Belirler
   */
  _setupLevel(level) {
    this._clearPatients();
    this.totalPatientsThisLevel = level;
    this.patientsDeliveredThisLevel = 0;
    this.patientsInAmbulance = 0;

    // Seviye süresi: Temel 50 sn + her hasta için 35 sn
    this.timeRemaining = 45 + (level * 35);

    // Olası Hasta Spawn Lokasyonları (Grove Street, Bulvar ve Civar Kaldırımlar)
    const candidateSpots = [
      new THREE.Vector3(-18.5, 0.08, 12.0),
      new THREE.Vector3(-5.0, 0.08, 28.5),
      new THREE.Vector3(14.0, 0.08, 18.2),
      new THREE.Vector3(-22.0, 0.08, -8.5),
      new THREE.Vector3(2.5, 0.08, -18.0),
      new THREE.Vector3(28.0, 0.08, 4.0),
      new THREE.Vector3(-35.0, 0.08, 5.0),
      new THREE.Vector3(12.0, 0.08, -38.0),
      new THREE.Vector3(-14.0, 0.08, -42.0),
      new THREE.Vector3(32.0, 0.08, -12.0),
      new THREE.Vector3(-8.0, 0.08, 45.0),
      new THREE.Vector3(22.0, 0.08, 38.0)
    ];

    // Karıştır ve seviye sayısı kadar seç
    const shuffled = [...candidateSpots].sort(() => 0.5 - Math.random());
    const selectedSpots = shuffled.slice(0, Math.min(level, candidateSpots.length));

    for (let i = 0; i < selectedSpots.length; i++) {
      const p = this._createPatient(selectedSpots[i], i + 1);
      this.patients.push(p);
      this.scene.add(p.mesh);
    }

    this._updateDropZoneVisibility();
  }

  /**
   * 3D Yaralı Hasta Modeli ve FSM Bilgisi
   */
  _createPatient(pos, id) {
    const group = new THREE.Group();
    group.name = `Patient_${id}`;
    group.position.copy(pos);

    // Yerde yatan insan gövdesi (Prosedürel Retro GTA Sivil)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x3b6998, // Mavi ceket
      roughness: 0.8
    });
    const skinMat = new THREE.MeshStandardMaterial({
      color: 0x8d5524,
      roughness: 0.7
    });
    const pantsMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      roughness: 0.9
    });

    // Gövde (Yerde sırtüstü)
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.28, 0.75), bodyMat);
    torso.position.y = 0.16;
    torso.castShadow = true;
    group.add(torso);

    // Kafa
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.26, 0.26, 0.26), skinMat);
    head.position.set(0, 0.16, -0.52);
    group.add(head);

    // Bacaklar
    const legs = new THREE.Mesh(new THREE.BoxGeometry(0.48, 0.22, 0.85), pantsMat);
    legs.position.set(0, 0.14, 0.78);
    group.add(legs);

    // Baş Üstü Dönen Yeşil Artı Simgesi
    const iconGroup = new THREE.Group();
    iconGroup.position.set(0, 1.45, 0);
    const iconMat = new THREE.MeshBasicMaterial({ color: 0x00ff44 });
    const hBar = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.2, 0.1), iconMat);
    const vBar = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.7, 0.1), iconMat);
    iconGroup.add(hBar, vBar);
    group.add(iconGroup);

    return {
      id,
      mesh: group,
      torso,
      head,
      legs,
      iconGroup,
      position: pos.clone(),
      state: 'LYING', // 'LYING', 'GETTING_UP', 'RUNNING_TO_AMBULANCE', 'BOARDED'
      getUpProgress: 0,
      runSpeed: 4.2
    };
  }

  /**
   * Hastane Teslim Bölgesi Görünürlüğünü Günceller
   */
  _updateDropZoneVisibility() {
    // Eğer ambulansta en az 1 hasta varsa veya sahada başka hasta kalmamışsa hastane teslim noktası aktifleşir
    const shouldShow = (this.patientsInAmbulance > 0);
    this.dropZoneMarker.visible = shouldShow;
  }

  /**
   * Kare Başı Güncelleme Döngüsü (Update Loop)
   */
  update(dt) {
    if (!this.isActive) return;

    // 1. Oyuncu Ambulansta mı Kontrolü
    const activeVeh = this.vehicleManager?.activeVehicle;
    const isInsideAmbulance = (activeVeh && activeVeh.type === 'ambulance');

    if (!isInsideAmbulance) {
      if (!this.isAbandoned) {
        this.isAbandoned = true;
        this.abandonTimer = 20.0;
        this.showNotification('Ambulansa geri dön! Görev iptal ediliyor: 20s', 2000);
      }
      this.abandonTimer -= dt;
      if (this.abandonTimer <= 0) {
        this.failMission('Ambulansı Terk Ettin! Paramedic Görevi Başarısız.');
        return;
      }
    } else {
      if (this.isAbandoned) {
        this.isAbandoned = false;
        this.abandonTimer = 0;
        this.showNotification('Ambulansa geri dönüldü!', 1500);
      }
    }

    // 2. Zaman Sayacı
    this.timeRemaining -= dt;
    if (this.timeRemaining <= 0) {
      this.failMission('Süre Bitti! Yaralı kurtarılamadı.');
      return;
    }

    // 3. Teslim Bölgesi Animasyonu (Dönüş ve Işık)
    if (this.dropZoneMarker.visible) {
      const uData = this.dropZoneMarker.userData;
      if (uData.crossGroup) uData.crossGroup.rotation.y += dt * 2.2;
      if (uData.cyl) uData.cyl.rotation.y -= dt * 0.8;
    }

    // 4. Hasta FSM Güncellemeleri
    const ambPos = activeVeh ? activeVeh.position : this.characterManager?.position || new THREE.Vector3();
    const ambSpeed = activeVeh ? Math.abs(activeVeh.speed) : 0;

    for (const patient of this.patients) {
      if (patient.state === 'BOARDED') continue;

      // Baş üstü ikonunu döndür
      if (patient.iconGroup) {
        patient.iconGroup.rotation.y += dt * 3.0;
      }

      const dist = ambPos.distanceTo(patient.position);

      // A. Yerde Yatan Hasta -> Ambulans Yakınlaştı mı?
      if (patient.state === 'LYING') {
        // Eğer ambulans durduysa (speed < 2.5 m/s) ve 8 metre içindeyse, ve ambulans dolu değilse
        if (dist <= 8.5 && ambSpeed < 2.8 && this.patientsInAmbulance < this.maxAmbulanceCapacity) {
          patient.state = 'GETTING_UP';
          patient.getUpProgress = 0;
        }
      }

      // B. Doğrulma Aşaması
      else if (patient.state === 'GETTING_UP') {
        patient.getUpProgress += dt * 2.5; // ~0.4 saniye kalkış
        patient.torso.rotation.x = -Math.PI / 2 * (1 - Math.min(patient.getUpProgress, 1));
        patient.torso.position.y = 0.55 * Math.min(patient.getUpProgress, 1);
        patient.head.position.y = 0.85 * Math.min(patient.getUpProgress, 1);

        if (patient.getUpProgress >= 1.0) {
          patient.state = 'RUNNING_TO_AMBULANCE';
        }
      }

      // C. Ambulansa Koşma ve Binme
      else if (patient.state === 'RUNNING_TO_AMBULANCE') {
        const toAmb = new THREE.Vector3().subVectors(ambPos, patient.position);
        toAmb.y = 0;
        const d = toAmb.length();

        if (d > 1.8) {
          toAmb.normalize();
          patient.position.addScaledVector(toAmb, patient.runSpeed * dt);
          patient.mesh.position.copy(patient.position);
          patient.mesh.rotation.y = Math.atan2(toAmb.x, toAmb.z);

          // Ayak koşu salınımı
          const t = Date.now() * 0.012;
          patient.legs.rotation.x = Math.sin(t) * 0.6;
        } else {
          // Ambulansın yanına vardı -> Araca bindi!
          this._boardPatient(patient);
        }
      }
    }

    // 5. Hastaneye Teslimat Kontrolü
    if (this.dropZoneMarker.visible && isInsideAmbulance) {
      const distToHospital = ambPos.distanceTo(this.hospitalPos);
      if (distToHospital <= this.hospitalDropZoneRadius && ambSpeed < 3.0) {
        this._deliverPatients();
      }
    }

    // 6. HUD Ekran Güncellemesi
    this._renderHUD();
  }

  /**
   * Hastanın Ambulansa Binmesi
   */
  _boardPatient(patient) {
    patient.state = 'BOARDED';
    this.scene.remove(patient.mesh);
    this.patientsInAmbulance++;
    this.timeRemaining += 25.0; // Her hasta bindiğinde +25 saniye

    emergencyAudio.playPatientRescueDing();
    this.showNotification(`Hasta Ambulansa Alındı! (${this.patientsInAmbulance}/${this.maxAmbulanceCapacity}) +25s`, 2500);

    this._updateDropZoneVisibility();
  }

  /**
   * Hastanedeki Hastaları Teslim Etme
   */
  _deliverPatients() {
    if (this.patientsInAmbulance <= 0) return;

    const count = this.patientsInAmbulance;
    this.patientsDeliveredThisLevel += count;
    this.patientsInAmbulance = 0;
    this._updateDropZoneVisibility();

    // Ödül: Her teslim edilen hasta için $250
    const cashEarned = count * 250;
    if (window.app?.addMoney) {
      window.app.addMoney(cashEarned);
    }

    emergencyAudio.playPatientRescueDing();
    this.showNotification(`${count} Hasta Hastaneye Teslim Edildi! +$${cashEarned}`, 2500);

    // Seviyedeki tüm hastalar teslim edildi mi?
    if (this.patientsDeliveredThisLevel >= this.totalPatientsThisLevel) {
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

    this.showMissionBanner(`PARAMEDIC LEVEL ${this.currentLevel} PASSED!`, `Ödül: $${bonus}`);

    if (this.currentLevel >= this.maxLevel) {
      // 12. Seviye Tamamlandı - Kalıcı Sağlık Ödülü!
      this._completeEntireMission();
    } else {
      this.currentLevel++;
      setTimeout(() => {
        if (this.isActive) {
          this._setupLevel(this.currentLevel);
          this.showMissionBanner(`PARAMEDIC MISSION`, `LEVEL ${this.currentLevel}`);
        }
      }, 3500);
    }
  }

  /**
   * 12 Seviyenin Tamamı Başarıyla Bitirildiğinde
   */
  _completeEntireMission() {
    this.isActive = false;
    this._clearPatients();
    this.dropZoneMarker.visible = false;

    // CJ Kalıcı Maksimum Can Artışı (%150 Can)
    if (window.app?.characterManager) {
      window.app.characterManager.maxHealth = 150;
      window.app.characterManager.health = 150;
    }
    if (window.app?.addMoney) {
      window.app.addMoney(10000);
    }

    emergencyAudio.playMissionSuccessFanfare();
    this.showMissionBanner(
      `PARAMEDIC MASTER!`,
      `Maksimum Can Kapasitesi %150 Artırıldı! +$10,000`
    );
  }

  /**
   * Görev Başarısızlığı
   */
  failMission(reason) {
    this.isActive = false;
    this._clearPatients();
    this.dropZoneMarker.visible = false;
    emergencyAudio.playMissionFailBuzzer();
    this.showMissionBanner(`PARAMEDIC MISSION FAILED`, reason);
  }

  /**
   * Görevi İptal Et
   */
  cancelMission(reason = 'Görev İptal Edildi.') {
    this.isActive = false;
    this._clearPatients();
    this.dropZoneMarker.visible = false;
    this.showNotification(reason, 2000);
  }

  /**
   * Sahnedeki Yaralıları Temizler
   */
  _clearPatients() {
    for (const p of this.patients) {
      if (p.mesh && p.mesh.parent) {
        this.scene.remove(p.mesh);
      }
    }
    this.patients = [];
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
      subMsg = `<div class="gta-emerg-warning">AMBULANSA DÖN: ${Math.ceil(this.abandonTimer)}s</div>`;
    } else if (this.patientsInAmbulance > 0) {
      subMsg = `<div class="gta-emerg-info">🏥 Hastaneye Git! Taşıma: ${this.patientsInAmbulance}/${this.maxAmbulanceCapacity}</div>`;
    } else {
      subMsg = `<div class="gta-emerg-info">🚑 Yaralıları Kurtar! Kalan: ${this.totalPatientsThisLevel - this.patientsDeliveredThisLevel}</div>`;
    }

    el.innerHTML = `
      <div class="gta-emerg-header">PARAMEDIC - LEVEL ${this.currentLevel}</div>
      <div class="gta-emerg-timer ${this.timeRemaining < 15 ? 'urgent' : ''}">TIME: ${timeStr}</div>
      ${subMsg}
    `;
  }

  showNotification(msg, duration = 2500) {
    if (this.uiManager?.showNotification) {
      this.uiManager.showNotification(msg, duration);
    } else {
      console.log(`[Paramedic] ${msg}`);
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
