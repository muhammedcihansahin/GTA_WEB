/**
 * PerformanceProfiler - Three.js ve Browser Metrik İzleyici
 * Sıfır GC yükü ile FPS, Draw Calls, Triangles, Active Entities,
 * Physics Step Time ve Update Time ölçümlerini takip eder.
 */
export class PerformanceProfiler {
  constructor(renderer = null) {
    this.renderer = renderer;
    this.enabled = true;
    this.visible = false;

    // Metrikler
    this.fps = 60;
    this.drawCalls = 0;
    this.triangles = 0;
    this.geometries = 0;
    this.textures = 0;

    this.activePedestrians = 0;
    this.activeTraffic = 0;

    this.physicsStepTime = 0; // ms
    this.updateTime = 0;      // ms
    this.renderTime = 0;      // ms

    // Dahili zamanlama sayaçları
    this._frameCount = 0;
    this._lastFpsUpdate = performance.now();
    this._lastPhysicsStart = 0;
    this._lastUpdateStart = 0;
    this._lastRenderStart = 0;

    // DOM Panel
    this.hudElement = null;
    this.createHudElement();

    // 'O' tuşu ile açıp kapama
    window.addEventListener('keydown', (e) => {
      if (e.key === 'o' || e.key === 'O') {
        if (!e.ctrlKey && !e.altKey && !e.metaKey) {
          const activeTag = document.activeElement ? document.activeElement.tagName : '';
          if (activeTag !== 'INPUT' && activeTag !== 'TEXTAREA') {
            this.toggleHud();
          }
        }
      }
    });
  }

  createHudElement() {
    if (document.getElementById('perf-profiler-hud')) return;

    this.hudElement = document.createElement('div');
    this.hudElement.id = 'perf-profiler-hud';
    this.hudElement.style.position = 'absolute';
    this.hudElement.style.top = '75px';
    this.hudElement.style.left = '20px';
    this.hudElement.style.backgroundColor = 'rgba(10, 15, 25, 0.88)';
    this.hudElement.style.border = '1px solid rgba(59, 130, 246, 0.4)';
    this.hudElement.style.borderRadius = '8px';
    this.hudElement.style.padding = '10px 14px';
    this.hudElement.style.color = '#e2e8f0';
    this.hudElement.style.fontFamily = 'Consolas, Monaco, "Courier New", monospace';
    this.hudElement.style.fontSize = '12px';
    this.hudElement.style.lineHeight = '1.45';
    this.hudElement.style.zIndex = '9999';
    this.hudElement.style.pointerEvents = 'none';
    this.hudElement.style.display = 'none';
    this.hudElement.style.minWidth = '220px';
    this.hudElement.style.boxShadow = '0 8px 24px rgba(0, 0, 0, 0.5)';

    document.body.appendChild(this.hudElement);
  }

  toggleHud() {
    this.visible = !this.visible;
    if (this.hudElement) {
      this.hudElement.style.display = this.visible ? 'block' : 'none';
    }
  }

  beginPhysics() {
    this._lastPhysicsStart = performance.now();
  }

  endPhysics() {
    const elapsed = performance.now() - this._lastPhysicsStart;
    // Yumuşatılmış hareketli ortalama
    this.physicsStepTime = this.physicsStepTime * 0.85 + elapsed * 0.15;
  }

  beginUpdate() {
    this._lastUpdateStart = performance.now();
  }

  endUpdate() {
    const elapsed = performance.now() - this._lastUpdateStart;
    this.updateTime = this.updateTime * 0.85 + elapsed * 0.15;
  }

  beginRender() {
    this._lastRenderStart = performance.now();
  }

  endRender() {
    const elapsed = performance.now() - this._lastRenderStart;
    this.renderTime = this.renderTime * 0.85 + elapsed * 0.15;
  }

  updateMetrics(activePedCount = 0, activeTrafficCount = 0) {
    this.activePedestrians = activePedCount;
    this.activeTraffic = activeTrafficCount;

    this._frameCount++;
    const now = performance.now();
    const elapsed = now - this._lastFpsUpdate;

    if (elapsed >= 500) {
      this.fps = Math.round((this._frameCount * 1000) / elapsed);
      this._frameCount = 0;
      this._lastFpsUpdate = now;

      if (this.renderer && this.renderer.info) {
        this.drawCalls = this.renderer.info.render.calls || 0;
        this.triangles = this.renderer.info.render.triangles || 0;
        this.geometries = this.renderer.info.memory.geometries || 0;
        this.textures = this.renderer.info.memory.textures || 0;
      }

      if (this.visible && this.hudElement) {
        this.renderHud();
      }
    }
  }

  renderHud() {
    const fpsColor = this.fps >= 55 ? '#22c55e' : this.fps >= 35 ? '#f59e0b' : '#ef4444';
    this.hudElement.innerHTML = `
      <div style="font-weight: bold; color: #38bdf8; margin-bottom: 6px; border-bottom: 1px solid #334155; padding-bottom: 4px;">
        ⚡ PERFORMANS PROFİLER [O]
      </div>
      <div>FPS: <span style="font-weight: bold; color: ${fpsColor};">${this.fps}</span></div>
      <div>Draw Calls: <span style="color: #fff;">${this.drawCalls}</span></div>
      <div>Triangles: <span style="color: #fff;">${this.triangles.toLocaleString()}</span></div>
      <div>Geometries: <span style="color: #94a3b8;">${this.geometries}</span> | Tex: <span style="color: #94a3b8;">${this.textures}</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed #334155;"></div>
      <div>Physics Step: <span style="color: #cbd5e1;">${this.physicsStepTime.toFixed(2)} ms</span></div>
      <div>Update Time: <span style="color: #cbd5e1;">${this.updateTime.toFixed(2)} ms</span></div>
      <div>Render Time: <span style="color: #cbd5e1;">${this.renderTime.toFixed(2)} ms</span></div>
      <div style="margin: 4px 0; border-top: 1px dashed #334155;"></div>
      <div>Aktif Araç: <span style="color: #38bdf8;">${this.activeTraffic}</span></div>
      <div>Aktif Yaya: <span style="color: #a855f7;">${this.activePedestrians}</span></div>
    `;
  }
}

export const profiler = new PerformanceProfiler();
