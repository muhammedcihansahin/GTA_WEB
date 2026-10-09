import * as THREE from 'three';

/**
 * MissionMarker - 3D Otantik GTA San Andreas Corona / Checkpoint Işık Sütunu
 * Çift katmanlı silindir, genişleyen puls halkası, dönen yüzen ok ve dinamik nokta ışık.
 */
export class MissionMarker {
  constructor(scene) {
    this.scene = scene;
    this.group = new THREE.Group();
    this.group.name = 'InteractiveMissionMarker';

    this.baseY = 0.05;
    this.pulseTime = 0;
    this.rotationY = 0;
    this.markerColor = 0xfbc02d;

    this._buildMesh();
    this.scene.add(this.group);
    this.group.visible = false;
  }

  _buildMesh() {
    // 1. Dikey Yarı Saydam Silindir (Corona Sütunu)
    const cylGeom = new THREE.CylinderGeometry(1.6, 1.6, 4.2, 32, 1, true);
    cylGeom.translate(0, 2.1, 0);
    this.cylinderMat = new THREE.MeshBasicMaterial({
      color: this.markerColor,
      transparent: true,
      opacity: 0.42,
      side: THREE.DoubleSide,
      depthWrite: false
    });
    this.cylinder = new THREE.Mesh(cylGeom, this.cylinderMat);
    this.group.add(this.cylinder);

    // 2. Statik Zemin Çemberi
    const innerRingGeom = new THREE.RingGeometry(1.35, 1.68, 32);
    innerRingGeom.rotateX(-Math.PI / 2);
    innerRingGeom.translate(0, 0.04, 0);
    this.innerRingMat = new THREE.MeshBasicMaterial({
      color: 0xffeb3b,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.85
    });
    this.innerRing = new THREE.Mesh(innerRingGeom, this.innerRingMat);
    this.group.add(this.innerRing);

    // 3. Genişleyen Dalga Puls Halkası
    const pulseGeom = new THREE.RingGeometry(0.8, 1.5, 32);
    pulseGeom.rotateX(-Math.PI / 2);
    pulseGeom.translate(0, 0.03, 0);
    this.pulseMat = new THREE.MeshBasicMaterial({
      color: 0xfff176,
      side: THREE.DoubleSide,
      transparent: true,
      opacity: 0.6
    });
    this.pulseRing = new THREE.Mesh(pulseGeom, this.pulseMat);
    this.group.add(this.pulseRing);

    // 4. Tepe Yüzen Ters Koni (Hedef İğnesi)
    const arrowGeom = new THREE.ConeGeometry(0.42, 0.9, 5);
    arrowGeom.rotateX(Math.PI);
    arrowGeom.translate(0, 4.3, 0);
    this.arrowMat = new THREE.MeshBasicMaterial({
      color: 0xffffff,
      wireframe: false
    });
    this.arrow = new THREE.Mesh(arrowGeom, this.arrowMat);
    this.group.add(this.arrow);

    // 5. Asfaltı Aydınlatan Yumuşak Nokta Işık
    this.light = new THREE.PointLight(0xffeb3b, 1.2, 8.5);
    this.light.position.set(0, 1.2, 0);
    this.group.add(this.light);
  }

  setPosition(x, y, z, color = 0xfbc02d) {
    this.baseY = y;
    this.group.position.set(x, y, z);
    this.setColor(color);
    this.group.visible = true;
  }

  setColor(hexColor) {
    this.markerColor = hexColor;
    this.cylinderMat.color.setHex(hexColor);
    this.innerRingMat.color.setHex(hexColor);
    this.pulseMat.color.setHex(hexColor);
    this.light.color.setHex(hexColor);
  }

  setVisible(visible) {
    this.group.visible = visible;
  }

  getPosition() {
    return this.group.position;
  }

  isPlayerInside(playerPos, radius = 3.2) {
    if (!this.group.visible) return false;
    const dx = playerPos.x - this.group.position.x;
    const dz = playerPos.z - this.group.position.z;
    return (dx * dx + dz * dz) <= (radius * radius);
  }

  update(delta) {
    if (!this.group.visible) return;

    this.rotationY += delta * 2.2;
    this.cylinder.rotation.y = this.rotationY;
    this.arrow.rotation.y = this.rotationY * 1.5;

    // Tepe okunun periyodik süzülmesi
    this.arrow.position.y = Math.sin(this.rotationY * 1.8) * 0.22;

    // Puls zemin halkası animasyonu (0.8x -> 1.7x genişleyip şeffaflaşma)
    this.pulseTime = (this.pulseTime + delta * 1.6) % 1.0;
    const scale = 0.75 + this.pulseTime * 0.95;
    this.pulseRing.scale.set(scale, scale, 1);
    this.pulseMat.opacity = (1.0 - this.pulseTime) * 0.65;
  }

  destroy() {
    this.scene.remove(this.group);
  }
}
