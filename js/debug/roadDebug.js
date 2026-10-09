import * as THREE from 'three';

/**
 * RoadDebugManager - RoadGraph ve Trafik Görselleştirme / Teşhis Sistemi
 * 
 * Özellikler:
 * 1. RoadGraph Node Noktaları:
 *    - Standart Kavşaklar: Sarı (0xfacc15)
 *    - Ara Waypoint / Yol Noktaları: Camgöbeği (0x06b6d4)
 *    - Mulholland Çevre Yolu Noktaları: Macenta / Pembe (0xe879f9)
 * 2. RoadGraph Edge Çizgileri:
 *    - Yol Merkez Çizgisi: Koyu Mavi / Gri (0x64748b)
 * 3. Lane Offset & Yön Göstergeleri:
 *    - Sağdan Trafik Şeritleri (+1.75m ofset): Parlak Yeşil (0x22c55e)
 *    - Şerit Akış Yönü (Ok / Chevron): Turuncu / Kehribar (0xf59e0b)
 * 4. Canlı NPC Hedef ve Radar Bilgileri:
 *    - NPC -> Hedef Düğüm Çizgisi: Canlı Gök Mavisi (0x38bdf8)
 *    - NPC İleri Sürüş Vektörü: Normalde Yeşil (0x10b981), Radar Freninde Kırmızı (0xef4444)
 * 5. Performans ve Temizlik:
 *    - Bütün çizgiler birleşik tekil LineSegments ve Points geometrilerinde toplanır (Minimum Draw Call).
 *    - Açma/kapama durumunda sahne kirlenmez (visible = false).
 *    - Dinamik güncelleme sırasında sıfır GC (Float32Array havuzu).
 *    - 'G' tuşu ile açılıp kapatılır.
 */
export class RoadDebugManager {
  /**
   * @param {THREE.Scene} scene
   * @param {Object} [roadGraph=null]
   * @param {Object} [trafficManager=null]
   * @param {Object} [curvedRoadBuilder=null]
   * @param {Object} [options={}]
   */
  constructor(scene, roadGraph = null, trafficManager = null, curvedRoadBuilder = null, options = {}) {
    this.scene = scene;
    this.roadGraph = roadGraph;
    this.trafficManager = trafficManager;
    this.curvedRoadBuilder = curvedRoadBuilder;

    // Ayarlar
    this.toggleKey = options.toggleKey || 'KeyG';
    this.elevationOffset = options.elevationOffset ?? 0.35; // Z-fighting önleyici yol üstü kot (+35cm)
    this.laneOffsetDist = options.laneOffsetDist ?? 1.75;  // Sağdan trafik şerit mesafesi (+1.75m)
    this.showHud = options.showHud ?? true;

    this.isEnabled = false;
    this.isStaticBuilt = false;

    // Ana konteyner grubu
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'RoadDebugGroup';
    this.debugGroup.visible = false;
    if (this.scene) {
      this.scene.add(this.debugGroup);
    }

    // Statik Geometriler
    this.staticLinesMesh = null;
    this.nodesPointsMesh = null;

    // Dinamik Geometri (NPC'ler, Trafik Işıkları ve Kavşak Rezervasyonları için)
    this.dynamicLinesMesh = null;
    this.maxDynamicLines = 256; // NPC hedef + radar çizgisi + canlı trafik ışıkları + rezervasyon pinleri
    this.dynamicPositions = new Float32Array(this.maxDynamicLines * 2 * 3);
    this.dynamicColors = new Float32Array(this.maxDynamicLines * 2 * 3);

    // DOM HUD
    this.hudElement = null;

    // Olay dinleyicisi
    this._onKeyDown = this._handleKeyDown.bind(this);
    window.addEventListener('keydown', this._onKeyDown);

    if (this.showHud) {
      this._createHud();
    }
  }

  /**
   * Klavye tuş yakalama
   */
  _handleKeyDown(e) {
    if (e.target && e.target.matches && e.target.matches('input, textarea, select')) return;

    if (e.code === this.toggleKey) {
      this.toggle();
    }
  }

  /**
   * Debug modunu aç / kapat
   */
  toggle() {
    this.isEnabled = !this.isEnabled;
    this.debugGroup.visible = this.isEnabled;

    if (this.hudElement) {
      this.hudElement.style.display = this.isEnabled ? 'block' : 'none';
    }

    // İlk kez açıldığında statik grafiği üret
    if (this.isEnabled && !this.isStaticBuilt) {
      this.buildStaticVisuals();
    }
  }

