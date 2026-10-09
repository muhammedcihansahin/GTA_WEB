/**
 * @file VehicleLoader.js
 * @description Production-ready, highly optimized 3D Vehicle Asset Pipeline for Three.js.
 * 
 * Features:
 * 1. DRACOLoader compressed GLTF/GLB streaming with LoadingManager progress tracking.
 * 2. Automatic Node & Hierarchy Separation: Isolates chassis and 4 wheels (FL, FR, RL, RR)
 *    and recenters wheel pivots for physics integration (Cannon-es, Rapier, RaycastVehicle).
 * 3. High-Fidelity Automotive PBR Pipeline: Converts basic materials to MeshStandard / MeshPhysicalMaterial
 *    with realistic automotive clearcoat, tuned metalness/roughness, and PMREM environment map reflections.
 * 4. CDN & Asset Registry architecture with in-memory caching and deep-cloning.
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { RGBELoader } from 'three/addons/loaders/RGBELoader.js';
import { buildWheelRig } from '../vehicle/WheelRig.js';

/**
 * Tekerlek Pozisyon Tipleri
 * @typedef {'FL' | 'FR' | 'RL' | 'RR'} WheelPosition
 */

/**
 * @typedef {Object} VehicleLoaderOptions
 * @property {THREE.WebGLRenderer} [renderer] - PMREMGenerator için WebGL Renderer referansı.
 * @property {THREE.LoadingManager} [loadingManager] - Merkezi Three.js LoadingManager.
 * @property {string} [dracoDecoderPath] - Draco WebAssembly decoder CDN veya yerel dizin yolu.
 * @property {string} [assetBaseUrl] - Araçların barındırıldığı CDN veya yerel kök URL.
 * @property {THREE.Texture} [environmentMap] - Modellere otomatik uygulanacak varsayılan envMap.
 * @property {boolean} [enableClearcoat] - Gövde boyasında MeshPhysicalMaterial clearcoat kullanımı.
 */

export class VehicleLoader {
  /**
   * @param {VehicleLoaderOptions} [options={}]
   */
  constructor(options = {}) {
    this.renderer = options.renderer || null;
    this.loadingManager = options.loadingManager || THREE.DefaultLoadingManager;
    this.assetBaseUrl = (options.assetBaseUrl || '/assets/vehicles/').replace(/\/+$/, '') + '/';
    this.environmentMap = options.environmentMap || null;
    this.enableClearcoat = options.enableClearcoat !== undefined ? options.enableClearcoat : true;

    // Draco Decoder Yolu (Google / unpkg / Three.js CDN veya yerel)
    this.dracoDecoderPath = options.dracoDecoderPath || 'https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/';

    // Önbellekler (Cache)
    this.modelCache = new Map();     // url -> { gltf, metrics }
    this.pendingRequests = new Map(); // url -> Promise

    // Evrensel tekerlek isim pattern'leri (büyük/küçük harf duyarsız)
    this.wheelPatterns = {
      frontLeft: /(wheel.*fl|wheel.*front.*l|w1|tire.*fl|front.*left|wheel_lf)/i,
      frontRight: /(wheel.*fr|wheel.*front.*r|w2|tire.*fr|front.*right|wheel_rf)/i,
      rearLeft: /(wheel.*rl|wheel.*rear.*l|w3|tire.*rl|rear.*left|wheel_lr)/i,
      rearRight: /(wheel.*rr|wheel.*rear.*r|w4|tire.*rr|rear.*right|wheel_rr)/i
    };

    // Loader Başlatma
    this.initLoaders();
  }

  /**
   * DRACO ve GLTF Yükleyicilerini İlklendirir
   */
  initLoaders() {
    this.dracoLoader = new DRACOLoader(this.loadingManager);
    this.dracoLoader.setDecoderPath(this.dracoDecoderPath);
    this.dracoLoader.setDecoderConfig({ type: 'js' }); // WASM / JS otomatik seçimi
    this.dracoLoader.preload();

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.loader = this.gltfLoader; // Alias
  }

