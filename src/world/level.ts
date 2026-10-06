import * as THREE from 'three';
import { Batch, type V3 } from './batch';
import { mat } from './materials';
import { clamp, smoothstep } from '../core/util';
import type { FloorMat } from '../audio/sfx';

/**
 * 방 단위 레벨 빌더.
 * 방은 0.5m 격자 위의 직사각형이다. 서로 다른 방(또는 바깥)과 맞닿은 경계에 벽이 생긴다.
 * 경계 위의 '개구부'(문, 아치, 창, 엘리베이터, 통풍구)만 벽이 비워진다.
 * 벽 두께 0.16m(방마다 안쪽으로 0.08m), 바깥벽은 0.3m.
 */

export const CELL = 0.5;
const T = 0.08;
const T_EXT = 0.3;
const EPS = 1e-4;

export interface RoomDef {
  id: string;
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  y?: number;
  h?: number;
  floor?: string;
  ceil?: string | null;
  wall?: string;
  wain?: string | null;
  wainH?: number;
  reverb?: string;
  step?: FloorMat;
  area?: string;
  group?: string;
  name?: string;
  /** 바깥 피부 (외벽 재질) */
  skin?: string;
  skinH?: number;
  /** 조명 상태 */
  light?: 'on' | 'dim' | 'off' | 'flicker' | 'dead' | 'none';
  /** 형광등 위치 (생략하면 자동 배치) */
  fixtures?: [number, number][];
  heart?: number;
  fogColor?: number;
  fogDensity?: number;
  /** 바깥 공간(벽·천장 없음) */
  outdoor?: boolean;
  /** 낮은 공간 (통풍구): 웅크려야 한다 */
  low?: boolean;
}

export class Room implements RoomDef {
  id!: string;
  x0!: number;
  z0!: number;
  x1!: number;
  z1!: number;
  y = 0;
  h = 3;
  floor = 'lino';
  ceil: string | null = 'ceiling';
  wall = 'paint_cream';
  wain: string | null = null;
  wainH = 1.1;
  reverb = 'ward';
  step: FloorMat = 'lino';
  area = 'main';
  group = 'base';
  name?: string;
  skin?: string;
  skinH?: number;
  light: RoomDef['light'] = 'on';
  fixtures?: [number, number][];
  heart = 1;
  fogColor?: number;
  fogDensity?: number;
  outdoor = false;
  low = false;
  /** 이 방의 벽 단위 변 (앰비언트 오클루전용) */
  wallEdges: [number, number, number, number][] = [];
  constructor(d: RoomDef) {
    Object.assign(this, d);
  }
  contains(x: number, z: number, pad = 0) {
    return x >= this.x0 - pad && x <= this.x1 + pad && z >= this.z0 - pad && z <= this.z1 + pad;
  }
  get cx() {
    return (this.x0 + this.x1) / 2;
  }
  get cz() {
    return (this.z0 + this.z1) / 2;
  }
}

export type OpeningKind = 'door' | 'double' | 'arch' | 'none' | 'window' | 'elevator' | 'vent' | 'hatch';

export interface OpeningDef {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  kind: OpeningKind;
  /** 위쪽 높이 (문 2.1, 창 2.2) */
  top?: number;
  /** 창턱 높이 */
  sill?: number;
  mat?: string;
  id?: string;
  locked?: boolean;
  open?: boolean;
  /** 경첩이 시작점(x0,z0) 쪽인가 */
  hingeStart?: boolean;
  /** 문이 열리는 쪽 (+1 = 법선의 양의 방향) */
  swing?: 1 | -1;
  group?: string;
  area?: string;
  /** 문틀 표시 */
  frame?: boolean;
}

export interface Seg {
  x0: number;
  z0: number;
  x1: number;
  z1: number;
  group: string;
  /** 서 있을 때만 막는다 (통풍구 입구) */
  low?: boolean;
  door?: Door;
  /** 창: 소리는 조금 통과 */
  glass?: boolean;
}

export interface BoxCol {
  minX: number;
  minZ: number;
  maxX: number;
  maxZ: number;
  top: number;
  group: string;
  id?: string;
}

// ───────────────────────────── 문 ─────────────────────────────

export class Door {
  angle = 0;
  target = 0;
  pivot = new THREE.Group();
  /** 두 번째 문짝 (양여닫이) */
  pivot2: THREE.Object3D | null = null;
  seg: Seg;
  open = false;
  locked: boolean;
  readonly id: string;
  /** 첫 문짝이 경첩에서 뻗는 방향 (+1/-1) */
  dir = 1;
  slideL?: THREE.Object3D;
  slideR?: THREE.Object3D;
  slide = 0;
  constructor(
    readonly def: OpeningDef,
    readonly width: number,
    readonly height: number,
    readonly vertical: boolean,
  ) {
    this.locked = !!def.locked;
    this.id = def.id ?? `door_${def.x0}_${def.z0}`;
    this.seg = { x0: def.x0, z0: def.z0, x1: def.x1, z1: def.z1, group: def.group ?? 'base', door: this };
  }
  get center() {
    return new THREE.Vector3((this.def.x0 + this.def.x1) / 2, 0, (this.def.z0 + this.def.z1) / 2);
  }
  /** 사람이 지나갈 수 있을 만큼 열렸는가 */
  get passable() {
    return this.def.kind === 'elevator' ? this.slide > 0.8 : Math.abs(this.angle) > 1.0;
  }
  /**
   * swing: +1 = 좌표가 큰 쪽(z+ 또는 x+)으로 열린다.
   * 회전 부호: 가로 문(x를 따라)은 -swing·dir, 세로 문(z를 따라)은 +swing·dir.
   */
  setOpen(o: boolean) {
    this.open = o;
    const sw = this.def.swing ?? 1;
    const sign = this.vertical ? sw * this.dir : -sw * this.dir;
    this.target = o ? 1.75 * sign : 0;
  }
  update(dt: number) {
    if (this.def.kind === 'elevator') {
      const t = this.open ? 1 : 0;
      this.slide += clamp(t - this.slide, -dt * 0.9, dt * 0.9);
      const off = this.slide * (this.width / 2 - 0.05);
      if (this.slideL && this.slideR) {
        this.slideL.position.set(-off, 0, 0);
        this.slideR.position.set(off, 0, 0);
      }
      return;
    }
    const k = 1 - Math.exp(-dt * (this.open ? 3.2 : 5));
    this.angle += (this.target - this.angle) * k;
    this.pivot.rotation.y = this.angle;
    if (this.pivot2) this.pivot2.rotation.y = -this.angle;
  }
}

