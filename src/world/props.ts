import * as THREE from 'three';
import type { Level } from './level';
import { decalMat, mat } from './materials';
import { tex } from './textures';
import { rng } from '../core/util';

/**
 * 소품 도구 상자. 원점(x, z, 회전)을 정하고 지역 좌표로 상자·원기둥을 쌓는다.
 * 지역 좌표: +z가 소품의 '앞', y는 바닥에서 위로.
 * 정적인 것은 레벨 배치(합쳐진 메시)에, 움직이는 것은 개별 메시로.
 */
export class Kit {
  ox = 0;
  oz = 0;
  oy = 0;
  rot = 0;
  r = rng(5);
  constructor(
    readonly level: Level,
    public area: string,
    public group = 'base',
  ) {}

  get b() {
    return this.level.batch(this.area, this.group);
  }

  get parent() {
    return this.level.variantGroup(this.area, this.group);
  }

  at(x: number, z: number, rot = 0, y = 0) {
    this.ox = x;
    this.oz = z;
    this.rot = rot;
    this.oy = y;
    return this;
  }

  w(lx: number, lz: number): [number, number] {
    const c = Math.cos(this.rot);
    const s = Math.sin(this.rot);
    return [this.ox + lx * c + lz * s, this.oz - lx * s + lz * c];
  }

  box(key: string, lx: number, ly: number, lz: number, sx: number, sy: number, sz: number, r = 0, opts?: { noBottom?: boolean; noTop?: boolean; aoFloor?: boolean; topKey?: string }) {
    const [x, z] = this.w(lx, lz);
    this.b.box(key, x, this.oy + ly, z, sx, sy, sz, this.rot + r, opts);
  }

  /** 원기둥 (아래 중심 기준). axis: 'y' 세로, 'x'/'z' 눕힘 */
  cyl(key: string, lx: number, ly: number, lz: number, rad: number, h: number, seg = 8, axis: 'y' | 'x' | 'z' = 'y', radTop = rad) {
    const g = new THREE.CylinderGeometry(radTop, rad, h, seg, 1, false);
    const m = new THREE.Matrix4();
    const [x, z] = this.w(lx, lz);
    const rot = new THREE.Matrix4().makeRotationY(this.rot);
    const local = new THREE.Matrix4();
    if (axis === 'y') local.makeTranslation(0, h / 2, 0);
    else if (axis === 'x') local.makeRotationZ(Math.PI / 2);
    else local.makeRotationX(Math.PI / 2);
    m.makeTranslation(x, this.oy + ly, z).multiply(rot).multiply(local);
    this.b.geo(key, g, m, this.oy);
    g.dispose();
  }

  sphere(key: string, lx: number, ly: number, lz: number, rad: number, sx = 1, sy = 1, sz = 1, seg = 8) {
    const g = new THREE.SphereGeometry(rad, seg, Math.max(4, seg - 2));
    const [x, z] = this.w(lx, lz);
    const m = new THREE.Matrix4().makeTranslation(x, this.oy + ly, z).multiply(new THREE.Matrix4().makeRotationY(this.rot)).multiply(new THREE.Matrix4().makeScale(sx, sy, sz));
    this.b.geo(key, g, m, this.oy);
    g.dispose();
  }

  /** 충돌 상자 (지역 좌표) */
  solid(lx: number, lz: number, sx: number, sz: number, top: number, id?: string) {
    const [x, z] = this.w(lx, lz);
    return this.level.addBox(x, z, sx, sz, this.oy + top, this.rot, this.group, id);
  }

  /** 벽에 붙이는 판 (포스터·간판). 지역 +z를 향한다 */
  decal(t: string | THREE.Texture, lx: number, ly: number, lz: number, w: number, h: number, opts: { emissive?: boolean; transparent?: boolean; r?: number } = {}) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, h), decalMat(t, opts));
    const [x, z] = this.w(lx, lz);
    m.position.set(x, this.oy + ly, z);
    m.rotation.y = this.rot + (opts.r ?? 0);
    m.receiveShadow = !opts.emissive;
    this.parent.add(m);
    return m;
  }

  /** 개별 메시 (움직이거나 상호작용하는 것) */
  mesh(geo: THREE.BufferGeometry, key: string | THREE.Material, lx: number, ly: number, lz: number, r = 0) {
    const material = typeof key === 'string' ? mat(key, false).mat : key;
    const m = new THREE.Mesh(geo, material);
    const [x, z] = this.w(lx, lz);
    m.position.set(x, this.oy + ly, z);
    m.rotation.y = this.rot + r;
    m.castShadow = true;
    m.receiveShadow = true;
    this.parent.add(m);
    return m;
  }

  worldPos(lx: number, ly: number, lz: number) {
    const [x, z] = this.w(lx, lz);
    return new THREE.Vector3(x, this.oy + ly, z);
  }
}

// ───────────────────────────── 병원 ─────────────────────────────

