// Radar Statik Harita Sabitleri
const RADAR_SCALE = 0.85;
const RADAR_BLOCK_COORDS = [
  { x: -65, z: -65, w: 58, h: 58 },
  { x: 7, z: -65, w: 58, h: 58 },
  { x: -65, z: 7, w: 58, h: 58 },
  { x: 7, z: 7, w: 58, h: 58 }
];
const RADAR_AVENUES = [-135, -65, 65, 135];
const RADAR_CUL_DE_SACS = [
  { cx: -185, cz: -32.5 },
  { cx: 185, cz: 32.5 },
  { cx: 32.5, cz: -185 },
  { cx: -32.5, cz: 185 }
];
const RADAR_OFFSCREEN_SIZE = 510; // 600m * 0.85
const RADAR_OFFSCREEN_CENTER = RADAR_OFFSCREEN_SIZE / 2;

export class UIManager {
  constructor(app) {
    this.app = app;

    // Elements
    this.loadingOverlay = document.getElementById('loading-overlay');
    this.loadingStatus = document.getElementById('loading-status');
    this.loadingPercent = document.getElementById('loading-percent');
    this.progressBar = document.getElementById('progress-bar');
    this.gtaProgressContainer = document.getElementById('gta-progress-container');
    this.gtaStartContainer = document.getElementById('gta-start-container');
    this.btnStartGame = document.getElementById('btn-start-game');

    // Splash Sanat Kartları Slaytı
    this.splashArts = [
      document.getElementById('splash-art-1'),
      document.getElementById('splash-art-2')
    ].filter(Boolean);
    this.currentSplashIndex = 0;
    this.splashSlideTimer = null;

    this.statFps = document.getElementById('stat-fps');
    this.statDrawCalls = document.getElementById('stat-drawcalls');
    this.statTriangles = document.getElementById('stat-triangles');
    this.statGpu = document.getElementById('stat-gpu');
    this._lastGpuText = '';

    // HUD Cached Elements (Oyun döngüsünde DOM aramalarını sıfırlamak için)
    this.weaponCard = document.getElementById('gta-weapon');
    this.weaponIcon = document.getElementById('weapon-icon');
    this.weaponAmmo = document.getElementById('weapon-ammo') || document.querySelector('.weapon-ammo');
    this.radarPlayerBlip = document.getElementById('radar-player-blip');
    this.locName = document.querySelector('.gta-location-name');
    this.locSub = document.querySelector('.gta-location-sub');
    this.gtaClock = document.getElementById('gta-clock');
    this.radarCanvas = document.getElementById('gta-radar-canvas');
    this.radarCtx = this.radarCanvas ? this.radarCanvas.getContext('2d') : null;


    this.gtaStars = document.getElementById('gta-stars');
    this.starSpans = this.gtaStars ? Array.from(this.gtaStars.querySelectorAll('.star')) : [];
    this.gtaMoney = document.getElementById('gta-money');
    this.armorFill = document.getElementById('gta-armor-fill');
    this.healthFill = document.getElementById('gta-health-fill');

    // Throttle & Dirty-Check Durumları
    this.lastClockUpdate = 0;
    this.lastLocationUpdate = 0;
    this._lastClockSec = 0;
    this._lastClockText = '';
    this._lastLocName = '';
    this._lastLocSub = '';
    this._lastBlipDeg = null;
    this._lastAttacking = null;
    this._lastWeapon = null;
    this._lastAmmo = null;
    this._lastFps = null;
    this._lastCalls = null;
    this._lastTriangles = null;
    this._lastMoney = null;
    this._lastStars = null;
    this._lastFlashing = null;
    this._lastHealth = null;
    this._lastArmor = null;

    this.initEvents();
    this.bakeRadar();
    this.initSplashSlideshow();
    this.initSplashStartButton();
  }

