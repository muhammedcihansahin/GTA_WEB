/**
 * GameStateManager - GTA San Andreas Tarzı Merkezi Oyun Durum Yöneticisi
 * Tüm gameplay durumlarını (Oyuncu, Araç, Wanted, Görev, Zaman, Hava) tek noktada toplar.
 */

export class GameStateManager {
  constructor() {
    this.state = {
      player: {
        health: 100,
        maxHealth: 100,
        armor: 50,
        maxArmor: 100,
        money: 350,
        weapon: 'FIST',
        ammo: 0,
        position: { x: 0, y: 0.5, z: 0 },
        isDead: false
      },
      vehicle: {
        inVehicle: false,
        vehicleName: '',
        speedKmh: 0,
        gear: 1,
        radioStation: 'OFF'
      },
      wanted: {
        stars: 0,
        heat: 0,
        isFlashing: false,
        lastCrimeTime: 0
      },
      mission: {
        activeMission: null,
        objectiveText: '',
        status: 'IDLE', // IDLE, ACTIVE, COMPLETED, FAILED
        timer: 0,
        checkpointIndex: 0
      },
      time: {
        hour: 12,
        minute: 0,
        second: 0,
        dayTimeKey: 'day' // day, sunset, night
      },
      weather: {
        current: 'CLEAR', // CLEAR, FOGGY, OVERCAST
        fogDensity: 0.0015
      }
    };

    this.listeners = new Map();
  }

  // State Dinleyici Kaydı (Dirty-check ve UI reaktivitesi için)
  subscribe(property, callback) {
    if (!this.listeners.has(property)) {
      this.listeners.set(property, new Set());
    }
    this.listeners.get(property).add(callback);
    return () => this.listeners.get(property).delete(callback);
  }

  notify(property) {
    if (this.listeners.has(property)) {
      const callbacks = this.listeners.get(property);
      for (const cb of callbacks) {
        try {
          cb(this.state[property]);
        } catch (e) {
          console.error(`[GameStateManager] Hata (${property}):`, e);
        }
      }
    }
  }

  // Para ve Stat İşlemleri
  addMoney(amount) {
    this.state.player.money = Math.max(0, this.state.player.money + amount);
    this.notify('player');
  }

  applyDamage(damage) {
    let remaining = damage;
    if (this.state.player.armor > 0) {
      const armorAbsorb = Math.min(this.state.player.armor, remaining);
      this.state.player.armor -= armorAbsorb;
      remaining -= armorAbsorb;
    }
    if (remaining > 0) {
      this.state.player.health = Math.max(0, this.state.player.health - remaining);
    }
    if (this.state.player.health <= 0) {
      this.state.player.isDead = true;
    }
    this.notify('player');
  }

  heal(amount) {
    this.state.player.health = Math.min(this.state.player.maxHealth, this.state.player.health + amount);
    this.state.player.isDead = false;
    this.notify('player');
  }

  addArmor(amount) {
    this.state.player.armor = Math.min(this.state.player.maxArmor, this.state.player.armor + amount);
    this.notify('player');
  }

  setWeapon(weaponId, ammo = 0) {
    this.state.player.weapon = weaponId;
    this.state.player.ammo = ammo;
    this.notify('player');
  }

  addAmmo(amount) {
    this.state.player.ammo = Math.max(0, (this.state.player.ammo || 0) + amount);
    this.notify('player');
  }

  setVehicleState(inVehicle, vehicleName = '', speedKmh = 0, gear = 1) {
    this.state.vehicle.inVehicle = inVehicle;
    this.state.vehicle.vehicleName = vehicleName;
    this.state.vehicle.speedKmh = speedKmh;
    this.state.vehicle.gear = gear;
    this.notify('vehicle');
  }

  // Serializer (Save/Load İçin)
  serialize() {
    return {
      version: 1,
      timestamp: Date.now(),
      player: {
        health: this.state.player.health,
        armor: this.state.player.armor,
        money: this.state.player.money,
        position: { ...this.state.player.position }
      },
      wanted: {
        stars: this.state.wanted.stars,
        heat: this.state.wanted.heat
      },
      time: {
        hour: this.state.time.hour,
        minute: this.state.time.minute
      },
      missionProgress: {
        completedMissions: this.completedMissions || []
      }
    };
  }

  deserialize(data) {
    if (!data) return false;
    try {
      if (data.player) {
        this.state.player.health = data.player.health ?? 100;
        this.state.player.armor = data.player.armor ?? 50;
        this.state.player.money = data.player.money ?? 350;
        if (data.player.position) {
          this.state.player.position = { ...data.player.position };
        }
      }
      if (data.wanted) {
        this.state.wanted.stars = data.wanted.stars ?? 0;
        this.state.wanted.heat = data.wanted.heat ?? 0;
      }
      if (data.time) {
        this.state.time.hour = data.time.hour ?? 12;
        this.state.time.minute = data.time.minute ?? 0;
      }
      if (data.missionProgress) {
        this.completedMissions = data.missionProgress.completedMissions || [];
      }
      this.notify('player');
      this.notify('wanted');
      this.notify('time');
      return true;
    } catch (e) {
      console.error('[GameStateManager] Deserialize hatası:', e);
      return false;
    }
  }
}

export const gameState = new GameStateManager();