  /**
   * Renderer'ı sonradan bağlamak veya güncellemek için kullanılır
   * @param {THREE.WebGLRenderer} renderer 
   */
  setRenderer(renderer) {
    this.renderer = renderer;
  }

  /**
   * Ortam haritasını (EnvMap) günceller
   * @param {THREE.Texture} envMap 
   */
  setEnvironmentMap(envMap) {
    this.environmentMap = envMap;
  }

  /**
   * RGBELoader ve PMREMGenerator kullanarak HDR çevre haritası (IBL) yükler
   * ve sahneye/modellere uygular.
   * @param {string} hdrUrl - HDR dosya yolu veya CDN bağlantısı
   * @param {THREE.Scene} [scene] - Opsiyonel olarak doğrudan scene.environment'a atar
   * @returns {Promise<THREE.Texture>}
   */
  async loadEnvironmentHDR(hdrUrl, scene = null) {
    if (!this.renderer) {
      console.warn('[VehicleLoader] PMREMGenerator için renderer tanımlı değil. Lütfen setRenderer() çağırın.');
      return null;
    }

    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();

    const rgbeLoader = new RGBELoader(this.loadingManager);

    return new Promise((resolve, reject) => {
      rgbeLoader.load(
        hdrUrl,
        (texture) => {
          const envMap = pmremGenerator.fromEquirectangular(texture).texture;
          this.setEnvironmentMap(envMap);

          if (scene) {
            scene.environment = envMap;
          }

          texture.dispose();
          pmremGenerator.dispose();
          resolve(envMap);
        },
        undefined,
        (error) => {
          console.error(`[VehicleLoader] HDR çevre haritası yüklenemedi: ${hdrUrl}`, error);
          reject(error);
        }
      );
    });
  }

  /**
   * Belirtilen araç modelini yükler (Callback veya Promise tabanlı evrensel arayüz).
   * 
   * @param {string} path - Model dosya adı veya URL.
   * @param {Function|Object} [onLoadOrConfig] - Callback fonksiyonu (onLoad) veya override ayarları.
   * @param {Function} [onError] - Hata callback fonksiyonu.
   * @returns {Promise<LoadedVehicleResult>|void}
   */
  load(path, onLoadOrConfig, onError) {
    // 1. Callback stili (Evrensel loader API: load(path, onLoad, onError))
    if (typeof onLoadOrConfig === 'function') {
      const url = this.resolveAssetUrl(path);
      this.loader.load(url, (gltf) => {
        try {
          const model = gltf.scene;

          // 1. Tüm nesneleri topla
          const allMeshes = [];
          model.traverse((child) => {
            allMeshes.push({
              name: child.name,
              type: child.type,
              isMesh: child.isMesh
            });
          });

          console.log('Model loaded:', path, 'Total objects:', allMeshes.length);

          // 2. Evrensel Wheel Rig oluştur
          const wheelRig = buildWheelRig(model, {
            useGeometryFallback: true,
            createFallbackVisuals: false
          });

          // 3. Modeli merkeze al
          this.centerModel(model, wheelRig.pivots);

          // 4. Sonuçları döndür
          onLoadOrConfig({
            model: model,
            wheels: wheelRig.pivots,
            wheelRig: wheelRig,
            debug: {
              totalMeshes: allMeshes.length,
              wheelNames: Object.keys(wheelRig.pivots),
              pivotCount: Object.keys(wheelRig.pivots).length
            }
          });
        } catch (error) {
          console.error('VehicleLoader error:', error);
          if (onError) onError(error);
        }
      }, undefined, (error) => {
        console.error('GLTF Load error:', error);
        if (onError) onError(error);
      });
      return;
    }

    // 2. Promise & Cache stili (VehiclePhysics ve gelişmiş çağrılar için)
    return this.loadAsync(path, onLoadOrConfig);
  }

