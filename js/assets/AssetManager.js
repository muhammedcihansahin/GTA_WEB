import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { ASSET_MANIFEST, getManifestEntry } from './assetManifest.js';

/**
 * AssetManager
 * Merkezi 3D Varlık Yükleyici, Önbellek ve Hata Yönetim Sistemi
 * - DRACO, KTX2, MeshoptDecoder entegrasyonu
 * - THREE.LoadingManager ile merkezi progress UX
 * - Asset Manifest desteği
 * - Promise tabanlı asenkron yükleme
 * - Eşzamanlı istek tekilleştirme (in-flight deduplication)
 * - Bellek önbelleği (Cache) ve SkeletonUtils derin klonlama
 * - Otomatik yeniden deneme (Retry)
 * - Çökme engelleyici procedürel fallback placeholder üretimi
 */
export class AssetManager {
  constructor() {
    // 1. Loading Manager
    this.loadingManager = new THREE.LoadingManager();
    this.progressCallback = null;
    this.errorCallback = null;

    this.setupLoadingManagerHooks();

    // 2. Alt Yükleyiciler (Lazy / Singleton)
    this.dracoLoader = null;
    this.ktx2Loader = null;
    this.gltfLoader = null;
    this.fbxLoader = null;
    this.textureLoader = null;
    this.audioLoader = null;

    this.renderer = null;

    // 3. Önbellekler (Cache)
    this.gltfCache = new Map();       // url -> { scene, animations, parser, userData, ... }
    this.fbxCache = new Map();        // url -> THREE.Group
    this.textureCache = new Map();    // url -> THREE.Texture
    this.audioCache = new Map();      // url -> AudioBuffer

    // Eşzamanlı indirmeleri tekilleştirmek için bekleyen promise haritası
    this.pendingPromises = new Map(); // url -> Promise

    this.initCoreLoaders();
  }

  /**
   * Çekirdek Loader'ları Hazırlar
   */
  initCoreLoaders() {
    this.dracoLoader = new DRACOLoader(this.loadingManager);
    this.dracoLoader.setDecoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/draco/');

    this.ktx2Loader = new KTX2Loader(this.loadingManager);
    this.ktx2Loader.setTranscoderPath('https://unpkg.com/three@0.160.0/examples/jsm/libs/basis/');

    this.gltfLoader = new GLTFLoader(this.loadingManager);
    this.gltfLoader.setDRACOLoader(this.dracoLoader);
    this.gltfLoader.setKTX2Loader(this.ktx2Loader);
    this.gltfLoader.setMeshoptDecoder(MeshoptDecoder);

    this.fbxLoader = new FBXLoader(this.loadingManager);
    this.textureLoader = new THREE.TextureLoader(this.loadingManager);
    this.audioLoader = new THREE.AudioLoader(this.loadingManager);
  }

  /**
   * WebGLRenderer desteğini KTX2Loader'a tanıtır
   */
  init(options = {}) {
    if (options.renderer) {
      this.renderer = options.renderer;
      if (this.ktx2Loader) {
        try {
          this.ktx2Loader.detectSupport(this.renderer);
        } catch (err) {
          console.warn('[AssetManager] KTX2 desteği saptanamadı:', err);
        }
      }
    }
    if (options.onProgress) this.progressCallback = options.onProgress;
    if (options.onError) this.errorCallback = options.onError;
  }

  /**
   * LoadingManager olaylarını dinler ve merkezi progress yayını yapar
   */
  setupLoadingManagerHooks() {
    this.loadingManager.onStart = (url, itemsLoaded, itemsTotal) => {
      const percent = Math.round((itemsLoaded / itemsTotal) * 100);
      if (this.progressCallback) {
        this.progressCallback(url, itemsLoaded, itemsTotal, percent);
      }
    };

    this.loadingManager.onProgress = (url, itemsLoaded, itemsTotal) => {
      const percent = Math.round((itemsLoaded / itemsTotal) * 100);
      if (this.progressCallback) {
        this.progressCallback(url, itemsLoaded, itemsTotal, percent);
      }
    };

    this.loadingManager.onError = (url) => {
      console.warn(`[AssetManager] ⚠️ Yükleme uyarısı/hatası: ${url}`);
      if (this.errorCallback) {
        this.errorCallback(url);
      }
    };
  }

  /**
   * UI Progress Callback Kaydı
   */
  setProgressCallback(fn) {
    this.progressCallback = fn;
  }

  /**
   * UI Error Callback Kaydı
   */
  setErrorCallback(fn) {
    this.errorCallback = fn;
  }

