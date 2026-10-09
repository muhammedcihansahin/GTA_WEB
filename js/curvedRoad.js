import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';

/**
 * CurvedRoadBuilder - Virajlı Çevre Yolu (Mulholland Scenic Ring Parkway)
 * - 90 derecelik ızgara dokusunu kırarak şehrin dışındaki tepelerden dolanır.
 * - CatmullRomCurve3 ile pürüzsüz virajlar ve arazi kotlarına tam oturan 3D geometri üretir.
 * - Asfalt, sarı orta çizgi, beyaz banket çizgileri ve bordürleri tekil birleşik mesh olarak çizer.
 * - RoadGraph'a çift şeritli yönlü düğümler ve kavşak bağlantıları ekler.
 */
export class CurvedRoadBuilder {
  constructor(parentGroupOrScene, terrainManager, materials, roadGraph) {
    this.parentGroup = parentGroupOrScene;
    this.scene = parentGroupOrScene; // Geriye dönük sahne uyumluluğu
    this.terrain = terrainManager;
    this.materials = materials;
    this.roadGraph = roadGraph;
    this.group = new THREE.Group();
    this.group.name = 'CurvedRoadGroup';
    if (this.parentGroup) {
      this.parentGroup.add(this.group);
    }
  }

  getElevationAt(x, z) {
    if (!this.terrain) return 0;
    if (typeof this.terrain.getHeightAt === 'function') {
      return this.terrain.getHeightAt(x, z);
    }
    if (typeof this.terrain.getElevation === 'function') {
      return this.terrain.getElevation(x, z);
    }
    return 0;
  }

  build() {
    // 1. Çevre yolu kontrol noktaları (Şehrin dış tepelerini saran tam halka)
    const controlPoints = [
      new THREE.Vector3(-135, 0, 135),    // Güneybatı şehir çıkışı
      new THREE.Vector3(-210, 0, 80),     // Batı tepeleri tırmanışı
      new THREE.Vector3(-245, 0, -35),    // Batı sırtı virajı
      new THREE.Vector3(-225, 0, -150),   // Kuzeybatı boğazı
      new THREE.Vector3(-120, 0, -235),   // Kuzey tepeleri seyir noktası (Scenic Overlook)
      new THREE.Vector3(0, 0, -250),      // Kuzey Ana Bulvarı üst geçit/kesişimi
      new THREE.Vector3(130, 0, -230),    // Kuzeydoğu kıvrımı
      new THREE.Vector3(225, 0, -130),    // Doğu tepeleri geçişi
      new THREE.Vector3(240, 0, 30),      // Doğu sırtı
      new THREE.Vector3(185, 0, 160),     // Güneydoğu inişi
      new THREE.Vector3(70, 0, 235),      // Güney çevre virajı
      new THREE.Vector3(-65, 0, 240)      // Güneybatıya dönüş
    ];

    // Kotları araziden al ve yol kalınlığı (+0.12m) ver
    controlPoints.forEach(p => {
      p.y = this.getElevationAt(p.x, p.z) + 0.12;
    });

    // Pürüzsüz kapalı spline eğrisi
    const curve = new THREE.CatmullRomCurve3(controlPoints, true, 'centripetal', 0.5);

    // 2. 3D Yol Geometrisini İnşa Et
    this.buildRoadMesh(curve);

    // 3. Yol Düğümlerini RoadGraph'a Bağla
    if (this.roadGraph) {
      this.integrateWithRoadGraph(curve);
    }

    return this.group;
  }

