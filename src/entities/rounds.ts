import * as THREE from 'three';
import { makeRound, walkPose, type Rig } from './models';
import type { Level } from '../world/level';
import { angleDiff, clamp, damp } from '../core/util';

/**
 * 회진 (The Rounds). 흰 가운의 얼굴 없는 직원들.
 * - 박자마다 한 걸음씩 끊어 걷는다 (멈췄다, 움직였다).
 * - 눈으로 보지 않는다. 체온과 '이물질'을 느낀다.
 * - 우나의 손을 잡고 있으면 플레이어를 알아보지 못한다.
 */

export const STAFF_NAMES = ['J. KESSLER, PH.D.', 'R. MORROW, M.D.', 'A. NOVAK, R.N.', 'P. OYELARAN, M.D.', 'T. WEBB, M.D.', 'S. LINDQVIST, PH.D.'];

export type RoundState = 'patrol' | 'suspect' | 'chase' | 'stunned' | 'wait' | 'leave' | 'script';

export class Round {
  rig: Rig;
  pos = new THREE.Vector3();
  yaw = 0;
  state: RoundState = 'patrol';
  route: THREE.Vector3[] = [];
  routeIdx = 0;
  private from = new THREE.Vector3();
  private to = new THREE.Vector3();
  private stepT = 1;
  private stepDur = 0.28;
  suspicion = 0;
  lostBeats = 0;
  stunT = 0;
  private path: THREE.Vector3[] = [];
  private walkPhase = 0;
  scriptTarget: THREE.Vector3 | null = null;
  /** 경로 끝에 다다랐다 */
  done = false;
  tilt = 0;
  constructor(
    readonly name: string,
    parent: THREE.Object3D,
  ) {
    this.rig = makeRound(name);
    parent.add(this.rig.root);
  }

  dispose() {
    this.rig.root.removeFromParent();
  }

  /** 박자마다 한 걸음 */
  step(level: Level, playerPos: THREE.Vector3, len: number) {
    if (this.state === 'stunned' || this.state === 'wait') return;
    let goal: THREE.Vector3 | null = null;
    if (this.state === 'chase' || this.state === 'suspect') {
      goal = playerPos;
    } else if (this.state === 'script') {
      goal = this.scriptTarget;
    } else {
      // 순찰: 경로점 순서대로
      const wp = this.route[this.routeIdx];
      if (!wp) {
        this.done = true;
        return;
      }
      if (this.pos.distanceTo(wp) < 0.5) {
        this.routeIdx++;
        if (this.routeIdx >= this.route.length) {
          this.done = true;
          return;
        }
      }
      goal = this.route[this.routeIdx];
    }
    if (!goal) return;
    // 경로 (벽을 돌아간다)
    if (!this.path.length || this.path[this.path.length - 1].distanceTo(goal) > 0.8) {
      this.path = level.findPath(this.pos, goal, { canOpen: true, canVent: false, maxNodes: 4000 }) ?? [goal.clone().setY(0)];
    }
    let next = this.path[0];
    while (next && next.distanceTo(new THREE.Vector3(this.pos.x, 0, this.pos.z)) < 0.25 && this.path.length > 1) {
      this.path.shift();
      next = this.path[0];
    }
    if (!next) return;
    const dir = new THREE.Vector3(next.x - this.pos.x, 0, next.z - this.pos.z);
    const d = dir.length();
    if (d < 0.05) return;
    dir.divideScalar(d);
    this.from.copy(this.pos);
    this.to.copy(this.pos).addScaledVector(dir, Math.min(len, d));
    this.stepT = 0;
    this.yaw = Math.atan2(dir.x, dir.z);
    if (this.state === 'script' && this.scriptTarget && this.pos.distanceTo(this.scriptTarget) < 0.4) this.done = true;
  }

  update(dt: number, level: Level) {
    if (this.stunT > 0) {
      this.stunT -= dt;
      this.tilt = damp(this.tilt, 0.5, 4, dt);
      if (this.stunT <= 0) this.state = 'chase';
    } else this.tilt = damp(this.tilt, 0, 4, dt);
    if (this.stepT < 1) {
      this.stepT = Math.min(1, this.stepT + dt / this.stepDur);
      const e = 1 - Math.pow(1 - this.stepT, 3);
      const nx = this.from.x + (this.to.x - this.from.x) * e;
      const nz = this.from.z + (this.to.z - this.from.z) * e;
      this.pos.set(nx, this.pos.y, nz);
      level.collide(this.pos, 0.3, false, this.pos.y);
      this.walkPhase += dt * 9;
    }
    const moving = this.stepT < 1;
    walkPose(this.rig, this.walkPhase, moving ? 0.6 : 0, { armSwing: 0.1 });
    this.rig.head.rotation.z = this.tilt;
    this.rig.root.position.copy(this.pos);
    this.rig.root.rotation.y += angleDiff(this.rig.root.rotation.y, this.yaw) * (1 - Math.exp(-dt * 12));
  }