  /**
   * Promise tabanlı, materyal zenginleştirmeli derin yükleyici
   */
  async loadAsync(vehicleIdentifier, overrideConfig = {}) {
    const url = this.resolveAssetUrl(vehicleIdentifier);

    // 1. Önbellekte varsa doğrudan derin klonla
    if (this.modelCache.has(url)) {
      const cached = this.modelCache.get(url);
      return this.instantiateVehicle(cached, overrideConfig);
    }

    // 2. Halihazırda indiriliyorsa aynı Promise'e abone ol (Deduplication)
    if (this.pendingRequests.has(url)) {
      const rawGltf = await this.pendingRequests.get(url);
      return this.instantiateVehicle(rawGltf, overrideConfig);
    }

    // 3. Yeni İndirme Başlat
    const loadPromise = new Promise((resolve, reject) => {
      this.gltfLoader.load(
        url,
        (gltf) => resolve(gltf),
        undefined,
        (error) => {
          console.error(`[VehicleLoader] Model yüklenemedi: ${url}`, error);
          reject(error);
        }
      );
    });

    this.pendingRequests.set(url, loadPromise);

    try {
      const rawGltf = await loadPromise;
      this.pendingRequests.delete(url);

      // Ana şablon üzerinde PBR ve Hiyerarşi analizi yapıp önbelleğe alıyoruz
      const processedTemplate = this.processRawGltf(rawGltf);
      this.modelCache.set(url, processedTemplate);

      return this.instantiateVehicle(processedTemplate, overrideConfig);
    } catch (err) {
      this.pendingRequests.delete(url);
      throw err;
    }
  }

  /**
   * Model içindeki tekerlekleri evrensel isim kalıpları ve uzamsal 4 köşe analiziyle tespit eder.
   * Standardize isimler: 'Wheel_FL_Pivot', 'Wheel_FR_Pivot', 'Wheel_RL_Pivot', 'Wheel_RR_Pivot'
   * @param {THREE.Object3D} model 
   * @returns {Object.<string, THREE.Object3D>}
   */
  findWheels(model) {
    const wheels = {
      fl: null,
      fr: null,
      rl: null,
      rr: null
    };

    const wheelPatterns = {
      fl: /(wheel.*(fl|front.*l|l.*front|w1))|(^(fl|f_l)_wheel)|(wheel_lf)|(tire.*fl)|(rotor.*lf)|(\bw1\b)/i,
      fr: /(wheel.*(fr|front.*r|r.*front|w2))|(^(fr|f_r)_wheel)|(wheel_rf)|(tire.*fr)|(rotor.*rf)|(\bw2\b)/i,
      rl: /(wheel.*(rl|rear.*l|back.*l|l.*rear|w3))|(^(rl|r_l)_wheel)|(wheel_lr)|(wheel_lb)|(tire.*rl)|(rotor.*lr)|(\bw3\b)/i,
      rr: /(wheel.*(rr|rear.*r|back.*r|r.*rear|w4))|(^(rr|r_r)_wheel)|(wheel_rr)|(wheel_rb)|(tire.*rr)|(rotor.*rr)|(\bw4\b)/i
    };

    const generalWheelRegex = /(wheel|tire|tyre|rim|rotor|velg|hub|f_l_wheel|f_r_wheel|r_l_wheel|r_r_wheel|\bw[1-4]\b)/i;
    const excludeRegex = /(steering|cockpit|interior|seat|wiper|mirror|dash|pedal|column|exhaust)/i;

    const candidateNodes = [];

    // 1. Tüm child nesneleri tara (Sadece Mesh değil, Group ve Object3D'leri de dahil et)
    model.traverse((child) => {
      if (!child || child === model) return;
      const name = child.name || '';
      if (!name) return;

      // İsimle doğrudan 4 pozisyondan birine uyuyor mu?
      for (const [pos, pattern] of Object.entries(wheelPatterns)) {
        if (!wheels[pos] && pattern.test(name) && !excludeRegex.test(name)) {
          wheels[pos] = child;
          break;
        }
      }

      // Genel tekerlek aday havuzuna ekle
      if (generalWheelRegex.test(name) && !excludeRegex.test(name)) {
        candidateNodes.push(child);
      }
    });

    // 2. Eğer 4 tekerlek isimle doğrudan tam bulunamadıysa, hiyerarşi ve 4 köşe uzamsal eşleştirmesi yap
    const foundDirectCount = Object.values(wheels).filter(Boolean).length;
    if (foundDirectCount < 4) {
      // Birbirinin alt düğümü olan adayları filtrele (en üst tekerlek grubunu al)
      const topLevelCandidates = candidateNodes.filter(node => {
        let p = node.parent;
        while (p && p !== model) {
          if (candidateNodes.includes(p)) return false;
          p = p.parent;
        }
        return true;
      });

      const matched = this.matchWheelsToCorners(model, topLevelCandidates);
      for (const pos of ['fl', 'fr', 'rl', 'rr']) {
        if (!wheels[pos] && matched[pos]) {
          wheels[pos] = matched[pos];
        }
      }
    }

    // 3. Eksik tekerlek kontrolü ve console.warn
    const finalFoundCount = Object.values(wheels).filter(Boolean).length;
    if (finalFoundCount < 4) {
      console.warn(`⚠️ [VehicleLoader] Model için 4 tekerlek tam olarak tespit edilemedi (${finalFoundCount}/4 bulundu). Eksik olanlar otomatik geometri merkezleriyle dengelenecek.`);
    }

    // Kolay erişim için standart isim alias'ları
    wheels.frontLeft = wheels.fl;
    wheels.frontRight = wheels.fr;
    wheels.rearLeft = wheels.rl;
    wheels.rearRight = wheels.rr;
    wheels.Wheel_FL_Pivot = wheels.fl;
    wheels.Wheel_FR_Pivot = wheels.fr;
    wheels.Wheel_RL_Pivot = wheels.rl;
    wheels.Wheel_RR_Pivot = wheels.rr;

    return wheels;
  }

