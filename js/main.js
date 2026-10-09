import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CameraManager } from './controls.js?v=57';
import { UIManager } from './ui.js?v=82';
import { AudioManager } from './audio.js?v=82';
import { CityManager, HOUSE_PARCELS } from './city.js?v=67';
import { SkyManager } from './sky.js?v=65';
import { MODEL_CATALOG } from './catalog.js?v=57';
import { CharacterManager } from './character.js?v=65';
import { VehicleManager } from './vehicle.js?v=84';
import { TerrainManager } from './world/terrain.js';
import { RoadGraph } from './traffic/roadGraph.js';
import { CurvedRoadBuilder } from './curvedRoad.js';
import { TrafficManager } from './traffic/trafficManager.js?v=76';
import { SidewalkGraph } from './pedestrian/SidewalkGraph.js?v=72';
import { PedestrianManager } from './pedestrian/PedestrianManager.js?v=88';
import { gangTerritoryManager } from './pedestrian/GangTerritoryManager.js';
import { gangWarManager } from './pedestrian/GangWarManager.js';
import { DebugManager } from './debug.js?v=71';
import { CollisionManager, CollisionLayer } from './physics/CollisionManager.js';
import { assetManager } from './assets/AssetManager.js';
import { ASSET_MANIFEST } from './assets/assetManifest.js';
import { profiler } from './core/PerformanceProfiler.js';
import { SpatialChunkManager } from './world/SpatialChunkManager.js?v=79';
import { gameState } from './gameplay/GameStateManager.js';
import { saveManager } from './gameplay/SaveManager.js';
import { wantedManager } from './gameplay/WantedManager.js';
import { PoliceManager } from './gameplay/PoliceManager.js';
import { radioManager } from './gameplay/RadioManager.js';
import { MissionManager } from './gameplay/MissionManager.js';
import { WeatherManager } from './gameplay/WeatherManager.js';
import { PickupManager } from './gameplay/PickupManager.js';
import { PayNSprayManager } from './gameplay/PayNSprayManager.js';
import { ParamedicMissionManager } from './gameplay/ParamedicMissionManager.js';
import { FirefighterMissionManager } from './gameplay/FirefighterMissionManager.js';

// Geriye dönük uyumluluk için MODEL_CATALOG dışa aktarımı
export { MODEL_CATALOG } from './catalog.js?v=57';
export { assetManager, ASSET_MANIFEST };