/** 소아 병상. 머리가 지역 -z. 반환: 침대 밑 숨는 자리 */
export function bed(k: Kit, x: number, z: number, rot: number, opts: { blanket?: string; messy?: boolean; rails?: boolean } = {}) {
  k.at(x, z, rot);
  // 바퀴와 다리
  for (const [lx, lz] of [
    [-0.42, -0.9],
    [0.42, -0.9],
    [-0.42, 0.9],
    [0.42, 0.9],
  ]) {
    k.cyl('steel', lx, 0.08, lz, 0.025, 0.28);
    k.cyl('rubber', lx, 0.0, lz, 0.05, 0.05, 8, 'x');
  }
  // 아래 틀
  k.box('steel', 0, 0.36, 0, 0.92, 0.06, 1.95);
  k.box('steel', 0, 0.1, 0, 0.8, 0.03, 0.04);
  // 매트리스, 시트, 담요, 베개
  k.box('mattress', 0, 0.42, 0, 0.88, 0.14, 1.9);
  k.box('linen', 0, 0.56, -0.2, 0.9, 0.02, 1.4);
  k.box(opts.blanket ?? 'gown', 0, 0.565, opts.messy ? 0.35 : 0.55, opts.messy ? 0.95 : 0.9, opts.messy ? 0.07 : 0.05, opts.messy ? 0.9 : 0.7, opts.messy ? 0.12 : 0);
  k.box('linen', 0, 0.56, -0.72, 0.56, 0.12, 0.34, opts.messy ? 0.2 : 0);
  // 머리판, 발판 (연한 하늘색 플라스틱)
  k.box('plastic_white', 0, 0.36, -1.0, 0.94, 0.62, 0.05);
  k.box('plastic_blue', 0, 0.82, -1.0, 0.94, 0.06, 0.07);
  k.box('plastic_white', 0, 0.36, 1.0, 0.94, 0.4, 0.05);
  // 난간
  if (opts.rails !== false)
    for (const s of [-1, 1]) {
      k.box('chrome', s * 0.47, 0.62, -0.35, 0.03, 0.03, 0.9);
      k.box('chrome', s * 0.47, 0.42, -0.75, 0.03, 0.2, 0.03);
      k.box('chrome', s * 0.47, 0.42, 0.05, 0.03, 0.2, 0.03);
    }
  k.solid(0, 0, 0.98, 2.05, 0.65);
  return { under: k.worldPos(0, 0.16, 0.1), head: k.worldPos(0, 0.6, -0.7) };
}

export function ivStand(k: Kit, x: number, z: number, withBag = true) {
  k.at(x, z, 0);
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    k.box('steel', Math.cos(a) * 0.14, 0.04, Math.sin(a) * 0.14, 0.03, 0.02, 0.28, -a);
    k.cyl('rubber', Math.cos(a) * 0.27, 0, Math.sin(a) * 0.27, 0.025, 0.04);
  }
  k.cyl('chrome', 0, 0.05, 0, 0.012, 1.95);
  k.box('chrome', 0, 1.98, 0, 0.32, 0.015, 0.015);
  if (withBag) {
    k.box('water', 0.12, 1.66, 0, 0.1, 0.24, 0.035);
    k.cyl('plastic_white', 0.12, 1.2, 0, 0.004, 0.46);
  }
  k.solid(0, 0, 0.3, 0.3, 1.9);
}

export function cabinet(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('wood_light', 0, 0.06, 0, 0.48, 0.7, 0.44);
  k.box('plastic_white', 0, 0.76, 0, 0.5, 0.03, 0.46);
  k.box('wood_dark', 0, 0.58, 0.225, 0.4, 0.008, 0.01);
  k.box('chrome', 0, 0.66, 0.23, 0.12, 0.02, 0.02);
  k.box('wood_dark', 0, 0.3, 0.225, 0.4, 0.008, 0.01);
  k.box('steel', 0, 0, 0, 0.44, 0.06, 0.4);
  k.solid(0, 0, 0.5, 0.46, 0.8);
}

export function chair(k: Kit, x: number, z: number, rot: number, seat = 'vinyl_seat', small = false) {
  const s = small ? 0.62 : 1;
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.19, -0.19],
    [0.19, -0.19],
    [-0.19, 0.19],
    [0.19, 0.19],
  ])
    k.cyl('steel', lx * s, 0, lz * s, 0.015, 0.44 * s);
  k.box(seat, 0, 0.44 * s, 0, 0.44 * s, 0.07, 0.44 * s);
  k.box(seat, 0, 0.5 * s, -0.2 * s, 0.42 * s, 0.4 * s, 0.05, 0.08);
  k.solid(0, 0, 0.46 * s, 0.46 * s, 0.5 * s);
}

export function table(k: Kit, x: number, z: number, rot: number, w = 1.2, d = 0.7, h = 0.74, top = 'wood_light') {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-w / 2 + 0.05, -d / 2 + 0.05],
    [w / 2 - 0.05, -d / 2 + 0.05],
    [-w / 2 + 0.05, d / 2 - 0.05],
    [w / 2 - 0.05, d / 2 - 0.05],
  ])
    k.cyl('steel', lx, 0, lz, 0.02, h - 0.03);
  k.box(top, 0, h - 0.03, 0, w, 0.03, d);
  k.solid(0, 0, w, d, h);
}

/** 벽걸이 CRT 텔레비전. 반환: 화면 메시 (캔버스 텍스처를 붙인다) */
export function wallTV(k: Kit, x: number, z: number, rot: number, y = 2.0) {
  k.at(x, z, rot);
  // 벽 브래킷
  k.box('steel', 0, y - 0.05, -0.02, 0.2, 0.08, 0.3);
  k.box('steel', 0, y - 0.32, 0.12, 0.06, 0.3, 0.06);
  // 본체
  k.box('plastic_grey', 0, y - 0.05, 0.3, 0.62, 0.48, 0.5);
  k.box('plastic_dark', 0, y - 0.05, 0.56, 0.6, 0.46, 0.02);
  const screen = k.mesh(new THREE.PlaneGeometry(0.5, 0.37), mat('screen_dark', false).mat, 0, y + 0.18, 0.575);
  screen.castShadow = false;
  // 전원 표시등
  const led = k.mesh(new THREE.BoxGeometry(0.015, 0.015, 0.005), mat('red_led', false).mat, 0.25, y - 0.02, 0.575);
  return { screen, led, pos: k.worldPos(0, y + 0.18, 0.6) };
}

