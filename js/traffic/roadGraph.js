import * as THREE from 'three';

/**
 * RoadNode - Yol Ağı Bağlantı ve Kavşak Düğümü
 */
export class RoadNode {
  /**
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {Object} [options]
   */
  constructor(id, x, y, z, options = {}) {
    this.id = id;
    this.position = new THREE.Vector3(x, y, z);
    this.type = options.type || 'intersection'; // 'intersection' | 'waypoint' | 'endpoint' | 'cul_de_sac'
    this.isIntersection = options.isIntersection ?? (this.type === 'intersection');
    this.intersectionId = options.intersectionId || null;

    /** @type {RoadEdge[]} */
    this.incomingEdges = [];
    /** @type {RoadEdge[]} */
    this.outgoingEdges = [];

    // Trafik ışığı ve sinyalizasyon döngüsü (Green / Yellow / Red)
    this.trafficLight = options.hasTrafficLight ? {
      state: options.initialState || 'green', // 'green' | 'yellow' | 'red'
      timer: options.phaseOffset || 0,
      cycleDuration: options.cycleDuration || 22.0, // Tam döngü: Yeşil 8.5s, Sarı 2.5s, Kırmızı 11.0s
      greenDuration: options.greenDuration || 8.5,
      yellowDuration: options.yellowDuration || 2.5,
      phaseOffset: options.phaseOffset || 0,
      controlledEdgeIds: options.controlledEdgeIds || []
    } : null;

    // Düğüm bazlı yerel rezervasyon (Token)
    this.reservedVehicleId = null;
    this.reservationTimer = 0;
    this.maxReservationTime = 7.0; // Saniye cinsinden deadlock güvenlik zaman aşımı
  }

  addOutgoing(edge) {
    if (!this.outgoingEdges.includes(edge)) {
      this.outgoingEdges.push(edge);
    }
  }

  addIncoming(edge) {
    if (!this.incomingEdges.includes(edge)) {
      this.incomingEdges.push(edge);
    }
  }

  /**
   * Trafik ışığı durum makinesini günceller
   * @param {number} delta
   */
  updateTrafficLight(delta) {
    if (!this.trafficLight) return;

    const tl = this.trafficLight;
    tl.timer = (tl.timer + delta) % tl.cycleDuration;

    const gTime = tl.greenDuration;
    const yTime = tl.greenDuration + tl.yellowDuration;

    if (tl.timer < gTime) {
      tl.state = 'green';
    } else if (tl.timer < yTime) {
      tl.state = 'yellow';
    } else {
      tl.state = 'red';
    }
  }

  setTrafficLightState(state) {
    if (this.trafficLight) {
      this.trafficLight.state = state;
    }
  }

  /**
   * Belirli bir kenar veya yaklaşım için ışık durumuna göre geçiş izni sorgular.
   * @param {string} [edgeId]
   * @param {number} [distToNode=99]
   * @param {number} [vehicleSpeed=0]
   * @returns {{ canPass: boolean, reason: 'green'|'yellow_commit'|'yellow_stop'|'red_stop'|'none' }}
   */
  canPassTrafficLight(edgeId = null, distToNode = 99, vehicleSpeed = 0) {
    if (!this.trafficLight) {
      return { canPass: true, reason: 'none' };
    }

    if (this.trafficLight.controlledEdgeIds.length > 0 && edgeId && !this.trafficLight.controlledEdgeIds.includes(edgeId)) {
      return { canPass: true, reason: 'none' };
    }

    const state = this.trafficLight.state;
    if (state === 'green') {
      return { canPass: true, reason: 'green' };
    }

    if (state === 'yellow') {
      // Sarı ışık: Araç kavşağa çok yakınsa (<= 5.5m) ve duruş mesafesi yetersizse geçmeye devam et (Commit point)
      if (distToNode <= 5.5 && vehicleSpeed > 3.0) {
        return { canPass: true, reason: 'yellow_commit' };
      }
      return { canPass: false, reason: 'yellow_stop' };
    }

    // Kırmızı ışık
    return { canPass: false, reason: 'red_stop' };
  }

  /**
   * Kavşak giriş rezervasyonu talep eder
   * @param {number|string} vehicleId
   * @returns {boolean}
   */
  requestReservation(vehicleId) {
    if (this.reservedVehicleId === null || this.reservedVehicleId === vehicleId) {
      this.reservedVehicleId = vehicleId;
      this.reservationTimer = 0;
      return true;
    }
    return false;
  }