  /**
   * Bounding box ve 4 köşe uzamsal analiziyle tekerlek eşleştirme fonksiyonu
   * Modelin 4 köşesini (ön-sol, ön-sağ, arka-sol, arka-sağ) tespit eder.
   * @param {THREE.Object3D} model
   * @param {THREE.Object3D[]} candidates
   * @returns {Object.<string, THREE.Object3D|null>}
   */
  matchWheelsToCorners(model, candidates = []) {
    const matched = { fl: null, fr: null, rl: null, rr: null };

    // Dünya matrislerini güncelle
    model.updateMatrixWorld(true);
    const modelBox = new THREE.Box3().setFromObject(model);
    const modelCenter = new THREE.Vector3();
    const modelSize = new THREE.Vector3();
    modelBox.getCenter(modelCenter);
    modelBox.getSize(modelSize);

    // Eğer aday havuzu boşsa veya yetersizse, tüm mesh'leri topla
    let pool = candidates.slice();
    if (pool.length < 4) {
      const allMeshes = [];
      model.traverse((child) => {
        if (child.isMesh) {
          const b = new THREE.Box3().setFromObject(child);
          const c = new THREE.Vector3();
          b.getCenter(c);
          // Tekerlekler genelde aracın alt yarısında yer alır
          if (c.y <= modelCenter.y + modelSize.y * 0.15) {
            allMeshes.push(child);
          }
        }
      });
      if (allMeshes.length >= 4) {
        pool = allMeshes;
      }
    }

    if (pool.length === 0) return matched;

    // Her adayın modele göre yerel merkezini ve yarıçapını hesapla
    const nodeInfos = pool.map(node => {
      node.updateMatrixWorld(true);
      const box = new THREE.Box3().setFromObject(node);
      const worldC = new THREE.Vector3();
      const size = new THREE.Vector3();
      box.getCenter(worldC);
      box.getSize(size);
      const localC = model.worldToLocal(worldC.clone());
      return {
        node,
        localC,
        radius: Math.max(size.y, size.z) * 0.5
      };
    });

    // 4 köşeye hedef noktalar (Three.js koordinat sistemi: Z- küçük ön, Z+ büyük arka, X- sol, X+ sağ)
    const halfW = modelSize.x * 0.40;
    const halfL = modelSize.z * 0.35;
    const groundY = modelBox.min.y + Math.min(modelSize.y * 0.3, 0.4);

    const cornerTargets = {
      fl: new THREE.Vector3(-halfW, groundY, -halfL),
      fr: new THREE.Vector3(+halfW, groundY, -halfL),
      rl: new THREE.Vector3(-halfW, groundY, +halfL),
      rr: new THREE.Vector3(+halfW, groundY, +halfL)
    };

    const usedNodes = new Set();

    for (const [pos, target] of Object.entries(cornerTargets)) {
      let bestNode = null;
      let minDistance = Infinity;

      for (const info of nodeInfos) {
        if (usedNodes.has(info.node)) continue;
        const dist = target.distanceTo(info.localC);
        if (dist < minDistance) {
          minDistance = dist;
          bestNode = info.node;
        }
      }

      if (bestNode) {
        matched[pos] = bestNode;
        usedNodes.add(bestNode);
      }
    }

    return matched;
  }