/** 받침대 위 텔레비전 + VCR (테이프 재생용) */
export function tvCart(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.32, -0.2],
    [0.32, -0.2],
    [-0.32, 0.2],
    [0.32, 0.2],
  ]) {
    k.cyl('steel', lx, 0.06, lz, 0.015, 0.9);
    k.cyl('rubber', lx, 0, lz, 0.04, 0.05, 8, 'x');
  }
  k.box('paint_metal', 0, 0.3, 0, 0.72, 0.03, 0.48);
  k.box('paint_metal', 0, 0.94, 0, 0.72, 0.03, 0.48);
  // VCR
  k.box('plastic_dark', 0, 0.97, 0.02, 0.42, 0.09, 0.3);
  k.box('plastic_grey', 0.05, 1.0, 0.172, 0.2, 0.012, 0.004);
  const led = k.mesh(new THREE.BoxGeometry(0.03, 0.01, 0.004), mat("green_led", false).mat, -0.15, 1.02, 0.174);
  // CRT
  k.box('plastic_grey', 0, 1.06, -0.02, 0.6, 0.48, 0.46);
  k.box('plastic_dark', 0, 1.06, 0.215, 0.58, 0.46, 0.02);
  const screen = k.mesh(new THREE.PlaneGeometry(0.48, 0.36), mat('screen_dark', false).mat, 0, 1.3, 0.228);
  screen.castShadow = false;
  k.solid(0, 0, 0.74, 0.5, 1.5);
  return { screen, led, pos: k.worldPos(0, 1.3, 0.25) };
}

export function curtainTrack(k: Kit, x: number, z: number, rot: number, len: number, h = 2.9, drawn = 0.4) {
  k.at(x, z, rot);
  k.box('chrome', 0, h - 0.04, 0, len, 0.03, 0.04);
  // 커튼 주름 (지그재그 판)
  const w = len * drawn;
  const folds = Math.max(3, Math.round(w / 0.15));
  for (let i = 0; i < folds; i++) {
    const a0 = -len / 2 + (i * w) / folds;
    const a1 = -len / 2 + ((i + 1) * w) / folds;
    const zz = i % 2 ? 0.05 : -0.05;
    k.box('curtain', (a0 + a1) / 2, 0.35, zz, (a1 - a0) * 1.05, h - 0.42, 0.01, i % 2 ? 0.25 : -0.25);
  }
}

export function sink(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('plastic_white', 0, 0.78, 0.22, 0.55, 0.12, 0.42);
  k.box('steel', 0, 0.6, 0.1, 0.06, 0.2, 0.06);
  k.cyl('chrome', 0, 0.9, 0.06, 0.015, 0.16);
  k.box('chrome', 0, 1.04, 0.12, 0.03, 0.03, 0.14);
  k.box('steel', 0, 1.15, 0.015, 0.5, 0.62, 0.02);
  k.box('glass_frost', 0, 1.18, 0.03, 0.44, 0.56, 0.005);
  k.solid(0, 0.22, 0.55, 0.42, 0.9);
}

/** 복도 손잡이 레일 */
export function handrail(k: Kit, x0: number, z0: number, x1: number, z1: number, out: number) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(x1 - x0, z1 - z0);
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  k.at(cx, cz, rot);
  k.box('wood_dark', out, 0.88, 0, 0.06, 0.07, len);
  for (let a = -len / 2 + 0.3; a < len / 2; a += 1.5) k.box('steel', out * 0.55, 0.9, a, Math.abs(out) * 0.9, 0.03, 0.03);
}

export function crashCart(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.28, -0.2],
    [0.28, -0.2],
    [-0.28, 0.2],
    [0.28, 0.2],
  ])
    k.cyl('rubber', lx, 0, lz, 0.05, 0.06, 8, 'x');
  k.box('plastic_red', 0, 0.08, 0, 0.62, 0.9, 0.48);
  for (let i = 0; i < 5; i++) {
    k.box('plastic_dark', 0, 0.2 + i * 0.16, 0.242, 0.56, 0.006, 0.006);
    k.box('chrome', 0, 0.26 + i * 0.16, 0.25, 0.2, 0.02, 0.02);
  }
  k.box('plastic_grey', 0, 0.98, 0, 0.66, 0.04, 0.52);
  k.box('chrome', 0.36, 0.7, 0, 0.03, 0.03, 0.4);
  k.solid(0, 0, 0.66, 0.52, 1.0);
  return k.worldPos(0, 1.0, 0);
}

export function wheelchair(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  for (const s of [-1, 1]) {
    k.cyl('rubber', s * 0.3, 0.33, 0.05, 0.3, 0.03, 14, 'x');
    k.cyl('chrome', s * 0.31, 0.33, 0.05, 0.26, 0.012, 12, 'x');
    k.cyl('rubber', s * 0.2, 0.0, 0.45, 0.06, 0.03, 8, 'x');
  }
  k.box('vinyl_seat', 0, 0.48, 0.15, 0.46, 0.05, 0.44);
  k.box('vinyl_seat', 0, 0.55, -0.1, 0.46, 0.45, 0.04);
  k.box('chrome', 0, 0.3, 0.4, 0.4, 0.02, 0.2);
  k.solid(0, 0.1, 0.7, 0.8, 0.9);
}