// ───────────────────────────── 형광등 ─────────────────────────────

export interface Fixture {
  pos: THREE.Vector3;
  room: Room;
  state: 'on' | 'dim' | 'off' | 'flicker' | 'dead';
  panel: THREE.Mesh;
  level: number;
  /** 깜빡임 위상 */
  seed: number;
  color: THREE.Color;
}

// ───────────────────────────── 레벨 ─────────────────────────────

export class Level {
  rooms: Room[] = [];
  openings: OpeningDef[] = [];
  segs: Seg[] = [];
  boxes: BoxCol[] = [];
  doors: Door[] = [];
  fixtures: Fixture[] = [];
  root = new THREE.Group();
  areas = new Map<string, THREE.Group>();
  groups = new Map<string, THREE.Group>();
  activeGroups = new Set<string>(['base']);
  private cellMap = new Map<string, Room[]>();
  private batches = new Map<string, Batch>();

  addRoom(d: RoomDef) {
    const r = new Room(d);
    if (r.outdoor) {
      r.ceil = null;
    }
    this.rooms.push(r);
    return r;
  }

  addOpening(d: OpeningDef) {
    this.openings.push(d);
    return d;
  }

  /** 그룹(변형 지오메트리)별·구역별 배치 */
  batch(area: string, group = 'base') {
    const key = area + '|' + group;
    let b = this.batches.get(key);
    if (!b) this.batches.set(key, (b = new Batch()));
    return b;
  }

  areaGroup(area: string) {
    let g = this.areas.get(area);
    if (!g) {
      g = new THREE.Group();
      g.name = 'area_' + area;
      this.areas.set(area, g);
      this.root.add(g);
    }
    return g;
  }

  /** 변형 그룹의 오브젝트 (예: 바뀌는 복도) */
  variantGroup(area: string, group: string) {
    if (group === 'base') return this.areaGroup(area);
    const key = area + '|' + group;
    let g = this.groups.get(key);
    if (!g) {
      g = new THREE.Group();
      g.name = 'group_' + group;
      g.visible = this.activeGroups.has(group);
      this.groups.set(key, g);
      this.areaGroup(area).add(g);
    }
    return g;
  }

  setGroup(group: string, on: boolean) {
    if (on) this.activeGroups.add(group);
    else this.activeGroups.delete(group);
    for (const [k, g] of this.groups) if (k.endsWith('|' + group)) g.visible = on;
  }

  private key(ix: number, iz: number) {
    return ix + ',' + iz;
  }

  private cellRooms(x: number, z: number): Room[] {
    return this.cellMap.get(this.key(Math.floor(x / CELL + EPS), Math.floor(z / CELL + EPS))) ?? [];
  }

  /** 같은 그룹 맥락에서 이웃 방 */
  private neighbor(x: number, z: number, group: string, area: string): Room | null {
    const rs = this.cellRooms(x, z).filter((r) => r.area === area);
    return rs.find((r) => r.group === group) ?? rs.find((r) => r.group === 'base') ?? null;
  }

  /** 경계 위의 개구부. 기본 그룹의 개구부와 같은 변형 그룹의 개구부만 적용된다 */
  private openingAt(vertical: boolean, line: number, a: number, b: number, group: string): OpeningDef | null {
    for (const o of this.openings) {
      const og = o.group ?? 'base';
      if (og !== 'base' && og !== group) continue;
      if (vertical) {
        if (Math.abs(o.x0 - line) > EPS || Math.abs(o.x1 - line) > EPS) continue;
        const lo = Math.min(o.z0, o.z1);
        const hi = Math.max(o.z0, o.z1);
        if (lo <= a + EPS && hi >= b - EPS) return o;
      } else {
        if (Math.abs(o.z0 - line) > EPS || Math.abs(o.z1 - line) > EPS) continue;
        const lo = Math.min(o.x0, o.x1);
        const hi = Math.max(o.x0, o.x1);
        if (lo <= a + EPS && hi >= b - EPS) return o;
      }
    }
    return null;
  }

  roomAt(x: number, z: number): Room | null {
    const rs = this.cellRooms(x, z);
    if (!rs.length) return null;
    return rs.find((r) => r.group !== 'base' && this.activeGroups.has(r.group)) ?? rs.find((r) => r.group === 'base') ?? null;
  }

