/**
 * PoliceHelicopter - GTA San Andreas Tarzı LSPD Polis Helikopteri (Police Maverick)
 * ADIM 12: 3+ Aranma seviyesinde havadan takip, dinamik arama projektörü (searchlight),
 * pitch/roll uçuş aerodinamiği ve senkronize 3D rotor sesi.
 */
import * as THREE from 'three';
import { pedestrianAudio } from '../pedestrian/PedestrianAudio.js';

export class PoliceHelicopter {
  constructor(scene) {
    this.scene = scene;
    this.active = false;
    this.position = new THREE.Vector3();
    this.velocity = new THREE.Vector3();
    this.targetAltitude = 32.0; // Oyuncunun üzerindeki irtifa kotu (metre)
    this.speed = 0;
    this.maxSpeed = 24.0; // m/s (~86 km/h)
    this.heading = 0;

    // Rotor dönüş açıları
    this.mainRotorAngle = 0;
    this.tailRotorAngle = 0;

    // Ses ve ışık zamanlayıcıları
    this.rotorSoundTimer = 0;
    this.radioTimer = 0;
    this.strobeTimer = 0;

    // Mesh bileşenleri
    this.mesh = this.createHelicopterMesh();
    this.scene.add(this.mesh);
    this.mesh.visible = false;

    // Dinamik Arama Projektörü (Searchlight)
    this.searchlight = this.createSearchlight();
    this.scene.add(this.searchlight);
    this.scene.add(this.searchlight.target);
  }