export function gurney(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.25, -0.85],
    [0.25, -0.85],
    [-0.25, 0.85],
    [0.25, 0.85],
  ]) {
    k.cyl('rubber', lx, 0, lz, 0.05, 0.05, 8, 'x');
    k.cyl('chrome', lx, 0.06, lz, 0.015, 0.7);
  }
  k.box('steel', 0, 0.74, 0, 0.6, 0.05, 1.9);
  k.box('mattress', 0, 0.79, 0, 0.56, 0.08, 1.85);
  k.box('linen', 0, 0.87, 0.2, 0.58, 0.02, 1.2);
  k.solid(0, 0, 0.65, 1.95, 0.9);
}

export function counter(k: Kit, x: number, z: number, rot: number, len: number, h = 1.05) {
  k.at(x, z, rot);
  k.box('wood_light', 0, 0, 0, len, h, 0.5);
  k.box('plastic_white', 0, h, 0.02, len + 0.04, 0.04, 0.56);
  k.box('plastic_dark', 0, 0, 0.255, len, 0.1, 0.01);
  k.solid(0, 0, len, 0.56, h + 0.04);
}

export function crtMonitor(k: Kit, x: number, z: number, rot: number, y: number) {
  k.at(x, z, rot);
  k.box('plastic_white', 0, y, 0, 0.38, 0.32, 0.36);
  k.box('plastic_dark', 0, y + 0.03, 0.181, 0.3, 0.24, 0.005);
  k.box('plastic_white', 0, y - 0.03, 0.05, 0.22, 0.03, 0.18);
  k.box('plastic_white', 0, y - 0.05, 0.12, 0.42, 0.025, 0.15);
}

export function shelf(k: Kit, x: number, z: number, rot: number, w = 1.2, h = 1.9, d = 0.45, fill: 'linen' | 'boxes' | 'toys' | 'files' = 'linen') {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-w / 2, -d / 2],
    [w / 2, -d / 2],
    [-w / 2, d / 2],
    [w / 2, d / 2],
  ])
    k.box('steel', lx, 0, lz, 0.03, h, 0.03);
  const levels = 4;
  for (let i = 0; i < levels; i++) {
    const y = 0.1 + (i * (h - 0.15)) / (levels - 1);
    k.box('steel', 0, y, 0, w, 0.02, d);
    if (i === levels - 1) continue;
    let a = -w / 2 + 0.05;
    while (a < w / 2 - 0.15) {
      const iw = 0.15 + k.r() * 0.25;
      if (a + iw > w / 2 - 0.05) break;
      const ih = fill === 'linen' ? 0.08 + k.r() * 0.15 : 0.15 + k.r() * 0.25;
      const key = fill === 'linen' ? (k.r() < 0.5 ? 'linen' : 'gown') : fill === 'files' ? (k.r() < 0.6 ? 'paper' : 'plastic_blue') : fill === 'toys' ? ['ball_red', 'ball_blue', 'ball_yellow', 'ball_green', 'plastic_pink'][Math.floor(k.r() * 5)] : 'cardboard';
      if (k.r() > 0.15) k.box(key, a + iw / 2, y + 0.02, (k.r() - 0.5) * 0.05, iw - 0.02, ih, d - 0.08 - k.r() * 0.1);
      a += iw;
    }
  }
  k.solid(0, 0, w, d, h);
}

export function pottedPlant(k: Kit, x: number, z: number) {
  k.at(x, z, 0);
  k.cyl('plastic_grey', 0, 0, 0, 0.2, 0.4, 10, 'y', 0.24);
  k.cyl('cardboard', 0, 0.38, 0, 0.21, 0.02, 10);
  // 말라 죽은 잎
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2 + k.r();
    k.box('bark', Math.cos(a) * 0.08, 0.4, Math.sin(a) * 0.08, 0.02, 0.5 + k.r() * 0.4, 0.02, a);
    k.box('cardboard', Math.cos(a) * 0.18, 0.75 + k.r() * 0.3, Math.sin(a) * 0.18, 0.18, 0.02, 0.06, a);
  }
  k.solid(0, 0, 0.5, 0.5, 1);
}

export function bench(k: Kit, x: number, z: number, rot: number, seats = 3) {
  k.at(x, z, rot);
  const w = seats * 0.55;
  k.box('steel', 0, 0.38, 0, w, 0.04, 0.5);
  for (let i = 0; i < seats; i++) {
    const lx = -w / 2 + 0.275 + i * 0.55;
    k.box('vinyl_orange', lx, 0.42, 0.02, 0.5, 0.06, 0.46);
    k.box('vinyl_orange', lx, 0.5, -0.22, 0.5, 0.42, 0.05, 0.1);
  }
  for (const s of [-1, 1]) {
    k.box('steel', (s * w) / 2.2, 0, -0.2, 0.05, 0.4, 0.05);
    k.box('steel', (s * w) / 2.2, 0, 0.2, 0.05, 0.4, 0.05);
  }
  k.solid(0, 0, w, 0.55, 0.9);
}

export function vending(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('plastic_red', 0, 0, 0, 0.9, 1.85, 0.8);
  k.box('glass', -0.12, 0.6, 0.401, 0.58, 1.1, 0.01);
  for (let r = 0; r < 5; r++)
    for (let c = 0; c < 4; c++) if (k.r() > 0.3) k.box(['plastic_yellow', 'plastic_blue', 'plastic_green', 'paper'][(r + c) % 4], -0.36 + c * 0.16, 0.66 + r * 0.2, 0.3, 0.1, 0.14, 0.1);
  k.box('plastic_dark', 0.3, 0.8, 0.405, 0.18, 0.5, 0.01);
  k.solid(0, 0, 0.9, 0.8, 1.85);
}