  stun(secs: number) {
    this.state = 'stunned';
    this.stunT = secs;
  }
}

export interface Sense {
  pos: THREE.Vector3;
  /** 체온 감지 거리 배율 (숨음, 손잡기 등) */
  heat: number;
}

export class RoundsCrew {
  members: Round[] = [];
  private nameIdx = 0;
  onCatch: (() => void) | null = null;
  onStep: ((r: Round) => void) | null = null;
  onSpot: ((r: Round) => void) | null = null;
  onLose: (() => void) | null = null;
  /** 감지 거리 (난이도) */
  range = 7.5;
  chasing = false;
  constructor(
    private readonly parent: THREE.Object3D,
    private readonly level: Level,
  ) {}

  spawn(route: THREE.Vector3[], count = 3, spacing = 1.3): Round[] {
    const out: Round[] = [];
    for (let i = 0; i < count; i++) {
      const r = new Round(STAFF_NAMES[this.nameIdx++ % STAFF_NAMES.length], this.parent);
      const start = route[0];
      const dir = route[1] ? route[1].clone().sub(route[0]).setY(0).normalize() : new THREE.Vector3(1, 0, 0);
      r.pos.copy(start).addScaledVector(dir, -i * spacing).add(new THREE.Vector3((i % 2) * 0.5 - 0.25, 0, 0));
      r.route = route.map((v) => v.clone());
      r.routeIdx = 1;
      r.yaw = Math.atan2(dir.x, dir.z);
      r.rig.root.rotation.y = r.yaw;
      this.members.push(r);
      out.push(r);
    }
    return out;
  }

  clear() {
    for (const r of this.members) r.dispose();
    this.members = [];
    this.chasing = false;
  }

  /** 박자 */
  onLub(sense: Sense) {
    for (const r of this.members) {
      const len = r.state === 'chase' ? 1.05 : r.state === 'suspect' ? 0.7 : 0.8;
      r.step(this.level, sense.pos, len);
      this.onStep?.(r);
      if (r.state === 'chase' || r.state === 'suspect') {
        r.lostBeats++;
        if (r.lostBeats > 8 && r.state === 'chase') {
          r.state = 'patrol';
          // 가장 가까운 경로점부터 다시
          let best = 0;
          let bd = Infinity;
          r.route.forEach((p, i) => {
            const d = p.distanceTo(r.pos);
            if (d < bd) {
              bd = d;
              best = i;
            }
          });
          r.routeIdx = best;
          r.suspicion = 0;
        }
      }
    }
    // 경로 끝에 다다른 회진은 사라진다
    for (const r of this.members.filter((m) => m.done && m.state === 'patrol')) {
      r.dispose();
      this.members.splice(this.members.indexOf(r), 1);
    }
  }

  update(dt: number, sense: Sense) {
    let anyChase = false;
    for (const r of this.members) {
      r.update(dt, this.level);
      if (r.state === 'stunned' || r.state === 'script' || r.state === 'wait') continue;
      const d = r.pos.distanceTo(sense.pos);
      const range = this.range * sense.heat;
      const sees = d < range && this.level.wallsBetween(r.pos.x, r.pos.z, sense.pos.x, sense.pos.z, true) === 0;
      if (sees) {
        const k = clamp(1.4 - d / range, 0.2, 1.4);
        r.suspicion = Math.min(1.5, r.suspicion + dt * k * 1.6);
        r.lostBeats = 0;
        if (r.suspicion > 0.35 && r.state === 'patrol') r.state = 'suspect';
        if (r.suspicion >= 1 && r.state !== 'chase') {
          r.state = 'chase';
          this.onSpot?.(r);
        }
        // 고개를 돌려 체온 쪽을 '느낀다'
        const yawTo = Math.atan2(sense.pos.x - r.pos.x, sense.pos.z - r.pos.z);
        r.rig.head.rotation.y = damp(r.rig.head.rotation.y, clamp(angleDiff(r.yaw, yawTo), -1.2, 1.2), 3, dt);
      } else {
        r.suspicion = Math.max(0, r.suspicion - dt * 0.4);
        if (r.state === 'suspect' && r.suspicion <= 0) r.state = 'patrol';
        r.rig.head.rotation.y = damp(r.rig.head.rotation.y, 0, 2, dt);
      }
      if (r.state === 'chase') anyChase = true;
      if (d < 0.95 && sense.heat > 0.05 && (r.state === 'chase' || r.state === 'suspect')) this.onCatch?.();
    }
    if (this.chasing && !anyChase) this.onLose?.();
    this.chasing = anyChase;
  }

  nearest(p: THREE.Vector3) {
    let best: Round | null = null;
    let bd = Infinity;
    for (const r of this.members) {
      const d = r.pos.distanceTo(p);
      if (d < bd) {
        bd = d;
        best = r;
      }
    }
    return { round: best, dist: bd };
  }
}