  /**
   * Kavşak rezervasyonunu serbest bırakır
   * @param {number|string} vehicleId
   */
  releaseReservation(vehicleId) {
    if (this.reservedVehicleId === vehicleId) {
      this.reservedVehicleId = null;
      this.reservationTimer = 0;
      return true;
    }
    return false;
  }

  /**
   * Rezervasyon zaman aşımı güncellemesi
   * @param {number} delta
   */
  updateReservation(delta) {
    if (this.reservedVehicleId !== null) {
      this.reservationTimer += delta;
      if (this.reservationTimer >= this.maxReservationTime) {
        // Otomatik emniyet tahliyesi (Deadlock önleyici)
        this.reservedVehicleId = null;
        this.reservationTimer = 0;
      }
    }
  }
}

/**
 * RoadLane - Şerit Veri Yapısı
 */
export class RoadLane {
  /**
   * @param {Object} options
   * @param {number} [options.index=0] - 0 en sağ şerit
   * @param {number} [options.offset=0] - Yol merkezine göre enine ofset (metre)
   * @param {number} [options.width=3.5] - Şerit genişliği (metre)
   * @param {number} [options.speedLimit=11.0] - Hız sınırı (m/s)
   * @param {string} [options.direction='forward'] - 'forward' | 'backward'
   */
  constructor(options = {}) {
    this.index = options.index ?? 0;
    this.offset = options.offset ?? 0;
    this.width = options.width ?? 3.5;
    this.speedLimit = options.speedLimit ?? 11.0;
    this.direction = options.direction || 'forward';
  }

  getLateralOffset() {
    return this.offset;
  }
}

/**
 * RoadEdge - İki Düğüm Arasındaki Yönlü Yol Segmenti
 */
export class RoadEdge {
  /**
   * @param {string} id
   * @param {RoadNode} fromNode
   * @param {RoadNode} toNode
   * @param {Object} [options]
   */
  constructor(id, fromNode, toNode, options = {}) {
    this.id = id;
    this.fromNode = fromNode;
    this.toNode = toNode;

    this.type = options.type || 'street'; // 'boulevard' | 'street' | 'curve' | 'turn' | 'cul_de_sac'
    this.speedLimit = options.speedLimit ?? 11.0; // ~40 km/h
    this.isOneWay = options.isOneWay ?? true;

    // Şeritler
    if (options.lanes && Array.isArray(options.lanes)) {
      this.lanes = options.lanes;
    } else {
      const laneOffset = options.laneOffset ?? 0;
      this.lanes = [new RoadLane({ index: 0, offset: laneOffset, speedLimit: this.speedLimit })];
    }

    // Eğri veya waypoint verisi
    this.curve = options.curve || null;
    this.waypoints = options.waypoints ? options.waypoints.map(p => p.clone()) : [
      fromNode.position.clone(),
      toNode.position.clone()
    ];

    // Segment uzunluklarını önceden hesapla (hızlı t enterpolasyonu için)
    this._accumDistances = [0];
    this.length = this._calculateTotalLength();

    // GC dostu dahili geçici vektörler
    this._tmpDir = new THREE.Vector3();
    this._tmpNormal = new THREE.Vector3();
  }

  _calculateTotalLength() {
    let total = 0;
    this._accumDistances = [0];
    for (let i = 0; i < this.waypoints.length - 1; i++) {
      const segLen = this.waypoints[i].distanceTo(this.waypoints[i + 1]);
      total += segLen;
      this._accumDistances.push(total);
    }
    return Math.max(total, 0.001);
  }

  getLength() {
    return this.length;
  }