export function fountain(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('steel', 0, 0.7, 0.18, 0.45, 0.25, 0.36);
  k.box('steel', 0, 0.35, 0.05, 0.3, 0.35, 0.1);
  k.cyl('chrome', 0.05, 0.95, 0.25, 0.012, 0.05);
  k.solid(0, 0.18, 0.45, 0.36, 0.95);
}

export function extinguisher(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('paint_metal', 0, 1.0, 0.05, 0.32, 0.7, 0.1);
  k.cyl('plastic_red', 0, 1.06, 0.1, 0.07, 0.45, 10);
  k.box('plastic_dark', 0, 1.52, 0.1, 0.06, 0.08, 0.06);
}

export function wallClock(k: Kit, x: number, z: number, rot: number, y = 2.4) {
  k.at(x, z, rot);
  k.cyl('plastic_white', 0, y, 0.1, 0.16, 0.04, 16, 'z');
  k.decal('clock_face', 0, y, 0.125, 0.28, 0.28);
}

export function paperScatter(k: Kit, x: number, z: number, n: number, spread: number) {
  k.at(x, z, 0);
  for (let i = 0; i < n; i++) k.box('paper', (k.r() - 0.5) * spread, 0.002 + i * 0.0005, (k.r() - 0.5) * spread, 0.21, 0.002, 0.28, k.r() * 3, { aoFloor: false });
}

export function fallenTiles(k: Kit, x: number, z: number, n: number) {
  k.at(x, z, 0);
  for (let i = 0; i < n; i++) k.box('ceiling', (k.r() - 0.5) * 1.6, 0.01 + i * 0.012, (k.r() - 0.5) * 1.6, 0.6, 0.015, 0.6, k.r() * 3, { aoFloor: false });
}

export function wetSign(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('plastic_yellow', 0, 0, 0.1, 0.3, 0.62, 0.02, 0);
  k.box('plastic_yellow', 0, 0, -0.1, 0.3, 0.62, 0.02, 0);
  k.box('plastic_yellow', 0, 0.6, 0, 0.3, 0.03, 0.22);
}

// ───────────────────────────── 로비 ─────────────────────────────

export function receptionDesk(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('wood_light', 0, 0, 0, 4, 1.1, 0.6);
  k.box('wood_dark', 0, 1.1, 0.05, 4.1, 0.05, 0.75);
  k.box('wood_light', -2.3, 0, -0.9, 0.6, 1.1, 2.4);
  k.box('wood_dark', -2.3, 1.1, -0.9, 0.75, 0.05, 2.5);
  k.box('plastic_white', 0, 0.74, -0.5, 3.8, 0.04, 0.6);
  k.decal('center_sign', 0, 0.6, 0.31, 1.6, 0.4);
  k.solid(0, 0, 4.1, 0.75, 1.15);
  k.solid(-2.3, -0.9, 0.75, 2.5, 1.15);
  k.box('plastic_white', 0.6, 0.78, -0.55, 0.38, 0.32, 0.34);
  k.box('plastic_dark', 0.6, 0.81, -0.37, 0.3, 0.24, 0.005);
  k.box('plastic_dark', -0.6, 0.78, -0.5, 0.22, 0.06, 0.18);
}

/** 로비의 호피 스와피 '동상' (사실은 인형탈이 앉아 있는 받침대). 반환: 동상 메시 그룹 */
export function hoppyPedestal(k: Kit, x: number, z: number) {
  k.at(x, z, 0);
  k.cyl('terrazzo', 0, 0, 0, 1.3, 0.55, 16, 'y', 1.2);
  k.cyl('wood_dark', 0, 0.55, 0, 1.22, 0.05, 16);
  k.box('chrome', 0, 0.2, 1.31, 0.6, 0.18, 0.02);
  k.decal('hhh_logo', 0, 0.3, 1.33, 0.5, 0.25);
  k.solid(0, 0, 2.5, 2.5, 0.6);
}

export function payphone(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  // 3면 부스
  k.box('steel', -0.48, 0, 0, 0.04, 2.1, 0.8);
  k.box('steel', 0.48, 0, 0, 0.04, 2.1, 0.8);
  k.box('steel', 0, 0, -0.4, 1.0, 2.1, 0.04);
  k.box('steel', 0, 2.1, 0, 1.0, 0.06, 0.84);
  k.decal('home_scratch', 0, 1.05, -0.375, 0.9, 1.8);
  // 전화기
  k.box('chrome', 0, 1.1, -0.34, 0.22, 0.5, 0.1);
  k.box('plastic_dark', 0, 1.25, -0.285, 0.12, 0.14, 0.01);
  k.box('chrome', 0.08, 1.45, -0.3, 0.05, 0.06, 0.04);
  k.box('steel', 0, 0.9, -0.2, 0.6, 0.03, 0.3);
  k.solid(-0.48, 0, 0.06, 0.8, 2.1);
  k.solid(0.48, 0, 0.06, 0.8, 2.1);
  k.solid(0, -0.4, 1, 0.06, 2.1);
  // 매달린 수화기 (개별 메시)
  const cord = k.mesh(new THREE.CylinderGeometry(0.006, 0.006, 0.55, 4), 'plastic_dark', 0.0, 0.85, -0.25);
  const handset = k.mesh(new THREE.BoxGeometry(0.05, 0.2, 0.06), 'plastic_dark', 0.0, 0.5, -0.22);
  return { handset, cord, pos: k.worldPos(0, 0.55, -0.2) };
}

