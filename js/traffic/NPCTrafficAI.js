import * as THREE from 'three';

/**
 * ==============================================================================
 * NPCTrafficAI - Spline-Based Autonomous Traffic AI with Pure Pursuit & FSM
 * ==============================================================================
 * 
 * Mathematical Foundations:
 * -------------------------
 * 1. Pure Pursuit Steering:
 *    Given vehicle rear-axle position P_r, heading vector forward, lookahead point P_g:
 *    Vector d = P_g - P_r
 *    Lookahead distance L_d = ||d|| (adaptive: L_d = clamp(k_look * v, L_min, L_max))
 *    Angle alpha = atan2(d_local.x, d_local.z)  [where forward is +Z or -Z, here local X is lateral]
 *    Curvature kappa = (2 * sin(alpha)) / L_d
 *    Steering angle delta = atan(kappa * L) = atan((2 * L * sin(alpha)) / L_d)
 *    where L is the vehicle wheelbase.
 * 
 * 2. Ackermann Constraint:
 *    delta_clamped = clamp(delta, -delta_max, delta_max)
 *    Outer/Inner wheel divergence:
 *    R = L / tan(delta)
 *    delta_inner = atan(L / (R - W/2))
 *    delta_outer = atan(L / (R + W/2))
 *    where W is track width.
 * 
 * 3. Forward Raycasting & Time-To-Collision (TTC):
 *    Lead distance d_lead = ||P_lead - P_self||
 *    Closing velocity v_rel = v_self - v_lead
 *    TTC = d_lead / max(v_rel, 0.001)
 *    Safe distance d_safe = d_margin + v_self * t_gap + (v_self^2) / (2 * a_comfort)
 * ==============================================================================
 */

export const TrafficState = Object.freeze({
    CRUISING: 'Cruising',
    FOLLOWING: 'Following',
    BRAKING: 'Braking',
    INTERSECTION_HANDLING: 'IntersectionHandling'
});

/**
 * Encapsulates a parametric road lane defined by CatmullRomCurve3.
 */
export class LaneSpline {
    /**
     * @param {THREE.Vector3[]} points - Waypoints along the center of the lane.
     * @param {boolean} [closed=false] - Whether the lane loops.
     * @param {string} [curveType='catmullrom'] - centripetal, chordal, or catmullrom.
     * @param {number} [tension=0.5]
     */
    constructor(points, closed = false, curveType = 'centripetal', tension = 0.5) {
        if (!points || points.length < 2) {
            throw new Error('LaneSpline requires at least 2 points.');
        }
        this.curve = new THREE.CatmullRomCurve3(points, closed, curveType, tension);
        this.totalLength = this.curve.getLength();
        this.speedLimit = 50 / 3.6; // 50 km/h in m/s (~13.88 m/s)
        this.id = THREE.MathUtils.generateUUID();
        this.nextLanes = []; // Outgoing lane connections for intersections
    }

    /**
     * Gets a world position at normalized arc-length distance t/u [0, 1].
     * @param {number} t
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getPoint(t, out = new THREE.Vector3()) {
        return this.curve.getPointAt(THREE.MathUtils.clamp(t, 0, 1), out);
    }

    /**
     * Arc-length parameterized world position at normalized distance u [0, 1].
     * Uses CatmullRomCurve3 arc-length lookup table for constant world-space speed.
     * @param {number} u
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getPointAt(u, out = new THREE.Vector3()) {
        return this.curve.getPointAt(THREE.MathUtils.clamp(u, 0, 1), out);
    }

    /**
     * Gets tangent at normalized arc-length distance t [0, 1].
     * @param {number} t
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getTangent(t, out = new THREE.Vector3()) {
        return this.curve.getTangentAt(THREE.MathUtils.clamp(t, 0, 1), out).normalize();
    }

    /**
     * Arc-length parameterized tangent at normalized distance u [0, 1].
     * @param {number} u
     * @param {THREE.Vector3} [out]
     * @returns {THREE.Vector3}
     */
    getTangentAt(u, out = new THREE.Vector3()) {
        return this.curve.getTangentAt(THREE.MathUtils.clamp(u, 0, 1), out).normalize();
    }

    /**
     * Converts arc distance (meters) to normalized t [0, 1].
     * @param {number} distanceInMeters
     * @returns {number}
     */
    distanceToT(distanceInMeters) {
        return this.totalLength > 0 ? distanceInMeters / this.totalLength : 0;
    }

