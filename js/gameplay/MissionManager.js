/**
 * MissionManager.js - GTA San Andreas İnteraktif Görev Motoru (ADIM 13)
 * Sweet & Big Smoke "The Drive-Thru & Ballas Ambush" Görevi,
 * Sokak Telefon Kulübesi (Payphone), 3D Dönen Corona Marker, Sinematik Letterbox,
 * Otantik Sarı GTA Altyazıları ve Web Audio Sentezli Zafer/Yenilgi Sesleri.
 */
import * as THREE from 'three';
import { gameState } from './GameStateManager.js';
import { saveManager } from './SaveManager.js';
import { pedestrianAudio } from '../pedestrian/PedestrianAudio.js';
import { MissionMarker } from './MissionMarker.js';

export const MissionState = {
  IDLE: 'IDLE',
  BRIEFING: 'BRIEFING',
  DRIVE_TO_CLUCKIN: 'DRIVE_TO_CLUCKIN',
  DRIVE_THRU_CUTSCENE: 'DRIVE_THRU_CUTSCENE',
  BALLAS_AMBUSH: 'BALLAS_AMBUSH',
  RETURN_TO_GROVE: 'RETURN_TO_GROVE',
  PASSED: 'PASSED',
  FAILED: 'FAILED'
};

export class MissionManager {
  constructor(scene) {
    this.scene = scene;
    this.state = MissionState.IDLE;

    // 3D Dünya İçi Dönen Corona Marker
    this.marker = new MissionMarker(this.scene);

    // Sokak Telefon Kulübesi (Grove Street Kaldırımı)
    this.payphonePos = new THREE.Vector3(-142, 0.0, -28);
    this.payphoneMesh = this._createPayphoneMesh();
    this.payphoneMesh.position.copy(this.payphonePos);
    this.scene.add(this.payphoneMesh);

    // Telefon Çalma Zamanlayıcıları
    this.ringTimer = 0;
    this.ringInterval = 4.2; // Her 4.2 saniyede bir çift çalma
    this.isRinging = true;

    // Hedef Koordinatları
    this.cluckinBellPos = new THREE.Vector3(75, 0.5, -140);
    this.groveCulDeSacPos = new THREE.Vector3(-175, 0.5, -25);

    // Ballas Pusu Grubu Nesneleri
    this.ambushGroup = new THREE.Group();
    this.ambushGroup.name = 'BallasAmbushGroup';
    this.scene.add(this.ambushGroup);
    this.ballasEnemies = [];
    this.ballasCar = null;

    // Sinematik & Altyazı Yönetimi
    this.subtitleQueue = [];
    this.currentSubtitle = null;
    this.subtitleTimer = 0;
    this.cutsceneTimer = 0;

    // UI Referansları
    this._initUIElements();

    // Geliştirici Kısayolları (Rule 6 ve Test Kolaylığı)
    this._setupGlobalDebugHooks();
  }