  /**
   * Tekerlekler için YXZ rotasyon sıralı bağımsız standart pivotlar oluşturur.
   * İsimlendirme: 'Wheel_FL_Pivot', 'Wheel_FR_Pivot', 'Wheel_RL_Pivot', 'Wheel_RR_Pivot'
   * @param {Object} wheels 
   * @param {THREE.Object3D} [parentContainer]
   * @returns {Object.<string, THREE.Group>}
   */
  createWheelPivots(wheels, parentContainer = null) {
    const pivots = {};
    const posNames = {
      fl: 'Wheel_FL_Pivot',
      fr: 'Wheel_FR_Pivot',
      rl: 'Wheel_RL_Pivot',
      rr: 'Wheel_RR_Pivot'
    };

    for (const [posKey, stdName] of Object.entries(posNames)) {
      const wheelNode = wheels[posKey] || wheels[stdName];
      const pivot = new THREE.Group();
      pivot.name = stdName;
      pivot.rotation.order = 'YXZ';
      pivot.matrixAutoUpdate = true;

      if (wheelNode) {
        wheelNode.updateMatrixWorld(true);
        const bbox = new THREE.Box3().setFromObject(wheelNode);
        const center = new THREE.Vector3();
        bbox.getCenter(center);

        if (wheelNode.parent) {
          pivot.position.copy(wheelNode.parent.worldToLocal(center.clone()));
          wheelNode.parent.add(pivot);
        } else if (parentContainer) {
          pivot.position.copy(parentContainer.worldToLocal(center.clone()));
          parentContainer.add(pivot);
        }

        pivot.attach(wheelNode);
      }

      pivots[posKey] = pivot;
      pivots[stdName] = pivot;
    }

    return pivots;
  }

  /**
   * Modeli merkezler ve pivot konumlarını dengeler
   * @param {THREE.Object3D} model 
   * @param {Object} pivots 
   */
  centerModel(model, pivots = {}) {
    // Bounding box hesapla
    const box = new THREE.Box3().setFromObject(model);
    const center = box.getCenter(new THREE.Vector3());

    // Modeli merkeze al
    model.position.x -= center.x;
    model.position.z -= center.z;

    // Pivot'ları da güncelle
    for (const pivot of Object.values(pivots)) {
      if (pivot && pivot.position) {
        pivot.position.x -= center.x;
        pivot.position.z -= center.z;
      }
    }
  }