class App {
  constructor() {
    this.container = document.getElementById('canvas-container');

    // Scene & Renderer
    this.scene = new THREE.Scene();
    // near: 0.5 ile derinlik tamponu hassasiyeti artırıldı (Z-fighting önleme)
    this.camera = new THREE.PerspectiveCamera(48, window.innerWidth / window.innerHeight, 0.5, 2000);
    // Kamera başlangıçta doğrudan Grove Street sokak seviyesinde CJ'in arkasında başlasın
    this.camera.position.set(-12, 2.1, 24.4);
    this.camera.lookAt(-12, 1.4, 20);

    // logarithmicDepthBuffer: true ile uzak mesafelerde Z-fighting ve titreme kesin olarak önlenir
    // alpha: false -> Tarayıcı DOM harmanlamasını kapatır, doğrudan donanım arka tamponuna (backbuffer) yazar (+%25 doluluk/fill-rate)
    // precision: 'highp' -> PBR shader ve dielektrik kaporta için 32-bit float hassasiyeti
    // stencil: false -> Kullanılmayan 8-bit stencil tamponunu kapatarak VRAM ve bellek bant genişliği tasarrufu sağlar
    this.renderer = new THREE.WebGLRenderer({
      antialias: true,
      powerPreference: 'high-performance',
      precision: 'highp',
      alpha: false,
      stencil: false,
      depth: true,
      logarithmicDepthBuffer: true,
      failIfMajorPerformanceCaveat: false
    });
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.02;
    this.renderer.domElement.style.filter = 'saturate(0.95) sepia(0.05)';
    this.renderer.domElement.style.transform = 'translateZ(0)';
    this.renderer.domElement.style.willChange = 'transform';
    this.renderer.setClearColor(0xe6d7b0, 1.0);
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    this.container.appendChild(this.renderer.domElement);

    // Donanım GPU Teşhisi ve Telemetri
    this.detectHardwareGPU();

    // Clock
    this.clock = new THREE.Clock();

    // Audio Manager
    this.audioManager = new AudioManager();

    // Merkezi Collision & Spatial Query Manager
    this.collisionManager = new CollisionManager(20);

    // Fixed Timestep Accumulator Parametreleri (Fizik / Render Ayrımı)
    this.fixedDelta = 1 / 60; // 60 Hz sabit fizik adımı
    this.accumulator = 0;
    this.maxSubSteps = 4; // Spiral of death engelleme

    // Managers
    this.characterManager = new CharacterManager(this.scene, this.camera, this.renderer.domElement, this.audioManager, null, this.collisionManager);
    this.vehicleManager = new VehicleManager(this.scene, this.camera, this.renderer.domElement, this.audioManager, this.characterManager, this.collisionManager);
    this.cameraManager = new CameraManager(this.camera, this.renderer.domElement, this.scene, this.audioManager, this.characterManager, this.vehicleManager, this.collisionManager);
    this.uiManager = new UIManager(this);

    // House groups & state
    this.houseGroups = {};
    this.houseStats = {};
    this.roofNodesByHouse = {};
    this.isRoofVisible = true;
    this.activeModelKey = 'american';

    this.catalog = MODEL_CATALOG;
    this.models = Object.fromEntries(MODEL_CATALOG.map(m => [m.id, m.url]));

    // Raycaster for interactive house selection in 3D
    this.raycaster = new THREE.Raycaster();
    this.mouse = new THREE.Vector2();

    // Loaders setup
    this.setupLoaders();

    // Environment, Lighting & City Builder
    this.setupEnvironment();
    this.setupLights();
    // 1. Zemin ve Şehir Orkestratörü (TerrainManager & CityManager)
    this.cityManager = new CityManager(this.scene, this.gltfLoader);
    this.terrainManager = this.cityManager.terrainManager;
    this.collisionManager.init(this.scene, this.terrainManager);
    if (this.characterManager) {
      this.characterManager.terrain = this.terrainManager;
      this.characterManager.collisionManager = this.collisionManager;
      this.characterManager.vehicleManager = this.vehicleManager;
    }
    if (this.vehicleManager) {
      this.vehicleManager.setTerrainManager(this.terrainManager);
      this.vehicleManager.setCollisionManager(this.collisionManager);
    }

    // 2. Yol Ağı Grafı (RoadGraph) - AI & Navigasyon Topolojisi
    this.roadGraph = new RoadGraph();
    this.roadGraph.buildFromGrid(this.terrainManager);

    // 2.1 Kaldırım Ağı Grafı (SidewalkGraph) - Yaya & Geçit Topolojisi
    this.sidewalkGraph = new SidewalkGraph();
    this.sidewalkGraph.build(this.terrainManager);

    // 3. Virajlı Çevre Yolu (Mulholland Scenic Ring) - Yol Meshi & Graf Entegrasyonu
    this.curvedRoadBuilder = this.cityManager.buildCurvedRoad(this.roadGraph);

    // 4. NPC Trafik Yöneticisi (TrafficManager) - Kinematik Sürüş & Araç Havuzu
    this.trafficManager = new TrafficManager(this.scene, this.roadGraph, this.terrainManager, this.vehicleManager?.carTemplateScene);
    if (this.vehicleManager) {
      this.vehicleManager.trafficManager = this.trafficManager;
    }

    this.pedestrianManager = new PedestrianManager(this.scene, this.sidewalkGraph, this.terrainManager, this.assetManager);
    this.gangWarManager = gangWarManager;
    window.gangWarManager = gangWarManager;
    window.triggerGangWar = (wave = 1) => {
      const focus = this.characterManager?.position || new THREE.Vector3(-60, 0, -40);
      const zone = gangTerritoryManager.getZoneAt(focus.x, focus.z) || gangTerritoryManager.zones[1];
      gangWarManager.provokeWar(zone, focus);
      if (wave > 1) {
        setTimeout(() => gangWarManager.startWave(wave), 2700);
      }
      console.log(`💥 [DEBUG] Çete savaşı manuel tetiklendi! Bölge: ${zone.name}, Dalga: ${wave}`);
    };

    // 5. Gelişmiş Teşhis & Debug Sistemi (RoadDebugManager - 'G' Tuşu, PedestrianDebugManager - 'H' Tuşu)
    this.debugManager = new DebugManager(
      this.scene,
      this.roadGraph,
      this.trafficManager,
      this.renderer,
      this.curvedRoadBuilder,
      this.collisionManager,
      this.sidewalkGraph,
      this.pedestrianManager
    );
    this.roadDebug = this.debugManager.roadDebug;
    this.pedestrianDebug = this.debugManager.pedestrianDebug;

    this.setupAtmosphereParticles();

    // 6. Performans Yöneticisi & Profiler (P8)
    profiler.renderer = this.renderer;
    this.profiler = profiler;

    // 7. Mekânsal Sektörleme & Frustum/Mesafe Culling (SpatialChunkManager - P8)
    this.spatialChunkManager = new SpatialChunkManager(this.scene, {
      chunkSize: 75,
      cullDistance: 240,
      lodDistance: 120,
      innerCoreRadius: 90,
      frustumMargin: 35,
      hideDelay: 1.2
    });

    if (this.cityManager?.gtaHouses) {
      this.cityManager.gtaHouses.forEach(h => {
        if (h.object && h.plot) {
          this.spatialChunkManager.registerObject(h.object, new THREE.Vector3(h.plot.x, 0, h.plot.z));
        }
      });
    }

    // 8. Gameplay Katmanı (P9)
    this.gameState = gameState;
    this.saveManager = saveManager;
    this.wantedManager = wantedManager;
    this.policeManager = new PoliceManager(this.scene, this.collisionManager);
    if (this.vehicleManager) {
      this.vehicleManager.policeManager = this.policeManager;
    }
    window.policeManager = this.policeManager;
    window.setWantedStars = (stars) => {
      this.wantedManager.stars = stars;
      this.wantedManager.heat = this.wantedManager.thresholds[stars] || 100;
      this.wantedManager.syncState();
      console.log(`⭐ [DEBUG] Aranma seviyesi ayarlandı: ${stars} Yıldız (Heat: ${this.wantedManager.heat})`);
    };
    window.spawnRoadblockAhead = (dist = 40.0) => {
      const v = this.vehicleManager?.activeVehicle;
      const pos = v ? v.position : (this.characterManager?.position || new THREE.Vector3());
      const heading = v ? v.heading : (this.characterManager?.mesh?.rotation.y || 0);
      const rb = this.policeManager.roadblockManager.spawnAheadOfPlayer(pos, heading, dist);
      console.log(`🚧 [DEBUG] Oyuncunun önüne barikat ve çivi tuzağı kuruldu! Mesafe: ${dist}m`, rb);
    };
    window.repairVehicleTires = () => {
      const v = this.vehicleManager?.activeVehicle;
      if (v) {
        v.repairTires();
        console.log(`🔧 [DEBUG] Araç lastikleri onarıldı.`);
      }
    };
    this.radioManager = radioManager;
    window.radioManager = this.radioManager;
    window.nextRadioStation = () => this.radioManager?.nextStation();
    window.prevRadioStation = () => this.radioManager?.prevStation();
    window.setRadioStation = (id) => this.radioManager?.setStation(id);
    window.toggleRadio = () => this.radioManager?.toggle();
    this.missionManager = new MissionManager(this.scene);
    this.weatherManager = new WeatherManager(this.scene, this.skyManager, this);
    this.pickupManager = new PickupManager(this.scene);
    window.pickupManager = this.pickupManager;

    // ADIM 17: Pay 'n' Spray Garajı
    this.payNSprayManager = new PayNSprayManager(this.scene, this);
    window.payNSprayManager = this.payNSprayManager;
    window.teleportToPayNSpray = () => this.payNSprayManager?.teleportToEntrance();
    window.triggerPayNSpray = () => this.payNSprayManager?.triggerSprayDirectly();

    // ADIM 1: Acil Servis Yan Görevleri (Paramedic & Firefighter FSM)
    this.paramedicMission = new ParamedicMissionManager(this.scene, this.camera, this.vehicleManager, this.characterManager, this.uiManager);
    this.firefighterMission = new FirefighterMissionManager(this.scene, this.camera, this.vehicleManager, this.characterManager, this.uiManager);
    window.paramedicMission = this.paramedicMission;
    window.firefighterMission = this.firefighterMission;
    window.startParamedicMission = (lvl = 1) => this.paramedicMission?.startMission(lvl);
    window.startFirefighterMission = (lvl = 1) => this.firefighterMission?.startMission(lvl);
    window.teleportToHospital = () => {
      const v = this.vehicleManager?.activeVehicle;
      const target = new THREE.Vector3(38.0, 0.08, -32.0);
      if (v) {
        v.position.copy(target);
        v.velocity.set(0, 0, 0);
        v.speed = 0;
        v.vForward = 0;
      } else if (this.characterManager) {
        this.characterManager.position.copy(target);
      }
      console.log('🏥 [DEBUG] Los Santos County Hospital Acil Kapısına ışınlanıldı!');
    };
    window.teleportToActiveEmergencyTarget = () => {
      let targetPos = null;
      if (this.paramedicMission?.isActive && this.paramedicMission.patients.length > 0) {
        const p = this.paramedicMission.patients.find(pt => pt.state !== 'BOARDED');
        if (p) targetPos = p.position;
      } else if (this.firefighterMission?.isActive && this.firefighterMission.fires.length > 0) {
        const f = this.firefighterMission.fires.find(ft => !ft.isExtinguished);
        if (f) targetPos = f.position;
      }
      if (targetPos) {
        const v = this.vehicleManager?.activeVehicle;
        const tpPos = targetPos.clone().add(new THREE.Vector3(3, 0, 3));
        if (v) {
          v.position.copy(tpPos);
          v.velocity.set(0, 0, 0);
          v.speed = 0;
          v.vForward = 0;
        } else if (this.characterManager) {
          this.characterManager.position.copy(tpPos);
        }
        console.log('🎯 [DEBUG] Aktif acil servis hedefine ışınlanıldı:', tpPos);
      } else {
        console.warn('Aktif acil servis hedefi bulunamadı.');
      }
    };

    window.selectWeaponSlot = (idx) => this.characterManager?.selectSlot(idx);
    window.addPlayerAmmo = (amt) => {
      if (this.characterManager) {
        this.characterManager.ammo += amt;
        this.gameState.addAmmo(amt);
        console.log(`📦 [DEBUG] Cephane eklendi (+${amt}). Toplam: ${this.characterManager.ammo}`);
      }
    };
    this._lastIsDriving = false;

    // Kayıtlı oyun varsa yükle
    if (this.saveManager.hasSave()) {
      this.saveManager.load();
    }

    // Klavye kısayolları (Radyo: R / Shift+R, Kaydet: K, Yükle: L, Görev Telefonu: E)
    window.addEventListener('keydown', (e) => {
      const key = e.key.toLowerCase();
      if (key === 'r') {
        if (this.vehicleManager?.isDriving) {
          if (e.shiftKey) {
            this.radioManager.prevStation();
          } else {
            this.radioManager.nextStation();
          }
        }
      } else if (key === 'k') {
        this.saveManager.save();
      } else if (key === 'l') {
        this.saveManager.load();
      } else if (key === 'e') {
        if (this.missionManager && this.missionManager.state === 'IDLE') {
          const pPos = this.characterManager?.getPosition();
          if (pPos && pPos.distanceTo(this.missionManager.payphonePos) <= 3.8) {
            this.missionManager.answerPhone();
          }
        }
      }
    });

    // Event listeners
    window.addEventListener('resize', () => this.onResize());
    this.setupRaycasting();

    // Set initial daytime lighting
    this.setTimeOfDay('day');

    // Build the city world and load all 10 houses
    this.loadCityWorld();

    // Start render loop
    this.animate();
  }

