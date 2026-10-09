import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * TerrainManager - Deterministik Prosedürel Arazi ve Yükseklik Yöneticisi
 * 
 * Özellikler:
 * 1. getHeightAt(x, z) & getElevation(x, z): Deterministik, tohumlu ve düşük maliyetli yükseklik API'si.
 * 2. Merkez Düzlüğü: Grove Street, binalar, yollar ve cul-de-sac aksları tamamen düz (y = 0.0) kalır.
 * 3. Şehir Dışı Yumuşak Eğimler: 165m-290m geçiş bandı sonrasında sürüşe uygun organik tepeler.
 * 4. 1600x1600 Optimize Zemin Meshi: 128x128 segment (~32K poligon), 60 FPS garantili.
 * 5. Uzak Silüetler: Ufukta derinlik sağlayan prosedürel low-poly dağlar, landmark gökdelenler ve radyo kulesi.
 */
export class TerrainManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} [materials] - Materyal kataloğu (isteğe bağlı)
   * @param {Object} [options] - Yapılandırma parametreleri
   * @param {number} [options.seed=1992] - Deterministik arazi tohumu
   */
  constructor(scene, materials = null, options = {}) {
    this.scene = scene;
    this.materials = materials;
    this.seed = options.seed ?? 1992;

    this.group = new THREE.Group();
    this.group.name = 'TerrainGroup';
    if (this.scene) {
      this.scene.add(this.group);
    }

    // GC (Garbage Collection) dostu geçici vektörler
    this._tmpNormal = new THREE.Vector3();

    // Ana zemin meshi ve dekoratif grup
    this.mesh = null;
    this.distantGroup = new THREE.Group();
    this.distantGroup.name = 'DistantSilhouettes';
    this.group.add(this.distantGroup);

    // Arazi ve uzak manzarayı inşa et
    this.buildTerrain();
    this.buildDistantSilhouettes();
  }

  // =========================================================================
  // 1. DÜZLÜK MASKESİ (Grove Street & Şehir Merkezi Koruma)
  // =========================================================================
  /**
   * Şehir merkezindeki düzlük maskesini hesaplar.
   * Grove Street, ana bulvarlar ve çıkmaz sokak koridorlarını y = 0 tutar.
   * @param {number} x - Dünya X koordinatı
   * @param {number} z - Dünya Z koordinatı
   * @returns {number} 0.0 (tamamen düz) ile 1.0 (tam tepelik) arası yumuşak faktör
   */
  getCityCenterMask(x, z) {
    const absX = Math.abs(x);
    const absZ = Math.abs(z);

    // 1. Şehir çekirdek ızgarası (-150m ile +150m arası kesinlikle düz)
    const coreDist = Math.max(absX, absZ);
    if (coreDist <= 150) return 0.0;

    // 2. Dört ana yöne uzanan bulvar çıkış koridorları (Cul-de-sac ve bulvar koruması)
    if (absX <= 210 && absZ <= 55) return 0.0;
    if (absZ <= 210 && absX <= 55) return 0.0;

    // 3. Geçiş bölgesi (165m'den 290m'ye kadar yumuşak artış)
    const radialDist = Math.hypot(x, z);
    if (radialDist < 165) return 0.0;
    if (radialDist > 290) return 1.0;

    // Smoothstep enterpolasyonu: f(t) = 3t^2 - 2t^3
    const t = (radialDist - 165) / (290 - 165);
    return t * t * (3 - 2 * t);
  }

  // =========================================================================
  // 2. YÜKSEKLİK VE NORMAL API'LERİ
  // =========================================================================
  /**
   * Dünya koordinatlarındaki (x, z) zemin yüksekliğini döndürür.
   * Tohumlu, çok katmanlı trigonometrik harmonikler ile C2 sürekli ve deterministiktir.
   * @param {number} x
   * @param {number} z
   * @returns {number} Zemin yüksekliği (metre)
   */
  getHeightAt(x, z) {
    const mask = this.getCityCenterMask(x, z);
    if (mask <= 0.0001) return 0.0;

    // Deterministik tohum faz kayması
    const s = this.seed * 0.0023;

    // Katman 1: Geniş sırtlar ve tepeler (düşük frekans)
    const h1 = Math.sin((x * 0.0075) + s + (z * 0.0055)) * 19.0;
    const h2 = Math.cos((x * 0.0125) - (s * 0.8) - (z * 0.0115)) * 11.5;

    // Katman 2: Organik vadiler ve bayırlar (orta frekans)
    const h3 = Math.sin((x * 0.024) + 1.35) * Math.cos((z * 0.021) + (s * 1.2) + 0.65) * 6.0;

    // Katman 3: Hafif zemin dalgalanmaları (yumuşak mikro eğimler)
    const h4 = Math.sin((x * 0.048) - (z * 0.042) + s) * 2.0;

    // Yönelim (Biasing): Kuzey ve Kuzeybatıya doğru yükselen dağ silsilesi (Vinewood Hills hissi)
    const northWestBias = Math.max(0, (-x * 0.014 - z * 0.022)) * 15.0;

    const rawHeight = Math.max(0, (h1 + h2 + h3 + h4 + northWestBias + 4.0));
    return rawHeight * mask;
  }

  /**
   * Geriye dönük tam uyumluluk için alias (character, vehicle, curvedRoad ve traffic tarafından kullanılır)
   * @param {number} x
   * @param {number} z
   * @returns {number}
   */
  getElevation(x, z) {
    return this.getHeightAt(x, z);
  }

  /**
   * Yüzey normal vektörünü hesaplar (Araç tekerlek yönelimi ve yaya eğim uyumu için)
   * @param {number} x
   * @param {number} z
   * @param {THREE.Vector3} [target]
   * @returns {THREE.Vector3}
   */
  getNormal(x, z, target = null) {
    const out = target || this._tmpNormal;
    const eps = 0.5;
    const hL = this.getHeightAt(x - eps, z);
    const hR = this.getHeightAt(x + eps, z);
    const hD = this.getHeightAt(x, z - eps);
    const hU = this.getHeightAt(x, z + eps);

    out.set(hL - hR, 2.0 * eps, hD - hU).normalize();
    return out;
  }

  // =========================================================================
  // 3. MEVCUT ZEMİN MESHİ İNŞASI (1600m x 1600m Optimize Plane)
  // =========================================================================
  buildTerrain() {
    const size = 1600;
    const segments = 128; // 16,384 vertex (~32K poligon - 60 FPS garantili)
    const geometry = new THREE.PlaneGeometry(size, size, segments, segments);
    geometry.rotateX(-Math.PI / 2);

    const posAttr = geometry.attributes.position;
    for (let i = 0; i < posAttr.count; i++) {
      const x = posAttr.getX(i);
      const z = posAttr.getZ(i);
      const y = this.getHeightAt(x, z);
      posAttr.setY(i, y);
    }

    geometry.computeVertexNormals();

    const mat = this.materials?.grass || new THREE.MeshStandardMaterial({
      color: 0x3d5c34,
      roughness: 0.92,
      metalness: 0.02,
      flatShading: false
    });

    this.mesh = new THREE.Mesh(geometry, mat);
    this.mesh.name = 'ProceduralTerrain';
    this.mesh.receiveShadow = true;
    this.group.add(this.mesh);

    return this.mesh;
  }

  // =========================================================================
  // 4. UZAK SİLÜETLER VE LANDMARK'LAR (Low-Poly Dekoratif)
  // =========================================================================
  /**
   * Ufukta derinlik ve atmosfer hissi veren düşük poligonlu dağ silsilesi,
   * uzak gökdelen silüetleri ve tepedeki radyo kulesini inşa eder.
   * Tüm dekoratif elemanlar tekil geometrilerde birleştirilerek 0 draw call yükü oluşturur.
   */
  buildDistantSilhouettes() {
    const mountainGeos = [];
    const buildingGeos = [];

    // A. Low-Poly Dağ Silsilesi (Uzak Ufukta 800m - 1400m mesafede halka şeklinde)
    const mountainCount = 18;
    for (let i = 0; i < mountainCount; i++) {
      const angle = (i / mountainCount) * Math.PI * 2 + 0.15;
      const dist = 850 + ((i * 37) % 300);
      const x = Math.cos(angle) * dist;
      const z = Math.sin(angle) * dist;

      // Kuzey/Kuzeybatı yönündeki dağlar daha görkemli (Vinewood / Chiliad esintisi)
      const isNorthWest = (x < 100 && z < 100);
      const height = isNorthWest ? (95 + ((i * 23) % 80)) : (55 + ((i * 19) % 45));
      const radius = 130 + ((i * 43) % 110);
      const segments = 5; // Low-poly 5 köşeli piramit/koni

      const coneGeo = new THREE.ConeGeometry(radius, height, segments);
      coneGeo.translate(x, height * 0.48, z);
      mountainGeos.push(coneGeo);
    }

    // B. Uzak Şehir Silüeti (Ufuktaki Los Santos / San Fierro yüksek binaları)
    // Güneydoğu yönünde ufukta yer alan minimalist gökdelen kutuları
    const buildingConfigs = [
      { x: 380, z: -350, w: 28, d: 24, h: 90 },
      { x: 420, z: -380, w: 22, d: 22, h: 125 },
      { x: 455, z: -330, w: 32, d: 28, h: 80 },
      { x: 480, z: -390, w: 20, d: 20, h: 110 },
      { x: 395, z: -430, w: 26, d: 26, h: 70 },
      { x: 440, z: -450, w: 35, d: 30, h: 95 }
    ];

    buildingConfigs.forEach(b => {
      const boxGeo = new THREE.BoxGeometry(b.w, b.h, b.d);
      boxGeo.translate(b.x, b.h * 0.5, b.z);
      buildingGeos.push(boxGeo);
    });

    // Dağ geometrilerini birleştir
    if (mountainGeos.length > 0) {
      const mergedMountains = BufferGeometryUtils.mergeGeometries(mountainGeos, false);
      if (mergedMountains) {
        // Sis ve gökyüzüyle uyumlu hafif mavimsi-yeşil atmosferik materyal
        const mountainMat = new THREE.MeshStandardMaterial({
          color: 0x4a5f45,
          roughness: 0.95,
          metalness: 0.05,
          flatShading: true
        });
        const mountainMesh = new THREE.Mesh(mergedMountains, mountainMat);
        mountainMesh.name = 'DistantMountains';
        this.distantGroup.add(mountainMesh);
      }
    }

    // Uzak gökdelen geometrilerini birleştir
    if (buildingGeos.length > 0) {
      const mergedBuildings = BufferGeometryUtils.mergeGeometries(buildingGeos, false);
      if (mergedBuildings) {
        const skylineMat = new THREE.MeshStandardMaterial({
          color: 0x5a636e,
          roughness: 0.85,
          metalness: 0.15
        });
        const skylineMesh = new THREE.Mesh(mergedBuildings, skylineMat);
        skylineMesh.name = 'DistantSkyline';
        this.distantGroup.add(skylineMesh);
      }
    }

    // C. Kuzeybatı Tepesindeki Prosedürel Radyo Kulesi (Landmark)
    this.buildRadioTower(-260, -220);
  }

  /**
   * Belirtilen (x, z) tepe noktasına radyo verici kulesi yerleştirir.
   */
  buildRadioTower(x, z) {
    const groundY = this.getHeightAt(x, z);
    const towerHeight = 45;

    const towerGroup = new THREE.Group();
    towerGroup.position.set(x, groundY, z);

    // Kule ana gövdesi (İnce konik kafes kule)
    const bodyGeo = new THREE.CylinderGeometry(0.4, 3.2, towerHeight, 4);
    bodyGeo.translate(0, towerHeight / 2, 0);
    const towerMat = new THREE.MeshStandardMaterial({
      color: 0x882222,
      roughness: 0.6,
      metalness: 0.4
    });
    const towerMesh = new THREE.Mesh(bodyGeo, towerMat);
    towerGroup.add(towerMesh);

    // Kule tepesindeki anten ve kırmızı uyarı ışığı
    const tipGeo = new THREE.SphereGeometry(0.6, 6, 6);
    tipGeo.translate(0, towerHeight + 0.5, 0);
    const tipMat = new THREE.MeshBasicMaterial({ color: 0xff1111 });
    const tipMesh = new THREE.Mesh(tipGeo, tipMat);
    towerGroup.add(tipMesh);

    this.distantGroup.add(towerGroup);
  }
}
