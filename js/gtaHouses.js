import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { PARCEL_PLOTS } from './parcels.js';
import { RealisticTreeBuilder } from './trees.js';
import { assetManager } from './assets/AssetManager.js';

/**
 * GTA San Andreas - Grove Street & Ganton Mimari & Atmosfer Fabrikası
 * - Orijinal GTA SA oyun dokuları (wall.jpg, whiteoutwall_concrete.jpg, panelMetalTexture.png, garden.jpg)
 * - İkonik CJ Evi (yeşil panjurlu garaj, basketbol potası, 2 kemerli veranda, çatı TV anteni)
 * - Ryder ve Sweet evleri
 * - Sokak boyunca uzanan ahşap elektrik/telefon direkleri ve sarkan siyah teller
 * - Arka bahçelerde yükselen Los Santos California palmiyeleri ve gölge ağaçları
 */

class GTATextureFactory {
  static createStuccoTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    // Los Santos güneş yanığı bej/sıva tonu
    ctx.fillStyle = '#d5cbbd';
    ctx.fillRect(0, 0, 512, 512);

    const imgData = ctx.getImageData(0, 0, 512, 512);
    const data = imgData.data;
    for (let i = 0; i < data.length; i += 4) {
      const noise = (Math.random() - 0.5) * 22;
      data[i] = Math.min(255, Math.max(0, data[i] + noise));
      data[i + 1] = Math.min(255, Math.max(0, data[i + 1] + noise));
      data[i + 2] = Math.min(255, Math.max(0, data[i + 2] + noise));
    }
    ctx.putImageData(imgData, 0, 0);