    /**
     * Finds approximate closest t on curve to a world position using sampled search.
     * @param {THREE.Vector3} position
     * @param {number} [samples=40]
     * @returns {number} Normalized t [0, 1]
     */
    findClosestT(position, samples = 40) {
        let bestT = 0;
        let minSqDist = Infinity;
        const tempVec = new THREE.Vector3();

        for (let i = 0; i <= samples; i++) {
            const t = i / samples;
            this.curve.getPointAt(t, tempVec);
            const d2 = tempVec.distanceToSquared(position);
            if (d2 < minSqDist) {
                minSqDist = d2;
                bestT = t;
            }
        }

        // 1-step local refinement
        const step = 1 / (samples * 2);
        const tPrev = Math.max(0, bestT - step);
        const tNext = Math.min(1, bestT + step);
        this.curve.getPointAt(tPrev, tempVec);
        const dPrev = tempVec.distanceToSquared(position);
        this.curve.getPointAt(tNext, tempVec);
        const dNext = tempVec.distanceToSquared(position);

        if (dPrev < minSqDist) return tPrev;
        if (dNext < minSqDist) return tNext;
        return bestT;
    }
}

// Scratch allocation vectors & quaternions (Zero Garbage Collection during update loop)
const _vForward = new THREE.Vector3();
const _vTargetLocal = new THREE.Vector3();
const _vTargetWorld = new THREE.Vector3();
const _vLookTarget = new THREE.Vector3();
const _vLeadDelta = new THREE.Vector3();
const _vRayOrigin = new THREE.Vector3();
const _vRayDir = new THREE.Vector3();
const _vUp = new THREE.Vector3(0, 1, 0);
const _mInvRotation = new THREE.Matrix4();
const _mCarWorld = new THREE.Matrix4();
const _mLook = new THREE.Matrix4();
const _qTarget = new THREE.Quaternion();
const _raycaster = new THREE.Raycaster();

/**
 * Controller for an individual NPC Vehicle driving autonomously.
 */
export class NPCTrafficAI {
    /**
     * @param {Object} vehicleInstance - Vehicle wrapper or Mesh with position and rotation.
     * @param {LaneSpline} initialLane - Starting lane spline.
     * @param {Object} [config={}] - Vehicle kinematics & AI parameters.
     */
    constructor(vehicleInstance, initialLane, config = {}) {
        this.vehicle = vehicleInstance; // Must have mesh or root Object3D
        this.currentLane = initialLane;
        this.currentT = 0; // Normalized position along currentLane [0, 1]

        // ---------------- Kinematic Configuration ----------------
        this.wheelbase = config.wheelbase || 2.7; // L in meters (front-to-rear axle)
        this.trackWidth = config.trackWidth || 1.6; // W in meters (axle track)
        this.maxSteerAngle = config.maxSteerAngle || 0.61; // ~35 degrees in radians
        this.steerSlewRate = config.steerSlewRate || 3.5; // rad/s max steering rotation speed
        this.angularDamping = config.angularDamping || 8.0; // Slerp damping factor for rotation smoothing
        
        // Acceleration / Deceleration
        this.maxSpeed = config.maxSpeed || (50 / 3.6); // Target cruise speed (m/s)
        this.comfortAccel = config.comfortAccel || 2.2; // m/s^2
        this.comfortDecel = config.comfortDecel || 3.5; // m/s^2
        this.emergencyDecel = config.emergencyDecel || 7.0; // m/s^2

        // Pure Pursuit Lookahead Tuning
        this.lookaheadMin = config.lookaheadMin || 3.5; // meters at 0 speed
        this.lookaheadRatio = config.lookaheadRatio || 0.65; // L_d = max(L_min, ratio * v)
        this.lookaheadMax = config.lookaheadMax || 22.0;

        // Sensor & Safe Distances
        this.stopDistance = config.stopDistance || 3.8; // Standstill buffer (m)
        this.timeGap = config.timeGap || 1.6; // 2-second rule buffer (seconds)
        this.sensorRange = config.sensorRange || 30.0; // Raycast detection range (m)

        // ---------------- Dynamic Runtime State ----------------
        this.speed = config.initialSpeed || 0; // Current scalar speed (m/s)
        this.steeringAngle = 0; // Current front-wheel steering angle (radians)
        this.innerWheelSteer = 0;
        this.outerWheelSteer = 0;
        this.throttle = 0; // [0, 1]
        this.brake = 0; // [0, 1]

        this.state = TrafficState.CRUISING;
        this.leadObstacle = null;
        this.leadDistance = Infinity;

        // Sync initial position if lane is valid
        if (this.currentLane) {
            this.currentT = this.currentLane.findClosestT(this.getVehiclePosition());
            this.alignWithLaneAt(this.currentT);
        }
    }

