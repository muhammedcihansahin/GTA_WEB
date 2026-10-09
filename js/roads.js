import * as THREE from 'three';
import * as BufferGeometryUtils from 'three/addons/utils/BufferGeometryUtils.js';
import { PARCEL_PLOTS } from './parcels.js';

/**
 * Şehir Yol Ağı, Kaldırımlar, Parseller ve Yol Çizgileri Modülü
 * BufferGeometryUtils.mergeGeometries ile yüzlerce münferit çizim çağrısı (draw call)
 * tekil birleşik mesh'lere dönüştürülmüştür.
 */
export class RoadNetworkBuilder {
  constructor(materials) {
    this.materials = materials;
  }

  buildAll(parentGroup) {
    const roadGroup = new THREE.Group();
    roadGroup.name = 'RoadNetwork';
    parentGroup.add(roadGroup);

    // 1. Asfalt Yollar (Ana Bulvarlar, Caddeler ve Cul-de-Sac'lar)
    this.buildAsphaltRoads(roadGroup);

    // 2. Kaldırımlar & Bordür Taşları
    this.buildSidewalks(roadGroup);

    // 3. Parsel Alanları & Köşe Taşları
    this.buildParcelLots(roadGroup);

    // 4. Şerit ve Kavşak Çizgileri
    this.buildRoadMarkings(roadGroup);

    return roadGroup;
  }

  alignUvEastWest(geometry) {
    const uvs = geometry.attributes.uv;
    if (uvs) {
      for (let i = 0; i < uvs.count; i++) {
        const u = uvs.getX(i);
        const v = uvs.getY(i);
        uvs.setXY(i, v, u);
      }
      uvs.needsUpdate = true;
    }
    return geometry;
  }

  prepareGeometry(geo) {
    let g = geo.index ? geo.toNonIndexed() : geo.clone();
    if (!g.attributes.normal) g.computeVertexNormals();
    if (!g.attributes.uv && g.attributes.position) {
      g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
    }
    return g;
  }

  safeMergeAndAdd(geometries, material, parentGroup, options = {}) {
    if (!geometries || geometries.length === 0) return null;

    // Sektör bazlı bölümleme: Geometrileri kütle merkezlerine göre 4 kadrana (NW, NE, SW, SE) ayır
    // Bu sayede tek bir 720m devasa mesh yerine kadran mesh'leri oluşur ve Three.js kamera arkasındakileri Frustum Culling ile eler.
    const buckets = [[], [], [], []];
    for (let i = 0; i < geometries.length; i++) {
      const geo = geometries[i];
      if (!geo.boundingSphere) geo.computeBoundingSphere();
      const center = geo.boundingSphere.center;
      const qX = center.x >= 0 ? 1 : 0;
      const qZ = center.z >= 0 ? 2 : 0;
      buckets[qX + qZ].push(geo);
    }

    const createdMeshes = [];
    for (let b = 0; b < buckets.length; b++) {
      if (buckets[b].length > 0) {
        const merged = BufferGeometryUtils.mergeGeometries(buckets[b], false);
        if (merged) {
          merged.computeBoundingBox();
          merged.computeBoundingSphere();
          const mesh = new THREE.Mesh(merged, material);
          if (options.castShadow) mesh.castShadow = true;
          if (options.receiveShadow) mesh.receiveShadow = true;
          mesh.frustumCulled = true;
          parentGroup.add(mesh);
          createdMeshes.push(mesh);
        }
      }
    }
    return createdMeshes.length > 0 ? createdMeshes[0] : null;
  }