    const grad = ctx.createLinearGradient(0, 0, 0, 512);
    grad.addColorStop(0.0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.75, 'rgba(0,0,0,0.04)');
    grad.addColorStop(1.0, 'rgba(70, 55, 40, 0.22)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 512, 512);

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createGarageDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#486343';
    ctx.fillRect(0, 0, 512, 512);

    const slatCount = 28;
    const slatHeight = 512 / slatCount;

    for (let i = 0; i < slatCount; i++) {
      const y = i * slatHeight;
      ctx.fillStyle = 'rgba(120, 160, 110, 0.45)';
      ctx.fillRect(0, y, 512, 2.5);

      ctx.fillStyle = (i % 2 === 0) ? '#4a6745' : '#445f40';
      ctx.fillRect(0, y + 2.5, 512, slatHeight - 4.5);

      ctx.fillStyle = 'rgba(25, 40, 20, 0.7)';
      ctx.fillRect(0, y + slatHeight - 2, 512, 2);
    }

    for (let i = 0; i < 400; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(70, 85, 60, 0.2)' : 'rgba(20, 30, 15, 0.25)';
      ctx.fillRect(x, y, Math.random() * 15 + 2, 1.5);
    }

    ctx.fillStyle = '#222222';
    ctx.fillRect(236, 480, 40, 10);
    ctx.fillStyle = '#dddddd';
    ctx.fillRect(254, 484, 4, 3);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createBasketballBackboardTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 160;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ece8df';
    ctx.fillRect(0, 0, 256, 160);

    ctx.strokeStyle = '#222222';
    ctx.lineWidth = 6;
    ctx.strokeRect(3, 3, 250, 154);

    ctx.strokeStyle = '#c4281b';
    ctx.lineWidth = 7;
    ctx.strokeRect(88, 70, 80, 60);

    ctx.fillStyle = '#444444';
    ctx.fillRect(10, 10, 5, 5);
    ctx.fillRect(241, 10, 5, 5);
    ctx.fillRect(10, 145, 5, 5);
    ctx.fillRect(241, 145, 5, 5);

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createClapboardTexture(baseHex, shadowHex) {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = baseHex;
    ctx.fillRect(0, 0, 512, 512);

    const plankCount = 32;
    const plankH = 512 / plankCount;

    for (let i = 0; i < plankCount; i++) {
      const y = i * plankH;
      ctx.fillStyle = shadowHex;
      ctx.fillRect(0, y + plankH - 2, 512, 2);
      ctx.fillStyle = 'rgba(255,255,255,0.15)';
      ctx.fillRect(0, y, 512, 1.2);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createShingleTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#423d38';
    ctx.fillRect(0, 0, 512, 512);

    const rows = 24;
    const rowH = 512 / rows;
    for (let r = 0; r < rows; r++) {
      const y = r * rowH;
      const offset = (r % 2) * 20;
      ctx.fillStyle = (r % 2 === 0) ? '#48433e' : '#3c3834';
      ctx.fillRect(0, y, 512, rowH - 2);

      ctx.fillStyle = '#262320';
      ctx.fillRect(0, y + rowH - 2, 512, 2);
      for (let x = offset; x < 512; x += 40) {
        ctx.fillRect(x, y, 2, rowH);
      }
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createDoorTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#ded9ce';
    ctx.fillRect(0, 0, 256, 512);

    const panels = [
      { x: 30, y: 40, w: 85, h: 180 },
      { x: 141, y: 40, w: 85, h: 180 },
      { x: 30, y: 260, w: 85, h: 200 },
      { x: 141, y: 260, w: 85, h: 200 }
    ];

    panels.forEach(p => {
      ctx.fillStyle = '#b5ad9f';
      ctx.fillRect(p.x, p.y, p.w, p.h);
      ctx.fillStyle = '#ece7dc';
      ctx.fillRect(p.x + 4, p.y + 4, p.w - 8, p.h - 8);
    });

    ctx.fillStyle = '#cca348';
    ctx.beginPath();
    ctx.arc(42, 270, 7, 0, Math.PI * 2);
    ctx.fill();

    const tex = new THREE.CanvasTexture(canvas);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }

  static createDrivewayTexture() {
    const canvas = document.createElement('canvas');
    canvas.width = 512;
    canvas.height = 512;
    const ctx = canvas.getContext('2d');

    ctx.fillStyle = '#b7ab95';
    ctx.fillRect(0, 0, 512, 512);

    ctx.fillStyle = 'rgba(70, 60, 48, 0.28)';
    ctx.fillRect(80, 0, 70, 512);
    ctx.fillRect(362, 0, 70, 512);

    for (let i = 0; i < 4000; i++) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      ctx.fillStyle = Math.random() > 0.5 ? 'rgba(230,220,200,0.3)' : 'rgba(50,40,30,0.25)';
      ctx.fillRect(x, y, Math.random() * 2 + 1, Math.random() * 2 + 1);
    }

    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
}

/**
 * GTA San Andreas Evi ve Çevre Bileşenleri İnşa Edici
 */
export class GTAHouseBuilder {
  constructor(gltfLoader = null) {
    this.gltfLoader = gltfLoader;
    this.treeBuilder = new RealisticTreeBuilder();
    this.initMaterials();
    this.initGLBTemplates();
  }

  initMaterials() {
    const texLoader = new THREE.TextureLoader();

    // 1. Orijinal GTA SA Dış Cephe Duvar Kaplaması (wall.jpg)
    const gtaWallTex = texLoader.load('assets/gta/wall.jpg', (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 2);
      t.colorSpace = THREE.SRGBColorSpace;
      this.matStucco.needsUpdate = true;
    }, undefined, () => {
      console.log('GTA wall texture fallback to procedural canvas');
    });

    this.matStucco = new THREE.MeshStandardMaterial({
      color: 0xdfd3c2,
      map: gtaWallTex,
      roughness: 0.9,
      metalness: 0.05
    });

    // 2. Orijinal GTA SA Kemer & Beton Sıva Kaplaması (whiteoutwall_concrete.jpg)
    const gtaConcreteTex = texLoader.load('assets/gta/whiteoutwall_concrete.jpg', (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(2, 2);
      t.colorSpace = THREE.SRGBColorSpace;
      this.matArchStucco.needsUpdate = true;
    });

    this.matArchStucco = new THREE.MeshStandardMaterial({
      color: 0xe2d8c8,
      map: gtaConcreteTex,
      roughness: 0.86,
      metalness: 0.06
    });

    // 3. CJ Garaj Kapısı (İkonik Yeşil Oluklu Rulo Panjur)
    this.matGarage = new THREE.MeshStandardMaterial({
      map: GTATextureFactory.createGarageDoorTexture(),
      roughness: 0.55,
      metalness: 0.25
    });

    // 4. Bahçe ve Toprak (garden.jpg)
    const gtaGardenTex = texLoader.load('assets/gta/garden.jpg', (t) => {
      t.wrapS = THREE.RepeatWrapping;
      t.wrapT = THREE.RepeatWrapping;
      t.repeat.set(3, 3);
      t.colorSpace = THREE.SRGBColorSpace;
      this.matLawn.needsUpdate = true;
    });

    this.matLawn = new THREE.MeshStandardMaterial({
      color: 0x768742,
      map: gtaGardenTex,
      roughness: 0.95,
      metalness: 0.02
    });

    // 5. Basketbol Potası Panyası
    this.matBackboard = new THREE.MeshStandardMaterial({
      map: GTATextureFactory.createBasketballBackboardTexture(),
      roughness: 0.6,
      metalness: 0.1
    });

    // 6. Basketbol Çemberi (Turuncu Metal)
    this.matHoop = new THREE.MeshStandardMaterial({
      color: 0xdb4716,
      roughness: 0.35,
      metalness: 0.7
    });

    // 7. Kiremit / Terracotta Saçak Kenarlığı (#6d382b)
    this.matFasciaTrim = new THREE.MeshStandardMaterial({
      color: 0x6e382b,
      roughness: 0.75,
      metalness: 0.08
    });

    // 8. Çatı Şıngılı
    const shingleTex = GTATextureFactory.createShingleTexture();
    shingleTex.repeat.set(4, 4);
    this.matRoof = new THREE.MeshStandardMaterial({
      map: shingleTex,
      roughness: 0.9,
      metalness: 0.05
    });

    // 9. Ryder Evi Gri Ahşap Kaplama
    const ryderTex = GTATextureFactory.createClapboardTexture('#938d82', 'rgba(40,36,30,0.5)');
    ryderTex.repeat.set(4, 2);
    this.matRyderClapboard = new THREE.MeshStandardMaterial({
      map: ryderTex,
      roughness: 0.85,
      metalness: 0.05
    });

    // 10. Sweet Evi Adaçayı Yeşili Ahşap Kaplama
    const sweetTex = GTATextureFactory.createClapboardTexture('#6e847c', 'rgba(30,45,40,0.5)');
    sweetTex.repeat.set(4, 2);
    this.matSweetClapboard = new THREE.MeshStandardMaterial({
      map: sweetTex,
      roughness: 0.85,
      metalness: 0.05
    });

    // 11. Kapı Materyali
    this.matDoor = new THREE.MeshStandardMaterial({
      map: GTATextureFactory.createDoorTexture(),
      roughness: 0.65,
      metalness: 0.1
    });

    // 12. Pencere Camı
    this.matGlass = new THREE.MeshStandardMaterial({
      color: 0x223344,
      roughness: 0.1,
      metalness: 0.9,
      envMapIntensity: 1.5
    });

    // 13. Beyaz Çerçeve / Pervaz
    this.matWhiteTrim = new THREE.MeshStandardMaterial({
      color: 0xf2ede4,
      roughness: 0.7,
      metalness: 0.05
    });

    // 14. Garaj Giriş Yolu (Driveway)
    const drivewayTex = GTATextureFactory.createDrivewayTexture();
    drivewayTex.repeat.set(1, 2);
    this.matDriveway = new THREE.MeshStandardMaterial({
      map: drivewayTex,
      roughness: 0.92,
      polygonOffset: true,
      polygonOffsetFactor: -1,
      polygonOffsetUnits: -1
    });

    // 15. Beton Veranda & Merdiven Taşı
    this.matConcreteStep = new THREE.MeshStandardMaterial({
      color: 0xa8a092,
      roughness: 0.9,
      metalness: 0.05
    });

    // 16. Tuğla Etek / Temel Kuşağı
    this.matBrickBase = new THREE.MeshStandardMaterial({
      color: 0x7a4338,
      roughness: 0.85,
      metalness: 0.05
    });

    // 17. Agave / Yucca Çöl Bitkisi Yaprağı
    this.matAgave = new THREE.MeshStandardMaterial({
      color: 0x4f6b3e,
      roughness: 0.7,
      metalness: 0.05,
      side: THREE.DoubleSide
    });

    // 18. Tel Çit (Chain Link Fence)
    this.matFencePost = new THREE.MeshStandardMaterial({
      color: 0x8a9094,
      roughness: 0.4,
      metalness: 0.7
    });

    // 19. Ahşap Elektrik Direği (Utility Pole)
    this.matWoodPole = new THREE.MeshStandardMaterial({
      color: 0x3e2e22,
      roughness: 0.95,
      metalness: 0.05
    });

    // 20. Siyah Elektrik Teli
    this.matWire = new THREE.MeshBasicMaterial({
      color: 0x181818
    });

    // 21. Metal Çatı TV Anteni
    this.matAntenna = new THREE.MeshStandardMaterial({
      color: 0xa0a0a0,
      roughness: 0.35,
      metalness: 0.85
    });

    // 22. Seramik İzolatör
    this.matInsulator = new THREE.MeshStandardMaterial({
      color: 0x335544,
      roughness: 0.3
    });

    // 23. Silindirik Elektrik Trafosu
    this.matTransformer = new THREE.MeshStandardMaterial({
      color: 0x60656a,
      metalness: 0.7,
      roughness: 0.4
    });

    // 24. Temas Gölgesi (Contact / Ambient Shadow altlığı)
    this.matContactShadow = new THREE.MeshBasicMaterial({
      color: 0x111111,
      transparent: true,
      opacity: 0.36,
      depthWrite: false
    });

    // 25. Kurak / Sararmış Çim Materyali (Ganton Kenar Banliyö için)
    this.matLawnDry = new THREE.MeshStandardMaterial({
      color: 0x8a8449,
      roughness: 0.96,
      metalness: 0.02
    });

    // 26. Posta Kutusu (Mailbox)
    this.matMailbox = new THREE.MeshStandardMaterial({
      color: 0xd2d0ca,
      metalness: 0.4,
      roughness: 0.5
    });

    // 27. Belediye Tekerlekli Çöp Kutusu (Trash Can)
    this.matTrashCan = new THREE.MeshStandardMaterial({
      color: 0x2b382d,
      roughness: 0.7,
      metalness: 0.15
    });

    // 28. Yangın Musluğu (Fire Hydrant)
    this.matFireHydrant = new THREE.MeshStandardMaterial({
      color: 0xbf2619,
      roughness: 0.45,
      metalness: 0.55
    });

    // 29. Çatı AC Ünitesi (Roof AC Compressor)
    this.matRoofAC = new THREE.MeshStandardMaterial({
      color: 0x767d84,
      metalness: 0.65,
      roughness: 0.45
    });

    // 30. Renk Paleti Varyasyonları (Dış Duvarlar)
    this.paletteMaterials = {
      warm_beige: this.matStucco,
      weathered_wood: this.matRyderClapboard,
      mint_faded: this.matSweetClapboard,
      dusty_rose: new THREE.MeshStandardMaterial({
        color: 0xb58e85,
        roughness: 0.88,
        metalness: 0.05
      }),
      slate_blue: new THREE.MeshStandardMaterial({
        color: 0x6b7f8c,
        roughness: 0.86,
        metalness: 0.06
      }),
      sun_terracotta: new THREE.MeshStandardMaterial({
        color: 0xa86953,
        roughness: 0.85,
        metalness: 0.05
      }),
      olive_drab: new THREE.MeshStandardMaterial({
        color: 0x637050,
        roughness: 0.87,
        metalness: 0.05
      })
    };
  }

  getWallMaterial(paletteKey, fallbackMat) {
    if (paletteKey && this.paletteMaterials && this.paletteMaterials[paletteKey]) {
      return this.paletteMaterials[paletteKey];
    }
    return fallbackMat;
  }

  getLawnMaterial(districtId) {
    if (districtId === 'suburban_poor') {
      return this.matLawnDry;
    }
    return this.matLawn;
  }

  /**
   * Posta Kutusu Geometrisi (Tek seferde pişirilmiş ayak + kutu + bayrak)
   */
  getMailboxGeometry() {
    if (this._mailboxGeo) return this._mailboxGeo;
    const post = new THREE.BoxGeometry(0.1, 1.0, 0.1).toNonIndexed();
    post.translate(0, 0.5, 0);

    const box = new THREE.BoxGeometry(0.32, 0.28, 0.54).toNonIndexed();
    box.translate(0, 1.12, 0);

    const flag = new THREE.BoxGeometry(0.02, 0.16, 0.08).toNonIndexed();
    flag.translate(0.17, 1.18, -0.15);

    this._mailboxGeo = BufferGeometryUtils.mergeGeometries([post, box, flag], false);
    return this._mailboxGeo;
  }

  /**
   * Sokak Çöp Kutusu Geometrisi (Tekerlekli belediye konteyneri)
   */
  getTrashCanGeometry() {
    if (this._trashCanGeo) return this._trashCanGeo;
    const body = new THREE.BoxGeometry(0.55, 0.85, 0.5).toNonIndexed();
    body.translate(0, 0.48, 0);

    const lid = new THREE.BoxGeometry(0.6, 0.12, 0.56).toNonIndexed();
    lid.translate(0, 0.94, 0);

    const wheelLeft = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8).toNonIndexed();
    wheelLeft.rotateZ(Math.PI / 2);
    wheelLeft.translate(-0.29, 0.1, -0.18);

    const wheelRight = new THREE.CylinderGeometry(0.08, 0.08, 0.06, 8).toNonIndexed();
    wheelRight.rotateZ(Math.PI / 2);
    wheelRight.translate(0.29, 0.1, -0.18);

    const handle = new THREE.BoxGeometry(0.48, 0.06, 0.06).toNonIndexed();
    handle.translate(0, 0.88, -0.3);

    this._trashCanGeo = BufferGeometryUtils.mergeGeometries([body, lid, wheelLeft, wheelRight, handle], false);
    return this._trashCanGeo;
  }

  /**
   * Yangın Musluğu Geometrisi
   */
  getFireHydrantGeometry() {
    if (this._fireHydrantGeo) return this._fireHydrantGeo;
    const flange = new THREE.CylinderGeometry(0.22, 0.22, 0.08, 10).toNonIndexed();
    flange.translate(0, 0.04, 0);

    const body = new THREE.CylinderGeometry(0.16, 0.18, 0.65, 10).toNonIndexed();
    body.translate(0, 0.4, 0);

    const topCap = new THREE.CylinderGeometry(0.17, 0.17, 0.18, 10).toNonIndexed();
    topCap.translate(0, 0.78, 0);

    const nut = new THREE.CylinderGeometry(0.06, 0.06, 0.08, 6).toNonIndexed();
    nut.translate(0, 0.89, 0);

    const nozzleLeft = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8).toNonIndexed();
    nozzleLeft.rotateZ(Math.PI / 2);
    nozzleLeft.translate(-0.16, 0.52, 0);

    const nozzleRight = new THREE.CylinderGeometry(0.08, 0.08, 0.14, 8).toNonIndexed();
    nozzleRight.rotateZ(Math.PI / 2);
    nozzleRight.translate(0.16, 0.52, 0);

    this._fireHydrantGeo = BufferGeometryUtils.mergeGeometries([flange, body, topCap, nut, nozzleLeft, nozzleRight], false);
    return this._fireHydrantGeo;
  }