  /**
   * GLTF / GLB Modeli Yükler (Cache + Manifest + Fallback + Retry)
   * @param {string} urlOrId - Manifest ID veya doğrudan dosya yolu
   * @param {Object} options - { clone: true, retries: 2, silent: false }
   * @returns {Promise<Object>} { scene, animations, gltf, manifest }
   */
  async loadGLTF(urlOrId, options = {}) {
    const shouldClone = options.clone !== false;
    const maxRetries = options.retries !== undefined ? options.retries : 2;

    const manifestEntry = getManifestEntry(urlOrId);
    const url = manifestEntry ? manifestEntry.url : urlOrId;

    // 1. Önbellek Kontrolü
    if (this.gltfCache.has(url)) {
      const cached = this.gltfCache.get(url);
      return this.resolveCachedGLTF(cached, manifestEntry, shouldClone);
    }

    // 2. Eşzamanlı Yükleme (In-Flight Request Deduplication)
    if (this.pendingPromises.has(url)) {
      const rawGltf = await this.pendingPromises.get(url);
      return this.resolveCachedGLTF(rawGltf, manifestEntry, shouldClone);
    }

    // 3. Yükleme ve Yeniden Deneme (Retry Döngüsü)
    const loadPromise = (async () => {
      let lastError = null;
      for (let attempt = 0; attempt <= maxRetries; attempt++) {
        try {
          if (attempt > 0) {
            console.log(`[AssetManager] 🔄 Yeniden deneniyor (${attempt}/${maxRetries}): ${url}`);
            await new Promise(r => setTimeout(r, 400 * attempt));
          }

          const gltf = await new Promise((resolve, reject) => {
            this.gltfLoader.load(url, resolve, undefined, reject);
          });

          // Başarılı: Önbelleğe kaydet
          this.gltfCache.set(url, gltf);
          return gltf;
        } catch (err) {
          lastError = err;
        }
      }

      // Tüm denemeler başarısız: Fallback Placeholder üret ve oyunu kurtar
      console.warn(`[AssetManager] ❌ Model yüklenemedi, fallback placeholder devreye giriyor: "${urlOrId}" (Hata: ${lastError?.message || lastError})`);
      const fallbackGLTF = this.createFallbackPlaceholder(manifestEntry?.type || 'prop', urlOrId, url);
      this.gltfCache.set(url, fallbackGLTF);
      return fallbackGLTF;
    })();

    this.pendingPromises.set(url, loadPromise);

    try {
      const rawGltf = await loadPromise;
      return this.resolveCachedGLTF(rawGltf, manifestEntry, shouldClone);
    } finally {
      this.pendingPromises.delete(url);
    }
  }

  /**
   * Önbellekteki GLTF nesnesini kullanıcıya güvenle sunar
   */
  resolveCachedGLTF(rawGltf, manifestEntry, shouldClone) {
    let scene = rawGltf.scene;
    if (shouldClone && scene) {
      try {
        scene = SkeletonUtils.clone(rawGltf.scene);
      } catch {
        scene = rawGltf.scene.clone(true);
      }
    }

    if (manifestEntry && scene) {
      scene.userData.manifest = manifestEntry;
      if (manifestEntry.scale && manifestEntry.scale !== 1.0) {
        if (typeof manifestEntry.scale === 'number') {
          scene.scale.setScalar(manifestEntry.scale);
        } else if (Array.isArray(manifestEntry.scale)) {
          scene.scale.set(manifestEntry.scale[0], manifestEntry.scale[1], manifestEntry.scale[2]);
        }
      }
    }

    return {
      scene,
      animations: rawGltf.animations || [],
      gltf: rawGltf,
      manifest: manifestEntry || null,
      isPlaceholder: !!rawGltf.isPlaceholder
    };
  }