  // ───────────────────────────── 생성 ─────────────────────────────

  build() {
    // 칸 지도
    for (const r of this.rooms) {
      for (let ix = Math.round(r.x0 / CELL); ix < Math.round(r.x1 / CELL); ix++)
        for (let iz = Math.round(r.z0 / CELL); iz < Math.round(r.z1 / CELL); iz++) {
          const k = this.key(ix, iz);
          let list = this.cellMap.get(k);
          if (!list) this.cellMap.set(k, (list = []));
          list.push(r);
        }
    }
    const wallEdgeSet = new Set<string>();
    for (const r of this.rooms) this.buildRoom(r, wallEdgeSet);
    for (const o of this.openings) this.buildOpening(o);
    for (const r of this.rooms) this.buildFlats(r);
    // 배치 → 메시
    for (const [key, b] of this.batches) {
      const [area, group] = key.split('|');
      const g = b.build(key);
      this.variantGroup(area, group).add(g);
    }
  }

  /**
   * 방의 네 변을 따라 벽면을 만든다.
   * 기본 방의 이웃 칸에 변형 방(예: 바뀌는 복도의 두 모습)이 있으면, 그 변의 벽은 변형마다 따로 만든다.
   */
  private buildRoom(r: Room, wallEdgeSet: Set<string>) {
    if (r.outdoor) return;
    const sides: { vertical: boolean; line: number; a0: number; a1: number; inward: number; nb: (p: number) => [number, number] }[] = [
      { vertical: false, line: r.z0, a0: r.x0, a1: r.x1, inward: 1, nb: (p) => [p + CELL / 2, r.z0 - CELL / 2] },
      { vertical: false, line: r.z1, a0: r.x0, a1: r.x1, inward: -1, nb: (p) => [p + CELL / 2, r.z1 + CELL / 2] },
      { vertical: true, line: r.x0, a0: r.z0, a1: r.z1, inward: 1, nb: (p) => [r.x0 - CELL / 2, p + CELL / 2] },
      { vertical: true, line: r.x1, a0: r.z0, a1: r.z1, inward: -1, nb: (p) => [r.x1 + CELL / 2, p + CELL / 2] },
    ];
    for (const s of sides) {
      const n = Math.round((s.a1 - s.a0) / CELL);
      // 단위 변마다: 맥락(그룹) → 이웃 방
      const ctxAt: Map<string, Room | null>[] = [];
      const allCtx = new Set<string>();
      for (let i = 0; i < n; i++) {
        const p = s.a0 + i * CELL;
        const [nx, nz] = s.nb(p);
        const m = new Map<string, Room | null>();
        const rs = this.cellRooms(nx, nz).filter((x) => x.area === r.area);
        if (r.group !== 'base') {
          m.set(r.group, rs.find((x) => x.group === r.group) ?? rs.find((x) => x.group === 'base') ?? null);
        } else {
          const variants = rs.filter((x) => x.group !== 'base');
          if (variants.length) for (const v of variants) m.set(v.group, v);
          else m.set('base', rs.find((x) => x.group === 'base') ?? null);
        }
        for (const k of m.keys()) allCtx.add(k);
        ctxAt.push(m);
      }
      for (const ctx of allCtx) {
        const b = this.batch(r.area, ctx);
        type Cls = 'wall' | 'open' | 'skip';
        const cls: Cls[] = [];
        const voidSide: boolean[] = [];
        for (let i = 0; i < n; i++) {
          const p = s.a0 + i * CELL;
          if (!ctxAt[i].has(ctx)) {
            cls.push('skip');
            voidSide.push(false);
            continue;
          }
          const nb = ctxAt[i].get(ctx) ?? null;
          const op = this.openingAt(s.vertical, s.line, p, p + CELL, ctx);
          if (nb === r) cls.push('skip');
          else if (op) cls.push('open');
          else cls.push('wall');
          voidSide.push(!nb || nb.outdoor);
          if (!op && nb !== r) {
            const ek = (s.vertical ? 'V' : 'H') + s.line.toFixed(2) + ':' + p.toFixed(2) + ':' + ctx;
            if (!wallEdgeSet.has(ek)) {
              wallEdgeSet.add(ek);
              const seg: Seg = s.vertical ? { x0: s.line, z0: p, x1: s.line, z1: p + CELL, group: ctx } : { x0: p, z0: s.line, x1: p + CELL, z1: s.line, group: ctx };
              this.segs.push(seg);
            }
            if (s.vertical) r.wallEdges.push([s.line, p, s.line, p + CELL]);
            else r.wallEdges.push([p, s.line, p + CELL, s.line]);
          }
        }
        // 연속된 벽 구간으로 묶는다
        let i = 0;
        while (i < n) {
          if (cls[i] !== 'wall') {
            i++;
            continue;
          }
          let j = i;
          while (j < n && cls[j] === 'wall') j++;
          const a = s.a0 + i * CELL;
          const c = s.a0 + j * CELL;
          // 방 모서리에서는 안쪽으로 들인다, 개구부 옆에서는 그대로
          const atStart = i === 0;
          const atEnd = j === n;
          const pa = atStart ? a + T : a;
          const pc = atEnd ? c - T : c;
          const off = s.line + s.inward * T;
          const n3: V3 = s.vertical ? [s.inward, 0, 0] : [0, 0, s.inward];
          const seg = (y0: number, y1: number, key: string, ao: { bottom: boolean; top: boolean }) => {
            if (s.vertical) b.wall(key, off, pa, off, pc, r.y + y0, r.y + y1, n3, pa, { ...ao, start: atStart, end: atEnd });
            else b.wall(key, pa, off, pc, off, r.y + y0, r.y + y1, n3, pa, { ...ao, start: atStart, end: atEnd });
          };
          if (r.wain) {
            seg(0, r.wainH, r.wain, { bottom: true, top: false });
            seg(r.wainH, r.h, r.wall, { bottom: false, top: true });
          } else seg(0, r.h, r.wall, { bottom: true, top: true });
          // 바깥 피부
          if (r.skin) {
            let k = i;
            while (k < j) {
              if (!voidSide[k]) {
                k++;
                continue;
              }
              let m = k;
              while (m < j && voidSide[m]) m++;
              const qa = s.a0 + k * CELL - (k === 0 ? T_EXT : 0);
              const qc = s.a0 + m * CELL + (m === n ? T_EXT : 0);
              const o2 = s.line - s.inward * T_EXT;
              const nOut: V3 = s.vertical ? [-s.inward, 0, 0] : [0, 0, -s.inward];
              const H = r.skinH ?? r.h + 0.6;
              if (s.vertical) b.wall(r.skin, o2, qa, o2, qc, r.y, r.y + H, nOut, qa, { bottom: true, top: false, start: false, end: false });
              else b.wall(r.skin, qa, o2, qc, o2, r.y, r.y + H, nOut, qa, { bottom: true, top: false, start: false, end: false });
              k = m;
            }
          }
          i = j;
        }
      }
    }
  }

