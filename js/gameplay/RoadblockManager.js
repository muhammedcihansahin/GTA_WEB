/**
 * RoadblockManager - GTA San Andreas Tarzı Yol Barikatları & Çivi Tuzakları (Spike Strips)
 * ADIM 12: 3+ Aranma seviyesinde oyuncunun rotasına taktik barikat kurma,
 * 3D çivi tuzağı geometrisi ve araç lastiklerini patlatma mekaniği.
 */
import * as THREE from 'three';
import { pedestrianAudio } from '../pedestrian/PedestrianAudio.js';

export class RoadblockManager {
  constructor(scene, collisionManager) {
    this.scene = scene;
    this.collisionManager = collisionManager;
    this.roadblocks = []; // Aktif barikatlar
    this.lastSpawnTime = 0;
    this.spawnCooldown = 22.0; // Barikatlar arası min süre (sn)

    // Paylaşımlı materyaller ve geometriler (Sıfır GC)
    this.spikeMat = new THREE.MeshStandardMaterial({
      color: 0x222222,
      metalness: 0.9,
      roughness: 0.2
    });

    this.spikeTipMat = new THREE.MeshStandardMaterial({
      color: 0xcccccc,
      metalness: 0.95,
      roughness: 0.1
    });

    this.coneMat = new THREE.MeshStandardMaterial({
      color: 0xff5500,
      roughness: 0.4
    });

    this.coneWhiteMat = new THREE.MeshStandardMaterial({
      color: 0xffffff,
      roughness: 0.3
    });
  }

  /**
   * Çivi Tuzağı (Spike Strip) Mesh'i Üretici
   * 4.8m uzunluğunda, asfalta serilen sivri çelik çiviler
   */
  createSpikeStripMesh() {
    const group = new THREE.Group();
    group.name = 'SpikeStrip';

    // 1. Taban Metal Şerit (Katlanabilir zemin ızgarası)
    const baseGeom = new THREE.BoxGeometry(4.8, 0.06, 0.5);
    const base = new THREE.Mesh(baseGeom, this.spikeMat);
    base.position.y = 0.03;
    base.castShadow = true;
    group.add(base);

    // 2. Sivri Çivi Sıraları (2 sıra halinde toplam 24 sivri çivi)
    const spikeGeom = new THREE.ConeGeometry(0.045, 0.16, 5);
    const numSpikes = 12;
    const startX = -2.1;
    const stepX = 4.2 / (numSpikes - 1);

    for (let r = 0; r < 2; r++) {
      const zOffset = (r === 0 ? -0.12 : 0.12);
      for (let i = 0; i < numSpikes; i++) {
        const spike = new THREE.Mesh(spikeGeom, this.spikeTipMat);
        spike.position.set(startX + i * stepX + (r * 0.05), 0.14, zOffset);
        group.add(spike);
      }
    }

    return group;
  }

  /**
   * Barikat Kenar Trafik Konisi Mesh'i
   */
  createTrafficConeMesh() {
    const group = new THREE.Group();

    // Taban
    const base = new THREE.Mesh(
      new THREE.BoxGeometry(0.38, 0.04, 0.38),
      new THREE.MeshStandardMaterial({ color: 0x222222, roughness: 0.8 })
    );
    base.position.y = 0.02;
    group.add(base);

    // Turuncu Koni
    const coneGeom = new THREE.ConeGeometry(0.14, 0.65, 8);
    const cone = new THREE.Mesh(coneGeom, this.coneMat);
    cone.position.y = 0.34;
    group.add(cone);

    // Beyaz Reflektif Bant
    const bandGeom = new THREE.CylinderGeometry(0.09, 0.11, 0.16, 8);
    const band = new THREE.Mesh(bandGeom, this.coneWhiteMat);
    band.position.y = 0.36;
    group.add(band);

    return group;
  }

