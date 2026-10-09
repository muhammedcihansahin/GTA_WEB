/**
 * PayNSprayManager.js - GTA San Andreas Tarzı Pay 'n' Spray Garajı (ADIM 17)
 * 
 * Özellikler:
 * 1. 3D Otantik Garaj Binası: Los Santos yol kenarı (-28, 0, -35), tuğla dokusu,
 *    "PAY 'N' SPRAY" parlayan neon tabelası, endüstriyel kompresör & alet rafları.
 * 2. Animasyonlu Dikey Metal Kepenk (Shutter Door): Mekanik motor ve zincir sesleriyle
 *    yukarı/aşağı pürüzsüz kayan kepenk.
 * 3. Garaj FSM (Durum Makinesi):
 *    IDLE -> ENTERING (Araç Dondurma & Merkeze Hizalama) -> SPRAYING (Kompresör, Tıslama,
 *    3D Dönen Sprey Dumanı, Yeni Metalik Renk, Lastik & Şasi Tamiri, Aranma Seviyesi Sıfırlama)
 *    -> EXITING (Kepenk Açılışı, Zafer Jingle'ı & Retro GTA Kutlama Banner'ı) -> COOLDOWN
 * 4. Web Audio Prosedürel Ses Sentezleyicisi (GarageAudio): Sıfır harici dosya gecikmeli
 *    kepenk motoru, yüksek basınçlı hava püskürtme tabancası, pnömatik bijon tabancası ve GTA jingle.
 * 5. Mini-harita / Radar Blip & Geliştirici Test Kısayolları.
 */

import * as THREE from 'three';
import { gameState } from './GameStateManager.js';

export const GTA_SPRAY_COLORS = [
  { name: 'Grove Street Green', hex: 0x1f4724 },
  { name: 'Candy Apple Red', hex: 0xb91c1c },
  { name: 'Midnight Navy Blue', hex: 0x1e3a8a },
  { name: 'Sunset Gold Pearl', hex: 0xd97706 },
  { name: 'Matte Charcoal Black', hex: 0x18181b },
  { name: 'Ballas Royal Purple', hex: 0x6b21a8 },
  { name: 'Pearl Frost White', hex: 0xf1f5f9 },
  { name: 'Sunburst Taxi Yellow', hex: 0xeab308 },
  { name: 'Silver Smoke Metallic', hex: 0x94a3b8 },
  { name: 'Laguna Seafoam Cyan', hex: 0x0d9488 },
  { name: 'Electric Tangerine', hex: 0xe11d48 },
  { name: 'Desert Sand Tan', hex: 0xa88764 }
];

/**
 * Prosedürel Web Audio Garaj Ses Sentezleyicisi
 */
export class GarageAudio {
  constructor() {
    this.ctx = null;
  }

  _getCtx() {
    if (!this.ctx) {
      if (window.app?.audioManager?.ctx) {
        this.ctx = window.app.audioManager.ctx;
      } else {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (AudioCtx) this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  playDoorMove(isClosing = true) {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;

    // Motor / Dişli Uğultusu (Sawtooth + Lowpass)
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(isClosing ? 82 : 72, now);
    osc.frequency.linearRampToValueAtTime(isClosing ? 58 : 94, now + 1.25);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(260, now);
    filter.Q.setValueAtTime(3.0, now);

    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.24, now + 0.1);
    gain.gain.linearRampToValueAtTime(0.24, now + 1.15);
    gain.gain.linearRampToValueAtTime(0.001, now + 1.35);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 1.4);

    // Metalik Dilim/Zincir Tıkırtıları (Rattling slats)
    for (let i = 0; i < 7; i++) {
      const clickTime = now + 0.12 + i * 0.16;
      const clickOsc = ctx.createOscillator();
      const clickGain = ctx.createGain();
      clickOsc.type = 'triangle';
      clickOsc.frequency.setValueAtTime(360 + (i % 3) * 70, clickTime);
      clickGain.gain.setValueAtTime(0.07, clickTime);
      clickGain.gain.exponentialRampToValueAtTime(0.001, clickTime + 0.04);
      clickOsc.connect(clickGain);
      clickGain.connect(ctx.destination);
      clickOsc.start(clickTime);
      clickOsc.stop(clickTime + 0.045);
    }
  }

  playSprayHiss() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    const duration = 2.4;

    // Yüksek Basınçlı Beyaz Gürültü (Air Compressor Paint Gun)
    const bufferSize = Math.floor(ctx.sampleRate * duration);
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    const noise = ctx.createBufferSource();
    noise.buffer = buffer;

    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(1400, now);
    filter.frequency.linearRampToValueAtTime(3100, now + 0.7);
    filter.frequency.linearRampToValueAtTime(1700, now + 1.5);
    filter.frequency.linearRampToValueAtTime(2600, now + 2.1);
    filter.Q.setValueAtTime(2.2, now);

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0.32, now + 0.15);
    gain.gain.linearRampToValueAtTime(0.32, now + duration - 0.25);
    gain.gain.linearRampToValueAtTime(0.001, now + duration);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    noise.start(now);
    noise.stop(now + duration + 0.05);