    /**
     * Obtains world position of the vehicle's rear axle or center.
     * @returns {THREE.Vector3}
     */
    getVehiclePosition() {
        if (this.vehicle.mesh) {
            return this.vehicle.mesh.position;
        }
        if (this.vehicle.position) {
            return this.vehicle.position;
        }
        return new THREE.Vector3();
    }

    /**
     * Obtains normalized forward heading vector of the vehicle in world space.
     * @param {THREE.Vector3} out
     * @returns {THREE.Vector3}
     */
    getForwardVector(out = _vForward) {
        const obj = this.vehicle.mesh || this.vehicle;
        return obj.getWorldDirection(out);
    }

    /**
     * Snaps vehicle orientation and position to lane start/point.
     * @param {number} t
     */
    alignWithLaneAt(t) {
        if (!this.currentLane) return;
        const obj = this.vehicle.mesh || this.vehicle;
        this.currentLane.getPoint(t, obj.position);
        
        const tangent = this.currentLane.getTangent(t, _vForward);
        const lookTarget = obj.position.clone().add(tangent);
        obj.lookAt(lookTarget);
    }

    /**
     * Pure Pursuit Algorithm:
     * Calculates the required front wheel steer angle delta to follow the spline.
     * 
     * Formula:
     *   delta = atan2(2 * L * sin(alpha), L_d)
     * 
     * @param {number} dt
     * @returns {number} target steering angle (radians)
     */
    calculatePurePursuitSteering(dt) {
        const carPos = this.getVehiclePosition();
        const obj = this.vehicle.mesh || this.vehicle;

        // 1. Adaptive lookahead distance: L_d = clamp(lookaheadRatio * speed, min, max)
        const lookaheadDist = THREE.MathUtils.clamp(
            this.lookaheadMin + (this.speed * this.lookaheadRatio),
            this.lookaheadMin,
            this.lookaheadMax
        );

        // 2. Advance target distance along the lane spline
        const lookaheadDeltaT = this.currentLane.distanceToT(lookaheadDist);
        let targetT = this.currentT + lookaheadDeltaT;

        // Lane completion / looping check
        if (targetT > 1.0) {
            if (this.currentLane.curve.closed) {
                targetT = targetT % 1.0;
            } else if (this.currentLane.nextLanes && this.currentLane.nextLanes.length > 0) {
                // Route into the connected next lane
                const nextLane = this.currentLane.nextLanes[0];
                const overflowDistance = (targetT - 1.0) * this.currentLane.totalLength;
                const nextT = nextLane.distanceToT(overflowDistance);
                nextLane.getPoint(nextT, _vTargetWorld);
            } else {
                targetT = 1.0;
                this.currentLane.getPoint(targetT, _vTargetWorld);
            }
        } else {
            this.currentLane.getPoint(targetT, _vTargetWorld);
        }

        // 3. Transform target point into vehicle's local coordinate space
        // Local coordinate system: X = Lateral (Right), Y = Up, Z = Forward (via -Z or +Z convention)
        _vTargetLocal.copy(_vTargetWorld).sub(carPos);
        
        _mCarWorld.extractRotation(obj.matrixWorld);
        _mInvRotation.copy(_mCarWorld).invert();
        _vTargetLocal.applyMatrix4(_mInvRotation);

        // In Three.js, Object3D.getWorldDirection points along +Z.
        // Therefore, local X is lateral offset (left/right) and local Z is forward direction.
        const localX = _vTargetLocal.x;
        const localZ = _vTargetLocal.z;

        // Actual distance to target point
        const actualLookahead = Math.hypot(localX, localZ);
        if (actualLookahead < 0.001) return 0;

        // Heading error angle alpha = atan2(localX, localZ)
        const alpha = Math.atan2(localX, localZ);

        // 4. Pure pursuit steering equation:
        // kappa = (2 * sin(alpha)) / actualLookahead
        // steer = atan(kappa * L)
        const kappa = (2.0 * Math.sin(alpha)) / actualLookahead;
        let desiredSteer = Math.atan(kappa * this.wheelbase);

        // 5. Ackermann Steering Limit Constraint
        desiredSteer = THREE.MathUtils.clamp(desiredSteer, -this.maxSteerAngle, this.maxSteerAngle);

        return desiredSteer;
    }