  /**
   * CDN veya yerel URL çözümlemesi
   * @private
   */
  resolveAssetUrl(identifier) {
    if (identifier.startsWith('http://') || identifier.startsWith('https://') || identifier.startsWith('/')) {
      return identifier;
    }
    return `${this.assetBaseUrl}${identifier}`;
  }

  /**
   * İndirilen GLTF sahnesi üzerinde hiyerarşi ve materyal tespiti yapar.
   * @private
   */
  processRawGltf(rawGltf) {
    const scene = rawGltf.scene;

    // Normal, shadow ve pbr ayarlarını başlat
    scene.traverse((node) => {
      if (node.isMesh) {
        node.castShadow = true;
        node.receiveShadow = true;
      }
    });

    return {
      sourceGltf: rawGltf,
      templateScene: scene
    };
  }

  /**
   * Şablondan yeni bir canlı araç örneği oluşturur, parçaları ayırır ve fiziğe hazırlar.
   * @private
   */
  instantiateVehicle(templateData, config = {}) {
    // Derin klonlama (Deep clone)
    const clonedScene = templateData.templateScene.clone(true);

    // Materyalleri izole et (Instance bazında renk değiştirebilmek için)
    const materialMap = new Map();
    clonedScene.traverse((node) => {
      if (node.isMesh && node.material) {
        if (Array.isArray(node.material)) {
          node.material = node.material.map(m => this.cloneAndEnhanceMaterial(m, materialMap, config));
        } else {
          node.material = this.cloneAndEnhanceMaterial(node.material, materialMap, config);
        }
      }
    });

    // Gövde (Chassis) ve Tekerlekleri (Wheels) Hiyerarşiden Ayır
    const separation = this.separateChassisAndWheels(clonedScene, config);

    // Ortam haritasını (EnvMap) bağla
    if (this.environmentMap) {
      this.applyEnvMap(separation.root, this.environmentMap);
    }

    return {
      root: separation.root,             // Tüm aracın üst düğümü
      chassis: separation.chassis,       // Gövde, camlar, kabin (Yaylanan kütle)
      wheels: separation.wheels,         // { fl, fr, rl, rr } tekerlek nesneleri
      wheelRig: separation.wheelRig,     // Standart Wheel Rig
      metrics: separation.metrics,       // Dingil mesafesi, tekerlek yarıçapı, genişlik
      materials: Array.from(materialMap.values()),
      setBodyColor: (colorHex) => this.setCarColor(separation.chassis, colorHex)
    };
  }

  /**
   * Orijinal materyalden yeni PBR materyale harita ve mikro doku detaylarını aktarır.
   * @private
   */
  transferPbrMaps(origMat, newMat) {
    if (!origMat || !newMat) return newMat;

    if (origMat.map) {
      newMat.map = origMat.map;
      newMat.map.needsUpdate = true;
    }
    if (origMat.normalMap) {
      newMat.normalMap = origMat.normalMap;
      if (origMat.normalScale && newMat.normalScale) {
        newMat.normalScale.copy(origMat.normalScale);
      }
    }
    if (origMat.aoMap) {
      newMat.aoMap = origMat.aoMap;
      newMat.aoMapIntensity = origMat.aoMapIntensity !== undefined ? origMat.aoMapIntensity : 1.0;
    }
    if (origMat.roughnessMap) newMat.roughnessMap = origMat.roughnessMap;
    if (origMat.metalnessMap) newMat.metalnessMap = origMat.metalnessMap;
    if (origMat.emissiveMap) newMat.emissiveMap = origMat.emissiveMap;
    if (origMat.alphaMap) newMat.alphaMap = origMat.alphaMap;
    if (origMat.side !== undefined) newMat.side = origMat.side;

    newMat.needsUpdate = true;
    return newMat;
  }