  /**
   * Tuğla Baca Geometrisi
   */
  getChimneyGeometry() {
    if (this._chimneyGeo) return this._chimneyGeo;
    const shaft = new THREE.BoxGeometry(0.72, 1.6, 0.72).toNonIndexed();
    shaft.translate(0, 0.8, 0);

    const cap = new THREE.BoxGeometry(0.88, 0.14, 0.88).toNonIndexed();
    cap.translate(0, 1.67, 0);

    const pot = new THREE.CylinderGeometry(0.22, 0.22, 0.24, 8).toNonIndexed();
    pot.translate(0, 1.82, 0);

    this._chimneyGeo = BufferGeometryUtils.mergeGeometries([shaft, cap, pot], false);
    return this._chimneyGeo;
  }

  /**
   * Çatı Klima Ünitesi Geometrisi (Roof AC Compressor)
   */
  getRoofACGeometry() {
    if (this._roofACGeo) return this._roofACGeo;
    const body = new THREE.BoxGeometry(0.85, 0.65, 0.7).toNonIndexed();
    body.translate(0, 0.42, 0);

    const fanGrille = new THREE.CylinderGeometry(0.26, 0.26, 0.06, 12).toNonIndexed();
    fanGrille.translate(0, 0.77, 0);

    const feet1 = new THREE.BoxGeometry(0.85, 0.08, 0.1).toNonIndexed();
    feet1.translate(0, 0.04, 0.25);

    const feet2 = new THREE.BoxGeometry(0.85, 0.08, 0.1).toNonIndexed();
    feet2.translate(0, 0.04, -0.25);

    this._roofACGeo = BufferGeometryUtils.mergeGeometries([body, fanGrille, feet1, feet2], false);
    return this._roofACGeo;
  }

  initGLBTemplates() {
    this.palmTemplate = null;
    this.oakTemplate = null;

    assetManager.loadGLTF('tree_palm').then(({ scene }) => {
      this.palmTemplate = scene;
      this.palmTemplate.scale.set(2.4, 2.8, 2.4);
    }).catch(() => {});

    assetManager.loadGLTF('tree_oak').then(({ scene }) => {
      this.oakTemplate = scene;
      this.oakTemplate.scale.set(2.2, 2.4, 2.2);
    }).catch(() => {});
  }

  /**
   * Çatı TV Anteni Geometrisi (Tek seferde pişirilmiş Yagi Dipole anten)
   */
  getTVAntennaGeometry() {
    if (this._tvAntennaGeo) return this._tvAntennaGeo;
    const mast = new THREE.CylinderGeometry(0.022, 0.025, 2.4, 6).toNonIndexed();
    mast.translate(0, 1.2, 0);

    const geos = [mast];
    const barWidths = [1.3, 1.0, 0.75, 0.5];
    const barHeights = [1.2, 1.55, 1.85, 2.15];

    for (let i = 0; i < barWidths.length; i++) {
      const bar = new THREE.CylinderGeometry(0.012, 0.012, barWidths[i], 6).toNonIndexed();
      bar.rotateZ(Math.PI / 2);
      bar.translate(0, barHeights[i], 0);
      geos.push(bar);
    }

    const strut = new THREE.CylinderGeometry(0.01, 0.01, 0.9, 4).toNonIndexed();
    strut.rotateZ(0.5);
    strut.translate(0.2, 0.45, 0);
    geos.push(strut);

    this._tvAntennaGeo = BufferGeometryUtils.mergeGeometries(geos, false);
    return this._tvAntennaGeo;
  }

  createTVAntenna() {
    const mesh = new THREE.Mesh(this.getTVAntennaGeometry(), this.matAntenna);
    mesh.castShadow = false;
    return mesh;
  }