  // =========================================================================
  // 1. ASFALT YOLLAR
  // =========================================================================
  buildAsphaltRoads(roadGroup) {
    const roadSpan = 720; // -360m ile +360m arası
    const asphaltGeos = [];
    const asphaltSecGeos = [];
    const islandGrassGeos = [];
    const islandCurbGeos = [];

    // A. 14 Metre Genişliğinde Ana Bulvarlar (4 Şeritli)
    // Kuzey-Güney Ana Bulvarı (x = 0)
    const nsGeo = this.prepareGeometry(new THREE.PlaneGeometry(14, roadSpan));
    nsGeo.rotateX(-Math.PI / 2);
    nsGeo.translate(0, 0.06, 0);
    asphaltGeos.push(nsGeo);

    // Doğu-Batı Ana Bulvarı (z = 0)
    const ewPlane = this.alignUvEastWest(new THREE.PlaneGeometry(roadSpan, 14));
    const ewGeo = this.prepareGeometry(ewPlane);
    ewGeo.rotateX(-Math.PI / 2);
    ewGeo.translate(0, 0.0605, 0);
    asphaltGeos.push(ewGeo);

    // B. 10 Metre Genişliğinde İç ve Dış Caddeler (x, z = ±65 ve ±135)
    const avenueCoords = [-135, -65, 65, 135];

    // Kuzey-Güney Caddeleri
    avenueCoords.forEach(xPos => {
      const aveGeo = this.prepareGeometry(new THREE.PlaneGeometry(10, roadSpan));
      aveGeo.rotateX(-Math.PI / 2);
      aveGeo.translate(xPos, 0.06, 0);
      asphaltSecGeos.push(aveGeo);
    });

    // Doğu-Batı Caddeleri
    avenueCoords.forEach(zPos => {
      const strPlane = this.alignUvEastWest(new THREE.PlaneGeometry(roadSpan, 10));
      const strGeo = this.prepareGeometry(strPlane);
      strGeo.rotateX(-Math.PI / 2);
      strGeo.translate(0, 0.0602, zPos);
      asphaltSecGeos.push(strGeo);
    });

    // C. Dış Çıkmaz Sokaklar / Dönüş Meydanları (4 Yöne Ayrılan Cul-de-Sacs)
    const culDeSacs = [
      { startX: -135, endX: -185, z: -32.5, isAlongX: true, circleX: -185, circleZ: -32.5 },
      { startX: 135, endX: 185, z: 32.5, isAlongX: true, circleX: 185, circleZ: 32.5 },
      { x: 32.5, startZ: -135, endZ: -185, isAlongX: false, circleX: 32.5, circleZ: -185 },
      { x: -32.5, startZ: 135, endZ: 185, isAlongX: false, circleX: -32.5, circleZ: 185 }
    ];

    culDeSacs.forEach(cul => {
      if (cul.isAlongX) {
        const len = Math.abs(cul.endX - cul.startX);
        const midX = (cul.startX + cul.endX) / 2;
        const stemPlane = this.alignUvEastWest(new THREE.PlaneGeometry(len, 8));
        const stemGeo = this.prepareGeometry(stemPlane);
        stemGeo.rotateX(-Math.PI / 2);
        stemGeo.translate(midX, 0.061, cul.z);
        asphaltSecGeos.push(stemGeo);
      } else {
        const len = Math.abs(cul.endZ - cul.startZ);
        const midZ = (cul.startZ + cul.endZ) / 2;
        const stemGeo = this.prepareGeometry(new THREE.PlaneGeometry(8, len));
        stemGeo.rotateX(-Math.PI / 2);
        stemGeo.translate(cul.x, 0.061, midZ);
        asphaltSecGeos.push(stemGeo);
      }

      // Dönüş Dairesi
      const circleGeo = this.prepareGeometry(new THREE.CylinderGeometry(14, 14, 0.06, 36));
      circleGeo.translate(cul.circleX, 0.03, cul.circleZ);
      asphaltSecGeos.push(circleGeo);

      // Göbek Çim Adası
      const islandGeo = this.prepareGeometry(new THREE.CylinderGeometry(4.6, 4.6, 0.16, 28));
      islandGeo.translate(cul.circleX, 0.11, cul.circleZ);
      islandGrassGeos.push(islandGeo);

      // Göbek Bordürü
      const curbGeo = this.prepareGeometry(new THREE.CylinderGeometry(4.8, 4.8, 0.20, 28, 1, true));
      curbGeo.translate(cul.circleX, 0.12, cul.circleZ);
      islandCurbGeos.push(curbGeo);
    });

    this.safeMergeAndAdd(asphaltGeos, this.materials.asphalt, roadGroup, { receiveShadow: true });
    this.safeMergeAndAdd(asphaltSecGeos, this.materials.asphaltSecondary, roadGroup, { receiveShadow: true });
    this.safeMergeAndAdd(islandGrassGeos, this.materials.grass, roadGroup, { receiveShadow: true });
    this.safeMergeAndAdd(islandCurbGeos, this.materials.curbStone, roadGroup, { receiveShadow: true });
  }