  /**
   * Barikat Araç Mesh'i (Statik LSPD Devriye Arabası)
   */
  createBarricadeCarMesh() {
    const group = new THREE.Group();

    // Gövde (Siyah)
    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.4, metalness: 0.6 });
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.85, 0.75, 4.2), bodyMat);
    body.position.y = 0.55;
    group.add(body);

    // Beyaz Tavan
    const roofMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.3 });
    const roof = new THREE.Mesh(new THREE.BoxGeometry(1.65, 0.6, 2.3), roofMat);
    roof.position.set(0, 1.15, -0.2);
    group.add(roof);

    // Tepe Lambası
    const barMat = new THREE.MeshStandardMaterial({ color: 0x222222 });
    const bar = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.08, 0.22), barMat);
    bar.position.set(0, 1.5, -0.2);
    group.add(bar);

    const blueLight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0x0066ff }));
    blueLight.position.set(-0.35, 1.56, -0.2);
    group.add(blueLight);

    const redLight = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.12, 0.2), new THREE.MeshBasicMaterial({ color: 0xff1111 }));
    redLight.position.set(0.35, 1.56, -0.2);
    group.add(redLight);

    return group;
  }

  /**
   * Belirtilen koordinat ve açıda yol barikatı kurar
   */
  spawnRoadblock(x, z, heading) {
    const roadblockGroup = new THREE.Group();
    roadblockGroup.position.set(x, 0, z);

    // Zemin kotunu al
    let groundY = 0;
    if (this.collisionManager && this.collisionManager.getGroundInfo) {
      groundY = this.collisionManager.getGroundInfo(x, z).elevation;
    }
    roadblockGroup.position.y = groundY;
    roadblockGroup.rotation.y = heading;

    // 1. Ortaya Çivi Tuzağı (Spike Strip)
    const spikeStrip = this.createSpikeStripMesh();
    spikeStrip.position.set(0, 0, 0);
    roadblockGroup.add(spikeStrip);

    // 2. Sol Açılı Polis Arabası (V Şeklinde)
    const carLeft = this.createBarricadeCarMesh();
    carLeft.position.set(-4.0, 0, -0.8);
    carLeft.rotation.y = 0.52; // ~30 derece açılı
    roadblockGroup.add(carLeft);

    // 3. Sağ Açılı Polis Arabası
    const carRight = this.createBarricadeCarMesh();
    carRight.position.set(4.0, 0, -0.8);
    carRight.rotation.y = -0.52;
    roadblockGroup.add(carRight);

    // 4. Kenar Trafik Konileri
    for (const cx of [-2.6, 2.6]) {
      const cone = this.createTrafficConeMesh();
      cone.position.set(cx, 0, 0.4);
      roadblockGroup.add(cone);
    }

    this.scene.add(roadblockGroup);

    const roadblockData = {
      group: roadblockGroup,
      position: new THREE.Vector3(x, groundY, z),
      spikeCenter: new THREE.Vector3(x, groundY, z),
      spikeWidth: 4.8,
      spikeDepth: 0.6,
      heading: heading,
      active: true,
      hasTriggered: false
    };

    this.roadblocks.push(roadblockData);

    // Barikat kurulduğunda telsiz anonsu çal
    pedestrianAudio.playPoliceRadioChirp();

    return roadblockData;
  }

  /**
   * Oyuncunun hemen önüne anında barikat kurar (Test ve Otonom Tetikleme)
   */
  spawnAheadOfPlayer(playerPos, playerHeading, distance = 45.0) {
    // Oyuncunun gidiş yönü (forward vektörü: heading açısına göre)
    const forwardX = -Math.sin(playerHeading);
    const forwardZ = -Math.cos(playerHeading);

    const bx = playerPos.x + forwardX * distance;
    const bz = playerPos.z + forwardZ * distance;
    const bHeading = playerHeading + Math.PI; // Oyuncuya doğru bakan barikat

    return this.spawnRoadblock(bx, bz, bHeading);
  }

  /**
   * Güncelleme ve Çivi Tuzağı Çarpışma Testi
   */
  update(delta, playerPos, activeVehicle = null, wantedStars = 0) {
    const now = performance.now() / 1000;

    // 1. Otonom Barikat Tetikleme (3+ Yıldız, oyuncu araçtayken ve hızlıyken)
    if (wantedStars >= 3 && activeVehicle && activeVehicle.speed > 8.0) {
      if (this.roadblocks.length === 0 && (now - this.lastSpawnTime > this.spawnCooldown)) {
        this.lastSpawnTime = now;
        this.spawnAheadOfPlayer(activeVehicle.position, activeVehicle.heading, 72.0);
      }
    }

    // 2. Aktif Barikatların İncelenmesi ve Çivi Tuzağı Kontrolü
    for (let i = this.roadblocks.length - 1; i >= 0; i--) {
      const rb = this.roadblocks[i];
      const dist = rb.position.distanceTo(playerPos);

      // Oyuncudan çok uzaklaştıysa (> 130m) temizle
      if (dist > 135) {
        this.scene.remove(rb.group);
        this.roadblocks.splice(i, 1);
        continue;
      }

      // Araç çivi tuzağının üstünden geçti mi?
      if (activeVehicle && !activeVehicle.tiresPunctured && !rb.hasTriggered) {
        const vPos = activeVehicle.position;
        const dX = vPos.x - rb.spikeCenter.x;
        const dZ = vPos.z - rb.spikeCenter.z;
        const horizDist = Math.sqrt(dX * dX + dZ * dZ);

        // Çivi tuzağı etki alanı (~2.6m yarıçap)
        if (horizDist < 2.6) {
          rb.hasTriggered = true;
          if (typeof activeVehicle.punctureTires === 'function') {
            activeVehicle.punctureTires();
          }
          this.showPunctureNotification();
        }
      }
    }
  }

  showPunctureNotification() {
    let alertBox = document.getElementById('spike-alert');
    if (!alertBox) {
      alertBox = document.createElement('div');
      alertBox.id = 'spike-alert';
      alertBox.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 50%;
        transform: translateX(-50%);
        background: rgba(180, 20, 20, 0.88);
        border: 2px solid #ff3333;
        color: #ffffff;
        font-family: 'Pricedown', 'Arial Black', sans-serif;
        font-size: 26px;
        padding: 10px 24px;
        border-radius: 6px;
        letter-spacing: 2px;
        box-shadow: 0 4px 15px rgba(0,0,0,0.8), 0 0 12px rgba(255,0,0,0.6);
        z-index: 10000;
        pointer-events: none;
        animation: pulseAlert 0.3s ease;
      `;
      alertBox.textContent = 'LASTIKLER PATLADI! (ÇIVI TUZAĞI)';
      document.body.appendChild(alertBox);
    }
    alertBox.style.display = 'block';
    setTimeout(() => {
      if (alertBox) alertBox.style.display = 'none';
    }, 3200);
  }

  clearAll() {
    for (const rb of this.roadblocks) {
      this.scene.remove(rb.group);
    }
    this.roadblocks = [];
  }
}
