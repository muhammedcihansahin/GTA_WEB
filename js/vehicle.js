import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { assetManager } from './assets/AssetManager.js';
import { PARCEL_PLOTS } from './parcels.js';
import { CameraCollisionSolver } from './camera/CameraCollisionSolver.js';
import { buildWheelRig } from './vehicle/WheelRig.js';
import { separateGtrWheels } from './vehicle/GtrWheelProcessor.js';
import { pedestrianAudio } from './pedestrian/PedestrianAudio.js';
import { EmergencyVehicleFactory } from './vehicle/EmergencyVehicleFactory.js';
import { emergencyAudio } from './gameplay/EmergencyAudio.js';

// Preallocated Quaternion ve Vector değişkenleri (Runtime Sıfır GC)

const _wheelSteerQuatFL = new THREE.Quaternion();
const _wheelSteerQuatFR = new THREE.Quaternion();
const _wheelRollQuat = new THREE.Quaternion();
const _axisX = new THREE.Vector3(1, 0, 0);
const _axisY = new THREE.Vector3(0, 1, 0);

/**
 * Veri Odaklı Araç Handling Konfigürasyonları (GTA Stili Arcade-Simülasyon)
 */
export const HANDLING_CONFIGS = {
  sedan: {
    name: 'Executive Sedan',
    mass: 1450,               // kg
    wheelBase: 2.62,          // Aks mesafesi (m)
    trackWidth: 1.50,         // İz genişliği (m)
    wheelRadius: 0.285,       // Tekerlek yarıçapı
    rideHeight: 0.22,         // Süspansiyon normal sürüş yüksekliği (Asfalta sıfır oturan stance)
    maxForwardSpeed: 60.0,    // ~216 km/h azami sürat
    maxReverseSpeed: 10.0,    // ~36 km/h geri azami sürat
    enginePower: 7.2,         // m/s² çekiş ivmesi (0-100 km/s ~5.8s, dinamik & kontrollü)
    brakeForce: 17.0,         // m/s² gerçekçi ABS ayak freni gücü
    handbrakeDecel: 10.0,     // el freni direnci
    rollingFriction: 0.50,    // yuvarlanma direnci
    airDragCoeff: 0.0016,     // aerodinamik hava direnci katsayısı
    gearThresholds: [0, 35, 70, 115, 160, 220],

    // Tutunma & Yanal Momentum (GTA Karakteristiği)
    lateralGrip: 14.0,        // Normal sürüş yanal tutunması (Ray gibi stabil tutuş)
    driftGrip: 3.2,           // El freni / drift anındaki kayma katsayısı
    driftTriggerSpeed: 5.5,   // Driftin aktifleşebileceği min hız (m/s)

    // Lastik Tutunma & Pacejka Modeli (Tire Slip & Lateral Dynamics)
    pacejkaB: 8.5,            // Sertlik faktörü (Stiffness B)
    pacejkaC: 1.35,           // Şekil faktörü (Shape C)
    tirePeakGrip: 1.25,       // Tepe sürtünme katsayısı mu (kuru asfalt)
    driftGripRatio: 0.45,     // Kayma anında arka lastik tutunma düşüş oranı

    // Direksiyon & Yaw Eylemsizliği (Spin engelleme)
    steerSpeed: 10.0,         // Direksiyon giriş hızı (Tepkili ve çevik)
    steerReturn: 12.0,        // Direksiyon toplama hızı
    steerAngleLowSpeed: 0.68, // Düşük hızda maks dönüş (~39 derece, dar sokak manevrası)
    steerAngleHighSpeed: 0.20,// Yüksek hızda maks dönüş (~11.5 derece)
    yawDamping: 6.8,          // Açısal hız sönümlemesi (Çevik burun yönlenmesi)

    // Süspansiyon & 4 Nokta Zemin (Kütle-Yay-Sönümleyici & Kritik Sönümleme)
    suspensionNaturalFreq: 15.0,// rad/s (omega_n: doğal açısal frekans, ~2.4 Hz)
    dampingRatio: 0.98,         // zeta: 0.98 kritik sönümleme (sonsuz salınımı önler)
    suspensionStiffness: 22.0,  // Dikey takip yay sertliği (geriye dönük uyumluluk)
    suspensionDamping: 14.0,    // Pitch/Roll sönümleme sertliği
    gravity: 22.0,              // Dikey yerçekimi ivmesi
    pitchSensitivity: 0.0042,   // İvmelenme/fren burun dalması
    rollSensitivity: 0.016,     // Viraj yatma hassasiyeti

    // Çarpışma
    restitution: 0.15,        // Yumuşak sekme katsayısı
    wallFriction: 0.70        // Duvar boyunca kayarken hız koruma
  },
  suv: {
    name: 'Toyota bZ4X EV AWD',
    mass: 2050,               // kg (Ağır batarya ve elektrikli SUV şasisi)
    wheelBase: 2.85,          // Aks mesafesi (m)
    trackWidth: 1.62,         // İz genişliği (m)
    wheelRadius: 0.388,       // Tekerlek yarıçapı (~235/55 R19)
    rideHeight: 0.35,         // SUV yerden yüksekliği
    maxForwardSpeed: 45.0,    // ~162 km/h azami sürat (Fabrika limitli EV)
    maxReverseSpeed: 8.5,     // ~30.6 km/h geri azami sürat
    enginePower: 8.0,         // m/s² anlık elektrik torku (Kalkışta çok seri kalkış, 0-100 ~6.9s)
    brakeForce: 18.5,         // m/s² güçlü rejenere + 4 disk fren
    handbrakeDecel: 11.0,     // el freni direnci
    rollingFriction: 0.58,    // geniş lastik sürtünmesi
    airDragCoeff: 0.0022,     // yüksek SUV aerodinamik sürtünmesi
    gearThresholds: [0, 35, 75, 120, 165],

    // Tutunma & Yanal Momentum (Dört Çeker EV Dengesi)
    lateralGrip: 15.5,        // Yüksek yol tutuşu ve dengeli ray hissi
    driftGrip: 3.8,           // Kontrollü kayma
    driftTriggerSpeed: 6.5,   // Min drift hızı

    pacejkaB: 9.0,
    pacejkaC: 1.35,
    tirePeakGrip: 1.30,
    driftGripRatio: 0.50,

    steerSpeed: 9.5,          // Direksiyon giriş hızı
    steerReturn: 11.5,
    steerAngleLowSpeed: 0.66, // Düşük hızda keskin dönüş (~38 derece)
    steerAngleHighSpeed: 0.18,// Yüksek hızda viraj güvenliği
    yawDamping: 7.5,          // Dengeli SUV çevikliği

    suspensionNaturalFreq: 13.5,// Ağır şasiye uygun konforlu yay frekansı
    dampingRatio: 0.98,
    suspensionStiffness: 25.0,
    suspensionDamping: 16.0,
    gravity: 22.0,
    pitchSensitivity: 0.0032,
    rollSensitivity: 0.022,   // Yüksek gövde viraj yatması

    restitution: 0.12,
    wallFriction: 0.65
  },
  classic: {
    name: 'Alfa Romeo Giulia Sprint GTA (1965)',
    mass: 960,                // kg (Hafif safkan yarış klasiği)
    wheelBase: 2.42,          // Aks mesafesi (m)
    trackWidth: 1.34,         // İz genişliği (m)
    wheelRadius: 0.285,       // Tekerlek yarıçapı
    rideHeight: 0.26,         // Alçak klasik spor sürüş yüksekliği
    maxForwardSpeed: 50.0,    // ~180 km/h azami sürat
    maxReverseSpeed: 7.5,     // ~27 km/h geri azami sürat
    enginePower: 5.6,         // m/s² çevik atmosferik ivmelenme (Hafif kasa, 0-100 ~8.6s)
    brakeForce: 14.0,         // m/s² klasik frenleme gücü
    handbrakeDecel: 8.5,      // el freni direnci
    rollingFriction: 0.45,
    airDragCoeff: 0.0015,
    gearThresholds: [0, 28, 58, 95, 138, 185],

    lateralGrip: 12.5,        // Hafif arkadan itişli eğlenceli kayma hissi
    driftGrip: 2.8,           // Kolay ve keyifli oversteer drift
    driftTriggerSpeed: 5.0,

    pacejkaB: 8.0,
    pacejkaC: 1.30,
    tirePeakGrip: 1.20,
    driftGripRatio: 0.40,

    steerSpeed: 11.0,         // Çevik klasik spor direksiyon
    steerReturn: 13.0,
    steerAngleLowSpeed: 0.72, // Düşük hızda maks dönüş (~41.2 derece)
    steerAngleHighSpeed: 0.22,
    yawDamping: 6.2,          // Hızlı ve kıvrak yön değiştirme kabiliyeti

    suspensionNaturalFreq: 17.0,// Sert klasik yarış süspansiyonu
    dampingRatio: 0.95,
    suspensionStiffness: 26.0,
    suspensionDamping: 13.0,
    gravity: 22.0,
    pitchSensitivity: 0.0050,
    rollSensitivity: 0.015,

    restitution: 0.18,
    wallFriction: 0.75
  },
  convertible: {
    name: 'Alfa Spider Quadrifoglio (1986)',
    mass: 1120,               // kg
    wheelBase: 2.25,
    trackWidth: 1.32,
    wheelRadius: 0.280,
    rideHeight: 0.25,
    maxForwardSpeed: 53.0,    // ~190 km/h azami sürat
    maxReverseSpeed: 8.0,     // ~28.8 km/h geri azami sürat
    enginePower: 6.0,         // m/s² ivmelenme (0-100 ~7.6s)
    brakeForce: 15.0,
    handbrakeDecel: 9.0,
    rollingFriction: 0.48,
    airDragCoeff: 0.0018,
    gearThresholds: [0, 30, 65, 105, 148, 195],

    lateralGrip: 13.2,
    driftGrip: 3.0,
    driftTriggerSpeed: 5.2,

    pacejkaB: 8.2,
    pacejkaC: 1.32,
    tirePeakGrip: 1.22,
    driftGripRatio: 0.42,

    steerSpeed: 11.0,
    steerReturn: 13.0,
    steerAngleLowSpeed: 0.72, // Düşük hızda keskin dönüş (~41.2 derece)
    steerAngleHighSpeed: 0.21,
    yawDamping: 6.0,          // Roadster kıvraklığı

    suspensionNaturalFreq: 16.0,
    dampingRatio: 0.96,
    suspensionStiffness: 24.0,
    suspensionDamping: 14.0,
    gravity: 22.0,
    pitchSensitivity: 0.0045,
    rollSensitivity: 0.016,

    restitution: 0.16,
    wallFriction: 0.72
  },
  gtr: {
    name: 'Nissan GT-R R35 Nismo',
    mass: 1720,               // kg (AWD Twin-Turbo Süper Spor)
    wheelBase: 2.78,          // Aks mesafesi (m)
    trackWidth: 1.59,         // İz genişliği (m)
    wheelRadius: 0.355,       // Tekerlek yarıçapı
    rideHeight: 0.20,         // Alçak agresif yarış stance'i
    maxForwardSpeed: 87.5,    // ~315 km/h azami sürat
    maxReverseSpeed: 14.0,    // ~50 km/h geri azami sürat
    enginePower: 11.5,        // m/s² roket ivmelenme (0-100 km/s ~2.8s, canavar tork)
    brakeForce: 24.0,         // m/s² Brembo karbon seramik yarış frenleri
    handbrakeDecel: 14.0,     // sert el freni
    rollingFriction: 0.46,
    airDragCoeff: 0.0014,
    gearThresholds: [0, 45, 90, 150, 225, 315],

    lateralGrip: 18.5,        // Ray gibi ATTESA E-TS AWD yol tutuşu
    driftGrip: 4.8,           // Güçlü gazla kontrollü 4 çeker powerslide
    driftTriggerSpeed: 6.0,

    pacejkaB: 10.0,
    pacejkaC: 1.40,
    tirePeakGrip: 1.45,
    driftGripRatio: 0.52,

    steerSpeed: 12.0,         // Lazer keskinliğinde anlık direksiyon
    steerReturn: 14.0,
    steerAngleLowSpeed: 0.72, // Düşük hızda keskin dönüş (~41.2 derece, Grove St U-Dönüşü)
    steerAngleHighSpeed: 0.18,
    yawDamping: 7.2,          // GTA IV/V çevik burun yönlenmesi, sıfır understeer hantallığı

    suspensionNaturalFreq: 20.0,// Sert Nismo pist süspansiyonu
    dampingRatio: 0.98,
    suspensionStiffness: 28.0,
    suspensionDamping: 18.0,
    gravity: 22.0,
    pitchSensitivity: 0.0028,
    rollSensitivity: 0.010,   // Sıfır viraj yatması

    restitution: 0.10,
    wallFriction: 0.70
  },
  e50: {
    name: 'Mercedes-Benz E50 AMG (1996)',
    mass: 1680,               // kg (V8 atmosferik performans sedanı)
    wheelBase: 2.83,
    trackWidth: 1.53,
    wheelRadius: 0.323,
    rideHeight: 0.23,
    maxForwardSpeed: 70.0,    // ~252 km/h azami sürat
    maxReverseSpeed: 10.5,
    enginePower: 7.8,         // m/s² güçlü V8 ivmelenmesi (0-100 ~5.8s)
    brakeForce: 18.0,
    handbrakeDecel: 10.5,
    rollingFriction: 0.50,
    airDragCoeff: 0.0016,
    gearThresholds: [0, 38, 76, 125, 185, 255],

    lateralGrip: 14.5,        // Arkadan itişli sağlam Alman oturaklılığı
    driftGrip: 3.4,
    driftTriggerSpeed: 5.4,

    pacejkaB: 8.8,
    pacejkaC: 1.34,
    tirePeakGrip: 1.26,
    driftGripRatio: 0.44,

    steerSpeed: 10.5,
    steerReturn: 12.5,
    steerAngleLowSpeed: 0.68, // Düşük hızda keskin dönüş (~39 derece)
    steerAngleHighSpeed: 0.19,
    yawDamping: 7.0,          // Çevik AMG yönlenmesi

    suspensionNaturalFreq: 15.5,
    dampingRatio: 0.98,
    suspensionStiffness: 23.0,
    suspensionDamping: 15.0,
    gravity: 22.0,
    pitchSensitivity: 0.0038,
    rollSensitivity: 0.016,

    restitution: 0.14,
    wallFriction: 0.70
  },
  bmw_vision: {
    name: 'BMW Vision Neue Klasse',
    mass: 1820,               // kg (Gelecek nesil elektrikli spor sedan)
    wheelBase: 2.95,
    trackWidth: 1.60,
    wheelRadius: 0.387,
    rideHeight: 0.25,
    maxForwardSpeed: 68.0,    // ~245 km/h azami sürat
    maxReverseSpeed: 10.0,
    enginePower: 9.2,         // m/s² anlık elektrik torku (0-100 ~4.0s)
    brakeForce: 20.0,
    handbrakeDecel: 11.5,
    rollingFriction: 0.52,
    airDragCoeff: 0.0015,
    gearThresholds: [0, 42, 85, 140, 200, 250],

    lateralGrip: 16.2,
    driftGrip: 3.9,
    driftTriggerSpeed: 5.8,

    pacejkaB: 9.2,
    pacejkaC: 1.36,
    tirePeakGrip: 1.32,
    driftGripRatio: 0.48,

    steerSpeed: 11.0,
    steerReturn: 13.0,
    steerAngleLowSpeed: 0.68,
    steerAngleHighSpeed: 0.18,
    yawDamping: 7.2,

    suspensionNaturalFreq: 17.0,
    dampingRatio: 0.98,
    suspensionStiffness: 26.0,
    suspensionDamping: 16.0,
    gravity: 22.0,
    pitchSensitivity: 0.0032,
    rollSensitivity: 0.013,

    restitution: 0.12,
    wallFriction: 0.68
  },
  ambulance: {
    name: 'Los Santos Ambulance',
    mass: 2400,
    wheelBase: 3.10,
    trackWidth: 1.72,
    wheelRadius: 0.35,
    rideHeight: 0.30,
    maxForwardSpeed: 52.0, // ~187 km/h
    maxReverseSpeed: 8.5,
    enginePower: 7.8,
    brakeForce: 18.0,
    handbrakeDecel: 11.0,
    rollingFriction: 0.52,
    airDragCoeff: 0.0022,
    gearThresholds: [0, 32, 68, 110, 155, 190],
    lateralGrip: 14.0,
    driftGrip: 3.4,
    driftTriggerSpeed: 5.5,
    pacejkaB: 8.8,
    pacejkaC: 1.34,
    tirePeakGrip: 1.25,
    driftGripRatio: 0.45,
    steerSpeed: 9.8,
    steerReturn: 12.0,
    steerAngleLowSpeed: 0.66,
    steerAngleHighSpeed: 0.18,
    yawDamping: 6.8,
    suspensionNaturalFreq: 14.5,
    dampingRatio: 0.98,
    suspensionStiffness: 24.0,
    suspensionDamping: 15.0,
    gravity: 22.0,
    pitchSensitivity: 0.0035,
    rollSensitivity: 0.018,
    restitution: 0.12,
    wallFriction: 0.68
  },
  fire_truck: {
    name: 'Fire Truck Engine 5',
    mass: 6500, // Ağır itfaiye tankeri
    wheelBase: 4.20,
    trackWidth: 1.95,
    wheelRadius: 0.48,
    rideHeight: 0.42,
    maxForwardSpeed: 42.0, // ~151 km/h
    maxReverseSpeed: 7.0,
    enginePower: 8.8, // Yüksek dizel tork
    brakeForce: 24.0, // Ağır hidrolik fren
    handbrakeDecel: 15.0,
    rollingFriction: 0.65,
    airDragCoeff: 0.0035,
    gearThresholds: [0, 25, 55, 90, 130, 160],
    lateralGrip: 16.0,
    driftGrip: 3.8,
    driftTriggerSpeed: 6.0,
    pacejkaB: 9.5,
    pacejkaC: 1.35,
    tirePeakGrip: 1.30,
    driftGripRatio: 0.48,
    steerSpeed: 8.5,
    steerReturn: 11.0,
    steerAngleLowSpeed: 0.60,
    steerAngleHighSpeed: 0.15,
    yawDamping: 7.5,
    suspensionNaturalFreq: 12.0,
    dampingRatio: 0.98,
    suspensionStiffness: 30.0,
    suspensionDamping: 20.0,
    gravity: 22.0,
    pitchSensitivity: 0.0025,
    rollSensitivity: 0.022,
    restitution: 0.08,
    wallFriction: 0.65
  }
};

/**
 * VehiclePhysics - Gerçekçi Akıcı Araç Fiziği
 * - 5 İleri + Geri Otomatik Vites Simülasyonu
 * - Tork eğrisi, sürtünme, aerodinamik direnç
 * - Hıza duyarlı direksiyon açısı (Ackermann geometrisi)
 * - El freni ile kontrollü arkadan kayma (drift) ve zemin sürtünmesi
 * - Yay & sönümlemeli süspansiyon: Fren dalması (pitch) ve viraj yatması (body roll)
 * - Gerçekçi tekerlek yuvarlanma (roll) ve direksiyon dönüş (steer) animasyonu
 */
