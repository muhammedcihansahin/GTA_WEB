import * as THREE from 'three';
import { RoadDebugManager } from './debug/roadDebug.js';
import { PedestrianDebugManager } from './debug/pedestrianDebug.js?v=71';
import { profiler } from './core/PerformanceProfiler.js';

export { RoadDebugManager, PedestrianDebugManager };

/**
 * DebugManager - Geliştirici ve Yol Grafı Görselleştiricisi
 * - 'G' tuşu ile RoadGraph ve Trafik debug çizgilerini açar/kapatır (RoadDebugManager).
 * - 'H' tuşu ile SidewalkGraph ve Yaya debug çizgilerini açar/kapatır (PedestrianDebugManager).
 * - 'B' veya 'F2' tuşu ile genel geliştirici HUD ve profil metriklerini açar/kapatır.
 */
export class DebugManager {
  constructor(scene, roadGraph = null, trafficManager = null, renderer = null, curvedRoadBuilder = null, collisionManager = null, sidewalkGraph = null, pedestrianManager = null) {
    this.scene = scene;
    this.roadGraph = roadGraph;
    this.trafficManager = trafficManager;
    this.renderer = renderer;
    this.curvedRoadBuilder = curvedRoadBuilder;
    this.collisionManager = collisionManager;
    this.sidewalkGraph = sidewalkGraph;
    this.pedestrianManager = pedestrianManager;

    // G tuşu ile çalışan gelişmiş Road & Traffic Debug modülü
    this.roadDebug = new RoadDebugManager(this.scene, this.roadGraph, this.trafficManager, this.curvedRoadBuilder, { toggleKey: 'KeyG' });

    // H tuşu ile çalışan gelişmiş Sidewalk & Pedestrian Debug modülü
    this.pedestrianDebug = new PedestrianDebugManager(this.scene, this.sidewalkGraph, this.pedestrianManager, { toggleKey: 'KeyH' });

    this.isEnabled = false;
    this.debugGroup = new THREE.Group();
    this.debugGroup.name = 'DebugVisualizationGroup';
    this.debugGroup.visible = false;
    this.scene.add(this.debugGroup);

    this.roadLines = null;
    this.nodePoints = null;
    this.npcLines = null;

    this.hudElement = null;
    this.createHudOverlay();
    this.initEvents();

    if (this.roadGraph) {
      this.buildGraphVisualization();
    }
  }

  createHudOverlay() {
    let el = document.getElementById('debug-traffic-hud');
    if (!el) {
      el = document.createElement('div');
      el.id = 'debug-traffic-hud';
      el.style.position = 'fixed';
      el.style.top = '12px';
      el.style.left = '12px';
      el.style.backgroundColor = 'rgba(15, 23, 42, 0.82)';
      el.style.color = '#38bdf8';
      el.style.fontFamily = 'monospace';
      el.style.fontSize = '12px';
      el.style.padding = '8px 14px';
      el.style.borderRadius = '6px';
      el.style.border = '1px solid rgba(56, 189, 248, 0.3)';
      el.style.zIndex = '999999';
      el.style.pointerEvents = 'none';
      el.style.display = 'none';
      document.body.appendChild(el);
    }
    this.hudElement = el;
  }