    /**
     * Ackermann Geometry Decomposition:
     * Calculates the distinct inner and outer wheel turn angles.
     * @param {number} deltaCenter - Center steering angle
     */
    applyAckermannAngles(deltaCenter) {
        if (Math.abs(deltaCenter) < 0.001) {
            this.innerWheelSteer = 0;
            this.outerWheelSteer = 0;
            return;
        }

        const R = this.wheelbase / Math.tan(deltaCenter);
        const halfTrack = this.trackWidth * 0.5;

        if (deltaCenter > 0) { // Turning right
            this.innerWheelSteer = Math.atan(this.wheelbase / (R - halfTrack));
            this.outerWheelSteer = Math.atan(this.wheelbase / (R + halfTrack));
        } else { // Turning left
            this.innerWheelSteer = Math.atan(this.wheelbase / (R + halfTrack));
            this.outerWheelSteer = Math.atan(this.wheelbase / (R - halfTrack));
        }
    }

    /**
     * Obstacle & Lead Vehicle Detection via Forward Raycasting.
     * Emits center and offset rays to cover vehicle bounding width.
     * @param {THREE.Object3D[]} obstaclesList - Array of vehicle meshes or collider objects.
     */
    performForwardRaycast(obstaclesList) {
        this.leadObstacle = null;
        this.leadDistance = Infinity;

        if (!obstaclesList || obstaclesList.length === 0) return;

        const obj = this.vehicle.mesh || this.vehicle;
        const carPos = this.getVehiclePosition();
        this.getForwardVector(_vRayDir);

        // Raycast starting from front bumper (~1.8m ahead of center, elevated 0.5m)
        const frontBumperOffset = this.wheelbase * 0.75;
        _vRayOrigin.copy(carPos).addScaledVector(_vRayDir, frontBumperOffset);
        _vRayOrigin.y += 0.5;

        _raycaster.set(_vRayOrigin, _vRayDir);
        _raycaster.near = 0.1;
        _raycaster.far = this.sensorRange;

        // Filter out own mesh from collision list
        const targets = obstaclesList.filter(o => o !== obj && !obj.getObjectById(o.id));
        const intersections = _raycaster.intersectObjects(targets, true);

        if (intersections.length > 0) {
            const hit = intersections[0];
            this.leadDistance = hit.distance;
            this.leadObstacle = hit.object;
        }
    }

    /**
     * Evaluates and updates the Finite State Machine (FSM).
     * @param {number} dt
     */
    updateStateMachine(dt) {
        // Safe following distance formula: d_safe = d_stop + v * t_gap + v^2 / (2 * a_comfort)
        const dynamicSafeDistance = this.stopDistance + (this.speed * this.timeGap) + 
            (this.speed * this.speed) / (2 * this.comfortDecel);
        const criticalBrakeDistance = this.stopDistance * 1.35;

        // Detect intersection approaching at end of spline
        const distanceToEndOfLane = (1.0 - this.currentT) * this.currentLane.totalLength;
        const isApproachingIntersection = distanceToEndOfLane < (this.speed * 2.5 + 8.0) && 
            this.currentLane.nextLanes && this.currentLane.nextLanes.length > 0;

        // 1. State Transitions
        if (this.leadDistance < criticalBrakeDistance) {
            this.state = TrafficState.BRAKING;
        } else if (this.leadDistance < dynamicSafeDistance) {
            this.state = TrafficState.FOLLOWING;
        } else if (isApproachingIntersection) {
            this.state = TrafficState.INTERSECTION_HANDLING;
        } else {
            this.state = TrafficState.CRUISING;
        }

        // 2. State Actions (Speed and Throttle/Brake control)
        let targetSpeed = this.maxSpeed;

        switch (this.state) {
            case TrafficState.CRUISING:
                targetSpeed = Math.min(this.maxSpeed, this.currentLane.speedLimit);
                this.brake = 0;
                break;

            case TrafficState.FOLLOWING:
                // Smoothly adapt speed to maintain gap
                const gapRatio = (this.leadDistance - this.stopDistance) / (dynamicSafeDistance - this.stopDistance);
                targetSpeed = this.maxSpeed * THREE.MathUtils.clamp(gapRatio, 0.1, 1.0);
                this.brake = gapRatio < 0.3 ? 0.4 : 0;
                break;

            case TrafficState.BRAKING:
                // Emergency stop
                targetSpeed = 0;
                this.throttle = 0;
                this.brake = 1.0;
                this.speed = Math.max(0, this.speed - this.emergencyDecel * dt);
                return;

            case TrafficState.INTERSECTION_HANDLING:
                // Slow down for intersection navigation
                const intersectionSpeed = Math.min(this.maxSpeed, 20 / 3.6); // 20 km/h
                targetSpeed = intersectionSpeed;
                this.brake = this.speed > targetSpeed ? 0.2 : 0;
                break;
        }

        // Longitudinal Speed Controller (PID-like smooth acceleration/deceleration)
        if (this.speed < targetSpeed) {
            this.throttle = THREE.MathUtils.clamp((targetSpeed - this.speed) / targetSpeed, 0.1, 1.0);
            this.brake = 0;
            this.speed += this.comfortAccel * this.throttle * dt;
            if (this.speed > targetSpeed) this.speed = targetSpeed;
        } else if (this.speed > targetSpeed) {
            this.throttle = 0;
            const decelRatio = THREE.MathUtils.clamp((this.speed - targetSpeed) / this.maxSpeed, 0.2, 1.0);
            this.brake = decelRatio;
            this.speed -= this.comfortDecel * decelRatio * dt;
            if (this.speed < targetSpeed) this.speed = targetSpeed;
        }
    }