export class Vehicle {
  constructor(options = {}) {
    this.id = options.id || 'veh_' + Math.random().toString(36).substr(2, 6);
    this.name = options.name || 'Executive Sedan';
    this.type = options.type || 'sedan';
    this.colorHex = options.colorHex !== undefined ? options.colorHex : 0x1f382b; // Varsayılan: CJ Grove Street Koyu Yeşil Metalik

    // Handling konfigürasyonunu bağla
    this.handling = Object.assign({}, HANDLING_CONFIGS[this.type] || HANDLING_CONFIGS.sedan, options.handling || {});

    // Fizik ve Dünya Konumu
    this.position = new THREE.Vector3().copy(options.position || new THREE.Vector3(0, 0.0, 0));
    this.heading = options.heading !== undefined ? options.heading : 0; // Radyan cinsinden yön açısı (Y ekseni etrafında)
    this.groundY = options.groundY !== undefined ? options.groundY : 0.0;
    this.rideHeight = this.handling.rideHeight;
    this.scale = options.scale || 1.62;
    this.terrain = options.terrain || null;
    this.collisionManager = options.collisionManager || null;

    // Momentum ve Hız Vektörleri
    this.velocity = new THREE.Vector3(0, 0, 0); // Dünya koordinatlarında 2D/3D hız vektörü
    this.vForward = 0;                          // İleri/geri hız bileşeni
    this.vLateral = 0;                          // Yanal kayma hız bileşeni
    this.speed = 0;                             // m/s gösterge hızı
    this.kmh = 0;
    this.steerAngle = 0;
    this.targetSteer = 0;
    this.yawRate = 0;
    this.targetYawRate = 0;
    this.engineRPM = 850;
    this.currentGear = 1;
    this.isBraking = false;
    this.isHandbrake = false;
    this.isReversing = false;
    this.isDrifting = false;
    this.driftFactor = 0;
    this.wheelRoll = 0;
    this.wheelRollAngle = 0;
    this.wheelRig = null;
    this.wheelRollSign = options.rollSign !== undefined ? options.rollSign : -1;
    this.wheelSteerSign = options.steerSign !== undefined ? options.steerSign : 1;
    this.wheelRollDirections = { fl: 1, fr: 1, rl: 1, rr: 1 };
    this.wheelSteerDirections = { fl: 1, fr: 1 };
    this.fallbackWheelMeshes = null;
    this.headlightsOn = true;

    // Süspansiyon Pitch & Roll (Yunuslama ve Yana Yatma)
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.verticalVelocity = 0;
    this.gravity = this.handling.gravity;
    this.isAirborne = false;
    this.timeAccumulator = 0; // Fixed timestep fizik akümülatörü

    // 4 Nokta Zemin Yoklama Bilgileri
    this.wheelPoints = {
      fl: new THREE.Vector3(),
      fr: new THREE.Vector3(),
      rl: new THREE.Vector3(),
      rr: new THREE.Vector3()
    };
    this.groundElevations = { fl: 0, fr: 0, rl: 0, rr: 0 };
    this.lastCollisionNormal = new THREE.Vector3(0, 0, 0);
    this.hasCollision = false;

    // ADIM 12: Lastik Patlama ve Çivi Tuzağı Mekaniği
    this.tiresPunctured = false;
    this.punctureTimer = 0;

    // ADIM 17: Pay 'n' Spray Garaj Kontrol Kilidi
    this.isLocked = false;

    // Debug Görselleştirme Grubu
    this.debugVisible = false;
    this.debugGroup = null;

    // Performans Parametreleri (Geriye dönük uyumluluk)
    this.wheelBase = this.handling.wheelBase;
    this.wheelRadius = this.handling.wheelRadius;
    this.maxForwardSpeed = this.handling.maxForwardSpeed;
    this.maxReverseSpeed = this.handling.maxReverseSpeed;
    this.baseAccel = this.handling.enginePower;
    this.brakeForce = this.handling.brakeForce;
    this.handbrakeDecel = this.handling.handbrakeDecel;
    this.steerSpeed = this.handling.steerSpeed;
    this.steerReturn = this.handling.steerReturn;

    // Vites Oran Hız Eşikleri (km/h) (Araç tipine göre dinamik kademeli şanzıman)
    this.gearThresholds = this.handling.gearThresholds || [0, 35, 70, 115, 160, 220];

    // Performans için geçici vektörler (Döngü içi GC baskısını sıfırlar)
    this._tmpForwardVec = new THREE.Vector3();
    this._tmpRightVec = new THREE.Vector3();
    this._tmpMoveDelta = new THREE.Vector3();

    // 3D Hiyerarşik Yapı (Tait-Bryan 'YXZ': Heading -> Pitch -> Roll eksen sıralaması)
    this.root = new THREE.Group();
    this.root.name = `Vehicle_${this.name}`;
    this.root.rotation.order = 'YXZ';
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;

    // Süspansiyon yay hareketini taşıyan şasi gövdesi
    this.chassis = new THREE.Group();
    this.chassis.name = 'Chassis';
    this.chassis.rotation.order = 'YXZ';
    this.root.add(this.chassis);

    // Gövde ve ışıklar
    this.bodyGroup = new THREE.Group();
    this.bodyGroup.name = 'BodyGroup';
    this.chassis.add(this.bodyGroup);

    // Tekerlek referansları
    this.wheels = {
      fl_steer: new THREE.Group(),
      fl_roll: new THREE.Group(),
      fr_steer: new THREE.Group(),
      fr_roll: new THREE.Group(),
      rl_roll: new THREE.Group(),
      rr_roll: new THREE.Group(),
    };

    // Far ve stop ışık nesneleri
    this.lights = {
      spotL: null,
      spotR: null,
      brakeL: null,
      brakeR: null,
      reverseL: null,
      reverseR: null,
      tailMaterials: [],
      reverseMaterials: []
    };

    // Sürücü etkileşim durumu
    this.isOccupied = false;
    this.driver = null;

    // Giriş Kontrolleri
    this.input = {
      throttle: 0, // 0..1
      brake: 0,    // 0..1
      steer: 0,    // -1 (sol) .. +1 (sağ)
      handbrake: false
    };

    this.initRig();
  }

  /**
   * Tekerlek pivotlarını ve şasi montaj yuvalarını kurar
   */
  initRig() {
    const s = this.scale;
    // Süspansiyon montaj noktaları (Model koordinatlarından dönüştürülmüş)
    // x = sol/sağ, y = dikey yükseklik, z = ön/arka
    const lfPos = new THREE.Vector3(-0.46 * s, (-0.22 + 0.38) * s, -0.9066 * s);
    const rfPos = new THREE.Vector3(+0.46 * s, (-0.22 + 0.38) * s, -0.9066 * s);
    const lrPos = new THREE.Vector3(-0.4466 * s, (-0.22 + 0.38) * s, +0.6666 * s);
    const rrPos = new THREE.Vector3(+0.4466 * s, (-0.22 + 0.38) * s, +0.6666 * s);

    // Ön Sol Tekerlek
    this.wheels.fl_steer.name = 'Wheel_FL_Pivot';
    this.wheels.fl_steer.rotation.order = 'YXZ';
    this.wheels.fl_steer.matrixAutoUpdate = true;
    this.wheels.fl_roll.rotation.order = 'YXZ';
    this.wheels.fl_roll.matrixAutoUpdate = true;
    this.wheels.fl_steer.position.copy(lfPos);
    this.wheels.fl_steer.add(this.wheels.fl_roll);
    this.chassis.add(this.wheels.fl_steer);

    // Ön Sağ Tekerlek
    this.wheels.fr_steer.name = 'Wheel_FR_Pivot';
    this.wheels.fr_steer.rotation.order = 'YXZ';
    this.wheels.fr_steer.matrixAutoUpdate = true;
    this.wheels.fr_roll.rotation.order = 'YXZ';
    this.wheels.fr_roll.matrixAutoUpdate = true;
    this.wheels.fr_steer.position.copy(rfPos);
    this.wheels.fr_steer.add(this.wheels.fr_roll);
    this.chassis.add(this.wheels.fr_steer);

    // Arka Sol Tekerlek
    this.wheels.rl_roll.name = 'Wheel_RL_Pivot';
    this.wheels.rl_roll.rotation.order = 'YXZ';
    this.wheels.rl_roll.matrixAutoUpdate = true;
    this.wheels.rl_roll.position.copy(lrPos);
    this.chassis.add(this.wheels.rl_roll);

    // Arka Sağ Tekerlek
    this.wheels.rr_roll.name = 'Wheel_RR_Pivot';
    this.wheels.rr_roll.rotation.order = 'YXZ';
    this.wheels.rr_roll.matrixAutoUpdate = true;
    this.wheels.rr_roll.position.copy(rrPos);
    this.chassis.add(this.wheels.rr_roll);

    // Dışarıdan veya farklı modüllerden kolay erişim için takma adlar (Aliases)
    this.wheels.fl = this.wheels.fl_steer;
    this.wheels.fr = this.wheels.fr_steer;
    this.wheels.rl = this.wheels.rl_roll;
    this.wheels.rr = this.wheels.rr_roll;
    this.wheels.Wheel_FL_Pivot = this.wheels.fl_steer;
    this.wheels.Wheel_FR_Pivot = this.wheels.fr_steer;
    this.wheels.Wheel_RL_Pivot = this.wheels.rl_roll;
    this.wheels.Wheel_RR_Pivot = this.wheels.rr_roll;
  }

