/**
 * SaveManager - localStorage Tabanlı Kalıcı Oyun Kayıt Sistemi
 */
import { gameState } from './GameStateManager.js';

const SAVE_KEY = 'gta_grove_savegame_v1';

export class SaveManager {
  constructor() {
    this.autoSaveInterval = 60000; // 60 saniye
    this.lastSaveTime = 0;
    this.saveFeedbackTimeout = null;
  }

  save() {
    try {
      const data = gameState.serialize();
      localStorage.setItem(SAVE_KEY, JSON.stringify(data));
      this.lastSaveTime = Date.now();
      this.showFeedback('OYUN KAYDEDİLDİ');
      return true;
    } catch (e) {
      console.warn('[SaveManager] Kayıt başarısız:', e);
      return false;
    }
  }

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (!raw) return false;
      const data = JSON.parse(raw);
      const success = gameState.deserialize(data);
      if (success) {
        this.showFeedback('OYUN YÜKLENDİ');
      }
      return success;
    } catch (e) {
      console.warn('[SaveManager] Yükleme başarısız:', e);
      return false;
    }
  }

  hasSave() {
    return localStorage.getItem(SAVE_KEY) !== null;
  }

  clear() {
    localStorage.removeItem(SAVE_KEY);
    this.showFeedback('KAYIT SİLİNDİ');
  }

  update(delta) {
    // 60 saniyede bir otomatik kayıt
    if (Date.now() - this.lastSaveTime > this.autoSaveInterval) {
      this.save();
    }
  }

  showFeedback(text) {
    let el = document.getElementById('save-feedback-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'save-feedback-banner';
      el.style.cssText = `
        position: fixed;
        bottom: 24px;
        right: 24px;
        background: rgba(10, 15, 20, 0.88);
        border-left: 4px solid #fbc02d;
        color: #fff;
        font-family: 'ChaletCompania', 'Arial Black', sans-serif;
        font-size: 15px;
        letter-spacing: 1px;
        padding: 10px 18px;
        border-radius: 4px;
        box-shadow: 0 4px 16px rgba(0,0,0,0.6);
        pointer-events: none;
        z-index: 9999;
        transition: opacity 0.3s ease, transform 0.3s ease;
        opacity: 0;
        transform: translateY(10px);
      `;
      document.body.appendChild(el);
    }
    el.textContent = text;
    el.style.opacity = '1';
    el.style.transform = 'translateY(0)';

    if (this.saveFeedbackTimeout) clearTimeout(this.saveFeedbackTimeout);
    this.saveFeedbackTimeout = setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(10px)';
    }, 2800);
  }
}

export const saveManager = new SaveManager();