  setupLoaders() {
    this.assetManager = assetManager;
    this.assetManager.init({
      renderer: this.renderer,
      onProgress: (url, loaded, total, percent) => {
        const fileName = url ? url.split('/').pop().split('?')[0] : '';
        if (this.uiManager && this.uiManager.updateLoading) {
          this.uiManager.updateLoading(percent, `Varlık yükleniyor: ${fileName} (%${percent})`);
        }
      }
    });

    // Geriye dönük uyumluluk referansları
    this.dracoLoader = this.assetManager.dracoLoader;
    this.ktx2Loader = this.assetManager.ktx2Loader;
    this.gltfLoader = this.assetManager.gltfLoader;
  }

  setupEnvironment() {
    this.scene.background = null; // Gerçekçi Sky shader'ın görünmesini sağla
    this.skyManager = new SkyManager(this.scene);
    this.scene.fog = new THREE.FogExp2(0xe6d7b0, 0.0022);

    // Gerçekçi PBR Araç ve Metal Yansımaları
    const pmremGenerator = new THREE.PMREMGenerator(this.renderer);
    pmremGenerator.compileEquirectangularShader();
    const roomEnv = new RoomEnvironment();
    this.scene.environment = pmremGenerator.fromScene(roomEnv, 0.04).texture;
    roomEnv.dispose();
    pmremGenerator.dispose();
  }

  setupLights() {
    // Main directional sunlight covering the active player area
    this.sunLight = new THREE.DirectionalLight(0xffeecb, 1.45);
    this.sunLightOffset = new THREE.Vector3(45, 75, 45);
    this.sunLight.position.copy(this.sunLightOffset);
    this.sunLight.castShadow = true;
    this.sunLight.shadow.mapSize.width = 2048;
    this.sunLight.shadow.mapSize.height = 2048;
    this.sunLight.shadow.camera.near = 10;
    this.sunLight.shadow.camera.far = 200;
    this.sunLight.shadow.bias = -0.00015;
    this.sunLight.shadow.normalBias = 0.02;

    // Narrowed shadow frustum covering the local gameplay area (~72m x 72m)
    const d = 36;
    this.sunLight.shadow.camera.left = -d;
    this.sunLight.shadow.camera.right = d;
    this.sunLight.shadow.camera.top = d;
    this.sunLight.shadow.camera.bottom = -d;
    this.scene.add(this.sunLight);
    this.scene.add(this.sunLight.target);

    // Hemisphere light for sky and ground bounce (GTA San Andreas turkuaz gök & sarı-kahve zemin)
    this.hemiLight = new THREE.HemisphereLight(0x9ed4e8, 0x8c7a52, 0.80);
    this.scene.add(this.hemiLight);

    // Interior lights group
    this.interiorLights = new THREE.Group();
    const light1 = new THREE.PointLight('#ffb347', 1.4, 30, 1.2);
    light1.position.set(0, 3.5, -56);
    this.interiorLights.add(light1);
    this.scene.add(this.interiorLights);
  }