    // Pnömatik Bijon Tabancası Tıkırtıları (Tekerlek onarımı efekti)
    setTimeout(() => this.playPneumaticWrench(), 550);
    setTimeout(() => this.playPneumaticWrench(), 1350);
  }

  playPneumaticWrench() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 5; i++) {
      const t = now + i * 0.042;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sawtooth';
      osc.frequency.setValueAtTime(820 - i * 45, t);
      gain.gain.setValueAtTime(0.16, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.035);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.04);
    }
  }

  playJingleSuccess() {
    const ctx = this._getCtx();
    if (!ctx) return;
    const now = ctx.currentTime;
    // Otantik GTA San Andreas Zafer / Para Tınısı (C5, E5, G5, C6)
    const notes = [523.25, 659.25, 783.99, 1046.50];
    notes.forEach((freq, idx) => {
      const t = now + idx * 0.085;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.26, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.42);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.45);
    });
  }
}

/**
 * Pay 'n' Spray Garaj Yöneticisi (ADIM 17)
 */
export class PayNSprayManager {
  constructor(scene, app) {
    this.scene = scene;
    this.app = app;
    this.audio = new GarageAudio();

    // Garaj Dünya Konumu (Los Santos Ana Yol Kenarı)
    this.garagePos = new THREE.Vector3(-28.0, 0.0, -35.0);
    this.garageHeading = 0; // Giriş Güney (+Z yönüne) bakar
    this.approachPos = new THREE.Vector3(-28.0, 0.5, -23.0);

    // Garaj Ölçüleri
    this.garageWidth = 8.4;
    this.garageDepth = 10.8;
    this.garageHeight = 4.4;
    this.doorMaxY = 3.3; // Kepenk tamamen açık yükseklik
    this.doorCurrentY = 3.3;
    this.doorTargetY = 3.3;

    // FSM Durumları: 'IDLE', 'ENTERING', 'DOOR_CLOSING', 'SPRAYING', 'DOOR_OPENING', 'COOLDOWN'
    this.state = 'IDLE';
    this.stateTimer = 0;
    this.targetVehicle = null;
    this.cooldownTimer = 0;

    // 3D Sahne Grupları
    this.root = new THREE.Group();
    this.root.name = 'PayNSpray_Garage';
    this.root.position.copy(this.garagePos);
    this.scene.add(this.root);

    this.shutterDoor = null;
    this.entranceMarker = null;
    this.sprayParticles = null;
    this.sprayParticleMat = null;
    this.lastColorHex = 0x1f4724;

    this._buildGarage();
    this._buildEntranceMarker();
    this._buildSprayParticles();
    this._setupGlobalDebugHooks();
  }