  /**
   * t parametresine (0..1) göre yol merkez hattındaki noktayı hesaplar.
   * @param {number} t - 0..1 arası ilerleme
   * @param {THREE.Vector3} [target]
   * @returns {THREE.Vector3}
   */
  getPointAt(t, target = new THREE.Vector3()) {
    const clampedT = THREE.MathUtils.clamp(t, 0, 1);

    if (this.curve && typeof this.curve.getPointAt === 'function') {
      return this.curve.getPointAt(clampedT, target);
    }

    const targetDist = this.length * clampedT;
    const wp = this.waypoints;

    for (let i = 0; i < wp.length - 1; i++) {
      const dStart = this._accumDistances[i];
      const dEnd = this._accumDistances[i + 1];

      if (targetDist <= dEnd || i === wp.length - 2) {
        const segLen = dEnd - dStart;
        const segT = segLen > 0.0001 ? (targetDist - dStart) / segLen : 0;
        target.lerpVectors(wp[i], wp[i + 1], THREE.MathUtils.clamp(segT, 0, 1));
        return target;
      }
    }

    target.copy(wp[wp.length - 1]);
    return target;
  }

  /**
   * t anındaki yatay birim teğet vektörünü verir.
   * @param {number} t
   * @param {THREE.Vector3} [target]
   * @returns {THREE.Vector3}
   */
  getTangentAt(t, target = new THREE.Vector3()) {
    const clampedT = THREE.MathUtils.clamp(t, 0, 1);

    if (this.curve && typeof this.curve.getTangentAt === 'function') {
      return this.curve.getTangentAt(clampedT, target).normalize();
    }

    const targetDist = this.length * clampedT;
    const wp = this.waypoints;

    for (let i = 0; i < wp.length - 1; i++) {
      const dStart = this._accumDistances[i];
      const dEnd = this._accumDistances[i + 1];

      if (targetDist <= dEnd || i === wp.length - 2) {
        target.subVectors(wp[i + 1], wp[i]).normalize();
        if (target.lengthSq() < 0.0001) target.set(0, 0, 1);
        return target;
      }
    }

    target.subVectors(wp[wp.length - 1], wp[wp.length - 2]).normalize();
    return target;
  }

  /**
   * Belirli bir şerit için yan ofset uygulanmış pozisyonu hesaplar.
   * Sağdan trafik: teğet yönüne dik sağ normal vektörü kullanılır.
   * @param {number} t
   * @param {number} [laneIndex=0]
   * @param {THREE.Vector3} [target]
   * @returns {THREE.Vector3}
   */
  getLanePointAt(t, laneIndex = 0, target = new THREE.Vector3()) {
    this.getPointAt(t, target);
    const lane = this.lanes[laneIndex] || this.lanes[0];
    const offset = lane ? lane.getLateralOffset() : 0;

    if (Math.abs(offset) > 0.001) {
      this.getTangentAt(t, this._tmpDir);
      // XZ düzleminde sağa dik yatay normal: (T.z, 0, -T.x)
      this._tmpNormal.set(this._tmpDir.z, 0, -this._tmpDir.x).normalize();
      target.addScaledVector(this._tmpNormal, offset);
    }
    return target;
  }

  /**
   * t noktasındaki seyir açısı (Y ekseni etrafında heading/yaw)
   * @param {number} t
   * @returns {number} Radyan cinsinden açı
   */
  getHeadingAt(t) {
    this.getTangentAt(t, this._tmpDir);
    return Math.atan2(this._tmpDir.x, this._tmpDir.z);
  }
}

/**
 * IntersectionBlock - Ortak Kavşak Rezervasyon ve Çakışma Önleyici Alanı (Token Sistemi)
 */
export class IntersectionBlock {
  constructor(id, x, z) {
    this.id = id;
    this.position = new THREE.Vector3(x, 0, z);
    this.activeVehicleId = null;
    this.occupancyTimer = 0;
    this.maxDuration = 6.0; // Maksimum kavşak işgal süresi (saniye emniyeti)
    this.waitingQueue = []; // Bekleyen araç ID'leri (FIFO)
  }

  canEnter(vehicleId) {
    if (this.activeVehicleId === null || this.activeVehicleId === vehicleId) {
      return true;
    }
    return false;
  }

  requestEnter(vehicleId) {
    if (this.activeVehicleId === null || this.activeVehicleId === vehicleId) {
      this.activeVehicleId = vehicleId;
      this.occupancyTimer = 0;
      const idx = this.waitingQueue.indexOf(vehicleId);
      if (idx !== -1) this.waitingQueue.splice(idx, 1);
      return true;
    }

    if (!this.waitingQueue.includes(vehicleId)) {
      this.waitingQueue.push(vehicleId);
    }
    return false;
  }