  /**
   * GLB modelini araca iliştirir, materyalleri boyar ve ışıkları yapılandırır
   */
  attachModel(sourceScene, options = {}) {
    const s = options.scale !== undefined ? options.scale : this.scale;

    const cloned = sourceScene.clone(true);

    // Materyalleri izole et (Araçların birbirinin materyallerini paylaşmasını engeller)
    cloned.traverse(child => {
      if (child.isMesh && child.material) {
        if (Array.isArray(child.material)) {
          child.material = child.material.map(m => (m ? m.clone() : m));
        } else {
          child.material = child.material.clone();
        }
      }
    });

    // Düğümleri isme göre ayıkla (Büyük/küçük harfe duyarsız)
    const findNode = (name) => {
      let found = null;
      const target = name.toLowerCase();
      cloned.traverse(c => {
        if (!found && c.name && c.name.toLowerCase() === target) {
          found = c;
        }
      });
      return found;
    };

    const bodyNode = findNode('body');
    const flLight = findNode('f_l_light');
    const frLight = findNode('f_r_light');
    const rlLight = findNode('r_l_light');
    const rrLight = findNode('r_r_light');
    const flWheel = findNode('f_l_wheel');
    const frWheel = findNode('f_r_wheel');
    const rlWheel = findNode('r_l_wheel');
    const rrWheel = findNode('r_r_wheel');

    const isLegacyEclass = !!(bodyNode && flWheel);
    const useGlbTransform = options.useGlbTransform !== undefined ? options.useGlbTransform : isLegacyEclass;

    const rawBodyContainer = new THREE.Group();

    if (isLegacyEclass) {
      if (bodyNode) rawBodyContainer.add(bodyNode);
      if (flLight) rawBodyContainer.add(flLight);
      if (frLight) rawBodyContainer.add(frLight);
      if (rlLight) rawBodyContainer.add(rlLight);
      if (rrLight) rawBodyContainer.add(rrLight);

      const frSup = findNode('frsup');
      const lfSup = findNode('lfsup');
      const rlSup = findNode('rlsup');
      const rrSup = findNode('rrsup');
      if (frSup) rawBodyContainer.add(frSup);
      if (lfSup) rawBodyContainer.add(lfSup);
      if (rlSup) rawBodyContainer.add(rlSup);
      if (rrSup) rawBodyContainer.add(rrSup);

      // GLB koordinat ekseni dönüşümünü uygula ve ölçekle
      const glbTransform = new THREE.Matrix4().set(
         0, -1,  0,  0,
         0,  0,  1,  0,
        -1,  0,  0,  0,
         0,  0,  0,  1
      );
      rawBodyContainer.applyMatrix4(glbTransform);
      rawBodyContainer.scale.set(s, s, s);
      rawBodyContainer.position.set(0, 0.38 * s, 0);
      this.bodyGroup.add(rawBodyContainer);

      // Mercedes E-Class tekerlek montajı (GLB içinde merkezde olan tekerlekleri doğru yuvalara yerleştir)
      const wheelOffsets = {
        FL: new THREE.Vector3(-0.46 * s, (-0.22 + 0.38) * s, -0.9066 * s),
        FR: new THREE.Vector3(+0.46 * s, (-0.22 + 0.38) * s, -0.9066 * s),
        RL: new THREE.Vector3(-0.4466 * s, (-0.22 + 0.38) * s, +0.6666 * s),
        RR: new THREE.Vector3(+0.4466 * s, (-0.22 + 0.38) * s, +0.6666 * s)
      };

      const wheelMeshes = { FL: flWheel, FR: frWheel, RL: rlWheel, RR: rrWheel };
      const pivots = {};

      for (const pos of ['FL', 'FR', 'RL', 'RR']) {
        const pivotName = `Wheel_${pos}_Pivot`;
        let pivot = this.chassis.getObjectByName(pivotName);
        if (!pivot) {
          pivot = new THREE.Group();
          pivot.name = pivotName;
          this.chassis.add(pivot);
        }
        while (pivot.children.length > 0) {
          pivot.remove(pivot.children[0]);
        }
        pivot.position.copy(wheelOffsets[pos]);
        pivot.quaternion.identity();
        pivot.scale.set(1, 1, 1);

        const mesh = wheelMeshes[pos];
        if (mesh) {
          mesh.position.set(0, 0, 0);
          mesh.rotation.set(0, Math.PI, 0);
          mesh.scale.set(s, s, s);
          pivot.add(mesh);
        }
        pivots[pos] = pivot;
      }

      const legacyRig = {
        pivots,
        forwardDir: new THREE.Vector3(0, 0, -1),
        leftDir: new THREE.Vector3(-1, 0, 0),
        lengthAxis: 'z',
        frontSign: -1,
        averageRadius: 0.285 * s,
        wheelBase: (0.9066 + 0.6666) * s,
        trackWidth: 0.92 * s,
        rollSign: options.rollSign !== undefined ? options.rollSign : -1,
        steerSign: options.steerSign !== undefined ? options.steerSign : 1
      };
      this.setWheelRig(legacyRig);
    } else {
      // Standart glTF Modelleri (Alfa Romeo, Toyota bZ4X, Beetle vb.)
      rawBodyContainer.add(cloned);
      if (useGlbTransform) {
        const glbTransform = new THREE.Matrix4().set(
           0, -1,  0,  0,
           0,  0,  1,  0,
          -1,  0,  0,  0,
           0,  0,  0,  1
        );
        rawBodyContainer.applyMatrix4(glbTransform);
      }
      if (options.rotationX) {
        rawBodyContainer.rotation.x = options.rotationX;
      }
      if (options.rotationY) {
        rawBodyContainer.rotation.y = options.rotationY;
      }
      if (options.rotationZ) {
        rawBodyContainer.rotation.z = options.rotationZ;
      }
      rawBodyContainer.scale.set(s, s, s);

      // ADIM 1: OTOMATİK ZEMİN, MERKEZ VE TEKERLEK HİZALAMA (Ground & Pivot Alignment)
      rawBodyContainer.updateMatrixWorld(true);
      const initialBox = new THREE.Box3().setFromObject(rawBodyContainer);
      const lowestY = initialBox.min.y;
      const initialCenter = new THREE.Vector3();
      initialBox.getCenter(initialCenter);

      rawBodyContainer.traverse(c => {
        if (c.isMesh) {
          const b = new THREE.Box3().setFromObject(c);
          if (b.min.y < -0.5 || b.max.y > 1.5) {
            console.warn(`[BAD MESH] ${c.name} (mat: ${c.material?.name}) min.y=${b.min.y.toFixed(3)}, max.y=${b.max.y.toFixed(3)}, parent: ${c.parent?.name}`);
          }
        }
      });

      let yOff = -this.rideHeight - lowestY;
      if (options.yOffset !== undefined && options.yOffset !== 0) {
        yOff += options.yOffset;
      }
      const zOff = options.zOffset !== undefined ? options.zOffset : 0;
      rawBodyContainer.position.set(-initialCenter.x, yOff, -initialCenter.z + zOff * s);
      this.bodyGroup.add(rawBodyContainer);

      console.warn(`[ALIGN DEBUG] ${this.name} initialBox.min.y=${initialBox.min.y.toFixed(3)}, max.y=${initialBox.max.y.toFixed(3)}, lowestY=${lowestY.toFixed(3)}, yOff=${yOff.toFixed(3)}, rideHeight=${this.rideHeight}`);

      // EVRENSEL TEKERLEK AYRIŞTIRMA VE RİG SİSTEMİ (buildWheelRig)
      const rig = buildWheelRig(this.chassis, {
        frontSign: options.frontSign !== undefined ? options.frontSign : -1,
        lengthAxis: options.lengthAxis || 'z',
        rollSign: options.rollSign !== undefined ? options.rollSign : -1,
        steerSign: options.steerSign !== undefined ? options.steerSign : 1,
        useGeometryFallback: options.useGeometryFallback !== false,
        createFallbackVisuals: options.createFallbackVisuals !== undefined ? options.createFallbackVisuals : (this.type === 'classic'),
        fallbackRadius: options.wheelRadius || this.handling.wheelRadius || 0.285
      });
      console.warn(`[ALIGN DEBUG] ${this.name} FL Pivot Y=${rig.pivots.FL ? rig.pivots.FL.position.y.toFixed(3) : 'none'}, rawBody Y=${rawBodyContainer.position.y.toFixed(3)}`);
      
      if (!window.__ALIGN_LOGS) window.__ALIGN_LOGS = [];
      window.__ALIGN_LOGS.push({
        name: this.name,
        minY: Number(initialBox.min.y.toFixed(3)),
        maxY: Number(initialBox.max.y.toFixed(3)),
        lowestY: Number(lowestY.toFixed(3)),
        yOff: Number(yOff.toFixed(3)),
        rawBodyY: Number(rawBodyContainer.position.y.toFixed(3)),
        flPivotY: rig.pivots.FL ? Number(rig.pivots.FL.position.y.toFixed(3)) : null
      });
      this.setWheelRig(rig);
    }

    // ADIM 3: Her materyal için otomatik karar ve iyileştirme
    const transferMaps = (src, dst) => {
      if (!src || !dst) return dst;
      if (src.map) {
        dst.map = src.map;
        dst.map.needsUpdate = true;
      }
      if (src.normalMap) {
        dst.normalMap = src.normalMap;
        if (src.normalScale && dst.normalScale) {
          dst.normalScale.copy(src.normalScale);
        }
      }
      if (src.aoMap) {
        dst.aoMap = src.aoMap;
        dst.aoMapIntensity = src.aoMapIntensity !== undefined ? src.aoMapIntensity : 1.0;
      }
      if (src.roughnessMap) dst.roughnessMap = src.roughnessMap;
      if (src.metalnessMap) dst.metalnessMap = src.metalnessMap;
      if (src.emissiveMap) dst.emissiveMap = src.emissiveMap;
      if (src.alphaMap) dst.alphaMap = src.alphaMap;
      if (src.side !== undefined) dst.side = src.side;
      dst.needsUpdate = true;
      return dst;
    };

    this.root.traverse(child => {
      if (child.isMesh && child.material) {
        child.castShadow = true;
        child.receiveShadow = true;

        const isMultiMat = Array.isArray(child.material);
        const mats = isMultiMat ? child.material : [child.material];

        for (let i = 0; i < mats.length; i++) {
          const mat = mats[i];
          if (!mat) continue;

          // a) Materyalin map'i (dokusu) VARSA:
          if (mat.map) {
            // Dokuya dokunma. Renk dokuyla çarpıldığı için beyaz = dokuyu olduğu gibi gösterir
            if (mat.color) mat.color.setHex(0xffffff);
            mat.envMapIntensity = 1.0;
            if (mat.metalness !== undefined && mat.metalness > 0.04) {
              mat.metalness = 0.04;
            }
            // this.colorHex ile boyama (doku detayını bozmamak için)
          }
          // b) Materyalin map'i YOKSA (isim kontrolü hem materyal hem mesh adında küçük harfle):
          else {
            const matName = (mat.name || '').toLowerCase();
            const meshName = (child.name || '').toLowerCase();
            const nameStr = `${matName} ${meshName}`;

            // window / glass → MeshPhysicalMaterial, transmission 0.90, ior 1.52, roughness 0.06
            if (nameStr.includes('window') || nameStr.includes('glass')) {
              const glassMat = new THREE.MeshPhysicalMaterial({
                color: new THREE.Color(0x1e2830),
                transmission: 0.90,
                ior: 1.52,
                roughness: 0.06,
                metalness: 0.0,
                transparent: true,
                opacity: 1.0,
                depthWrite: false,
                envMapIntensity: 1.2
              });
              transferMaps(mat, glassMat);
              glassMat.name = mat.name;
              if (isMultiMat) {
                child.material[i] = glassMat;
              } else {
                child.material = glassMat;
              }
            }
            // tire / wheel / rubber → color 0x1e1e1e, roughness 0.88, metalness 0
            else if (nameStr.includes('tire') || nameStr.includes('rubber') || (nameStr.includes('wheel') && !nameStr.includes('rim') && !nameStr.includes('grill') && !nameStr.includes('chrome'))) {
              if (mat.color) mat.color.setHex(0x1e1e1e);
              mat.roughness = 0.88;
              mat.metalness = 0.0;
              mat.envMapIntensity = 0.20;
            }
            // chrome / metal / rim / grill → metalness 0.95, roughness 0.14, envMapIntensity 1.15
            else if (nameStr.includes('chrome') || nameStr.includes('metal') || nameStr.includes('rim') || nameStr.includes('grill') || nameStr.includes('badge')) {
              mat.metalness = 0.95;
              mat.roughness = 0.14;
              mat.envMapIntensity = 1.15;
            }
            // paint / car / body → yeni MeshPhysicalMaterial: color=this.colorHex, metalness 0.04 (dielektrik boya tabanı), roughness 0.28, clearcoat 0.55, clearcoatRoughness 0.08, envMapIntensity 1.0
            else if (nameStr.includes('paint') || nameStr.includes('body') || (nameStr.includes('car') && !nameStr.includes('carpet'))) {
              const bodyMat = new THREE.MeshPhysicalMaterial({
                color: this.colorHex,
                metalness: 0.04,
                roughness: 0.28,
                clearcoat: 0.55,
                clearcoatRoughness: 0.08,
                envMapIntensity: 1.0
              });
              transferMaps(mat, bodyMat);
              bodyMat.name = mat.name;
              if (isMultiMat) {
                child.material[i] = bodyMat;
              } else {
                child.material = bodyMat;
              }
            }
            // Hiçbiri uymuyorsa → rengi DEĞİŞTİRME, sadece roughness'ı 0.3-0.9 aralığına sıkıştır
            else {
              if (mat.roughness !== undefined) {
                mat.roughness = THREE.MathUtils.clamp(mat.roughness, 0.3, 0.9);
              }
            }
          }
        }
      }
    });

    // ADIM 4: FARLAR (Düğüm adına göre garantili aydınlatma)
    // f_l_light ve f_r_light düğümlerindeki tüm meshlere emissive 0xfff2cc, emissiveIntensity 0.5
    const setupHeadlightMesh = (lightNode) => {
      if (!lightNode) return;
      lightNode.traverse(node => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(mat => {
            if (!mat) return;
            mat.emissive = new THREE.Color(0xfff2cc);
            mat.emissiveIntensity = 0.5;
          });
        }
      });
    };
    setupHeadlightMesh(flLight);
    setupHeadlightMesh(frLight);

    // r_l_light ve r_r_light düğümlerindeki meshlere fren lambası entegrasyonu
    this.lights.tailMaterials = [];
    const setupTaillightMesh = (lightNode) => {
      if (!lightNode) return;
      lightNode.traverse(node => {
        if (node.isMesh && node.material) {
          const mats = Array.isArray(node.material) ? node.material : [node.material];
          mats.forEach(mat => {
            if (!mat) return;
            if (!this.lights.tailMaterials.includes(mat)) {
              this.lights.tailMaterials.push(mat);
            }
            mat.emissive = new THREE.Color(0x440000);
            mat.emissiveIntensity = 0.8;
          });
        }
      });
    };
    setupTaillightMesh(rlLight);
    setupTaillightMesh(rrLight);

    // Geri vites ve stop lambaları için genel model uyumluluğu (fallback)
    this.root.traverse(child => {
      if (child.isMesh && child.material) {
        const mats = Array.isArray(child.material) ? child.material : [child.material];
        mats.forEach(mat => {
          if (!mat) return;
          const matName = (mat.name || '').toLowerCase();
          const meshName = (child.name || '').toLowerCase();
          const combined = `${matName} ${meshName}`;

          if ((matName.includes('tail') || (matName.includes('rear') && matName.includes('light'))) && !this.lights.tailMaterials.includes(mat)) {
            this.lights.tailMaterials.push(mat);
            mat.emissive = new THREE.Color(0x440000);
            mat.emissiveIntensity = 0.8;
          }
          if (combined.includes('reverse') || combined.includes('backlight') || combined.includes('white')) {
            if (!this.lights.reverseMaterials.includes(mat)) {
              this.lights.reverseMaterials.push(mat);
            }
            mat.emissive = new THREE.Color(0x000000);
            mat.emissiveIntensity = 0;
          }
        });
      }
    });

    // Gerçekçi 3D Ön Farlar (Spotlight)
    this.createHeadlights();

    // Süspansiyon sürüş yüksekliğini sabitle (Handling konfigürasyonu veya tekerlek yarıçapı)
    this.rideHeight = (this.handling && this.handling.rideHeight !== undefined) ? this.handling.rideHeight : 0.28;

    // Başlangıç konumuna ve yönüne getirerek yere oturt
    this.root.rotation.y = this.heading;
    this.snapToGround();

    // GEÇİCİ TEŞHİS LOGU (Görsel Triage)
    this.root.updateMatrixWorld(true);
    const chassisBox = new THREE.Box3().setFromObject(this.chassis);
    const flWorldPos = new THREE.Vector3();
    const frWorldPos = new THREE.Vector3();
    const rlWorldPos = new THREE.Vector3();
    const rrWorldPos = new THREE.Vector3();
    this.wheels.fl_roll.getWorldPosition(flWorldPos);
    this.wheels.fr_roll.getWorldPosition(frWorldPos);
    this.wheels.rl_roll.getWorldPosition(rlWorldPos);
    this.wheels.rr_roll.getWorldPosition(rrWorldPos);

    console.group(`🚗 [VEHICLE TRIAGE DEBUG] ${this.name} (${this.id})`);
    console.log('Chassis BBox Min:', chassisBox.min.toArray().map(v => Number(v).toFixed(3)));
    console.log('Chassis BBox Max:', chassisBox.max.toArray().map(v => Number(v).toFixed(3)));
    console.log('Chassis Size (W x H x L):', chassisBox.getSize(new THREE.Vector3()).toArray().map(v => Number(v).toFixed(3)));
    console.log('Ride Height (m):', this.rideHeight);
    console.log('Vehicle World Position:', this.position.toArray().map(v => Number(v).toFixed(3)));
    console.log('Wheel World Positions:');
    console.log('  FL Wheel:', flWorldPos.toArray().map(v => Number(v).toFixed(3)));
    console.log('  FR Wheel:', frWorldPos.toArray().map(v => Number(v).toFixed(3)));
    console.log('  RL Wheel:', rlWorldPos.toArray().map(v => Number(v).toFixed(3)));
    console.log('  RR Wheel:', rrWorldPos.toArray().map(v => Number(v).toFixed(3)));
    console.groupEnd();
  }

  getElevation(x, z) {
    let elev = 0;
    if (this.collisionManager && typeof this.collisionManager.getGroundInfo === 'function') {
      elev = this.collisionManager.getGroundInfo(x, z, this.position.y, 'vehicle').elevation;
    } else if (this.terrain) {
      elev = this.terrain.getElevation(x, z);
    }
    // Sub-millimeter floating point gürültüsünü filtrele (1mm hassasiyet)
    return Math.round(elev * 1000) * 0.001;
  }

  /**
   * Hız vektöründen yerel ileri ve yanal hız bileşenlerini senkronize eder.
   * Çarpışma ve duvar slide sonrasında tutarlılığı sağlar.
   */
  syncSpeedFromVelocity() {
    const fX = -Math.sin(this.heading);
    const fZ = -Math.cos(this.heading);
    const rX = Math.cos(this.heading);
    const rZ = -Math.sin(this.heading);

    this.vForward = this.velocity.x * fX + this.velocity.z * fZ;
    this.vLateral = this.velocity.x * rX + this.velocity.z * rZ;
    this.speed = this.vForward;
    this.kmh = Math.round(Math.abs(this.vForward) * 3.6);
  }

  /**
   * Aracın tekerleklerini tam yol seviyesine oturtur
   */
  snapToGround() {
    const rh = this.rideHeight !== undefined ? this.rideHeight : 0.28;
    const elev = this.getElevation(this.position.x, this.position.z);
    this.position.y = elev + this.groundY + rh;
    this.root.position.copy(this.position);
    this.verticalVelocity = 0;
    this.isAirborne = false;
    this.timeAccumulator = 0;
  }

  /**
   * ADIM 12: Lastik Patlatma (Spike Strip Teması)
   */
  punctureTires() {
    if (this.tiresPunctured) return;
    this.tiresPunctured = true;
    this.punctureTimer = 0;
    try {
      pedestrianAudio.playTirePop(this.position);
    } catch (e) {
      console.warn('Tire pop audio error:', e);
    }

    // Anlık savrulma ve spin torku
    this.yawRate += (Math.random() > 0.5 ? 1 : -1) * 2.8;
    this.vLateral += (Math.random() > 0.5 ? 1 : -1) * 4.5;
  }

  /**
   * Lastikleri Onar
   */
  repairTires() {
    this.tiresPunctured = false;
    this.punctureTimer = 0;
  }

  /**
   * ADIM 17: Araç Şasi, Gövde ve Lastiklerini Tamamen Onarır
   */
  repair() {
    this.tiresPunctured = false;
    this.punctureTimer = 0;
    this.pitch = 0;
    this.roll = 0;
    this.pitchVel = 0;
    this.rollVel = 0;
    this.yawRate = 0;
    this.isAirborne = false;
    this.verticalVelocity = 0;
    if (this.damageLevel !== undefined) this.damageLevel = 0;
    if (this.health !== undefined) this.health = 100;
  }

  /**
   * ADIM 17: Pay 'n' Spray Araç Gövde Boyasını Yeniler
   * Kaporta materyallerini (camlar, tekerlekler, farlar hariç) yeni renkle boyar
   * @param {number} hexColor - Yeni gövde rengi onaltılık değeri (Örn: 0xb91c1c)
   */
  recolor(hexColor) {
    this.colorHex = hexColor;
    const targetColor = new THREE.Color(hexColor);
    const skipKeywords = ['wheel', 'tire', 'rim', 'glass', 'window', 'windshield', 'light', 'lamp', 'lens', 'interior', 'mirror_glass', 'chrome_grille'];

    const recolorNode = (node) => {
      if (!node) return;
      const nodeName = (node.name || '').toLowerCase();
      if (nodeName.includes('wheel') || nodeName.includes('pivot') || nodeName.includes('light')) return;

      if (node.isMesh && node.material) {
        const matList = Array.isArray(node.material) ? node.material : [node.material];
        matList.forEach((mat) => {
          if (!mat) return;
          const matName = (mat.name || '').toLowerCase();
          const shouldSkip = skipKeywords.some(kw => nodeName.includes(kw) || matName.includes(kw));
          if (!shouldSkip && mat.color) {
            if (!mat._isClonedForRecolor) {
              const clonedMat = mat.clone();
              clonedMat._isClonedForRecolor = true;
              if (Array.isArray(node.material)) {
                const idx = node.material.indexOf(mat);
                if (idx !== -1) node.material[idx] = clonedMat;
              } else {
                node.material = clonedMat;
              }
              clonedMat.color.copy(targetColor);
              if (clonedMat.metalness !== undefined) clonedMat.metalness = Math.max(0.65, clonedMat.metalness);
              if (clonedMat.roughness !== undefined) clonedMat.roughness = Math.min(0.35, clonedMat.roughness);
              clonedMat.needsUpdate = true;
            } else {
              mat.color.copy(targetColor);
              mat.needsUpdate = true;
            }
          }
        });
      }

      if (node.children) {
        node.children.forEach(child => recolorNode(child));
      }
    };

    if (this.bodyGroup) {
      recolorNode(this.bodyGroup);
    }
  }

  /**
   * Araç Fizik Debug Görselleştirmesini Açar / Kapatır ('J' Tuşu)
   */
  setDebug(enable, scene = null) {
    this.debugVisible = enable;
    if (enable && !this.debugGroup) {
      this.debugGroup = new THREE.Group();
      this.debugGroup.name = `VehicleDebug_${this.name}`;

      // 4 Tekerlek Probe Noktası (Küreler)
      const probeGeo = new THREE.SphereGeometry(0.09, 8, 8);
      const probeMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      this._debugProbes = [];
      for (let i = 0; i < 4; i++) {
        const p = new THREE.Mesh(probeGeo, probeMat);
        this.debugGroup.add(p);
        this._debugProbes.push(p);
      }

      // Vektör Okları: Hız (Cyan), Forward (Sarı), Çarpışma Normali (Kırmızı)
      this._debugVelArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1, 0x00ffff);
      this._debugFwdArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 0, 1), new THREE.Vector3(), 1.5, 0xffff00);
      this._debugNormArrow = new THREE.ArrowHelper(new THREE.Vector3(0, 1, 0), new THREE.Vector3(), 1.2, 0xff2222);

      this.debugGroup.add(this._debugVelArrow);
      this.debugGroup.add(this._debugFwdArrow);
      this.debugGroup.add(this._debugNormArrow);

      const targetScene = scene || (this.root.parent ? this.root.parent : null);
      if (targetScene) targetScene.add(this.debugGroup);
    }

    if (this.debugGroup) {
      this.debugGroup.visible = enable;
    }
  }

  /**
   * Debug Vektör ve Noktalarını Günceller
   */
  updateDebugVisuals() {
    if (!this.debugVisible || !this.debugGroup) return;

    // 4 Tekerlek Probeları
    const pts = [this.wheelPoints.fl, this.wheelPoints.fr, this.wheelPoints.rl, this.wheelPoints.rr];
    const elevs = [this.groundElevations.fl, this.groundElevations.fr, this.groundElevations.rl, this.groundElevations.rr];

    for (let i = 0; i < 4; i++) {
      if (this._debugProbes && this._debugProbes[i]) {
        this._debugProbes[i].position.set(pts[i].x, elevs[i] + 0.05, pts[i].z);
      }
    }

    // Forward Vector (Sarı)
    const fX = -Math.sin(this.heading);
    const fZ = -Math.cos(this.heading);
    this._debugFwdArrow.position.copy(this.position);
    this._debugFwdArrow.position.y += 0.5;
    this._debugFwdArrow.setDirection(new THREE.Vector3(fX, 0, fZ));
    this._debugFwdArrow.setLength(2.0, 0.4, 0.2);

    // Velocity Vector (Cyan)
    const velLen = this.velocity.length();
    this._debugVelArrow.position.copy(this.position);
    this._debugVelArrow.position.y += 0.5;
    if (velLen > 0.05) {
      this._debugVelArrow.visible = true;
      this._debugVelArrow.setDirection(new THREE.Vector3(this.velocity.x / velLen, 0, this.velocity.z / velLen));
      this._debugVelArrow.setLength(Math.min(velLen * 0.25, 4.0), 0.3, 0.15);
    } else {
      this._debugVelArrow.visible = false;
    }

    // Collision Normal (Kırmızı)
    const normLen = this.lastCollisionNormal.length();
    this._debugNormArrow.position.copy(this.position);
    this._debugNormArrow.position.y += 0.6;
    if (normLen > 0.1 && this.hasCollision) {
      this._debugNormArrow.visible = true;
      this._debugNormArrow.setDirection(this.lastCollisionNormal);
      this._debugNormArrow.setLength(1.8, 0.35, 0.18);
    } else {
      this._debugNormArrow.visible = false;
    }
  }

  /**
   * Gece veya tünelde yolu aydınlatan projektör farlar
   */
  createHeadlights() {
    const s = this.scale;
    const yPos = 0.28 * s;
    const zPos = -1.9 * s;
    const spreadX = 0.52 * s;

    const createSpot = (xOffset) => {
      const spot = new THREE.SpotLight(0xfff4e0, 2.8, 48, Math.PI / 6, 0.45, 1.8);
      spot.position.set(xOffset, yPos, zPos);
      spot.target.position.set(xOffset, 0, zPos - 25);
      spot.castShadow = false; // Performans dostu
      this.chassis.add(spot);
      this.chassis.add(spot.target);
      return spot;
    };

    this.lights.spotL = createSpot(-spreadX);
    this.lights.spotR = createSpot(+spreadX);
  }

  setHeadlights(enable) {
    this.headlightsOn = enable;
    if (this.lights.spotL) this.lights.spotL.visible = enable;
    if (this.lights.spotR) this.lights.spotR.visible = enable;
  }

  toggleHeadlights() {
    this.setHeadlights(!this.headlightsOn);
  }

  /**
   * Fizik Döngüsü - Momentum, Lateral Grip, 4 Nokta Zemin Süspansiyonu ve Direksiyon Stabilitesi
   */
  update(delta) {
    if (!delta || delta <= 0 || isNaN(delta)) return;
    delta = Math.min(delta, 1 / 30); // Ani kare düşüşlerinde fizik patlamasını önleme (maksimum ~33ms)

    // Güvenlik Kalkanı: Herhangi bir tanımsız değer (NaN) varsa güvenle sıfırla
    if (isNaN(this.speed)) this.speed = 0;
    if (isNaN(this.vForward)) this.vForward = 0;
    if (isNaN(this.vLateral)) this.vLateral = 0;
    if (isNaN(this.heading)) this.heading = 0;
    if (isNaN(this.steerAngle)) this.steerAngle = 0;
    if (isNaN(this.yawRate)) this.yawRate = 0;
    if (isNaN(this.pitch)) this.pitch = 0;
    if (isNaN(this.roll)) this.roll = 0;
    if (isNaN(this.position.x) || isNaN(this.position.y) || isNaN(this.position.z)) {
      this.position.set(0, (this.groundY || 0) + (this.rideHeight !== undefined ? this.rideHeight : 0.28), 0);
      this.velocity.set(0, 0, 0);
    }

    const input = this.input;

    // ADIM 17: Pay 'n' Spray Garaj Kilidi (Giriş/Sprey anında aracı sabit tut)
    if (this.isLocked) {
      this.speed = 0;
      this.vForward = 0;
      this.vLateral = 0;
      this.yawRate = 0;
      this.velocity.set(0, 0, 0);
      input.throttle = 0;
      input.brake = 1;
      input.steer = 0;
      input.handbrake = true;
    }

    const absForwardSpeed = Math.abs(this.vForward);

    // 1. Hıza Duyarlı Dinamik Azami Direksiyon Açısı (Spin engelleme)
    // Düşük hızda çevik dönüş (~33° = 0.58 rad), yüksek hızda stabilite (~11.5° = 0.20 rad)
    const speedRatio = Math.min(absForwardSpeed / (this.handling.maxForwardSpeed * 0.65), 1.0);
    const maxSteer = THREE.MathUtils.lerp(this.handling.steerAngleLowSpeed, this.handling.steerAngleHighSpeed, speedRatio);

    // Direksiyon Girdisi ve Toplama (Sönümlü yumuşak tepki)
    if (input.steer !== 0) {
      this.targetSteer = input.steer * maxSteer;
      this.steerAngle = THREE.MathUtils.damp(this.steerAngle, this.targetSteer, this.handling.steerSpeed, delta);
    } else {
      this.targetSteer = 0;
      this.steerAngle = THREE.MathUtils.damp(this.steerAngle, 0, this.handling.steerReturn, delta);
    }

    // 2. Çekiş ve Frenleme Kuvveti Hesaplaması
    let accel = 0;
    this.isBraking = false;
    this.isReversing = false;

    if (input.throttle > 0) {
      if (this.vForward < -0.4) {
        // Geri giderken gaza basılırsa önce fren yapar
        accel = this.handling.brakeForce * input.throttle;
        this.isBraking = true;
      } else {
        // İleri çekiş: Hız arttıkça tork gerçekçi şekilde azalır
        const forwardRatio = Math.max(0, this.vForward) / this.handling.maxForwardSpeed;
        const powerFalloff = Math.max(0.18, 1.0 - Math.pow(forwardRatio, 1.3));
        accel = this.handling.enginePower * input.throttle * powerFalloff;
      }
    } else if (input.brake > 0) {
      if (this.vForward > 0.4) {
        // İleri giderken frene basılırsa güçlü ayak freni
        accel = -this.handling.brakeForce * input.brake;
        this.isBraking = true;
      } else {
        // Araç durmuşken frene basılmaya devam edilirse geri vitese geçer
        this.isReversing = true;
        const revRatio = Math.max(0, Math.abs(this.vForward)) / this.handling.maxReverseSpeed;
        const revPower = Math.max(0.2, 1.0 - revRatio);
        accel = -this.handling.enginePower * 0.58 * input.brake * revPower;
      }
    }

    // 3. El Freni (Boşluk Tuşu)
    this.isHandbrake = !!input.handbrake;
    if (this.isHandbrake) {
      this.isBraking = true;
      if (this.vForward > 0) {
        accel -= this.handling.handbrakeDecel;
      } else if (this.vForward < 0) {
        accel += this.handling.handbrakeDecel;
      }
    }

    // 4. Doğal Yuvarlanma Direnci & Aerodinamik Hava Direnci
    const totalResistance = (this.handling.rollingFriction + this.handling.airDragCoeff * this.vForward * this.vForward) * Math.sign(this.vForward);
    const netAccel = accel - (absForwardSpeed > 0.05 ? totalResistance : 0);
    this.vForward += netAccel * delta;

    // Düşük hızlarda tam durma (titremeyi önleme)
    if (input.throttle === 0 && input.brake === 0 && absForwardSpeed < 0.25) {
      this.vForward = 0;
      this.vLateral = 0;
      this.yawRate = 0;
    }

    // Azami hız sınırlandırması (Patlak lastikle max 11.5 m/s ~41 km/h)
    let maxFwd = this.handling.maxForwardSpeed;
    let maxRev = this.handling.maxReverseSpeed;
    if (this.tiresPunctured) {
      maxFwd = Math.min(maxFwd, 11.5);
      maxRev = Math.min(maxRev, 5.0);
    }
    this.vForward = THREE.MathUtils.clamp(this.vForward, -maxRev, maxFwd);

    // 5. Vites ve Motor Devri (RPM) Simülasyonu
    this.speed = this.vForward;
    this.kmh = Math.round(Math.abs(this.vForward) * 3.6);
    this.updateEngineRPM(delta);

    // 6. Yönlenme (Heading) ve 2-DoF Dinamik Model (Ackermann Kinematik + Pacejka Hibrit)
    let L = this.handling.wheelBase;
    const W = this.handling.trackWidth;
    let halfL = L * 0.5;
    const halfW = W * 0.5;
    const mass = this.handling.mass || 1450;
    let a = halfL; // Ön aks - CoM mesafesi
    let b = halfL; // Arka aks - CoM mesafesi

    // ADIM 10: Dinamik Aks Geometrisi & ICR (Anlık Dönüş Merkezi) Kalibrasyonu
    // Modelin tekerlek pivotları mevcutsa ön aks (a) ve arka aks (b) mesafelerini model orijinine göre gerçek değerlerle al
    if (this.wheelRig && this.wheelRig.pivots) {
      const pFL = this.wheelRig.pivots.FL ? this.wheelRig.pivots.FL.position : (this.wheelRig.pivots.FR ? this.wheelRig.pivots.FR.position : null);
      const pRL = this.wheelRig.pivots.RL ? this.wheelRig.pivots.RL.position : (this.wheelRig.pivots.RR ? this.wheelRig.pivots.RR.position : null);
      const lenAxis = this.wheelRig.lengthAxis || 'z';
      if (pFL && pRL) {
        const distF = Math.abs(pFL[lenAxis]);
        const distR = Math.abs(pRL[lenAxis]);
        if (distF > 0.15 && distR > 0.15) {
          a = distF;
          b = distR;
          L = a + b; // Efektif aks mesafesini gerçek model geometrisiyle eşitle
        }
      }
    }
    const Iz = (1 / 12) * mass * (L * L + W * W); // Şasi dikey eylemsizlik momenti

    // Geri vites tespiti (u < -0.05 m/s)
    const isReverseMoving = this.vForward < -0.05;

    if (isReverseMoving) {
      // 6. Geri Vites Kinematik İzolasyonu (ADIM 9 & 10)
      // Geri viteste drift ve aşırı tutunma kaybını kesinlikle engelle
      this.isDrifting = false;
      this.driftFactor = THREE.MathUtils.damp(this.driftFactor, 0.0, 8.0, delta);

      const u = this.vForward;
      // Geri viteste yüksek hızlarda (~30 km/h) direksiyon hassasiyetini hafifçe sönümleyerek aşırı sert savrulmayı önle
      const maxRev = this.handling.maxReverseSpeed || 8.5;
      const revRatio = Math.min(1.0, Math.abs(u) / maxRev);
      const steerDamp = THREE.MathUtils.clamp(1.0 - revRatio * 0.22, 0.78, 1.0);
      const effectiveSteer = this.steerAngle * steerDamp;

      // Kinematik Ackermann Hedef Açısal Hızı (rTarget)
      // r = (u / L) * tan(delta_eff). u negatif olduğu için sola kırılan tekerlekte r negatif olur (arkası sola, burnu sağa döner)
      const rTarget = (u / L) * Math.tan(effectiveSteer);

      // Kararsız Pacejka yaw türevi yerine doğrudan stabil Ackermann kinematiğine kilitle
      this.yawRate = THREE.MathUtils.damp(this.yawRate, rTarget, 16.0, delta);

      // Pivot Steering & Durma Kalkanı
      if (absForwardSpeed < 0.05 || (absForwardSpeed < 0.20 && input.throttle === 0 && input.brake === 0)) {
        this.yawRate = 0;
        this.vLateral = 0;
      }

      this.heading += this.yawRate * delta;

      // Geri Viteste Analitik ICR Yanal Hız Kilidi (v_rear_lat = vLateral + b * r = 0 => vLateral = -b * r)
      const targetVLateral = -b * this.yawRate;
      if (absForwardSpeed < 1.0) {
        this.vLateral = targetVLateral;
      } else {
        this.vLateral = THREE.MathUtils.damp(this.vLateral, targetVLateral, 24.0, delta);
      }
    } else {
      // İleri Sürüş: Hibrit Ackermann Kinematik + Kararlı 2-DoF Pacejka Dinamik Modeli
      // Normal sürüşte (el freni yokken) direksiyon kırmak asla aracı kontrolsüz drifte sokmaz
      this.isDrifting = !!this.isHandbrake && absForwardSpeed > this.handling.driftTriggerSpeed;
      this.driftFactor = THREE.MathUtils.damp(this.driftFactor, this.isDrifting ? 1.0 : 0.0, 5.0, delta);

      // 6.1 Aks Kayma Açıları (Tire Slip Angles) - Kararlı 2-DoF Bisiklet Modeli
      const u = this.vForward;
      const v = this.vLateral;
      const r = this.yawRate;

      // Kinematik Ackermann Yaw Hedefi:
      // Saf kinematik bisiklet modeli: yawRate = (u / L) * tan(steerAngle)
      // Araç dururken (u = 0) kesinlikle 0'dır; yerinde tank dönüşü / pivot steering yapamaz.
      const rKinematic = (u / L) * Math.tan(this.steerAngle);

      // Düşük Hız / Yüksek Hız Harmanlama (Speed Blend):
      // < 0.8 m/s: Tamamen Kinematik Ackermann ICR (Arka aks sıfır yanal kayma)
      // 0.8 - 4.5 m/s: Kademeli dinamik harmanlama
      // > 4.5 m/s: Tam 2-DoF Dinamiği & Kontrollü Tutuş
      const speedBlend = THREE.MathUtils.clamp((absForwardSpeed - 0.8) / 3.7, 0.0, 1.0);
      const dynamicScale = speedBlend * speedBlend;

      const uSafe = Math.max(Math.abs(u), 1.5);

      // Ön ve arka aks yerel yanal hızları (Fiziksel Doğru Eksenler):
      // Three.js koordinatlarında (+X sağ, -Z ileri, sola dönüş r > 0):
      // Ön aks yerel yanal hızı vyf = v - a * r
      // Arka aks yerel yanal hızı vyr = v + b * r
      const vyf = v - a * r;
      const vyr = v + b * r;

      // Kayma açıları (alpha): Ön lastikte direksiyon açısı çıkarılır
      const alphaF = Math.atan2(vyf, uSafe) - this.steerAngle;
      const alphaR = Math.atan2(vyr, uSafe);

      // 6.2 Pacejka 'Magic Formula' Yanal Lastik Kuvvetleri
      const B = this.handling.pacejkaB || 8.5;
      const C = this.handling.pacejkaC || 1.35;
      const baseMu = this.handling.tirePeakGrip || 1.25;
      const FzAxle = (mass * 9.81) * 0.5; // Aks başı dikey yük

      // Sadece el freni çekildiğinde arka tutunma kırılır
      const muRear = this.isHandbrake ? (baseMu * 0.38) : baseMu;
      const muFront = baseMu;

      const Df = muFront * FzAxle;
      const Dr = muRear * FzAxle;

      const Fyf = -Df * Math.sin(C * Math.atan(B * alphaF));
      const Fyr = -Dr * Math.sin(C * Math.atan(B * alphaR));

      // 6.3 2-DoF Hareket Denklemleri (Sönümleyici Negatif Geri Besleme):
      // Sola dönüşte alphaF < 0 => Fyf > 0 (ön burun sola tork: +a * Fyf).
      // virajda arka lastik vyr > 0 => alphaR > 0 => Fyr < 0 (arka lastik savrulmayı söndüren tork: +b * Fyr < 0).
      const cosDelta = Math.cos(this.steerAngle);
      const totalFy = (Fyf * cosDelta + Fyr) * dynamicScale;
      const totalMz = (a * Fyf * cosDelta + b * Fyr) * dynamicScale;

      // Yanal ivme ve Yaw açısal ivmesi
      const dV_dt = (totalFy / mass) - (u * r * speedBlend);
      const dR_dt = totalMz / Iz;

      this.yawRate += dR_dt * delta;

      // 6.4 Hibrit Yönlendirme: Düşük hızda saf Ackermann Kinematiği, yüksek hızda dinamik Pacejka
      const targetYaw = THREE.MathUtils.lerp(rKinematic, this.yawRate, (this.isDrifting ? 0.85 : 0.40) * speedBlend);
      const yawDampFactor = this.isDrifting ? 5.0 : (this.handling.yawDamping || 12.0);
      this.yawRate = THREE.MathUtils.damp(this.yawRate, targetYaw, yawDampFactor, delta);

      // Fiziksel Merkezcil İvme Emniyet Limiti (Aşırı hızda fırıldak gibi dönmeyi engelleme):
      const maxCentripetalAccel = (this.handling.tirePeakGrip || 1.25) * 9.81;
      const maxYawRate = Math.max(0.40, maxCentripetalAccel / Math.max(absForwardSpeed, 3.0));
      this.yawRate = THREE.MathUtils.clamp(this.yawRate, -maxYawRate, maxYawRate);

      // Düz Gidiş Kararlılığı (Straight-Line Anti-Fishtailing Kalkanı):
      // Sürücü direksiyon çevirmiyorken mikroskobik açısal hız ve yanal kaymaları sönümle (Ray gibi düz gidiş)
      if (input.steer === 0 && Math.abs(this.steerAngle) < 0.02) {
        this.yawRate = THREE.MathUtils.damp(this.yawRate, 0, 18.0, delta);
        if (!this.isDrifting) {
          this.vLateral = THREE.MathUtils.damp(this.vLateral, 0, 18.0, delta);
        }
      }

      // Pivot Steering & Durma Kalkanı: Araç dururken veya rölantideyken yawRate'i ve yanal kaymayı kesin sıfırla
      if (absForwardSpeed < 0.05 || (absForwardSpeed < 0.20 && input.throttle === 0 && input.brake === 0)) {
        this.yawRate = 0;
        this.vLateral = 0;
      }

      this.heading += this.yawRate * delta;

      // 7. Yanal Hız (vLateral) Entegrasyonu & ICR Arka Aks Kilidi
      // Kinematik Ackermann: Düşük hızlarda arka aks yanal hızını sıfırlayan analitik merkez yanal hızı
      // v_rear_lat = vLateral + b * r = 0 => vLateral = -b * rKinematic
      const kinematicVLateral = -(b / L) * u * Math.tan(this.steerAngle);

      if (this.isDrifting) {
        this.vLateral += dV_dt * delta;
        const lateralGripRate = this.handling.driftGrip || 3.5;
        this.vLateral = THREE.MathUtils.damp(this.vLateral, 0, lateralGripRate, delta);
      } else {
        // Normal Sürüş: Yanal hız patlaması ve mıknatıs/yan yan kayma kesinlikle engellenir.
        // Düşük hızda kusursuz kinematik ICR (-b*r), yüksek hızda gövde yönünde ray gibi tutuş
        const targetVL = THREE.MathUtils.lerp(kinematicVLateral, 0, speedBlend * 0.75);
        const lateralGripRate = this.tiresPunctured ? 2.8 : (this.handling.lateralGrip || 16.0);
        this.vLateral = THREE.MathUtils.damp(this.vLateral, targetVL, lateralGripRate, delta);
      }

      // Patlak lastikle jant üzerinde yalpalama
      if (this.tiresPunctured && absForwardSpeed > 0.8) {
        this.roll += Math.sin(performance.now() * 0.02) * 0.025;
        this.pitch += Math.cos(performance.now() * 0.025) * 0.015;
      }
    }

    // Yön Vektörleri
    const fX = -Math.sin(this.heading);
    const fZ = -Math.cos(this.heading);
    const rX = Math.cos(this.heading);
    const rZ = -Math.sin(this.heading);

    this._tmpForwardVec.set(fX, 0, fZ);
    this._tmpRightVec.set(rX, 0, rZ);

    // Dünya koordinatlarındaki hız vektörünü güncelle
    this.velocity.x = fX * this.vForward + rX * this.vLateral;
    this.velocity.z = fZ * this.vForward + rZ * this.vLateral;

    // 8. Fixed Timestep (120 Hz) & Symplectic Euler Tabanlı Süspansiyon Simülasyonu
    const FIXED_DT = 1 / 120; // 120 Hz deterministik fizik alt adımı
    const MAX_SUB_STEPS = 6;
    // Frame drop emniyeti: dt'yi maksimum 1/30s (0.0333s) ile sınırla
    this.timeAccumulator += Math.min(delta, 1 / 30);

    const omegaN = this.handling.suspensionNaturalFreq || 15.0; // Doğal frekans
    const zeta = this.handling.dampingRatio !== undefined ? this.handling.dampingRatio : 0.98; // Kritik sönümleme oranı
    const droopLimit = 0.15; // Maksimum tekerlek sarkma payı (m)
    const bumpStop = 0.12;   // Maksimum süspansiyon oturma payı (m)

    // Rölanti / Tam Durma Tespiti (Sleep modu için durum kontrolü)
    const isStationary = absForwardSpeed < 0.08 && Math.abs(this.vLateral) < 0.08 &&
                         Math.abs(input.throttle) < 0.01 && Math.abs(input.brake) < 0.01;

    let subSteps = 0;
    while (this.timeAccumulator >= FIXED_DT && subSteps < MAX_SUB_STEPS) {
      // 8.1 Yatay yer değiştirme (Sub-stepping ile adımlara bölünür: tunneling'i engeller)
      this.position.x += this.velocity.x * FIXED_DT;
      this.position.z += this.velocity.z * FIXED_DT;

      // 8.2 Anlık alt adımda 4 Tekerlek Zemin Yoklaması (Dinamik aks mesafeleri a ve b ile)
      this.wheelPoints.fl.set(this.position.x + fX * a + rX * halfW, this.position.y, this.position.z + fZ * a + rZ * halfW);
      this.groundElevations.fl = this.getElevation(this.wheelPoints.fl.x, this.wheelPoints.fl.z);

      this.wheelPoints.fr.set(this.position.x + fX * a - rX * halfW, this.position.y, this.position.z + fZ * a - rZ * halfW);
      this.groundElevations.fr = this.getElevation(this.wheelPoints.fr.x, this.wheelPoints.fr.z);

      this.wheelPoints.rl.set(this.position.x - fX * b + rX * halfW, this.position.y, this.position.z - fZ * b + rZ * halfW);
      this.groundElevations.rl = this.getElevation(this.wheelPoints.rl.x, this.wheelPoints.rl.z);

      this.wheelPoints.rr.set(this.position.x - fX * b - rX * halfW, this.position.y, this.position.z - fZ * b - rZ * halfW);
      this.groundElevations.rr = this.getElevation(this.wheelPoints.rr.x, this.wheelPoints.rr.z);

      const avgElev = (this.groundElevations.fl + this.groundElevations.fr + this.groundElevations.rl + this.groundElevations.rr) * 0.25;
      const targetGroundY = avgElev + this.groundY + this.rideHeight;

      // 8.3 Kütle-Yay-Sönümleyici (Mass-Spring-Damper) Kuvvet ve İvme Hesabı
      let compression = targetGroundY - this.position.y;

      // Zemin mikro pürüz filtresi (Deadzone: 1.5mm altındaki mikro salınımları yut)
      if (Math.abs(compression) < 0.0015) {
        compression = 0;
      }

      if (compression < -droopLimit) {
        // Araç havada: Serbest düşüş (Yerçekimi devrede)
        this.isAirborne = true;
        this.verticalVelocity -= this.handling.gravity * FIXED_DT;
        this.position.y += this.verticalVelocity * FIXED_DT;
      } else if (isStationary && Math.abs(compression) < 0.025 && Math.abs(this.verticalVelocity) < 0.06) {
        // IDLE / SLEEP MODU: Araç rölantideyken süspansiyon osilasyonunu bıçak gibi kes ve asfalta sıfırla
        this.isAirborne = false;
        this.verticalVelocity = 0;
        this.position.y = THREE.MathUtils.damp(this.position.y, targetGroundY, 24.0, FIXED_DT);
      } else {
        // Araç zeminde: SEMI-IMPLICIT (SYMPLECTIC) EULER & UNCONDITIONALLY STABLE DAMPING
        this.isAirborne = false;
        let springK = omegaN * omegaN;
        if (compression > bumpStop) {
          // Bump-stop aşırı basılma direnci (şasinin zemine vurmasını engeller)
          springK *= 2.5;
        }

        const springAcc = springK * compression;
        const dampingCoeff = 2.0 * zeta * omegaN;

        // Semi-Implicit Backward Damping Formülasyonu:
        // v_{t+1} = (v_t + a_{spring} * dt) / (1 + dampingCoeff * dt)
        this.verticalVelocity = (this.verticalVelocity + springAcc * FIXED_DT) / (1.0 + dampingCoeff * FIXED_DT);

        // Dinamik dikey hız kapanma eşiği
        if (Math.abs(this.verticalVelocity) < 0.002 && Math.abs(compression) < 0.002) {
          this.verticalVelocity = 0;
        }

        // Symplectic Euler: Yeni hız ile pozisyon entegrasyonu
        this.position.y += this.verticalVelocity * FIXED_DT;
      }

      // 8.4 Continuous Collision Detection (CCD): Sert Zemin Bariyeri
      // Süspansiyon maksimum çöküşünde bile şasinin asfalta batmasını engelleyen zemin tavanı
      const hardFloor = avgElev + this.groundY + Math.max(0.06, this.rideHeight * 0.35);
      if (this.position.y < hardFloor) {
        this.position.y = hardFloor;
        if (this.verticalVelocity < 0) {
          this.chassis.position.y = Math.max(-0.06, this.verticalVelocity * 0.006);
          this.verticalVelocity = 0;
        }
      }

      this.timeAccumulator -= FIXED_DT;
      subSteps++;
    }

    // Birikmiş süre aşımını temizle (Frame drop spiral emniyeti)
    if (this.timeAccumulator >= FIXED_DT) {
      this.timeAccumulator = 0;
    }

    // 9. Yol Eğimi (Pitch / Roll) ve Şasi Takibi
    const frontAvg = (this.groundElevations.fl + this.groundElevations.fr) * 0.5;
    const rearAvg = (this.groundElevations.rl + this.groundElevations.rr) * 0.5;
    const dynamicWheelBase = (a + b) > 0.5 ? (a + b) : (this.handling.wheelBase || 2.62);
    let roadPitch = Math.atan2(rearAvg - frontAvg, dynamicWheelBase);

    const leftAvg = (this.groundElevations.fl + this.groundElevations.rl) * 0.5;
    const rightAvg = (this.groundElevations.fr + this.groundElevations.rr) * 0.5;
    let roadRoll = Math.atan2(rightAvg - leftAvg, this.handling.trackWidth);

    // Araç dururken mikro açısal kafa sallamayı (Head jitter) önleyen ölü bölge
    if (isStationary) {
      if (Math.abs(roadPitch - this.root.rotation.x) < 0.008) roadPitch = this.root.rotation.x;
      if (Math.abs(roadRoll - this.root.rotation.z) < 0.008) roadRoll = this.root.rotation.z;
    }

    // Root dönüş ve konum güncellemesi
    this.root.position.copy(this.position);
    this.root.rotation.y = this.heading;
    this.root.rotation.x = THREE.MathUtils.damp(this.root.rotation.x, roadPitch, this.handling.suspensionDamping, delta);
    this.root.rotation.z = THREE.MathUtils.damp(this.root.rotation.z, roadRoll, this.handling.suspensionDamping, delta);

    // Şasi dikey sıkışmasını toparla
    this.chassis.position.y = THREE.MathUtils.damp(this.chassis.position.y, 0, 14.0, delta);

    // 10. Süspansiyon Gövde Yaylanması (Body Sway & Viraj Yatma)
    let targetPitch = THREE.MathUtils.clamp(netAccel * this.handling.pitchSensitivity, -0.08, 0.08);
    let targetRoll = THREE.MathUtils.clamp(-this.yawRate * this.vForward * this.handling.rollSensitivity, -0.11, 0.11);

    // Dururken gövde salınımını sıfırla
    if (isStationary) {
      targetPitch = 0;
      targetRoll = 0;
    }

    this.pitch = THREE.MathUtils.damp(this.pitch, targetPitch, 10.0, delta);
    this.roll = THREE.MathUtils.damp(this.roll, targetRoll, 9.0, delta);

    if (isStationary) {
      if (Math.abs(this.pitch) < 0.001) this.pitch = 0;
      if (Math.abs(this.roll) < 0.001) this.roll = 0;
    }

    this.chassis.rotation.x = this.pitch;
    this.chassis.rotation.z = this.roll;

    // 11. Dinamik Ackermann Geometrisi & Tekerlek Animasyonları
    const tanDelta = Math.tan(this.steerAngle);
    const absTan = Math.abs(tanDelta);
    const sign = Math.sign(this.steerAngle) || 1;

    let deltaInner = this.steerAngle;
    let deltaOuter = this.steerAngle;
    if (absTan > 0.001) {
      const denomInner = Math.max(0.1, 2 * L - W * absTan);
      const denomOuter = 2 * L + W * absTan;
      deltaInner = Math.atan((2 * L * absTan) / denomInner) * sign;
      deltaOuter = Math.atan((2 * L * absTan) / denomOuter) * sign;
    }

    // Sol virajda (steerAngle > 0): Sol tekerlek iç (inner), Sağ tekerlek dış (outer)
    // Sağ virajda (steerAngle < 0): Sağ tekerlek iç (inner), Sol tekerlek dış (outer)
    const steerFL = this.steerAngle > 0 ? deltaInner : deltaOuter;
    const steerFR = this.steerAngle > 0 ? deltaOuter : deltaInner;

    // 11. Evrensel Tekerlek Rotasyon ve Direksiyon Yönlendirmesi (Tüm araç tipleri için)
    this.updateWheelVisuals(delta);

    // 12. Far ve Işıklar
    this.updateLights();

    // 13. Debug Görselleştirme Güncellemesi
    this.updateDebugVisuals();

    // 14. ADIM 1: Acil Servis Tepe Flaşörleri ve Siren Konum Güncellemesi
    if (this.isEmergency) {
      if (this.sirenActive) {
        emergencyAudio.updateSirenPosition(this.position);
      }
      if (this.emergencyVisualRoot?.userData?.updateSirens) {
        this.emergencyVisualRoot.userData.updateSirens(delta, this.sirenActive);
      }
    }
  }

  /**
   * Acil Durum Tepe Sirenini ve Flaşörlerini Açar / Kapatır
   */
  toggleSiren() {
    if (!this.isEmergency) return false;
    this.sirenActive = !this.sirenActive;
    if (this.sirenActive) {
      emergencyAudio.startSiren(this.type === 'fire_truck' ? 'wail' : 'yelp', this.position);
    } else {
      emergencyAudio.stopSiren();
    }
    return this.sirenActive;
  }

  /**
   * Gerçekçi 3D Ambulans veya İtfaiye Gövdesini ve Tepe Flaşörlerini Bağlar
   */
  attachEmergencyVisuals() {
    this.isEmergency = true;
    const hasExistingBody = (this.bodyGroup && this.bodyGroup.children.length > 0);
    if (this.type === 'ambulance') {
      const mesh = EmergencyVehicleFactory.createAmbulanceMesh(null, hasExistingBody);
      this.emergencyVisualRoot = mesh;
      this.bodyGroup.add(mesh);
    } else if (this.type === 'fire_truck') {
      const mesh = EmergencyVehicleFactory.createFireTruckMesh(null, hasExistingBody);
      this.emergencyVisualRoot = mesh;
      this.bodyGroup.add(mesh);
    }
  }

  /**
   * WheelRig.js tarafından üretilen tekerlek rig çıktısını araca bağlar
   * @param {Object} rig 
   */
  setWheelRig(rig) {
    if (!rig || !rig.pivots) {
      console.warn(`[Vehicle] ${this.name}: Geçersiz WheelRig referansı.`);
      return;
    }

    this.wheelRig = rig;
    if (rig.rollSign !== undefined) this.wheelRollSign = rig.rollSign;
    if (rig.steerSign !== undefined) this.wheelSteerSign = rig.steerSign;

    this.wheelRadius = (rig.averageRadius && rig.averageRadius > 0.1) ? rig.averageRadius : (this.handling.wheelRadius || 0.35);
    this.handling.wheelRadius = this.wheelRadius;

    this.wheelBase = (rig.wheelBase && rig.wheelBase > 0.5) ? rig.wheelBase : (this.handling.wheelBase || 2.5);
    this.handling.wheelBase = this.wheelBase;

    this.trackWidth = (rig.trackWidth && rig.trackWidth > 0.5) ? rig.trackWidth : (this.handling.trackWidth || 1.6);
    this.handling.trackWidth = this.trackWidth;

    this.wheels = {
      fl_steer: rig.pivots.FL,
      fl_roll: rig.pivots.FL,
      fr_steer: rig.pivots.FR,
      fr_roll: rig.pivots.FR,
      rl_roll: rig.pivots.RL,
      rr_roll: rig.pivots.RR,
      FL: rig.pivots.FL,
      FR: rig.pivots.FR,
      RL: rig.pivots.RL,
      RR: rig.pivots.RR,
      fl: rig.pivots.FL,
      fr: rig.pivots.FR,
      rl: rig.pivots.RL,
      rr: rig.pivots.RR,
      Wheel_FL_Pivot: rig.pivots.FL,
      Wheel_FR_Pivot: rig.pivots.FR,
      Wheel_RL_Pivot: rig.pivots.RL,
      Wheel_RR_Pivot: rig.pivots.RR
    };

    console.log(`✅ [Vehicle] ${this.name || 'Araç'} Wheel Rig aktif: R=${Number(this.wheelRadius).toFixed(2)}m, L=${Number(this.wheelBase).toFixed(2)}m, W=${Number(this.trackWidth).toFixed(2)}m`);
  }

  /**
   * Her render/fizik karesinde tekerleklerin görsel rotasyonlarını günceller.
   * Runtime'da Euler yerine kesin Quaternion çarpımı uygular (Runtime Sıfır GC).
   * 
   * Formül:
   * pivot.quaternion.copy(baseQuat)
   * pivot.quaternion.multiply(steerQuaternionY)
   * pivot.quaternion.multiply(rollQuaternionX)
   * 
   * @param {number} dt - Geçen frame süresi (saniye)
   */
  updateWheelVisuals(dt) {
    if (!this.wheelRig || !this.wheelRig.pivots) {
      this.ensureWheelPivots();
    }
    if (!this.wheelRig || !this.wheelRig.pivots) return;

    const pivots = this.wheelRig.pivots;
    const radius = Math.max(0.1, this.wheelRadius || this.handling.wheelRadius || 0.32);

    // 1. İleri Hıza Göre Tekerlek Yuvarlanma Açısı Hesabı
    const forwardSpeed = this.vForward !== undefined ? this.vForward : this.speed;
    const deltaAngle = (forwardSpeed * dt) / radius;
    this.wheelRollAngle = (this.wheelRollAngle + deltaAngle * this.wheelRollSign) % (Math.PI * 2);

    // Yuvarlanma Quaternion'u (Yerel X Ekseni Etrafında)
    _wheelRollQuat.setFromAxisAngle(_axisX, this.wheelRollAngle);

    // 2. Ackermann Direksiyon Geometrisi & Direksiyon Quaternion'u (Yerel Y Ekseni)
    const tanDelta = Math.tan(this.steerAngle);
    const absTan = Math.abs(tanDelta);
    const sign = Math.sign(this.steerAngle) || 1;
    const L = this.wheelBase || 2.6;
    const W = this.trackWidth || 1.5;

    let deltaInner = this.steerAngle;
    let deltaOuter = this.steerAngle;
    if (absTan > 0.001) {
      const denomInner = Math.max(0.1, 2 * L - W * absTan);
      const denomOuter = 2 * L + W * absTan;
      deltaInner = Math.atan((2 * L * absTan) / denomInner) * sign;
      deltaOuter = Math.atan((2 * L * absTan) / denomOuter) * sign;
    }

    const steerFL = (this.steerAngle > 0 ? deltaInner : deltaOuter) * this.wheelSteerSign;
    const steerFR = (this.steerAngle > 0 ? deltaOuter : deltaInner) * this.wheelSteerSign;

    _wheelSteerQuatFL.setFromAxisAngle(_axisY, steerFL);
    _wheelSteerQuatFR.setFromAxisAngle(_axisY, steerFR);

    // 3. Ön Sol (FL) - Direksiyon (Y) + Yuvarlanma (X)
    if (pivots.FL) {
      const base = pivots.FL.userData.baseQuat;
      if (base) pivots.FL.quaternion.copy(base);
      else pivots.FL.quaternion.identity();
      pivots.FL.quaternion.multiply(_wheelSteerQuatFL);
      pivots.FL.quaternion.multiply(_wheelRollQuat);
    }

    // 4. Ön Sağ (FR) - Direksiyon (Y) + Yuvarlanma (X)
    if (pivots.FR) {
      const base = pivots.FR.userData.baseQuat;
      if (base) pivots.FR.quaternion.copy(base);
      else pivots.FR.quaternion.identity();
      pivots.FR.quaternion.multiply(_wheelSteerQuatFR);
      pivots.FR.quaternion.multiply(_wheelRollQuat);
    }

    // 5. Arka Sol (RL) - Sadece Yuvarlanma (X)
    if (pivots.RL) {
      const base = pivots.RL.userData.baseQuat;
      if (base) pivots.RL.quaternion.copy(base);
      else pivots.RL.quaternion.identity();
      pivots.RL.quaternion.multiply(_wheelRollQuat);
    }

    // 6. Arka Sağ (RR) - Sadece Yuvarlanma (X)
    if (pivots.RR) {
      const base = pivots.RR.userData.baseQuat;
      if (base) pivots.RR.quaternion.copy(base);
      else pivots.RR.quaternion.identity();
      pivots.RR.quaternion.multiply(_wheelRollQuat);
    }
  }

  /**
   * Geriye dönük uyumluluk için alias
   */
  updateWheels(delta) {
    this.updateWheelVisuals(delta);
  }

  /**
   * Pivotların varlığını frame bazında kontrol eder, eksik veya kopuksa tekrar bağlar
   */
  ensureWheelPivots() {
    if (this.wheelRig && this.wheelRig.pivots && this.wheelRig.pivots.FL) {
      return;
    }

    const pFL = this.chassis.getObjectByName('Wheel_FL_Pivot') || this.root.getObjectByName('Wheel_FL_Pivot');
    const pFR = this.chassis.getObjectByName('Wheel_FR_Pivot') || this.root.getObjectByName('Wheel_FR_Pivot');
    const pRL = this.chassis.getObjectByName('Wheel_RL_Pivot') || this.root.getObjectByName('Wheel_RL_Pivot');
    const pRR = this.chassis.getObjectByName('Wheel_RR_Pivot') || this.root.getObjectByName('Wheel_RR_Pivot');

    if (pFL && pFR && pRL && pRR) {
      this.setWheelRig({
        pivots: { FL: pFL, FR: pFR, RL: pRL, RR: pRR },
        rollSign: this.wheelRollSign,
        steerSign: this.wheelSteerSign,
        averageRadius: this.wheelRadius || 0.32,
        wheelBase: this.wheelBase,
        trackWidth: this.trackWidth
      });
      return;
    }

    // Model kökünden Wheel Rig oluştur
    const rig = buildWheelRig(this.chassis, {
      rollSign: this.wheelRollSign,
      steerSign: this.wheelSteerSign,
      useGeometryFallback: true,
      createFallbackVisuals: false,
      fallbackRadius: this.wheelRadius || 0.32
    });
    this.setWheelRig(rig);
  }

  /**
   * Motor devri ve 5 ileri otomatik vites simülasyonu
   */
  updateEngineRPM(delta) {
    if (this.isReversing) {
      this.currentGear = 'R';
      const revRatio = Math.abs(this.speed) / this.maxReverseSpeed;
      this.engineRPM = THREE.MathUtils.lerp(850, 4800, revRatio);
      return;
    }

    if (this.speed === 0 && this.input.throttle === 0) {
      this.currentGear = 1;
      this.engineRPM = THREE.MathUtils.damp(this.engineRPM, 850, 4.0, delta);
      return;
    }

    // Vites seçimi
    let gear = 1;
    for (let i = 1; i < this.gearThresholds.length; i++) {
      if (this.kmh >= this.gearThresholds[i - 1]) {
        gear = i;
      }
    }
    this.currentGear = Math.min(gear, Math.max(1, this.gearThresholds.length - 1));

    const minSpeedInGear = this.gearThresholds[this.currentGear - 1];
    const maxSpeedInGear = this.gearThresholds[this.currentGear] || Math.round(this.maxForwardSpeed * 3.6);
    const gearProgress = THREE.MathUtils.clamp((this.kmh - minSpeedInGear) / (maxSpeedInGear - minSpeedInGear), 0, 1);

    const targetRPM = 1200 + gearProgress * 4800 + (this.input.throttle > 0 ? 500 : 0);
    this.engineRPM = THREE.MathUtils.damp(this.engineRPM, targetRPM, 8.0, delta);
  }

  /**
   * Fren ve geri lambalarını dinamik parlatır
   */
  updateLights() {
    // Fren Lambaları
    const brakeIntensity = this.isBraking ? 2.8 : 0.4;
    const brakeColor = this.isBraking ? 0xff1111 : 0x440000;
    for (const mat of this.lights.tailMaterials) {
      mat.emissive.setHex(brakeColor);
      mat.emissiveIntensity = brakeIntensity;
    }

    // Geri Vites Lambaları
    const revIntensity = this.isReversing ? 2.2 : 0;
    for (const mat of this.lights.reverseMaterials) {
      mat.emissiveIntensity = revIntensity;
      if (this.isReversing) mat.emissive.setHex(0xffffff);
    }
  }

  /**
   * Sürücü binme / inme konumu (Sol sürücü kapısı)
   */
  getDriverSeatWorldPos() {
    const leftVec = new THREE.Vector3(-Math.cos(this.heading), 0, Math.sin(this.heading));
    return this.position.clone().addScaledVector(leftVec, 1.8);
  }
}