  setupAtmosphereParticles() {
    // Berrak atmosfer için yapay noktacıklar devre dışı
    return;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      positions[i * 3 + 0] = (Math.random() - 0.5) * 180;
      positions[i * 3 + 1] = Math.random() * 26 + 1.0;
      positions[i * 3 + 2] = (Math.random() - 0.5) * 200 + 20;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
      color: 0x9be8ff,
      size: 0.22,
      transparent: true,
      opacity: 0.35,
      blending: THREE.AdditiveBlending
    });

    this.particles = new THREE.Points(geometry, material);
    this.scene.add(this.particles);
  }

  setupRaycasting() {
    // Evlere tıklayarak odak değiştirme devre dışı bırakıldı: Tüm deneyim ve kamera karaktere sabitlidir.
    return;
  }

  async loadCityWorld() {
    this.uiManager.showLoading('GTA San Andreas Dünyası Hazırlanıyor...', 50);

    // GTA evlerini listeye ekle
    if (this.cityManager?.gtaHouses) {
      this.cityManager.gtaHouses.forEach(h => {
        this.houseGroups[h.id] = h.object;
      });
    }

    // Karakter moduna geç
    this.cameraManager.setMode('roam');

    // Gerçekçi GTA sokak karakterini yükle
    if (this.characterManager) {
      this.characterManager.load(() => {
        this.cameraManager.setMode('roam');
      });
    }

    this.uiManager.updateLoading(100, 'GTA San Andreas Hazır!');
    this.uiManager.setLoadingReady();
  }


  loadSingleHouse(key, parcel, url) {
    return new Promise((resolve, reject) => {
      this.assetManager.loadGLTF(url).then(({ scene }) => {
        const model = scene;
        model.userData.houseId = key;

          // 1. For american_house: Discard embedded site terrain (Plane.012), asphalt roads, curbs, playgrounds
          if (key === 'american') {
            const discardExact = new Set([
              'low', 'line001', 'plane', 'plane.012', 
              'rectangle009', 'rectangle009.001', 
              'rectangle2106771930', 'rectangle2106771853.001'
            ]);
            const toRemove = [];
            model.traverse((child) => {
              const lowerName = (child.name || '').toLowerCase();
              if (discardExact.has(lowerName)) {
                toRemove.push(child);
              }
            });
            toRemove.forEach(obj => {
              if (obj.parent) obj.parent.remove(obj);
            });
          }

          // 2. For family_home: Discard embedded ground plane (ground_1)
          if (key === 'family_home') {
            const toRemove = [];
            model.traverse((child) => {
              const lowerName = (child.name || '').toLowerCase();
              if (lowerName.includes('ground')) {
                toRemove.push(child);
              }
            });
            toRemove.forEach(obj => {
              if (obj.parent) obj.parent.remove(obj);
            });
          }

          // 3. For pascal_house: Isolate ONLY the building complex node and discard site terrain
          if (key === 'pascal') {
            let buildingObj = null;
            model.traverse((child) => {
              if (child.name === 'building_hsiyeiygq29pkp0k') {
                buildingObj = child;
              }
            });
            if (buildingObj) {
              if (buildingObj.parent) buildingObj.parent.remove(buildingObj);
              model.clear();
              model.add(buildingObj);
            }
          }

          // Measure visible geometry to compute true architectural bounding box
          const box = new THREE.Box3();
          model.traverse((child) => {
            if (child.isMesh && child.visible) {
              box.expandByObject(child);
            }
          });
          if (box.isEmpty()) box.setFromObject(model);

          const size = new THREE.Vector3();
          box.getSize(size);

          // Calculate architectural scale factor based on real-world dimensions
          let scaleFactor = 1.0;
          if (parcel.scaleMode === 'height' && parcel.targetHeight) {
            scaleFactor = parcel.targetHeight / (size.y || 1);
          } else if (parcel.scaleMode === 'width' && parcel.targetWidth) {
            scaleFactor = parcel.targetWidth / (size.x || 1);
          } else if (parcel.scaleMode === 'pascal_complex' && parcel.targetUnitHeight) {
            scaleFactor = parcel.targetUnitHeight / (size.y || 1);
          } else if (parcel.targetScale) {
            const maxDim = Math.max(size.x, size.y, size.z);
            scaleFactor = parcel.targetScale / (maxDim || 1);
          }
          model.scale.setScalar(scaleFactor);

          // Recompute bounds of visible meshes after scaling
          const finalBox = new THREE.Box3();
          model.traverse((child) => {
            if (child.isMesh && child.visible) {
              finalBox.expandByObject(child);
            }
          });
          if (finalBox.isEmpty()) finalBox.setFromObject(model);

          const center = new THREE.Vector3();
          finalBox.getCenter(center);

          // Center mesh horizontally and firmly anchor base to ground (Y = 0)
          model.position.x = -center.x;
          model.position.z = -center.z;
          model.position.y = -finalBox.min.y;

          // Wrap in a positioning group
          const houseGroup = new THREE.Group();
          houseGroup.userData.houseId = key;
          houseGroup.add(model);

          // Position and orient on the designated parcel
          houseGroup.position.set(parcel.position[0], parcel.position[1], parcel.position[2]);
          houseGroup.rotation.set(parcel.rotation[0], parcel.rotation[1], parcel.rotation[2]);
          houseGroup.updateMatrixWorld(true);

          const groupWorldBox = new THREE.Box3().setFromObject(houseGroup);
          console.log(`[HOUSE_WORLD_BOUNDS] ${key}: worldY=[${groupWorldBox.min.y.toFixed(2)} .. ${groupWorldBox.max.y.toFixed(2)}]`);

          let meshCount = 0;
          let triCount = 0;
          const roofNodes = [];

          model.traverse((child) => {
            child.userData.houseId = key;

            if (child.name && (
              child.name.toLowerCase().includes('ceiling') ||
              child.name.toLowerCase().includes('roof')
            )) {
              roofNodes.push(child);
            }

            if (child.isMesh) {
              meshCount++;
              const nameLower = (child.name || '').toLowerCase();
              const isSmallDecor = nameLower.includes('antenna') || 
                                   nameLower.includes('fence') || 
                                   nameLower.includes('prop') || 
                                   nameLower.includes('leaf') || 
                                   nameLower.includes('grass') || 
                                   nameLower.includes('wire');
              child.castShadow = !isSmallDecor;
              child.receiveShadow = true;

              if (child.geometry) {
                const geom = child.geometry;
                if (geom.index) {
                  triCount += geom.index.count / 3;
                } else if (geom.attributes.position) {
                  triCount += geom.attributes.position.count / 3;
                }
              }

              if (child.material) {
                const mats = Array.isArray(child.material) ? child.material : [child.material];
                mats.forEach(mat => {
                  if (!mat) return;
                  mat.side = THREE.DoubleSide;
                  mat.envMapIntensity = 1.0;

                  const name = (mat.name || '').toLowerCase();
                  const isGlass = name.includes('glass') || name.includes('cam') || name.includes('window') || name.includes('pane');

                  if (!isGlass) {
                    mat.transparent = false;
                    mat.opacity = 1.0;
                    mat.depthWrite = true;
                  } else {
                    mat.transparent = true;
                    mat.depthWrite = true;
                  }

                  for (const mkey in mat) {
                    const tex = mat[mkey];
                    if (tex && (tex.isTexture || tex.channel !== undefined)) {
                      tex.channel = 0;
                      tex.needsUpdate = true;
                    }
                  }
                  mat.needsUpdate = true;
                });

                if (child.geometry && child.geometry.attributes.uv) {
                  if (!child.geometry.attributes.uv1) {
                    child.geometry.setAttribute('uv1', child.geometry.attributes.uv);
                  }
                  if (!child.geometry.attributes.uv2) {
                    child.geometry.setAttribute('uv2', child.geometry.attributes.uv);
                  }
                }
              }
            }
          });

          this.houseGroups[key] = houseGroup;
          this.roofNodesByHouse[key] = roofNodes;
          this.houseStats[key] = { meshes: meshCount, triangles: Math.round(triCount) };
          this.scene.add(houseGroup);

          resolve(houseGroup);
        }).catch((err) => {
          console.warn(`[App] loadSingleHouse hatası (${key}):`, err);
          reject(err);
        });
    });
  }

  focusHouse(key, animate = true) {
    let parcel = HOUSE_PARCELS[key];
    if (!parcel && this.houseGroups[key]) {
      const obj = this.houseGroups[key];
      const pos = obj.position;
      const rotY = obj.rotation.y || 0;
      // Evin baktığı yöne göre kamera ofseti
      const dist = 22;
      const camX = Math.sin(rotY) * dist;
      const camZ = Math.cos(rotY) * dist;
      parcel = {
        position: [pos.x, pos.y, pos.z],
        cameraOffset: [camX, 5.5, camZ],
        lookOffset: [0, 2.5, 0]
      };
    }
    if (!parcel) return;

    this.activeModelKey = key;
    this.uiManager.onModelSelected?.(key);

    const px = parcel.position[0];
    const py = parcel.position[1];
    const pz = parcel.position[2];

    const lookTarget = new THREE.Vector3(
      px + parcel.lookOffset[0],
      py + parcel.lookOffset[1],
      pz + parcel.lookOffset[2]
    );

    const camPos = new THREE.Vector3(
      px + parcel.cameraOffset[0],
      py + parcel.cameraOffset[1],
      pz + parcel.cameraOffset[2]
    );

    // Update orbit controls center
    this.cameraManager.setModelBounds(lookTarget, 20);

    if (animate) {
      this.cameraManager.animateTo(camPos, lookTarget, 1.2);
    } else {
      this.camera.position.copy(camPos);
      this.cameraManager.orbitControls.target.copy(lookTarget);
      this.cameraManager.orbitControls.update();
    }

    // Update HUD stats
    const stats = this.houseStats[key] || { meshes: 150, triangles: 45000 };
    this.uiManager.updateStats(stats);
  }

  nextModel() {
    const keys = this.catalog.map(m => m.id);
    const currentIndex = keys.indexOf(this.activeModelKey);
    const nextIndex = (currentIndex + 1) % keys.length;
    this.focusHouse(keys[nextIndex]);
  }

  prevModel() {
    const keys = this.catalog.map(m => m.id);
    const currentIndex = keys.indexOf(this.activeModelKey);
    const prevIndex = (currentIndex - 1 + keys.length) % keys.length;
    this.focusHouse(keys[prevIndex]);
  }

  loadModel(key) {
    this.focusHouse(key);
  }

  getModelInfo(modelKey) {
    return this.catalog.find(m => m.id === modelKey) || {
      id: modelKey,
      title: modelKey === 'custom' ? 'Özel 3D Model' : modelKey,
      category: 'Kullanıcı Modeli',
      icon: '📦',
      badge: 'Özel'
    };
  }

  toggleRoof() {
    this.isRoofVisible = !this.isRoofVisible;
    // Toggle roofs on active house or all houses
    Object.values(this.roofNodesByHouse).forEach(nodes => {
      nodes.forEach(n => {
        n.visible = this.isRoofVisible;
      });
    });
    return this.isRoofVisible;
  }

  setTimeOfDay(timeKey) {
    if (this.skyManager) {
      const sunPos = this.skyManager.setLightingMode(timeKey);
      if (sunPos && timeKey !== 'night') {
        this.sunLight.position.copy(sunPos).multiplyScalar(120);
      }
    }

    if (timeKey === 'day') {
      this.scene.fog.color.set(0xe6d7b0);
      this.scene.fog.density = 0.0022;

      this.sunLight.color.set(0xffeecb);
      this.sunLight.intensity = 1.45;

      this.hemiLight.color.set(0x9ed4e8);
      this.hemiLight.groundColor.set(0x8c7a52);
      this.hemiLight.intensity = 0.80;
    } else if (timeKey === 'sunset') {
      this.scene.fog.color.set('#e5885e');
      this.scene.fog.density = 0.0022;

      this.sunLight.color.set('#ff6122');
      this.sunLight.intensity = 1.65;

      this.hemiLight.color.set('#ffb088');
      this.hemiLight.groundColor.set('#4a221d');
      this.hemiLight.intensity = 0.75;
    } else if (timeKey === 'night') {
      this.scene.fog.color.set('#0e1524');
      this.scene.fog.density = 0.0035;

      this.sunLight.color.set('#527799');
      this.sunLight.intensity = 0.25;
      this.sunLight.position.set(-35, 55, -35);

      this.hemiLight.color.set('#16253c');
      this.hemiLight.groundColor.set('#0c160e');
      this.hemiLight.intensity = 0.30;
    }

    if (this.cityManager) {
      this.cityManager.setLightingMode(timeKey);
    }
  }

  loadFromFile(file) {
    if (!file) return;
    this.uiManager.showLoading(`Yerel Model Yükleniyor: ${file.name}...`, 30);
    const reader = new FileReader();
    reader.onload = (e) => {
      this.gltfLoader.parse(
        e.target.result,
        '',
        (gltf) => {
          const model = gltf.scene;
          model.position.set(0, 0, 0);
          this.scene.add(model);
          this.uiManager.hideLoading();
          this.cameraManager.setModelBounds(new THREE.Vector3(0, 3, 0), 22);
          this.cameraManager.setPreset('front');
        },
        (err) => {
          console.error(err);
          this.uiManager.showLoading('Ayrıştırma hatası.', 100);
        }
      );
    };
    reader.readAsArrayBuffer(file);
  }

  onResize() {
    this.camera.aspect = window.innerWidth / window.innerHeight;
    this.camera.updateProjectionMatrix();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  }

  detectHardwareGPU() {
    try {
      const gl = this.renderer.getContext();
      const dbgRenderInfo = gl.getExtension('WEBGL_debug_renderer_info');
      let unmaskedRenderer = 'WebGL Donanım Hızlandırıcı';
      let unmaskedVendor = 'Bilinmeyen Üretici';

      if (dbgRenderInfo) {
        unmaskedRenderer = gl.getParameter(dbgRenderInfo.UNMASKED_RENDERER_WEBGL) || unmaskedRenderer;
        unmaskedVendor = gl.getParameter(dbgRenderInfo.UNMASKED_VENDOR_WEBGL) || unmaskedVendor;
      }

      // Model adını sadeleştir (Örn: "ANGLE (NVIDIA, NVIDIA GeForce RTX 3060 Direct3D11 vs_5_0 ps_5_0, D3D11)" -> "NVIDIA GeForce RTX 3060")
      let cleanGpuName = unmaskedRenderer;
      const rtxMatch = unmaskedRenderer.match(/(NVIDIA\s+GeForce\s+[^,)]+|RTX\s+[^,)]+|GTX\s+[^,)]+|AMD\s+Radeon\s+[^,)]+|Apple\s+M\d[^,)]*|Intel\s+[^,)]+)/i);
      if (rtxMatch) {
        cleanGpuName = rtxMatch[0];
      } else {
        cleanGpuName = cleanGpuName.replace(/ANGLE\s*\((.*)\)/, '$1').split(',')[0].trim();
      }

      const isDedicated = /nvidia|geforce|rtx|gtx|radeon|amd/i.test(unmaskedRenderer);

      window.gpuDiagnostics = {
        vendor: unmaskedVendor,
        renderer: unmaskedRenderer,
        cleanGpuName,
        isDedicated
      };

      console.log(`%c[GPU Telemetri] %c${cleanGpuName} (Harici: ${isDedicated ? 'Evet' : 'Hayır'})`, 'color:#f0b323;font-weight:bold;font-size:12px;', 'color:#38bdf8;font-size:12px;');
    } catch (e) {
      window.gpuDiagnostics = {
        vendor: 'Standard WebGL',
        renderer: 'Hardware Accelerated',
        cleanGpuName: 'GPU',
        isDedicated: true
      };
    }
  }

  /**
   * Deterministik Sabit Fizik & Simülasyon Adımı (Fixed Timestep)
   * Ekran Hz değerinden bağımsız 60Hz sabit hızda koşar.
   */
  fixedUpdate(fixedDelta, focusPos) {
    if (this.profiler) this.profiler.beginPhysics();

    // 1. Karakter fiziği ve hareketi
    if (this.characterManager) {
      this.characterManager.update(fixedDelta);
    }

    // 2. Oyuncu araç fiziği
    if (this.vehicleManager) {
      this.vehicleManager.update(fixedDelta);
    }

    if (this.profiler) this.profiler.endPhysics();

    if (this.profiler) this.profiler.beginUpdate();

    // 3. Yaya / NPC simülasyonu adımı
    const simFocus = focusPos || (this.camera ? this.camera.position : null);
    if (simFocus) {
      gangTerritoryManager.update(simFocus);
      gangWarManager.update(fixedDelta, simFocus);
    }
    if (this.pedestrianManager && simFocus) {
      // Araç korna çaldığında yayalar irkilip kaçsın
      if (this.vehicleManager?.isDriving && this.vehicleManager?.keys?.horn && this.vehicleManager?.activeVehicle) {
        this.pedestrianManager.onVehicleHorn(this.vehicleManager.activeVehicle.position, 28);
      }

      this.pedestrianManager.update(
        fixedDelta,
        simFocus,
        this.vehicleManager?.activeVehicle,
        this.trafficManager?.npcs
      );
    }

    // 4. Trafik simülasyonu adımı
    if (this.trafficManager && simFocus) {
      if (this.vehicleManager?.isModelLoaded && (!this.trafficManager.templatePool || this.trafficManager.templatePool.length === 0)) {
        const pool = [];
        if (this.vehicleManager.toyotaTemplateScene) {
          pool.push({
            scene: this.vehicleManager.toyotaTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'suv',
            name: 'Toyota bZ4X'
          });
        }
        if (this.vehicleManager.giuliaTemplateScene) {
          pool.push({
            scene: this.vehicleManager.giuliaTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'classic',
            name: 'Alfa Romeo Giulia GTA (1965)'
          });
        }
        if (this.vehicleManager.spiderTemplateScene) {
          pool.push({
            scene: this.vehicleManager.spiderTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'convertible',
            name: 'Alfa Spider Quadrifoglio (1986)'
          });
        }
        if (this.vehicleManager.mercTemplateScene) {
          pool.push({
            scene: this.vehicleManager.mercTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'sedan',
            name: 'Mercedes-Benz E50 AMG'
          });
        }
        if (this.vehicleManager.bmwTemplateScene) {
          pool.push({
            scene: this.vehicleManager.bmwTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'sedan',
            name: 'BMW Vision'
          });
        }
        if (this.vehicleManager.suvTemplateScene) {
          pool.push({
            scene: this.vehicleManager.suvTemplateScene,
            options: { scale: 1.0, rotationY: Math.PI },
            type: 'suv',
            name: 'Los Santos SUV'
          });
        }
        if (pool.length > 0) {
          this.trafficManager.setTemplatePool(pool);
        } else if (this.vehicleManager.carTemplateScene) {
          this.trafficManager.setTemplateScene(this.vehicleManager.carTemplateScene, {
            scale: 1.0,
            rotationY: Math.PI,
            vehicleType: 'gtr',
            vehicleName: 'Nissan GT-R'
          });
        }
      }
      const pedObstacles = this.pedestrianManager ? this.pedestrianManager.getObstacles() : null;
      this.trafficManager.update(fixedDelta, simFocus, this.vehicleManager?.activeVehicle, pedObstacles, this.camera);
    }

    // 5. GTA Gameplay Katmanı Güncellemesi (P9)
    const isDriving = !!(this.vehicleManager?.isDriving && this.vehicleManager?.activeVehicle);
    if (this._lastIsDriving !== isDriving) {
      this._lastIsDriving = isDriving;
      if (isDriving) {
        this.radioManager.playCurrentStation();
      } else {
        this.radioManager.stop();
      }
    }

    const playerPos = this.characterManager?.position || new THREE.Vector3();
    const playerSpeed = isDriving ? (this.vehicleManager?.activeVehicle?.speed || 0) : (this.characterManager?.speed || 0);

    // GameState senkronizasyonu
    this.gameState.state.player.position.x = playerPos.x;
    this.gameState.state.player.position.y = playerPos.y;
    this.gameState.state.player.position.z = playerPos.z;

    // Polis ve Wanted sistemi (ADIM 12)
    if (this.policeManager) {
      this.policeManager.update(fixedDelta, playerPos, Math.abs(playerSpeed), isDriving, this.vehicleManager?.activeVehicle);
    }

    // Görev ve Checkpoint sistemi
    if (this.missionManager) {
      this.missionManager.update(fixedDelta, playerPos, isDriving);
    }

    // Toplanabilir Dünya Öğeleri (Can, Zırh, Para, Cephane - ADIM 14)
    if (this.pickupManager) {
      this.pickupManager.update(fixedDelta, playerPos);
    }

    // Pay 'n' Spray Garajı (Araç Boyama, Tamir & Aranma Seviyesi Sıfırlama - ADIM 17)
    if (this.payNSprayManager) {
      this.payNSprayManager.update(fixedDelta, playerPos, this.vehicleManager?.activeVehicle);
    }

    // Dinamik Hava Durumu ve Gündüz/Gece Zaman Akışı
    if (this.weatherManager) {
      this.weatherManager.update(fixedDelta);
    }

    // ADIM 1: Acil Servis Yan Görevleri (Paramedic & Firefighter FSM)
    if (this.paramedicMission) {
      this.paramedicMission.update(fixedDelta);
    }
    if (this.firefighterMission) {
      this.firefighterMission.update(fixedDelta);
    }

    // Otomatik Kayıt
    if (this.saveManager) {
      this.saveManager.update(fixedDelta);
    }

    if (this.profiler) this.profiler.endUpdate();
  }

  animate() {
    requestAnimationFrame(() => this.animate());

    const rawDelta = Math.min(this.clock.getDelta(), 0.1);
    this.accumulator += rawDelta;

    // Odak pozisyonu (Gölge ve trafik optimizasyonu için)
    let focusPos = null;
    if (this.vehicleManager?.isDriving && this.vehicleManager?.activeVehicle) {
      focusPos = this.vehicleManager.activeVehicle.position;
    } else if (this.characterManager?.position) {
      focusPos = this.characterManager.position;
    }

    // --- Sabit Zaman Adımı Döngüsü (Fixed Timestep Accumulator) ---
    let subSteps = 0;
    while (this.accumulator >= this.fixedDelta && subSteps < this.maxSubSteps) {
      this.fixedUpdate(this.fixedDelta, focusPos);
      this.accumulator -= this.fixedDelta;
      subSteps++;
    }
    if (subSteps >= this.maxSubSteps) {
      this.accumulator = 0; // Aşırı frame düşüşünde spiral of death önlenir
    }

    // Sektörel Görünürlük & Frustum Culling Güncellemesi (P8)
    if (this.spatialChunkManager && focusPos && this.camera) {
      this.spatialChunkManager.update(this.camera, focusPos, rawDelta);
    }

    // Update shadow camera position following player / active vehicle
    if (focusPos && this.sunLight && this.sunLightOffset) {
      this.sunLight.target.position.set(focusPos.x, focusPos.y, focusPos.z);
      this.sunLight.position.set(
        focusPos.x + this.sunLightOffset.x,
        focusPos.y + this.sunLightOffset.y,
        focusPos.z + this.sunLightOffset.z
      );
      this.sunLight.target.updateMatrixWorld();
    }

    // Update camera manager (Frame delta ile yumuşak kamera ve occlusion)
    this.cameraManager.update(rawDelta);

    // Update GTA HUD & Radar
    if (this.uiManager?.updateGTA) {
      this.uiManager.updateGTA(this.characterManager, this.camera);
    }

    // Update debug visualizer (G / B aktif değilse erken döner, 0 GC yükü)
    if (this.debugManager) {
      this.debugManager.update();
    }

    // Animate drifting realistic clouds & atmospheric sun
    if (this.skyManager) {
      this.skyManager.update(rawDelta, this.camera ? this.camera.position : null);
    }

    // Animate atmospheric motes
    if (this.particles) {
      this.particles.rotation.y += rawDelta * 0.015;
    }

    // Render scene
    if (this.profiler) this.profiler.beginRender();
    this.renderer.render(this.scene, this.camera);
    if (this.profiler) this.profiler.endRender();

    // Update Profiler & Performance HUD (P8)
    if (this.profiler) {
      const activePedCount = this.pedestrianManager ? this.pedestrianManager.pool.filter(p => p.isActive).length : 0;
      const activeTrafficCount = this.trafficManager ? this.trafficManager.npcs.length : 0;
      this.profiler.updateMetrics(activePedCount, activeTrafficCount);
    }

    // Update FPS & debug metrics counter (500ms throttle)
    this.uiManager.updateFPS(this.renderer);
  }
}

