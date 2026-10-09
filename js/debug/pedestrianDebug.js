import * as THREE from 'three';
import { PedestrianState } from '../pedestrian/PedestrianManager.js';

/**
 * PedestrianDebugManager - Kaldırım Ağı ve Yaya Durum Teşhis Sistemi
 * 'H' tuşu ile açılır/kapanır.
 * 
 * Görsel Özellikler:
 * - Kaldırım Çizgileri: Camgöbeği (0x06b6d4)
 * - Yaya Geçitleri (Crosswalk): Parlak Sarı (0xfacc15)
 * - Yaya Düğümleri: Açık Mavi Noktalar
 * - Canlı Yaya Durumları:
 *   - IDLE: Sarı nokta / çizgi
 *   - WALKING: Yeşil
 *   - CROSSING: Camgöbeği
 *   - FLEEING: Parlak Kırmızı (kaçış vektörüyle birlikte)
 */
export class PedestrianDebugManager {
  /**
   * @param {THREE.Scene} scene
   * @param {import('../pedestrian/SidewalkGraph.js').SidewalkGraph} sidewalkGraph
   * @param {import('../pedestrian/PedestrianManager.js').PedestrianManager} pedestrianManager
   * @param {Object} [options={}]
   */
  constructor(scene, sidewalkGraph = null, pedestrianManager = null, options = {}) {
    this.scene = scene;
    this.sidewalkGraph = sidewalkGraph;
    this.pedestrianManager = pedestrianManager;

    this.toggleKey = options.toggleKey || 'KeyH';
    this.isEnabled = false;
    this.isStaticBuilt = false;

    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'PedestrianDebugGroup';
    this.debugGroup.visible = false;
    if (this.scene) {
      this.scene.add(this.debugGroup);
    }

    // Statik Geometriler
    this.staticLinesMesh = null;
    this.staticNodesMesh = null;

    // Dinamik Geometri (Yayaların hedefleri ve durumları)
    this.dynamicLinesMesh = null;
    this.dynamicPositions = new Float32Array(24 * 6); // 12 yaya x 2 çizgi x 2 nokta x 3 coord
    this.dynamicColors = new Float32Array(24 * 6);

    this.hudElement = null;
    this.createHudOverlay();
    this.initEvents();
  }