  buildRoadMesh(curve) {
    const numSamples = 160;
    const roadWidth = 11.0;
    const halfWidth = roadWidth / 2;

    const points = curve.getPoints(numSamples);

    // Asfalt, Çizgiler ve Bordürler için tepe dizileri
    const asphaltVertices = [];
    const asphaltUvs = [];
    const asphaltIndices = [];

    const yellowLineVertices = [];
    const yellowLineIndices = [];

    const whiteLineVertices = [];
    const whiteLineIndices = [];

    const curbVertices = [];
    const curbIndices = [];

    const up = new THREE.Vector3(0, 1, 0);

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      // Kotu araziye tam yapıştır (Z-fighting önleme: +0.12m)
      p.y = this.getElevationAt(p.x, p.z) + 0.12;

      // Teğet ve Yatay Dikme (Normal) Vektörü
      const t = i / (points.length - 1);
      const tangent = curve.getTangent(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      // Sol ve Sağ yol kenarları
      const leftP = p.clone().addScaledVector(normal, -halfWidth);
      const rightP = p.clone().addScaledVector(normal, halfWidth);

      // Arazideki yerel yüksekliklere göre kenar kotlarını da adapte et
      leftP.y = this.getElevationAt(leftP.x, leftP.z) + 0.12;
      rightP.y = this.getElevationAt(rightP.x, rightP.z) + 0.12;

      // --- 1. Asfalt Şeridi ---
      asphaltVertices.push(leftP.x, leftP.y, leftP.z);
      asphaltVertices.push(rightP.x, rightP.y, rightP.z);
      asphaltUvs.push(0, i * 0.4);
      asphaltUvs.push(1, i * 0.4);

      // --- 2. Sarı Orta Bölünme Çizgisi (Genişlik: 0.28m, Kot: +0.015m) ---
      const ylLeft = p.clone().addScaledVector(normal, -0.14);
      const ylRight = p.clone().addScaledVector(normal, 0.14);
      ylLeft.y += 0.015;
      ylRight.y += 0.015;
      yellowLineVertices.push(ylLeft.x, ylLeft.y, ylLeft.z);
      yellowLineVertices.push(ylRight.x, ylRight.y, ylRight.z);

      // --- 3. Beyaz Banket Çizgileri (Genişlik: 0.22m, Kot: +0.012m) ---
      // Sol banket
      const wlLeft1 = leftP.clone().addScaledVector(normal, 0.35);
      const wlLeft2 = leftP.clone().addScaledVector(normal, 0.57);
      wlLeft1.y += 0.012;
      wlLeft2.y += 0.012;
      // Sağ banket
      const wlRight1 = rightP.clone().addScaledVector(normal, -0.57);
      const wlRight2 = rightP.clone().addScaledVector(normal, -0.35);
      wlRight1.y += 0.012;
      wlRight2.y += 0.012;

      whiteLineVertices.push(wlLeft1.x, wlLeft1.y, wlLeft1.z, wlLeft2.x, wlLeft2.y, wlLeft2.z);
      whiteLineVertices.push(wlRight1.x, wlRight1.y, wlRight1.z, wlRight2.x, wlRight2.y, wlRight2.z);

      // --- 4. Bordür Taşları (Genişlik: 0.35m, Yükseklik: +0.10m) ---
      const curbLeftOuter = leftP.clone().addScaledVector(normal, -0.35);
      const curbRightOuter = rightP.clone().addScaledVector(normal, 0.35);
      curbLeftOuter.y += 0.10;
      curbRightOuter.y += 0.10;

      curbVertices.push(curbLeftOuter.x, curbLeftOuter.y, curbLeftOuter.z, leftP.x, leftP.y + 0.10, leftP.z);
      curbVertices.push(rightP.x, rightP.y + 0.10, rightP.z, curbRightOuter.x, curbRightOuter.y, curbRightOuter.z);

      // İndeksler (Dörtgenleri üçgenlere bölme)
      if (i < points.length - 1) {
        const base = i * 2;
        // Asfalt quad
        asphaltIndices.push(base, base + 1, base + 2);
        asphaltIndices.push(base + 1, base + 3, base + 2);

        // Sarı çizgi quad (kesikli görünüm hissi için her 2 segmentte 1 çizilir)
        if (i % 3 !== 0) {
          yellowLineIndices.push(base, base + 1, base + 2);
          yellowLineIndices.push(base + 1, base + 3, base + 2);
        }

        // Beyaz banket quad
        const wBase = i * 4;
        whiteLineIndices.push(wBase, wBase + 1, wBase + 4);
        whiteLineIndices.push(wBase + 1, wBase + 5, wBase + 4);
        whiteLineIndices.push(wBase + 2, wBase + 3, wBase + 6);
        whiteLineIndices.push(wBase + 3, wBase + 7, wBase + 6);

        // Bordür quad
        const cBase = i * 4;
        curbIndices.push(cBase, cBase + 1, cBase + 4);
        curbIndices.push(cBase + 1, cBase + 5, cBase + 4);
        curbIndices.push(cBase + 2, cBase + 3, cBase + 6);
        curbIndices.push(cBase + 3, cBase + 7, cBase + 6);
      }
    }

    // Geometrileri oluştur
    const createGeo = (verts, indices, uvs = null) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
      g.setIndex(indices);
      if (uvs) g.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
      g.computeVertexNormals();
      return g;
    };