  initEvents() {
    this.initModelPicker();

    // Atmosphere Quick Toggle Button (Gündüz / Gün Batımı / Gece)
    const timeToggleBtn = document.getElementById('btn-time-toggle');
    const timeIcon = document.getElementById('time-icon');
    const times = ['day', 'sunset', 'night'];
    const timeIcons = { day: '☀️', sunset: '🌅', night: '🌙' };
    let currentTimeIndex = 0;

    timeToggleBtn?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      currentTimeIndex = (currentTimeIndex + 1) % times.length;
      const selectedTime = times[currentTimeIndex];
      this.app.setTimeOfDay(selectedTime);
      if (timeIcon) {
        timeIcon.textContent = timeIcons[selectedTime];
      }
    });

    // Atmosphere / Lighting buttons
    const lightBtns = document.querySelectorAll('#light-selector .pill-btn');
    lightBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.app.audioManager?.playClick();
        lightBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const timeKey = btn.getAttribute('data-time');
        this.app.setTimeOfDay(timeKey);
      });
    });

    // Camera Mode buttons
    const modeBtns = document.querySelectorAll('.mode-btn');
    modeBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        this.app.audioManager?.playClick();
        modeBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const mode = btn.getAttribute('data-mode');
        this.app.cameraManager.setMode(mode);
      });
    });

    // Camera Preset buttons
    document.getElementById('btn-preset-front')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('front');
    });

    document.getElementById('btn-preset-iso')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('iso');
    });

    document.getElementById('btn-preset-interior')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('interior');
    });

    document.getElementById('btn-preset-top')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('top');
    });

    // Neighborhood panoramic overview button
    document.getElementById('btn-preset-city')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('neighborhood');
    });

    // Ana Ev quick focus button
    document.getElementById('btn-preset-home')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.focusHouse('american');
    });

    // Roof toggle button
    document.getElementById('btn-toggle-roof')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      const isVisible = this.app.toggleRoof();
      const roofIcon = document.getElementById('roof-icon');
      const roofText = document.getElementById('roof-text');
      if (isVisible) {
        if (roofIcon) roofIcon.textContent = '🏢';
        if (roofText) roofText.textContent = 'Tavanı Gizle';
      } else {
        if (roofIcon) roofIcon.textContent = '👁️';
        if (roofText) roofText.textContent = 'Tavanı Göster';
      }
    });

    document.getElementById('btn-reset-cam')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      this.app.cameraManager.setPreset('reset');
    });

    // Fullscreen button
    document.getElementById('btn-fullscreen')?.addEventListener('click', () => {
      this.app.audioManager?.playClick();
      if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen?.().catch(() => {});
      } else {
        document.exitFullscreen?.().catch(() => {});
      }
    });

    // Sound toggle button
    const soundBtn = document.getElementById('btn-sound-toggle');
    if (soundBtn) {
      soundBtn.addEventListener('click', () => {
        const isMuted = !this.app.audioManager.toggleSound();
        const icon = soundBtn.querySelector('.sound-icon') || soundBtn;
        const text = soundBtn.querySelector('.sound-text');
        if (isMuted) {
          icon.textContent = '🔇';
          if (text) text.textContent = 'Sessiz';
          soundBtn.classList.add('muted');
        } else {
          icon.textContent = '🔊';
          if (text) text.textContent = 'Ses Açık';
          soundBtn.classList.remove('muted');
        }
      });
    }

    // Model File Picker (<input type="file">)
    const fileInput = document.getElementById('model-file-input');
    const openFileBtn = document.getElementById('btn-open-file');
    if (openFileBtn && fileInput) {
      openFileBtn.addEventListener('click', () => {
        this.app.audioManager?.playClick();
        fileInput.click();
      });
      fileInput.addEventListener('change', (e) => {
        const file = e.target.files?.[0];
        if (file) {
          this.app.loadFromFile(file);
        }
        fileInput.value = '';
      });
    }

    // Drag and Drop support
    const dragOverlay = document.getElementById('drag-overlay');
    let dragCounter = 0;

    window.addEventListener('dragenter', (e) => {
      e.preventDefault();
      dragCounter++;
      if (dragOverlay) dragOverlay.classList.remove('hidden');
    });

    window.addEventListener('dragleave', (e) => {
      e.preventDefault();
      dragCounter--;
      if (dragCounter <= 0) {
        dragCounter = 0;
        if (dragOverlay) dragOverlay.classList.add('hidden');
      }
    });

    window.addEventListener('dragover', (e) => {
      e.preventDefault();
    });

    window.addEventListener('drop', (e) => {
      e.preventDefault();
      dragCounter = 0;
      if (dragOverlay) dragOverlay.classList.add('hidden');
      const file = e.dataTransfer?.files?.[0];
      if (file && (file.name.endsWith('.glb') || file.name.endsWith('.gltf'))) {
        this.app.loadFromFile(file);
      }
    });

    // Helper banner interactions
    document.getElementById('btn-connect-localhost')?.addEventListener('click', () => {
      window.location.href = 'http://localhost:3000/oyna.html';
    });

    document.getElementById('btn-helper-pick')?.addEventListener('click', () => {
      fileInput?.click();
    });

    document.getElementById('btn-close-helper')?.addEventListener('click', () => {
      document.getElementById('local-helper')?.classList.add('hidden');
    });

    // Auto-detect file protocol and check localhost
    if (window.location.protocol === 'file:') {
      const helper = document.getElementById('local-helper');
      if (helper) {
        helper.classList.remove('hidden');
      }
    }
  }

  initModelPicker() {
    this.dropdownMenu = document.getElementById('model-dropdown-menu');
    this.dropdownTrigger = document.getElementById('btn-model-dropdown');
    this.prevBtn = document.getElementById('btn-prev-model');
    this.nextBtn = document.getElementById('btn-next-model');
    this.searchInput = document.getElementById('model-search-input');
    this.clearSearchBtn = document.getElementById('btn-clear-search');
    this.listContainer = document.getElementById('model-list-container');
    this.chevron = document.getElementById('dropdown-chevron');

    this.activeIconEl = document.getElementById('active-model-icon');
    this.activeTitleEl = document.getElementById('active-model-title');
    this.activeCountEl = document.getElementById('active-model-count');

    this.renderModelCatalog();

    // Toggle dropdown
    this.dropdownTrigger?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.audioManager?.playClick();
      this.toggleModelDropdown();
    });

    // Close when clicking outside
    document.addEventListener('click', (e) => {
      if (!this.dropdownMenu?.contains(e.target) && !this.dropdownTrigger?.contains(e.target)) {
        this.closeModelDropdown();
      }
    });

    // Prevent clicks inside dropdown from bubbling up to document
    this.dropdownMenu?.addEventListener('click', (e) => {
      e.stopPropagation();
    });

    // Keyboard navigation: ESC to close, [ and ] for prev/next
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        this.closeModelDropdown();
      } else if (e.key === '[' || e.key === '{') {
        if (!e.target.matches('input, textarea')) {
          this.app.audioManager?.playClick();
          this.app.prevModel();
        }
      } else if (e.key === ']' || e.key === '}') {
        if (!e.target.matches('input, textarea')) {
          this.app.audioManager?.playClick();
          this.app.nextModel();
        }
      }
    });

    // Prev / Next stepper buttons
    this.prevBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.audioManager?.playClick();
      this.app.prevModel();
    });

    this.nextBtn?.addEventListener('click', (e) => {
      e.stopPropagation();
      this.app.audioManager?.playClick();
      this.app.nextModel();
    });

    // Search filter
    this.searchInput?.addEventListener('input', (e) => {
      const q = e.target.value.trim().toLowerCase();
      this.filterModels(q);
      if (this.clearSearchBtn) {
        if (q.length > 0) {
          this.clearSearchBtn.classList.remove('hidden');
        } else {
          this.clearSearchBtn.classList.add('hidden');
        }
      }
    });

    this.clearSearchBtn?.addEventListener('click', () => {
      if (this.searchInput) {
        this.searchInput.value = '';
        this.searchInput.focus();
      }
      this.filterModels('');
      this.clearSearchBtn.classList.add('hidden');
    });
  }

  toggleModelDropdown(forceState) {
    if (!this.dropdownMenu) return;
    const isClosed = this.dropdownMenu.classList.contains('hidden');
    const shouldOpen = forceState !== undefined ? forceState : isClosed;

    if (shouldOpen) {
      this.dropdownMenu.classList.remove('hidden');
      this.dropdownTrigger?.classList.add('active');
      this.chevron?.classList.add('rotate');
      if (this.searchInput) {
        setTimeout(() => this.searchInput.focus(), 60);
      }
      this.scrollActiveIntoView();
    } else {
      this.dropdownMenu.classList.add('hidden');
      this.dropdownTrigger?.classList.remove('active');
      this.chevron?.classList.remove('rotate');
    }
  }

  closeModelDropdown() {
    this.toggleModelDropdown(false);
  }

  renderModelCatalog() {
    if (!this.listContainer || !this.app.catalog) return;
    this.listContainer.innerHTML = '';

    // Group by category
    const categories = {};
    this.app.catalog.forEach((model, index) => {
      const cat = model.category || 'Diğer Evler';
      if (!categories[cat]) categories[cat] = [];
      categories[cat].push({ ...model, overallIndex: index + 1 });
    });

    Object.entries(categories).forEach(([categoryName, models]) => {
      const section = document.createElement('div');
      section.className = 'model-category-section';
      section.setAttribute('data-category', categoryName.toLowerCase());

      const header = document.createElement('div');
      header.className = 'category-header';
      header.textContent = categoryName;
      section.appendChild(header);

      const itemsContainer = document.createElement('div');
      itemsContainer.className = 'category-items';

      models.forEach(m => {
        const item = document.createElement('button');
        item.className = 'model-item-row';
        if (m.id === this.app.activeModelKey) {
          item.classList.add('active');
        }
        item.setAttribute('data-model', m.id);
        item.setAttribute('data-title', m.title.toLowerCase());
        item.setAttribute('data-badge', m.badge.toLowerCase());
        item.setAttribute('data-desc', (m.desc || '').toLowerCase());

        item.innerHTML = `
          <span class="model-item-icon">${m.icon}</span>
          <div class="model-item-details">
            <div class="model-item-title">${m.title}</div>
            <div class="model-item-sub"><span class="badge-chip">${m.badge}</span> ${m.desc || categoryName}</div>
          </div>
          <span class="model-item-idx font-mono">${m.overallIndex}/${this.app.catalog.length}</span>
          <span class="model-check-icon">✓</span>
        `;

        item.addEventListener('click', () => {
          this.app.audioManager?.playClick();
          this.app.loadModel(m.id);
          this.closeModelDropdown();
        });

        itemsContainer.appendChild(item);
      });

      section.appendChild(itemsContainer);
      this.listContainer.appendChild(section);
    });
  }

  filterModels(query) {
    if (!this.listContainer) return;
    const sections = this.listContainer.querySelectorAll('.model-category-section');
    let totalVisible = 0;

    sections.forEach(sec => {
      const items = sec.querySelectorAll('.model-item-row');
      let visibleInSection = 0;

      items.forEach(item => {
        const title = item.getAttribute('data-title') || '';
        const badge = item.getAttribute('data-badge') || '';
        const desc = item.getAttribute('data-desc') || '';
        const match = !query || title.includes(query) || badge.includes(query) || desc.includes(query);

        if (match) {
          item.classList.remove('hidden');
          visibleInSection++;
          totalVisible++;
        } else {
          item.classList.add('hidden');
        }
      });

      if (visibleInSection === 0) {
        sec.classList.add('hidden');
      } else {
        sec.classList.remove('hidden');
      }
    });

    const badge = document.getElementById('catalog-count-badge');
    if (badge) {
      badge.textContent = query ? `${totalVisible} Sonuç` : `${this.app.catalog.length} Model`;
    }
  }

  onModelSelected(modelKey, customName) {
    // Update active trigger text & icon
    const info = this.app.getModelInfo(modelKey);
    const title = customName || info.title;
    const icon = info.icon || '🏡';

    if (this.activeIconEl) this.activeIconEl.textContent = icon;
    if (this.activeTitleEl) this.activeTitleEl.textContent = title;

    const keys = this.app.catalog.map(m => m.id);
    const idx = keys.indexOf(modelKey);
    if (this.activeCountEl) {
      if (idx !== -1) {
        this.activeCountEl.textContent = `${idx + 1}/${this.app.catalog.length}`;
      } else {
        this.activeCountEl.textContent = 'Özel';
      }
    }

    // Update active class in list items
    if (this.listContainer) {
      const items = this.listContainer.querySelectorAll('.model-item-row');
      items.forEach(item => {
        if (item.getAttribute('data-model') === modelKey) {
          item.classList.add('active');
        } else {
          item.classList.remove('active');
        }
      });
    }
  }

  scrollActiveIntoView() {
    setTimeout(() => {
      const activeItem = this.listContainer?.querySelector('.model-item-row.active');
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      }
    }, 50);
  }

  initSplashSlideshow() {
    if (this.splashArts.length <= 1) return;
    this.splashSlideTimer = setInterval(() => {
      if (!this.loadingOverlay || this.loadingOverlay.classList.contains('fade-out')) {
        clearInterval(this.splashSlideTimer);
        return;
      }
      this.splashArts[this.currentSplashIndex]?.classList.remove('active');
      this.currentSplashIndex = (this.currentSplashIndex + 1) % this.splashArts.length;
      this.splashArts[this.currentSplashIndex]?.classList.add('active');
    }, 4500);
  }

  initSplashStartButton() {
    if (!this.btnStartGame) return;
    this.btnStartGame.addEventListener('click', () => {
      // Tarayıcı Web Audio ses motorunu uyandır ve nostaljik intro chime çal
      if (this.app.audioManager) {
        this.app.audioManager.init();
        this.app.audioManager.playIntroChime();
      }
      this.hideLoading();
    });
  }

  showLoading(text = 'Model yükleniyor...', percent = 10) {
    if (!this.loadingOverlay) return;
    this.loadingOverlay.classList.remove('fade-out');
    if (this.gtaProgressContainer) this.gtaProgressContainer.classList.remove('hidden');
    if (this.gtaStartContainer) this.gtaStartContainer.classList.add('hidden');
    if (this.loadingStatus) this.loadingStatus.textContent = text;
    if (this.progressBar) this.progressBar.style.width = `${percent}%`;
    if (this.loadingPercent) this.loadingPercent.textContent = `${Math.round(percent)}%`;
  }

  updateLoading(percent, text) {
    const p = Math.min(Math.max(percent, 0), 100);
    if (this.progressBar) this.progressBar.style.width = `${p}%`;
    if (this.loadingPercent) this.loadingPercent.textContent = `${Math.round(p)}%`;
    if (text && this.loadingStatus) this.loadingStatus.textContent = text;

    if (p >= 100) {
      this.setLoadingReady();
    }
  }

  setLoadingReady() {
    if (this.gtaProgressContainer) this.gtaProgressContainer.classList.add('hidden');
    if (this.gtaStartContainer) this.gtaStartContainer.classList.remove('hidden');
    if (this.loadingStatus) this.loadingStatus.textContent = 'GTA San Andreas Hazır!';
    if (this.loadingPercent) this.loadingPercent.textContent = '100%';
  }

  hideLoading() {
    if (!this.loadingOverlay) return;
    if (this.splashSlideTimer) clearInterval(this.splashSlideTimer);
    this.loadingOverlay.classList.add('fade-out');
  }

  updateStats(sceneStats) {
    // Meshes and Triangles
    if (this.statMeshes) this.statMeshes.textContent = sceneStats.meshes.toLocaleString();
    if (this.statTriangles) this.statTriangles.textContent = sceneStats.triangles.toLocaleString();
  }

  updateFPS(renderer) {
    this.frameCount++;
    const now = performance.now();
    const elapsed = now - this.lastTime;

    if (elapsed >= 500) {
      this.currentFps = Math.round((this.frameCount * 1000) / elapsed);
      if (this.statFps && this._lastFps !== this.currentFps) {
        this._lastFps = this.currentFps;
        this.statFps.textContent = this.currentFps;
      }

      // Draw call ve üçgen istatistikleri (500ms aralıkla güncellenir)
      if (renderer && renderer.info && renderer.info.render) {
        const calls = renderer.info.render.calls;
        const triangles = renderer.info.render.triangles;
        if (this.statDrawCalls && this._lastCalls !== calls) {
          this._lastCalls = calls;
          this.statDrawCalls.textContent = calls;
        }
        if (this.statTriangles && this._lastTriangles !== triangles) {
          this._lastTriangles = triangles;
          this.statTriangles.textContent = triangles.toLocaleString('tr-TR');
        }
      }

      // GPU Telemetri Rozeti Güncellemesi
      if (this.statGpu && window.gpuDiagnostics && this._lastGpuText !== window.gpuDiagnostics.cleanGpuName) {
        this._lastGpuText = window.gpuDiagnostics.cleanGpuName;
        this.statGpu.textContent = window.gpuDiagnostics.cleanGpuName;
        this.statGpu.title = `${window.gpuDiagnostics.renderer} (${window.gpuDiagnostics.isDedicated ? 'Harici GPU' : 'Entegre GPU'})`;
      }

      this.frameCount = 0;
      this.lastTime = now;
    }
  }

  updateGTA(characterManager, camera) {
    if (!characterManager) return;

    // 1. Radar Harita Çizimi ve Oyuncu Blipi
    this.drawRadar(characterManager);

    // 2. Yumruk / Saldırı animasyon efekti (Silah kartı vurgusu)
    if (this.weaponCard) {
      const isAttacking = !!characterManager.isAttacking;
      if (this._lastAttacking !== isAttacking) {
        this._lastAttacking = isAttacking;
        if (isAttacking) {
          this.weaponCard.classList.add('punch-anim');
        } else {
          this.weaponCard.classList.remove('punch-anim');
        }
      }
    }

    // 3. Silah İkonu ve Mermi Sayacı (ADIM 14)
    const currentWeapon = characterManager.currentWeapon || 'fist';
    const currentAmmo = characterManager.ammo !== undefined ? characterManager.ammo : 999;
    if (this._lastWeapon !== currentWeapon || this._lastAmmo !== currentAmmo) {
      this._lastWeapon = currentWeapon;
      this._lastAmmo = currentAmmo;
      if (this.weaponIcon) {
        if (currentWeapon === 'fist') this.weaponIcon.textContent = '👊';
        else if (currentWeapon === 'smg') this.weaponIcon.textContent = '⚡';
        else if (currentWeapon === 'shotgun') this.weaponIcon.textContent = '💥';
        else this.weaponIcon.textContent = '🔫';
      }
      if (this.weaponAmmo) {
        this.weaponAmmo.textContent = currentWeapon === 'fist' ? '∞' : currentAmmo;
      }
    }

    // 4. GTA Oyun İçi Saat & Gameplay HUD
    const now = performance.now();
    if (now - this.lastClockUpdate >= 100) {
      this.lastClockUpdate = now;
      this.updateGameplayHUD();
    }
  }

  updateGameplayHUD() {
    const gs = this.app.gameState?.state;
    if (!gs) return;

    // 1. Para Sayacı
    const money = gs.player.money;
    if (this._lastMoney !== money) {
      this._lastMoney = money;
      if (this.gtaMoney) {
        this.gtaMoney.textContent = `$${String(money).padStart(8, '0')}`;
      }
    }

    // 2. Can & Zırh Barları
    const health = gs.player.health;
    const armor = gs.player.armor;
    if (this._lastHealth !== health) {
      this._lastHealth = health;
      if (this.healthFill) {
        this.healthFill.style.width = `${Math.max(0, Math.min(100, health))}%`;
      }
    }
    if (this._lastArmor !== armor) {
      this._lastArmor = armor;
      if (this.armorFill) {
        this.armorFill.style.width = `${Math.max(0, Math.min(100, armor))}%`;
      }
    }

    // 3. Aranma Seviyesi (Stars & Flashing)
    const stars = gs.wanted.stars;
    const flashing = gs.wanted.isFlashing;
    if (this._lastStars !== stars || this._lastFlashing !== flashing) {
      this._lastStars = stars;
      this._lastFlashing = flashing;
      if (this.starSpans && this.starSpans.length > 0) {
        const isFlashHidden = flashing && (Math.floor(performance.now() / 250) % 2 === 0);
        this.starSpans.forEach((star, idx) => {
          if (idx < stars) {
            star.style.color = isFlashHidden ? 'rgba(255, 255, 255, 0.2)' : '#fbc02d';
            star.style.textShadow = isFlashHidden ? 'none' : '0 0 8px #fbc02d';
          } else {
            star.style.color = 'rgba(255, 255, 255, 0.2)';
            star.style.textShadow = 'none';
          }
        });
      }
    } else if (flashing && this.starSpans) {
      // Sadece yanıp sönme fazı
      const isFlashHidden = Math.floor(performance.now() / 250) % 2 === 0;
      this.starSpans.forEach((star, idx) => {
        if (idx < stars) {
          star.style.color = isFlashHidden ? 'rgba(255, 255, 255, 0.2)' : '#fbc02d';
          star.style.textShadow = isFlashHidden ? 'none' : '0 0 8px #fbc02d';
        }
      });
    }

    // 4. Oyun İçi Saat
    const hr = String(gs.time.hour).padStart(2, '0');
    const mn = String(gs.time.minute).padStart(2, '0');
    const clockText = `${hr}:${mn}`;
    if (this._lastClockText !== clockText) {
      this._lastClockText = clockText;
      if (this.gtaClock) {
        this.gtaClock.textContent = clockText;
      }
    }
  }

  bakeRadar() {
    this.radarBakeCanvas = document.createElement('canvas');
    this.radarBakeCanvas.width = RADAR_OFFSCREEN_SIZE;
    this.radarBakeCanvas.height = RADAR_OFFSCREEN_SIZE;
    const ctx = this.radarBakeCanvas.getContext('2d');
    if (!ctx) return;

    const w = RADAR_OFFSCREEN_SIZE;
    const h = RADAR_OFFSCREEN_SIZE;
    const cx = RADAR_OFFSCREEN_CENTER;
    const cy = RADAR_OFFSCREEN_CENTER;
    const scale = RADAR_SCALE;

    // 1. Zemin (Koyu Los Santos şehir tabanı)
    ctx.fillStyle = '#141d18';
    ctx.fillRect(0, 0, w, h);

    // 2. Şehir Blokları & Mahalle Dokusu
    ctx.fillStyle = '#1a261f';
    RADAR_BLOCK_COORDS.forEach(b => {
      const bx = cx + b.x * scale;
      const bz = cy + b.z * scale;
      ctx.fillRect(bx, bz, b.w * scale, b.h * scale);
    });

    // 3. İkincil Caddeler (x, z = ±65, ±135)
    ctx.fillStyle = '#475569';
    RADAR_AVENUES.forEach(pos => {
      // NS Avenue
      const ax = cx + (pos - 5) * scale;
      ctx.fillRect(ax, 0, 10 * scale, h);
      // EW Avenue
      const az = cy + (pos - 5) * scale;
      ctx.fillRect(0, az, w, 10 * scale);
    });

    // 4. Cul-de-Sac Çıkmaz Sokaklar ve Dönüş Meydanları
    ctx.fillStyle = '#475569';
    RADAR_CUL_DE_SACS.forEach(c => {
      const ccx = cx + c.cx * scale;
      const ccz = cy + c.cz * scale;
      ctx.beginPath();
      ctx.arc(ccx, ccz, 14 * scale, 0, Math.PI * 2);
      ctx.fill();
    });

    // 4b. Virajlı Çevre Yolu (Mulholland Scenic Ring Parkway)
    ctx.strokeStyle = '#526173';
    ctx.lineWidth = 11 * scale;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';
    ctx.beginPath();
    const ringPts = [
      [-135, 135], [-210, 80], [-245, -35], [-225, -150], [-120, -235],
      [0, -250], [130, -230], [225, -130], [240, 30], [185, 160],
      [70, 235], [-65, 240]
    ];
    for (let i = 0; i < ringPts.length; i++) {
      const rx = cx + ringPts[i][0] * scale;
      const rz = cy + ringPts[i][1] * scale;
      if (i === 0) ctx.moveTo(rx, rz);
      else ctx.lineTo(rx, rz);
    }
    ctx.closePath();
    ctx.stroke();

    // Çevre Yolu Sarı Orta Şeridi
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.1;
    ctx.stroke();

    // 5. Ana Bulvarlar (14m Genişlik - x = 0 ve z = 0)
    ctx.fillStyle = '#64748b';
    const nsMainX = cx + (0 - 7) * scale;
    ctx.fillRect(nsMainX, 0, 14 * scale, h);

    const ewMainZ = cy + (0 - 7) * scale;
    ctx.fillRect(0, ewMainZ, w, 14 * scale);

    // Bulvar Sarı Orta Şeritleri
    ctx.strokeStyle = '#eab308';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(cx, 0);
    ctx.lineTo(cx, h);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(0, cy);
    ctx.lineTo(w, cy);
    ctx.stroke();
    ctx.setLineDash([]);

    // 6. CJ Evi & Grove Street Evleri İşaretçileri (Safehouse Sarı/Turuncu Kutu)
    const cjHouseX = cx + (-16) * scale;
    const cjHouseZ = cy + 18 * scale;
    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(cjHouseX, cjHouseZ, 8, 7);
  }

  drawRadar(characterManager) {
    if (!this.radarCanvas) {
      this.radarCanvas = document.getElementById('gta-radar-canvas');
      if (this.radarCanvas) this.radarCtx = this.radarCanvas.getContext('2d');
    }
    if (!this.radarCanvas || !this.radarCtx) return;
    const canvas = this.radarCanvas;
    const ctx = this.radarCtx;


    const w = canvas.width;
    const h = canvas.height;
    const cx = w / 2;
    const cy = h / 2;

    const px = characterManager.position ? characterManager.position.x : 0;
    const pz = characterManager.position ? characterManager.position.z : 0;

    if (!this.radarBakeCanvas) {
      this.bakeRadar();
    }

    ctx.clearRect(0, 0, w, h);
    ctx.save();

    // Dairesel kırpma
    ctx.beginPath();
    ctx.arc(cx, cy, cx - 2, 0, Math.PI * 2);
    ctx.clip();

    // 1. Zemin (Koyu Los Santos şehir tabanı)
    ctx.fillStyle = '#141d18';
    ctx.fillRect(0, 0, w, h);

    // 2. Pişirilmiş (Baked) Haritayı Çiz
    if (this.radarBakeCanvas) {
      const dx = cx - px * RADAR_SCALE - RADAR_OFFSCREEN_CENTER;
      const dy = cy - pz * RADAR_SCALE - RADAR_OFFSCREEN_CENTER;
      ctx.drawImage(this.radarBakeCanvas, dx, dy);
    }

    // 3. Radar Statik Çember ve Halka Hatları (Sade GTA harita ızgarası)
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.08)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(cx, cy, cx * 0.82, 0, Math.PI * 2);
    ctx.stroke();

    // 4. Görev Hedefi Blipi (Sarı Kare)
    const markerPos = this.app.missionManager?.getMarkerPosition?.();
    if (markerPos) {
      let mx = cx + (markerPos.x - px) * RADAR_SCALE;
      let my = cy + (markerPos.z - pz) * RADAR_SCALE;
      const maxR = cx - 8;
      const distFromCenter = Math.hypot(mx - cx, my - cy);
      if (distFromCenter > maxR) {
        const angle = Math.atan2(my - cy, mx - cx);
        mx = cx + Math.cos(angle) * maxR;
        my = cy + Math.sin(angle) * maxR;
      }
      ctx.fillStyle = '#fbc02d';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.fillRect(mx - 4, my - 4, 8, 8);
      ctx.strokeRect(mx - 4, my - 4, 8, 8);
    }

    // 5. Pay 'n' Spray Garaj Blipi (Altın Sarısı 'P' İkonu - ADIM 17)
    const pnsPos = this.app.payNSprayManager?.getGaragePosition?.();
    if (pnsPos) {
      let gx = cx + (pnsPos.x - px) * RADAR_SCALE;
      let gy = cy + (pnsPos.z - pz) * RADAR_SCALE;
      const maxR = cx - 8;
      const distFromCenter = Math.hypot(gx - cx, gy - cy);
      if (distFromCenter > maxR) {
        const angle = Math.atan2(gy - cy, gx - cx);
        gx = cx + Math.cos(angle) * maxR;
        gy = cy + Math.sin(angle) * maxR;
      }
      ctx.fillStyle = '#f59e0b';
      ctx.strokeStyle = '#000000';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(gx, gy, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 7px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText('P', gx, gy + 0.5);
    }

    // 6. ADIM 1: Paramedic Görevi Hasta & Hastane Blipleri
    if (this.app.paramedicMission?.isActive) {
      const pm = this.app.paramedicMission;

      // A. Kurtarılmayı Bekleyen Yaralılar (Yeşil Haç)
      if (pm.patients) {
        for (const pt of pm.patients) {
          if (pt.state === 'BOARDED') continue;
          let ptX = cx + (pt.position.x - px) * RADAR_SCALE;
          let ptY = cy + (pt.position.z - pz) * RADAR_SCALE;
          const maxR = cx - 8;
          const dist = Math.hypot(ptX - cx, ptY - cy);
          if (dist > maxR) {
            const angle = Math.atan2(ptY - cy, ptX - cx);
            ptX = cx + Math.cos(angle) * maxR;
            ptY = cy + Math.sin(angle) * maxR;
          }
          ctx.fillStyle = '#00ff66';
          ctx.strokeStyle = '#000000';
          ctx.lineWidth = 1.2;
          ctx.fillRect(ptX - 3.5, ptY - 1.2, 7.0, 2.4);
          ctx.fillRect(ptX - 1.2, ptY - 3.5, 2.4, 7.0);
          ctx.strokeRect(ptX - 3.5, ptY - 1.2, 7.0, 2.4);
          ctx.strokeRect(ptX - 1.2, ptY - 3.5, 2.4, 7.0);
        }
      }

      // B. Hastane Teslim Noktası (Beyaz Daire İçinde Kırmızı 'H')
      if (pm.patientsInAmbulance > 0 && pm.hospitalPos) {
        let hX = cx + (pm.hospitalPos.x - px) * RADAR_SCALE;
        let hY = cy + (pm.hospitalPos.z - pz) * RADAR_SCALE;
        const maxR = cx - 8;
        const dist = Math.hypot(hX - cx, hY - cy);
        if (dist > maxR) {
          const angle = Math.atan2(hY - cy, hX - cx);
          hX = cx + Math.cos(angle) * maxR;
          hY = cy + Math.sin(angle) * maxR;
        }
        ctx.fillStyle = '#ffffff';
        ctx.strokeStyle = '#d32f2f';
        ctx.lineWidth = 1.8;
        ctx.beginPath();
        ctx.arc(hX, hY, 5.0, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#d32f2f';
        ctx.font = 'bold 7px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('H', hX, hY + 0.5);
      }
    }

    // 7. ADIM 1: Firefighter Görevi Yangın Odakları (Kırmızı/Turuncu Alev Blipi)
    if (this.app.firefighterMission?.isActive) {
      const fm = this.app.firefighterMission;
      if (fm.fires) {
        for (const fire of fm.fires) {
          if (fire.isExtinguished) continue;
          let fX = cx + (fire.position.x - px) * RADAR_SCALE;
          let fY = cy + (fire.position.z - pz) * RADAR_SCALE;
          const maxR = cx - 8;
          const dist = Math.hypot(fX - cx, fY - cy);
          if (dist > maxR) {
            const angle = Math.atan2(fY - cy, fX - cx);
            fX = cx + Math.cos(angle) * maxR;
            fY = cy + Math.sin(angle) * maxR;
          }
          ctx.fillStyle = '#ff4500';
          ctx.strokeStyle = '#ffff00';
          ctx.lineWidth = 1.2;
          ctx.beginPath();
          ctx.moveTo(fX, fY - 5);
          ctx.lineTo(fX + 4, fY + 3.5);
          ctx.lineTo(fX - 4, fY + 3.5);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();
        }
      }
    }

    ctx.restore();

    // 8. Oyuncu Blipi Açısını Güncelle (Sadece açı tam sayı olarak değiştiyse stil yaz)
    if (this.radarPlayerBlip) {
      const deg = Math.round((-characterManager.rotation * 180 / Math.PI) + 180);
      if (this._lastBlipDeg !== deg) {
        this._lastBlipDeg = deg;
        this.radarPlayerBlip.style.transform = `translate(-50%, -50%) rotate(${deg}deg)`;
      }
    }

    // 9. Konum İsmi Güncelleme (Maksimum 500ms'de bir ve değer değiştiyse)
    const now = performance.now();
    if (now - this.lastLocationUpdate >= 500) {
      this.lastLocationUpdate = now;
      if (this.locName && this.locSub) {
        let name = 'GANTON BOULEVARD';
        let sub = 'Los Santos';
        const distToCenter = Math.hypot(px, pz);
        if (distToCenter < 55) {
          name = 'GROVE STREET';
          sub = 'Ganton, Los Santos';
        } else if (px < -60) {
          name = 'IDLEWOOD';
          sub = 'South Los Santos';
        } else if (px > 60) {
          name = 'EAST LOS SANTOS';
          sub = 'Los Santos';
        }

        if (this._lastLocName !== name) {
          this._lastLocName = name;
          this.locName.textContent = name;
        }
        if (this._lastLocSub !== sub) {
          this._lastLocSub = sub;
          this.locSub.textContent = sub;
        }
      }
    }
  }

  updateClock() {
    if (!this.gtaClock) return;
    const currentSec = Math.floor(Date.now() / 1000);
    if (this._lastClockSec === currentSec) return;
    this._lastClockSec = currentSec;

    if (!this._cachedDate) this._cachedDate = new Date();
    this._cachedDate.setTime(currentSec * 1000);
    const hours = String(this._cachedDate.getHours()).padStart(2, '0');
    const mins = String(this._cachedDate.getMinutes()).padStart(2, '0');
    const clockText = `${hours}:${mins}`;
    if (this._lastClockText !== clockText) {
      this._lastClockText = clockText;
      this.gtaClock.textContent = clockText;
    }
  }
}