/**
 * GLB Araç Modeli Teşhis Fonksiyonu (Adım 1)
 * gltf.scene'i traverse edip konsola her mesh için kalıcı teşhis logu basar.
 */
export function logVehicleModelDiagnostics(scene, modelName = 'sedan_eclass.glb') {
  console.group(`🚗 [Araç Teşhis Raporu] Model: ${modelName}`);
  const reportRows = [];
  scene.traverse(node => {
    if (node.isMesh && node.material) {
      const mats = Array.isArray(node.material) ? node.material : [node.material];
      mats.forEach((mat, idx) => {
        if (!mat) return;
        const hasMap = !!mat.map;
        let mapSize = 'Yok';
        if (hasMap && mat.map && mat.map.image) {
          const img = mat.map.image;
          mapSize = `${img.width || img.videoWidth || '?'}x${img.height || img.videoHeight || '?'}`;
        }
        const colorHex = mat.color ? '#' + mat.color.getHexString() : 'Yok';
        const metalness = mat.metalness !== undefined ? Number(mat.metalness).toFixed(2) : 'Yok';
        const roughness = mat.roughness !== undefined ? Number(mat.roughness).toFixed(2) : 'Yok';
        const parentName = node.parent ? (node.parent.name || '(isimsiz)') : 'Yok';
        const meshName = node.name || '(isimsiz)';
        const matName = mat.name || `(isimsiz #${idx})`;

        console.log(
          `%c[Mesh] ${meshName}%c | Parent: ${parentName} | Mat: ${matName} | Map: ${hasMap ? 'VAR' : 'YOK'} (${mapSize}) | Color: ${colorHex} | Metal: ${metalness} | Rough: ${roughness}`,
          'color: #00e5ff; font-weight: bold;',
          'color: inherit;'
        );

        reportRows.push({
          'Mesh Adı': meshName,
          'Parent Düğüm': parentName,
          'Materyal': matName,
          'Map': hasMap ? 'VAR' : 'YOK',
          'Doku Boyutu': mapSize,
          'Color Hex': colorHex,
          'Metalness': metalness,
          'Roughness': roughness
        });
      });
    }
  });

  if (console.table && reportRows.length > 0) {
    console.table(reportRows);
  }
  console.groupEnd();
}