  /**
   * PBR Materyal Optimizasyonu:
   * Standart veya MeshBasic modelleri gerçekçi otomotiv MeshStandard / MeshPhysical materyallerine dönüştürür.
   * @private
   */
  cloneAndEnhanceMaterial(origMat, materialMap, config) {
    if (materialMap.has(origMat.uuid)) {
      return materialMap.get(origMat.uuid);
    }

    const name = (origMat.name || '').toLowerCase();
    let newMat;

    // 1. Araç Gövde Boyası (Car Paint)
    const isCarPaint = name.includes('paint') || name.includes('car_color') || name.includes('body') || name.includes('exterior');
    // 2. Camlar (Glass)
    const isGlass = name.includes('glass') || name.includes('window') || name.includes('windscreen');
    // 3. Krom / Aynalar / Metal parçalar
    const isChrome = name.includes('chrome') || name.includes('mirror') || name.includes('metal') || name.includes('exhaust');
    // 4. Lastik / Kauçuk
    const isRubber = name.includes('tire') || name.includes('tyre') || name.includes('rubber');
    // 5. Işıklar (Lights)
    const isLight = name.includes('light') || name.includes('headlight') || name.includes('taillight');

    if (isCarPaint && this.enableClearcoat) {
      // Doku (logo, amblem, çıkartma) varsa rengin bozulmaması için saf beyaz, yoksa araç rengi
      let paintColor;
      if (origMat.map) {
        paintColor = new THREE.Color(0xffffff);
      } else if (config.color !== undefined) {
        paintColor = config.color;
      } else if (origMat.color) {
        paintColor = origMat.color;
      } else {
        paintColor = new THREE.Color(0xffffff);
      }

      newMat = new THREE.MeshPhysicalMaterial({
        color: paintColor,
        roughness: 0.28,
        metalness: 0.04,
        clearcoat: 0.55,
        clearcoatRoughness: 0.08,
        reflectivity: 0.98,
        envMapIntensity: 1.0
      });
      this.transferPbrMaps(origMat, newMat);
      newMat.userData.isCarPaint = true;
    } else if (isGlass) {
      newMat = new THREE.MeshPhysicalMaterial({
        color: new THREE.Color(0x1e2830),
        roughness: 0.06,
        metalness: 0.0,
        transmission: 0.90,
        ior: 1.52,
        transparent: true,
        opacity: 1.0,
        depthWrite: false,
        envMapIntensity: 1.2
      });
      this.transferPbrMaps(origMat, newMat);
    } else if (isChrome) {
      newMat = new THREE.MeshStandardMaterial({
        color: new THREE.Color(0xffffff),
        roughness: 0.14,
        metalness: 0.95,
        envMapIntensity: 1.15
      });
      this.transferPbrMaps(origMat, newMat);
    } else if (isRubber) {
      newMat = new THREE.MeshStandardMaterial({
        color: origMat.map ? new THREE.Color(0xffffff) : new THREE.Color(0x1e1e1e),
        roughness: 0.88,
        metalness: 0.0,
        envMapIntensity: 0.20
      });
      this.transferPbrMaps(origMat, newMat);
    } else if (isLight) {
      newMat = origMat.clone();
      if (newMat.emissive) {
        newMat.emissiveIntensity = 1.0;
      }
    } else {
      // Genel parçalar
      newMat = origMat.clone();
      if (newMat.isMeshStandardMaterial || newMat.isMeshPhysicalMaterial) {
        newMat.roughness = THREE.MathUtils.clamp(newMat.roughness !== undefined ? newMat.roughness : 0.5, 0.15, 0.9);
        if (newMat.map) {
          // Dokulu parçalarda gölgede kirli/çamurlu görünümü önlemek için dielektrik tavan
          newMat.metalness = Math.min(newMat.metalness !== undefined ? newMat.metalness : 0.0, 0.04);
          newMat.envMapIntensity = 1.0;
        } else {
          newMat.metalness = THREE.MathUtils.clamp(newMat.metalness !== undefined ? newMat.metalness : 0.1, 0.0, 0.95);
        }
      }
    }

    newMat.name = origMat.name;
    materialMap.set(origMat.uuid, newMat);
    return newMat;
  }