  /** 개구부: 문틀 옆면(문설주), 윗막이(인방), 창턱, 문짝 */
  private buildOpening(o: OpeningDef) {
    const vertical = Math.abs(o.x0 - o.x1) < EPS;
    const line = vertical ? o.x0 : o.z0;
    const a = vertical ? Math.min(o.z0, o.z1) : Math.min(o.x0, o.x1);
    const c = vertical ? Math.max(o.z0, o.z1) : Math.max(o.x0, o.x1);
    const mid = (a + c) / 2;
    const group = o.group ?? 'base';
    // 양쪽 방 찾기
    const probe = (side: number) => {
      const off = side * CELL * 0.5;
      return vertical ? this.neighbor(line + off, mid, group, o.area ?? this.anyArea(line, mid)) : this.neighbor(mid, line + off, group, o.area ?? this.anyArea(mid, line));
    };
    const rA = probe(-1);
    const rB = probe(1);
    const area = o.area ?? rA?.area ?? rB?.area ?? 'main';
    const b = this.batch(area, group);
    const yBase = rA?.y ?? rB?.y ?? 0;
    const kind = o.kind;
    const isWin = kind === 'window';
    const top = o.top ?? (isWin ? 2.3 : kind === 'vent' ? 0.85 : kind === 'arch' ? 2.4 : kind === 'none' ? Math.min(rA?.h ?? 99, rB?.h ?? 99) : kind === 'elevator' ? 2.3 : 2.12);
    const sill = isWin ? (o.sill ?? 0.95) : kind === 'vent' ? (o.sill ?? 0) : kind === 'hatch' ? (o.sill ?? 0.8) : 0;
    const voidA = !rA || rA.outdoor;
    const voidB = !rB || rB.outdoor;
    const tA = voidA ? T_EXT : T;
    const tB = voidB ? T_EXT : T;
    // 면 그리기 도우미: 경계선에서 side 방향으로 dist 떨어진 평면
    const face = (side: number, dist: number, y0: number, y1: number, key: string, ao = { bottom: false, top: false, start: false, end: false }) => {
      const off = line + side * dist;
      const n3: V3 = vertical ? [side, 0, 0] : [0, 0, side];
      if (vertical) b.wall(key, off, a, off, c, yBase + y0, yBase + y1, n3, a, ao);
      else b.wall(key, a, off, c, off, yBase + y0, yBase + y1, n3, a, ao);
    };
    const roomWall = (r: Room | null, y: number) => (r ? (r.wain && y < r.wainH ? r.wain : r.wall) : null);
    const sideMat = (r: Room | null, y0: number, y1: number, side: number, dist: number) => {
      if (!r || r.outdoor) return;
      if (r.wain && y0 < r.wainH && y1 > r.wainH) {
        face(side, dist, y0, r.wainH, r.wain, { bottom: y0 < 0.05, top: false, start: false, end: false });
        face(side, dist, r.wainH, y1, r.wall, { bottom: false, top: y1 >= r.h - 0.01, start: false, end: false });
      } else face(side, dist, y0, y1, roomWall(r, y0)!, { bottom: y0 < 0.05, top: y1 >= r.h - 0.01, start: false, end: false });
    };

    if (kind !== 'none') {
      // 인방 (문 위쪽 벽)
      if (rA && !rA.outdoor && top < rA.h - 0.01) sideMat(rA, top, rA.h, -1, T);
      if (rB && !rB.outdoor && top < rB.h - 0.01) sideMat(rB, top, rB.h, 1, T);
      // 창턱 아래 벽
      if (sill > 0) {
        if (rA && !rA.outdoor) sideMat(rA, 0, sill, -1, T);
        if (rB && !rB.outdoor) sideMat(rB, 0, sill, 1, T);
      }
      // 문설주 (두 옆면)
      const fk = o.mat === 'frame_wood' ? 'frame_wood' : isWin ? 'paint_metal' : 'frame';
      for (const [p, dir] of [
        [a, 1],
        [c, -1],
      ] as [number, number][]) {
        const n3: V3 = vertical ? [0, 0, dir] : [dir, 0, 0];
        const A: V3 = vertical ? [line - tA, yBase + sill, p] : [p, yBase + sill, line - tA];
        const B: V3 = vertical ? [line + tB, yBase + sill, p] : [p, yBase + sill, line + tB];
        const C: V3 = vertical ? [line + tB, yBase + top, p] : [p, yBase + top, line + tB];
        const D: V3 = vertical ? [line - tA, yBase + top, p] : [p, yBase + top, line - tA];
        const w = tA + tB;
        const ord = (vertical ? dir < 0 : dir > 0) ? [A, B, C, D] : [B, A, D, C];
        b.quad(fk, ord[0], ord[1], ord[2], ord[3], n3, [
          [0, sill],
          [w, sill],
          [w, top],
          [0, top],
        ], [0.85, 0.85, 0.9, 0.9]);
      }
      // 윗면 아래 (머리)
      {
        const y = yBase + top;
        const P = (u: number, s: number): V3 => (vertical ? [line + s, y, u] : [u, y, line + s]);
        const pts = [P(a, -tA), P(c, -tA), P(c, tB), P(a, tB)];
        const n3: V3 = [0, -1, 0];
        // 아래를 향한 면: 감김 방향 확인
        const ord = vertical ? [pts[0], pts[3], pts[2], pts[1]] : [pts[0], pts[1], pts[2], pts[3]];
        b.quad(fk, ord[0], ord[1], ord[2], ord[3], n3, [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ], [0.8, 0.8, 0.8, 0.8]);
      }
      // 창턱 윗면
      if (sill > 0) {
        const y = yBase + sill;
        const P = (u: number, s: number): V3 => (vertical ? [line + s, y, u] : [u, y, line + s]);
        const pts = [P(a, -tA - 0.04), P(c, -tA - 0.04), P(c, tB + 0.04), P(a, tB + 0.04)];
        const ord = vertical ? [pts[0], pts[1], pts[2], pts[3]] : [pts[0], pts[3], pts[2], pts[1]];
        b.quad('paint_metal', ord[0], ord[1], ord[2], ord[3], [0, 1, 0], [
          [0, 0],
          [1, 0],
          [1, 1],
          [0, 1],
        ]);
      }
    } else {
      // 'none': 천장 높이가 다른 방 사이의 단차 면
      if (rA && rB && !rA.outdoor && !rB.outdoor) {
        if (rA.h > top + 0.01) sideMat(rA, top, rA.h, -1, T);
        if (rB.h > top + 0.01) sideMat(rB, top, rB.h, 1, T);
      }
    }

    // 문틀 장식 (케이싱)
    if ((kind === 'door' || kind === 'double') && o.frame !== false) {
      for (const [side, r, t] of [
        [-1, rA, tA],
        [1, rB, tB],
      ] as [number, Room | null, number][]) {
        if (!r || r.outdoor) continue;
        const d = t + 0.015;
        for (const p of [a - 0.04, c + 0.04]) {
          const [cx, cz] = vertical ? [line + side * d, p] : [p, line + side * d];
          b.box('frame', cx, yBase, cz, vertical ? 0.03 : 0.08, top + 0.06, vertical ? 0.08 : 0.03);
        }
        const [hx, hz] = vertical ? [line + side * d, mid] : [mid, line + side * d];
        b.box('frame', hx, yBase + top, hz, vertical ? 0.03 : c - a + 0.16, 0.08, vertical ? c - a + 0.16 : 0.03, 0, { aoFloor: false });
      }
    }

    // 충돌
    if (isWin || kind === 'hatch') this.segs.push({ x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, group, glass: isWin });
    if (kind === 'vent') this.segs.push({ x0: o.x0, z0: o.z0, x1: o.x1, z1: o.z1, group, low: true });

    // 유리
    if (isWin) {
      const g = new THREE.PlaneGeometry(c - a, top - sill);
      const m = new THREE.Mesh(g, mat('glass', false).mat);
      m.position.set(vertical ? line : mid, yBase + (sill + top) / 2, vertical ? mid : line);
      if (vertical) m.rotation.y = Math.PI / 2;
      m.renderOrder = 2;
      this.variantGroup(area, group).add(m);
      const m2 = m.clone();
      m2.rotation.y += Math.PI;
      this.variantGroup(area, group).add(m2);
      // 창살 (가운데 세로·가로)
      const fb = this.batch(area, group);
      const [cx, cz] = vertical ? [line, mid] : [mid, line];
      fb.box('paint_metal', cx, yBase + sill, cz, vertical ? 0.05 : 0.05, top - sill, vertical ? 0.05 : 0.05, 0, { aoFloor: false });
      fb.box('paint_metal', cx, yBase + (sill + top) / 2 - 0.025, cz, vertical ? 0.05 : c - a, 0.05, vertical ? c - a : 0.05, 0, { aoFloor: false });
    }

    // 문짝
    if (kind === 'door' || kind === 'double' || kind === 'elevator') this.makeDoor(o, vertical, line, a, c, top, yBase, area, group);
  }