/**
 * VehicleManager - Tüm Araçları, Girişleri, Takip Kamerasını ve Sesleri Yönetir
 */
export class VehicleManager {
  constructor(scene, camera, domElement, audioManager = null, characterManager = null, collisionManager = null) {
    this.scene = scene;
    this.camera = camera;
    this.domElement = domElement;
    this.audioManager = audioManager;
    this.characterManager = characterManager;
    this.collisionManager = collisionManager;
    this.terrainManager = null;

    this.vehicles = [];
    this.activeVehicle = null;
    this.assetManager = assetManager;
    this.gltfLoader = assetManager.gltfLoader;
    this.isModelLoaded = false;
    this.carTemplateScene = null;

    // Tuş Takibi
    this.keys = {
      forward: false,
      backward: false,
      left: false,
      right: false,
      handbrake: false,
      horn: false,
      lights: false
    };

    // 3. Şahıs Takip Kamerası Parametreleri
    this.camDistance = 4.85;
    this.camHeight = 1.30;
    this.camPitch = 0.08;
    this.camDefaultPitch = 0.08;
    this.camYaw = 0;
    this.camFovBase = 52;
    this.isMouseOrbiting = false;
    this.isMouseDown = false;
    this.lastMouseLookTime = 0;
    this.mouseSensitivity = 0.003;
    this.camCurrentPos = new THREE.Vector3();
    this.camCurrentLook = new THREE.Vector3();
    this._tmpTargetCamPos = new THREE.Vector3();
    this._tmpTargetLook = new THREE.Vector3();

    // Performans için önceden tahsis edilen geçici vektörler (GC baskısını sıfırlar)
    this._tmpPushDir = new THREE.Vector3();
    this._tmpRayDir = new THREE.Vector3();
    this._tmpCamHit = { hit: false, distance: Infinity, point: new THREE.Vector3() };
    this._tmpFrontPos = new THREE.Vector3();
    this._tmpBackPos = new THREE.Vector3();
    this._nearColliders = [];

    // Yakınlık Algılama & UI Önbelleği
    this.nearestVehicle = null;
    this.promptElement = document.getElementById('vehicle-prompt');
    this.promptVehicleName = document.getElementById('prompt-vehicle-name');
    this.speedoElement = document.getElementById('gta-speedo');
    this.speedoVal = document.getElementById('speedo-val');
    this.speedoGear = document.getElementById('speedo-gear');
    this.speedoRpmBar = document.getElementById('speedo-rpm-fill');
    this.speedoVehName = document.getElementById('speedo-veh-name');
    this.indDrift = document.getElementById('ind-drift');
    this.indBrake = document.getElementById('ind-brake');

    // UI Dirty-Checking Durumları
    this._lastPromptVisible = null;
    this._lastPromptName = null;
    this._lastKmh = null;
    this._lastGear = null;
    this._lastVehName = null;
    this._lastRpmWidth = null;
    this._lastDrift = null;
    this._lastBrake = null;

    // Merkezi GTA Tarzı Kamera Occlusion Çözücüsü
    this.cameraSolver = new CameraCollisionSolver(this.collisionManager, {
      sphereRadius: 0.28,
      safeMargin: 0.22,
      minDistance: 1.10,
      minGroundClearance: 0.45,
      hardInFactor: 0.88,
      softOutFactor: 0.10,
      maxPitchBoost: 0.32
    });

    this.initAudioNodes();
    this.initEvents();
    this.loadVehicleModels();
  }