  // =========================================================================
  // 2. KALDIRIMLAR & BORDÜR TAŞLARI
  // =========================================================================
  buildSidewalks(parentGroup) {
    const swWidth = 2.2;
    const curbWidth = 0.25;
    const walkWidth = swWidth - curbWidth; // 1.95m yürüme alanı
    const sidewalkGeos = [];
    const curbGeos = [];

    const xRanges = [
      { minX: -129.5, maxX: -70.5 },
      { minX: -59.5, maxX: -7.5 },
      { minX: 7.5, maxX: 59.5 },
      { minX: 70.5, maxX: 129.5 }
    ];

    const zRanges = [
      { minZ: -129.5, maxZ: -70.5 },
      { minZ: -59.5, maxZ: -7.5 },
      { minZ: 7.5, maxZ: 59.5 },
      { minZ: 70.5, maxZ: 129.5 }
    ];

    // 16 Adanın her birinin etrafına kaldırımlar ve bordürler
    // Bordürler dış kenara (yol tarafına) yerleştirilir; kaldırım gövdesi ise bordürün hemen arkasından başlar.
    // Bu sayede dış yan yüzeylerde Z-fighting (beyaz-kahverengi titreme) tamamen ortadan kalkar.
    xRanges.forEach(xr => {
      zRanges.forEach(zr => {
        const w = xr.maxX - xr.minX;
        const d = zr.maxZ - zr.minZ;
        const cx = (xr.minX + xr.maxX) / 2;
        const cz = (zr.minZ + zr.maxZ) / 2;

        // --- BORDÜR TAŞLARI (Dış Çerçeve, Yükseklik: 0.18m) ---
        // Kuzey Bordürü
        this.addCurbSegment(cx, zr.minZ + curbWidth / 2, w, curbWidth, curbGeos);
        // Güney Bordürü
        this.addCurbSegment(cx, zr.maxZ - curbWidth / 2, w, curbWidth, curbGeos);
        // Batı Bordürü (Köşelerde Kuzey/Güney ile çakışmaması için curbWidth kadar içte)
        this.addCurbSegment(xr.minX + curbWidth / 2, cz, curbWidth, d - curbWidth * 2, curbGeos);
        // Doğu Bordürü
        this.addCurbSegment(xr.maxX - curbWidth / 2, cz, curbWidth, d - curbWidth * 2, curbGeos);

        // --- KALDIRIM GÖVDESİ (İç Yürüme Alanı, Yükseklik: 0.14m) ---
        // Kuzey Kaldırımı (Bordürün arkasında)
        this.addSidewalkSegment(cx, zr.minZ + curbWidth + walkWidth / 2, w - curbWidth * 2, walkWidth, sidewalkGeos);
        // Güney Kaldırımı
        this.addSidewalkSegment(cx, zr.maxZ - curbWidth - walkWidth / 2, w - curbWidth * 2, walkWidth, sidewalkGeos);
        // Batı Kaldırımı
        this.addSidewalkSegment(xr.minX + curbWidth + walkWidth / 2, cz, walkWidth, d - swWidth * 2, sidewalkGeos);
        // Doğu Kaldırımı
        this.addSidewalkSegment(xr.maxX - curbWidth - walkWidth / 2, cz, walkWidth, d - swWidth * 2, sidewalkGeos);
      });
    });

    // Dış Hat Kaldırımları & Bordürleri (Yol sınırlarına tam oturtulmuş ve çakışmasız)
    // Batı dış hat
    this.addCurbSegment(-140.125, 0, curbWidth, 716, curbGeos);
    this.addSidewalkSegment(-141.225, 0, walkWidth, 716, sidewalkGeos);

    // Doğu dış hat
    this.addCurbSegment(140.125, 0, curbWidth, 716, curbGeos);
    this.addSidewalkSegment(141.225, 0, walkWidth, 716, sidewalkGeos);

    // Kuzey dış hat
    this.addCurbSegment(0, -140.125, 716, curbWidth, curbGeos);
    this.addSidewalkSegment(0, -141.225, 716, walkWidth, sidewalkGeos);

    // Güney dış hat
    this.addCurbSegment(0, 140.125, 716, curbWidth, curbGeos);
    this.addSidewalkSegment(0, 141.225, 716, walkWidth, sidewalkGeos);

    this.safeMergeAndAdd(sidewalkGeos, this.materials.concreteSidewalk, parentGroup, { receiveShadow: true });
    this.safeMergeAndAdd(curbGeos, this.materials.curbStone, parentGroup, { receiveShadow: true });
  }