  private anyArea(x: number, z: number) {
    const rs = this.cellRooms(x + CELL * 0.3, z + CELL * 0.3).concat(this.cellRooms(x - CELL * 0.3, z - CELL * 0.3));
    return rs[0]?.area ?? 'main';
  }

  private makeDoor(o: OpeningDef, vertical: boolean, line: number, a: number, c: number, top: number, yBase: number, area: string, group: string) {
    const width = c - a;
    const door = new Door(o, width, top, vertical);
    const parent = this.variantGroup(area, group);
    if (o.kind === 'elevator') {
      // 가운데에서 양쪽으로 열리는 스테인리스 문 두 짝
      const holder = new THREE.Group();
      holder.position.set(vertical ? line : (a + c) / 2, yBase, vertical ? (a + c) / 2 : line);
      if (vertical) holder.rotation.y = Math.PI / 2;
      const m = mat('elevator', false).mat;
      for (const s of [-1, 1]) {
        const slider = new THREE.Group();
        const panel = new THREE.Mesh(new THREE.BoxGeometry(width / 2, top, 0.05), m);
        panel.position.set((s * width) / 4, top / 2, 0);
        panel.castShadow = true;
        panel.receiveShadow = true;
        slider.add(panel);
        holder.add(slider);
        if (s < 0) door.slideL = slider;
        else door.slideR = slider;
      }
      parent.add(holder);
      door.pivot = holder;
    } else {
      const leaves = o.kind === 'double' ? 2 : 1;
      const lw = width / leaves - 0.02;
      const m = mat(o.mat ?? 'door_wood', false).mat;
      const hingeStart = o.hingeStart ?? true;
      for (let k = 0; k < leaves; k++) {
        const pivot = new THREE.Group();
        const atStart = leaves === 2 ? k === 0 : hingeStart;
        const hp = atStart ? a + 0.01 : c - 0.01;
        pivot.position.set(vertical ? line : hp, yBase, vertical ? hp : line);
        const leaf = new THREE.Mesh(new THREE.BoxGeometry(lw, top - 0.02, 0.05), m);
        // 피벗(경첩)에서 문짝 중심까지
        const dir = atStart ? 1 : -1;
        if (vertical) {
          leaf.rotation.y = Math.PI / 2;
          leaf.position.set(0, (top - 0.02) / 2, (dir * lw) / 2);
        } else leaf.position.set((dir * lw) / 2, (top - 0.02) / 2, 0);
        leaf.castShadow = true;
        leaf.receiveShadow = true;
        pivot.add(leaf);
        // 손잡이 (레버)
        const hx = dir * (lw - 0.1);
        for (const side of [-1, 1]) {
          const h2 = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.025, 0.03), mat('chrome', false).mat);
          if (vertical) {
            h2.position.set(side * 0.045, 1.0, hx);
            h2.rotation.y = Math.PI / 2;
          } else h2.position.set(hx, 1.0, side * 0.045);
          pivot.add(h2);
        }
        parent.add(pivot);
        if (k === 0) {
          door.pivot = pivot;
          door.dir = dir;
        } else door.pivot2 = pivot;
      }
    }
    if (o.open) {
      door.setOpen(true);
      door.angle = door.target;
      door.slide = 1;
      door.update(0);
    }
    this.doors.push(door);
    this.segs.push(door.seg);
  }

  /** 바닥과 천장 (가장자리 어둡게) */
  private buildFlats(r: Room) {
    const b = this.batch(r.area, r.group);
    const ao = (x: number, z: number, base: number, span: number) => {
      let d = 9;
      for (const [x0, z0, x1, z1] of r.wallEdges) {
        const px = clamp(x, Math.min(x0, x1), Math.max(x0, x1));
        const pz = clamp(z, Math.min(z0, z1), Math.max(z0, z1));
        d = Math.min(d, Math.hypot(x - px, z - pz));
      }
      return base + (1 - base) * smoothstep(0.05, span, d);
    };
    b.flat(r.floor, r.x0, r.z0, r.x1, r.z1, r.y, true, r.outdoor ? undefined : (x, z) => ao(x, z, 0.5, 1.1), r.outdoor ? 4 : 1);
    if (r.ceil && !r.outdoor) b.flat(r.ceil, r.x0, r.z0, r.x1, r.z1, r.y + r.h, false, (x, z) => ao(x, z, 0.62, 0.9), 1);
  }

  // ───────────────────────────── 충돌 ─────────────────────────────

  private segActive(s: Seg) {
    if (s.group !== 'base' && !this.activeGroups.has(s.group)) return false;
    if (s.door) return !s.door.passable;
    return true;
  }

  /**
   * 원(반지름 rad)을 벽과 상자에서 밀어낸다. pos를 직접 고친다.
   */
  collide(pos: THREE.Vector3, rad: number, crouched: boolean, feetY = pos.y) {
    for (let iter = 0; iter < 3; iter++) {
      for (const s of this.segs) {
        if (!this.segActive(s)) continue;
        if (s.low && crouched) continue;
        const dx = s.x1 - s.x0;
        const dz = s.z1 - s.z0;
        const len2 = dx * dx + dz * dz;
        let t = ((pos.x - s.x0) * dx + (pos.z - s.z0) * dz) / len2;
        t = clamp(t, 0, 1);
        const px = s.x0 + dx * t;
        const pz = s.z0 + dz * t;
        const ex = pos.x - px;
        const ez = pos.z - pz;
        const d2 = ex * ex + ez * ez;
        if (d2 < rad * rad) {
          const d = Math.sqrt(d2) || 1e-4;
          const push = rad - d;
          pos.x += (ex / d) * push;
          pos.z += (ez / d) * push;
        }
      }
      for (const bx of this.boxes) {
        if (bx.group !== 'base' && !this.activeGroups.has(bx.group)) continue;
        if (feetY > bx.top - 0.05) continue;
        const px = clamp(pos.x, bx.minX, bx.maxX);
        const pz = clamp(pos.z, bx.minZ, bx.maxZ);
        const ex = pos.x - px;
        const ez = pos.z - pz;
        const d2 = ex * ex + ez * ez;
        if (d2 < rad * rad) {
          if (d2 < 1e-8) {
            // 상자 안: 가장 가까운 면으로
            const l = pos.x - bx.minX,
              rr = bx.maxX - pos.x,
              u = pos.z - bx.minZ,
              dd = bx.maxZ - pos.z;
            const m = Math.min(l, rr, u, dd);
            if (m === l) pos.x = bx.minX - rad;
            else if (m === rr) pos.x = bx.maxX + rad;
            else if (m === u) pos.z = bx.minZ - rad;
            else pos.z = bx.maxZ + rad;
          } else {
            const d = Math.sqrt(d2);
            pos.x += (ex / d) * (rad - d);
            pos.z += (ez / d) * (rad - d);
          }
        }
      }
    }
  }

  addBox(cx: number, cz: number, sx: number, sz: number, top: number, rotY = 0, group = 'base', id?: string) {
    // 회전된 상자는 축 정렬 상자로 근사 (90° 단위 회전만 정확)
    const c = Math.abs(Math.cos(rotY));
    const s = Math.abs(Math.sin(rotY));
    const hx = (sx * c + sz * s) / 2;
    const hz = (sx * s + sz * c) / 2;
    const b: BoxCol = { minX: cx - hx, maxX: cx + hx, minZ: cz - hz, maxZ: cz + hz, top, group, id };
    this.boxes.push(b);
    return b;
  }

  /** 두 점 사이에 막힌 벽이 몇 개인가 (소리 차폐, 체온 감지 시야) */
  wallsBetween(ax: number, az: number, bx: number, bz: number, countGlass = true): number {
    let n = 0;
    for (const s of this.segs) {
      if (!this.segActive(s)) continue;
      if (s.low) continue;
      if (!countGlass && s.glass) continue;
      if (segIntersect(ax, az, bx, bz, s.x0, s.z0, s.x1, s.z1)) n++;
    }
    return n;
  }

  /** 반지름을 고려한 직선 통과 가능 여부 (경로 다듬기) */
  clearLine(ax: number, az: number, bx: number, bz: number, rad = 0.3) {
    const dx = bx - ax;
    const dz = bz - az;
    const len = Math.hypot(dx, dz) || 1;
    const nx = (-dz / len) * rad;
    const nz = (dx / len) * rad;
    return this.wallsBetween(ax + nx, az + nz, bx + nx, bz + nz) === 0 && this.wallsBetween(ax - nx, az - nz, bx - nx, bz - nz) === 0 && !this.boxBetween(ax, az, bx, bz, rad);
  }

  private boxBetween(ax: number, az: number, bx: number, bz: number, rad: number) {
    for (const b of this.boxes) {
      if (b.group !== 'base' && !this.activeGroups.has(b.group)) continue;
      if (b.top < 0.4) continue;
      if (segBox(ax, az, bx, bz, b.minX - rad, b.minZ - rad, b.maxX + rad, b.maxZ + rad)) return true;
    }
    return false;
  }

  // ───────────────────────────── 길 찾기 ─────────────────────────────

  /** 칸 사이 이동 가능? (같은 방, 또는 열린/열 수 있는 개구부) */
  private passableEdge(ax: number, az: number, bx: number, bz: number, canOpen: boolean, canVent: boolean) {
    const ra = this.roomAt(ax, az);
    const rb = this.roomAt(bx, bz);
    if (!ra || !rb) return false;
    if (rb.low && !canVent) return false;
    if (ra === rb) return true;
    const vertical = Math.abs(az - bz) < EPS;
    const line = vertical ? Math.max(ax, bx) - CELL / 2 : Math.max(az, bz) - CELL / 2;
    const p = vertical ? az - CELL / 2 : ax - CELL / 2;
    const lineR = Math.round(line / CELL) * CELL;
    const group = ra.group !== 'base' ? ra.group : rb.group;
    const op = this.openingAt(vertical, lineR, p, p + CELL, group);
    if (!op) return false;
    if (op.kind === 'window' || op.kind === 'hatch') return false;
    if (op.kind === 'vent') return canVent;
    if (op.kind === 'door' || op.kind === 'double' || op.kind === 'elevator') {
      const d = this.doors.find((dd) => dd.def === op);
      if (d && !d.passable && (!canOpen || d.locked)) return false;
    }
    return true;
  }

  /**
   * A* (0.5m 칸). 반환: 매끈하게 다듬은 경유점 목록 (y = 0)
   */
  findPath(from: THREE.Vector3, to: THREE.Vector3, opts: { canOpen?: boolean; canVent?: boolean; maxNodes?: number } = {}): THREE.Vector3[] | null {
    const canOpen = opts.canOpen ?? true;
    const canVent = opts.canVent ?? false;
    const sx = Math.floor(from.x / CELL);
    const sz = Math.floor(from.z / CELL);
    const tx = Math.floor(to.x / CELL);
    const tz = Math.floor(to.z / CELL);
    if (!this.roomAt(to.x, to.z) || !this.roomAt(from.x, from.z)) return null;
    const key = (x: number, z: number) => x * 100003 + z;
    const open = new Heap<[number, number, number]>((a, b) => a[0] - b[0]);
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const coord = new Map<number, [number, number]>();
    const startK = key(sx, sz);
    g.set(startK, 0);
    open.push([Math.hypot(tx - sx, tz - sz), sx, sz]);
    const max = opts.maxNodes ?? 6000;
    let found = false;
    let count = 0;
    const dirs = [
      [1, 0],
      [-1, 0],
      [0, 1],
      [0, -1],
    ];
    while (open.size && count++ < max) {
      const [, x, z] = open.pop()!;
      if (x === tx && z === tz) {
        found = true;
        break;
      }
      const ck = key(x, z);
      const gc = g.get(ck)!;
      for (const [dx, dz] of dirs) {
        const nx = x + dx;
        const nz = z + dz;
        const ax = (x + 0.5) * CELL;
        const az = (z + 0.5) * CELL;
        const bx = (nx + 0.5) * CELL;
        const bz = (nz + 0.5) * CELL;
        if (!this.passableEdge(ax, az, bx, bz, canOpen, canVent)) continue;
        const nk = key(nx, nz);
        // 상자(가구) 칸은 비싸게
        let cost = 1;
        for (const b of this.boxes) {
          if (b.top < 0.4) continue;
          if (bx > b.minX - 0.2 && bx < b.maxX + 0.2 && bz > b.minZ - 0.2 && bz < b.maxZ + 0.2) {
            cost = 12;
            break;
          }
        }
        const ng = gc + cost;
        if (ng < (g.get(nk) ?? Infinity)) {
          g.set(nk, ng);
          came.set(nk, ck);
          coord.set(nk, [nx, nz]);
          open.push([ng + Math.hypot(tx - nx, tz - nz), nx, nz]);
        }
      }
    }
    if (!found) return null;
    const pts: THREE.Vector3[] = [];
    let k = key(tx, tz);
    while (k !== startK) {
      const xz = coord.get(k);
      if (!xz) break;
      pts.push(new THREE.Vector3((xz[0] + 0.5) * CELL, 0, (xz[1] + 0.5) * CELL));
      const prev = came.get(k);
      if (prev === undefined) break;
      k = prev;
    }
    pts.reverse();
    pts.push(to.clone().setY(0));
    // 줄 당기기
    const out: THREE.Vector3[] = [];
    let cur = from.clone().setY(0);
    let i = 0;
    while (i < pts.length) {
      let j = pts.length - 1;
      while (j > i && !this.clearLine(cur.x, cur.z, pts[j].x, pts[j].z, 0.25)) j--;
      out.push(pts[j]);
      cur = pts[j];
      i = j + 1;
    }
    return out;
  }
}

