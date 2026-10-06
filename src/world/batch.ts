import * as THREE from 'three';
import { mat } from './materials';

/**
 * 정적 지오메트리 묶음. 재질별로 하나의 메시로 합쳐 그리기 호출을 줄인다.
 * 모든 정점에 색(가짜 앰비언트 오클루전)을 넣는다: 벽 아래·모서리·바닥 가장자리가 어둡다.
 * UV는 미터 단위 → 재질의 size로 나눈다.
 */

interface Part {
  pos: number[];
  nor: number[];
  uv: number[];
  col: number[];
  idx: number[];
}

export type V3 = [number, number, number];

export class Batch {
  private parts = new Map<string, Part>();
  castShadow = true;
  receiveShadow = true;

  private part(key: string) {
    let p = this.parts.get(key);
    if (!p) this.parts.set(key, (p = { pos: [], nor: [], uv: [], col: [], idx: [] }));
    return p;
  }

  /**
   * 사각형 하나. a→b→c→d는 앞면에서 보아 반시계.
   * uv는 미터 단위, col은 정점 밝기.
   */
  quad(key: string, a: V3, b: V3, c: V3, d: V3, n: V3, uv: [number, number][], col: number[] = [1, 1, 1, 1]) {
    const p = this.part(key);
    const [sx, sy] = mat(key).size;
    const base = p.pos.length / 3;
    for (const [i, v] of [a, b, c, d].entries()) {
      p.pos.push(v[0], v[1], v[2]);
      p.nor.push(n[0], n[1], n[2]);
      p.uv.push(uv[i][0] / sx, uv[i][1] / sy);
      const k = col[i];
      p.col.push(k, k, k);
    }
    p.idx.push(base, base + 1, base + 2, base, base + 2, base + 3);
  }

  /**
   * 세로 벽면. (x0,z0)→(x1,z1) 선 위, 법선은 오른쪽(진행 방향 기준 왼쪽이 아니라 바깥).
   * normal은 직접 준다. uOff는 벽을 따라가는 텍스처 시작 위치.
   * ao: 아래/위/양끝 어둡게.
   */
  wall(key: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, n: V3, uOff = 0, ao = { bottom: true, top: true, start: true, end: true }) {
    const len = Math.hypot(x1 - x0, z1 - z0);
    if (len < 1e-4 || y1 - y0 < 1e-4) return;
    const dx = (x1 - x0) / len;
    const dz = (z1 - z0) / len;
    // 세로 분할: 바닥 근처와 천장 근처를 어둡게
    const ys = [y0];
    const yc = [ao.bottom && y0 < 0.05 ? 0.58 : 1];
    if (ao.bottom && y0 < 0.05) {
      for (const [h, c] of [
        [0.12, 0.8],
        [0.55, 0.95],
      ] as [number, number][]) {
        if (h < y1 - 0.05) {
          ys.push(h);
          yc.push(c);
        }
      }
    }
    if (ao.top && y1 - 0.45 > ys[ys.length - 1] + 0.05) {
      ys.push(y1 - 0.45);
      yc.push(1);
    }
    ys.push(y1);
    yc.push(ao.top ? 0.72 : 1);
    // 가로 분할: 모서리 어둡게
    const us = [0];
    const uc = [ao.start ? 0.74 : 1];
    if (len > 1) {
      us.push(0.45, len - 0.45);
      uc.push(1, 1);
    }
    us.push(len);
    uc.push(ao.end ? 0.74 : 1);
    for (let j = 0; j < ys.length - 1; j++) {
      for (let i = 0; i < us.length - 1; i++) {
        const ua = us[i];
        const ub = us[i + 1];
        const ya = ys[j];
        const yb = ys[j + 1];
        const A: V3 = [x0 + dx * ua, ya, z0 + dz * ua];
        const B: V3 = [x0 + dx * ub, ya, z0 + dz * ub];
        const C: V3 = [x0 + dx * ub, yb, z0 + dz * ub];
        const D: V3 = [x0 + dx * ua, yb, z0 + dz * ua];
        // 앞면 방향 맞추기: 법선과 (B-A)×(D-A) 비교
        const cx = (B[1] - A[1]) * (D[2] - A[2]) - (B[2] - A[2]) * (D[1] - A[1]);
        const cz = (B[0] - A[0]) * (D[1] - A[1]) - (B[1] - A[1]) * (D[0] - A[0]);
        const flip = cx * n[0] + cz * n[2] < 0;
        const uvs: [number, number][] = [
          [uOff + ua, ya],
          [uOff + ub, ya],
          [uOff + ub, yb],
          [uOff + ua, yb],
        ];
        const cols = [yc[j] * uc[i], yc[j] * uc[i + 1], yc[j + 1] * uc[i + 1], yc[j + 1] * uc[i]];
        if (!flip) this.quad(key, A, B, C, D, n, uvs, cols);
        else
          this.quad(key, B, A, D, C, n, [uvs[1], uvs[0], uvs[3], uvs[2]], [cols[1], cols[0], cols[3], cols[2]]);
      }
    }
  }