  addSidewalkSegment(x, z, widthX, depthZ, geos) {
    const geo = this.prepareGeometry(new THREE.BoxGeometry(widthX, 0.14, depthZ));
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    if (pos && uv) {
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i) + x;
        const pz = pos.getZ(i) + z;
        uv.setXY(i, px / 1.8, pz / 1.8);
      }
      uv.needsUpdate = true;
    }
    geo.translate(x, 0.07, z);
    geos.push(geo);
  }

  addCurbSegment(x, z, widthX, depthZ, geos) {
    const geo = this.prepareGeometry(new THREE.BoxGeometry(widthX, 0.18, depthZ));
    const isLongZ = depthZ > widthX;
    const pos = geo.attributes.position;
    const uv = geo.attributes.uv;
    if (pos && uv) {
      for (let i = 0; i < pos.count; i++) {
        const px = pos.getX(i) + x;
        const py = pos.getY(i) + 0.09;
        const pz = pos.getZ(i) + z;
        const along = isLongZ ? pz : px;
        uv.setXY(i, along / 1.0, py / 0.18);
      }
      uv.needsUpdate = true;
    }
    geo.translate(x, 0.09, z);
    geos.push(geo);
  }

  // =========================================================================
  // 3. EVLER İÇİN PARSEL ALANLARI
  // =========================================================================
  buildParcelLots(parentGroup) {
    const borderGeos = [];
    const markerGeos = [];

    PARCEL_PLOTS.forEach(plot => {
      const borderThickness = 0.22;
      const hw = plot.w / 2;
      const hd = plot.d / 2;

      const edges = [
        { x: plot.x, z: plot.z - hd, w: plot.w, d: borderThickness },
        { x: plot.x, z: plot.z + hd, w: plot.w, d: borderThickness },
        { x: plot.x - hw, z: plot.z, w: borderThickness, d: plot.d },
        { x: plot.x + hw, z: plot.z, w: borderThickness, d: plot.d }
      ];

      edges.forEach(e => {
        const edgeGeo = this.prepareGeometry(new THREE.PlaneGeometry(e.w, e.d));
        edgeGeo.rotateX(-Math.PI / 2);
        edgeGeo.translate(e.x, 0.065, e.z);
        borderGeos.push(edgeGeo);
      });

      // 4 Köşe İşaret Taşı
      const corners = [
        [-hw, -hd], [hw, -hd], [-hw, hd], [hw, hd]
      ];
      corners.forEach(([cx, cz]) => {
        const markerGeo = this.prepareGeometry(new THREE.BoxGeometry(0.32, 0.25, 0.32));
        markerGeo.translate(plot.x + cx, 0.14, plot.z + cz);
        markerGeos.push(markerGeo);
      });
    });

    this.safeMergeAndAdd(borderGeos, this.materials.parcelBorder, parentGroup, { receiveShadow: true });
    this.safeMergeAndAdd(markerGeos, this.materials.parcelMarker, parentGroup, { receiveShadow: true });
  }

  // =========================================================================
  // 4. YOL ŞERİT VE KAVŞAK ÇİZGİLERİ
  // =========================================================================
  buildRoadMarkings(parentGroup) {
    const roadSegments = [
      [-355, -143],
      [-127, -73],
      [-57, -9],
      [9, 57],
      [73, 127],
      [143, 355]
    ];

    const yellowGeos = [];
    const whiteGeos = [];
    const crosswalkGeos = [];

    // A. 14 Metre Ana Bulvarlar (X = 0 ve Z = 0)
    roadSegments.forEach(([start, end]) => {
      const len = end - start;
      const mid = (start + end) / 2;

      // Kuzey-Güney Çift Sarı
      this.collectDoubleYellowLine(0, mid, len, true, yellowGeos);
      // Doğu-Batı Çift Sarı
      this.collectDoubleYellowLine(0, mid, len, false, yellowGeos);

      // Kuzey-Güney Kesikli Beyaz Şerit Çizgileri
      this.collectDashedLine(-3.5, start, end, true, whiteGeos);
      this.collectDashedLine(3.5, start, end, true, whiteGeos);

      // Doğu-Batı Kesikli Beyaz Şerit Çizgileri
      this.collectDashedLine(-3.5, start, end, false, whiteGeos);
      this.collectDashedLine(3.5, start, end, false, whiteGeos);

      // Dış Emniyet Çizgileri
      this.collectSolidLine(-6.6, start, end, true, whiteGeos);
      this.collectSolidLine(6.6, start, end, true, whiteGeos);
      this.collectSolidLine(-6.6, start, end, false, whiteGeos);
      this.collectSolidLine(6.6, start, end, false, whiteGeos);
    });

    // B. 10 Metre Caddeler (X ve Z = ±65, ±135)
    const avenueCoords = [-135, -65, 65, 135];
    avenueCoords.forEach(pos => {
      roadSegments.forEach(([start, end]) => {
        const len = end - start;
        const mid = (start + end) / 2;

        this.collectDoubleYellowLine(pos, mid, len, true, yellowGeos);
        this.collectDoubleYellowLine(pos, mid, len, false, yellowGeos);

        this.collectSolidLine(pos - 4.6, start, end, true, whiteGeos);
        this.collectSolidLine(pos + 4.6, start, end, true, whiteGeos);
        this.collectSolidLine(pos - 4.6, start, end, false, whiteGeos);
        this.collectSolidLine(pos + 4.6, start, end, false, whiteGeos);
      });
    });

    // C. Kavşak Yaya Geçitleri ve Dur Çizgileri
    const allRoadCoords = [-135, -65, 0, 65, 135];
    allRoadCoords.forEach(rx => {
      allRoadCoords.forEach(rz => {
        const isMainX = (rx === 0);
        const isMainZ = (rz === 0);
        const wX = isMainX ? 14 : 10;
        const wZ = isMainZ ? 14 : 10;

        // Kuzey Yaklaşımı
        this.collectZebraCrossing(rx, rz - (wZ / 2 + 2.4), wX - 0.8, true, crosswalkGeos);
        this.collectStopBar(rx, rz - (wZ / 2 + 0.6), wX - 0.8, true, whiteGeos);

        // Güney Yaklaşımı
        this.collectZebraCrossing(rx, rz + (wZ / 2 + 2.4), wX - 0.8, true, crosswalkGeos);
        this.collectStopBar(rx, rz + (wZ / 2 + 0.6), wX - 0.8, true, whiteGeos);

        // Batı Yaklaşımı
        this.collectZebraCrossing(rx - (wX / 2 + 2.4), rz, wZ - 0.8, false, crosswalkGeos);
        this.collectStopBar(rx - (wX / 2 + 0.6), rz, wZ - 0.8, false, whiteGeos);

        // Doğu Yaklaşımı
        this.collectZebraCrossing(rx + (wX / 2 + 2.4), rz, wZ - 0.8, false, crosswalkGeos);
        this.collectStopBar(rx + (wX / 2 + 0.6), rz, wZ - 0.8, false, whiteGeos);
      });
    });

    this.safeMergeAndAdd(yellowGeos, this.materials.roadMarkingYellow, parentGroup, {});
    this.safeMergeAndAdd(whiteGeos, this.materials.roadMarkingWhite, parentGroup, {});
    this.safeMergeAndAdd(crosswalkGeos, this.materials.crosswalk, parentGroup, {});
  }

  collectDoubleYellowLine(fixedCoord, midCoord, length, isAlongZ, geos) {
    const lineWidth = 0.16;
    const gap = 0.18;
    const offset = (lineWidth + gap) / 2;

    const basePlane = new THREE.PlaneGeometry(
      isAlongZ ? lineWidth : length,
      isAlongZ ? length : lineWidth
    );

    const g1 = this.prepareGeometry(basePlane);
    g1.rotateX(-Math.PI / 2);
    if (isAlongZ) {
      g1.translate(fixedCoord - offset, 0.082, midCoord);
    } else {
      g1.translate(midCoord, 0.082, fixedCoord - offset);
    }
    geos.push(g1);

    const g2 = this.prepareGeometry(basePlane);
    g2.rotateX(-Math.PI / 2);
    if (isAlongZ) {
      g2.translate(fixedCoord + offset, 0.082, midCoord);
    } else {
      g2.translate(midCoord, 0.082, fixedCoord + offset);
    }
    geos.push(g2);
  }

  collectDashedLine(fixedCoord, start, end, isAlongZ, geos) {
    const dashLength = 3.0;
    const gap = 3.5;
    const totalCycle = dashLength + gap;
    const lineWidth = 0.20;

    const basePlane = new THREE.PlaneGeometry(
      isAlongZ ? lineWidth : dashLength,
      isAlongZ ? dashLength : lineWidth
    );

    for (let c = start + 1.5; c <= end - 1.5; c += totalCycle) {
      const g = this.prepareGeometry(basePlane);
      g.rotateX(-Math.PI / 2);
      if (isAlongZ) {
        g.translate(fixedCoord, 0.081, c);
      } else {
        g.translate(c, 0.081, fixedCoord);
      }
      geos.push(g);
    }
  }

  collectSolidLine(fixedCoord, start, end, isAlongZ, geos) {
    const len = end - start;
    const mid = (start + end) / 2;
    const lineWidth = 0.20;

    const basePlane = new THREE.PlaneGeometry(
      isAlongZ ? lineWidth : len,
      isAlongZ ? len : lineWidth
    );
    const g = this.prepareGeometry(basePlane);
    g.rotateX(-Math.PI / 2);
    if (isAlongZ) {
      g.translate(fixedCoord, 0.080, mid);
    } else {
      g.translate(mid, 0.080, fixedCoord);
    }
    geos.push(g);
  }

  collectStopBar(fixedX, fixedZ, roadWidth, isHorizontal, geos) {
    const barThick = 0.50;
    const basePlane = new THREE.PlaneGeometry(
      isHorizontal ? roadWidth : barThick,
      isHorizontal ? barThick : roadWidth
    );
    const g = this.prepareGeometry(basePlane);
    g.rotateX(-Math.PI / 2);
    g.translate(fixedX, 0.083, fixedZ);
    geos.push(g);
  }

  collectZebraCrossing(x, z, span, isHorizontal, geos) {
    const stripeWidth = 0.60;
    const stripeLength = 3.8;
    const stripeGap = 0.50;
    const cycle = stripeWidth + stripeGap;
    const count = Math.floor(span / cycle);

    const basePlane = new THREE.PlaneGeometry(
      isHorizontal ? stripeWidth : stripeLength,
      isHorizontal ? stripeLength : stripeWidth
    );

    const startOffset = -((count - 1) * cycle) / 2;

    for (let i = 0; i < count; i++) {
      const offset = startOffset + i * cycle;
      const g = this.prepareGeometry(basePlane);
      g.rotateX(-Math.PI / 2);
      if (isHorizontal) {
        g.translate(x + offset, 0.084, z);
      } else {
        g.translate(x, 0.084, z + offset);
      }
      geos.push(g);
    }
  }
}