  /* =========================================================
     1. 3D GARAJ MİMARİSİ VE NESNELERİ
     ========================================================= */
  _buildGarage() {
    const W = this.garageWidth;
    const D = this.garageDepth;
    const H = this.garageHeight;

    // 1. Zemin Betonu (İç Mekan & Otopark Şeritleri)
    const floorGeo = new THREE.PlaneGeometry(W - 0.2, D - 0.2);
    floorGeo.rotateX(-Math.PI / 2);
    const floorMat = new THREE.MeshStandardMaterial({
      color: 0x24272c,
      roughness: 0.85,
      metalness: 0.15
    });
    const floorMesh = new THREE.Mesh(floorGeo, floorMat);
    floorMesh.position.set(0, 0.04, 0);
    floorMesh.receiveShadow = true;
    this.root.add(floorMesh);

    // Sarı Otopark Park Çizgileri
    const lineMat = new THREE.MeshBasicMaterial({ color: 0xeab308 });
    const lineGeo1 = new THREE.PlaneGeometry(0.18, 5.5);
    lineGeo1.rotateX(-Math.PI / 2);
    const leftLine = new THREE.Mesh(lineGeo1, lineMat);
    leftLine.position.set(-1.8, 0.05, 0);
    const rightLine = new THREE.Mesh(lineGeo1, lineMat);
    rightLine.position.set(1.8, 0.05, 0);
    this.root.add(leftLine, rightLine);

    // 2. Dış ve İç Duvarlar
    const wallMat = new THREE.MeshStandardMaterial({
      color: 0x785642, // Los Santos kirli pişmiş tuğla tonu
      roughness: 0.90,
      metalness: 0.05
    });

    const innerWallMat = new THREE.MeshStandardMaterial({
      color: 0x3e4249, // Endüstriyel atölye gri beton
      roughness: 0.80,
      metalness: 0.20
    });

    // Arka Duvar (Z = -D/2)
    const backWallGeo = new THREE.BoxGeometry(W, H, 0.4);
    const backWall = new THREE.Mesh(backWallGeo, wallMat);
    backWall.position.set(0, H / 2, -D / 2);
    this.root.add(backWall);

    // Sol Duvar (X = -W/2)
    const sideWallGeo = new THREE.BoxGeometry(0.4, H, D);
    const leftWall = new THREE.Mesh(sideWallGeo, wallMat);
    leftWall.position.set(-W / 2, H / 2, 0);
    this.root.add(leftWall);

    // Sağ Duvar (X = +W/2)
    const rightWall = new THREE.Mesh(sideWallGeo, wallMat);
    rightWall.position.set(W / 2, H / 2, 0);
    this.root.add(rightWall);

    // Ön Duvar Üst Kiriş (Lento - Giriş Açıklığı Üstü)
    const lintelH = H - this.doorMaxY;
    const lintelGeo = new THREE.BoxGeometry(W, lintelH, 0.4);
    const lintelMesh = new THREE.Mesh(lintelGeo, wallMat);
    lintelMesh.position.set(0, this.doorMaxY + lintelH / 2, D / 2);
    this.root.add(lintelMesh);

    // Ön Duvar Sol & Sağ Destek Sütunları
    const pillarW = (W - 7.0) / 2;
    if (pillarW > 0.1) {
      const pillarGeo = new THREE.BoxGeometry(pillarW, this.doorMaxY, 0.4);
      const leftPillar = new THREE.Mesh(pillarGeo, wallMat);
      leftPillar.position.set(-W / 2 + pillarW / 2, this.doorMaxY / 2, D / 2);
      const rightPillar = new THREE.Mesh(pillarGeo, wallMat);
      rightPillar.position.set(W / 2 - pillarW / 2, this.doorMaxY / 2, D / 2);
      this.root.add(leftPillar, rightPillar);
    }

    // 3. Çatı (Endüstriyel Oluklu Sac & Havalandırma)
    const roofGeo = new THREE.BoxGeometry(W + 0.6, 0.35, D + 0.6);
    const roofMat = new THREE.MeshStandardMaterial({
      color: 0x333b45,
      roughness: 0.6,
      metalness: 0.4
    });
    const roof = new THREE.Mesh(roofGeo, roofMat);
    roof.position.set(0, H + 0.175, 0);
    this.root.add(roof);

    // Çatı Havalandırma Ünitesi (AC Unit & Fan Izgarası)
    const acGeo = new THREE.BoxGeometry(1.8, 0.9, 1.4);
    const acMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.5 });
    const acMesh = new THREE.Mesh(acGeo, acMat);
    acMesh.position.set(1.5, H + 0.75, -1.0);
    this.root.add(acMesh);

    // 4. Animasyonlu Kepenk Kapısı (Roller Shutter Door)
    const doorW = W - (pillarW * 2) - 0.1;
    const doorH = this.doorMaxY;
    const doorGroup = new THREE.Group();
    doorGroup.position.set(0, 0, D / 2 - 0.05);

    // Metal Dilimli Kepenk Geometrisi
    const slatCanvas = document.createElement('canvas');
    slatCanvas.width = 256;
    slatCanvas.height = 512;
    const sctx = slatCanvas.getContext('2d');
    sctx.fillStyle = '#64748b';
    sctx.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 32; i++) {
      const y = i * 16;
      sctx.fillStyle = '#94a3b8';
      sctx.fillRect(0, y, 256, 3);
      sctx.fillStyle = '#475569';
      sctx.fillRect(0, y + 3, 256, 11);
      sctx.fillStyle = '#1e293b';
      sctx.fillRect(0, y + 14, 256, 2);
    }
    const slatTex = new THREE.CanvasTexture(slatCanvas);
    slatTex.wrapS = THREE.RepeatWrapping;
    slatTex.wrapT = THREE.RepeatWrapping;

    const doorGeo = new THREE.PlaneGeometry(doorW, doorH);
    const doorMat = new THREE.MeshStandardMaterial({
      map: slatTex,
      metalness: 0.65,
      roughness: 0.35,
      side: THREE.DoubleSide
    });
    const doorMesh = new THREE.Mesh(doorGeo, doorMat);
    // Pivot noktası üst kenarda veya merkezde: mesh'i merkeze alıp grubu hareket ettirelim
    doorMesh.position.set(0, doorH / 2, 0);
    doorGroup.add(doorMesh);

    // Kepenk alt tutma kolu / metal kilit çubuğu
    const handleGeo = new THREE.BoxGeometry(doorW, 0.08, 0.1);
    const handleMat = new THREE.MeshStandardMaterial({ color: 0x0f172a, metalness: 0.8 });
    const handleMesh = new THREE.Mesh(handleGeo, handleMat);
    handleMesh.position.set(0, 0.04, 0.05);
    doorGroup.add(handleMesh);

    this.shutterDoor = doorGroup;
    this.shutterDoor.position.y = this.doorMaxY; // Başlangıçta açık
    this.root.add(this.shutterDoor);

    // 5. İkonik "PAY 'N' SPRAY" Neon Tabelası (Ön Giriş Üzerinde)
    this._buildNeonSign(W, D, H);

    // 6. Atölye İç Detayları (Hava Kompresörü, Sprey Kutuları, Takım Dolapları)
    this._buildInteriorProps(W, D);
  }

  _buildNeonSign(W, D, H) {
    const signGroup = new THREE.Group();
    signGroup.position.set(0, this.doorMaxY + (H - this.doorMaxY) / 2, D / 2 + 0.22);

    // Tabela Arka Paneli (Siyah Mat Kutu)
    const panelGeo = new THREE.BoxGeometry(6.4, 0.9, 0.12);
    const panelMat = new THREE.MeshStandardMaterial({
      color: 0x111317,
      roughness: 0.7,
      metalness: 0.3
    });
    const panel = new THREE.Mesh(panelGeo, panelMat);
    signGroup.add(panel);

    // Neon Yazı Canvas Dokusu (PAY 'N' SPRAY)
    const canvas = document.createElement('canvas');
    canvas.width = 1024;
    canvas.height = 256;
    const ctx = canvas.getContext('2d');

    // Arka plan şeffaf
    ctx.clearRect(0, 0, 1024, 256);

    // Kırmızı & Altın Sarı Neon Çerçeve
    ctx.strokeStyle = '#ef4444';
    ctx.lineWidth = 8;
    ctx.strokeRect(16, 16, 992, 224);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(26, 26, 972, 204);

    // "PAY 'N' SPRAY" Yazısı
    ctx.font = 'bold 96px "Impact", "Arial Black", sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    // Neon Glow Katmanları
    ctx.shadowColor = '#f59e0b';
    ctx.shadowBlur = 24;
    ctx.fillStyle = '#fbbf24';
    ctx.fillText("PAY 'N' SPRAY", 512, 120);

    ctx.shadowColor = '#ef4444';
    ctx.shadowBlur = 12;
    ctx.fillStyle = '#ffffff';
    ctx.fillText("PAY 'N' SPRAY", 512, 120);

    // Alt Slogan
    ctx.shadowBlur = 0;
    ctx.font = 'bold 28px sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.letterSpacing = '4px';
    ctx.fillText("RESRAY & BODYWORK • AUTO REPAIR", 512, 185);

    const signTex = new THREE.CanvasTexture(canvas);
    signTex.colorSpace = THREE.SRGBColorSpace;

    const signTextGeo = new THREE.PlaneGeometry(6.3, 0.85);
    const signTextMat = new THREE.MeshBasicMaterial({
      map: signTex,
      transparent: true
    });
    const signTextMesh = new THREE.Mesh(signTextGeo, signTextMat);
    signTextMesh.position.set(0, 0, 0.07);
    signGroup.add(signTextMesh);

    // Sıcak Altın Sarı / Kırmızı Neon Nokta Işığı
    const neonLight = new THREE.PointLight(0xf59e0b, 1.8, 14, 1.5);
    neonLight.position.set(0, 0, 1.2);
    signGroup.add(neonLight);

    this.root.add(signGroup);
  }

  _buildInteriorProps(W, D) {
    // 1. Kırmızı Endüstriyel Hava Kompresörü (Sol Köşe)
    const compGroup = new THREE.Group();
    compGroup.position.set(-W / 2 + 1.1, 0, -D / 2 + 1.2);

    const tankGeo = new THREE.CylinderGeometry(0.35, 0.35, 1.4, 12);
    tankGeo.rotateZ(Math.PI / 2);
    const tankMat = new THREE.MeshStandardMaterial({ color: 0xdc2626, metalness: 0.7, roughness: 0.3 });
    const tank = new THREE.Mesh(tankGeo, tankMat);
    tank.position.set(0, 0.45, 0);
    compGroup.add(tank);

    // Basınç Saati & Motor
    const motorGeo = new THREE.BoxGeometry(0.4, 0.35, 0.35);
    const motorMat = new THREE.MeshStandardMaterial({ color: 0x1e293b, metalness: 0.8 });
    const motor = new THREE.Mesh(motorGeo, motorMat);
    motor.position.set(0, 0.95, 0);
    compGroup.add(motor);

    this.root.add(compGroup);

    // 2. Duvara Monte Sprey Boya Rafları (Sağ Duvar)
    const shelfGroup = new THREE.Group();
    shelfGroup.position.set(W / 2 - 0.25, 1.6, -1.0);

    const rackGeo = new THREE.BoxGeometry(0.3, 0.05, 3.2);
    const rackMat = new THREE.MeshStandardMaterial({ color: 0x475569, metalness: 0.6 });
    const rack = new THREE.Mesh(rackGeo, rackMat);
    shelfGroup.add(rack);

    // Renkli Sprey Tüpleri
    const canColors = [0xef4444, 0x3b82f6, 0x22c55e, 0xfacc15, 0xa855f7, 0x06b6d4, 0xffffff, 0x18181b];
    for (let i = 0; i < 14; i++) {
      const canGeo = new THREE.CylinderGeometry(0.06, 0.06, 0.24, 8);
      const canMat = new THREE.MeshStandardMaterial({
        color: canColors[i % canColors.length],
        metalness: 0.6,
        roughness: 0.3
      });
      const can = new THREE.Mesh(canGeo, canMat);
      can.position.set((Math.random() - 0.5) * 0.1, 0.14, -1.4 + i * 0.22);
      shelfGroup.add(can);
    }
    this.root.add(shelfGroup);

    // 3. Tavan Floresan Aydınlatmaları (Cool White Glow)
    const light1 = new THREE.PointLight(0xe0f2fe, 1.2, 12, 1.2);
    light1.position.set(0, 3.6, -2.5);
    const light2 = new THREE.PointLight(0xe0f2fe, 1.2, 12, 1.2);
    light2.position.set(0, 3.6, 2.0);
    this.root.add(light1, light2);
  }

  /* =========================================================
     2. GİRİŞ İŞARETÇİSİ (DÖNEN SPREY KUTUSU & ZEMİN HALKASI)
     ========================================================= */
  _buildEntranceMarker() {
    const markerGroup = new THREE.Group();
    // Girişin hemen önü (Z = +D/2 + 2.0)
    markerGroup.position.set(0, 0, this.garageDepth / 2 + 2.2);

    // Zemin Neon Halkası (Pulsating Ring)
    const ringGeo = new THREE.RingGeometry(1.6, 2.0, 32);
    ringGeo.rotateX(-Math.PI / 2);
    const ringMat = new THREE.MeshBasicMaterial({
      color: 0xf59e0b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.75
    });
    this.ringMesh = new THREE.Mesh(ringGeo, ringMat);
    this.ringMesh.position.set(0, 0.06, 0);
    markerGroup.add(this.ringMesh);

    // 3D Dönen Altın Renkli Sprey Kutusu İkonu
    const canGroup = new THREE.Group();
    canGroup.position.set(0, 1.25, 0);

    // Gövde
    const bodyGeo = new THREE.CylinderGeometry(0.24, 0.24, 0.65, 16);
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0xf59e0b,
      metalness: 0.85,
      roughness: 0.25,
      emissive: 0x78350f,
      emissiveIntensity: 0.4
    });
    const body = new THREE.Mesh(bodyGeo, bodyMat);
    canGroup.add(body);

    // Başlık & Püskürtme Ucu
    const topGeo = new THREE.CylinderGeometry(0.18, 0.24, 0.12, 16);
    const topMat = new THREE.MeshStandardMaterial({ color: 0x94a3b8, metalness: 0.9 });
    const topMesh = new THREE.Mesh(topGeo, topMat);
    topMesh.position.set(0, 0.38, 0);
    canGroup.add(topMesh);

    const nozzleGeo = new THREE.BoxGeometry(0.08, 0.08, 0.12);
    const nozzleMat = new THREE.MeshStandardMaterial({ color: 0xdc2626 });
    const nozzle = new THREE.Mesh(nozzleGeo, nozzleMat);
    nozzle.position.set(0, 0.46, 0.08);
    canGroup.add(nozzle);

    this.floatingCan = canGroup;
    markerGroup.add(this.floatingCan);

    this.entranceMarker = markerGroup;
    this.root.add(this.entranceMarker);
  }

  /* =========================================================
     3. 3D DÖNEN SPREY BULUTU PARTİKÜLLERİ
     ========================================================= */
  _buildSprayParticles() {
    const particleCount = 280;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);

    this.particleVelocities = [];

    for (let i = 0; i < particleCount; i++) {
      // Araç çevresinde dairesel/silindirik bulut
      const angle = Math.random() * Math.PI * 2;
      const radius = 1.0 + Math.random() * 2.2;
      positions[i * 3 + 0] = Math.cos(angle) * radius;
      positions[i * 3 + 1] = 0.2 + Math.random() * 2.0;
      positions[i * 3 + 2] = Math.sin(angle) * radius;

      // Başlangıç rengi: Canlı altın sarı & yeşil tonları
      colors[i * 3 + 0] = 0.95;
      colors[i * 3 + 1] = 0.85;
      colors[i * 3 + 2] = 0.25;

      this.particleVelocities.push({
        angle: angle,
        speed: 1.8 + Math.random() * 2.5,
        radius: radius,
        vy: 0.5 + Math.random() * 1.2
      });
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));

    // Partikül Materyali
    this.sprayParticleMat = new THREE.PointsMaterial({
      size: 0.35,
      vertexColors: true,
      transparent: true,
      opacity: 0.0, // Boyama sırasında belirir
      blending: THREE.AdditiveBlending,
      depthWrite: false
    });

    this.sprayParticles = new THREE.Points(geometry, this.sprayParticleMat);
    this.sprayParticles.position.set(0, 0, 0); // Garaj içi merkez
    this.sprayParticles.visible = false;
    this.root.add(this.sprayParticles);
  }

  /* =========================================================
     4. GÜNCELLEME VE FSM DURUM MAKİNESİ
     ========================================================= */
  update(delta, playerPos, activeVehicle) {
    if (!delta || delta <= 0) return;

    // 1. Zemin İşaretçisi Animasyonu (Dönme ve Süzülme)
    if (this.floatingCan) {
      this.floatingCan.rotation.y += delta * 1.8;
      this.floatingCan.position.y = 1.2 + Math.sin(performance.now() * 0.003) * 0.15;
    }
    if (this.ringMesh) {
      const scale = 1.0 + Math.sin(performance.now() * 0.004) * 0.06;
      this.ringMesh.scale.set(scale, scale, 1);
    }

    // 2. Kepenk Kapısı Pürüzsüz İnme/Kalkma (Lerp)
    if (Math.abs(this.doorCurrentY - this.doorTargetY) > 0.01) {
      this.doorCurrentY = THREE.MathUtils.lerp(this.doorCurrentY, this.doorTargetY, delta * 3.5);
      if (this.shutterDoor) {
        this.shutterDoor.position.y = this.doorCurrentY;
      }
    }

    // 3. Cooldown Sayacı
    if (this.cooldownTimer > 0) {
      this.cooldownTimer -= delta;
    }

    // 4. Garaj Durum Makinesi
    switch (this.state) {
      case 'IDLE': {
        this._updateIdleState(delta, playerPos, activeVehicle);
        break;
      }
      case 'ENTERING': {
        this._updateEnteringState(delta);
        break;
      }
      case 'SPRAYING': {
        this._updateSprayingState(delta);
        break;
      }
      case 'DOOR_OPENING': {
        this._updateDoorOpeningState(delta);
        break;
      }
    }
  }

  _updateIdleState(delta, playerPos, activeVehicle) {
    if (this.cooldownTimer > 0) return;
    if (!activeVehicle) return;

    // Oyuncunun aracıyla garaj girişine olan mesafesi
    const entranceWorldPos = new THREE.Vector3(
      this.garagePos.x,
      this.garagePos.y,
      this.garagePos.z + this.garageDepth / 2 + 1.5
    );
    const dist = activeVehicle.position.distanceTo(entranceWorldPos);

    // Tetiklenme Alanı (< 4.2 metre)
    if (dist < 4.2) {
      console.log('🚗 [PAY N SPRAY] Araç garaj girişine yanaştı, işlem başlatılıyor...');
      this.targetVehicle = activeVehicle;
      this.state = 'ENTERING';
      this.stateTimer = 0;

      // Araç kontrollerini dondur
      this.targetVehicle.isLocked = true;
      this.targetVehicle.speed = 0;
      this.targetVehicle.vForward = 0;
      this.targetVehicle.vLateral = 0;

      // Kepenk kapanmaya başlasın
      this.doorTargetY = 0.0;
      this.audio.playDoorMove(true);
    }
  }

  _updateEnteringState(delta) {
    this.stateTimer += delta;
    if (!this.targetVehicle) {
      this.state = 'IDLE';
      return;
    }

    // Aracı garajın tam merkezine pürüzsüzce hizala
    const targetCenter = new THREE.Vector3(this.garagePos.x, 0.25, this.garagePos.z);
    this.targetVehicle.position.lerp(targetCenter, delta * 2.8);
    this.targetVehicle.heading = THREE.MathUtils.lerp(this.targetVehicle.heading, Math.PI, delta * 3.0);
    this.targetVehicle.root.rotation.y = this.targetVehicle.heading;
    this.targetVehicle.speed = 0;

    // Kepenk kapandı mı? (doorCurrentY < 0.1)
    if (this.doorCurrentY <= 0.15 || this.stateTimer > 2.0) {
      console.log('🚪 [PAY N SPRAY] Kepenk kapandı, boyama ve tamir başlıyor...');
      this.state = 'SPRAYING';
      this.stateTimer = 0;

      // Sprey partiküllerini ve sesleri devreye sok
      if (this.sprayParticles) {
        this.sprayParticles.visible = true;
        this.sprayParticleMat.opacity = 0.85;
      }
      this.audio.playSprayHiss();
    }
  }

  _updateSprayingState(delta) {
    this.stateTimer += delta;

    // Partikül Animasyonu (Araç etrafında girdap gibi dönen renkli sprey bulutu)
    if (this.sprayParticles) {
      const posAttr = this.sprayParticles.geometry.attributes.position;
      const colAttr = this.sprayParticles.geometry.attributes.color;
      const count = posAttr.count;

      for (let i = 0; i < count; i++) {
        const vel = this.particleVelocities[i];
        vel.angle += vel.speed * delta;
        const x = Math.cos(vel.angle) * vel.radius;
        const z = Math.sin(vel.angle) * vel.radius;
        let y = posAttr.getY(i) + vel.vy * delta;
        if (y > 3.2) y = 0.2; // Döngüsel duman

        posAttr.setXYZ(i, x, y, z);
      }
      posAttr.needsUpdate = true;
    }

    // 1.25. Saniyede Renk Değişimi, Lastik Onarımı & Aranma Seviyesi Sıfırlama
    if (this.stateTimer >= 1.25 && !this._sprayApplied) {
      this._sprayApplied = true;
      this._applyRepaintAndRepair();
    }

    // 2.5 Saniye sonunda boyama bitti, kepenk açılsın
    if (this.stateTimer >= 2.5) {
      console.log('✨ [PAY N SPRAY] Boyama tamamlandı, kepenk açılıyor...');
      this.state = 'DOOR_OPENING';
      this.stateTimer = 0;
      this._sprayApplied = false;

      // Partikülleri söndür
      if (this.sprayParticleMat) {
        this.sprayParticleMat.opacity = 0.0;
      }
      if (this.sprayParticles) {
        this.sprayParticles.visible = false;
      }

      // Kepenk yukarı açılsın
      this.doorTargetY = this.doorMaxY;
      this.audio.playDoorMove(false);
      this.audio.playJingleSuccess();
    }
  }

  _updateDoorOpeningState(delta) {
    this.stateTimer += delta;

    // Kepenk tamamen açıldığında oyuncunun kontrollerini serbest bırak
    if (this.doorCurrentY >= this.doorMaxY - 0.2 || this.stateTimer > 1.8) {
      console.log('🔓 [PAY N SPRAY] Garaj açıldı, kontroller serbest bırakıldı.');
      if (this.targetVehicle) {
        this.targetVehicle.isLocked = false;
        this.targetVehicle = null;
      }

      // 5 saniye cooldown ile garajdan rahatça çıkması sağlansın
      this.state = 'IDLE';
      this.cooldownTimer = 5.0;

      // Kutlama Bildirimi Göster
      this._showSuccessNotification();
    }
  }

  /* =========================================================
     5. BOYA, TAMİR, PARA VE ARANMA SEVİYESİ UYGULAYICI
     ========================================================= */
  _applyRepaintAndRepair() {
    if (!this.targetVehicle) return;

    // 1. Yeni Metalik Renk Seç (Mevcut renkten farklı bir renk)
    const currentHex = this.targetVehicle.colorHex || 0;
    const available = GTA_SPRAY_COLORS.filter(c => c.hex !== currentHex);
    const chosen = available[Math.floor(Math.random() * available.length)] || GTA_SPRAY_COLORS[0];
    this.lastColorHex = chosen.hex;

    // Aracı yeni renge boya
    if (typeof this.targetVehicle.recolor === 'function') {
      this.targetVehicle.recolor(chosen.hex);
    } else {
      this.targetVehicle.colorHex = chosen.hex;
    }

    // 2. Lastikleri & Şasiyi Onar
    if (typeof this.targetVehicle.repair === 'function') {
      this.targetVehicle.repair();
    }
    if (typeof this.targetVehicle.repairTires === 'function') {
      this.targetVehicle.repairTires();
    }

    // 3. Polis Yıldızlarını Tamamen Sıfırla (WANTED LEVEL CLEARED)
    if (this.app?.wantedManager) {
      this.app.wantedManager.clearWanted();
    }

    // 4. Ücret Kesimi ($100)
    const playerMoney = gameState.state.player.money || 0;
    if (playerMoney >= 100) {
      gameState.addMoney(-100);
    } else {
      console.log('💰 [PAY N SPRAY] Yetersiz bakiye, Grove Street dostu indirimi uygulandı (Ücretsiz).');
    }

    // Partikül rengini seçilen boyaya uyarla
    if (this.sprayParticles) {
      const colAttr = this.sprayParticles.geometry.attributes.color;
      const targetCol = new THREE.Color(chosen.hex);
      for (let i = 0; i < colAttr.count; i++) {
        colAttr.setXYZ(i, targetCol.r, targetCol.g, targetCol.b);
      }
      colAttr.needsUpdate = true;
    }

    console.log(`🎨 [PAY N SPRAY] Araç ${chosen.name} (#${chosen.hex.toString(16)}) rengine boyandı ve onarıldı!`);
  }

  /* =========================================================
     6. RETRO GTA SAN ANDREAS HUD BİLDİRİMİ
     ========================================================= */
  _showSuccessNotification() {
    let el = document.getElementById('gta-paynspray-notification');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta-paynspray-notification';
      el.className = 'gta-paynspray-banner';
      document.body.appendChild(el);
    }

    el.innerHTML = `
      <div class="gta-paynspray-title">VEHICLE RESPLAYED & REPAIRED!</div>
      <div class="gta-paynspray-sub">Pay 'n' Spray Servisi Tamamlandı</div>
      <div class="gta-paynspray-detail">WANTED LEVEL CLEARED • $100</div>
    `;

    el.classList.add('show');
    if (this._notifTimer) clearTimeout(this._notifTimer);
    this._notifTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 3800);
  }

  /* =========================================================
     7. TEST VE GELİŞTİRİCİ YARDIMCILARI
     ========================================================= */
  getGaragePosition() {
    return this.garagePos;
  }

  teleportToEntrance() {
    const target = this.app?.vehicleManager?.activeVehicle || this.app?.characterManager;
    if (!target) return;

    const spawnPos = this.approachPos.clone();
    target.position.copy(spawnPos);

    if (target.root) {
      target.root.position.copy(spawnPos);
    }
    if (target.heading !== undefined) {
      target.heading = Math.PI; // Garaj kapısına doğru baksın
      if (target.root) target.root.rotation.y = target.heading;
    }
    console.log(`🚀 [PAY N SPRAY] Pay 'n' Spray Garajı önüne ışınlandınız! (${spawnPos.x}, ${spawnPos.z})`);
  }

  triggerSprayDirectly() {
    const v = this.app?.vehicleManager?.activeVehicle;
    if (!v) {
      console.warn('⚠️ [PAY N SPRAY] Boyama için bir araç içinde olmalısınız!');
      return;
    }
    this.targetVehicle = v;
    this.state = 'ENTERING';
    this.stateTimer = 0;
    this.doorTargetY = 0.0;
    this.audio.playDoorMove(true);
    console.log('⚡ [PAY N SPRAY] Manuel boyama döngüsü başlatıldı!');
  }

  _setupGlobalDebugHooks() {
    window.payNSprayManager = this;
    window.teleportToPayNSpray = () => this.teleportToEntrance();
    window.triggerPayNSpray = () => this.triggerSprayDirectly();
  }
}
