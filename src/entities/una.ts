import * as THREE from 'three';
import { makeUna, setUnaFace, walkPose, type Rig } from './models';
import type { Level } from '../world/level';
import type { Player } from './player';
import { angleDiff, clamp, damp } from '../core/util';

/**
 * 우나. 플레이어를 따라오고, 손을 잡으면 옆에 붙는다.
 * 숨 쉬는 움직임이 없다. 눈을 깜빡이지 않는다. 발소리는 맨발.
 */
export type UnaMode = 'off' | 'follow' | 'hold' | 'script' | 'idle';

export class Una {
  rig: Rig;
  pos = new THREE.Vector3();
  yaw = 0;
  mode: UnaMode = 'off';
  speed = 0;
  private path: THREE.Vector3[] = [];
  private pathTimer = 0;
  private walkPhase = 0;
  private stepAcc = 0;
  private target: THREE.Vector3 | null = null;
  private arrive: (() => void) | null = null;
  lookAt: THREE.Vector3 | null = null;
  run = false;
  private headYaw = 0;
  private headPitch = 0;
  onStep: ((p: THREE.Vector3) => void) | null = null;
  /** 손 내밀기 (0..1) */
  reach = 0;
  sit = false;
  crouch = 0;
  area = 'ward';
  /** 스크립트가 몸 전체 자세를 직접 정할 때 (침대 밑에 눕기) */
  poseLock = false;

  constructor(parent: THREE.Object3D) {
    this.rig = makeUna();
    this.rig.root.visible = false;
    parent.add(this.rig.root);
  }

