import * as THREE from 'three';
import { makeHoppy, walkPose } from './models';
import type { Level } from '../world/level';
import { angleDiff, damp } from '../core/util';

/**
 * 호피 스와피 인형탈 (속에는 대상 53).
 * 박자마다 한 걸음 (발디 오마주). 박자가 빨라지면 빨라진다.
 * 통풍구에도 인형탈째 납작하게 접혀 들어온다.
 */
export type HoppyState = 'hidden' | 'seated' | 'rise' | 'chase' | 'stunned' | 'stuck' | 'script' | 'pose';

export class Hoppy {
  rig = makeHoppy();
  pos = new THREE.Vector3();
  yaw = 0;
  state: HoppyState = 'hidden';
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private stepT = 1;
  private path: THREE.Vector3[] = [];
  private repath = 0;
  private phase = 0;
  stunT = 0;
  fold = 0;
  private riseT = 0;
  onStep: ((p: THREE.Vector3) => void) | null = null;
  onCatch: (() => void) | null = null;
  scriptTarget: THREE.Vector3 | null = null;
  private jerk = 0;

  constructor(parent: THREE.Object3D) {
    parent.add(this.rig.root);
    this.rig.root.visible = false;
  }

  place(p: THREE.Vector3, yaw: number, state: HoppyState) {
    this.pos.copy(p);
    this.yaw = yaw;
    this.state = state;
    this.rig.root.visible = state !== 'hidden';
    this.path = [];
    this.stepT = 1;
  }

  /** 앉아 있는 (축 늘어진) 자세 */
  private slump() {
    const r = this.rig;
    r.body.position.y = -0.38;
    r.hips.rotation.x = -0.15;
    r.chest.rotation.x = 0.35;
    r.head.rotation.set(0.6, 0.25, 0.35);
    r.legL.rotation.x = -1.4;
    r.legR.rotation.x = -1.3;
    r.shinL.rotation.x = 1.5;
    r.shinR.rotation.x = 1.4;
    r.armL.rotation.x = 0.6;
    r.armR.rotation.x = 0.4;
  }

  onBeat(level: Level, target: THREE.Vector3) {
    if (this.state !== 'chase' && this.state !== 'script') return;
    const goal = this.state === 'script' ? this.scriptTarget : target;
    if (!goal) return;
    this.repath--;
    if (this.repath <= 0 || !this.path.length) {
      this.repath = 2;
      this.path = level.findPath(this.pos, goal, { canOpen: true, canVent: true, maxNodes: 5000 }) ?? [goal.clone().setY(0)];
    }
    let next = this.path[0];
    while (next && Math.hypot(next.x - this.pos.x, next.z - this.pos.z) < 0.3 && this.path.length > 1) {
      this.path.shift();
      next = this.path[0];
    }
    if (!next) return;
    const dir = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
    const d = dir.length();
    if (d < 0.05) return;
    dir.divideScalar(d);
    const inVent = !!level.roomAt(this.pos.x, this.pos.z)?.low;
    const len = inVent ? 0.75 : 1.0;
    this.from.copy(this.pos);
    this.to.copy(this.pos).addScaledVector(dir, Math.min(len, d));
    this.stepT = 0;
    this.yaw = Math.atan2(dir.x, dir.z);
    this.jerk = 1;
    this.onStep?.(this.pos);
  }

  update(dt: number, level: Level, playerPos: THREE.Vector3, t: number) {
    const r = this.rig;
    if (this.state === 'hidden') {
      r.root.visible = false;
      return;
    }
    r.root.visible = true;
    if (this.state === 'seated') {
      this.slump();
      // 아주 가끔, 바람이 없는데 고개가 조금 움직인다
      r.head.rotation.y = 0.25 + Math.sin(t * 0.3) * 0.03;
    } else if (this.state === 'rise') {
      this.riseT = Math.min(1, this.riseT + dt / 2.4);
      const k = this.riseT;
      // 관절이 아닌 곳부터 꺾이며 일어선다
      r.body.position.y = -0.38 * (1 - k);
      r.chest.rotation.x = 0.35 * (1 - k) + Math.sin(k * 9) * 0.15 * (1 - k);
      r.head.rotation.set(0.6 * (1 - k) - Math.sin(k * 6) * 0.3 * (1 - k), 0.25 * (1 - k), 0.35 * (1 - k) + Math.sin(k * 11) * 0.2);
      r.legL.rotation.x = -1.4 * (1 - k);
      r.legR.rotation.x = -1.3 * (1 - k);
      r.shinL.rotation.x = 1.5 * (1 - k);
      r.shinR.rotation.x = 1.4 * (1 - k);
    } else if (this.state === 'stuck') {
      // 투입구에 걸려 버둥거린다 (스크립트가 자세를 정한다)
    } else if (this.state !== 'pose') {
      if (this.stunT > 0) {
        this.stunT -= dt;
        if (this.stunT <= 0) this.state = 'chase';
      }
      if (this.stepT < 1) {
        this.stepT = Math.min(1, this.stepT + dt / 0.22);
        const e = 1 - Math.pow(1 - this.stepT, 3);
        this.pos.set(this.from.x + (this.to.x - this.from.x) * e, this.pos.y, this.from.z + (this.to.z - this.from.z) * e);
        level.collide(this.pos, 0.35, true, this.pos.y);
        this.phase += dt * 10;
      }
      const moving = this.stepT < 1;
      walkPose(r, this.phase, moving ? 0.9 : 0.05, { armSwing: 0.6 });
      this.jerk = damp(this.jerk, 0, 8, dt);
      r.chest.rotation.x = 0.1 + this.jerk * 0.25;
      r.chest.rotation.z = Math.sin(this.phase * 0.5) * 0.12;
      r.head.rotation.z = Math.sin(t * 7) * 0.05 * (this.state === 'stunned' ? 4 : 1);
      // 머리 위의 팔이 박자마다 휘청인다
      r.armL.rotation.x = Math.sin(this.phase) * 0.5;
      r.armR.rotation.x = -Math.sin(this.phase) * 0.5;
      const room = level.roomAt(this.pos.x, this.pos.z);
      const inVent = !!room?.low;
      this.fold = damp(this.fold, inVent ? 1 : 0, 6, dt);
      if (room) this.pos.y = damp(this.pos.y, room.y, 12, dt);
      if (this.state === 'chase' && this.pos.distanceTo(playerPos) < 1.05) this.onCatch?.();
    }
    // 납작하게 접힌다
    r.root.scale.set(1 + this.fold * 0.25, 1 - this.fold * 0.62, 1 + this.fold * 0.1);
    r.root.position.copy(this.pos);
    r.root.rotation.y += angleDiff(r.root.rotation.y, this.yaw) * (1 - Math.exp(-dt * 10));
  }

  stun(secs: number) {
    if (this.state !== 'chase') return;
    this.state = 'stunned';
    this.stunT = secs;
  }
}