  leave(vehicleId) {
    const idx = this.waitingQueue.indexOf(vehicleId);
    if (idx !== -1) this.waitingQueue.splice(idx, 1);

    if (this.activeVehicleId === vehicleId) {
      this.activeVehicleId = null;
      this.occupancyTimer = 0;
      // Sıradaki bekleyen araca token devret
      if (this.waitingQueue.length > 0) {
        this.activeVehicleId = this.waitingQueue.shift();
      }
      return true;
    }
    return false;
  }

  update(delta) {
    if (this.activeVehicleId !== null) {
      this.occupancyTimer += delta;
      if (this.occupancyTimer >= this.maxDuration) {
        // Deadlock durumunda zaman aşımı: sonraki araca aktar veya serbest bırak
        this.activeVehicleId = null;
        this.occupancyTimer = 0;
        if (this.waitingQueue.length > 0) {
          this.activeVehicleId = this.waitingQueue.shift();
        }
      }
    }
  }
}

/**
 * RoadGraph - Şehir Yol Ağı Topolojisi ve Navigasyon Grafı
 */
export class RoadGraph {
  constructor() {
    /** @type {Map<string, RoadNode>} */
    this.nodes = new Map();
    /** @type {RoadEdge[]} */
    this.edges = [];
    /** @type {Map<string, RoadEdge>} */
    this.edgeMap = new Map();
    /** @type {Map<string, IntersectionBlock>} */
    this.intersections = new Map();

    // GC dostu geçici çalışma vektörleri
    this._tmpVec = new THREE.Vector3();
    this._tmpDir = new THREE.Vector3();
  }

  clear() {
    this.nodes.clear();
    this.edges = [];
    this.edgeMap.clear();
    this.intersections.clear();
  }

  getOrCreateIntersection(id, x, z) {
    if (!this.intersections.has(id)) {
      this.intersections.set(id, new IntersectionBlock(id, x, z));
    }
    return this.intersections.get(id);
  }

  getIntersection(id) {
    return this.intersections.get(id) || null;
  }

  /**
   * Her simülasyon adımında tüm kavşak bloklarını ve trafik ışıklarını günceller
   * @param {number} delta
   */
  update(delta) {
    // 1. Düğüm trafik ışıklarını ve düğüm rezervasyonlarını güncelle
    for (const node of this.nodes.values()) {
      if (node.trafficLight) {
        node.updateTrafficLight(delta);
      }
      if (node.reservedVehicleId !== null) {
        node.updateReservation(delta);
      }
    }

    // 2. Kavşak blok rezervasyonlarını ve kuyruklarını güncelle
    for (const inter of this.intersections.values()) {
      inter.update(delta);
    }
  }

  /**
   * Grafiğe yeni bir düğüm ekler veya mevcut olanı döndürür.
   * @param {string} id
   * @param {number} x
   * @param {number} y
   * @param {number} z
   * @param {Object} [options]
   * @returns {RoadNode}
   */
  addNode(id, x, y, z, options = {}) {
    if (this.nodes.has(id)) {
      const existing = this.nodes.get(id);
      if (options.isIntersection !== undefined) {
        existing.isIntersection = options.isIntersection;
      }
      return existing;
    }

    const node = new RoadNode(id, x, y, z, options);
    this.nodes.set(id, node);
    return node;
  }

  getNode(id) {
    return this.nodes.get(id) || null;
  }

  /**
   * İki düğüm arasına yönlü bir kenar (şerit bağlantısı) ekler.
   * @param {string} fromId
   * @param {string} toId
   * @param {Object} [options]
   * @returns {RoadEdge|null}
   */
  addEdge(fromId, toId, options = {}) {
    const fromNode = this.getNode(fromId);
    const toNode = this.getNode(toId);
    if (!fromNode || !toNode) {
      console.warn(`[RoadGraph] Kenar eklenemedi: Düğüm bulunamadı (${fromId} -> ${toId})`);
      return null;
    }

    const edgeId = options.id || `${fromId}->${toId}`;
    if (this.edgeMap.has(edgeId)) {
      return this.edgeMap.get(edgeId);
    }

    const edge = new RoadEdge(edgeId, fromNode, toNode, options);
    fromNode.addOutgoing(edge);
    toNode.addIncoming(edge);

    this.edges.push(edge);
    this.edgeMap.set(edgeId, edge);
    return edge;
  }