  /**
   * CJ'in Evi (Carl Johnson House - Grove Street)
   */
  buildCJHouse(plot = {}) {
    const root = new THREE.Group();
    root.name = 'GTA_CJ_House';

    const wallMat = this.getWallMaterial(plot.colorPalette, this.matStucco);
    const lawnMat = this.getLawnMaterial(plot.districtId);
    const mirror = Boolean(plot.mirror && !plot.isIconicCJ);
    const mx = mirror ? -1 : 1;

    // 1. Arsa Zemin Çimi (22m x 22m)
    const lawnGeo = new THREE.PlaneGeometry(22, 22);
    lawnGeo.rotateX(-Math.PI / 2);
    const lawn = new THREE.Mesh(lawnGeo, lawnMat);
    lawn.position.set(0, 0.065, 0);
    lawn.receiveShadow = true;
    root.add(lawn);

    // Temas Gölgesi (Ambient/Contact Shadow zemin tabanı)
    const contactGeo = new THREE.PlaneGeometry(16.5, 13.5);
    contactGeo.rotateX(-Math.PI / 2);
    const contactShadow = new THREE.Mesh(contactGeo, this.matContactShadow);
    contactShadow.position.set(0, 0.068, -1.8);
    root.add(contactShadow);

    // 2. Garaj Önü Araç Yolu (Driveway)
    const drivewayGeo = new THREE.PlaneGeometry(4.8, 10.5);
    drivewayGeo.rotateX(-Math.PI / 2);
    const driveway = new THREE.Mesh(drivewayGeo, this.matDriveway);
    driveway.position.set(-3.8 * mx, 0.072, 5.8);
    driveway.receiveShadow = true;
    root.add(driveway);

    // 3. Ön Kapıdan Kaldırıma Uzanan Yürüme Yolu
    const pathGeo = new THREE.PlaneGeometry(1.6, 9.5);
    pathGeo.rotateX(-Math.PI / 2);
    const walkPath = new THREE.Mesh(pathGeo, this.matConcreteStep);
    walkPath.position.set(2.4 * mx, 0.07, 5.5);
    walkPath.receiveShadow = true;
    root.add(walkPath);

    // 4. Tuğla Temel / Etek Kaidesi
    const baseGeo = new THREE.BoxGeometry(14.2, 0.42, 11.2);
    const houseBase = new THREE.Mesh(baseGeo, this.matBrickBase);
    houseBase.position.set(0, 0.25, -1.8);
    houseBase.castShadow = true;
    houseBase.receiveShadow = true;
    root.add(houseBase);

    // =========================================================================
    // A. SOL KANAT: GARAJ (Width: 4.8m, Height: 3.5m, Depth: 8.5m)
    // =========================================================================
    const garageGroup = new THREE.Group();
    garageGroup.position.set(-3.8 * mx, 0.45, -0.6);

    const garageWallsGeo = new THREE.BoxGeometry(4.8, 3.5, 8.5);
    const garageWalls = new THREE.Mesh(garageWallsGeo, wallMat);
    garageWalls.position.set(0, 1.75, 0);
    garageWalls.castShadow = true;
    garageWalls.receiveShadow = true;
    garageGroup.add(garageWalls);

    // Garaj Ön Panjur Kapısı (Yeşil Oluklu)
    const garageDoorGeo = new THREE.PlaneGeometry(3.6, 2.7);
    const garageDoor = new THREE.Mesh(garageDoorGeo, this.matGarage);
    garageDoor.position.set(0, 1.45, 4.28);
    garageDoor.castShadow = true;
    garageDoor.receiveShadow = true;
    garageGroup.add(garageDoor);

    const frameTopGeo = new THREE.BoxGeometry(3.9, 0.18, 0.12);
    const frameTop = new THREE.Mesh(frameTopGeo, this.matWhiteTrim);
    frameTop.position.set(0, 2.85, 4.31);
    garageGroup.add(frameTop);

    // =========================================================================
    // B. İKONİK BASKETBOL POTASI (GARAJ ÜSTÜNDE)
    // =========================================================================
    const hoopGroup = new THREE.Group();
    hoopGroup.position.set(0, 3.65, 4.3);

    const backboardGeo = new THREE.BoxGeometry(1.6, 1.05, 0.08);
    const backboard = new THREE.Mesh(backboardGeo, this.matBackboard);
    backboard.position.set(0, 0.52, 0);
    backboard.castShadow = false;
    hoopGroup.add(backboard);

    const armGeo = new THREE.BoxGeometry(0.08, 0.08, 0.28);
    const arm = new THREE.Mesh(armGeo, this.matHoop);
    arm.position.set(0, 0.3, 0.18);
    hoopGroup.add(arm);

    const rimGeo = new THREE.TorusGeometry(0.24, 0.024, 10, 20);
    rimGeo.rotateX(Math.PI / 2);
    const rim = new THREE.Mesh(rimGeo, this.matHoop);
    rim.position.set(0, 0.3, 0.44);
    rim.castShadow = false;
    hoopGroup.add(rim);

    const netGeo = new THREE.CylinderGeometry(0.22, 0.12, 0.35, 12, 2, true);
    const netMat = new THREE.MeshStandardMaterial({
      color: 0xeeeeee,
      wireframe: true,
      roughness: 0.9
    });
    const net = new THREE.Mesh(netGeo, netMat);
    net.position.set(0, 0.12, 0.44);
    hoopGroup.add(net);

    garageGroup.add(hoopGroup);
    root.add(garageGroup);

    // =========================================================================
    // C. SAĞ KANAT: ANA GÖVDE & 2 KEMERLİ VERANDA (ARCHED PORCH)
    // =========================================================================
    const mainWing = new THREE.Group();
    mainWing.position.set(3.0 * mx, 0.45, -1.8);

    const livingGeo = new THREE.BoxGeometry(8.2, 3.8, 8.5);
    const livingBody = new THREE.Mesh(livingGeo, wallMat);
    livingBody.position.set(0, 1.9, -1.2);
    livingBody.castShadow = true;
    livingBody.receiveShadow = true;
    mainWing.add(livingBody);

    const porchInnerWallGeo = new THREE.PlaneGeometry(7.6, 3.6);
    const porchInnerWall = new THREE.Mesh(porchInnerWallGeo, wallMat);
    porchInnerWall.position.set(0, 1.8, 2.9);
    porchInnerWall.receiveShadow = true;
    mainWing.add(porchInnerWall);

    const doorGeo = new THREE.PlaneGeometry(1.2, 2.4);
    const door = new THREE.Mesh(doorGeo, this.matDoor);
    door.position.set(-0.6, 1.25, 2.93);
    door.castShadow = true;
    mainWing.add(door);

    const lampGeo = new THREE.CylinderGeometry(0.08, 0.08, 0.22, 8);
    const lampMat = new THREE.MeshStandardMaterial({ color: 0x222222, metalness: 0.8 });
    const lamp = new THREE.Mesh(lampGeo, lampMat);
    lamp.position.set(0.3, 1.85, 2.98);
    mainWing.add(lamp);

    const porchLight = new THREE.PointLight(0xffdf99, 0.8, 6, 1.5);
    porchLight.position.set(0.3, 1.85, 3.2);
    mainWing.add(porchLight);

    const winGeo = new THREE.PlaneGeometry(1.5, 1.3);
    const win = new THREE.Mesh(winGeo, this.matGlass);
    win.position.set(2.2, 1.6, 2.93);
    mainWing.add(win);

    const winTrimGeo = new THREE.BoxGeometry(1.6, 1.4, 0.05);
    const winTrim = new THREE.Mesh(winTrimGeo, this.matWhiteTrim);
    winTrim.position.set(2.2, 1.6, 2.91);
    mainWing.add(winTrim);

    const deckGeo = new THREE.BoxGeometry(7.8, 0.28, 2.8);
    const deck = new THREE.Mesh(deckGeo, this.matConcreteStep);
    deck.position.set(0, 0.14, 4.1);
    deck.receiveShadow = true;
    mainWing.add(deck);

    const step1 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.6), this.matConcreteStep);
    step1.position.set(-0.6, -0.06, 5.7);
    step1.receiveShadow = true;
    mainWing.add(step1);

    const step2 = new THREE.Mesh(new THREE.BoxGeometry(2.4, 0.16, 0.6), this.matConcreteStep);
    step2.position.set(-0.6, -0.22, 6.2);
    step2.receiveShadow = true;
    mainWing.add(step2);

    // 2 KEMERLİ ÖN CEPHE (YUKARI KAVİSLİ KEMERLER)
    const archShape = new THREE.Shape();
    archShape.moveTo(-3.9, 0);
    archShape.lineTo(3.9, 0);
    archShape.lineTo(3.9, 3.5);
    archShape.lineTo(-3.9, 3.5);
    archShape.closePath();

    const hole1 = new THREE.Path();
    const r1 = 1.35;
    const cx1 = -1.75;
    hole1.moveTo(cx1 - r1, 0);
    hole1.lineTo(cx1 - r1, 1.55);
    hole1.absarc(cx1, 1.55, r1, Math.PI, 0, true);
    hole1.lineTo(cx1 + r1, 0);
    hole1.closePath();
    archShape.holes.push(hole1);

    const hole2 = new THREE.Path();
    const r2 = 1.35;
    const cx2 = 1.75;
    hole2.moveTo(cx2 - r2, 0);
    hole2.lineTo(cx2 - r2, 1.55);
    hole2.absarc(cx2, 1.55, r2, Math.PI, 0, true);
    hole2.lineTo(cx2 + r2, 0);
    hole2.closePath();
    archShape.holes.push(hole2);

    const archGeo = new THREE.ExtrudeGeometry(archShape, {
      depth: 0.32,
      bevelEnabled: true,
      bevelSegments: 2,
      steps: 1,
      bevelSize: 0.03,
      bevelThickness: 0.03
    });
    const archMesh = new THREE.Mesh(archGeo, this.matArchStucco);
    archMesh.position.set(0, 0, 5.3);
    archMesh.castShadow = true;
    archMesh.receiveShadow = true;
    mainWing.add(archMesh);

    root.add(mainWing);

    // =========================================================================
    // D. ÇATI SİSTEMİ, BACA, AC VE TV ANTENİ
    // =========================================================================
    const fasciaGeo = new THREE.BoxGeometry(15.8, 0.22, 11.8);
    const fascia = new THREE.Mesh(fasciaGeo, this.matFasciaTrim);
    fascia.position.set(-0.4 * mx, 4.05, -0.6);
    fascia.castShadow = true;
    root.add(fascia);

    const flatRoofGeo = new THREE.BoxGeometry(15.2, 0.1, 11.2);
    const flatRoof = new THREE.Mesh(flatRoofGeo, this.matRoof);
    flatRoof.position.set(-0.4 * mx, 4.18, -0.6);
    root.add(flatRoof);

    const upperAtticGeo = new THREE.BoxGeometry(7.8, 1.4, 6.2);
    const upperAttic = new THREE.Mesh(upperAtticGeo, wallMat);
    upperAttic.position.set(0.6 * mx, 4.85, -1.8);
    upperAttic.castShadow = true;
    root.add(upperAttic);

    const upperRoofGeo = new THREE.ConeGeometry(5.8, 1.2, 4);
    upperRoofGeo.rotateY(Math.PI / 4);
    const upperRoof = new THREE.Mesh(upperRoofGeo, this.matRoof);
    upperRoof.position.set(0.6 * mx, 6.0, -1.8);
    upperRoof.scale.set(1.4, 1.0, 1.15);
    upperRoof.castShadow = true;
    root.add(upperRoof);

    // Çatı Donatı Varyantı: AC & Baca veya TV Anteni
    if (plot.propSet === 'ac_unit_chimney') {
      const chimney = new THREE.Mesh(this.getChimneyGeometry(), this.matBrickBase);
      chimney.position.set(3.2 * mx, 4.25, -2.8);
      chimney.castShadow = true;
      root.add(chimney);

      const acUnit = new THREE.Mesh(this.getRoofACGeometry(), this.matRoofAC);
      acUnit.position.set(-4.5 * mx, 4.25, -2.5);
      acUnit.castShadow = true;
      root.add(acUnit);
    } else {
      const tvAntenna = this.createTVAntenna();
      tvAntenna.position.set(-6.5 * mx, 4.25, -2.5);
      root.add(tvAntenna);
    }

    // =========================================================================
    // E. ARKA BAHÇE PALMİYESİ & GÖLGE AĞAÇLARI
    // =========================================================================
    const palm = this.treeBuilder.createPalm(2.4);
    palm.position.set(5.5 * mx, 0.08, -8.5);
    root.add(palm);

    const oak = this.treeBuilder.createMaple(1.8);
    oak.position.set(-6.5 * mx, 0.08, -8.0);
    root.add(oak);

    // Bahçe Agave Çalıları
    const plant1 = this.createAgavePlant();
    plant1.position.set(0.8 * mx, 0.08, 6.4);
    root.add(plant1);

    const plant2 = this.createAgavePlant();
    plant2.position.set(-1.6 * mx, 0.08, 6.2);
    plant2.scale.set(0.85, 0.85, 0.85);
    root.add(plant2);

    const plant3 = this.createAgavePlant();
    plant3.position.set(8.6 * mx, 0.08, 4.5);
    plant3.scale.set(1.15, 1.15, 1.15);
    root.add(plant3);

    // Yan Çitler
    const fenceLeft = this.createChainLinkFence(18);
    fenceLeft.position.set(-9.8, 0, -1.0);
    fenceLeft.rotation.y = Math.PI / 2;
    root.add(fenceLeft);

    const fenceRight = this.createChainLinkFence(18);
    fenceRight.position.set(9.8, 0, -1.0);
    fenceRight.rotation.y = Math.PI / 2;
    root.add(fenceRight);

    return root;
  }

  /**
   * Ryder Evi (Ahşap Kaplama, Sundurmalı, Çatı Varyasyonlu)
   */
  buildRyderHouse(plot = {}) {
    const root = new THREE.Group();
    root.name = 'GTA_Ryder_House';

    const wallMat = this.getWallMaterial(plot.colorPalette, this.matRyderClapboard);
    const lawnMat = this.getLawnMaterial(plot.districtId);
    const mirror = Boolean(plot.mirror && !plot.isIconicRyder);
    const mx = mirror ? -1 : 1;

    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), lawnMat);
    lawn.position.set(0, 0.065, 0);
    lawn.receiveShadow = true;
    root.add(lawn);

    // Temas Gölgesi
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(13.5, 12.5).rotateX(-Math.PI / 2), this.matContactShadow);
    contactShadow.position.set(0, 0.068, -1.0);
    root.add(contactShadow);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 9.0).rotateX(-Math.PI / 2), this.matConcreteStep);
    path.position.set(-1.0 * mx, 0.07, 5.5);
    path.receiveShadow = true;
    root.add(path);

    const base = new THREE.Mesh(new THREE.BoxGeometry(11.6, 0.45, 10.4), this.matBrickBase);
    base.position.set(0, 0.25, -1.0);
    base.castShadow = true;
    root.add(base);

    const body = new THREE.Mesh(new THREE.BoxGeometry(11.2, 3.4, 9.8), wallMat);
    body.position.set(0, 2.15, -1.0);
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    const porchFloor = new THREE.Mesh(new THREE.BoxGeometry(6.4, 0.25, 2.5), this.matConcreteStep);
    porchFloor.position.set(-1.0 * mx, 0.35, 4.4);
    porchFloor.receiveShadow = true;
    root.add(porchFloor);

    for (let x of [-3.8, -1.0, 1.8]) {
      const col = new THREE.Mesh(new THREE.BoxGeometry(0.18, 2.8, 0.18), this.matWhiteTrim);
      col.position.set(x * mx, 1.75, 5.4);
      col.castShadow = true;
      root.add(col);
    }

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(6.8, 0.2, 2.8), this.matRoof);
    porchRoof.position.set(-1.0 * mx, 3.2, 4.5);
    porchRoof.rotation.x = 0.1;
    porchRoof.castShadow = true;
    root.add(porchRoof);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), this.matDoor);
    door.position.set(-1.0 * mx, 1.6, 3.92);
    root.add(door);

    const winLeft = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), this.matGlass);
    winLeft.position.set(-3.2 * mx, 2.0, 3.92);
    root.add(winLeft);

    const winRight = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 1.3), this.matGlass);
    winRight.position.set(2.8 * mx, 2.0, 3.92);
    root.add(winRight);

    const roofPrism = new THREE.ConeGeometry(8.2, 2.4, 4);
    roofPrism.rotateY(Math.PI / 4);
    roofPrism.scale(1.4, 1.0, 1.3);
    const roof = new THREE.Mesh(roofPrism, this.matRoof);
    roof.position.set(0, 4.9, -1.0);
    roof.castShadow = true;
    root.add(roof);

    // Çatı Donatısı
    if (plot.propSet === 'ac_unit_chimney') {
      const chimney = new THREE.Mesh(this.getChimneyGeometry(), this.matBrickBase);
      chimney.position.set(3.4 * mx, 4.8, -1.2);
      chimney.castShadow = true;
      root.add(chimney);

      const acUnit = new THREE.Mesh(this.getRoofACGeometry(), this.matRoofAC);
      acUnit.position.set(-3.6 * mx, 4.8, 0.6);
      acUnit.castShadow = true;
      root.add(acUnit);
    } else {
      const tvAntenna = this.createTVAntenna();
      tvAntenna.position.set(-4.5 * mx, 4.8, 1.0);
      root.add(tvAntenna);
    }

    // Arka Bahçe Palmiyesi
    const palm = this.treeBuilder.createPalm(2.2);
    palm.position.set(-4.8 * mx, 0.08, -8.0);
    root.add(palm);

    const fenceLeft = this.createChainLinkFence(18);
    fenceLeft.position.set(-9.6, 0, -1.0);
    fenceLeft.rotation.y = Math.PI / 2;
    root.add(fenceLeft);

    return root;
  }

  /**
   * Sweet Evi (Ahşap Kaplama, Kalkan Çatılı, Palmiyeli)
   */
  buildSweetHouse(plot = {}) {
    const root = new THREE.Group();
    root.name = 'GTA_Sweet_House';

    const wallMat = this.getWallMaterial(plot.colorPalette, this.matSweetClapboard);
    const lawnMat = this.getLawnMaterial(plot.districtId);
    const mirror = Boolean(plot.mirror && !plot.isIconicSweet);
    const mx = mirror ? -1 : 1;

    const lawn = new THREE.Mesh(new THREE.PlaneGeometry(22, 22).rotateX(-Math.PI / 2), lawnMat);
    lawn.position.set(0, 0.065, 0);
    lawn.receiveShadow = true;
    root.add(lawn);

    // Temas Gölgesi
    const contactShadow = new THREE.Mesh(new THREE.PlaneGeometry(13.8, 12.5).rotateX(-Math.PI / 2), this.matContactShadow);
    contactShadow.position.set(0, 0.068, -1.0);
    root.add(contactShadow);

    const path = new THREE.Mesh(new THREE.PlaneGeometry(2.0, 9.0).rotateX(-Math.PI / 2), this.matConcreteStep);
    path.position.set(1.5 * mx, 0.07, 5.5);
    path.receiveShadow = true;
    root.add(path);

    const base = new THREE.Mesh(new THREE.BoxGeometry(11.8, 0.45, 10.6), this.matBrickBase);
    base.position.set(0, 0.25, -1.0);
    base.castShadow = true;
    root.add(base);

    const body = new THREE.Mesh(new THREE.BoxGeometry(11.4, 3.4, 10.0), wallMat);
    body.position.set(0, 2.15, -1.0);
    body.castShadow = true;
    body.receiveShadow = true;
    root.add(body);

    const porch = new THREE.Mesh(new THREE.BoxGeometry(5.2, 0.25, 2.4), this.matConcreteStep);
    porch.position.set(1.5 * mx, 0.35, 4.4);
    porch.receiveShadow = true;
    root.add(porch);

    const porchRoof = new THREE.Mesh(new THREE.BoxGeometry(5.6, 0.2, 2.6), this.matRoof);
    porchRoof.position.set(1.5 * mx, 3.2, 4.4);
    porchRoof.castShadow = true;
    root.add(porchRoof);

    const door = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 2.3), this.matDoor);
    door.position.set(1.5 * mx, 1.6, 4.02);
    root.add(door);

    const win = new THREE.Mesh(new THREE.PlaneGeometry(2.2, 1.3), this.matGlass);
    win.position.set(-2.8 * mx, 2.0, 4.02);
    root.add(win);

    const roofPrism = new THREE.ConeGeometry(8.4, 2.5, 4);
    roofPrism.rotateY(Math.PI / 4);
    roofPrism.scale(1.4, 1.0, 1.3);
    const roof = new THREE.Mesh(roofPrism, this.matRoof);
    roof.position.set(0, 4.95, -1.0);
    roof.castShadow = true;
    root.add(roof);

    // Çatı Donatısı
    if (plot.propSet === 'ac_unit_chimney') {
      const chimney = new THREE.Mesh(this.getChimneyGeometry(), this.matBrickBase);
      chimney.position.set(-3.2 * mx, 4.9, -1.2);
      chimney.castShadow = true;
      root.add(chimney);

      const acUnit = new THREE.Mesh(this.getRoofACGeometry(), this.matRoofAC);
      acUnit.position.set(2.8 * mx, 4.9, 0.6);
      acUnit.castShadow = true;
      root.add(acUnit);
    } else {
      const tvAntenna = this.createTVAntenna();
      tvAntenna.position.set(3.5 * mx, 5.0, 0.5);
      root.add(tvAntenna);
    }

    // Arka Bahçe California Palmiyesi
    const palm = this.treeBuilder.createPalm(2.6);
    palm.position.set(6.0 * mx, 0.08, -8.0);
    root.add(palm);

    const fenceRight = this.createChainLinkFence(18);
    fenceRight.position.set(9.6, 0, -1.0);
    fenceRight.rotation.y = Math.PI / 2;
    root.add(fenceRight);

    return root;
  }

  /**
   * Çöl Sukulent / Agave Çalısı
   */
  createAgavePlant() {
    const plant = new THREE.Group();
    const leafCount = 12;
    for (let i = 0; i < leafCount; i++) {
      const angle = (i / leafCount) * Math.PI * 2;
      const leafGeo = new THREE.ConeGeometry(0.12, 0.95, 3);
      leafGeo.rotateX(0.55);
      const leaf = new THREE.Mesh(leafGeo, this.matAgave);
      leaf.rotation.y = angle;
      leaf.position.y = 0.35;
      leaf.scale.set(1.0, 1.0 + (i % 3) * 0.2, 0.4);
      leaf.castShadow = false;
      plant.add(leaf);
    }
    return plant;
  }

  /**
   * Tel Çit (Chain-link Fence)
   */
  createChainLinkFence(length) {
    const fence = new THREE.Group();
    const postSpacing = 3.0;
    const postCount = Math.floor(length / postSpacing) + 1;

    const topRailGeo = new THREE.CylinderGeometry(0.03, 0.03, length);
    topRailGeo.rotateZ(Math.PI / 2);
    const topRail = new THREE.Mesh(topRailGeo, this.matFencePost);
    topRail.position.set(0, 1.15, 0);
    fence.add(topRail);

    const startX = -length / 2;
    for (let i = 0; i < postCount; i++) {
      const x = startX + i * postSpacing;
      const postGeo = new THREE.CylinderGeometry(0.04, 0.04, 1.25);
      const post = new THREE.Mesh(postGeo, this.matFencePost);
      post.position.set(x, 0.62, 0);
      post.castShadow = false;
      fence.add(post);
    }

    const meshGeo = new THREE.PlaneGeometry(length, 1.05);
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0x999999,
      wireframe: true,
      roughness: 0.5,
      metalness: 0.8
    });
    const wirePanel = new THREE.Mesh(meshGeo, wireMat);
    wirePanel.position.set(0, 0.62, 0);
    fence.add(wirePanel);

    return fence;
  }

  /**
   * Sokak Ahşap Elektrik/Telefon Direği Geometrileri (InstancedMesh için)
   */
  getUtilityPoleWoodGeometry() {
    if (this._poleWoodGeo) return this._poleWoodGeo;
    const mast = new THREE.CylinderGeometry(0.18, 0.24, 9.5, 10).toNonIndexed();
    mast.translate(0, 4.75, 0);
    const arm = new THREE.BoxGeometry(2.6, 0.14, 0.14).toNonIndexed();
    arm.translate(0, 8.6, 0);
    this._poleWoodGeo = BufferGeometryUtils.mergeGeometries([mast, arm], false);
    return this._poleWoodGeo;
  }

  getUtilityPoleInsulatorsGeometry() {
    if (this._poleInsulatorsGeo) return this._poleInsulatorsGeo;
    const geos = [-1.05, -0.4, 0.4, 1.05].map(x => {
      const g = new THREE.CylinderGeometry(0.04, 0.05, 0.2, 8).toNonIndexed();
      g.translate(x, 8.75, 0);
      return g;
    });
    this._poleInsulatorsGeo = BufferGeometryUtils.mergeGeometries(geos, false);
    return this._poleInsulatorsGeo;
  }

  getUtilityPoleTransformerGeometry() {
    if (this._poleTransformerGeo) return this._poleTransformerGeo;
    const g = new THREE.CylinderGeometry(0.28, 0.28, 0.9, 12).toNonIndexed();
    g.translate(0.35, 7.6, 0.2);
    this._poleTransformerGeo = g;
    return this._poleTransformerGeo;
  }

  createUtilityPole() {
    const poleGroup = new THREE.Group();
    poleGroup.name = 'UtilityPole';
    const wood = new THREE.Mesh(this.getUtilityPoleWoodGeometry(), this.matWoodPole);
    wood.castShadow = true;
    poleGroup.add(wood);
    const ins = new THREE.Mesh(this.getUtilityPoleInsulatorsGeometry(), this.matInsulator);
    poleGroup.add(ins);
    const trans = new THREE.Mesh(this.getUtilityPoleTransformerGeometry(), this.matTransformer);
    trans.castShadow = false;
    poleGroup.add(trans);
    return poleGroup;
  }

  /**
   * İki direk arasına sarkan elektrik telleri oluşturur
   */
  createSaggingWireGeometry(p1, p2, sag = 0.4) {
    const mid = new THREE.Vector3().addVectors(p1, p2).multiplyScalar(0.5);
    mid.y -= sag;
    const curve = new THREE.QuadraticBezierCurve3(p1, mid, p2);
    const geom = new THREE.TubeGeometry(curve, 16, 0.026, 6, false);
    return geom.toNonIndexed();
  }

  createSaggingWire(p1, p2, sag = 0.4) {
    const geom = this.createSaggingWireGeometry(p1, p2, sag);
    return new THREE.Mesh(geom, this.matWire);
  }

  /**
   * Parselin mahalle blok kodunu döndürür (Frustum Culling optimizasyonu)
   */
  getBlockIdForPlot(plot, index) {
    if (plot.id) {
      if (plot.id.startsWith('C-NW')) return 'Block_Center_NW';
      if (plot.id.startsWith('C-NE')) return 'Block_Center_NE';
      if (plot.id.startsWith('C-SW')) return 'Block_Center_SW';
      if (plot.id.startsWith('C-SE')) return 'Block_Center_SE';
      if (plot.id.startsWith('W-V')) return 'Block_West_Villas';
      if (plot.id.startsWith('E-V')) return 'Block_East_Villas';
      if (plot.id.startsWith('N-V')) return 'Block_North_Villas';
      if (plot.id.startsWith('S-V')) return 'Block_South_Villas';
      if (plot.id.startsWith('CUL-W')) return 'Block_CulDeSac_West';
      if (plot.id.startsWith('CUL-E')) return 'Block_CulDeSac_East';
    }
    return `Block_Group_${Math.floor(index / 4)}`;
  }

  /**
   * Parselin yola bakan en uygun rotasyon açısını hesaplar
   */
  calculateFacingRotation(plot) {
    const px = plot.x;
    const pz = plot.z;

    if (plot.id?.startsWith('CUL-W')) return Math.PI / 2;
    if (plot.id?.startsWith('CUL-E')) return -Math.PI / 2;

    if (plot.id?.startsWith('N-V')) return 0;
    if (plot.id?.startsWith('S-V')) return Math.PI;
    if (plot.id?.startsWith('W-V')) return Math.PI / 2;
    if (plot.id?.startsWith('E-V')) return -Math.PI / 2;

    if (Math.abs(px) === 20) {
      return px < 0 ? Math.PI / 2 : -Math.PI / 2;
    }
    if (Math.abs(pz) === 20) {
      return pz < 0 ? 0 : Math.PI;
    }

    if (px < 0) return -Math.PI / 2;
    return Math.PI / 2;
  }

  /**
   * Tüm boş parsellere GTA San Andreas konutlarını mahalle blokları bazında
   * geometrileri birleştirerek ve donatıları instancelayarak yerleştirir.
   */
  buildAllPlots(parentGroup) {
    const gtaHousesGroup = new THREE.Group();
    gtaHousesGroup.name = 'GTA_Grove_Street_Houses';
    parentGroup.add(gtaHousesGroup);

    const houseList = [];
    const poleTransforms = [];
    const polePositions = [];
    const mailboxTransforms = [];
    const trashTransforms = [];
    const hydrantTransforms = [];
    const palmTransforms = [];

    // 1. Parselleri mahalle bloklarına ayır
    const blockMap = new Map();
    PARCEL_PLOTS.forEach((plot, index) => {
      const blockId = this.getBlockIdForPlot(plot, index);
      if (!blockMap.has(blockId)) {
        blockMap.set(blockId, []);
      }
      blockMap.get(blockId).push({ plot, index });
    });

    // 2. Her bloğun evlerini inşa et ve aynı materyali paylaşan geometrileri birleştir
    blockMap.forEach((plotEntries, blockId) => {
      const blockGroup = new THREE.Group();
      blockGroup.name = blockId;
      gtaHousesGroup.add(blockGroup);

      const materialBuckets = new Map();

      plotEntries.forEach(({ plot, index }) => {
        let house;
        let houseType = plot.houseStyle || 'cj_style';

        if (plot.isIconicCJ || houseType === 'cj_style') {
          house = this.buildCJHouse(plot);
          houseType = 'cj';
        } else if (plot.isIconicRyder || houseType === 'ryder_style') {
          house = this.buildRyderHouse(plot);
          houseType = 'ryder';
        } else {
          house = this.buildSweetHouse(plot);
          houseType = 'sweet';
        }

        const rotY = this.calculateFacingRotation(plot);
        house.rotation.y = rotY;
        house.position.set(plot.x, 0, plot.z);
        house.updateMatrixWorld(true);

        const houseId = `gta_${houseType}_${plot.id || index}`;
        houseList.push({
          id: houseId,
          object: blockGroup,
          plot,
          lodCategory: plot.lodCategory || 'lod_building_mid'
        });

        // Parsel önü kaldırım kenarına elektrik direği koordinatı topla (her 2 parsele 1)
        if (index % 2 === 0) {
          const poleOffset = new THREE.Vector3(8.5, 0, 10.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          const polePos = new THREE.Vector3(plot.x + poleOffset.x, 0, plot.z + poleOffset.z);
          poleTransforms.push({ pos: polePos, rotY });
          polePositions.push(new THREE.Vector3(polePos.x, 8.7, polePos.z));
        }

        // Posta Kutusu Koordinatları (mailbox_garden veya suburban_mid)
        if (plot.propSet === 'mailbox_garden' || plot.districtId === 'suburban_mid') {
          const mbOffset = new THREE.Vector3(4.2, 0, 9.8).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          mailboxTransforms.push({
            pos: new THREE.Vector3(plot.x + mbOffset.x, 0, plot.z + mbOffset.z),
            rotY
          });
        }

        // Çöp Kutuları Koordinatları (fenced_trash veya suburban_poor)
        if (plot.propSet === 'fenced_trash' || plot.districtId === 'suburban_poor') {
          const tbOffset1 = new THREE.Vector3(-7.4, 0, 8.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          trashTransforms.push({
            pos: new THREE.Vector3(plot.x + tbOffset1.x, 0, plot.z + tbOffset1.z),
            rotY: rotY + 0.15
          });
          const tbOffset2 = new THREE.Vector3(-6.6, 0, 8.5).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          trashTransforms.push({
            pos: new THREE.Vector3(plot.x + tbOffset2.x, 0, plot.z + tbOffset2.z),
            rotY: rotY - 0.2
          });
        }

        // Yangın Musluğu (Her 4 parsele 1 yol kenarına)
        if (index % 4 === 1) {
          const fhOffset = new THREE.Vector3(-9.2, 0, 11.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
          hydrantTransforms.push({
            pos: new THREE.Vector3(plot.x + fhOffset.x, 0, plot.z + fhOffset.z),
            rotY
          });
        }

        // Arka/Yan Bahçe Palmiyesi Koordinatları (InstancedMesh - 2 Draw Call)
        const palmOffset = new THREE.Vector3(-6.8, 0, -7.2).applyAxisAngle(new THREE.Vector3(0, 1, 0), rotY);
        palmTransforms.push({
          pos: new THREE.Vector3(plot.x + palmOffset.x, 0, plot.z + palmOffset.z),
          scale: 0.85 + (index % 4) * 0.1,
          rotY: (index * 1.5) % (Math.PI * 2)
        });

        // Evin tüm alt mesh'lerini materyallerine göre grupla
        house.traverse(child => {
          if (child.isMesh && child.geometry && child.material) {
            const mats = Array.isArray(child.material) ? child.material : [child.material];
            const primaryMat = mats[0];
            if (!primaryMat) return;

            let geom = child.geometry.clone();
            if (geom.index) geom = geom.toNonIndexed();
            if (!geom.attributes.normal) geom.computeVertexNormals();
            if (!geom.attributes.uv && geom.attributes.position) {
              geom.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(geom.attributes.position.count * 2), 2));
            }
            geom.applyMatrix4(child.matrixWorld);

            if (!materialBuckets.has(primaryMat)) {
              materialBuckets.set(primaryMat, []);
            }
            materialBuckets.get(primaryMat).push(geom);
          }
        });
      });

      // Bu bloktaki her materyal grubu için tek bir Mesh oluştur
      materialBuckets.forEach((geos, mat) => {
        if (geos && geos.length > 0) {
          const merged = BufferGeometryUtils.mergeGeometries(geos, false);
          if (merged) {
            const mesh = new THREE.Mesh(merged, mat);
            mesh.castShadow = true;
            mesh.receiveShadow = true;
            blockGroup.add(mesh);
          }
        }
      });
    });

    const dummy = new THREE.Object3D();

    // 3. Elektrik Direklerini InstancedMesh olarak tek seferde çiz
    if (poleTransforms.length > 0) {
      const woodGeo = this.getUtilityPoleWoodGeometry();
      const insGeo = this.getUtilityPoleInsulatorsGeometry();
      const transGeo = this.getUtilityPoleTransformerGeometry();

      const instancedWood = new THREE.InstancedMesh(woodGeo, this.matWoodPole, poleTransforms.length);
      const instancedIns = new THREE.InstancedMesh(insGeo, this.matInsulator, poleTransforms.length);
      const instancedTrans = new THREE.InstancedMesh(transGeo, this.matTransformer, poleTransforms.length);

      poleTransforms.forEach((pt, i) => {
        dummy.position.copy(pt.pos);
        dummy.rotation.set(0, pt.rotY, 0);
        dummy.updateMatrix();
        instancedWood.setMatrixAt(i, dummy.matrix);
        instancedIns.setMatrixAt(i, dummy.matrix);
        instancedTrans.setMatrixAt(i, dummy.matrix);
      });

      instancedWood.instanceMatrix.needsUpdate = true;
      instancedIns.instanceMatrix.needsUpdate = true;
      instancedTrans.instanceMatrix.needsUpdate = true;

      instancedWood.castShadow = true;
      instancedWood.receiveShadow = true;
      instancedTrans.castShadow = false;

      gtaHousesGroup.add(instancedWood);
      gtaHousesGroup.add(instancedIns);
      gtaHousesGroup.add(instancedTrans);
    }

    // 4. Posta Kutularını InstancedMesh Olarak Çiz
    if (mailboxTransforms.length > 0) {
      const mbGeo = this.getMailboxGeometry();
      const instancedMB = new THREE.InstancedMesh(mbGeo, this.matMailbox, mailboxTransforms.length);
      mailboxTransforms.forEach((pt, i) => {
        dummy.position.copy(pt.pos);
        dummy.rotation.set(0, pt.rotY, 0);
        dummy.updateMatrix();
        instancedMB.setMatrixAt(i, dummy.matrix);
      });
      instancedMB.instanceMatrix.needsUpdate = true;
      instancedMB.castShadow = true;
      instancedMB.receiveShadow = true;
      gtaHousesGroup.add(instancedMB);
    }

    // 5. Çöp Kutularını InstancedMesh Olarak Çiz
    if (trashTransforms.length > 0) {
      const tcGeo = this.getTrashCanGeometry();
      const instancedTC = new THREE.InstancedMesh(tcGeo, this.matTrashCan, trashTransforms.length);
      trashTransforms.forEach((pt, i) => {
        dummy.position.copy(pt.pos);
        dummy.rotation.set(0, pt.rotY, 0);
        dummy.updateMatrix();
        instancedTC.setMatrixAt(i, dummy.matrix);
      });
      instancedTC.instanceMatrix.needsUpdate = true;
      instancedTC.castShadow = true;
      instancedTC.receiveShadow = true;
      gtaHousesGroup.add(instancedTC);
    }

    // 6. Yangın Musluklarını InstancedMesh Olarak Çiz
    if (hydrantTransforms.length > 0) {
      const fhGeo = this.getFireHydrantGeometry();
      const instancedFH = new THREE.InstancedMesh(fhGeo, this.matFireHydrant, hydrantTransforms.length);
      hydrantTransforms.forEach((pt, i) => {
        dummy.position.copy(pt.pos);
        dummy.rotation.set(0, pt.rotY, 0);
        dummy.updateMatrix();
        instancedFH.setMatrixAt(i, dummy.matrix);
      });
      instancedFH.instanceMatrix.needsUpdate = true;
      instancedFH.castShadow = true;
      instancedFH.receiveShadow = true;
      gtaHousesGroup.add(instancedFH);
    }

    // 7. Elektrik Direkleri Arasındaki Telleri Birleşik Mesh Olarak Çiz
    const wireGeos = [];
    for (let i = 0; i < polePositions.length - 1; i += 2) {
      const p1 = polePositions[i];
      const p2 = polePositions[i + 1];
      if (p1.distanceTo(p2) < 45) {
        wireGeos.push(this.createSaggingWireGeometry(p1, p2, 0.45));
        wireGeos.push(this.createSaggingWireGeometry(
          new THREE.Vector3(p1.x, p1.y - 0.3, p1.z + 0.3),
          new THREE.Vector3(p2.x, p2.y - 0.3, p2.z + 0.3),
          0.55
        ));
      }
    }
    if (wireGeos.length > 0) {
      const mergedWires = BufferGeometryUtils.mergeGeometries(wireGeos, false);
      if (mergedWires) {
        const wireMesh = new THREE.Mesh(mergedWires, this.matWire);
        gtaHousesGroup.add(wireMesh);
      }
    }

    // 8. Bahçe Palmiyelerini InstancedMesh Olarak Çiz (Tek seferde tüm şehre 2 Draw Call)
    if (palmTransforms.length > 0 && this.treeBuilder) {
      const instancedPalms = this.treeBuilder.buildInstancedPalms(palmTransforms);
      gtaHousesGroup.add(instancedPalms);
    }

    console.log(`[GTAHouseBuilder] ${houseList.length} adet GTA San Andreas evi mahalle blokları ve Instanced donatılarla (Mailbox:${mailboxTransforms.length}, Trash:${trashTransforms.length}, Hydrant:${hydrantTransforms.length}, Palms:${palmTransforms.length}) başarıyla optimize edildi.`);
    return houseList;
  }
}