  /**
   * Model hiyerarşisindeki düğümleri ayrıştırır:
   * Tekerlekleri gövdeden koparıp bağımsız pivot noktalarına oturtur.
   * Bu sayede fizik motoru (RaycastVehicle veya RigidBody) tekerleği bağımsız döndürebilir/yönlendirebilir.
   * 
   * @param {THREE.Group} modelScene
   */
  separateChassisAndWheels(modelScene, config = {}) {
    const root = new THREE.Group();
    root.name = 'Vehicle_Root';

    const chassis = new THREE.Group();
    chassis.name = 'Chassis';
    root.add(chassis);

    // 1. Modelin Geometrik Merkezini ve Tabanını Hesapla
    modelScene.updateMatrixWorld(true);
    const initialModelBox = new THREE.Box3().setFromObject(modelScene);
    const modelCenter = new THREE.Vector3();
    initialModelBox.getCenter(modelCenter);
    const lowestY = initialModelBox.min.y;

    // Modeli şasinin tam merkezine hizala
    modelScene.position.x -= modelCenter.x;
    modelScene.position.z -= modelCenter.z;
    modelScene.position.y -= lowestY;
    modelScene.updateMatrixWorld(true);

    // Modeli şasi altına al
    chassis.add(modelScene);

    // 2. Evrensel Wheel Rig Oluştur
    const wheelRig = buildWheelRig(chassis, {
      frontSign: config.frontSign,
      lengthAxis: config.lengthAxis,
      rollSign: config.rollSign,
      steerSign: config.steerSign,
      useGeometryFallback: config.useGeometryFallback !== false,
      createFallbackVisuals: !!config.createFallbackVisuals,
      fallbackRadius: config.wheelRadius || 0.32
    });

    const wheels = {
      fl: wheelRig.pivots.FL,
      fr: wheelRig.pivots.FR,
      rl: wheelRig.pivots.RL,
      rr: wheelRig.pivots.RR,
      Wheel_FL_Pivot: wheelRig.pivots.FL,
      Wheel_FR_Pivot: wheelRig.pivots.FR,
      Wheel_RL_Pivot: wheelRig.pivots.RL,
      Wheel_RR_Pivot: wheelRig.pivots.RR
    };

    const wheelOffsets = {
      fl: wheelRig.pivots.FL.position.clone(),
      fr: wheelRig.pivots.FR.position.clone(),
      rl: wheelRig.pivots.RL.position.clone(),
      rr: wheelRig.pivots.RR.position.clone()
    };

    return {
      root,
      chassis,
      wheels,
      wheelRig,
      metrics: {
        wheelRadius: wheelRig.averageRadius,
        wheelBase: wheelRig.wheelBase,
        trackWidth: wheelRig.trackWidth,
        offsets: wheelOffsets
      }
    };
  }

  /**
   * Tüm modele veya sahneye PMREM tabanlı Environment Map uygular
   * @param {THREE.Object3D} object 
   * @param {THREE.Texture} envMap 
   */
  applyEnvMap(object, envMap) {
    if (!envMap) return;
    object.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const mat of mats) {
          if ('envMap' in mat) {
            mat.envMap = envMap;
            mat.envMapIntensity = 1.0;
            mat.needsUpdate = true;
          }
        }
      }
    });
  }

  /**
   * Gövde rengini dinamik olarak değiştirir (MeshPhysicalMaterial veya carPaint etiketli)
   */
  setCarColor(chassisGroup, hexColor) {
    const color = new THREE.Color(hexColor);
    chassisGroup.traverse((child) => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        for (const m of mats) {
          if (m.userData && m.userData.isCarPaint) {
            m.color.copy(color);
            m.needsUpdate = true;
          }
        }
      }
    });
  }
}