// ───────────────────────────── 놀이방 ─────────────────────────────

export function kidTable(k: Kit, x: number, z: number) {
  table(k, x, z, 0, 1.0, 0.7, 0.5, 'plastic_yellow');
  for (const [lx, lz, r] of [
    [-0.35, -0.55, 0],
    [0.35, -0.55, 0],
    [-0.35, 0.55, Math.PI],
    [0.35, 0.55, Math.PI],
  ])
    chair(k, x + lx, z + lz, r, ['plastic_red', 'plastic_blue', 'plastic_green', 'plastic_yellow'][Math.floor(k.r() * 4)], true);
}

export function ballPit(k: Kit, x: number, z: number, w: number, d: number) {
  k.at(x, z, 0);
  k.box('plastic_blue', 0, 0, -d / 2, w, 0.5, 0.1);
  k.box('plastic_blue', 0, 0, d / 2, w, 0.5, 0.1);
  k.box('plastic_blue', -w / 2, 0, 0, 0.1, 0.5, d);
  k.box('plastic_blue', w / 2, 0, 0, 0.1, 0.5, d);
  // 공 (인스턴스)
  const g = new THREE.SphereGeometry(0.06, 6, 4);
  const cols = ['ball_red', 'ball_blue', 'ball_yellow', 'ball_green'];
  for (const c of cols) {
    const n = Math.floor((w * d) / 0.03 / 4);
    const im = new THREE.InstancedMesh(g, mat(c, false).mat, n);
    const m = new THREE.Matrix4();
    for (let i = 0; i < n; i++) {
      const [wx, wz] = k.w((k.r() - 0.5) * (w - 0.2), (k.r() - 0.5) * (d - 0.2));
      m.makeTranslation(wx, 0.06 + k.r() * 0.3, wz);
      im.setMatrixAt(i, m);
    }
    im.receiveShadow = true;
    im.castShadow = false;
    k.parent.add(im);
  }
  k.solid(0, 0, w + 0.1, d + 0.1, 0.5);
}

export function toyBlocks(k: Kit, x: number, z: number, n: number) {
  k.at(x, z, 0);
  for (let i = 0; i < n; i++) {
    const s = 0.08 + k.r() * 0.05;
    k.box(['ball_red', 'ball_blue', 'ball_yellow', 'ball_green'][i % 4], (k.r() - 0.5) * 1.2, i < n / 2 ? 0 : s, (k.r() - 0.5) * 1.2, s, s, s, k.r() * 3);
  }
}

/** 호피의 건강 시간 무대 */
export function stage(k: Kit, x: number, z: number, rot: number, w: number, d: number) {
  k.at(x, z, rot);
  k.box('wood_floor', 0, 0, 0, w, 0.45, d, 0, { topKey: 'wood_floor' });
  k.box('plastic_yellow', 0, 0.42, d / 2 + 0.01, w, 0.04, 0.03);
  // 커튼
  for (const s of [-1, 1]) for (let i = 0; i < 6; i++) k.box('curtain_red', s * (w / 2 - 0.2 - i * 0.12), 0.45, -d / 2 + 0.3 + (i % 2) * 0.06, 0.14, 2.9, 0.04, s * 0.3);
  k.box('curtain_red', 0, 3.0, -d / 2 + 0.25, w, 0.45, 0.06);
  k.decal('hhh_logo', 0, 2.5, -d / 2 + 0.2, 2.4, 1.2);
  k.solid(0, 0, w, d, 0.45);
}

/** 모양 공방 (Shape Studio): 아이가 인형의 '새 모양'을 고르던 기계 */
export function shapeStudio(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  // 본체: 알록달록한 큰 장난감 상자 같은 기계
  k.box('plastic_white', 0, 0, 0, 2.6, 1.6, 1.2);
  k.box('plastic_pink', 0, 1.6, 0, 2.7, 0.15, 1.3);
  k.box('plastic_blue', -1.33, 0, 0, 0.06, 1.6, 1.2);
  k.box('plastic_blue', 1.33, 0, 0, 0.06, 1.6, 1.2);
  // 인형 틀 판넬 (앞면)
  const frame = k.decal('hoppy_frame', -0.45, 1.0, 0.61, 1.0, 1.0);
  // 조작반 (아이 키 높이)
  k.box('plastic_yellow', 0.85, 0.7, 0.45, 0.7, 0.12, 0.4, 0);
  for (let i = 0; i < 3; i++) k.cyl(['plastic_red', 'plastic_green', 'plastic_blue'][i], 0.65 + i * 0.2, 0.82, 0.5, 0.05, 0.04, 10);
  // 상품 배출구
  k.box('plastic_dark', 0.85, 0.15, 0.6, 0.5, 0.35, 0.04);
  // 꼭대기 간판
  k.decal('hhh_logo', 0, 2.05, 0.4, 1.4, 0.7);
  k.box('plastic_pink', 0, 1.75, 0.35, 1.5, 0.75, 0.05);
  // 기계 뒤 배선 (병원 장비로 이어진다)
  k.cyl('plastic_dark', -1.0, 0.1, -0.7, 0.04, 0.8, 6, 'z');
  k.cyl('plastic_dark', -0.8, 0.1, -0.75, 0.04, 0.9, 6, 'z');
  k.solid(0, 0, 2.7, 1.3, 1.75);
  return { frame, slotPos: k.worldPos(-0.45, 1.0, 0.7), panelPos: k.worldPos(0.85, 0.85, 0.6), outPos: k.worldPos(0.85, 0.3, 0.75) };
}