  initEvents() {
    window.addEventListener('keydown', (e) => {
      // 'B' tuşu veya 'F2' ile debug modunu aç/kapat
      if (e.code === 'KeyB' || e.code === 'F2') {
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

    if (this.isEnabled && !this.roadLines && this.roadGraph) {
      this.buildGraphVisualization();
    }
  }

  buildGraphVisualization() {
    if (!this.roadGraph) return;

    // 1. Kenar Çizgileri (Şeritler: Yeşil çizgiler)
    const linePositions = [];
    for (const edge of this.roadGraph.edges) {
      const wp = edge.waypoints;
      for (let i = 0; i < wp.length - 1; i++) {
        linePositions.push(wp[i].x, wp[i].y + 0.35, wp[i].z);
        linePositions.push(wp[i + 1].x, wp[i + 1].y + 0.35, wp[i + 1].z);
      }
    }

    const lineGeo = new THREE.BufferGeometry();
    lineGeo.setAttribute('position', new THREE.Float32BufferAttribute(linePositions, 3));
    const lineMat = new THREE.LineBasicMaterial({ color: 0x22c55e, linewidth: 2 });
    this.roadLines = new THREE.LineSegments(lineGeo, lineMat);
    this.debugGroup.add(this.roadLines);

    // 2. Düğüm Noktaları (Kavşaklar: Sarı, Normal: Camgöbeği)
    const nodePositions = [];
    const nodeColors = [];
    for (const node of this.roadGraph.nodes.values()) {
      nodePositions.push(node.position.x, node.position.y + 0.40, node.position.z);
      if (node.isIntersection) {
        nodeColors.push(1.0, 0.85, 0.1); // Sarı
      } else {
        nodeColors.push(0.2, 0.8, 1.0); // Camgöbeği
      }
    }

    const pointGeo = new THREE.BufferGeometry();
    pointGeo.setAttribute('position', new THREE.Float32BufferAttribute(nodePositions, 3));
    pointGeo.setAttribute('color', new THREE.Float32BufferAttribute(nodeColors, 3));
    const pointMat = new THREE.PointsMaterial({ size: 0.8, vertexColors: true });
    this.nodePoints = new THREE.Points(pointGeo, pointMat);
    this.debugGroup.add(this.nodePoints);

    // 3. Canlı NPC Hedef Çizgileri için dinamik buffer
    const maxNpcLines = 32;
    const dynamicLineGeo = new THREE.BufferGeometry();
    const dynamicPositions = new Float32Array(maxNpcLines * 2 * 3);
    dynamicLineGeo.setAttribute('position', new THREE.BufferAttribute(dynamicPositions, 3));
    const dynamicMat = new THREE.LineBasicMaterial({ color: 0xef4444, linewidth: 2 });
    this.npcLines = new THREE.LineSegments(dynamicLineGeo, dynamicMat);
    this.debugGroup.add(this.npcLines);
  }

  update() {
    if (this.roadDebug) {
      this.roadDebug.update();
    }
    if (this.pedestrianDebug) {
      this.pedestrianDebug.update();
    }

    if (!this.isEnabled) return;

    // NPC Hedef Çizgilerini Güncelle
    if (this.trafficManager && this.npcLines) {
      const posAttr = this.npcLines.geometry.attributes.position;
      let lineIdx = 0;

      for (let i = 0; i < this.trafficManager.npcs.length; i++) {
        const npc = this.trafficManager.npcs[i];
        if (npc.targetNode) {
          // NPC konumundan hedef düğüme çizgi
          posAttr.setXYZ(lineIdx++, npc.position.x, npc.position.y + 0.8, npc.position.z);
          posAttr.setXYZ(lineIdx++, npc.targetNode.position.x, npc.targetNode.position.y + 0.8, npc.targetNode.position.z);
        }
      }
      posAttr.needsUpdate = true;
    }

    // HUD Metriklerini Güncelle
    if (this.hudElement) {
      const npcsCount = this.trafficManager ? this.trafficManager.npcs.length : 0;
      const nodesCount = this.roadGraph ? this.roadGraph.nodes.size : 0;
      const edgesCount = this.roadGraph ? this.roadGraph.edges.length : 0;
      const pedsCount = this.pedestrianManager ? this.pedestrianManager.pool.filter(p => p.isActive).length : 0;
      const swNodesCount = this.sidewalkGraph ? this.sidewalkGraph.nodes.size : 0;
      const calls = this.renderer ? this.renderer.info.render.calls : 0;
      const triangles = this.renderer ? this.renderer.info.render.triangles : 0;

      const colCount = this.collisionManager ? this.collisionManager.allColliders.length : 0;
      const colActive = this.collisionManager && this.collisionManager.debugEnabled ? '<span style="color:#22c55e;">AÇIK</span>' : '<span style="color:#ef4444;">KAPALI</span>';

      this.hudElement.innerHTML = `
        <div style="font-weight: bold; color: #f59e0b; margin-bottom: 4px;">🛠️ GTA DEBUG OVERLAY [B]</div>
        <div>Aktif NPC Trafik [G]: <span style="color:#fff;">${npcsCount}</span></div>
        <div>Aktif Yayalar [H]: <span style="color:#fff;">${pedsCount}</span></div>
        <div>Kaldırım Düğümleri: <span style="color:#fff;">${swNodesCount}</span></div>
        <div>Yol Düğümleri (Nodes): <span style="color:#fff;">${nodesCount}</span></div>
        <div>Şerit Bağlantıları (Edges): <span style="color:#fff;">${edgesCount}</span></div>
        <div>Çarpışma Kutuları [K]: <span style="color:#fff;">${colCount}</span> (${colActive})</div>
        <div>Draw Calls: <span style="color:#fff;">${calls}</span></div>
        <div>Üçgen Sayısı: <span style="color:#fff;">${triangles.toLocaleString()}</span></div>
        <div style="margin-top: 4px; border-top: 1px dashed rgba(255,255,255,0.2); padding-top: 4px;">
          <div>Performans HUD [O]: <span style="color:#38bdf8;">${profiler.physicsStepTime.toFixed(1)}ms phy | ${profiler.updateTime.toFixed(1)}ms upd</span></div>
        </div>
      `;
    }
  }
}