    /**
     * Main AI Update loop per animation frame.
     * @param {number} dt - Delta time in seconds.
     * @param {THREE.Object3D[]} [trafficObstacles=[]] - Scene objects to avoid.
     */
    update(dt, trafficObstacles = []) {
        if (!this.currentLane || dt <= 0) return;

        // 1. Scan ahead with raycasting
        this.performForwardRaycast(trafficObstacles);

        // 2. Update decision state machine (Longitudinal speed/braking)
        this.updateStateMachine(dt);

        // 3. Compute lateral steering with Pure Pursuit & Ackermann constraint
        const targetSteer = this.calculatePurePursuitSteering(dt);

        // Slew-rate limiting for realistic steering wheel movement
        const maxSteerDelta = this.steerSlewRate * dt;
        const steerDiff = THREE.MathUtils.clamp(targetSteer - this.steeringAngle, -maxSteerDelta, maxSteerDelta);
        this.steeringAngle += steerDiff;

        // Apply Ackermann angles to wheel representations
        this.applyAckermannAngles(this.steeringAngle);

        // 4. Integrate Vehicle Motion Along Spline & World Coordinates
        const distanceCovered = this.speed * dt;
        const deltaT = this.currentLane.distanceToT(distanceCovered);
        this.currentT += deltaT;

        // Spline progress and lane switching at intersections
        if (this.currentT >= 1.0) {
            if (this.currentLane.nextLanes && this.currentLane.nextLanes.length > 0) {
                // Pick next lane (or random lane at split)
                const nextIndex = Math.floor(Math.random() * this.currentLane.nextLanes.length);
                const nextLane = this.currentLane.nextLanes[nextIndex];
                const excessDistance = (this.currentT - 1.0) * this.currentLane.totalLength;
                this.currentLane = nextLane;
                this.currentT = nextLane.distanceToT(excessDistance);
            } else if (this.currentLane.curve.closed) {
                this.currentT = this.currentT % 1.0;
            } else {
                this.currentT = 1.0;
                this.speed = 0;
            }
        }

        // 5. Update vehicle mesh transform in 3D scene (Arc-Length Position)
        const obj = this.vehicle.mesh || this.vehicle;
        this.currentLane.getPointAt(this.currentT, obj.position);

        // Pure Pursuit & Slerp Smooth Rotation:
        // Smoothly interpolate vehicle orientation towards pure pursuit lookahead target
        _vLookTarget.copy(_vTargetWorld).sub(obj.position);
        if (_vLookTarget.lengthSq() > 0.0001) {
            _vLookTarget.y = 0; // Maintain vehicle yaw on ground plane
            if (_vLookTarget.lengthSq() > 0.0001) {
                _mLook.lookAt(obj.position, _vTargetWorld, _vUp);
                _qTarget.setFromRotationMatrix(_mLook);

                // Frame-rate independent exponential quaternion slerp (Zero-Jitter)
                const slerpFactor = 1.0 - Math.exp(-this.angularDamping * dt);
                obj.quaternion.slerp(_qTarget, Math.min(1.0, slerpFactor));
            }
        }

        // Visual front-wheel rotation feedback (Ackermann inner/outer angles)
        if (this.vehicle.wheels && this.vehicle.wheels.frontLeft && this.vehicle.wheels.frontRight) {
            this.vehicle.wheels.frontLeft.rotation.y = this.innerWheelSteer;
            this.vehicle.wheels.frontRight.rotation.y = this.outerWheelSteer;
        }
    }
}