// Start application on DOM loaded
window.addEventListener('DOMContentLoaded', () => {
  window.app = new App();
});

// DEBUG-AUDIT-START
window.dumpCollisionAudit = function() {
  const app = window.app;
  if (!app) {
    console.error('[CollisionAudit] window.app nesnesi henüz başlatılmamış!');
    return;
  }

  const cm = app.collisionManager;
  if (!cm || !cm.allColliders) {
    console.error('[CollisionAudit] CollisionManager veya allColliders bulunamadı!');
    return;
  }

  const colliders = cm.allColliders;
  const visibleStructures = [];

  // 1. GLB Evleri Denetle (houseGroups üzerinden)
  if (app.houseGroups) {
    for (const [key, grp] of Object.entries(app.houseGroups)) {
      if (!key.startsWith('gta_') && grp && grp.isObject3D) {
        const box = new THREE.Box3().setFromObject(grp);
        const size = new THREE.Vector3();
        const center = new THREE.Vector3();
        box.getSize(size);
        box.getCenter(center);
        visibleStructures.push({
          name: `GLB_${key}`,
          type: 'GLB',
          position: grp.position.clone(),
          center,
          box,
          size
        });
      }
    }
  }

  // 2. Prosedürel Evleri Denetle (cityManager.gtaHouses)
  if (app.cityManager?.gtaHouses) {
    const builder = app.cityManager.gtaHouseBuilder;
    app.cityManager.gtaHouses.forEach((h) => {
      const p = h.plot;
      if (!p) return;

      let tempHouse = null;
      if (builder) {
        if (p.isIconicCJ || p.houseStyle === 'cj_style') {
          tempHouse = builder.buildCJHouse(p);
        } else if (p.isIconicRyder || p.houseStyle === 'ryder_style') {
          tempHouse = builder.buildRyderHouse(p);
        } else {
          tempHouse = builder.buildSweetHouse(p);
        }
        const rotY = builder.calculateFacingRotation(p);
        tempHouse.rotation.y = rotY;
        tempHouse.position.set(p.x, 0, p.z);
        tempHouse.updateMatrixWorld(true);
      }

      const box = new THREE.Box3();
      if (tempHouse) {
        tempHouse.traverse((child) => {
          if (child.isMesh && child.geometry) {
            // 22x22m zemin çim plane'ini hariç tutarak gerçek bina kütlesini ölç
            const isLawn = child.geometry.parameters && child.geometry.parameters.width >= 20;
            if (!isLawn) {
              box.expandByObject(child);
            }
          }
        });
        if (box.isEmpty()) box.setFromObject(tempHouse);

        // Geçici nesnelerin geometrilerini temizle (sıfır bellek sızıntısı)
        tempHouse.traverse((child) => {
          if (child.isMesh && child.geometry) child.geometry.dispose();
        });
      } else {
        box.set(
          new THREE.Vector3(p.x - 7.5, 0, p.z - 7.5),
          new THREE.Vector3(p.x + 7.5, 5.4, p.z + 7.5)
        );
      }

      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);

      visibleStructures.push({
        name: h.id,
        type: 'Procedural',
        position: new THREE.Vector3(p.x, 0, p.z),
        center,
        box,
        size
      });
    });
  }

  // --- TABLO 1: Her görünür yapı için en yakın collider analizi ---
  const table1Data = visibleStructures.map((struct) => {
    let closestCol = null;
    let minDist = Infinity;

    colliders.forEach((col) => {
      const dist = Math.hypot(struct.center.x - col.centerX, struct.center.z - col.centerZ);
      if (dist < minDist) {
        minDist = dist;
        closestCol = col;
      }
    });

    const colCenterStr = closestCol
      ? `(${closestCol.centerX.toFixed(1)}, ${((closestCol.minY + closestCol.maxY) * 0.5).toFixed(1)}, ${closestCol.centerZ.toFixed(1)})`
      : '-';
    const colSizeStr = closestCol
      ? `(${(closestCol.maxX - closestCol.minX).toFixed(1)}, ${(closestCol.maxY - closestCol.minY).toFixed(1)}, ${(closestCol.maxZ - closestCol.minZ).toFixed(1)})`
      : '-';

    return {
      'Yapı Adı': struct.name,
      'Tür': struct.type,
      'Sahne Konumu (X, Z)': `(${struct.position.x.toFixed(1)}, ${struct.position.z.toFixed(1)})`,
      'Box3 Boyutu (X, Z, Y)': `X:${struct.size.x.toFixed(2)} | Z:${struct.size.z.toFixed(2)} | Y:${struct.size.y.toFixed(2)}`,
      'En Yakın Collider': closestCol ? closestCol.id : 'YOK',
      'Collider Merkezi': colCenterStr,
      'Collider Boyutu': colSizeStr,
      'Merkezler Arası Mesafe': closestCol ? `${minDist.toFixed(2)} m` : '-'
    };
  });

  // --- TABLO 2: Her collider için 3m içinde görünür yapı analizi ---
  const table2Data = colliders.map((col) => {
    const colCenter = new THREE.Vector3(col.centerX, (col.minY + col.maxY) * 0.5, col.centerZ);
    const colSize = `${(col.maxX - col.minX).toFixed(1)} x ${(col.maxY - col.minY).toFixed(1)} x ${(col.maxZ - col.minZ).toFixed(1)}`;

    let closestStruct = null;
    let minDist = Infinity;

    visibleStructures.forEach((struct) => {
      const dist = Math.hypot(col.centerX - struct.center.x, col.centerZ - struct.center.z);
      if (dist < minDist) {
        minDist = dist;
        closestStruct = struct;
      }
    });

    const hasVisibleNear = minDist <= 3.0;

    return {
      'Collider ID': col.id,
      'Collider Katmanı': col.layer,
      'Merkez (X, Y, Z)': `(${colCenter.x.toFixed(1)}, ${colCenter.y.toFixed(1)}, ${colCenter.z.toFixed(1)})`,
      'Boyut (W x H x D)': colSize,
      '3m İçinde Görünür Yapı': hasVisibleNear
        ? `Var: ${closestStruct.name} (${minDist.toFixed(2)} m)`
        : `GÖRÜNMEZ DUVAR ADAYI (${minDist === Infinity ? '-' : minDist.toFixed(2) + ' m'})`
    };
  });

  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#38bdf8;font-weight:bold;');
  console.log('%c🔍 BİNA ÇARPIŞMA DENETİMİ (COLLISION AUDIT) - TABLO 1: GÖRÜNÜR YAPILAR', 'color:#38bdf8;font-weight:bold;font-size:13px;');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#38bdf8;font-weight:bold;');
  console.table(table1Data);

  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#fbbf24;font-weight:bold;');
  console.log('%c🔍 BİNA ÇARPIŞMA DENETİMİ (COLLISION AUDIT) - TABLO 2: COLLIDER ANALİZİ', 'color:#fbbf24;font-weight:bold;font-size:13px;');
  console.log('%c═══════════════════════════════════════════════════════════════', 'color:#fbbf24;font-weight:bold;');
  console.table(table2Data);

  console.log(`[CollisionAudit] Toplam Görünür Yapı: ${visibleStructures.length}, Toplam Collider: ${colliders.length}`);
};
// DEBUG-AUDIT-END