  get isDriving() {
    return !!this.activeVehicle;
  }

  setTerrainManager(tm) {
    this.terrainManager = tm;
    if (this.vehicles) {
      this.vehicles.forEach(v => {
        v.terrain = tm;
        v.snapToGround();
      });
    }
  }

  setCollisionManager(cm) {
    this.collisionManager = cm;
    if (this.cameraSolver) {
      this.cameraSolver.collisionManager = cm;
    }
    if (this.vehicles) {
      this.vehicles.forEach(v => {
        v.collisionManager = cm;
      });
    }
  }

  /**
   * Web Audio API ile Gerçekçi Prosedürel Araç Ses Sistemi (Dış dosya gerektirmez)
   * - Saf testere dişi (sawtooth) ve rezonanslı filtre kaldırıldı (sinek/arı vızıltısını önler)
   * - İkili detune üçgen (triangle) piston osilatörleri ile canlı mekanik V8 atımı
   * - Yumuşak analog doygunluk (WaveShaper saturation) ile tok egzoz kükremesi
   * - İki kademeli düşük geçiren filtre (150-480Hz) ile sıfır tiz cızırtı
   * - Marş basma (starter crank) ve gövde çarpışma (crash) sesleri
   */
  initAudioNodes() {
    this.audioCtx = null;
    this.engineSubOsc = null;
    this.enginePiston1 = null;
    this.enginePiston2 = null;
    this.enginePiston3 = null;
    this.engineDistortion = null;
    this.engineFilter1 = null;
    this.engineFilter2 = null;
    this.engineGain = null;
    this.exhaustNoise = null;
    this.exhaustFilter = null;
    this.exhaustGain = null;
    this.hornOsc1 = null;
    this.hornOsc2 = null;
    this.hornGain = null;
    this.skidSource = null;
    this.skidGain = null;
    this.isEngineSoundPlaying = false;
  }

  ensureAudio() {
    if (this.audioCtx) return;
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    this.audioCtx = new AudioCtx();
  }

  createDistortionCurve(k = 16) {
    const n_samples = 2048;
    const curve = new Float32Array(n_samples);
    for (let i = 0; i < n_samples; ++i) {
      const x = (i * 2) / n_samples - 1;
      curve[i] = Math.tanh(k * x) / Math.tanh(k);
    }
    return curve;
  }

  startEngineAudio() {
    this.ensureAudio();
    if (!this.audioCtx || this.isEngineSoundPlaying) return;
    if (this.audioCtx.state === 'suspended') this.audioCtx.resume();

    try {
      const now = this.audioCtx.currentTime;

      // 1. Derin Sub-Bass Gövde Titreşimi (Kabin ve Şasi Tokluğu)
      this.engineSubOsc = this.audioCtx.createOscillator();
      this.engineSubOsc.type = 'triangle';
      this.engineSubOsc.frequency.setValueAtTime(28, now);

      // 2. Birinci Piston Yanma Osilatörü (V8 Ana Piston Frekansı)
      this.enginePiston1 = this.audioCtx.createOscillator();
      this.enginePiston1.type = 'triangle';
      this.enginePiston1.frequency.setValueAtTime(34, now);

      // 3. İkinci Piston Yanma Osilatörü (Hafif detune - Gerçekçi mekanik atım ve V8 homurtusu)
      this.enginePiston2 = this.audioCtx.createOscillator();
      this.enginePiston2.type = 'triangle';
      this.enginePiston2.frequency.setValueAtTime(35.2, now);

      // 4. İkinci Harmonik Tokluk (Tiz olmayan gövde rezonansı)
      this.enginePiston3 = this.audioCtx.createOscillator();
      this.enginePiston3.type = 'sine';
      this.enginePiston3.frequency.setValueAtTime(68, now);

      // Yumuşak Doygunluk (WaveShaper - Dijital sertliği yok eder, egzoz borusu tokluğu verir)
      this.engineDistortion = this.audioCtx.createWaveShaper();
      this.engineDistortion.curve = this.createDistortionCurve(16);
      this.engineDistortion.oversample = '2x';

      // 1. Kademe Alçak Geçiren Filtre (Tüm tizleri ve arı/sinek vızıltılarını kesin olarak keser)
      this.engineFilter1 = this.audioCtx.createBiquadFilter();
      this.engineFilter1.type = 'lowpass';
      this.engineFilter1.frequency.setValueAtTime(160, now);
      this.engineFilter1.Q.setValueAtTime(1.1, now);

      // 2. Kademe Alçak Geçiren Filtre (Derin egzoz boğukluğu)
      this.engineFilter2 = this.audioCtx.createBiquadFilter();
      this.engineFilter2.type = 'lowpass';
      this.engineFilter2.frequency.setValueAtTime(260, now);
      this.engineFilter2.Q.setValueAtTime(0.8, now);

      // Ana Motor Kazancı (Volume)
      this.engineGain = this.audioCtx.createGain();
      this.engineGain.gain.setValueAtTime(0.09, now);

      // Bağlantılar:
      // Osilatörler -> Waveshaper -> Filter1 -> Filter2 -> EngineGain -> Destination
      this.engineSubOsc.connect(this.engineDistortion);
      this.enginePiston1.connect(this.engineDistortion);
      this.enginePiston2.connect(this.engineDistortion);
      this.enginePiston3.connect(this.engineDistortion);

      this.engineDistortion.connect(this.engineFilter1);
      this.engineFilter1.connect(this.engineFilter2);
      this.engineFilter2.connect(this.engineGain);
      this.engineGain.connect(this.audioCtx.destination);

      this.engineSubOsc.start();
      this.enginePiston1.start();
      this.enginePiston2.start();
      this.enginePiston3.start();

      // Egzoz Borusu Hava Akışı & Rüzgar Uğultusu
      this.createExhaustAudio();

      // Lastik Kayma / Drift Sesi
      this.createSkidAudio();

      this.isEngineSoundPlaying = true;
    } catch (e) {
      console.warn('Audio start error:', e);
    }
  }

  createExhaustAudio() {
    if (!this.audioCtx) return;
    try {
      const bufferSize = this.audioCtx.sampleRate * 2;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      let lastOut = 0.0;
      for (let i = 0; i < bufferSize; i++) {
        const white = Math.random() * 2 - 1;
        lastOut = (lastOut * 0.94) + (white * 0.06);
        data[i] = lastOut * 3.2;
      }

      this.exhaustNoise = this.audioCtx.createBufferSource();
      this.exhaustNoise.buffer = buffer;
      this.exhaustNoise.loop = true;

      this.exhaustFilter = this.audioCtx.createBiquadFilter();
      this.exhaustFilter.type = 'bandpass';
      this.exhaustFilter.frequency.setValueAtTime(120, this.audioCtx.currentTime);
      this.exhaustFilter.Q.setValueAtTime(1.0, this.audioCtx.currentTime);

      this.exhaustGain = this.audioCtx.createGain();
      this.exhaustGain.gain.setValueAtTime(0.012, this.audioCtx.currentTime);

      this.exhaustNoise.connect(this.exhaustFilter);
      this.exhaustFilter.connect(this.exhaustGain);
      this.exhaustGain.connect(this.audioCtx.destination);
      this.exhaustNoise.start();
    } catch (e) {}
  }