  getEdge(id) {
    return this.edgeMap.get(id) || null;
  }

  /**
   * Koordinata en yakın yol düğümünü bulur.
   * @param {THREE.Vector3} pos
   * @param {Function} [filterFn]
   * @returns {RoadNode|null}
   */
  getNearestNode(pos, filterFn = null) {
    let nearest = null;
    let minDistSq = Infinity;

    for (const node of this.nodes.values()) {
      if (filterFn && !filterFn(node)) continue;
      const distSq = pos.distanceToSquared(node.position);
      if (distSq < minDistSq) {
        minDistSq = distSq;
        nearest = node;
      }
    }
    return nearest;
  }

  /**
   * Koordinata en yakın yol kenarını bulur.
   * @param {THREE.Vector3} pos
   * @returns {{ edge: RoadEdge, distance: number, t: number, point: THREE.Vector3 }|null}
   */
  getNearestEdge(pos) {
    let best = null;
    let minDist = Infinity;
    const testPoint = new THREE.Vector3();

    for (const edge of this.edges) {
      const numChecks = Math.max(2, Math.floor(edge.length / 8));
      for (let i = 0; i <= numChecks; i++) {
        const t = i / numChecks;
        edge.getPointAt(t, testPoint);
        const dist = pos.distanceTo(testPoint);
        if (dist < minDist) {
          minDist = dist;
          best = { edge, distance: dist, t, point: testPoint.clone() };
        }
      }
    }
    return best;
  }

  /**
   * Kavşaktan sonra gidilebilecek uygun kenarı seçer.
   * Geriye ters U dönüşünü (cul-de-sac hariç) engeller.
   * @param {RoadEdge|null} currentEdge
   * @param {RoadNode} atNode
   * @param {boolean} [allowUTurn=false]
   * @returns {RoadEdge|null}
   */
  getNextEdge(currentEdge, atNode, allowUTurn = false) {
    if (!atNode || atNode.outgoingEdges.length === 0) return null;

    const outEdges = atNode.outgoingEdges;
    if (outEdges.length === 1) return outEdges[0];

    let validEdges = outEdges;
    if (currentEdge && !allowUTurn && atNode.type !== 'cul_de_sac') {
      const filtered = outEdges.filter(e => e.toNode !== currentEdge.fromNode);
      if (filtered.length > 0) validEdges = filtered;
    }

    const randomIndex = Math.floor(Math.random() * validEdges.length);
    return validEdges[randomIndex];
  }

  /**
   * Rastgele geçerli bir kenar üzerinde spawn noktası ve açısı üretir.
   * @returns {{ position: THREE.Vector3, heading: number, edge: RoadEdge, targetNode: RoadNode }|null}
   */
  getRandomSpawnPoint() {
    if (this.edges.length === 0) return null;

    const edge = this.edges[Math.floor(Math.random() * this.edges.length)];
    const t = 0.2 + Math.random() * 0.6; // Düğümlerin tam üstüne düşmemesi için 0.2-0.8 arası
    const pos = new THREE.Vector3();
    edge.getLanePointAt(t, 0, pos);
    const heading = edge.getHeadingAt(t);

    return {
      position: pos,
      heading,
      edge,
      targetNode: edge.toNode
    };
  }

  /**
   * Arazi yöneticisiyle uyumlu zemin kotu sorgular.
   * @param {number} x
   * @param {number} z
   * @param {Object} [terrainManager]
   * @param {number} [surfaceOffset=0.08]
   * @returns {number}
   */
  sampleElevation(x, z, terrainManager = null, surfaceOffset = 0.08) {
    if (!terrainManager) return surfaceOffset;
    const h = typeof terrainManager.getHeightAt === 'function'
      ? terrainManager.getHeightAt(x, z)
      : (typeof terrainManager.getElevation === 'function' ? terrainManager.getElevation(x, z) : 0);
    return h + surfaceOffset;
  }