function segIntersect(ax: number, az: number, bx: number, bz: number, cx: number, cz: number, dx: number, dz: number) {
  const d1 = (bx - ax) * (cz - az) - (bz - az) * (cx - ax);
  const d2 = (bx - ax) * (dz - az) - (bz - az) * (dx - ax);
  const d3 = (dx - cx) * (az - cz) - (dz - cz) * (ax - cx);
  const d4 = (dx - cx) * (bz - cz) - (dz - cz) * (bx - cx);
  return d1 * d2 < 0 && d3 * d4 < 0;
}

function segBox(ax: number, az: number, bx: number, bz: number, x0: number, z0: number, x1: number, z1: number) {
  // 리앙-바스키
  let t0 = 0;
  let t1 = 1;
  const dx = bx - ax;
  const dz = bz - az;
  const p = [-dx, dx, -dz, dz];
  const q = [ax - x0, x1 - ax, az - z0, z1 - az];
  for (let i = 0; i < 4; i++) {
    if (Math.abs(p[i]) < 1e-9) {
      if (q[i] < 0) return false;
    } else {
      const t = q[i] / p[i];
      if (p[i] < 0) t0 = Math.max(t0, t);
      else t1 = Math.min(t1, t);
      if (t0 > t1) return false;
    }
  }
  return true;
}

class Heap<T> {
  private a: T[] = [];
  constructor(private cmp: (x: T, y: T) => number) {}
  get size() {
    return this.a.length;
  }
  push(v: T) {
    const a = this.a;
    a.push(v);
    let i = a.length - 1;
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.cmp(a[i], a[p]) >= 0) break;
      [a[i], a[p]] = [a[p], a[i]];
      i = p;
    }
  }
  pop(): T | undefined {
    const a = this.a;
    if (!a.length) return undefined;
    const top = a[0];
    const last = a.pop()!;
    if (a.length) {
      a[0] = last;
      let i = 0;
      for (;;) {
        const l = i * 2 + 1;
        const r = l + 1;
        let m = i;
        if (l < a.length && this.cmp(a[l], a[m]) < 0) m = l;
        if (r < a.length && this.cmp(a[r], a[m]) < 0) m = r;
        if (m === i) break;
        [a[i], a[m]] = [a[m], a[i]];
        i = m;
      }
    }
    return top;
  }
}