  /**
   * Statik yol grafı çizgilerini ve düğümlerini birleşik geometriler olarak üretir.
   */
  buildStaticVisuals() {
    if (!this.roadGraph) return;

    // Mevcut statik objeleri temizle
    if (this.staticLinesMesh) {
      this.debugGroup.remove(this.staticLinesMesh);
      this.staticLinesMesh.geometry.dispose();
      this.staticLinesMesh.material.dispose();
      this.staticLinesMesh = null;
    }
    if (this.nodesPointsMesh) {
      this.debugGroup.remove(this.nodesPointsMesh);
      this.nodesPointsMesh.geometry.dispose();
      this.nodesPointsMesh.material.dispose();
      this.nodesPointsMesh = null;
    }

    const lineVertices = [];
    const lineColors = [];

    const nodePositions = [];
    const nodeColors = [];

    const yOff = this.elevationOffset;
    const laneOff = this.laneOffsetDist;

    // Renk Tanımları
    const colCenter = new THREE.Color(0x64748b);  // Merkez çizgisi (Koyu Gri/Mavi)
    const colLane = new THREE.Color(0x22c55e);    // Sağ şerit çizgisi (Yeşil)
    const colArrow = new THREE.Color(0xf59e0b);   // Yön oku (Kehribar/Sarı)
    const colRing = new THREE.Color(0xa855f7);    // Çevre yolu şeritleri (Mor)

    const tmpDir = new THREE.Vector3();
    const tmpNorm = new THREE.Vector3();
    const pA = new THREE.Vector3();
    const pB = new THREE.Vector3();
    const laneA = new THREE.Vector3();
    const laneB = new THREE.Vector3();

    // 1. Kenarlar (Edges), Şeritler (Lanes) ve Yön Göstergeleri (Arrows)
    const edges = this.roadGraph.edges || [];
    for (let eIdx = 0; eIdx < edges.length; eIdx++) {
      const edge = edges[eIdx];
      const wp = edge.waypoints;
      if (!wp || wp.length < 2) continue;

      const isRingEdge = edge.id && edge.id.includes('RING');
      const baseCol = isRingEdge ? colRing : colLane;

      for (let i = 0; i < wp.length - 1; i++) {
        pA.copy(wp[i]);
        pB.copy(wp[i + 1]);

        pA.y += yOff;
        pB.y += yOff;

        // (a) Merkez çizgisi (Segment)
        lineVertices.push(pA.x, pA.y, pA.z, pB.x, pB.y, pB.z);
        lineColors.push(colCenter.r, colCenter.g, colCenter.b, colCenter.r, colCenter.g, colCenter.b);

        // İki nokta arası teğet ve sağ normal vektörü
        tmpDir.subVectors(pB, pA);
        const segLen = tmpDir.length();
        if (segLen > 0.001) {
          tmpDir.multiplyScalar(1 / segLen);
          // XZ düzleminde sağa dik yatay normal: (-dz, 0, dx)
          tmpNorm.set(-tmpDir.z, 0, tmpDir.x).normalize();

          // (b) Sağ şerit ofseti (+laneOff metre sağ)
          laneA.copy(pA).addScaledVector(tmpNorm, laneOff);
          laneB.copy(pB).addScaledVector(tmpNorm, laneOff);

          lineVertices.push(laneA.x, laneA.y, laneA.z, laneB.x, laneB.y, laneB.z);
          lineColors.push(baseCol.r, baseCol.g, baseCol.b, baseCol.r, baseCol.g, baseCol.b);

          // (c) Şerit Akış Yönü Oku (Orta noktada V şeklinde chevron)
          if (segLen > 3.0) {
            const mid = new THREE.Vector3().lerpVectors(laneA, laneB, 0.5);
            const arrowLen = 0.75;
            const arrowWidth = 0.40;

            // Ok ucu mid'de, kanatlar geride
            const leftWing = mid.clone()
              .addScaledVector(tmpDir, -arrowLen)
              .addScaledVector(tmpNorm, -arrowWidth);
            const rightWing = mid.clone()
              .addScaledVector(tmpDir, -arrowLen)
              .addScaledVector(tmpNorm, arrowWidth);

            // Sol kanat
            lineVertices.push(mid.x, mid.y, mid.z, leftWing.x, leftWing.y, leftWing.z);
            lineColors.push(colArrow.r, colArrow.g, colArrow.b, colArrow.r, colArrow.g, colArrow.b);

            // Sağ kanat
            lineVertices.push(mid.x, mid.y, mid.z, rightWing.x, rightWing.y, rightWing.z);
            lineColors.push(colArrow.r, colArrow.g, colArrow.b, colArrow.r, colArrow.g, colArrow.b);
          }
        }
      }
    }

    // 2. Düğümler (Nodes - Kavşaklar ve Ara Noktalar)
    const nodes = this.roadGraph.nodes;
    if (nodes) {
      const colIntersection = new THREE.Color(0xfacc15); // Sarı (Kavşak)
      const colWaypoint = new THREE.Color(0x06b6d4);     // Camgöbeği (Normal Yol Noktası)
      const colRingNode = new THREE.Color(0xe879f9);     // Macenta (Çevre Yolu Noktası)

      for (const node of nodes.values()) {
        const p = node.position;
        nodePositions.push(p.x, p.y + yOff + 0.05, p.z);

        const isRing = node.id && node.id.includes('RING');
        if (isRing) {
          nodeColors.push(colRingNode.r, colRingNode.g, colRingNode.b);
        } else if (node.isIntersection) {
          nodeColors.push(colIntersection.r, colIntersection.g, colIntersection.b);
        } else {
          nodeColors.push(colWaypoint.r, colWaypoint.g, colWaypoint.b);
        }
      }
    }

    // Statik Çizgiler Mesh'ini Birleştir
    if (lineVertices.length > 0) {
      const lineGeo = new THREE.BufferGeometry();
      lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(lineVertices, 3));
      lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
      const lineMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.88,
        depthWrite: false
      });
      this.staticLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
      this.staticLinesMesh.renderOrder = 998;
      this.debugGroup.add(this.staticLinesMesh);
    }

    // Statik Düğüm Noktaları Mesh'ini Birleştir
    if (nodePositions.length > 0) {
      const pointGeo = new THREE.BufferGeometry();
      pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
      pointGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
      const pointMat = new THREE.PointsMaterial({
        size: 1.2,
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      this.nodesPointsMesh = new THREE.Points(pointGeo, pointMat);
      this.nodesPointsMesh.renderOrder = 999;
      this.debugGroup.add(this.nodesPointsMesh);
    }

    // 3. Dinamik NPC Çizgi Havuzunu Hazırla
    if (!this.dynamicLinesMesh) {
      const dynGeo = new THREE.BufferGeometry();
      dynGeo.setAttribute('position', new THREE.BufferAttribute(this.dynamicPositions, 3));
      dynGeo.setAttribute('color', new THREE.BufferAttribute(this.dynamicColors, 3));
      dynGeo.setDrawRange(0, 0);

      const dynMat = new THREE.LineBasicMaterial({
        vertexColors: true,
        transparent: true,
        opacity: 0.95,
        depthWrite: false
      });
      this.dynamicLinesMesh = new THREE.LineSegments(dynGeo, dynMat);
      this.dynamicLinesMesh.renderOrder = 1000;
      this.debugGroup.add(this.dynamicLinesMesh);
    }

    this.isStaticBuilt = true;
  }

  /**
   * Her render karesinde çağrılır: NPC araç hedef ve durum çizgilerini günceller
   */
  update() {
    if (!this.isEnabled) return;

    // NPC ve Yol Ağı dinamik çizgilerini güncelle
    if (this.dynamicLinesMesh) {
      const posAttr = this.dynamicLinesMesh.geometry.attributes.position;
      const colAttr = this.dynamicLinesMesh.geometry.attributes.color;

      let vertIdx = 0;
      const maxVerts = this.maxDynamicLines * 2;

      // 1. Canlı Trafik Işıkları ve Kavşak Rezervasyon Göstergeleri
      if (this.roadGraph && this.roadGraph.nodes) {
        for (const node of this.roadGraph.nodes.values()) {
          if (!node.trafficLight || vertIdx + 6 >= maxVerts) continue;

          const nx = node.position.x;
          const ny = node.position.y + 0.25;
          const nz = node.position.z;

          // Dikey Işık Sinyali (Yeşil, Sarı, Kırmızı)
          const state = node.trafficLight.state;
          let tr = 0.1, tg = 0.85, tb = 0.2; // green
          if (state === 'yellow') {
            tr = 0.95; tg = 0.75; tb = 0.05; // yellow
          } else if (state === 'red') {
            tr = 0.95; tg = 0.1; tb = 0.1; // red
          }

          posAttr.setXYZ(vertIdx, nx, ny, nz);
          colAttr.setXYZ(vertIdx, tr, tg, tb);
          vertIdx++;

          posAttr.setXYZ(vertIdx, nx, ny + 2.8, nz);
          colAttr.setXYZ(vertIdx, tr, tg, tb);
          vertIdx++;

          // Kavşak Token / Rezervasyon Sinyali (Rezerve ise üstte yatay mor pin)
          if (node.reservedVehicleId !== null && vertIdx + 2 < maxVerts) {
            posAttr.setXYZ(vertIdx, nx - 1.2, ny + 2.9, nz);
            colAttr.setXYZ(vertIdx, 0.85, 0.2, 0.95);
            vertIdx++;

            posAttr.setXYZ(vertIdx, nx + 1.2, ny + 2.9, nz);
            colAttr.setXYZ(vertIdx, 0.85, 0.2, 0.95);
            vertIdx++;
          }
        }
      }

      // 2. Canlı NPC Hedef, Yön ve Durum Çizgileri
      const npcs = this.trafficManager ? (this.trafficManager.npcs || []) : [];
      for (let i = 0; i < npcs.length; i++) {
        const npc = npcs[i];
        if (!npc || !npc.position || vertIdx + 4 >= maxVerts) continue;

        const nx = npc.position.x;
        const ny = npc.position.y + 0.9;
        const nz = npc.position.z;

        // Hedef Düğüm Çizgisi (Gök Mavisi)
        const targetPos = npc.targetNode ? npc.targetNode.position : (npc.targetPoint || null);
        if (targetPos) {
          posAttr.setXYZ(vertIdx, nx, ny, nz);
          colAttr.setXYZ(vertIdx, 0.22, 0.74, 0.97); // 0x38bdf8
          vertIdx++;

          posAttr.setXYZ(vertIdx, targetPos.x, targetPos.y + 0.9, targetPos.z);
          colAttr.setXYZ(vertIdx, 0.22, 0.74, 0.97);
          vertIdx++;
        }

        // İleri Yön ve Durum Çizgisi:
        // - Deadlock / Creep Modu: Canlı Pembe (0.95, 0.2, 0.75)
        // - Kırmızı Işıkta Bekliyor: Kırmızı (0.95, 0.1, 0.1)
        // - Kavşak Rezervasyonu Bekliyor: Kehribar Sarısı (0.95, 0.6, 0.1)
        // - Frenleme: Turuncu-Kırmızı (0.94, 0.3, 0.3)
        // - Normal Seyir: Zümrüt Yeşili (0.06, 0.72, 0.51)
        let cr = 0.06, cg = 0.72, cb = 0.51;
        if (npc.isCreeping) {
          cr = 0.95; cg = 0.2; cb = 0.75;
        } else if (npc.isWaitingLight) {
          cr = 0.95; cg = 0.1; cb = 0.1;
        } else if (npc.isWaitingIntersection) {
          cr = 0.95; cg = 0.6; cb = 0.1;
        } else if (npc.speed < 0.4) {
          cr = 0.94; cg = 0.3; cb = 0.3;
        }

        const heading = npc.heading || 0;
        const fLen = npc.isCreeping ? 4.5 : 3.0;
        const fx = nx + Math.sin(heading) * fLen;
        const fz = nz + Math.cos(heading) * fLen;

        posAttr.setXYZ(vertIdx, nx, ny, nz);
        colAttr.setXYZ(vertIdx, cr, cg, cb);
        vertIdx++;

        posAttr.setXYZ(vertIdx, fx, ny, fz);
        colAttr.setXYZ(vertIdx, cr, cg, cb);
        vertIdx++;
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;
      this.dynamicLinesMesh.geometry.setDrawRange(0, vertIdx);
    }

    // HUD Metriklerini güncelle
    if (this.hudElement && this.hudElement.style.display !== 'none') {
      const npcs = this.trafficManager ? (this.trafficManager.npcs || []) : [];
      const nodesCount = this.roadGraph ? (this.roadGraph.nodes ? this.roadGraph.nodes.size : 0) : 0;
      const edgesCount = this.roadGraph ? (this.roadGraph.edges ? this.roadGraph.edges.length : 0) : 0;
      const interBlocksCount = this.roadGraph ? (this.roadGraph.intersections ? this.roadGraph.intersections.size : 0) : 0;
      const activeNpcs = npcs.length;

      let waitingLightCount = 0;
      let waitingInterCount = 0;
      let creepingCount = 0;
      let occupiedIntersections = 0;

      for (let i = 0; i < npcs.length; i++) {
        if (npcs[i].isWaitingLight) waitingLightCount++;
        if (npcs[i].isWaitingIntersection) waitingInterCount++;
        if (npcs[i].isCreeping) creepingCount++;
      }

      if (this.roadGraph && this.roadGraph.intersections) {
        for (const inter of this.roadGraph.intersections.values()) {
          if (inter.activeVehicleId !== null) occupiedIntersections++;
        }
      }

      this.hudElement.innerHTML = `
        <div style="font-weight: bold; color: #f59e0b; margin-bottom: 5px; border-bottom: 1px solid rgba(245, 158, 11, 0.3); padding-bottom: 3px;">
          🚦 ROAD & TRAFFIC DEBUG [${this.toggleKey.replace('Key', '')}]
        </div>
        <div>Yol Düğümleri (Nodes): <span style="color:#facc15;">${nodesCount}</span></div>
        <div>Şerit Segmentleri (Edges): <span style="color:#22c55e;">${edgesCount}</span></div>
        <div>Aktif Kavşak Bloğu: <span style="color:#e879f9;">${interBlocksCount}</span> (Dolu: <span style="color:#f43f5e;">${occupiedIntersections}</span>)</div>
        <div>Aktif NPC Araç: <span style="color:#38bdf8;">${activeNpcs}</span></div>
        <div style="margin-top: 3px; padding-top: 3px; border-top: 1px solid rgba(255,255,255,0.1);">
          Kırmızı Işıkta Bekleyen: <span style="color:#ef4444; font-weight:bold;">${waitingLightCount}</span><br>
          Kavşak Sırası Bekleyen: <span style="color:#f59e0b; font-weight:bold;">${waitingInterCount}</span><br>
          Deadlock / Creep Sızma: <span style="color:#ec4899; font-weight:bold;">${creepingCount}</span>
        </div>
        <div style="margin-top: 4px; font-size: 11px; opacity: 0.85; line-height: 1.4;">
          <span style="color:#22c55e;">■</span> Yeşil Işık 
          <span style="color:#eab308; margin-left:5px;">■</span> Sarı Işık 
          <span style="color:#ef4444; margin-left:5px;">■</span> Kırmızı Işık 
          <span style="color:#d946ef; margin-left:5px;">■</span> Rezerve
          <br>
          <span style="color:#38bdf8;">―</span> Hedef
          <span style="color:#ec4899; margin-left:6px;">▶</span> Deadlock Creep
        </div>
      `;
    }
  }

  /**
   * HUD Overlay DOM Elemanını oluşturur
   */
  _createHud() {
    let el = document.getElementById('debug-road-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debug-road-hud';
      el.style.position = 'fixed';
      el.style.top = '14px';
      el.style.left = '14px';
      el.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
      el.style.backdropFilter = 'blur(6px)';
      el.style.color = '#e2e8f0';
      el.style.fontFamily = 'monospace, Consolas, sans-serif';
      el.style.fontSize = '12px';
      el.style.padding = '9px 15px';
      el.style.borderRadius = '8px';
      el.style.border = '1px solid rgba(56, 189, 248, 0.35)';
      el.style.boxShadow = '0 4px 12px rgba(0, 0, 0, 0.4)';
      el.style.zIndex = '999999';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    this.hudElement = el;
  }

  /**
   * Temizlik ve bellek boşaltma (Zero Leak)
   */
  dispose() {
    window.removeEventListener('keydown', this._onKeyDown);

    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
      this.hudElement = null;
    }

    if (this.staticLinesMesh) {
      this.debugGroup.remove(this.staticLinesMesh);
      this.staticLinesMesh.geometry.dispose();
      this.staticLinesMesh.material.dispose();
      this.staticLinesMesh = null;
    }

    if (this.nodesPointsMesh) {
      this.debugGroup.remove(this.nodesPointsMesh);
      this.nodesPointsMesh.geometry.dispose();
      this.nodesPointsMesh.material.dispose();
      this.nodesPointsMesh = null;
    }

    if (this.dynamicLinesMesh) {
      this.debugGroup.remove(this.dynamicLinesMesh);
      this.dynamicLinesMesh.geometry.dispose();
      this.dynamicLinesMesh.material.dispose();
      this.dynamicLinesMesh = null;
    }

    if (this.scene && this.debugGroup) {
      this.scene.remove(this.debugGroup);
    }

    this.isStaticBuilt = false;
    this.isEnabled = false;
  }
}
