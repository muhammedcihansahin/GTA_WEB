import * as THREE from 'three';

/**
 * Nissan GT-R R35 Nismo modelinde birleşik olan 4 tekerlek geometrilerini
 * (Lastik, Diş, Jant, Fren Diski) 4 bağımsız köşe grubuna (FL, FR, RL, RR) ayırır.
 * 
 * @param {THREE.Object3D} modelRoot - GT-R GLTF kök düğümü
 */
export function separateGtrWheels(modelRoot) {
  if (!modelRoot) return;

  // Zaten ayrıştırılmışsa tekrar çalışma
  let alreadySeparated = false;
  modelRoot.traverse(child => {
    if (child.name === 'wheel_fl') alreadySeparated = true;
  });
  if (alreadySeparated) return;

  const targetMeshes = [];
  modelRoot.traverse(child => {
    if (child.isMesh && child.material) {
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      const isWheelPart = mats.some(m => {
        const matName = (m.name || '').toLowerCase();
        return matName.includes('tire') || matName.includes('tread') || matName.includes('rim') || matName.includes('disc');
      });
      if (isWheelPart) {
        targetMeshes.push(child);
      }
    }
  });

  if (targetMeshes.length === 0) return;

  const wheelCenters = {
    FL: new THREE.Vector3(-788.0, -1392.0, 362.0),
    FR: new THREE.Vector3( 788.0, -1392.0, 362.0),
    RL: new THREE.Vector3(-785.0,  1392.0, 363.0),
    RR: new THREE.Vector3( 785.0,  1392.0, 363.0)
  };

  const wheelGroups = {
    FL: new THREE.Group(),
    FR: new THREE.Group(),
    RL: new THREE.Group(),
    RR: new THREE.Group()
  };
  wheelGroups.FL.name = 'wheel_fl';
  wheelGroups.FR.name = 'wheel_fr';
  wheelGroups.RL.name = 'wheel_rl';
  wheelGroups.RR.name = 'wheel_rr';

  wheelGroups.FL.position.copy(wheelCenters.FL);
  wheelGroups.FR.position.copy(wheelCenters.FR);
  wheelGroups.RL.position.copy(wheelCenters.RL);
  wheelGroups.RR.position.copy(wheelCenters.RR);

  const getWheelMaterial = (srcMat) => {
    if (!srcMat) return srcMat;
    const mName = (srcMat.name || '').toLowerCase();
    if (mName.includes('tire') || mName.includes('tread') || mName.includes('rubber')) {
      const rubberMat = srcMat.clone();
      rubberMat.color = new THREE.Color(0x1a1a1a);
      rubberMat.roughness = 0.88;
      rubberMat.metalness = 0.0;
      rubberMat.envMapIntensity = 0.20;
      return rubberMat;
    }
    return srcMat;
  };

  const targetParent = targetMeshes[0]?.parent || modelRoot;

  for (const mesh of targetMeshes) {
    const geo = mesh.geometry;
    if (!geo || !geo.attributes.position || !geo.index) continue;

    const pos = geo.attributes.position;
    const index = geo.index.array;

    const flIndices = [];
    const frIndices = [];
    const rlIndices = [];
    const rrIndices = [];

    for (let i = 0; i < index.length; i += 3) {
      const a = index[i];
      const b = index[i + 1];
      const c = index[i + 2];

      const cx = (pos.getX(a) + pos.getX(b) + pos.getX(c)) / 3;
      const cy = (pos.getY(a) + pos.getY(b) + pos.getY(c)) / 3;

      if (cx < 0 && cy < 0) {
        flIndices.push(a, b, c);
      } else if (cx > 0 && cy < 0) {
        frIndices.push(a, b, c);
      } else if (cx < 0 && cy > 0) {
        rlIndices.push(a, b, c);
      } else {
        rrIndices.push(a, b, c);
      }
    }

    const partMat = getWheelMaterial(mesh.material);

    const createPart = (indices, group, cornerKey) => {
      if (!indices || indices.length === 0) return;
      const center = wheelCenters[cornerKey];

      const posAttr = geo.attributes.position;
      const normAttr = geo.attributes.normal;
      const uvAttr = geo.attributes.uv;

      const newPositions = [];
      const newNormals = [];
      const newUvs = [];
      const newIndices = [];
      const vertexMap = new Map();

      for (let i = 0; i < indices.length; i++) {
        const oldIdx = indices[i];
        let newIdx = vertexMap.get(oldIdx);
        if (newIdx === undefined) {
          newIdx = newPositions.length / 3;
          vertexMap.set(oldIdx, newIdx);

          newPositions.push(
            posAttr.getX(oldIdx) - center.x,
            posAttr.getY(oldIdx) - center.y,
            posAttr.getZ(oldIdx) - center.z
          );
          if (normAttr) {
            newNormals.push(normAttr.getX(oldIdx), normAttr.getY(oldIdx), normAttr.getZ(oldIdx));
          }
          if (uvAttr) {
            newUvs.push(uvAttr.getX(oldIdx), uvAttr.getY(oldIdx));
          }
        }
        newIndices.push(newIdx);
      }

      const subGeo = new THREE.BufferGeometry();
      subGeo.setAttribute('position', new THREE.Float32BufferAttribute(newPositions, 3));
      if (newNormals.length > 0) {
        subGeo.setAttribute('normal', new THREE.Float32BufferAttribute(newNormals, 3));
      }
      if (newUvs.length > 0) {
        subGeo.setAttribute('uv', new THREE.Float32BufferAttribute(newUvs, 2));
      }
      subGeo.setIndex(newIndices);
      subGeo.computeBoundingBox();
      subGeo.computeBoundingSphere();

      const subMesh = new THREE.Mesh(subGeo, partMat);
      subMesh.castShadow = true;
      subMesh.receiveShadow = true;
      group.add(subMesh);
    };

    createPart(flIndices, wheelGroups.FL, 'FL');
    createPart(frIndices, wheelGroups.FR, 'FR');
    createPart(rlIndices, wheelGroups.RL, 'RL');
    createPart(rrIndices, wheelGroups.RR, 'RR');

    if (mesh.parent) {
      mesh.parent.remove(mesh);
    }
  }

  targetParent.add(wheelGroups.FL);
  targetParent.add(wheelGroups.FR);
  targetParent.add(wheelGroups.RL);
  targetParent.add(wheelGroups.RR);
}