  get head() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.36 - this.crouch * 0.8 - (this.sit ? 0.3 : 0), this.pos.z);
  }

  get chest() {
    return new THREE.Vector3(this.pos.x, this.pos.y + 1.1 - this.crouch * 0.6, this.pos.z);
  }

  face(expr: Parameters<typeof setUnaFace>[1]) {
    setUnaFace(this.rig, expr);
  }

  show(on: boolean) {
    this.rig.root.visible = on;
    if (!on) this.mode = 'off';
  }

  place(p: THREE.Vector3, yaw = this.yaw) {
    this.pos.copy(p);
    this.yaw = yaw;
    this.path = [];
    this.rig.root.visible = true;
  }

  /** 정해진 곳으로 걸어간다 (도착하면 resolve) */
  goTo(p: THREE.Vector3, run = false): Promise<void> {
    this.mode = 'script';
    this.target = p.clone();
    this.run = run;
    this.path = [];
    this.pathTimer = 0;
    return new Promise((r) => (this.arrive = r));
  }

  follow() {
    this.mode = 'follow';
    this.target = null;
    this.arrive = null;
  }

  /**
   * 옆으로 눕는다: 머리는 headDir 쪽, 얼굴(앞)은 faceDir 쪽. hips = 엉덩이 위치
   */
  lieDown(hips: THREE.Vector3, headDir: THREE.Vector3, faceDir: THREE.Vector3) {
    this.poseLock = true;
    this.rig.root.visible = true;
    const Y = headDir.clone().normalize();
    const Z = faceDir.clone().normalize();
    const X = new THREE.Vector3().crossVectors(Y, Z).normalize();
    Z.crossVectors(X, Y).normalize();
    const m = new THREE.Matrix4().makeBasis(X, Y, Z);
    this.rig.root.quaternion.setFromRotationMatrix(m);
    this.rig.root.position.copy(hips).addScaledVector(Y, -0.72);
    this.rig.body.position.set(0, 0, 0);
    // 무릎을 살짝 굽히고, 팔은 몸 앞으로
    this.rig.legL.rotation.set(-0.5, 0, 0);
    this.rig.legR.rotation.set(-0.3, 0, 0);
    this.rig.shinL.rotation.set(0.7, 0, 0);
    this.rig.shinR.rotation.set(0.5, 0, 0);
    this.rig.armL.rotation.set(-1.3, 0, 0);
    this.rig.armR.rotation.set(-1.1, 0, 0.2);
    this.rig.head.rotation.set(0, 0, 0);
  }

  standUp() {
    this.poseLock = false;
    this.rig.root.rotation.set(0, this.yaw, 0);
    this.rig.root.quaternion.setFromEuler(this.rig.root.rotation);
  }

  update(dt: number, player: Player, level: Level, t: number) {
    if (!this.rig.root.visible || this.poseLock) return;
    let moving = false;
    if (this.mode === 'hold') {
      // 플레이어 왼쪽에 붙어 걷는다
      const want = player.pos.clone().addScaledVector(player.right, -0.62).addScaledVector(player.forward, 0.05);
      const d = want.distanceTo(this.pos);
      this.pos.lerp(want, 1 - Math.exp(-dt * 10));
      this.yaw = player.yaw + Math.PI;
      moving = player.moved / Math.max(dt, 1e-4) > 0.3 || d > 0.05;
      this.speed = player.moved / Math.max(dt, 1e-4);
      this.lookAt = null;
    } else if (this.mode === 'follow' || this.mode === 'script') {
      let goal: THREE.Vector3 | null = null;
      if (this.mode === 'follow') {
        const behind = player.pos.clone().addScaledVector(player.forward, -1.1).addScaledVector(player.right, -0.5);
        const d = this.pos.distanceTo(player.pos);
        if (d > 2.0) goal = behind;
        if (d > 18) {
          // 너무 멀어지면 (보이지 않는 곳에서) 따라잡는다
          this.pos.copy(behind);
          this.path = [];
        }
      } else goal = this.target;
      if (goal) {
        this.pathTimer -= dt;
        if (this.pathTimer <= 0 || !this.path.length) {
          this.pathTimer = 0.6;
          this.path = level.findPath(this.pos, goal, { canOpen: true, canVent: true }) ?? [goal.clone()];
        }
        const next = this.path[0];
        if (next) {
          const to = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
          const dist = to.length();
          const spd = this.run ? 3.6 : this.mode === 'follow' && this.pos.distanceTo(player.pos) > 4 ? 2.9 : 1.75;
          if (dist < 0.15) this.path.shift();
          else {
            to.divideScalar(dist);
            const stepLen = Math.min(dist, spd * dt);
            this.pos.addScaledVector(to, stepLen);
            const targetYaw = Math.atan2(to.x, to.z);
            this.yaw += angleDiff(this.yaw, targetYaw) * (1 - Math.exp(-dt * 10));
            moving = true;
            this.speed = spd;
          }
        }
        level.collide(this.pos, 0.2, true, this.pos.y);
        if (this.mode === 'script' && this.target && this.pos.distanceTo(this.target) < 0.35) {
          this.mode = 'idle';
          const r = this.arrive;
          this.arrive = null;
          r?.();
        }
      } else {
        // 멈춰서 플레이어를 바라본다
        const toP = Math.atan2(player.pos.x - this.pos.x, player.pos.z - this.pos.z);
        this.yaw += angleDiff(this.yaw, toP) * (1 - Math.exp(-dt * 3));
      }
      const r = level.roomAt(this.pos.x, this.pos.z);
      if (r) this.pos.y = damp(this.pos.y, r.y, 20, dt);
    }
    if (!moving) this.speed = damp(this.speed, 0, 8, dt);

    // 걷기 애니메이션과 맨발 소리
    if (moving) {
      const stride = this.run ? 0.7 : 0.48;
      const adv = this.speed * dt;
      this.walkPhase += (adv / stride) * Math.PI;
      this.stepAcc += adv;
      if (this.stepAcc > stride) {
        this.stepAcc -= stride;
        this.onStep?.(this.pos);
      }
    }
    const amt = clamp(this.speed / 1.8, 0, 1.2);
    walkPose(this.rig, this.walkPhase, amt, { armSwing: 0.35 });
    // 손잡기: 오른팔을 플레이어 쪽으로
    const reachT = this.mode === 'hold' ? 1 : this.reach;
    this.rig.armR.rotation.x = damp(this.rig.armR.rotation.x, -0.25 * reachT + (this.mode === 'hold' ? 0 : this.rig.armR.rotation.x * 0), 8, dt);
    this.rig.armR.rotation.z = damp(this.rig.armR.rotation.z, 0.08 + 0.55 * reachT, 8, dt);
    // 웅크리기 (침대 밑)
    this.rig.body.position.y += -this.crouch * 0.75;
    this.rig.hips.rotation.x = this.crouch * 1.2;
    // 머리: 바라볼 대상 (없으면 플레이어)
    const look = this.lookAt ?? player.eye;
    const dx = look.x - this.pos.x;
    const dz = look.z - this.pos.z;
    const yawTo = Math.atan2(dx, dz);
    const hy = clamp(angleDiff(this.yaw, yawTo), -1.0, 1.0);
    const hp = clamp(Math.atan2(look.y - this.head.y, Math.hypot(dx, dz)), -0.5, 0.5);
    this.headYaw = damp(this.headYaw, hy, 5, dt);
    this.headPitch = damp(this.headPitch, -hp, 5, dt);
    this.rig.head.rotation.set(this.headPitch, this.headYaw, 0);
    // 앉기
    if (this.sit) {
      this.rig.legL.rotation.x = -1.45;
      this.rig.legR.rotation.x = -1.45;
      this.rig.shinL.rotation.x = 1.45;
      this.rig.shinR.rotation.x = 1.45;
      this.rig.body.position.y = -0.3;
    }
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y = this.yaw;
    void t;
  }
}