// ───────────────────────────── 세탁실 ─────────────────────────────

export function washer(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  k.box('steel', 0, 0, 0, 0.95, 1.4, 0.9);
  k.cyl('plastic_dark', 0, 0.7, 0.45, 0.3, 0.04, 16, 'z');
  k.cyl('glass', 0, 0.7, 0.47, 0.24, 0.02, 16, 'z');
  k.box('plastic_grey', 0, 1.2, 0.451, 0.85, 0.16, 0.01);
  k.solid(0, 0, 0.95, 0.9, 1.4);
}

export function laundryCart(k: Kit, x: number, z: number, rot: number, full = true) {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.4, -0.3],
    [0.4, -0.3],
    [-0.4, 0.3],
    [0.4, 0.3],
  ])
    k.cyl('rubber', lx, 0, lz, 0.05, 0.05, 8, 'x');
  k.box('steel', 0, 0.1, 0, 0.95, 0.03, 0.72);
  // 천 통 (뚜껑 없음)
  k.box('canvas_bin', 0, 0.13, -0.35, 0.92, 0.7, 0.02);
  k.box('canvas_bin', 0, 0.13, 0.35, 0.92, 0.7, 0.02);
  k.box('canvas_bin', -0.46, 0.13, 0, 0.02, 0.7, 0.7);
  k.box('canvas_bin', 0.46, 0.13, 0, 0.02, 0.7, 0.7);
  if (full) for (let i = 0; i < 6; i++) k.box(i % 2 ? 'linen' : 'gown', (k.r() - 0.5) * 0.6, 0.45 + k.r() * 0.3, (k.r() - 0.5) * 0.4, 0.4, 0.15, 0.3, k.r() * 3);
  k.solid(0, 0, 0.95, 0.72, 0.85);
}

// ───────────────────────────── 바깥 ─────────────────────────────

export function pine(k: Kit, x: number, z: number, h: number, y = 0) {
  k.at(x, z, k.r() * 6, y);
  k.cyl('bark', 0, 0, 0, 0.18 * (h / 9), h * 0.35, 6);
  const layers = 4;
  for (let i = 0; i < layers; i++) {
    const yy = h * 0.2 + (i * h * 0.75) / layers;
    const r = (1 - i / layers) * h * 0.22 + 0.3;
    const g = new THREE.ConeGeometry(r, h * 0.36, 7);
    const m = new THREE.Matrix4().makeTranslation(x, k.oy + yy + h * 0.18, z).multiply(new THREE.Matrix4().makeRotationY(k.r() * 6));
    k.b.geo(i % 2 ? 'pine' : 'pine_light', g, m, k.oy);
    g.dispose();
  }
  k.solid(0, 0, 0.5, 0.5, 4);
}

export function fence(k: Kit, x0: number, z0: number, x1: number, z1: number, h = 2.4) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const rot = Math.atan2(x1 - x0, z1 - z0);
  k.at((x0 + x1) / 2, (z0 + z1) / 2, rot);
  for (let a = -len / 2; a <= len / 2 + 0.01; a += 3) k.cyl('steel', 0, 0, a, 0.04, h);
  k.box('steel', 0, h, 0, 0.04, 0.04, len);
  k.box('chainlink', 0, 0.05, 0, 0.01, h - 0.05, len, 0, { aoFloor: false });
  // 꼭대기 철조망
  k.box('steel', 0, h + 0.18, 0, 0.02, 0.02, len);
  k.box('steel', 0, h + 0.32, 0, 0.02, 0.02, len);
  const dx = (x1 - x0) / len;
  const dz = (z1 - z0) / len;
  const segs = Math.ceil(len / 0.5);
  for (let i = 0; i < segs; i++) {
    const a0 = i * 0.5;
    k.level.segs.push({ x0: x0 + dx * a0, z0: z0 + dz * a0, x1: x0 + dx * Math.min(len, a0 + 0.5), z1: z0 + dz * Math.min(len, a0 + 0.5), group: k.group });
  }
}

export function lightPole(k: Kit, x: number, z: number, rot: number, h = 7, y = 0) {
  k.at(x, z, rot, y);
  k.cyl('steel', 0, 0, 0, 0.1, h, 8, 'y', 0.07);
  k.box('steel', 0, h - 0.1, 0.6, 0.12, 0.1, 1.2);
  k.box('plastic_dark', 0, h - 0.22, 1.1, 0.4, 0.14, 0.6);
  const lamp = k.mesh(new THREE.BoxGeometry(0.34, 0.02, 0.5), mat('amber', false).mat, 0, h - 0.235, 1.1);
  lamp.castShadow = false;
  k.solid(0, 0, 0.3, 0.3, h);
  return k.worldPos(0, h - 0.3, 1.1);
}