  createHelicopterMesh() {
    const group = new THREE.Group();
    group.name = 'LSPD_PoliceHelicopter';

    // 1. Ana Gövde (LSPD Koyu Lacivert / Siyah)
    const bodyMat = new THREE.MeshStandardMaterial({
      color: 0x111e33,
      metalness: 0.6,
      roughness: 0.35
    });
    const bodyGeom = new THREE.BoxGeometry(2.2, 1.8, 4.4);
    const body = new THREE.Mesh(bodyGeom, bodyMat);
    body.position.set(0, 0.4, 0);
    body.castShadow = true;
    group.add(body);

    // 2. Burun ve Kokpit Camı (Koyu cam)
    const glassMat = new THREE.MeshStandardMaterial({
      color: 0x050a12,
      roughness: 0.1,
      metalness: 0.8,
      transparent: true,
      opacity: 0.85
    });
    const noseGeom = new THREE.ConeGeometry(1.2, 1.8, 4);
    noseGeom.rotateX(-Math.PI / 2);
    const nose = new THREE.Mesh(noseGeom, glassMat);
    nose.position.set(0, 0.35, 2.5);
    group.add(nose);

    // 3. Yan Beyaz LSPD Şeritleri
    const stripeMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.4 });
    const stripeLeft = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.45, 3.8), stripeMat);
    stripeLeft.position.set(-1.12, 0.4, 0);
    const stripeRight = stripeLeft.clone();
    stripeRight.position.set(1.12, 0.4, 0);
    group.add(stripeLeft);
    group.add(stripeRight);

    // 4. Kuyruk Borusu (Tail Boom)
    const boomGeom = new THREE.CylinderGeometry(0.35, 0.2, 4.8, 8);
    boomGeom.rotateX(Math.PI / 2);
    const boom = new THREE.Mesh(boomGeom, bodyMat);
    boom.position.set(0, 0.7, -3.8);
    group.add(boom);

    // Kuyruk Kanadı (Vertical Fin)
    const finGeom = new THREE.BoxGeometry(0.12, 1.3, 0.8);
    const fin = new THREE.Mesh(finGeom, bodyMat);
    fin.position.set(0, 1.2, -6.1);
    group.add(fin);

    // 5. Ana Rotor Direği ve Pervaneleri
    const mast = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.7, 8), bodyMat);
    mast.position.set(0, 1.5, 0.2);
    group.add(mast);

    this.mainRotorGroup = new THREE.Group();
    this.mainRotorGroup.position.set(0, 1.85, 0.2);

    const bladeMat = new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.7 });
    const bladeGeom = new THREE.BoxGeometry(0.28, 0.04, 7.8);
    const blade1 = new THREE.Mesh(bladeGeom, bladeMat);
    const blade2 = blade1.clone();
    blade2.rotation.y = Math.PI / 2;
    this.mainRotorGroup.add(blade1);
    this.mainRotorGroup.add(blade2);

    // Yüksek hız devir diski (Rotor Blur Efekti)
    const blurGeom = new THREE.CircleGeometry(3.9, 24);
    blurGeom.rotateX(-Math.PI / 2);
    const blurMat = new THREE.MeshBasicMaterial({
      color: 0x222222,
      transparent: true,
      opacity: 0.25,
      side: THREE.DoubleSide
    });
    const rotorBlur = new THREE.Mesh(blurGeom, blurMat);
    rotorBlur.position.y = 0.02;
    this.mainRotorGroup.add(rotorBlur);

    group.add(this.mainRotorGroup);

    // 6. Kuyruk Rotoru
    this.tailRotorGroup = new THREE.Group();
    this.tailRotorGroup.position.set(0.18, 1.4, -6.2);
    const tailBladeGeom = new THREE.BoxGeometry(0.1, 1.4, 0.03);
    const tailBlade = new THREE.Mesh(tailBladeGeom, bladeMat);
    this.tailRotorGroup.add(tailBlade);
    group.add(this.tailRotorGroup);

    // 7. İniş Kızakları (Skids)
    const skidMat = new THREE.MeshStandardMaterial({ color: 0x333333, metalness: 0.8 });
    const skidGeom = new THREE.CylinderGeometry(0.06, 0.06, 4.2, 8);
    skidGeom.rotateX(Math.PI / 2);

    const skidLeft = new THREE.Mesh(skidGeom, skidMat);
    skidLeft.position.set(-1.1, -0.65, 0.2);
    const skidRight = skidLeft.clone();
    skidRight.position.set(1.1, -0.65, 0.2);
    group.add(skidLeft);
    group.add(skidRight);

    // Kızak dikmeleri
    const strutGeom = new THREE.CylinderGeometry(0.04, 0.04, 0.6, 6);
    for (const sx of [-1.1, 1.1]) {
      for (const sz of [-1.0, 1.2]) {
        const strut = new THREE.Mesh(strutGeom, skidMat);
        strut.position.set(sx * 0.9, -0.35, sz);
        group.add(strut);
      }
    }

    // 8. Flaşör Strobe Işıkları
    const redStrobeMat = new THREE.MeshBasicMaterial({ color: 0xff0000 });
    this.leftStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), redStrobeMat);
    this.leftStrobe.position.set(-1.15, 0.7, -0.4);
    group.add(this.leftStrobe);

    const greenStrobeMat = new THREE.MeshBasicMaterial({ color: 0x00ff00 });
    this.rightStrobe = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.12, 0.12), greenStrobeMat);
    this.rightStrobe.position.set(1.15, 0.7, -0.4);
    group.add(this.rightStrobe);

    return group;
  }

  createSearchlight() {
    const light = new THREE.SpotLight(0xffffff, 0); // Başlangıçta kapalı
    light.angle = Math.PI / 7; // ~25 derece dar odak
    light.penumbra = 0.45;
    light.distance = 95;
    light.decay = 1.2;
    light.castShadow = false; // Performans ve mobil 60 FPS garantisi için kapalı
    return light;
  }

  spawn(centerPos) {
    this.active = true;
    this.mesh.visible = true;
    this.searchlight.intensity = 2.6;

    // Oyuncunun 70 metre gerisinden ve yüksekten spawn et
    const angle = Math.random() * Math.PI * 2;
    this.position.set(
      centerPos.x + Math.sin(angle) * 75,
      centerPos.y + this.targetAltitude + 5,
      centerPos.z + Math.cos(angle) * 75
    );
    this.velocity.set(0, 0, 0);
    this.speed = 10;
    this.heading = angle + Math.PI;

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, this.heading, 0);

    // Spawn anında polis telsiz anonsu
    pedestrianAudio.playPoliceRadioChirp();
  }

  deactivate() {
    this.active = false;
    this.mesh.visible = false;
    this.searchlight.intensity = 0;
  }

  update(delta, playerPos, playerSpeed = 0) {
    if (!this.active) return;

    // 1. Pervanelerin Yüksek Hızlı Dönüşü
    const rotorRps = 24.0; // saniyede 24 tur
    this.mainRotorAngle += rotorRps * Math.PI * 2 * delta;
    this.tailRotorAngle += rotorRps * 2.2 * Math.PI * 2 * delta;
    this.mainRotorGroup.rotation.y = this.mainRotorAngle;
    this.tailRotorGroup.rotation.x = this.tailRotorAngle;

    // 2. Flaşör Strobe Animasyonu (Saniyede 2 flaş)
    this.strobeTimer += delta * 6.0;
    const strobeState = (Math.floor(this.strobeTimer) % 2) === 0;
    this.leftStrobe.visible = strobeState;
    this.rightStrobe.visible = !strobeState;

    // 3. Ses Efektleri (Rotor Chop & Radio)
    this.rotorSoundTimer += delta;
    if (this.rotorSoundTimer >= 0.17) {
      this.rotorSoundTimer = 0;
      pedestrianAudio.playHelicopterRotor(this.position, 1.0);
    }

    this.radioTimer += delta;
    if (this.radioTimer >= 14.0) {
      this.radioTimer = (Math.random() - 0.5) * 4.0; // 12-16 sn arası rastgele anons
      pedestrianAudio.playPoliceRadioChirp();
    }

    // 4. Havadan Takip ve Uçuş Kinematiği
    // Oyuncunun 18 metre arkasında ve 30m yukarısında bir hedef nokta belirle
    const desiredAlt = playerPos.y + this.targetAltitude;
    const dx = playerPos.x - this.position.x;
    const dz = playerPos.z - this.position.z;
    const horizDist = Math.sqrt(dx * dx + dz * dz);

    // Hedef rota açısı
    const targetAngle = Math.atan2(dx, dz);
    let angleDiff = targetAngle - this.heading;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;

    // Yumuşak dönüş
    const turnSpeed = 1.6 * delta;
    this.heading += THREE.MathUtils.clamp(angleDiff, -turnSpeed, turnSpeed);

    // Yatay hız kontrolü (Uzaksa hızlanır, yakınsa hafif yavaşlar)
    const targetSpeed = THREE.MathUtils.clamp(horizDist * 0.7, 4.0, this.maxSpeed);
    this.speed = THREE.MathUtils.lerp(this.speed, targetSpeed, delta * 1.5);

    this.position.x += Math.sin(this.heading) * this.speed * delta;
    this.position.z += Math.cos(this.heading) * this.speed * delta;

    // Dikey irtifa koruma
    this.position.y = THREE.MathUtils.lerp(this.position.y, desiredAlt, delta * 1.2);

    // 5. Uçuş Aerodinamiği (Pitch & Roll Eğilmesi)
    // İleri hızlandıkça burnunu eğer (-pitch), dönerken kanadını yatırır (roll)
    const pitch = THREE.MathUtils.clamp(- (this.speed / this.maxSpeed) * 0.28, -0.32, 0.05);
    const roll = THREE.MathUtils.clamp(-angleDiff * 0.4, -0.35, 0.35);

    this.mesh.position.copy(this.position);
    this.mesh.rotation.set(0, 0, 0);
    this.mesh.rotateY(this.heading);
    this.mesh.rotateX(pitch);
    this.mesh.rotateZ(roll);

    // 6. Arama Projektörünü (Searchlight) Oyuncuya Odakla
    this.searchlight.position.set(this.position.x, this.position.y - 0.5, this.position.z);
    this.searchlight.target.position.set(playerPos.x, playerPos.y, playerPos.z);
    this.searchlight.target.updateMatrixWorld();
  }
}