  createSkidAudio() {
    if (!this.audioCtx) return;
    try {
      const bufferSize = this.audioCtx.sampleRate * 2;
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
      }

      this.skidSource = this.audioCtx.createBufferSource();
      this.skidSource.buffer = buffer;
      this.skidSource.loop = true;

      const skidFilter = this.audioCtx.createBiquadFilter();
      skidFilter.type = 'bandpass';
      skidFilter.frequency.setValueAtTime(950, this.audioCtx.currentTime);
      skidFilter.Q.setValueAtTime(3.0, this.audioCtx.currentTime);

      this.skidGain = this.audioCtx.createGain();
      this.skidGain.gain.setValueAtTime(0.0001, this.audioCtx.currentTime);

      this.skidSource.connect(skidFilter);
      skidFilter.connect(this.skidGain);
      this.skidGain.connect(this.audioCtx.destination);
      this.skidSource.start();
    } catch (e) {}
  }

  updateEngineAudio(rpm, throttle, isDrifting) {
    if (!this.audioCtx || !this.isEngineSoundPlaying) return;
    try {
      const now = this.audioCtx.currentTime;
      const rpmNorm = THREE.MathUtils.clamp((rpm - 800) / 5200, 0, 1.0);

      // Tok, pes frekanslar (Asla tiz/sinek frekanslarına çıkmaz)
      // Rölanti: ~28-34 Hz, Azami Devir: ~56-78 Hz
      const subFreq = THREE.MathUtils.lerp(28, 56, rpmNorm);
      const p1Freq = THREE.MathUtils.lerp(34, 76, rpmNorm);
      const p2Freq = THREE.MathUtils.lerp(35.2, 78.5, rpmNorm);
      const p3Freq = p1Freq * 2.0;

      this.engineSubOsc?.frequency.setTargetAtTime(subFreq, now, 0.05);
      this.enginePiston1?.frequency.setTargetAtTime(p1Freq, now, 0.05);
      this.enginePiston2?.frequency.setTargetAtTime(p2Freq, now, 0.05);
      this.enginePiston3?.frequency.setTargetAtTime(p3Freq, now, 0.05);

      // Gaz pedalına basıldıkça egzoz kapakları açılır ve tok kükreme artar
      // Filtreler asla 520 Hz üzerine çıkmaz -> Vızıltı sıfır!
      const isThrottle = throttle > 0.05;
      const f1Target = THREE.MathUtils.lerp(150, 320, rpmNorm) + (isThrottle ? 50 * throttle : 0);
      const f2Target = THREE.MathUtils.lerp(240, 440, rpmNorm) + (isThrottle ? 70 * throttle : 0);

      this.engineFilter1?.frequency.setTargetAtTime(f1Target, now, 0.06);
      this.engineFilter2?.frequency.setTargetAtTime(f2Target, now, 0.06);

      // Ses kazancı dengesi
      const targetGain = isThrottle ? (0.09 + throttle * 0.045) : 0.065;
      this.engineGain?.gain.setTargetAtTime(targetGain, now, 0.07);

      // Egzoz hava akışı
      if (this.exhaustGain && this.exhaustFilter) {
        const exhGain = isThrottle ? (0.025 + 0.03 * throttle) : 0.012;
        this.exhaustGain.gain.setTargetAtTime(exhGain, now, 0.08);
        this.exhaustFilter.frequency.setTargetAtTime(THREE.MathUtils.lerp(110, 240, rpmNorm), now, 0.08);
      }

      // Drift ve Lastik Sesi
      if (this.skidGain) {
        const skidTargetGain = isDrifting ? 0.16 : 0.0001;
        this.skidGain.gain.setTargetAtTime(skidTargetGain, now, 0.08);
      }
    } catch (e) {}
  }

  stopEngineAudio() {
    if (!this.audioCtx || !this.isEngineSoundPlaying) return;
    try {
      const now = this.audioCtx.currentTime;
      if (this.engineGain) this.engineGain.gain.linearRampToValueAtTime(0.001, now + 0.35);
      if (this.exhaustGain) this.exhaustGain.gain.linearRampToValueAtTime(0.0001, now + 0.2);
      if (this.skidGain) this.skidGain.gain.linearRampToValueAtTime(0.0001, now + 0.1);
      setTimeout(() => {
        try {
          this.engineSubOsc?.stop();
          this.enginePiston1?.stop();
          this.enginePiston2?.stop();
          this.enginePiston3?.stop();
          this.exhaustNoise?.stop();
          this.skidSource?.stop();
        } catch (e) {}
        this.isEngineSoundPlaying = false;
      }, 400);
    } catch (e) {}
  }

  playStarterSound() {
    this.ensureAudio();
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      // 3 hızlı marş basma (crank-crank-crank)
      for (let i = 0; i < 3; i++) {
        const t = now + i * 0.13;
        const osc = this.audioCtx.createOscillator();
        const gain = this.audioCtx.createGain();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(62 + i * 7, t);
        osc.frequency.exponentialRampToValueAtTime(28, t + 0.09);
        gain.gain.setValueAtTime(0.16, t);
        gain.gain.exponentialRampToValueAtTime(0.001, t + 0.1);
        osc.connect(gain);
        gain.connect(this.audioCtx.destination);
        osc.start(t);
        osc.stop(t + 0.11);
      }
      // Ateşleme kükremesi (Ignition burst)
      const fireT = now + 0.42;
      const fireOsc = this.audioCtx.createOscillator();
      const fireGain = this.audioCtx.createGain();
      fireOsc.type = 'triangle';
      fireOsc.frequency.setValueAtTime(105, fireT);
      fireOsc.frequency.exponentialRampToValueAtTime(42, fireT + 0.28);
      fireGain.gain.setValueAtTime(0.22, fireT);
      fireGain.gain.exponentialRampToValueAtTime(0.01, fireT + 0.3);
      fireOsc.connect(fireGain);
      fireGain.connect(this.audioCtx.destination);
      fireOsc.start(fireT);
      fireOsc.stop(fireT + 0.32);
    } catch (e) {}
  }

  playCrashSound(speed = 5) {
    this.ensureAudio();
    if (!this.audioCtx) return;
    try {
      const safeSpeed = (typeof speed === 'number' && !isNaN(speed)) ? Math.abs(speed) : 5;
      const now = this.audioCtx.currentTime;
      const intensity = THREE.MathUtils.clamp(safeSpeed / 20.0, 0.25, 1.0);

      // Gövde metal çarpma darbesi (Düşük frekanslı tok darbe)
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(85, now);
      osc.frequency.exponentialRampToValueAtTime(20, now + 0.22);

      gain.gain.setValueAtTime(0.28 * intensity, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.24);

      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start(now);
      osc.stop(now + 0.25);

      // Metal sürtünme gürültü patlaması
      const bufferSize = Math.floor(this.audioCtx.sampleRate * 0.2);
      const buffer = this.audioCtx.createBuffer(1, bufferSize, this.audioCtx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < bufferSize; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (bufferSize * 0.35));
      }
      const noise = this.audioCtx.createBufferSource();
      noise.buffer = buffer;
      const filter = this.audioCtx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.setValueAtTime(320, now);

      const noiseGain = this.audioCtx.createGain();
      noiseGain.gain.setValueAtTime(0.22 * intensity, now);
      noiseGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);

      noise.connect(filter);
      filter.connect(noiseGain);
      noiseGain.connect(this.audioCtx.destination);
      noise.start(now);
    } catch (e) {}
  }

  playCarHorn(active) {
    this.ensureAudio();
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      if (active) {
        if (!this.hornOsc1) {
          this.hornOsc1 = this.audioCtx.createOscillator();
          this.hornOsc2 = this.audioCtx.createOscillator();
          this.hornGain = this.audioCtx.createGain();

          // Amerikan Korna Armonisi (F ve A notaları: 349Hz ve 440Hz)
          this.hornOsc1.type = 'triangle';
          this.hornOsc1.frequency.setValueAtTime(349, now);
          this.hornOsc2.type = 'sawtooth';
          this.hornOsc2.frequency.setValueAtTime(440, now);

          this.hornGain.gain.setValueAtTime(0.12, now);
          this.hornOsc1.connect(this.hornGain);
          this.hornOsc2.connect(this.hornGain);
          this.hornGain.connect(this.audioCtx.destination);

          this.hornOsc1.start();
          this.hornOsc2.start();
        }
      } else {
        if (this.hornOsc1) {
          this.hornGain?.gain.linearRampToValueAtTime(0.001, now + 0.08);
          setTimeout(() => {
            try {
              this.hornOsc1?.stop();
              this.hornOsc2?.stop();
            } catch (e) {}
            this.hornOsc1 = null;
            this.hornOsc2 = null;
          }, 90);
        }
      }
    } catch (e) {}
  }

  playDoorSound() {
    this.ensureAudio();
    if (!this.audioCtx) return;
    try {
      const now = this.audioCtx.currentTime;
      const osc = this.audioCtx.createOscillator();
      const gain = this.audioCtx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(140, now);
      osc.frequency.exponentialRampToValueAtTime(40, now + 0.12);
      gain.gain.setValueAtTime(0.2, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      osc.connect(gain);
      gain.connect(this.audioCtx.destination);
      osc.start();
      osc.stop(now + 0.15);
    } catch (e) {}
  }

  /**
   * Klavye ve Fare Olayları
   */
  initEvents() {
    window.addEventListener('keydown', (e) => this.onKeyDown(e));
    window.addEventListener('keyup', (e) => this.onKeyUp(e));

    // Tarayıcı Testleri & Konsol Otomasyonu İçin Global Yardımcılar
    window.teleportToVehicle = (index = 0) => {
      if (!this.vehicles || this.vehicles.length === 0) return false;
      const target = this.vehicles[index] || this.vehicles[0];
      if (this.activeVehicle) {
        if (this.activeVehicle === target) return true;
        this.cycleOrTeleportVehicle(1);
      } else {
        this.enterVehicle(target);
      }
      return true;
    };
    window.cycleVehicle = (dir = 1) => this.cycleOrTeleportVehicle(dir);
    window.teleportPlayer = (x, z) => {
      if (this.characterManager) {
        this.characterManager.position.x = x;
        this.characterManager.position.z = z;
        if (this.terrainManager) {
          this.characterManager.position.y = this.terrainManager.getHeightAt(x, z);
        }
        return true;
      }
      return false;
    };

    // ADIM 16: Carjacking Test Yardımcıları
    window.carjackNearestNpcVehicle = () => {
      const trafficMgr = this.trafficManager || window.trafficManager;
      if (!trafficMgr || !trafficMgr.npcs || trafficMgr.npcs.length === 0) {
        console.warn('Yakında hiç NPC araç bulunamadı!');
        return false;
      }
      const charPos = this.characterManager?.position || new THREE.Vector3();
      let nearest = null;
      let minD = Infinity;
      for (const n of trafficMgr.npcs) {
        const d = charPos.distanceTo(n.position);
        if (d < minD) {
          minD = d;
          nearest = n;
        }
      }
      if (nearest) {
        this.carjackNpcVehicle(nearest);
        return true;
      }
      return false;
    };

    window.spawnNpcCarAhead = (dist = 5.0) => {
      const trafficMgr = this.trafficManager || window.trafficManager;
      if (!trafficMgr) return null;
      const charPos = this.characterManager?.position || new THREE.Vector3();
      const heading = this.characterManager?.rotation || 0;
      const forwardVec = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const spawnPos = charPos.clone().addScaledVector(forwardVec, dist);
      const npc = trafficMgr.spawnNpcAtPosition(spawnPos, heading, 0xd97724);
      console.log(`🚗 [DEBUG] Oyuncunun önüne NPC araç üretildi! Mesafe: ${dist}m`, npc);
      return npc;
    };

    // ADIM 1: Acil Servis Araç Spawn Kısayolları (Geliştirici & Test Kolaylığı)
    window.spawnAmbulanceAhead = (dist = 5.0) => {
      const charPos = this.characterManager?.position || new THREE.Vector3();
      const heading = this.characterManager?.rotation || 0;
      const forwardVec = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const spawnPos = charPos.clone().addScaledVector(forwardVec, dist);
      const amb = this.spawnAmbulance(spawnPos, heading);
      console.log(`🚑 [DEBUG] Oyuncunun önüne Ambulans üretildi! Mesafe: ${dist}m`, amb);
      return amb;
    };

    window.spawnFireTruckAhead = (dist = 6.5) => {
      const charPos = this.characterManager?.position || new THREE.Vector3();
      const heading = this.characterManager?.rotation || 0;
      const forwardVec = new THREE.Vector3(Math.sin(heading), 0, Math.cos(heading));
      const spawnPos = charPos.clone().addScaledVector(forwardVec, dist);
      const ft = this.spawnFireTruck(spawnPos, heading);
      console.log(`🚒 [DEBUG] Oyuncunun önüne İtfaiye Aracı üretildi! Mesafe: ${dist}m`, ft);
      return ft;
    };

    // Fare ile 360° Araç Yörünge İnceleme (Sağ Tık veya Sol Tıkla Sürükleme / Serbest Bakış)
    this.domElement.addEventListener('mousedown', (e) => {
      if (this.activeVehicle) {
        this.isMouseDown = true;
        this.isMouseOrbiting = true;
        this.lastMouseLookTime = performance.now();
      }
    });

    window.addEventListener('mouseup', () => {
      this.isMouseDown = false;
      this.lastMouseLookTime = performance.now(); // Fare bırakılınca 2 saniyelik toparlanma sayacı başlar
    });

    window.addEventListener('mousemove', (e) => {
      if (this.activeVehicle) {
        const isInteracting = this.isMouseDown || document.pointerLockElement === this.domElement;
        if (isInteracting && (e.movementX !== 0 || e.movementY !== 0)) {
          this.isMouseOrbiting = true;
          this.lastMouseLookTime = performance.now();
          this.camYaw -= (e.movementX || 0) * this.mouseSensitivity;
          this.camPitch = THREE.MathUtils.clamp(
            this.camPitch + (e.movementY || 0) * this.mouseSensitivity,
            -0.15,
            0.68
          );
        }
      }
    });
  }

  onKeyDown(e) {
    // J Tuşu: Araç Fizik Debug Görselleştirmesi
    if (e.code === 'KeyJ') {
      this.toggleDebug();
      return;
    }

    // Tab Tuşu: Farming Simulator Tarzı Hızlı Araç Işınlanma & Araçlar Arası Geçiş (Dev / Test Kolaylığı)
    if (e.code === 'Tab') {
      e.preventDefault();
      const direction = e.shiftKey ? -1 : 1;
      this.cycleOrTeleportVehicle(direction);
      return;
    }

    // F Tuşu: Araca Bin / İn veya NPC Aracını Çal (ADIM 16: Carjacking)
    if (e.code === 'KeyF' || e.code === 'Enter') {
      if (this.activeVehicle) {
        this.exitActiveVehicle();
      } else if (this.nearestVehicle) {
        this.enterVehicle(this.nearestVehicle);
      } else if (this.nearestNpcVehicle) {
        this.carjackNpcVehicle(this.nearestNpcVehicle);
      }
      return;
    }

    if (!this.activeVehicle) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = true;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = true;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = true;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = true;
        break;
      case 'Space':
        this.keys.handbrake = true;
        e.preventDefault();
        break;
      case 'Digit2':
      case 'CapsLock':
        if (this.activeVehicle.type === 'ambulance') {
          window.paramedicMission?.toggleMission();
        } else if (this.activeVehicle.type === 'fire_truck') {
          window.firefighterMission?.toggleMission();
        }
        break;
      case 'KeyE':
        if (this.activeVehicle.isEmergency) {
          this.activeVehicle.toggleSiren();
        }
        break;
      case 'KeyH':
        if (this.activeVehicle.isEmergency) {
          this.activeVehicle.toggleSiren();
        } else if (!this.keys.horn) {
          this.keys.horn = true;
          this.playCarHorn(true);
        }
        break;
      case 'KeyL':
        this.activeVehicle.toggleHeadlights();
        break;
      case 'KeyR':
        this.resetVehicle(this.activeVehicle);
        break;
    }
  }

  onKeyUp(e) {
    if (!this.activeVehicle) return;

    switch (e.code) {
      case 'KeyW':
      case 'ArrowUp':
        this.keys.forward = false;
        break;
      case 'KeyS':
      case 'ArrowDown':
        this.keys.backward = false;
        break;
      case 'KeyA':
      case 'ArrowLeft':
        this.keys.left = false;
        break;
      case 'KeyD':
      case 'ArrowRight':
        this.keys.right = false;
        break;
      case 'Space':
        this.keys.handbrake = false;
        break;
      case 'KeyH':
        this.keys.horn = false;
        this.playCarHorn(false);
        break;
    }
  }

  /**
   * GLB Araç Paketini Yükler ve Grove Street'e Park Eder
   */
  loadVehicleModels() {
    const pGtr = this.assetManager.loadGLTF('vehicle_nissan_gtr').catch(e => null);
    const pGiulia = this.assetManager.loadGLTF('vehicle_alfa_giulia_1965').catch(e => null);
    const pToyota = this.assetManager.loadGLTF('vehicle_toyota_bz4x').catch(e => null);
    const pSpider = this.assetManager.loadGLTF('vehicle_alfa_spider_1986').catch(e => null);
    const pMercedes = this.assetManager.loadGLTF('vehicle_mercedes_e50').catch(e => null);
    const pBmw = this.assetManager.loadGLTF('vehicle_bmw_vision').catch(e => null);
    const pSuv = this.assetManager.loadGLTF('vehicle_suv').catch(e => null);

    Promise.all([pGtr, pGiulia, pToyota, pSpider, pMercedes, pBmw, pSuv]).then(([gtrRes, giuliaRes, toyotaRes, spiderRes, mercRes, bmwRes, suvRes]) => {
      if (gtrRes && gtrRes.scene) {
        separateGtrWheels(gtrRes.scene);
        this.gtrTemplateScene = gtrRes.scene;
      }
      this.giuliaTemplateScene = giuliaRes ? giuliaRes.scene : null;
      this.toyotaTemplateScene = toyotaRes ? toyotaRes.scene : null;
      this.spiderTemplateScene = spiderRes ? spiderRes.scene : null;
      this.mercTemplateScene = mercRes ? mercRes.scene : null;
      this.bmwTemplateScene = bmwRes ? bmwRes.scene : null;
      this.suvTemplateScene = suvRes ? suvRes.scene : null;
      this.carTemplateScene = this.gtrTemplateScene || this.toyotaTemplateScene;

      // ADIM 1: Acil Durum Fabrikasına Gerçekçi GLB Şablonlarını Tanıt
      const emergencyTemplate = this.suvTemplateScene || this.toyotaTemplateScene;
      EmergencyVehicleFactory.setTemplates({
        ambulance: emergencyTemplate,
        fireTruck: emergencyTemplate
      });

      this.isModelLoaded = true;
      this.spawnInitialVehicles();
    }).catch((err) => {
      console.error('Vehicle model load error:', err);
    });
  }

  spawnInitialVehicles() {
    // Araç 1: Grove Street CJ Evi Önü (Nissan GT-R R35 Nismo - Ana Oyuncu Aracı)
    const car1 = new Vehicle({
      name: 'Nissan GT-R R35 Nismo',
      type: 'gtr',
      position: new THREE.Vector3(-12.5, 0.06, 23.0),
      heading: 0,
      colorHex: 0xf8f9fa, // Nismo Parlak İnci Beyazı
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    if (this.gtrTemplateScene) {
      car1.attachModel(this.gtrTemplateScene, {
        scale: 0.001,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
    }
    this.scene.add(car1.root);
    this.vehicles.push(car1);

    // Araç 2: Bulvar Girişi (Alfa Romeo Giulia GTA 1965 Klasik Spor)
    const car2 = new Vehicle({
      name: 'Alfa Romeo Giulia GTA (1965)',
      type: 'classic',
      position: new THREE.Vector3(-10.5, 0.06, -15.0),
      heading: 0,
      colorHex: 0x1f5c35, // Grove Yarış Yeşili
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    if (this.giuliaTemplateScene) {
      car2.attachModel(this.giuliaTemplateScene, {
        scale: 1.0,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
    }
    this.scene.add(car2.root);
    this.vehicles.push(car2);

    // Araç 3: Grove Street Sokak Başı (Los Santos Ambulance - Gerçekçi GLB Modeli)
    const amb = new Vehicle({
      name: 'Los Santos Ambulance',
      type: 'ambulance',
      position: new THREE.Vector3(-6.5, 0.06, 8.5),
      heading: 0,
      colorHex: 0xf5f5f5,
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    const ambTpl = this.suvTemplateScene || this.toyotaTemplateScene;
    if (ambTpl) {
      amb.attachModel(ambTpl, {
        scale: 1.0,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
      amb.recolor(0xf5f5f5);
    }
    amb.attachEmergencyVisuals();
    this.scene.add(amb.root);
    this.vehicles.push(amb);

    // Araç 4: Bulvar Park Alanı (Fire Truck Engine 5 - Gerçekçi GLB Modeli)
    const ft = new Vehicle({
      name: 'Fire Truck Engine 5',
      type: 'fire_truck',
      position: new THREE.Vector3(-14.5, 0.06, -6.5),
      heading: Math.PI / 2,
      colorHex: 0xb71c1c,
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    const ftTpl = this.suvTemplateScene || this.toyotaTemplateScene;
    if (ftTpl) {
      ft.attachModel(ftTpl, {
        scale: 1.0,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
      ft.recolor(0xb71c1c);
    }
    ft.attachEmergencyVisuals();
    this.scene.add(ft.root);
    this.vehicles.push(ft);
  }

  spawnAmbulance(pos, heading = 0) {
    const ambPos = pos || new THREE.Vector3(-6.5, 0.06, 8.5);
    const amb = new Vehicle({
      name: 'Los Santos Ambulance',
      type: 'ambulance',
      position: ambPos,
      heading: heading,
      colorHex: 0xf5f5f5,
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    const ambTpl = this.suvTemplateScene || this.toyotaTemplateScene;
    if (ambTpl) {
      amb.attachModel(ambTpl, {
        scale: 1.0,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
      amb.recolor(0xf5f5f5);
    }
    amb.attachEmergencyVisuals();
    this.scene.add(amb.root);
    this.vehicles.push(amb);
    console.log('[VehicleManager] 🚑 Gerçekçi GLB Ambulans başarıyla oluşturuldu:', amb);
    return amb;
  }

  spawnFireTruck(pos, heading = 0) {
    const ftPos = pos || new THREE.Vector3(-14.5, 0.06, -6.5);
    const ft = new Vehicle({
      name: 'Fire Truck Engine 5',
      type: 'fire_truck',
      position: ftPos,
      heading: heading,
      colorHex: 0xb71c1c,
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });
    const ftTpl = this.suvTemplateScene || this.toyotaTemplateScene;
    if (ftTpl) {
      ft.attachModel(ftTpl, {
        scale: 1.0,
        rotationY: Math.PI,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
      ft.recolor(0xb71c1c);
    }
    ft.attachEmergencyVisuals();
    this.scene.add(ft.root);
    this.vehicles.push(ft);
    console.log('[VehicleManager] 🚒 Gerçekçi GLB İtfaiye Aracı başarıyla oluşturuldu:', ft);
    return ft;
  }

  /**
   * Araca Binme
   */
  enterVehicle(vehicle) {
    if (!vehicle || this.activeVehicle) return;

    this.playDoorSound();
    this.activeVehicle = vehicle;
    vehicle.isOccupied = true;
    vehicle.driver = this.characterManager;

    // Yaya karakteri gizle ve kontrollerini durdur
    if (this.characterManager) {
      this.characterManager.setActive(false);
    }

    // Marş sesini çal, ardından motor homurtusunu başlat
    this.playStarterSound();
    setTimeout(() => {
      if (this.activeVehicle === vehicle) {
        this.startEngineAudio();
      }
    }, 420);

    // Kamera açısını aracın arkasına kurgula
    this.camYaw = vehicle.heading;
    this.camPitch = 0.07;
    this.camCurrentPos.copy(this.camera.position);
    this.camCurrentLook.copy(vehicle.position);
    this.cameraSolver?.reset();

    // UI Speedometer aç
    if (this.speedoElement) {
      this.speedoElement.classList.remove('hidden');
    }
    if (this.promptElement) {
      this.promptElement.classList.add('hidden');
    }

    // ADIM 1: Acil Durum Görev Bilgilendirme Banner'ı
    if (vehicle.type === 'ambulance') {
      this.showEmergencyHelpBanner('🚑 PARAMEDIC GÖREVİ', '[2] veya [Caps Lock] Görevi Başlat/Bitir • [H/E] Tepe Sireni');
    } else if (vehicle.type === 'fire_truck') {
      this.showEmergencyHelpBanner('🚒 FIREFIGHTER GÖREVİ', '[2] veya [Caps Lock] Görevi Başlat/Bitir • [H/E] Siren • [Sol Tık/Space] Su Jeti');
    }
  }

  /**
   * ADIM 16: NPC Araç Çalma (Carjacking FSM)
   * Sürücüyü durdurma, kornaya basma, kapıyı açıp şoförü asfalta fırlatma, para düşürme ve aracı sürülebilir kılma
   */
  carjackNpcVehicle(npcVeh) {
    if (!npcVeh || this.activeVehicle) return;

    // 1. NPC Aracını derhal durdur
    npcVeh.speed = 0;
    npcVeh.targetSpeed = 0;

    // 2. Kapı açılma sesi
    this.playDoorSound();

    // 3. Şoför panik kornası
    this.playCarHorn(true);
    setTimeout(() => {
      this.playCarHorn(false);
    }, 650);

    const carPos = npcVeh.position.clone();
    const carHeading = npcVeh.heading;
    const carColor = npcVeh.colorHex || 0x1f382b;

    // 4. Şoför Çığlığı ve Asfalta Çarpma Sesi
    try {
      pedestrianAudio.playScream(carPos);
      setTimeout(() => {
        pedestrianAudio.playHitThud(carPos);
      }, 240);
    } catch (e) {}

    // 5. Yere yeşil para destesi düşürme ($75 - $180)
    const dropOffset = new THREE.Vector3(Math.cos(carHeading) * 1.5, 0.2, -Math.sin(carHeading) * 1.5);
    const dropPos = carPos.clone().add(dropOffset);
    if (window.app?.pickupManager) {
      window.app.pickupManager.spawnMoneyAt(dropPos.x, dropPos.y, dropPos.z, 75 + Math.floor(Math.random() * 105));
    }

    // 6. Yakındaki yayaları panik kaçış moduna sok
    if (window.app?.pedestrianManager) {
      try {
        window.app.pedestrianManager.triggerCrowdPanic(carPos, 22.0);
      } catch (e) {}
    }

    // 7. Suç Bildirimi: VEHICLE_THEFT
    if (window.app?.wantedManager) {
      window.app.wantedManager.reportCrime('VEHICLE_THEFT');
    }

    // 8. Ekranda Retro GTA "CARJACKED!" Pop-up Bildirimi
    this.showCarjackNotification();

    // 9. NPC Aracını trafikten ve sahneden çıkart
    const trafficMgr = this.trafficManager || window.trafficManager;
    if (trafficMgr) {
      trafficMgr.removeNpcVehicle(npcVeh);
    }

    // 10. Yerine Dinamik Sürülebilir Oyuncu Aracı (Vehicle) oluştur (ADIM 3: Model Sadakati)
    const modelScene = npcVeh.templateScene || this.carTemplateScene;
    const modelOpts = npcVeh.modelOptions || {};
    const vehType = npcVeh.vehicleType || 'sedan';
    const vehName = npcVeh.vehicleName || 'Stolen Vehicle';

    const newCar = new Vehicle({
      name: vehName,
      type: vehType,
      position: carPos,
      heading: carHeading,
      colorHex: carColor,
      terrain: this.terrainManager,
      collisionManager: this.collisionManager
    });

    if (modelScene) {
      const attachScale = modelOpts.scale !== undefined ? modelOpts.scale : (modelScene === this.gtrTemplateScene ? 0.001 : 1.0);
      const rotY = modelOpts.rotationY !== undefined ? modelOpts.rotationY : Math.PI;
      newCar.attachModel(modelScene, {
        scale: attachScale,
        rotationY: rotY,
        rotationX: modelOpts.rotationX,
        rotationZ: modelOpts.rotationZ,
        rollSign: -1,
        steerSign: 1,
        createFallbackVisuals: false
      });
      if (typeof newCar.recolor === 'function') {
        newCar.recolor(carColor);
      }
    }

    this.scene.add(newCar.root);
    this.vehicles.push(newCar);

    // 11. Oyuncuyu araca bindir
    this.enterVehicle(newCar);
    console.log(`🚗 [CARJACKING] NPC Araç başarıyla çalındı: ${vehName} (${vehType})! Model korunuyor.`);
  }

  showCarjackNotification() {
    let el = document.getElementById('gta-carjack-notification');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta-carjack-notification';
      el.className = 'gta-carjack-banner';
      el.innerHTML = `
        <div class="gta-carjack-title">CARJACKED!</div>
        <div class="gta-carjack-sub">Araç Çalındı • Sürücü Dışarı Atıldı</div>
      `;
      document.body.appendChild(el);
    }
    el.classList.add('show');
    if (this._carjackTimer) clearTimeout(this._carjackTimer);
    this._carjackTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 2800);
  }

  /**
   * Araçtan İnme
   */
  exitActiveVehicle() {
    if (!this.activeVehicle) return;

    // Hızlı giderken inmeye izin verme (emniyet)
    if (Math.abs(this.activeVehicle.speed) > 5.5) {
      return;
    }

    this.playDoorSound();
    const vehicle = this.activeVehicle;
    this.stopEngineAudio();

    // Karakteri sol kapının hemen yanına indir (bina içindeyse sağ kapıdan indir)
    let exitPos = vehicle.getDriverSeatWorldPos();
    for (const plot of PARCEL_PLOTS) {
      const halfW = (plot.w * 0.68) * 0.5;
      const halfD = (plot.d * 0.68) * 0.5;
      if (Math.abs(exitPos.x - plot.x) < halfW && Math.abs(exitPos.z - plot.z) < halfD) {
        const rightVec = new THREE.Vector3(Math.cos(vehicle.heading), 0, -Math.sin(vehicle.heading));
        exitPos = vehicle.position.clone().addScaledVector(rightVec, 1.8);
        break;
      }
    }

    if (this.characterManager) {
      this.characterManager.position.copy(exitPos);
      this.characterManager.position.y = this.characterManager.groundY;
      this.characterManager.rotation = vehicle.heading;
      this.characterManager.setActive(true);
    }

    vehicle.isOccupied = false;
    vehicle.driver = null;
    vehicle.input.throttle = 0;
    vehicle.input.brake = 0;
    vehicle.input.steer = 0;
    vehicle.input.handbrake = true;
    this.activeVehicle = null;

    // Tuşları sıfırla
    for (const k in this.keys) this.keys[k] = false;

    // Speedometer gizle
    if (this.speedoElement) {
      this.speedoElement.classList.add('hidden');
    }
    this.cameraSolver?.reset();

    // ADIM 1: Acil servis aracından inildiğinde sireni kapat
    if (vehicle.isEmergency && vehicle.sirenActive) {
      vehicle.toggleSiren();
    }
  }

  showEmergencyHelpBanner(title, sub) {
    let el = document.getElementById('gta-emergency-help-banner');
    if (!el) {
      el = document.createElement('div');
      el.id = 'gta-emergency-help-banner';
      el.className = 'gta-emergency-help-box';
      document.body.appendChild(el);
    }
    el.innerHTML = `
      <div class="gta-emerg-help-title">${title}</div>
      <div class="gta-emerg-help-sub">${sub}</div>
    `;
    el.classList.add('show');
    if (this._emergHelpTimer) clearTimeout(this._emergHelpTimer);
    this._emergHelpTimer = setTimeout(() => {
      el.classList.remove('show');
    }, 4500);
  }

  /**
   * Farming Simulator Tarzı Hızlı Araç Geçişi & Işınlanma (Tab / Shift+Tab)
   * - Yaya ise: En yakın araca (veya ilk araca) anında ışınlanıp biner.
   * - Araçta ise: Sahnedeki diğer sürülebilir araçlar arasında sırayla geçiş yapar.
   */
  cycleOrTeleportVehicle(direction = 1) {
    if (!this.vehicles || this.vehicles.length === 0) {
      console.warn('[VehicleManager] Sahnede sürülebilir araç bulunamadı.');
      return;
    }

    // 1. Durum: Zaten bir araç sürülüyorsa -> Diğer araca sırayla geçiş yap
    if (this.activeVehicle) {
      if (this.vehicles.length === 1) return;

      const currentIndex = this.vehicles.indexOf(this.activeVehicle);
      const nextIndex = (currentIndex + direction + this.vehicles.length) % this.vehicles.length;
      const targetVehicle = this.vehicles[nextIndex];

      if (targetVehicle && targetVehicle !== this.activeVehicle) {
        const prevVehicle = this.activeVehicle;
        this.stopEngineAudio();
        prevVehicle.isOccupied = false;
        prevVehicle.driver = null;
        prevVehicle.input.throttle = 0;
        prevVehicle.input.brake = 0;
        prevVehicle.input.steer = 0;
        prevVehicle.input.handbrake = true;
        this.activeVehicle = null;

        this.enterVehicle(targetVehicle);
        console.log(`[VehicleManager] 🚜 Hızlı araç geçişi: ${targetVehicle.name}`);
      }
      return;
    }

    // 2. Durum: Yaya iken basıldı -> En yakın araca ışınlan ve bin
    let targetVehicle = this.nearestVehicle;
    if (!targetVehicle) {
      let minDist = Infinity;
      const charPos = this.characterManager?.position || new THREE.Vector3(0, 0, 0);
      for (const v of this.vehicles) {
        const d = v.position.distanceTo(charPos);
        if (d < minDist) {
          minDist = d;
          targetVehicle = v;
        }
      }
    }

    if (!targetVehicle && this.vehicles.length > 0) {
      targetVehicle = this.vehicles[0];
    }

    if (targetVehicle) {
      this.enterVehicle(targetVehicle);
      console.log(`[VehicleManager] ⚡ Araca ışınlanıldı ve binildi: ${targetVehicle.name}`);
    }
  }

  /**
   * Aracı Düzelt / Takla Atınca Kurtar (R Tuşu)
   */
  resetVehicle(vehicle) {
    if (!vehicle) return;
    vehicle.pitch = 0;
    vehicle.roll = 0;
    vehicle.pitchVel = 0;
    vehicle.rollVel = 0;
    vehicle.speed = 0;
    vehicle.vForward = 0;
    vehicle.vLateral = 0;
    vehicle.velocity.set(0, 0, 0);
    vehicle.yawRate = 0;
    vehicle.verticalVelocity = 0;
    vehicle.isAirborne = false;
    vehicle.chassis.rotation.set(0, 0, 0);
    vehicle.chassis.position.set(0, 0, 0);
    vehicle.snapToGround();
    this.playDoorSound();
  }

  /**
   * Araç Fizik Debug Görünümünü Açar/Kapatır ('J' Tuşu)
   */
  toggleDebug() {
    this.debugMode = !this.debugMode;
    console.log(`[Vehicle] Fizik Debug Modu: ${this.debugMode ? 'AÇIK (4 Tekerlek Probe + Vektörler)' : 'KAPALI'}`);
    for (const veh of this.vehicles) {
      veh.setDebug(this.debugMode, this.scene);
    }
  }

  /**
   * Çarpışma Kontrolü ve Fizik Tepkisi (Araçlar, Binalar ve Dünya Sınırları)
   */
  resolveCollisions() {
    // 1. Araç - Araç Çarpışmaları (Momentum Korunumu & İtme)
    for (let i = 0; i < this.vehicles.length; i++) {
      for (let j = i + 1; j < this.vehicles.length; j++) {
        const vA = this.vehicles[i];
        const vB = this.vehicles[j];
        const dist = vA.position.distanceTo(vB.position);
        const minDist = 3.6;
        if (dist < minDist && dist > 0.01) {
          const overlap = minDist - dist;
          const pushDir = this._tmpPushDir.subVectors(vA.position, vB.position);
          pushDir.y = 0;
          pushDir.normalize();

          vA.position.addScaledVector(pushDir, overlap * 0.5);
          vB.position.addScaledVector(pushDir, -overlap * 0.5);
          vA.root.position.copy(vA.position);
          vB.root.position.copy(vB.position);

          // Hız vektörleri üzerinden momentum değişimi
          const relVelX = vA.velocity.x - vB.velocity.x;
          const relVelZ = vA.velocity.z - vB.velocity.z;
          const impact = relVelX * pushDir.x + relVelZ * pushDir.z;

          if (impact < 0) {
            const impulse = (1.0 + 0.18) * impact * 0.5;
            vA.velocity.x -= impulse * pushDir.x;
            vA.velocity.z -= impulse * pushDir.z;
            vB.velocity.x += impulse * pushDir.x;
            vB.velocity.z += impulse * pushDir.z;
            vA.syncSpeedFromVelocity();
            vB.syncSpeedFromVelocity();

            const crashSpeed = Math.abs(impact);
            if (crashSpeed > 1.2 && (vA === this.activeVehicle || vB === this.activeVehicle)) {
              this.playCrashSound(crashSpeed);
            }
          }
        }
      }
    }

    // 2. Araç - Bina / Parsel Çarpışmaları (Normal Tabanlı Kayma ve Soft-Bounce)
    for (const veh of this.vehicles) {
      veh.hasCollision = false;

      if (this.collisionManager) {
        const forwardX = -Math.sin(veh.heading);
        const forwardZ = -Math.cos(veh.heading);
        const halfL = (veh.handling ? veh.handling.wheelBase : 2.62) * 0.44;
        const rest = veh.handling ? veh.handling.restitution : 0.15;
        const fric = veh.handling ? veh.handling.wallFriction : 0.70;

        // Ön tampon slide kontrolü
        this._tmpFrontPos.set(veh.position.x + forwardX * halfL, veh.position.y, veh.position.z + forwardZ * halfL);
        const frontRes = this.collisionManager.resolveVehicleSlide(
          this._tmpFrontPos,
          veh.velocity,
          0.92,
          rest,
          fric,
          this._nearColliders
        );
        if (frontRes.collided) {
          veh.position.x = this._tmpFrontPos.x - forwardX * halfL;
          veh.position.z = this._tmpFrontPos.z - forwardZ * halfL;
          veh.lastCollisionNormal.set(frontRes.normalX, 0, frontRes.normalZ);
          veh.hasCollision = true;
        }

        // Arka tampon slide kontrolü
        this._tmpBackPos.set(veh.position.x - forwardX * halfL, veh.position.y, veh.position.z - forwardZ * halfL);
        const backRes = this.collisionManager.resolveVehicleSlide(
          this._tmpBackPos,
          veh.velocity,
          0.92,
          rest,
          fric,
          this._nearColliders
        );
        if (backRes.collided) {
          veh.position.x = this._tmpBackPos.x + forwardX * halfL;
          veh.position.z = this._tmpBackPos.z + forwardZ * halfL;
          veh.lastCollisionNormal.set(backRes.normalX, 0, backRes.normalZ);
          veh.hasCollision = true;
        }

        // Gövde merkezi slide kontrolü
        const midRes = this.collisionManager.resolveVehicleSlide(
          veh.position,
          veh.velocity,
          1.05,
          rest,
          fric,
          this._nearColliders
        );
        if (midRes.collided) {
          veh.lastCollisionNormal.set(midRes.normalX, 0, midRes.normalZ);
          veh.hasCollision = true;
        }

        if (frontRes.collided || backRes.collided || midRes.collided) {
          veh.root.position.copy(veh.position);
          veh.syncSpeedFromVelocity();
          const crashSpeed = Math.abs(veh.speed);
          if (crashSpeed > 1.6 && veh === this.activeVehicle) {
            this.playCrashSound(crashSpeed);
          }
        }
      } else {
        // Yedek parsel kontrolü (CollisionManager yoksa)
        for (const plot of PARCEL_PLOTS) {
          const halfW = (plot.w * 0.68) * 0.5;
          const halfD = (plot.d * 0.68) * 0.5;
          const dx = veh.position.x - plot.x;
          const dz = veh.position.z - plot.z;
          const margin = 1.4;

          if (Math.abs(dx) < halfW + margin && Math.abs(dz) < halfD + margin) {
            const overlapX = (halfW + margin) - Math.abs(dx);
            const overlapZ = (halfD + margin) - Math.abs(dz);

            if (overlapX < overlapZ) {
              const signX = Math.sign(dx || 1);
              veh.position.x = plot.x + signX * (halfW + margin);
              if (veh.velocity.x * signX < 0) veh.velocity.x *= -0.15;
            } else {
              const signZ = Math.sign(dz || 1);
              veh.position.z = plot.z + signZ * (halfD + margin);
              if (veh.velocity.z * signZ < 0) veh.velocity.z *= -0.15;
            }
            veh.root.position.copy(veh.position);
            veh.syncSpeedFromVelocity();

            const crashSpeed = Math.abs(veh.speed);
            if (crashSpeed > 1.4 && veh === this.activeVehicle) {
              this.playCrashSound(crashSpeed);
            }
          }
        }
      }

      // 3. Şehir Dış Sınırları Çarpışması (-780 ile +780 m, 1600x1600m arazi)
      const mapLimit = 780;
      let hitBorder = false;
      if (Math.abs(veh.position.x) > mapLimit) {
        veh.position.x = Math.sign(veh.position.x) * mapLimit;
        if (veh.velocity.x * Math.sign(veh.position.x) > 0) {
          veh.velocity.x *= -0.2;
        }
        hitBorder = true;
      }
      if (Math.abs(veh.position.z) > mapLimit) {
        veh.position.z = Math.sign(veh.position.z) * mapLimit;
        if (veh.velocity.z * Math.sign(veh.position.z) > 0) {
          veh.velocity.z *= -0.2;
        }
        hitBorder = true;
      }
      if (hitBorder) {
        veh.root.position.copy(veh.position);
        veh.syncSpeedFromVelocity();
        if (veh === this.activeVehicle) this.playCrashSound(Math.abs(veh.speed));
      }
    }

    // 4. Araç - Araç Çarpışmaları (ADIM 2: OBB & 3-Kapsül Penetrasyon Ayrılması ve Momentum Transferi)
    if (this.collisionManager && typeof this.collisionManager.resolveVehicleVehicleCollisions === 'function') {
      const npcs = this.trafficManager?.npcs || window.trafficManager?.npcs || [];
      const policePool = this.policeManager?.pool || window.policeManager?.pool || [];
      this.collisionManager.resolveVehicleVehicleCollisions(
        this.vehicles,
        this.activeVehicle,
        npcs,
        policePool,
        delta,
        (crashSpeed) => {
          this.playCrashSound(crashSpeed);
        }
      );
    }
  }

  /**
   * Ana Kare Güncellemesi
   */
  update(delta) {
    // 1. Tüm araçların fiziklerini güncelle
    for (const veh of this.vehicles) {
      if (veh === this.activeVehicle) {
        veh.input.throttle = this.keys.forward ? 1.0 : 0;
        veh.input.brake = this.keys.backward ? 1.0 : 0;
        veh.input.steer = (this.keys.left ? 1.0 : 0) - (this.keys.right ? 1.0 : 0);
        veh.input.handbrake = this.keys.handbrake;
      } else {
        veh.input.throttle = 0;
        veh.input.brake = 0;
        veh.input.steer = 0;
        veh.input.handbrake = true;
      }
      veh.update(delta);
    }

    // 2. Çarpışma Tespiti ve Fiziksel Tepki
    this.resolveCollisions();

    // 3. Aktif Araç ve Takip Kamerası
    if (this.activeVehicle) {
      this.updateChaseCamera(delta);
      this.updateEngineAudio(
        this.activeVehicle.engineRPM,
        this.activeVehicle.input.throttle,
        this.activeVehicle.isDrifting
      );
      this.updateSpeedometerUI();

      // Radar için karakter pozisyonunu araca eşitle
      if (this.characterManager) {
        this.characterManager.position.copy(this.activeVehicle.position);
        this.characterManager.rotation = this.activeVehicle.heading;
      }
    } else {
      // Yaya durumunda en yakın aracı tespit et (F tuşu istemi)
      this.checkProximityToVehicles();
    }
  }

  /**
   * GTA 5 / San Andreas Akıcı Araç Takip Kamerası
   */
  updateChaseCamera(delta) {
    const veh = this.activeVehicle;
    if (!veh) return;

    // Geri vites kontrolü: GTA tarzı geri giderken kamera yumuşakça tersine döner
    const isReversingFast = (veh.isReversing && veh.speed < -0.3) || veh.speed < -0.7;
    const baseHeading = isReversingFast ? (veh.heading + Math.PI) : veh.heading;

    // 2 Saniye Kuralı: Son fare hareketinden 2 saniye sonra kamera orijinal arkaya takip açısına toparlanır
    const now = performance.now();
    const timeSinceLook = (now - this.lastMouseLookTime) / 1000.0;
    const isInteracting = this.isMouseDown;

    if (!isInteracting && timeSinceLook >= 2.0) {
      this.isMouseOrbiting = false;
    }

    // Kullanıcı serbestçe bakmayı bıraktığında (2 saniye geçince) kamera yumuşakça toparlanır
    if (!this.isMouseOrbiting) {
      const idealYaw = baseHeading;
      // En kısa açısal fark üzerinden pürüzsüz toparlama
      let diff = idealYaw - this.camYaw;
      while (diff < -Math.PI) diff += Math.PI * 2;
      while (diff > Math.PI) diff -= Math.PI * 2;
      const turnSpeed = isReversingFast ? 3.0 : 2.5;
      this.camYaw += diff * Math.min(delta * turnSpeed, 1.0);

      // Pitch açısını da varsayılan açıya (camDefaultPitch) toparla
      this.camPitch = THREE.MathUtils.lerp(this.camPitch, this.camDefaultPitch, Math.min(delta * 2.2, 1.0));
    }

    // Hıza bağlı dinamik mesafe: Kullanıcının isteği üzerine minimum seviyede tutulur
    const speedRatio = Math.min(Math.abs(veh.speed) / veh.maxForwardSpeed, 1.0);
    const dynamicDist = this.camDistance + speedRatio * 0.28; // Hızlandığında azıcık esneme yeterli
    const dynamicHeight = this.camHeight + speedRatio * 0.08;

    // Hedef Kamera Konumu (Spherical to Cartesian)
    const cosPitch = Math.cos(this.camPitch);
    const sinPitch = Math.sin(this.camPitch);
    const offsetX = Math.sin(this.camYaw) * cosPitch * dynamicDist;
    const offsetZ = Math.cos(this.camYaw) * cosPitch * dynamicDist;
    const offsetY = dynamicHeight + sinPitch * dynamicDist;

    this._tmpTargetCamPos.set(
      veh.position.x + offsetX,
      veh.position.y + offsetY,
      veh.position.z + offsetZ
    );

    // Kamera Doğrudan Aracın Gövde Merkezine Odaklanır (Fareyle çevrildiğinde araba ekranın tam merkezinde kalır)
    this._tmpTargetLook.copy(veh.position);
    this._tmpTargetLook.y += 0.88;

    // --- KAMERA OCCLUSION KONTROLÜ (GTA Stili Spherecast & Pitch Boost) ---
    if (this.cameraSolver) {
      this.cameraSolver.solve(this._tmpTargetLook, this._tmpTargetCamPos, delta, this._tmpTargetCamPos, true);
    }

    // Yumuşak kamera sönümlemesi: Hızlanınca kameranın geride kalıp arabadan kopmasını engelleyen sıkı takip
    // Occlusion anında duvar içine girmemesi için takip hızını anında artır
    const isOccluded = this.cameraSolver && this.cameraSolver.isOccluded();
    const lerpPosSpeed = isOccluded ? 32.0 : (16.0 + speedRatio * 8.0);
    if (!isNaN(this._tmpTargetCamPos.x)) {
      this.camCurrentPos.lerp(this._tmpTargetCamPos, Math.min(delta * lerpPosSpeed, 1.0));
    }
    if (!isNaN(this._tmpTargetLook.x)) {
      this.camCurrentLook.lerp(this._tmpTargetLook, Math.min(delta * 20.0, 1.0));
    }

    if (!isNaN(this.camCurrentPos.x) && !isNaN(this.camCurrentLook.x)) {
      this.camera.position.copy(this.camCurrentPos);
      this.camera.lookAt(this.camCurrentLook);
    }

    // Hıza duyarlı hafif ve tatlı FOV (Maksimum +2.0 derece, araba küçücük kalmaz)
    const targetFov = this.camFovBase + speedRatio * 2.0;
    if (Math.abs(this.camera.fov - targetFov) > 0.05) {
      this.camera.fov = THREE.MathUtils.lerp(this.camera.fov, targetFov, delta * 3.0);
      this.camera.updateProjectionMatrix();
    }
  }

  /**
   * Yayanın araç kapısına yakınlığını kontrol eder (ADIM 16: Statik ve NPC Araç Taraması)
   */
  checkProximityToVehicles() {
    if (!this.characterManager || !this.characterManager.position) return;

    const charPos = this.characterManager.position;
    let closest = null;
    let minDistance = 3.6; // Binme algılama yarıçapı

    for (const veh of this.vehicles) {
      const dist = charPos.distanceTo(veh.position);
      if (dist < minDistance) {
        minDistance = dist;
        closest = veh;
      }
    }

    // ADIM 16: Yoldan geçen Traffic NPC araçlarını da kontrol et
    let closestNpc = null;
    let minNpcDistance = 4.2;
    const trafficMgr = this.trafficManager || window.trafficManager;
    if (trafficMgr && trafficMgr.npcs) {
      for (const npcVeh of trafficMgr.npcs) {
        const dist = charPos.distanceTo(npcVeh.position);
        if (dist < minNpcDistance) {
          minNpcDistance = dist;
          closestNpc = npcVeh;
        }
      }
    }

    if (closest) {
      this.nearestVehicle = closest;
      this.nearestNpcVehicle = null;
    } else if (closestNpc) {
      this.nearestVehicle = null;
      this.nearestNpcVehicle = closestNpc;
    } else {
      this.nearestVehicle = null;
      this.nearestNpcVehicle = null;
    }

    if (this.promptElement) {
      const isVisible = !!(this.nearestVehicle || this.nearestNpcVehicle);
      if (this._lastPromptVisible !== isVisible) {
        this._lastPromptVisible = isVisible;
        if (isVisible) {
          this.promptElement.classList.remove('hidden');
        } else {
          this.promptElement.classList.add('hidden');
        }
      }

      if (this.promptVehicleName) {
        const name = this.nearestVehicle
          ? this.nearestVehicle.name
          : (this.nearestNpcVehicle ? 'Sürücüyü İndir & Çal (Sedan)' : '');
        if (this._lastPromptName !== name) {
          this._lastPromptName = name;
          this.promptVehicleName.textContent = name;
        }
      }
    }
  }

  /**
   * GTA Gösterge Paneli UI Güncellemesi (KM/H, Vites, Devir, İpuçları)
   */
  updateSpeedometerUI() {
    if (!this.activeVehicle) return;

    const kmh = this.activeVehicle.kmh;
    if (this.speedoVal && this._lastKmh !== kmh) {
      this._lastKmh = kmh;
      this.speedoVal.textContent = kmh;
    }

    const gear = this.activeVehicle.currentGear;
    if (this.speedoGear && this._lastGear !== gear) {
      this._lastGear = gear;
      this.speedoGear.textContent = gear;
    }

    const vehName = this.activeVehicle.name.toUpperCase();
    if (this.speedoVehName && this._lastVehName !== vehName) {
      this._lastVehName = vehName;
      this.speedoVehName.textContent = vehName;
    }

    if (this.speedoRpmBar) {
      const rpmRatio = Math.min(this.activeVehicle.engineRPM / 6500, 1.0);
      const rpmPercent = Math.round(rpmRatio * 100);
      if (this._lastRpmWidth !== rpmPercent) {
        this._lastRpmWidth = rpmPercent;
        this.speedoRpmBar.style.width = `${rpmPercent}%`;
      }
    }

    if (this.indDrift) {
      const isDrifting = !!this.activeVehicle.isDrifting;
      if (this._lastDrift !== isDrifting) {
        this._lastDrift = isDrifting;
        if (isDrifting) this.indDrift.classList.add('active');
        else this.indDrift.classList.remove('active');
      }
    }

    if (this.indBrake) {
      const isBraking = !!(this.activeVehicle.isBraking || this.activeVehicle.isHandbrake);
      if (this._lastBrake !== isBraking) {
        this._lastBrake = isBraking;
        if (isBraking) this.indBrake.classList.add('active');
        else this.indBrake.classList.remove('active');
      }
    }
  }
}