  /**
   * Mevcut ızgara yollarından (ana bulvarlar, caddeler ve cul-de-sac'lar) grafı kurar.
   * @param {Object} [terrainManager] - getHeightAt(x, z) içeren arazi yöneticisi
   * @param {Object} [options]
   */
  buildFromGrid(terrainManager = null, options = {}) {
    const surfaceOffset = options.elevationOffset ?? 0.08;
    const getY = (x, z) => this.sampleElevation(x, z, terrainManager, surfaceOffset);

    // 1. Grid Koordinatları (roads.js ve parcels.js ile tam eşleşen akslar)
    const avenueCoords = [-135, -65, 0, 65, 135];
    const boundaryPoints = [-240, -135, -65, 0, 65, 135, 240];

    // Şerit ofsetleri (14m Bulvarda 3.5m, 10m Caddede 2.5m)
    const getOffset = (center) => (center === 0 ? 3.5 : 2.5);

    // 2. Düğümleri Üret (Sağdan trafik için ayrık şerit düğümleri)
    // Kuzey-Güney (NS) Aksları:
    for (const xCenter of avenueCoords) {
      const offset = getOffset(xCenter);
      for (const z of boundaryPoints) {
        const isInter = avenueCoords.includes(z);
        const interId = isInter ? `INT_${xCenter}_${z}` : null;
        if (isInter) {
          this.getOrCreateIntersection(interId, xCenter, z);
        }

        // Güneye giden (SB): x = xCenter - offset
        const sbId = `NS_SB_${xCenter}_${z}`;
        this.addNode(sbId, xCenter - offset, getY(xCenter - offset, z), z, {
          isIntersection: isInter,
          intersectionId: interId,
          hasTrafficLight: isInter,
          phaseOffset: 0, // NS yönü Yeşil faz ile başlar
          type: 'intersection'
        });

        // Kuzeye giden (NB): x = xCenter + offset
        const nbId = `NS_NB_${xCenter}_${z}`;
        this.addNode(nbId, xCenter + offset, getY(xCenter + offset, z), z, {
          isIntersection: isInter,
          intersectionId: interId,
          hasTrafficLight: isInter,
          phaseOffset: 0, // NS yönü Yeşil faz ile başlar
          type: 'intersection'
        });
      }
    }

    // Doğu-Batı (EW) Aksları:
    for (const zCenter of avenueCoords) {
      const offset = getOffset(zCenter);
      for (const x of boundaryPoints) {
        const isInter = avenueCoords.includes(x);
        const interId = isInter ? `INT_${x}_${zCenter}` : null;
        if (isInter) {
          this.getOrCreateIntersection(interId, x, zCenter);
        }

        // Doğuya giden (EB): z = zCenter + offset
        const ebId = `EW_EB_${x}_${zCenter}`;
        this.addNode(ebId, x, getY(x, zCenter + offset), zCenter + offset, {
          isIntersection: isInter,
          intersectionId: interId,
          hasTrafficLight: isInter,
          phaseOffset: 11.0, // EW yönü Kırmızı faz ile başlar (11.0s sonra Yeşile döner)
          type: 'intersection'
        });

        // Batıya giden (WB): z = zCenter - offset
        const wbId = `EW_WB_${x}_${zCenter}`;
        this.addNode(wbId, x, getY(x, zCenter - offset), zCenter - offset, {
          isIntersection: isInter,
          intersectionId: interId,
          hasTrafficLight: isInter,
          phaseOffset: 11.0, // EW yönü Kırmızı faz ile başlar
          type: 'intersection'
        });
      }
    }

    // 3. Doğrusal Yol Kenarlarını (Straight Edges) Bağla
    // Kuzey-Güney Yolları:
    for (const xCenter of avenueCoords) {
      const speed = xCenter === 0 ? 14.0 : 11.0;
      const type = xCenter === 0 ? 'boulevard' : 'street';

      for (let j = 0; j < boundaryPoints.length - 1; j++) {
        const z1 = boundaryPoints[j];
        const z2 = boundaryPoints[j + 1];

        // Güneye akış: z1 -> z2
        this.addEdge(`NS_SB_${xCenter}_${z1}`, `NS_SB_${xCenter}_${z2}`, {
          speedLimit: speed,
          type
        });

        // Kuzeye akış: z2 -> z1
        this.addEdge(`NS_NB_${xCenter}_${z2}`, `NS_NB_${xCenter}_${z1}`, {
          speedLimit: speed,
          type
        });
      }
    }

    // Doğu-Batı Yolları:
    for (const zCenter of avenueCoords) {
      const speed = zCenter === 0 ? 14.0 : 11.0;
      const type = zCenter === 0 ? 'boulevard' : 'street';

      for (let i = 0; i < boundaryPoints.length - 1; i++) {
        const x1 = boundaryPoints[i];
        const x2 = boundaryPoints[i + 1];

        // Doğuya akış: x1 -> x2
        this.addEdge(`EW_EB_${x1}_${zCenter}`, `EW_EB_${x2}_${zCenter}`, {
          speedLimit: speed,
          type
        });

        // Batıya akış: x2 -> x1
        this.addEdge(`EW_WB_${x2}_${zCenter}`, `EW_WB_${x1}_${zCenter}`, {
          speedLimit: speed,
          type
        });
      }
    }

    // 4. Kavşak Geçişleri (Intersection Turns)
    // Her iki aksın kesiştiği noktalarda araçların sağa, sola ve düz dönebilmesi:
    const turnSpeed = 7.5; // ~27 km/h kavşak dönüş hızı
    for (const rx of avenueCoords) {
      for (const rz of avenueCoords) {
        const sbNode = `NS_SB_${rx}_${rz}`;
        const nbNode = `NS_NB_${rx}_${rz}`;
        const ebNode = `EW_EB_${rx}_${rz}`;
        const wbNode = `EW_WB_${rx}_${rz}`;

        // Güneyden gelen: Batıya (sağa) veya Doğuya (sola) dönebilir
        this.addEdge(sbNode, wbNode, { speedLimit: turnSpeed, type: 'turn' });
        this.addEdge(sbNode, ebNode, { speedLimit: turnSpeed, type: 'turn' });

        // Kuzeyden gelen: Doğuya (sağa) veya Batıya (sola) dönebilir
        this.addEdge(nbNode, ebNode, { speedLimit: turnSpeed, type: 'turn' });
        this.addEdge(nbNode, wbNode, { speedLimit: turnSpeed, type: 'turn' });

        // Doğudan gelen: Güneye (sağa) veya Kuzeye (sola) dönebilir
        this.addEdge(ebNode, sbNode, { speedLimit: turnSpeed, type: 'turn' });
        this.addEdge(ebNode, nbNode, { speedLimit: turnSpeed, type: 'turn' });

        // Batıdan gelen: Kuzeye (sağa) veya Güneye (sola) dönebilir
        this.addEdge(wbNode, nbNode, { speedLimit: turnSpeed, type: 'turn' });
        this.addEdge(wbNode, sbNode, { speedLimit: turnSpeed, type: 'turn' });
      }
    }

    // 5. Çıkmaz Sokak Dönüş Halkaları (Grove Street Cul-de-Sacs)
    const culDeSacs = [
      { id: 'cul_west', startX: -135, circleX: -185, z: -32.5, isX: true },
      { id: 'cul_east', startX: 135, circleX: 185, z: 32.5, isX: true },
      { id: 'cul_north', startZ: -135, circleZ: -185, x: 32.5, isX: false },
      { id: 'cul_south', startZ: 135, circleZ: 185, x: -32.5, isX: false }
    ];

    culDeSacs.forEach(c => {
      if (c.isX) {
        const inId = `CUL_IN_${c.id}`;
        const midId = `CUL_MID_${c.id}`;
        const outId = `CUL_OUT_${c.id}`;
        const attachNodeId = c.startX < 0 ? `NS_SB_${c.startX}_-65` : `NS_NB_${c.startX}_65`;

        this.addNode(inId, (c.startX + c.circleX) / 2, getY(c.circleX, c.z), c.z + 2.0, { type: 'cul_de_sac' });
        this.addNode(midId, c.circleX - 8.0 * Math.sign(c.circleX), getY(c.circleX, c.z), c.z, { type: 'cul_de_sac' });
        this.addNode(outId, (c.startX + c.circleX) / 2, getY(c.circleX, c.z), c.z - 2.0, { type: 'cul_de_sac' });

        this.addEdge(attachNodeId, inId, { speedLimit: 8.0, type: 'cul_de_sac' });
        this.addEdge(inId, midId, { speedLimit: 6.0, type: 'cul_de_sac' });
        this.addEdge(midId, outId, { speedLimit: 6.0, type: 'cul_de_sac' });
        this.addEdge(outId, attachNodeId, { speedLimit: 8.0, type: 'cul_de_sac' });
      }
    });

    return this;
  }