/** 1996년형 세단 (애시퍼드 박사의 차). 운전석 문이 열려 있다 */
export function sedan(k: Kit, x: number, z: number, rot: number, y = 0) {
  k.at(x, z, rot, y);
  for (const [lx, lz] of [
    [-0.78, -1.35],
    [0.78, -1.35],
    [-0.78, 1.35],
    [0.78, 1.35],
  ])
    k.cyl('rubber', lx, 0.32, lz, 0.32, 0.22, 12, 'x');
  k.box('car_paint', 0, 0.3, 0, 1.75, 0.55, 4.7);
  k.box('car_paint', 0, 0.85, -0.2, 1.6, 0.5, 2.4);
  k.box('glass', 0, 0.9, 1.02, 1.5, 0.4, 0.02, 0);
  k.box('glass', 0, 0.9, -1.42, 1.5, 0.4, 0.02, 0);
  k.box('glass', 0.81, 0.9, -0.2, 0.02, 0.38, 2.2);
  k.box('glass', -0.81, 0.9, -0.2, 0.02, 0.38, 2.2);
  k.box('chrome', 0, 0.3, 2.36, 1.7, 0.12, 0.05);
  k.box('chrome', 0, 0.3, -2.36, 1.7, 0.12, 0.05);
  k.box('headlight', -0.6, 0.48, 2.36, 0.35, 0.12, 0.02);
  k.box('headlight', 0.6, 0.48, 2.36, 0.35, 0.12, 0.02);
  k.box('red_led', -0.6, 0.48, -2.36, 0.35, 0.1, 0.02);
  k.box('red_led', 0.6, 0.48, -2.36, 0.35, 0.1, 0.02);
  // 열린 운전석 문
  k.box('car_paint', -1.35, 0.3, 0.55, 0.06, 0.95, 1.1, 1.05);
  k.box('vinyl_seat', -0.4, 0.55, 0.2, 0.55, 0.45, 0.55);
  k.solid(0, 0, 1.8, 4.8, 1.4);
  return k.worldPos(-0.3, 1.1, 0.1);
}

/** 앨더 카운티 구급차 (바깥). 반환: 경광등 위치들 */
export function ambulance(k: Kit, x: number, z: number, rot: number) {
  k.at(x, z, rot);
  for (const [lx, lz] of [
    [-0.95, -1.7],
    [0.95, -1.7],
    [-0.95, 1.6],
    [0.95, 1.6],
  ])
    k.cyl('rubber', lx, 0.38, lz, 0.38, 0.28, 12, 'x');
  // 환자실 상자
  k.box('white_paint', 0, 0.45, -0.9, 2.2, 2.2, 3.6);
  const side = k.decal('ambulance', 1.105, 1.5, -0.9, 3.2, 1.6, { r: Math.PI / 2 });
  void side;
  k.decal('ambulance', -1.105, 1.5, -0.9, 3.2, 1.6, { r: -Math.PI / 2 });
  // 운전석
  k.box('white_paint', 0, 0.45, 1.6, 2.0, 1.4, 1.4);
  k.box('white_paint', 0, 1.85, 1.3, 2.0, 0.55, 0.8);
  k.box('glass', 0, 1.6, 2.05, 1.8, 0.6, 0.04);
  k.box('plastic_dark', 0, 0.5, 2.31, 1.9, 0.35, 0.04);
  k.box('headlight', -0.7, 0.75, 2.33, 0.3, 0.18, 0.02);
  k.box('headlight', 0.7, 0.75, 2.33, 0.3, 0.18, 0.02);
  k.box('plastic_red', 0, 0.45, -2.71, 2.2, 0.1, 0.02);
  // 경광등 막대
  k.box('plastic_dark', 0, 2.4, 1.3, 1.6, 0.06, 0.3);
  const bar = [k.worldPos(-0.55, 2.55, 1.3), k.worldPos(0.55, 2.55, 1.3)];
  const lamps = [k.mesh(new THREE.BoxGeometry(0.45, 0.14, 0.26), mat('red_led', false).mat, -0.45, 2.53, 1.3), k.mesh(new THREE.BoxGeometry(0.45, 0.14, 0.26), mat('headlight', false).mat, 0.45, 2.53, 1.3)];
  k.solid(0, -0.4, 2.3, 5.2, 2.6);
  return { bar, lamps, headL: k.worldPos(-0.7, 0.75, 2.4), headR: k.worldPos(0.7, 0.75, 2.4), dir: new THREE.Vector3(Math.sin(rot), 0, Math.cos(rot)) };
}

/** 정문 기둥과 간판 */
export function gate(k: Kit, x: number, z: number) {
  k.at(x, z, 0);
  for (const s of [-1, 1]) {
    k.box('brick', s * 4.4, 0, 0, 0.8, 2.6, 0.8);
    k.box('concrete', s * 4.4, 2.6, 0, 0.95, 0.12, 0.95);
    k.solid(s * 4.4, 0, 0.8, 0.8, 2.6);
  }
  // 열린 철문 (안쪽으로 젖혀져 있다)
  k.box('steel', -3.6, 0.1, -1.2, 0.05, 1.9, 2.6, 0.3);
  k.box('steel', 3.6, 0.1, -1.2, 0.05, 1.9, 2.6, -0.3);
  // 간판 (오른쪽)
  k.at(x + 7.5, z + 0.5, -0.25);
  k.box('brick', 0, 0, 0, 3.6, 0.6, 0.5);
  k.box('steel', -1.5, 0.6, 0, 0.1, 1.7, 0.1);
  k.box('steel', 1.5, 0.6, 0, 0.1, 1.7, 0.1);
  k.box('wood_dark', 0, 0.9, 0, 3.4, 1.7, 0.12);
  k.decal('gate_sign', 0, 1.75, 0.065, 3.2, 1.6);
  k.solid(0, 0, 3.6, 0.6, 2.6);
}

export function tex2(name: string) {
  return tex(name);
}