    const asphaltGeo = createGeo(asphaltVertices, asphaltIndices, asphaltUvs);
    const yellowGeo = createGeo(yellowLineVertices, yellowLineIndices);
    const whiteGeo = createGeo(whiteLineVertices, whiteLineIndices);
    const curbGeo = createGeo(curbVertices, curbIndices);

    // Mesh'leri ekle
    const asphaltMesh = new THREE.Mesh(asphaltGeo, this.materials.asphaltSecondary || this.materials.asphalt);
    asphaltMesh.receiveShadow = true;
    this.group.add(asphaltMesh);

    const yellowMesh = new THREE.Mesh(yellowGeo, this.materials.roadMarkingYellow);
    this.group.add(yellowMesh);

    const whiteMesh = new THREE.Mesh(whiteGeo, this.materials.roadMarkingWhite);
    this.group.add(whiteMesh);

    const curbMesh = new THREE.Mesh(curbGeo, this.materials.curbStone);
    this.group.add(curbMesh);
  }

  /**
   * Virajlı yolun şeritlerini RoadGraph navigasyon ağına entegre eder.
   */
  integrateWithRoadGraph(curve) {
    const numWaypoints = 48; // Yol boyunca 48 navigasyon waypoint'i
    const points = curve.getPoints(numWaypoints);
    const up = new THREE.Vector3(0, 1, 0);

    const outerNodes = []; // Saat yönünde şerit (Dış şerit: +2.75m)
    const innerNodes = []; // Saat yönünün tersi şerit (İç şerit: -2.75m)

    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const t = i / points.length;
      const tangent = curve.getTangent(t).normalize();
      const normal = new THREE.Vector3().crossVectors(tangent, up).normalize();

      const pOuter = p.clone().addScaledVector(normal, 2.75);
      const pInner = p.clone().addScaledVector(normal, -2.75);

      pOuter.y = this.getElevationAt(pOuter.x, pOuter.z) + 0.14;
      pInner.y = this.getElevationAt(pInner.x, pInner.z) + 0.14;

      const outerId = `RING_CW_${i}`;
      const innerId = `RING_CCW_${i}`;

      const oNode = this.roadGraph.addNode(outerId, pOuter.x, pOuter.y, pOuter.z);
      const iNode = this.roadGraph.addNode(innerId, pInner.x, pInner.y, pInner.z);

      outerNodes.push(oNode);
      innerNodes.push(iNode);
    }

    // Şeritleri halka boyunca birbirine bağla
    for (let i = 0; i < outerNodes.length; i++) {
      const nextIdx = (i + 1) % outerNodes.length;
      const prevIdx = (i - 1 + innerNodes.length) % innerNodes.length;

      // Dış şerit (Saat yönü: i -> next)
      this.roadGraph.addEdge(outerNodes[i].id, outerNodes[nextIdx].id, {
        speedLimit: 14.5 // Çevre yolunda akıcı hız (~52 km/h)
      });

      // İç şerit (Ters saat yönü: i -> prev)
      this.roadGraph.addEdge(innerNodes[i].id, innerNodes[prevIdx].id, {
        speedLimit: 14.5
      });
    }

    // 4. Şehir Izgarası ile Çevre Yolu Kavşak Bağlantıları
    // Batı Kavşağı (-135, 135)
    this.connectRingToGrid('RING_CW_0', 'NS_SB_-135_135');
    this.connectRingToGrid('EW_WB_-135_135', 'RING_CCW_0');

    // Kuzey Kavşağı (0, -240)
    const northRingIdx = Math.floor(outerNodes.length * 0.42);
    this.connectRingToGrid(`RING_CW_${northRingIdx}`, 'NS_SB_0_-240');
    this.connectRingToGrid('NS_NB_0_-240', `RING_CCW_${northRingIdx}`);

    // Doğu Kavşağı (135, -65)
    const eastRingIdx = Math.floor(outerNodes.length * 0.65);
    this.connectRingToGrid(`RING_CW_${eastRingIdx}`, 'EW_EB_135_-65');
    this.connectRingToGrid('NS_SB_135_-65', `RING_CCW_${eastRingIdx}`);
  }

  connectRingToGrid(fromId, toId) {
    if (this.roadGraph.getNode(fromId) && this.roadGraph.getNode(toId)) {
      this.roadGraph.addEdge(fromId, toId, { speedLimit: 9.0 });
    }
  }
}