  /* =========================================================
     1. 3D SOKAK TELEFON KULÜBESİ (PAYPHONE) MESH OLUŞTURMA
     ========================================================= */
  _createPayphoneMesh() {
    const group = new THREE.Group();
    group.name = 'GroveStreetPayphone';

    // 1. Zemin Taban Plakası (Koyu döküm demir)
    const baseGeom = new THREE.BoxGeometry(1.2, 0.12, 1.2);
    const baseMat = new THREE.MeshStandardMaterial({ color: 0x22262d, roughness: 0.8 });
    const baseMesh = new THREE.Mesh(baseGeom, baseMat);
    baseMesh.position.y = 0.06;
    group.add(baseMesh);

    // 2. Kabin Dikey Çelik Direkleri (LSPD Mavi / Koyu Gri)
    const frameMat = new THREE.MeshStandardMaterial({ color: 0x1e3a5f, metalness: 0.6, roughness: 0.4 });
    const postGeom = new THREE.BoxGeometry(0.08, 2.5, 0.08);

    const offsets = [
      [-0.52, -0.52], [0.52, -0.52],
      [-0.52, 0.52], [0.52, 0.52]
    ];
    offsets.forEach(([ox, oz]) => {
      const post = new THREE.Mesh(postGeom, frameMat);
      post.position.set(ox, 1.25, oz);
      group.add(post);
    });

    // 3. Yan ve Arka Şeffaf Cam Paneller
    const glassMat = new THREE.MeshPhysicalMaterial({
      color: 0x88ccff,
      transparent: true,
      opacity: 0.35,
      roughness: 0.1,
      metalness: 0.1,
      transmission: 0.85
    });

    // Arka Cam
    const backGlassGeom = new THREE.BoxGeometry(0.96, 1.8, 0.02);
    const backGlass = new THREE.Mesh(backGlassGeom, glassMat);
    backGlass.position.set(0, 1.35, -0.52);
    group.add(backGlass);

    // Sol Cam
    const sideGlassGeom = new THREE.BoxGeometry(0.02, 1.8, 0.96);
    const leftGlass = new THREE.Mesh(sideGlassGeom, glassMat);
    leftGlass.position.set(-0.52, 1.35, 0);
    group.add(leftGlass);

    // Sağ Cam
    const rightGlass = new THREE.Mesh(sideGlassGeom, glassMat);
    rightGlass.position.set(0.52, 1.35, 0);
    group.add(rightGlass);

    // 4. Çatı Üst Şapkası & Işıklı "TELEPHONE" Başlığı
    const roofGeom = new THREE.BoxGeometry(1.28, 0.28, 1.28);
    const roofMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.5 });
    const roofMesh = new THREE.Mesh(roofGeom, roofMat);
    roofMesh.position.y = 2.6;
    group.add(roofMesh);

    // Sarı Işıklı Başlık Panosu
    const signGeom = new THREE.BoxGeometry(1.05, 0.18, 0.04);
    const signMat = new THREE.MeshBasicMaterial({ color: 0xfbc02d });
    const signFront = new THREE.Mesh(signGeom, signMat);
    signFront.position.set(0, 2.58, 0.65);
    group.add(signFront);

    // 5. Telefon Ünitesi Kutusu (Metalik Gövde)
    const phoneBoxGeom = new THREE.BoxGeometry(0.38, 0.65, 0.24);
    const phoneBoxMat = new THREE.MeshStandardMaterial({ color: 0x374151, metalness: 0.8, roughness: 0.3 });
    const phoneBox = new THREE.Mesh(phoneBoxGeom, phoneBoxMat);
    phoneBox.position.set(0, 1.35, -0.38);
    group.add(phoneBox);

    // Krom Tuş Takımı
    const keypadGeom = new THREE.BoxGeometry(0.2, 0.22, 0.02);
    const keypadMat = new THREE.MeshStandardMaterial({ color: 0xd1d5db, metalness: 0.9, roughness: 0.2 });
    const keypad = new THREE.Mesh(keypadGeom, keypadMat);
    keypad.position.set(0, 1.28, -0.25);
    group.add(keypad);

    // Ahize (Handset)
    const handsetGeom = new THREE.CylinderGeometry(0.045, 0.045, 0.38, 12);
    const handsetMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.6 });
    const handset = new THREE.Mesh(handsetGeom, handsetMat);
    handset.position.set(-0.16, 1.38, -0.28);
    handset.rotation.z = Math.PI / 16;
    group.add(handset);

    // Kulübe İçi Yumuşak Gece Işığı
    const boothLight = new THREE.PointLight(0xffea00, 0.8, 4.5);
    boothLight.position.set(0, 2.3, 0);
    group.add(boothLight);

    return group;
  }

  /* =========================================================
     2. UI ELEMANLARI & ALTYAZI SİSTEMİ
     ========================================================= */
  _initUIElements() {
    this.elLetterboxTop = document.getElementById('cinematic-letterbox-top');
    this.elLetterboxBottom = document.getElementById('cinematic-letterbox-bottom');
    this.elPhonePrompt = document.getElementById('phone-prompt');
    this.elSubtitles = document.getElementById('mission-subtitles');
    this.elSubSpeaker = document.getElementById('mission-sub-speaker');
    this.elSubText = document.getElementById('mission-sub-text');
    this.elObjectiveBanner = document.getElementById('mission-objective-banner');
    this.elObjectiveText = document.getElementById('mission-objective-text');
    this.elTitleBanner = document.getElementById('mission-title-banner');
    this.elPassedOverlay = document.getElementById('mission-passed-overlay');
    this.elFailedOverlay = document.getElementById('mission-failed-overlay');
    this.elRewardCounter = document.getElementById('mission-reward-counter');
    this.elFailedReason = document.getElementById('mission-failed-reason');
  }

  setLetterbox(active) {
    if (this.elLetterboxTop) this.elLetterboxTop.classList.toggle('active', active);
    if (this.elLetterboxBottom) this.elLetterboxBottom.classList.toggle('active', active);
  }

  showPhonePrompt(visible) {
    if (this.elPhonePrompt) {
      this.elPhonePrompt.classList.toggle('hidden', !visible);
    }
  }

  queueSubtitles(subtitles) {
    this.subtitleQueue = [...subtitles];
    this._playNextSubtitle();
  }

  _playNextSubtitle() {
    if (this.subtitleQueue.length === 0) {
      this.currentSubtitle = null;
      if (this.elSubtitles) this.elSubtitles.classList.add('hidden');
      return;
    }

    this.currentSubtitle = this.subtitleQueue.shift();
    this.subtitleTimer = this.currentSubtitle.duration || 3.5;

    if (this.elSubtitles && this.elSubSpeaker && this.elSubText) {
      this.elSubSpeaker.textContent = this.currentSubtitle.speaker || 'SWEET';
      this.elSubSpeaker.style.color = this.currentSubtitle.color || '#4ade80';
      this.elSubText.textContent = this.currentSubtitle.text;
      this.elSubtitles.classList.remove('hidden');
    }
  }

  showMissionTitle(title) {
    if (!this.elTitleBanner) return;
    this.elTitleBanner.textContent = title;
    this.elTitleBanner.classList.add('show');
    setTimeout(() => {
      this.elTitleBanner.classList.remove('show');
    }, 3800);
  }

  setObjective(text) {
    if (!this.elObjectiveBanner || !this.elObjectiveText) return;
    if (text) {
      this.elObjectiveText.textContent = text;
      this.elObjectiveBanner.classList.remove('hidden');
    } else {
      this.elObjectiveBanner.classList.add('hidden');
    }
    gameState.state.mission.objectiveText = text || '';
    gameState.notify('mission');
  }

  /* =========================================================
     3. GÖREV AŞAMALARI VE FSM AKIŞI
     ========================================================= */

  /**
   * Oyuncu kulübedeki telefona cevap verdiğinde görevi başlatır
   */
  answerPhone() {
    if (this.state !== MissionState.IDLE) return;

    this.isRinging = false;
    this.showPhonePrompt(false);
    pedestrianAudio.playPhonePickup();

    this.state = MissionState.BRIEFING;
    this.setLetterbox(true);

    // Sweet Telefon Diyaloğu
    this.queueSubtitles([
      {
        speaker: 'SWEET',
        color: '#4ade80',
        text: 'CJ! Benim, Sweet. Big Smoke sabahtan beri açlıktan şikayet ediyor!',
        duration: 3.2
      },
      {
        speaker: 'SWEET',
        color: '#4ade80',
        text: 'Bir araba kap ve Idlewood\'daki Cluckin\' Bell\'e sür. Karnımızı doyuralım.',
        duration: 3.5
      },
      {
        speaker: 'SWEET',
        color: '#4ade80',
        text: 'Gözünü dört aç; Ballas çetesi bugün mahallenin etrafında dolanıyor!',
        duration: 3.5
      }
    ]);
  }

  _startDriveToCluckin() {
    this.state = MissionState.DRIVE_TO_CLUCKIN;
    this.setLetterbox(false);

    pedestrianAudio.playMissionStart();
    this.showMissionTitle('DRIVE-THRU');
    this.setObjective("Idlewood'daki Cluckin' Bell restoranına sür!");

    // Sarı Checkpoint Corona Marker'ı Cluckin' Bell'e yerleştir
    this.marker.setPosition(this.cluckinBellPos.x, this.cluckinBellPos.y, this.cluckinBellPos.z, 0xfbc02d);
    this.marker.setVisible(true);

    gameState.state.mission.activeMission = 'drive_thru';
    gameState.state.mission.status = 'ACTIVE';
    gameState.notify('mission');
  }

  _triggerDriveThruCutscene() {
    this.state = MissionState.DRIVE_THRU_CUTSCENE;
    this.marker.setVisible(false);
    this.setLetterbox(true);
    this.setObjective('Sipariş veriliyor...');

    // İkonik Big Smoke Siparişi ve Ballas Baskını
    this.queueSubtitles([
      {
        speaker: 'BIG SMOKE',
        color: '#facc15',
        text: 'Bana iki tane 9 numara, bir tane büyük boy 9 numara...',
        duration: 2.8
      },
      {
        speaker: 'BIG SMOKE',
        color: '#facc15',
        text: 'Ekstra soslu 6 numara, bir 7 numara, iki 45 numara (biri peynirli) ve büyük bir kola!',
        duration: 3.4
      },
      {
        speaker: 'SWEET',
        color: '#ef4444',
        text: 'CJ DİKKAT ET! BALLAS GELDİ! DRIVE-BY!',
        duration: 2.5
      }
    ]);
  }

  _spawnBallasAmbush(playerPos) {
    this.state = MissionState.BALLAS_AMBUSH;
    this.setLetterbox(false);
    this.setObjective('Cluckin\' Bell\'i basan Ballas çetesini yok et!');

    // Eski pusu nesnelerini temizle
    this._clearAmbushGroup();

    // 1. Mor Ballas Arabası (Voodoo / Gang Sedan)
    this.ballasCar = this._createBallasCarMesh();
    // Oyuncunun 22m ilerisine, yol hizasına yerleştir
    this.ballasCar.position.set(playerPos.x + 18, 0.4, playerPos.z + 12);
    this.ballasCar.rotation.y = Math.PI * 0.75;
    this.ambushGroup.add(this.ballasCar);

    // 2. Üç Silahlı Ballas Üyesi
    const spawnOffsets = [
      [2, 0, 1.5],
      [-2, 0, 1.5],
      [0, 0, -2.5]
    ];

    this.ballasEnemies = spawnOffsets.map((offset, idx) => {
      const ballasMesh = this._createBallasShooterMesh();
      const pos = new THREE.Vector3(
        this.ballasCar.position.x + offset[0],
        0.0,
        this.ballasCar.position.z + offset[2]
      );
      ballasMesh.position.copy(pos);
      this.ambushGroup.add(ballasMesh);

      return {
        id: idx,
        mesh: ballasMesh,
        health: 100,
        isDead: false,
        shootCooldown: 1.0 + Math.random() * 1.5
      };
    });

    // Tehdit alarmı / ilk çatışma silah sesi
    pedestrianAudio.playGunshot3D(this.ballasCar.position);
  }

  _createBallasCarMesh() {
    const group = new THREE.Group();
    group.name = 'BallasGangCar';

    // Mor kaporta gövdesi
    const bodyGeom = new THREE.BoxGeometry(2.1, 0.85, 4.6);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x6b21a8, // Otantik Ballas Koyu Moru
      roughness: 0.35,
      metalness: 0.65
    });
    const bodyMesh = new THREE.Mesh(bodyGeom, bodyMat);
    bodyMesh.position.y = 0.55;
    group.add(bodyMesh);

    // Kabin / Tavan
    const cabinGeom = new THREE.BoxGeometry(1.85, 0.65, 2.3);
    const cabinMesh = new THREE.Mesh(cabinGeom, bodyMat);
    cabinMesh.position.set(0, 1.25, -0.2);
    group.add(cabinMesh);

    // Koyu Camlar
    const glassGeom = new THREE.BoxGeometry(1.88, 0.52, 2.15);
    const glassMat = new THREE.MeshPhysicalMaterial({ color: 0x1e1b4b, roughness: 0.1, transmission: 0.7 });
    const glassMesh = new THREE.Mesh(glassGeom, glassMat);
    glassMesh.position.set(0, 1.25, -0.2);
    group.add(glassMesh);

    // Tekerlekler
    const wheelGeom = new THREE.CylinderGeometry(0.38, 0.38, 0.32, 16);
    wheelGeom.rotateZ(Math.PI / 2);
    const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111827, roughness: 0.9 });

    const wheelPos = [
      [-1.05, 0.38, 1.4], [1.05, 0.38, 1.4],
      [-1.05, 0.38, -1.4], [1.05, 0.38, -1.4]
    ];
    wheelPos.forEach(([wx, wy, wz]) => {
      const wheel = new THREE.Mesh(wheelGeom, wheelMat);
      wheel.position.set(wx, wy, wz);
      group.add(wheel);
    });

    // Farlar
    const lightGeom = new THREE.BoxGeometry(0.35, 0.15, 0.05);
    const lightMat = new THREE.MeshBasicMaterial({ color: 0xfef08a });
    const leftLight = new THREE.Mesh(lightGeom, lightMat);
    leftLight.position.set(-0.7, 0.65, 2.31);
    const rightLight = new THREE.Mesh(lightGeom, lightMat);
    rightLight.position.set(0.7, 0.65, 2.31);
    group.add(leftLight);
    group.add(rightLight);

    return group;
  }

  _createBallasShooterMesh() {
    const group = new THREE.Group();
    group.name = 'BallasGangMember';

    // Gövde (Mor Tişört)
    const torsoGeom = new THREE.BoxGeometry(0.5, 0.7, 0.28);
    const torsoMat = new THREE.MeshStandardMaterial({ color: 0x7e22ce, roughness: 0.7 });
    const torso = new THREE.Mesh(torsoGeom, torsoMat);
    torso.position.y = 1.05;
    group.add(torso);

    // Kafa & Mor Bandana
    const headGeom = new THREE.BoxGeometry(0.24, 0.26, 0.24);
    const skinMat = new THREE.MeshStandardMaterial({ color: 0x8d5524, roughness: 0.8 });
    const head = new THREE.Mesh(headGeom, skinMat);
    head.position.y = 1.55;
    group.add(head);

    const bandanaGeom = new THREE.BoxGeometry(0.26, 0.08, 0.26);
    const bandanaMat = new THREE.MeshStandardMaterial({ color: 0xa855f7 });
    const bandana = new THREE.Mesh(bandanaGeom, bandanaMat);
    bandana.position.y = 1.62;
    group.add(bandana);

    // Bacaklar (Koyu Gri Baggy Pantolon)
    const legGeom = new THREE.BoxGeometry(0.2, 0.7, 0.24);
    const pantsMat = new THREE.MeshStandardMaterial({ color: 0x1f2937, roughness: 0.85 });
    const leftLeg = new THREE.Mesh(legGeom, pantsMat);
    leftLeg.position.set(-0.13, 0.35, 0);
    const rightLeg = new THREE.Mesh(legGeom, pantsMat);
    rightLeg.position.set(0.13, 0.35, 0);
    group.add(leftLeg);
    group.add(rightLeg);

    // 9mm Tabanca
    const gunGeom = new THREE.BoxGeometry(0.06, 0.1, 0.22);
    const gunMat = new THREE.MeshStandardMaterial({ color: 0x111827, metalness: 0.8 });
    const gun = new THREE.Mesh(gunGeom, gunMat);
    gun.position.set(0.28, 1.05, 0.26);
    group.add(gun);

    return group;
  }

  _clearAmbushGroup() {
    while (this.ambushGroup.children.length > 0) {
      const obj = this.ambushGroup.children[0];
      this.ambushGroup.remove(obj);
    }
    this.ballasEnemies = [];
    this.ballasCar = null;
  }

  _startReturnToGrove() {
    this.state = MissionState.RETURN_TO_GROVE;
    this._clearAmbushGroup();

    this.queueSubtitles([
      {
        speaker: 'SWEET',
        color: '#4ade80',
        text: 'Temiz iş CJ! Şimdi polisler damlamadan Grove Street\'e geri dönelim!',
        duration: 3.5
      }
    ]);

    this.setObjective("Grove Street çıkmazına geri dön ve park et!");

    // Grove Street Çıkmazına Sarı Corona Marker Koy
    this.marker.setPosition(this.groveCulDeSacPos.x, this.groveCulDeSacPos.y, this.groveCulDeSacPos.z, 0xfbc02d);
    this.marker.setVisible(true);
  }

  completeMission() {
    this.state = MissionState.PASSED;
    this.marker.setVisible(false);
    this.setObjective('');
    this.setLetterbox(true);

    // Web Audio İkonik San Andreas Zafer Jingle'ı
    pedestrianAudio.playMissionPassed();

    // 1000 Dolar Para ve Saygınlık Ödülü
    const reward = 1000;
    gameState.addMoney(reward);
    gameState.state.mission.status = 'COMPLETED';
    gameState.state.mission.activeMission = null;
    gameState.notify('mission');

    // Zafer Ekranı Gösterimi
    if (this.elPassedOverlay) {
      if (this.elRewardCounter) this.elRewardCounter.textContent = `+$${reward.toLocaleString()}`;
      this.elPassedOverlay.classList.add('show');
    }

    saveManager.save();

    // 6.5 saniye sonra serbest dolaşıma dön ve ekranı temizle
    setTimeout(() => {
      if (this.elPassedOverlay) this.elPassedOverlay.classList.remove('show');
      this.setLetterbox(false);
      this.state = MissionState.IDLE;
      this.isRinging = true;
    }, 6500);
  }

  failMission(reason = 'Görev Başarısız Oldu!') {
    this.state = MissionState.FAILED;
    this.marker.setVisible(false);
    this.setObjective('');
    this.setLetterbox(true);

    pedestrianAudio.playMissionFailed();

    gameState.state.mission.status = 'FAILED';
    gameState.state.mission.activeMission = null;
    gameState.notify('mission');

    if (this.elFailedOverlay) {
      if (this.elFailedReason) this.elFailedReason.textContent = reason;
      this.elFailedOverlay.classList.add('show');
    }

    this._clearAmbushGroup();

    // 5 saniye sonra serbest dolaşıma dön
    setTimeout(() => {
      if (this.elFailedOverlay) this.elFailedOverlay.classList.remove('show');
      this.setLetterbox(false);
      this.state = MissionState.IDLE;
      this.isRinging = true;
    }, 5000);
  }

  /* =========================================================
     4. ANA OYUN GÜNCELLEME DÖNGÜSÜ (FRAME UPDATE)
     ========================================================= */
  update(delta, playerPos, playerInVehicle) {
    // 1. 3D Corona Marker Animasyonu
    if (this.marker) {
      this.marker.update(delta);
    }

    // 2. Altyazı Süre Sayacı
    if (this.currentSubtitle) {
      this.subtitleTimer -= delta;
      if (this.subtitleTimer <= 0) {
        this._playNextSubtitle();
      }
    }

    // 3. IDLE Durumu: Telefon Çalma ve Yaklaşma Kontrolü
    if (this.state === MissionState.IDLE) {
      const distToPhone = playerPos.distanceTo(this.payphonePos);

      // Telefon zil sesi (yakındaysa konumsal 3D çalar)
      if (this.isRinging && distToPhone < 38.0) {
        this.ringTimer += delta;
        if (this.ringTimer >= this.ringInterval) {
          this.ringTimer = 0;
          pedestrianAudio.playPhoneRing3D(this.payphonePos);
        }
      }

      // Yaklaşma Uyarısı (E Tuşu ile cevap ver)
      if (distToPhone <= 2.8 && !playerInVehicle) {
        this.showPhonePrompt(true);
      } else {
        this.showPhonePrompt(false);
      }
      return;
    }

    // 4. BRIEFING Durumu: Altyazı bittiğinde sürüş aşamasına geçiş
    if (this.state === MissionState.BRIEFING) {
      if (!this.currentSubtitle && this.subtitleQueue.length === 0) {
        this._startDriveToCluckin();
      }
      return;
    }

    // 5. DRIVE_TO_CLUCKIN: Cluckin' Bell hedefine varış kontrolü
    if (this.state === MissionState.DRIVE_TO_CLUCKIN) {
      if (this.marker.isPlayerInside(playerPos, 5.5)) {
        this._triggerDriveThruCutscene();
      }
      return;
    }

    // 6. DRIVE_THRU_CUTSCENE: Sipariş altyazıları bittiğinde pusu başlat
    if (this.state === MissionState.DRIVE_THRU_CUTSCENE) {
      if (!this.currentSubtitle && this.subtitleQueue.length === 0) {
        this._spawnBallasAmbush(playerPos);
      }
      return;
    }

    // 7. BALLAS_AMBUSH: Düşman AI ve çatışma kontrolü
    if (this.state === MissionState.BALLAS_AMBUSH) {
      let aliveCount = 0;

      this.ballasEnemies.forEach((enemy) => {
        if (enemy.isDead) return;
        aliveCount++;

        // Oyuncuya doğru dön
        const enemyPos = enemy.mesh.position;
        enemy.mesh.lookAt(playerPos.x, enemyPos.y, playerPos.z);

        // Ateş etme süresi
        enemy.shootCooldown -= delta;
        if (enemy.shootCooldown <= 0) {
          enemy.shootCooldown = 1.4 + Math.random() * 1.8;
          pedestrianAudio.playGunshot3D(enemyPos);

          // Yakındaysa oyuncuya hafif hasar ver
          const distToPlayer = enemyPos.distanceTo(playerPos);
          if (distToPlayer < 35.0) {
            gameState.damagePlayer(8);
            if (gameState.state.player.health <= 0) {
              this.failMission('CJ Çatışmada Hayatını Kaybetti!');
            }
          }
        }

        // Oyuncunun aracıyla veya ateşle vurulma kontrolü (basit temas ezme)
        const distFromPlayer = enemyPos.distanceTo(playerPos);
        if (playerInVehicle && distFromPlayer < 3.2) {
          enemy.health -= 120;
        }

        if (enemy.health <= 0) {
          enemy.isDead = true;
          // Yere devrilme efekti
          enemy.mesh.rotation.x = Math.PI / 2;
          enemy.mesh.position.y = 0.15;
          pedestrianAudio.playHitThud(enemyPos);
          // Yere nakit para destesi bırak
          if (window.app?.pickupManager) {
            window.app.pickupManager.spawnMoneyAt(enemyPos.x, enemyPos.y, enemyPos.z, 200);
          }
        }
      });

      // Bütün Ballas üyeleri etkisiz hale getirildiyse dönüş aşamasına geç
      if (aliveCount === 0) {
        this._startReturnToGrove();
      }
      return;
    }

    // 8. RETURN_TO_GROVE: Grove Street çıkmazına park etme kontrolü
    if (this.state === MissionState.RETURN_TO_GROVE) {
      if (this.marker.isPlayerInside(playerPos, 4.8)) {
        this.completeMission();
      }
      return;
    }
  }

  getMarkerPosition() {
    if (this.marker && this.marker.group.visible) {
      return this.marker.getPosition();
    }
    return null;
  }

  /* =========================================================
     5. GELİŞTİRİCİ TEST VE KISAYOL METOTLARI
     ========================================================= */
  _setupGlobalDebugHooks() {
    window.startDriveThruMission = () => {
      this.answerPhone();
      console.log('🎬 [MISSION] Drive-Thru görevi başlatıldı.');
    };

    window.skipMissionStep = () => {
      if (this.state === MissionState.IDLE) {
        this.answerPhone();
      } else if (this.state === MissionState.BRIEFING) {
        this.subtitleQueue = [];
        this.currentSubtitle = null;
        this._startDriveToCluckin();
      } else if (this.state === MissionState.DRIVE_TO_CLUCKIN) {
        this._triggerDriveThruCutscene();
      } else if (this.state === MissionState.DRIVE_THRU_CUTSCENE) {
        this.subtitleQueue = [];
        this.currentSubtitle = null;
        const pPos = window.app?.characterManager?.getPosition() || this.cluckinBellPos;
        this._spawnBallasAmbush(pPos);
      } else if (this.state === MissionState.BALLAS_AMBUSH) {
        this._startReturnToGrove();
      } else if (this.state === MissionState.RETURN_TO_GROVE) {
        this.completeMission();
      }
      console.log(`⏩ [MISSION] Görev aşaması atlandı. Yeni durum: ${this.state}`);
    };

    window.completeCurrentMission = () => {
      this.completeMission();
      console.log('🏆 [MISSION] Görev anında başarıyla tamamlandı.');
    };

    window.failCurrentMission = (reason = 'Test başarısızlığı') => {
      this.failMission(reason);
      console.log('💀 [MISSION] Görev başarısızlıkla sonuçlandırıldı.');
    };

    window.teleportToMissionMarker = () => {
      const pos = this.getMarkerPosition();
      if (pos && window.teleportPlayer) {
        window.teleportPlayer(pos.x, pos.z);
        console.log(`📍 [MISSION] Görev hedefine ışınlanıldı: (${pos.x.toFixed(1)}, ${pos.z.toFixed(1)})`);
      } else {
        console.warn('⚠️ [MISSION] Aktif bir görev hedefi bulunamadı.');
      }
    };

    window.teleportToPayphone = () => {
      if (window.teleportPlayer) {
        window.teleportPlayer(this.payphonePos.x + 1.5, this.payphonePos.z);
        console.log('📞 [MISSION] Telefon kulübesine ışınlanıldı.');
      }
    };

    window.answerPayphone = () => {
      this.answerPhone();
    };
  }
}
