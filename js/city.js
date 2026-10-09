import * as THREE from 'three';
import { createCityMaterials } from './cityMaterials.js?v=67';
import { RoadNetworkBuilder } from './roads.js?v=67';
import { GTAHouseBuilder } from './gtaHouses.js?v=73';
import { TerrainManager } from './terrain.js';
import { CurvedRoadBuilder } from './curvedRoad.js';

// Geriye dönük tam uyumluluk için parsel tanımlarını dışa aktar
export { HOUSE_PARCELS, PARCEL_PLOTS } from './parcels.js';

/**
 * CityManager - Şehir Orkestratörü
 * Yol ağı, zemin, boş parseller, virajlı çevre yolu ve GTA San Andreas konutlarını yönetir.
 */
export class CityManager {
  constructor(scene, gltfLoader = null, terrainManager = null, roadGraph = null) {
    this.scene = scene;
    this.gltfLoader = gltfLoader;
    this.terrainManager = terrainManager;
    this.roadGraph = roadGraph;
    this.group = new THREE.Group();
    this.group.name = 'CityGroup';
    this.scene.add(this.group);

    this.streetLights = [];
    this.trees = [];
    this.curvedRoadBuilder = null;

    // 1. Fotogerçekçi ve Z-Fighting korumalı materyalleri hazırla
    this.materials = createCityMaterials();

    // 2. Doğal zemin / araziyi oluştur
    this.buildGround();

    // 3. Yol ağını ve kavşakları inşa et
    this.roadBuilder = new RoadNetworkBuilder(this.materials);
    this.roadBuilder.buildAll(this.group);

    // 4. Virajlı Çevre Yolu (Mulholland Scenic Ring) - RoadGraph varsa inşa et
    if (this.roadGraph) {
      this.buildCurvedRoad(this.roadGraph);
    }

    // 5. Boş parsel alanlarına GTA San Andreas Grove Street konutlarını yerleştir
    this.gtaHouseBuilder = new GTAHouseBuilder(this.gltfLoader);
    this.gtaHouses = this.gtaHouseBuilder.buildAllPlots(this.group);
  }

  buildGround() {
    if (!this.terrainManager) {
      this.terrainManager = new TerrainManager(this.group, this.materials);
    }
  }

  buildCurvedRoad(roadGraph) {
    if (roadGraph) this.roadGraph = roadGraph;
    if (!this.curvedRoadBuilder && this.roadGraph) {
      this.curvedRoadBuilder = new CurvedRoadBuilder(this.group, this.terrainManager, this.materials, this.roadGraph);
      this.curvedRoadBuilder.build();
    }
    return this.curvedRoadBuilder;
  }

  setLightingMode(timeKey) {
    // Sadece yol projesi modu - ışık mobilyası yok
  }
}