  /**
   * CatmullRomCurve3 veya kontrol noktaları dizisinden virajlı yol segmenti ekler.
   * Arazi yüksekliklerini (getHeightAt) otomatik örnekler ve çift yönlü şeritleri bağlar.
   * @param {string} idPrefix
   * @param {THREE.Vector3[]|THREE.Curve} curveOrPoints
   * @param {Object} [terrainManager]
   * @param {Object} [options]
   */
  addCurvedSegment(idPrefix, curveOrPoints, terrainManager = null, options = {}) {
    const numSamples = options.numSamples || 32;
    const laneOffset = options.laneOffset || 2.75;
    const speedLimit = options.speedLimit || 12.5;
    const surfaceOffset = options.elevationOffset ?? 0.12;

    let curve;
    if (curveOrPoints instanceof THREE.Curve) {
      curve = curveOrPoints;
    } else if (Array.isArray(curveOrPoints)) {
      const pts = curveOrPoints.map(p => {
        const v = p.clone();
        v.y = this.sampleElevation(v.x, v.z, terrainManager, surfaceOffset);
        return v;
      });
      curve = new THREE.CatmullRomCurve3(pts, options.closed ?? false, options.curveType || 'centripetal');
    } else {
      console.warn('[RoadGraph] addCurvedSegment: Geçersiz eğri tanımı');
      return null;
    }

    const forwardNodes = [];
    const backwardNodes = [];

    // Eğri boyunca noktaları örnekle
    for (let i = 0; i <= numSamples; i++) {
      const t = i / numSamples;
      const centerPos = curve.getPointAt(t);
      const tangent = curve.getTangentAt(t).normalize();

      // XZ düzleminde yan normal
      const normal = new THREE.Vector3(tangent.z, 0, -tangent.x).normalize();

      // Sağ şerit (Forward)
      const fPos = centerPos.clone().addScaledVector(normal, laneOffset);
      fPos.y = this.sampleElevation(fPos.x, fPos.z, terrainManager, surfaceOffset);
      const fId = `${idPrefix}_FWD_${i}`;
      const fNode = this.addNode(fId, fPos.x, fPos.y, fPos.z, { type: 'curve_anchor' });
      forwardNodes.push(fNode);

      // Sol şerit (Backward / ters yön)
      const bPos = centerPos.clone().addScaledVector(normal, -laneOffset);
      bPos.y = this.sampleElevation(bPos.x, bPos.z, terrainManager, surfaceOffset);
      const bId = `${idPrefix}_BWD_${i}`;
      const bNode = this.addNode(bId, bPos.x, bPos.y, bPos.z, { type: 'curve_anchor' });
      backwardNodes.push(bNode);
    }

    // İleri yönde kenarları bağla
    for (let i = 0; i < forwardNodes.length - 1; i++) {
      this.addEdge(forwardNodes[i].id, forwardNodes[i + 1].id, {
        speedLimit,
        type: 'curve'
      });
    }

    // Geri yönde kenarları bağla
    for (let i = backwardNodes.length - 1; i > 0; i--) {
      this.addEdge(backwardNodes[i].id, backwardNodes[i - 1].id, {
        speedLimit,
        type: 'curve'
      });
    }

    // Kapalı döngü ise uçları birleştir
    if (options.closed) {
      this.addEdge(forwardNodes[forwardNodes.length - 1].id, forwardNodes[0].id, { speedLimit, type: 'curve' });
      this.addEdge(backwardNodes[0].id, backwardNodes[backwardNodes.length - 1].id, { speedLimit, type: 'curve' });
    }

    return { forwardNodes, backwardNodes, curve };
  }

  /**
   * Terrain uyumu için yol koridorunu düzleştirme API hazırlığı (stub / arayüz)
   * @param {Object} terrainManager
   * @param {RoadEdge} edge
   * @param {number} [corridorWidth=12.0]
   */
  flattenCorridor(terrainManager, edge, corridorWidth = 12.0) {
    if (!terrainManager || !edge) return false;
    // İleride TerrainManager üzerinde dinamik yükseklik fırçası (flatten stamp)
    // çalıştırmak üzere taslak kanca.
    if (typeof terrainManager.flattenPath === 'function') {
      terrainManager.flattenPath(edge.waypoints, corridorWidth);
      return true;
    }
    return false;
  }
}