  /**
   * FBX Animasyon / Model Yükler (Önbellek destekli)
   */
  async loadFBX(urlOrId, options = {}) {
    const manifestEntry = getManifestEntry(urlOrId);
    const url = manifestEntry ? manifestEntry.url : urlOrId;

    if (this.fbxCache.has(url)) {
      return this.fbxCache.get(url);
    }

    if (this.pendingPromises.has(url)) {
      return await this.pendingPromises.get(url);
    }

    const loadPromise = new Promise((resolve, reject) => {
      this.fbxLoader.load(
        url,
        (fbx) => {
          this.fbxCache.set(url, fbx);
          resolve(fbx);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] FBX yükleme uyarısı: ${url}`, err);
          // Boş animasyonlu fallback group döndür
          const dummy = new THREE.Group();
          dummy.animations = [];
          dummy.userData.isPlaceholder = true;
          this.fbxCache.set(url, dummy);
          resolve(dummy);
        }
      );
    });

    this.pendingPromises.set(url, loadPromise);
    try {
      return await loadPromise;
    } finally {
      this.pendingPromises.delete(url);
    }
  }

  /**
   * Texture Yükler (Önbellek destekli)
   */
  async loadTexture(url, options = {}) {
    if (this.textureCache.has(url)) {
      return this.textureCache.get(url);
    }

    return new Promise((resolve, reject) => {
      this.textureLoader.load(
        url,
        (tex) => {
          if (options.wrapS) tex.wrapS = options.wrapS;
          if (options.wrapT) tex.wrapT = options.wrapT;
          if (options.repeat) tex.repeat.set(options.repeat.x, options.repeat.y);
          this.textureCache.set(url, tex);
          resolve(tex);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] Doku yükleme uyarısı: ${url}`);
          // 1x1 magenta fallback dokusu üret
          const canvas = document.createElement('canvas');
          canvas.width = 2;
          canvas.height = 2;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ff00ea';
          ctx.fillRect(0, 0, 2, 2);
          const fallbackTex = new THREE.CanvasTexture(canvas);
          this.textureCache.set(url, fallbackTex);
          resolve(fallbackTex);
        }
      );
    });
  }

  /**
   * Audio Buffer Yükler (Önbellek destekli)
   */
  async loadAudio(url) {
    if (this.audioCache.has(url)) {
      return this.audioCache.get(url);
    }

    return new Promise((resolve) => {
      this.audioLoader.load(
        url,
        (buffer) => {
          this.audioCache.set(url, buffer);
          resolve(buffer);
        },
        undefined,
        (err) => {
          console.warn(`[AssetManager] Ses dosyası yüklenemedi: ${url}`, err);
          resolve(null);
        }
      );
    });
  }

  /**
   * Yüklenemeyen Assetler İçin Şık ve Hatasız Procedürel Fallback Placeholder Üretimi
   */
  createFallbackPlaceholder(type, id, url) {
    const group = new THREE.Group();
    group.name = `Fallback_${type}_${id}`;

    let primaryMesh;
    const wireMat = new THREE.MeshStandardMaterial({
      color: 0xff9900,
      roughness: 0.5,
      metalness: 0.2
    });

    switch (type) {
      case 'vehicle': {
        // Araç gövdesi + 4 tekerlek + dummy wheel nodes
        const chassis = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.7, 4.4), wireMat);
        chassis.position.y = 0.6;
        chassis.castShadow = true;
        group.add(chassis);

        const roof = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.5, 2.2), new THREE.MeshStandardMaterial({ color: 0x222222 }));
        roof.position.set(0, 1.15, -0.2);
        group.add(roof);

        // Standart wheel nodes
        const wheelGeo = new THREE.CylinderGeometry(0.35, 0.35, 0.24, 12);
        wheelGeo.rotateZ(Math.PI / 2);
        const wheelMat = new THREE.MeshStandardMaterial({ color: 0x111111 });

        const wheelPositions = [
          { name: 'Wheel_FL', pos: [-0.95, 0.35, 1.35] },
          { name: 'Wheel_FR', pos: [0.95, 0.35, 1.35] },
          { name: 'Wheel_RL', pos: [-0.95, 0.35, -1.35] },
          { name: 'Wheel_RR', pos: [0.95, 0.35, -1.35] }
        ];

        wheelPositions.forEach(wp => {
          const w = new THREE.Mesh(wheelGeo, wheelMat);
          w.name = wp.name;
          w.position.set(...wp.pos);
          group.add(w);
        });
        break;
      }

      case 'character':
      case 'ped': {
        // Karakter silueti (Kapsül gövde + kafa)
        const body = new THREE.Mesh(new THREE.CylinderGeometry(0.28, 0.24, 1.3, 10), wireMat);
        body.position.y = 0.95;
        body.castShadow = true;
        group.add(body);

        const head = new THREE.Mesh(new THREE.SphereGeometry(0.20, 10, 10), new THREE.MeshStandardMaterial({ color: 0xf3c59b }));
        head.position.y = 1.70;
        head.castShadow = true;
        group.add(head);
        break;
      }

      case 'house': {
        // Renkli bina bloğu + çatı
        const bldg = new THREE.Mesh(new THREE.BoxGeometry(10, 6, 9), new THREE.MeshStandardMaterial({ color: 0xd5cbbd, roughness: 0.8 }));
        bldg.position.y = 3.0;
        bldg.castShadow = true;
        bldg.receiveShadow = true;
        group.add(bldg);

        const roof = new THREE.Mesh(new THREE.ConeGeometry(8, 2.5, 4), new THREE.MeshStandardMaterial({ color: 0x8b3a2b }));
        roof.position.y = 7.25;
        roof.rotation.y = Math.PI / 4;
        group.add(roof);
        break;
      }

      case 'prop':
      default: {
        // Genel kutu/silindir prop
        const propMesh = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.5, 3.0, 10), wireMat);
        propMesh.position.y = 1.5;
        propMesh.castShadow = true;
        group.add(propMesh);
        break;
      }
    }

    group.userData.isPlaceholder = true;
    group.userData.placeholderType = type;
    group.userData.placeholderUrl = url;

    return {
      scene: group,
      animations: [],
      isPlaceholder: true
    };
  }

  /**
   * Önbellek Temizleme
   */
  clearCache() {
    this.gltfCache.clear();
    this.fbxCache.clear();
    this.textureCache.clear();
    this.audioCache.clear();
    this.pendingPromises.clear();
  }
}

// Global Singleton Instance
export const assetManager = new AssetManager();