  createHudOverlay() {
    let el = document.getElementById('debug-pedestrian-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debug-pedestrian-hud';
      el.style.position = 'fixed';
      el.style.bottom = '12px';
      el.style.left = '12px';
      el.style.backgroundColor = 'rgba(15, 23, 42, 0.85)';
      el.style.color = '#38bdf8';
      el.style.fontFamily = 'monospace';
      el.style.fontSize = '11px';
      el.style.padding = '8px 14px';
      el.style.borderRadius = '6px';
      el.style.border = '1px solid rgba(56, 189, 248, 0.35)';
      el.style.zIndex = '999999';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    this.hudElement = el;
  }

  initEvents() {
    window.addEventListener('keydown', (e) => {
      if (e.code === this.toggleKey || e.code === 'KeyP' || e.key === 'p' || e.key === 'P' || e.key === 'h' || e.key === 'H') {
        // Form öğelerinde yazarken tetiklenme
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;
        this.toggle();
      }
    });
  }

  toggle() {
    this.isEnabled = !this.isEnabled;
    this.debugGroup.visible = this.isEnabled;

    if (this.hudElement) {
      this.hudElement.style.display = this.isEnabled ? 'block' : 'none';
    }

    if (this.isEnabled && !this.isStaticBuilt) {
      this.buildStaticVisuals();
    }
  }

  buildStaticVisuals() {
    if (!this.sidewalkGraph) return;

    const edges = this.sidewalkGraph.edges;
    const nodes = Array.from(this.sidewalkGraph.nodes.values());

    // 1. Kenar Çizgileri
    const linePositions = [];
    const lineColors = [];

    for (let i = 0; i < edges.length; i++) {
      const e = edges[i];
      const p1 = e.fromNode.position;
      const p2 = e.toNode.position;
      const yOff = 0.22; // Kaldırım üstü net görünüm

      linePositions.push(p1.x, p1.y + yOff, p1.z);
      linePositions.push(p2.x, p2.y + yOff, p2.z);

      if (e.isCrosswalk) {
        // Yaya geçidi: Parlak Sarı
        lineColors.push(0.98, 0.80, 0.08, 0.98, 0.80, 0.08);
      } else {
        // Kaldırım: Camgöbeği / Mavi
        lineColors.push(0.02, 0.71, 0.83, 0.02, 0.71, 0.83);
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    lineGeo.setAttribute('color', new THREE.Float32BufferAttribute(lineColors, 3));
    const lineMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, transparent: true, opacity: 0.85 });
    this.staticLinesMesh = new THREE.LineSegments(lineGeo, lineMat);
    this.staticLinesMesh.renderOrder = 999;
    this.debugGroup.add(this.staticLinesMesh);

    // 2. Düğüm Noktaları
    const nodePositions = [];
    const nodeColors = [];

    for (let i = 0; i < nodes.length; i++) {
      const n = nodes[i];
      nodePositions.push(n.position.x, n.position.y + 0.26, n.position.z);

      if (n.isCrosswalk) {
        nodeColors.push(0.98, 0.80, 0.08); // Sarı
      } else if (n.isCorner) {
        nodeColors.push(0.91, 0.47, 0.97); // Pembe
      } else {
        nodeColors.push(0.22, 0.77, 0.97); // Camgöbeği
      }
    }

    const nodeGeo = new THREE.BufferGeometry();
    nodeGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    nodeGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
    const nodeMat = new THREE.PointsMaterial({ size: 0.6, vertexColors: true, depthTest: false, transparent: true, opacity: 0.9 });
    this.staticNodesMesh = new THREE.Points(nodeGeo, nodeMat);
    this.staticNodesMesh.renderOrder = 1000;
    this.debugGroup.add(this.staticNodesMesh);

    // 3. Dinamik Çizgiler Geometrisi
    const dynGeo = new THREE.BufferGeometry();
    dynGeo.setAttribute('position', new THREE.BufferAttribute(this.dynamicPositions, 3));
    dynGeo.setAttribute('color', new THREE.BufferAttribute(this.dynamicColors, 3));
    const dynMat = new THREE.LineBasicMaterial({ vertexColors: true, depthTest: false, linewidth: 2 });
    this.dynamicLinesMesh = new THREE.LineSegments(dynGeo, dynMat);
    this.dynamicLinesMesh.renderOrder = 1001;
    this.debugGroup.add(this.dynamicLinesMesh);

    this.isStaticBuilt = true;
  }

  update() {
    if (!this.isEnabled) return;

    if (!this.pedestrianManager || !this.dynamicLinesMesh) return;

    const pool = this.pedestrianManager.pool;
    let ptr = 0;
    let colorPtr = 0;

    let walkingCount = 0;
    let idleCount = 0;
    let crossingCount = 0;
    let fleeingCount = 0;

    for (let i = 0; i < pool.length; i++) {
      const ped = pool[i];
      if (!ped.isActive) continue;

      // Durum Sayaçları
      if (ped.state === PedestrianState.WALKING) walkingCount++;
      else if (ped.state === PedestrianState.IDLE) idleCount++;
      else if (ped.state === PedestrianState.CROSSING) crossingCount++;
      else if (ped.state === PedestrianState.FLEEING) fleeingCount++;

      // Renk Belirleme
      let r = 0.13, g = 0.77, b = 0.36; // Walking Yeşil
      if (ped.state === PedestrianState.IDLE) {
        r = 0.98; g = 0.80; b = 0.08; // Sarı
      } else if (ped.state === PedestrianState.CROSSING) {
        r = 0.02; g = 0.71; b = 0.83; // Camgöbeği
      } else if (ped.state === PedestrianState.FLEEING) {
        r = 0.94; g = 0.27; b = 0.27; // Kırmızı
      }

      // 1. Çizgi: Yaya -> Hedef Düğüm Çizgisi
      const targetPos = ped.targetNode ? ped.targetNode.position : ped.position;
      this.dynamicPositions[ptr++] = ped.position.x;
      this.dynamicPositions[ptr++] = ped.position.y + 1.2;
      this.dynamicPositions[ptr++] = ped.position.z;

      this.dynamicPositions[ptr++] = targetPos.x;
      this.dynamicPositions[ptr++] = targetPos.y + 0.3;
      this.dynamicPositions[ptr++] = targetPos.z;

      this.dynamicColors[colorPtr++] = r;
      this.dynamicColors[colorPtr++] = g;
      this.dynamicColors[colorPtr++] = b;
      this.dynamicColors[colorPtr++] = r;
      this.dynamicColors[colorPtr++] = g;
      this.dynamicColors[colorPtr++] = b;

      // 2. Çizgi: İleri Bakış / Kaçış Vektörü Çizgisi
      const fwdLen = (ped.state === PedestrianState.FLEEING) ? 3.5 : 1.5;
      const fwdX = ped.position.x + Math.sin(ped.heading) * fwdLen;
      const fwdZ = ped.position.z + Math.cos(ped.heading) * fwdLen;

      this.dynamicPositions[ptr++] = ped.position.x;
      this.dynamicPositions[ptr++] = ped.position.y + 1.2;
      this.dynamicPositions[ptr++] = ped.position.z;

      this.dynamicPositions[ptr++] = fwdX;
      this.dynamicPositions[ptr++] = ped.position.y + 1.2;
      this.dynamicPositions[ptr++] = fwdZ;

      this.dynamicColors[colorPtr++] = 1.0;
      this.dynamicColors[colorPtr++] = 1.0;
      this.dynamicColors[colorPtr++] = 1.0;
      this.dynamicColors[colorPtr++] = r;
      this.dynamicColors[colorPtr++] = g;
      this.dynamicColors[colorPtr++] = b;
    }

    // Kalan tamponu sıfırla
    while (ptr < this.dynamicPositions.length) {
      this.dynamicPositions[ptr++] = 0;
    }

    this.dynamicLinesMesh.geometry.attributes.position.needsUpdate = true;
    this.dynamicLinesMesh.geometry.attributes.color.needsUpdate = true;

    // HUD Güncelle
    if (this.hudElement) {
      this.hudElement.innerHTML = `
        <div style="font-weight:bold;color:#facc15;margin-bottom:4px;">🚶 YAYA & KALDIRIM SİSTEMİ [H]</div>
        <div>Aktif Yaya: <b>${pool.filter(p => p.isActive).length}/${pool.length}</b></div>
        <div>Durumlar: <span style="color:#22c55e">Yürüme:${walkingCount}</span> | <span style="color:#06b6d4">Geçiş:${crossingCount}</span> | <span style="color:#facc15">Bekleme:${idleCount}</span> | <span style="color:#ef4444">Kaçış:${fleeingCount}</span></div>
        <div>Kaldırım Ağı: <b>${this.sidewalkGraph?.nodes.size || 0}</b> Düğüm, <b>${this.sidewalkGraph?.edges.length || 0}</b> Kenar</div>
      `;
    }
  }

  destroy() {
    if (this.hudElement && this.hudElement.parentNode) {
      this.hudElement.parentNode.removeChild(this.hudElement);
    }
    if (this.debugGroup && this.scene) {
      this.scene.remove(this.debugGroup);
    }
  }
}