  /**
   * 바닥/천장. 격자로 나누고 aoFn(x,z)로 정점 밝기를 정한다.
   */
  flat(key: string, x0: number, z0: number, x1: number, z1: number, y: number, up: boolean, aoFn?: (x: number, z: number) => number, step = 1) {
    const xs = gridLines(x0, x1, step);
    const zs = gridLines(z0, z1, step);
    const p = this.part(key);
    const [sx, sy] = mat(key).size;
    const base = p.pos.length / 3;
    for (const z of zs)
      for (const x of xs) {
        p.pos.push(x, y, z);
        p.nor.push(0, up ? 1 : -1, 0);
        p.uv.push(x / sx, -z / sy);
        const k = aoFn ? aoFn(x, z) : 1;
        p.col.push(k, k, k);
      }
    const W = xs.length;
    for (let j = 0; j < zs.length - 1; j++)
      for (let i = 0; i < W - 1; i++) {
        const a = base + j * W + i;
        const b = a + 1;
        const c = a + W + 1;
        const d = a + W;
        if (up) p.idx.push(a, d, c, a, c, b);
        else p.idx.push(a, b, c, a, c, d);
      }
  }

  /** 상자 (y0 = 바닥). rotY 라디안. 바닥에 닿은 아래 정점은 어둡게 */
  box(key: string, cx: number, y0: number, cz: number, sx: number, sy: number, sz: number, rotY = 0, opts: { noBottom?: boolean; noTop?: boolean; aoFloor?: boolean; topKey?: string } = {}) {
    const c = Math.cos(rotY);
    const s = Math.sin(rotY);
    const P = (lx: number, ly: number, lz: number): V3 => [cx + lx * c + lz * s, y0 + ly, cz - lx * s + lz * c];
    const N = (lx: number, ly: number, lz: number): V3 => [lx * c + lz * s, ly, -lx * s + lz * c];
    const hx = sx / 2;
    const hz = sz / 2;
    const floorAO = opts.aoFloor !== false && y0 < 0.05 ? 0.62 : 0.92;
    const top = 1;
    // 옆면 4개
    const sides: [V3, V3, V3, V3, V3, number][] = [
      [P(-hx, 0, hz), P(hx, 0, hz), P(hx, sy, hz), P(-hx, sy, hz), N(0, 0, 1), sx],
      [P(hx, 0, -hz), P(-hx, 0, -hz), P(-hx, sy, -hz), P(hx, sy, -hz), N(0, 0, -1), sx],
      [P(hx, 0, hz), P(hx, 0, -hz), P(hx, sy, -hz), P(hx, sy, hz), N(1, 0, 0), sz],
      [P(-hx, 0, -hz), P(-hx, 0, hz), P(-hx, sy, hz), P(-hx, sy, -hz), N(-1, 0, 0), sz],
    ];
    for (const [a, b, cc, d, n, w] of sides)
      this.quad(
        key,
        a,
        b,
        cc,
        d,
        n,
        [
          [0, 0],
          [w, 0],
          [w, sy],
          [0, sy],
        ],
        [floorAO, floorAO, top, top],
      );
    if (!opts.noTop)
      this.quad(
        opts.topKey ?? key,
        P(-hx, sy, hz),
        P(hx, sy, hz),
        P(hx, sy, -hz),
        P(-hx, sy, -hz),
        N(0, 1, 0),
        [
          [0, 0],
          [sx, 0],
          [sx, sz],
          [0, sz],
        ],
      );
    if (!opts.noBottom && y0 > 0.02)
      this.quad(
        key,
        P(-hx, 0, -hz),
        P(hx, 0, -hz),
        P(hx, 0, hz),
        P(-hx, 0, hz),
        N(0, -1, 0),
        [
          [0, 0],
          [sx, 0],
          [sx, sz],
          [0, sz],
        ],
        [0.7, 0.7, 0.7, 0.7],
      );
  }

  /** 임의 지오메트리(원기둥 등)를 행렬로 옮겨 넣는다. 높이에 따라 아래쪽을 어둡게 */
  geo(key: string, g: THREE.BufferGeometry, m: THREE.Matrix4, floorY = 0, uvScale = 1) {
    const p = this.part(key);
    const geo = g.index ? g : g;
    const pos = geo.getAttribute('position');
    const nor = geo.getAttribute('normal');
    const uv = geo.getAttribute('uv');
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    const v = new THREE.Vector3();
    const base = p.pos.length / 3;
    for (let i = 0; i < pos.count; i++) {
      v.fromBufferAttribute(pos, i).applyMatrix4(m);
      p.pos.push(v.x, v.y, v.z);
      const y = v.y;
      v.fromBufferAttribute(nor, i).applyMatrix3(nm).normalize();
      p.nor.push(v.x, v.y, v.z);
      if (uv) p.uv.push(uv.getX(i) * uvScale, uv.getY(i) * uvScale);
      else p.uv.push(0, 0);
      const k = Math.min(1, 0.62 + Math.max(0, y - floorY) * 0.9);
      p.col.push(k, k, k);
    }
    if (geo.index) for (let i = 0; i < geo.index.count; i++) p.idx.push(base + geo.index.getX(i));
    else for (let i = 0; i < pos.count; i++) p.idx.push(base + i);
  }

  build(name = 'batch'): THREE.Group {
    const group = new THREE.Group();
    group.name = name;
    for (const [key, p] of this.parts) {
      if (!p.idx.length) continue;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute(p.pos, 3));
      g.setAttribute('normal', new THREE.Float32BufferAttribute(p.nor, 3));
      g.setAttribute('uv', new THREE.Float32BufferAttribute(p.uv, 2));
      g.setAttribute('color', new THREE.Float32BufferAttribute(p.col, 3));
      g.setIndex(p.idx);
      g.computeBoundingSphere();
      g.computeBoundingBox();
      const m = new THREE.Mesh(g, mat(key).mat);
      m.name = key;
      const def = mat(key).mat as THREE.Material & { transparent?: boolean };
      m.castShadow = this.castShadow && !def.transparent && !(def instanceof THREE.MeshBasicMaterial);
      m.receiveShadow = this.receiveShadow && !(def instanceof THREE.MeshBasicMaterial);
      m.matrixAutoUpdate = false;
      m.updateMatrix();
      group.add(m);
    }
    this.parts.clear();
    return group;
  }
}

function gridLines(a: number, b: number, step: number) {
  const out = [a];
  let v = Math.floor(a / step) * step + step;
  while (v < b - 1e-3) {
    if (v > a + 1e-3) out.push(v);
    v += step;
  }
  out.push(b);
  return out;
}
