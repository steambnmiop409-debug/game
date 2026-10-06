import * as THREE from 'three';
import { rng } from '../core/util';

/**
 * 절차적 텍스처 (캔버스 → 최근접 필터).
 * 정해진 크기 단계(32·64·128·256)만 쓴다 (06_ART A2.2).
 * 벽의 글씨는 영어(현지 그대로), 살피기 자막은 한국어 (A3.4).
 */

type G = CanvasRenderingContext2D;
type R = () => number;

const cache = new Map<string, THREE.Texture>();

export function canvasTex(w: number, h: number, draw: (g: G, r: R) => void, seed = 1, repeat = true): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  g.imageSmoothingEnabled = false;
  draw(g, rng(seed));
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.NearestMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 4;
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function tex(name: string): THREE.Texture {
  let t = cache.get(name);
  if (!t) {
    const def = DEFS[name];
    if (!def) throw new Error(`텍스처 없음: ${name}`);
    t = def();
    cache.set(name, t);
  }
  return t;
}

// ───────────────────────────── 그리기 도우미 ─────────────────────────────

export function hex(c: string, k = 1, a = 1) {
  const n = parseInt(c.slice(1), 16);
  const r = Math.min(255, Math.round(((n >> 16) & 255) * k));
  const gg = Math.min(255, Math.round(((n >> 8) & 255) * k));
  const b = Math.min(255, Math.round((n & 255) * k));
  return a < 1 ? `rgba(${r},${gg},${b},${a})` : `rgb(${r},${gg},${b})`;
}

/** 픽셀 단위 밝기 잡음 */
function grain(g: G, amt: number, r: R, x = 0, y = 0, w = g.canvas.width, h = g.canvas.height) {
  const img = g.getImageData(x, y, w, h);
  const d = img.data;
  for (let i = 0; i < d.length; i += 4) {
    const n = (r() - 0.5) * amt * 255;
    d[i] = Math.max(0, Math.min(255, d[i] + n));
    d[i + 1] = Math.max(0, Math.min(255, d[i + 1] + n));
    d[i + 2] = Math.max(0, Math.min(255, d[i + 2] + n));
  }
  g.putImageData(img, x, y);
}

/** 낮은 주파수 얼룩 (낡음) */
function blotch(g: G, r: R, count: number, color: string, maxR: number, alpha = 0.08) {
  const W = g.canvas.width;
  const H = g.canvas.height;
  for (let i = 0; i < count; i++) {
    const x = r() * W;
    const y = r() * H;
    const rad = 2 + r() * maxR;
    g.fillStyle = hex(color, 1, alpha * (0.4 + r() * 0.6));
    g.beginPath();
    g.ellipse(x, y, rad, rad * (0.5 + r()), r() * 3, 0, Math.PI * 2);
    g.fill();
  }
}

function fill(g: G, c: string) {
  g.fillStyle = c;
  g.fillRect(0, 0, g.canvas.width, g.canvas.height);
}

function rect(g: G, x: number, y: number, w: number, h: number, c: string) {
  g.fillStyle = c;
  g.fillRect(x, y, w, h);
}

function text(g: G, s: string, x: number, y: number, size: number, color: string, opts: { font?: string; align?: CanvasTextAlign; weight?: string; maxW?: number } = {}) {
  g.fillStyle = color;
  g.font = `${opts.weight ?? 'bold'} ${size}px ${opts.font ?? '"Arial Black", Arial, Helvetica, sans-serif'}`;
  g.textAlign = opts.align ?? 'center';
  g.textBaseline = 'middle';
  g.fillText(s, x, y, opts.maxW);
}

function wrapText(g: G, s: string, x: number, y: number, size: number, lh: number, maxW: number, color: string, font?: string) {
  g.font = `bold ${size}px ${font ?? 'Arial, Helvetica, sans-serif'}`;
  const words = s.split(' ');
  let line = '';
  let yy = y;
  for (const w of words) {
    const t = line ? line + ' ' + w : w;
    if (g.measureText(t).width > maxW && line) {
      text(g, line, x, yy, size, color, { font });
      line = w;
      yy += lh;
    } else line = t;
  }
  if (line) text(g, line, x, yy, size, color, { font });
}

/** 크레용 선 */
function crayon(g: G, r: R, pts: [number, number][], color: string, w = 2) {
  g.strokeStyle = color;
  g.lineWidth = w;
  g.lineCap = 'round';
  for (let pass = 0; pass < 2; pass++) {
    g.beginPath();
    pts.forEach(([x, y], i) => {
      const jx = x + (r() - 0.5) * 1.5;
      const jy = y + (r() - 0.5) * 1.5;
      if (i === 0) g.moveTo(jx, jy);
      else g.lineTo(jx, jy);
    });
    g.stroke();
  }
}

/** 호피 스와피 (정상 시절의 귀여운 모습) */
export function drawHoppy(g: G, cx: number, cy: number, s: number, swapped = false) {
  const pink = '#ec9fb6';
  const dark = '#a8546f';
  const light = '#f9d3de';
  g.lineWidth = Math.max(1, s * 0.06);
  g.strokeStyle = dark;
  const ell = (x: number, y: number, rx: number, ry: number, c: string, rot = 0) => {
    g.fillStyle = c;
    g.beginPath();
    g.ellipse(cx + x * s, cy + y * s, rx * s, ry * s, rot, 0, Math.PI * 2);
    g.fill();
    g.stroke();
  };
  if (!swapped) {
    ell(-0.35, -1.25, 0.16, 0.5, pink, -0.15);
    ell(0.35, -1.25, 0.16, 0.5, pink, 0.15);
    ell(-0.35, -1.2, 0.07, 0.35, light, -0.15);
    ell(0.35, -1.2, 0.07, 0.35, light, 0.15);
  } else {
    // 귀 자리에 팔
    ell(-0.35, -1.25, 0.12, 0.42, pink, 0.4);
    ell(0.35, -1.25, 0.12, 0.42, pink, -0.4);
    ell(-0.5, -1.6, 0.12, 0.1, light);
    ell(0.5, -1.6, 0.12, 0.1, light);
  }
  ell(0, 0.55, 0.55, 0.6, pink);
  ell(0, 0.6, 0.32, 0.4, light);
  if (!swapped) {
    ell(-0.6, 0.35, 0.14, 0.32, pink, 0.5);
    ell(0.6, 0.35, 0.14, 0.32, pink, -0.5);
  }
  ell(-0.25, 1.1, 0.2, 0.12, pink);
  ell(0.25, 1.1, 0.2, 0.12, pink);
  ell(0, -0.45, 0.48, 0.42, pink);
  // 눈, 코, 웃음
  g.fillStyle = '#1b1416';
  g.beginPath();
  g.arc(cx - 0.17 * s, cy - 0.5 * s, 0.07 * s, 0, Math.PI * 2);
  g.arc(cx + 0.17 * s, cy - 0.5 * s, 0.07 * s, 0, Math.PI * 2);
  g.fill();
  g.fillStyle = '#fff';
  g.fillRect(cx - 0.19 * s, cy - 0.54 * s, Math.max(1, 0.03 * s), Math.max(1, 0.03 * s));
  g.fillRect(cx + 0.15 * s, cy - 0.54 * s, Math.max(1, 0.03 * s), Math.max(1, 0.03 * s));
  g.fillStyle = dark;
  g.beginPath();
  g.ellipse(cx, cy - 0.36 * s, 0.06 * s, 0.04 * s, 0, 0, Math.PI * 2);
  g.fill();
  g.beginPath();
  g.arc(cx, cy - 0.3 * s, 0.15 * s, 0.2, Math.PI - 0.2);
  g.stroke();
}

// ───────────────────────────── 정의 ─────────────────────────────

function paint(color: string, seed: number) {
  return () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, color);
        blotch(g, r, 10, '#000000', 14, 0.035);
        blotch(g, r, 6, '#ffffff', 10, 0.03);
        grain(g, 0.045, r);
      },
      seed,
    );
}

function lino(base: string, alt: string, accent: string, seed: number) {
  return () =>
    canvasTex(
      128,
      128,
      (g, r) => {
        for (let ty = 0; ty < 4; ty++)
          for (let tx = 0; tx < 4; tx++) {
            const pick = r();
            const c = pick < 0.08 ? accent : pick < 0.45 ? alt : base;
            rect(g, tx * 32, ty * 32, 32, 32, hex(c, 0.97 + r() * 0.06));
            // 비닐 타일의 반점
            for (let k = 0; k < 70; k++) {
              rect(g, tx * 32 + Math.floor(r() * 32), ty * 32 + Math.floor(r() * 32), 1, 1, hex(c, r() < 0.5 ? 0.82 : 1.08));
            }
            for (let k = 0; k < 6; k++) rect(g, tx * 32 + Math.floor(r() * 31), ty * 32 + Math.floor(r() * 31), 2, 1, hex(c, 0.7));
          }
        // 줄눈
        for (let i = 0; i < 4; i++) {
          rect(g, i * 32, 0, 1, 128, hex(base, 0.78, 0.8));
          rect(g, 0, i * 32, 128, 1, hex(base, 0.78, 0.8));
        }
        // 닳은 자국
        g.strokeStyle = 'rgba(40,32,24,0.07)';
        g.lineWidth = 1;
        for (let k = 0; k < 14; k++) {
          const x = r() * 128;
          const y = r() * 128;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 18, y + (r() - 0.5) * 6);
          g.stroke();
        }
        blotch(g, r, 8, '#3a3020', 20, 0.04);
        grain(g, 0.03, r);
      },
      seed,
    );
}

const DEFS: Record<string, () => THREE.Texture> = {
  // ── 바닥 ──
  lino: lino('#d8d1bd', '#cfc6af', '#a9cbbb', 11),
  lino_blue: lino('#c9d3d6', '#bfc9cc', '#e2d39a', 12),
  lino_dark: lino('#9d9a8e', '#8f8c80', '#6f8a80', 13),
  tile_white: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#9fa3a2');
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rect(g, x * 16 + 1, y * 16 + 1, 15, 15, hex('#e6e9e8', 0.96 + r() * 0.05));
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rect(g, x * 16 + 2, y * 16 + 2, 4, 1, 'rgba(255,255,255,0.6)');
        grain(g, 0.025, r);
      },
      14,
    ),
  tile_floor: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#7f8483');
        for (let y = 0; y < 8; y++) for (let x = 0; x < 8; x++) rect(g, x * 8 + 1, y * 8 + 1, 7, 7, hex(r() < 0.1 ? '#b9cbd0' : '#d8dcdb', 0.94 + r() * 0.08));
        blotch(g, r, 6, '#40382a', 10, 0.05);
        grain(g, 0.03, r);
      },
      15,
    ),
  carpet: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#4b5a68');
        for (let i = 0; i < 1400; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, hex('#4b5a68', 0.75 + r() * 0.5));
        for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 4 : 0; x < 64; x += 8) rect(g, x, y, 2, 2, '#5d6d7d');
        blotch(g, r, 5, '#000000', 12, 0.05);
      },
      16,
    ),
  terrazzo: () =>
    canvasTex(
      128,
      128,
      (g, r) => {
        fill(g, '#c4bba8');
        const chips = ['#5d5a55', '#8d5a43', '#e9e5dc', '#6f8a78', '#3b3a38', '#b49a6c'];
        for (let i = 0; i < 900; i++) {
          const c = chips[Math.floor(r() * chips.length)];
          const s = 1 + Math.floor(r() * 3);
          rect(g, Math.floor(r() * 128), Math.floor(r() * 128), s, Math.max(1, s - 1), hex(c, 0.9 + r() * 0.2));
        }
        // 놋쇠 줄눈
        rect(g, 0, 0, 128, 2, '#a88742');
        rect(g, 0, 0, 2, 128, '#a88742');
        rect(g, 0, 2, 128, 1, 'rgba(0,0,0,0.15)');
        blotch(g, r, 10, '#3a3020', 24, 0.05);
        grain(g, 0.03, r);
      },
      17,
    ),
  foam: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        const cols = ['#c25b56', '#d8b44a', '#4e7fb0', '#5f9b62'];
        for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) rect(g, x * 32, y * 32, 32, 32, cols[(x + y * 2 + Math.floor(r() * 2)) % 4]);
        // 퍼즐 이음새
        g.fillStyle = 'rgba(0,0,0,0.25)';
        for (let i = 0; i < 2; i++) {
          rect(g, 31, i * 32, 2, 32, 'rgba(0,0,0,0.25)');
          rect(g, i * 32, 31, 32, 2, 'rgba(0,0,0,0.25)');
          g.beginPath();
          g.arc(32, i * 32 + 16, 4, 0, Math.PI * 2);
          g.arc(i * 32 + 16, 32, 4, 0, Math.PI * 2);
          g.fill();
        }
        blotch(g, r, 6, '#000000', 10, 0.06);
        grain(g, 0.05, r);
      },
      18,
    ),
  asphalt: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#2f3132');
        for (let i = 0; i < 900; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, hex('#2f3132', 0.6 + r() * 0.9));
        blotch(g, r, 6, '#000000', 14, 0.1);
        g.strokeStyle = 'rgba(0,0,0,0.35)';
        g.beginPath();
        g.moveTo(r() * 64, 0);
        for (let i = 1; i < 6; i++) g.lineTo(r() * 64, i * 13);
        g.stroke();
      },
      19,
    ),
  road: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#2b2d2e');
        for (let i = 0; i < 900; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, hex('#2b2d2e', 0.6 + r() * 0.9));
        rect(g, 30, 0, 2, 64, '#b89a3a');
        rect(g, 33, 0, 2, 64, '#b89a3a');
        rect(g, 1, 0, 2, 64, '#9a9a94');
        rect(g, 61, 0, 2, 64, '#9a9a94');
      },
      20,
    ),
  grass: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#39402a');
        for (let i = 0; i < 1600; i++) {
          const c = r() < 0.4 ? '#5b5233' : r() < 0.5 ? '#2c3420' : '#4a5232';
          rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1 + Math.floor(r() * 2), c);
        }
      },
      21,
    ),
  leaves: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        g.clearRect(0, 0, 64, 64);
        const cols = ['#7a4a22', '#9a6a2a', '#5a3a1a', '#8a5a2a'];
        for (let i = 0; i < 28; i++) {
          g.fillStyle = cols[Math.floor(r() * 4)];
          g.beginPath();
          g.ellipse(r() * 64, r() * 64, 2 + r() * 2, 1 + r(), r() * 3, 0, Math.PI * 2);
          g.fill();
        }
      },
      22,
      false,
    ),
  wood_floor: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        for (let y = 0; y < 4; y++) {
          const c = hex('#8a6440', 0.85 + r() * 0.3);
          rect(g, 0, y * 16, 64, 16, c);
          for (let k = 0; k < 10; k++) rect(g, Math.floor(r() * 64), y * 16 + 1 + Math.floor(r() * 14), 6 + Math.floor(r() * 14), 1, hex('#5a4028', 0.9 + r() * 0.3, 0.6));
          rect(g, 0, y * 16, 64, 1, '#3a2818');
          rect(g, Math.floor(r() * 64), y * 16, 1, 16, '#3a2818');
        }
        grain(g, 0.04, r);
      },
      23,
    ),
  concrete: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#8a8a86');
        for (let i = 0; i < 500; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, hex('#8a8a86', 0.7 + r() * 0.5));
        blotch(g, r, 12, '#2a2620', 14, 0.08);
        grain(g, 0.05, r);
      },
      24,
    ),
  metal_floor: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#6d7273');
        for (let y = 0; y < 64; y += 8) for (let x = (y / 8) % 2 ? 0 : 4; x < 64; x += 8) {
          rect(g, x, y + 2, 4, 1, '#9aa0a1');
          rect(g, x, y + 3, 4, 1, '#4a4e50');
        }
        grain(g, 0.04, r);
      },
      25,
    ),

  // ── 천장 ──
  ceiling: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#d2cec2');
        // 흡음 텍스 천장의 틈새 무늬
        for (let i = 0; i < 90; i++) {
          const x = r() * 60;
          const y = r() * 60;
          g.strokeStyle = hex('#9e9a8e', 0.9 + r() * 0.2);
          g.lineWidth = 1;
          g.beginPath();
          g.moveTo(x, y);
          g.lineTo(x + (r() - 0.5) * 5, y + (r() - 0.5) * 5);
          g.stroke();
        }
        for (let i = 0; i < 200; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, '#b9b5a9');
        // T바
        rect(g, 0, 0, 64, 2, '#e4e1d8');
        rect(g, 0, 0, 2, 64, '#e4e1d8');
        rect(g, 0, 2, 64, 1, 'rgba(0,0,0,0.18)');
        rect(g, 2, 0, 1, 64, 'rgba(0,0,0,0.18)');
        grain(g, 0.02, r);
      },
      30,
    ),
  ceiling_stain: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        g.clearRect(0, 0, 64, 64);
        for (let k = 0; k < 3; k++) {
          g.strokeStyle = `rgba(120,90,40,${0.25 + k * 0.1})`;
          g.lineWidth = 2;
          g.beginPath();
          g.ellipse(32, 32, 26 - k * 7 + r() * 3, 22 - k * 6, r(), 0, Math.PI * 2);
          g.stroke();
          g.fillStyle = `rgba(140,110,50,0.12)`;
          g.fill();
        }
      },
      31,
      false,
    ),

  // ── 벽 ──
  paint_mint: paint('#a6c9bb', 40),
  paint_sky: paint('#a8c1d5', 41),
  paint_yellow: paint('#ddd19c', 42),
  paint_cream: paint('#dbd3bf', 43),
  paint_pink: paint('#dcb6b6', 44),
  paint_white: paint('#e4e7e6', 45),
  paint_grey: paint('#8f9696', 46),
  paint_lav: paint('#bdb3cf', 47),
  wainscot: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#b9a07c');
        for (let x = 0; x < 64; x += 16) {
          rect(g, x, 0, 1, 64, '#7a6243');
          rect(g, x + 1, 0, 1, 64, '#cdb690');
        }
        for (let k = 0; k < 40; k++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 4 + Math.floor(r() * 10), hex('#9a8060', 0.9 + r() * 0.2, 0.5));
        // 의자 손잡이 레일
        rect(g, 0, 0, 64, 5, '#6d5236');
        rect(g, 0, 1, 64, 1, '#9c7a52');
        rect(g, 0, 5, 64, 1, '#3a2a1a');
        // 아래 걸레받이
        rect(g, 0, 58, 64, 6, '#3d3b38');
        rect(g, 0, 58, 64, 1, '#6a6762');
        blotch(g, r, 8, '#2a2010', 10, 0.06);
        grain(g, 0.04, r);
      },
      50,
    ),
  wainscot_mint: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#7fae9e');
        for (let x = 0; x < 64; x += 32) rect(g, x, 0, 1, 64, '#5f8b7c');
        rect(g, 0, 0, 64, 5, '#d8d8cf');
        rect(g, 0, 5, 64, 1, '#5b6a64');
        rect(g, 0, 58, 64, 6, '#3d3b38');
        // 아이들 손자국 (2001년의 흔적)
        for (let k = 0; k < 3; k++) {
          const x = r() * 56;
          const y = 20 + r() * 25;
          g.fillStyle = 'rgba(40,40,30,0.08)';
          g.beginPath();
          g.ellipse(x, y, 3, 4, 0, 0, Math.PI * 2);
          g.fill();
        }
        blotch(g, r, 8, '#203028', 10, 0.06);
        grain(g, 0.04, r);
      },
      51,
    ),
  wall_tile: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#a9adac');
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rect(g, x * 16 + 1, y * 16 + 1, 15, 15, hex('#e9ecea', 0.96 + r() * 0.05));
        for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) rect(g, x * 16 + 2, y * 16 + 2, 1, 6, 'rgba(255,255,255,0.7)');
        grain(g, 0.02, r);
      },
      52,
    ),
  concrete_wall: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#8e8f88');
        for (let y = 0; y < 64; y += 16) {
          rect(g, 0, y, 64, 1, '#6c6d66');
          for (let x = (y / 16) % 2 ? 0 : 16; x < 64; x += 32) rect(g, x, y, 1, 16, '#6c6d66');
        }
        for (let i = 0; i < 500; i++) rect(g, Math.floor(r() * 64), Math.floor(r() * 64), 1, 1, hex('#8e8f88', 0.75 + r() * 0.5));
        blotch(g, r, 10, '#30281e', 14, 0.08);
      },
      53,
    ),
  mural: () =>
    canvasTex(
      256,
      64,
      (g, r) => {
        // 하늘색 벽 위의 언덕과 해, 토끼 (정상 시절의 다정함)
        fill(g, '#a8c1d5');
        g.fillStyle = '#f0d77a';
        g.beginPath();
        g.arc(40, 18, 10, 0, Math.PI * 2);
        g.fill();
        for (let k = 0; k < 8; k++) {
          g.strokeStyle = '#f0d77a';
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(40 + Math.cos(k) * 13, 18 + Math.sin(k) * 13);
          g.lineTo(40 + Math.cos(k) * 18, 18 + Math.sin(k) * 18);
          g.stroke();
        }
        g.fillStyle = '#8fbf86';
        g.beginPath();
        g.moveTo(0, 64);
        for (let x = 0; x <= 256; x += 8) g.lineTo(x, 46 + Math.sin(x / 30) * 8 + Math.sin(x / 11) * 2);
        g.lineTo(256, 64);
        g.fill();
        g.fillStyle = '#76a86e';
        g.beginPath();
        g.moveTo(0, 64);
        for (let x = 0; x <= 256; x += 8) g.lineTo(x, 54 + Math.sin(x / 19 + 2) * 5);
        g.lineTo(256, 64);
        g.fill();
        for (const x of [100, 160, 215]) drawHoppy(g, x, 40, 7);
        g.fillStyle = '#fff';
        for (let k = 0; k < 4; k++) {
          const cx = 120 + k * 35 + r() * 10;
          g.beginPath();
          g.ellipse(cx, 12 + r() * 6, 10, 4, 0, 0, Math.PI * 2);
          g.fill();
        }
        blotch(g, r, 10, '#000000', 16, 0.04);
        grain(g, 0.04, r);
      },
      54,
    ),
  tissue: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        // 조직: 촉촉하지 않다. 건강한 아이의 피부처럼 매끈하고 보송하다 (A1.4)
        fill(g, '#e2b39b');
        blotch(g, r, 30, '#c98d77', 14, 0.12);
        blotch(g, r, 20, '#f2cdb9', 10, 0.15);
        // 손바닥 자국
        for (let k = 0; k < 2; k++) {
          const x = 10 + r() * 44;
          const y = 10 + r() * 44;
          g.fillStyle = 'rgba(180,120,100,0.18)';
          g.beginPath();
          g.ellipse(x, y, 4, 5, 0, 0, Math.PI * 2);
          g.fill();
          for (let f = 0; f < 4; f++) {
            g.beginPath();
            g.ellipse(x - 4 + f * 2.6, y - 7, 1, 2.5, 0, 0, Math.PI * 2);
            g.fill();
          }
        }
        grain(g, 0.025, r);
      },
      55,
    ),

  // ── 문 ──
  door_wood: () =>
    canvasTex(
      64,
      128,
      (g, r) => {
        fill(g, '#b88d5d');
        for (let k = 0; k < 60; k++) rect(g, Math.floor(r() * 64), Math.floor(r() * 128), 1, 8 + Math.floor(r() * 30), hex('#8f6a42', 0.9 + r() * 0.2, 0.45));
        // 좁은 유리창
        rect(g, 40, 18, 12, 40, '#2a3236');
        rect(g, 40, 18, 12, 1, '#151a1c');
        rect(g, 41, 19, 2, 38, 'rgba(160,190,200,0.35)');
        rect(g, 39, 17, 14, 1, '#7a5a38');
        // 미는 판, 발판
        rect(g, 6, 62, 8, 14, '#b8b8b2');
        rect(g, 0, 112, 64, 16, '#a7a9a5');
        rect(g, 0, 112, 64, 1, '#d8dad6');
        blotch(g, r, 8, '#2a2010', 10, 0.07);
        grain(g, 0.04, r);
      },
      60,
      false,
    ),
  door_metal: () =>
    canvasTex(
      64,
      128,
      (g, r) => {
        fill(g, '#7c8584');
        rect(g, 4, 4, 56, 120, '#86908f');
        rect(g, 4, 4, 56, 1, '#a3adac');
        rect(g, 0, 112, 64, 16, '#5d6463');
        blotch(g, r, 10, '#3a2a18', 10, 0.1);
        grain(g, 0.05, r);
      },
      61,
      false,
    ),
  door_white: () =>
    canvasTex(
      64,
      128,
      (g, r) => {
        fill(g, '#dfe3e2');
        rect(g, 8, 14, 48, 34, '#9fb3b8');
        rect(g, 8, 14, 48, 1, '#6d7a7d');
        rect(g, 10, 16, 6, 30, 'rgba(255,255,255,0.4)');
        rect(g, 0, 112, 64, 16, '#b9bfbe');
        grain(g, 0.02, r);
      },
      62,
      false,
    ),
  elevator: () =>
    canvasTex(
      128,
      128,
      (g, r) => {
        fill(g, '#9ba2a3');
        for (let x = 0; x < 128; x++) rect(g, x, 0, 1, 128, hex('#9ba2a3', 0.85 + r() * 0.25));
        rect(g, 63, 0, 2, 128, '#3e4446');
        blotch(g, r, 12, '#2e2a20', 14, 0.07);
      },
      63,
      false,
    ),

  // ── 천·피부 ──
  gown: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#a9c7dc');
        for (let y = 2; y < 32; y += 8) for (let x = (y / 8) % 2 ? 6 : 2; x < 32; x += 8) {
          rect(g, x, y, 2, 2, '#e9f0f4');
          rect(g, x + 1, y + 2, 1, 1, '#7f9fb6');
        }
        grain(g, 0.04, r);
      },
      70,
    ),
  knit: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#ddd0b6');
        for (let y = 0; y < 32; y += 4) for (let x = 0; x < 32; x += 4) {
          rect(g, x, y, 2, 3, '#e9dfc9');
          rect(g, x + 2, y + 1, 2, 3, '#c7b99c');
        }
        grain(g, 0.05, r);
      },
      71,
    ),
  coat: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#e6e8e4');
        for (let k = 0; k < 12; k++) rect(g, Math.floor(r() * 64), 0, 1, 64, 'rgba(120,130,130,0.12)');
        // 앞섶과 단추
        rect(g, 31, 0, 2, 64, '#b9bdb9');
        for (let y = 8; y < 64; y += 14) rect(g, 34, y, 2, 2, '#9aa09c');
        // 주머니와 펜
        rect(g, 6, 36, 16, 1, '#a9aea9');
        rect(g, 9, 30, 1, 7, '#2a3a8a');
        rect(g, 12, 31, 1, 6, '#8a2a2a');
        blotch(g, r, 6, '#7a6a40', 8, 0.05);
        grain(g, 0.03, r);
      },
      72,
    ),
  navy: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#26324a');
        for (let i = 0; i < 300; i++) rect(g, Math.floor(r() * 32), Math.floor(r() * 32), 1, 1, hex('#26324a', 0.8 + r() * 0.4));
      },
      73,
    ),
  plush: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#e79db3');
        for (let i = 0; i < 400; i++) rect(g, Math.floor(r() * 32), Math.floor(r() * 32), 1, 2, hex('#e79db3', 0.82 + r() * 0.3));
        blotch(g, r, 4, '#6a4a3a', 8, 0.08);
      },
      74,
    ),
  plush_light: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#f6d2dd');
        for (let i = 0; i < 300; i++) rect(g, Math.floor(r() * 32), Math.floor(r() * 32), 1, 2, hex('#f6d2dd', 0.88 + r() * 0.2));
      },
      75,
    ),
  skin: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#efcdb6');
        blotch(g, r, 6, '#d9a98e', 6, 0.08);
        grain(g, 0.015, r);
      },
      76,
    ),
  hair: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#3a2a22');
        for (let i = 0; i < 60; i++) rect(g, Math.floor(r() * 32), 0, 1, 32, hex('#3a2a22', 0.7 + r() * 0.6));
      },
      77,
    ),
  faceless: () =>
    canvasTex(
      64,
      64,
      (g) => {
        // 이목구비가 처음부터 없었던 것처럼. 매끈한 피부와 아주 옅은 음영뿐
        const gr = g.createRadialGradient(32, 28, 4, 32, 32, 34);
        gr.addColorStop(0, '#efe3d8');
        gr.addColorStop(1, '#cdbdb0');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
        g.fillStyle = 'rgba(160,130,115,0.08)';
        g.beginPath();
        g.ellipse(32, 30, 8, 3, 0, 0, Math.PI * 2);
        g.fill();
      },
      78,
    ),
  wood_dark: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#5b4129');
        for (let k = 0; k < 20; k++) rect(g, 0, Math.floor(r() * 32), 32, 1, hex('#3b2a19', 1, 0.5));
        grain(g, 0.05, r);
      },
      79,
    ),
  wood_light: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#c39a68');
        for (let k = 0; k < 20; k++) rect(g, 0, Math.floor(r() * 32), 32, 1, hex('#9a7448', 1, 0.5));
        grain(g, 0.05, r);
      },
      80,
    ),
  steel: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#a4abac');
        for (let x = 0; x < 32; x++) rect(g, x, 0, 1, 32, hex('#a4abac', 0.88 + r() * 0.22));
        blotch(g, r, 3, '#4a3a2a', 6, 0.08);
      },
      81,
    ),
  paint_metal: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#d9dcd6');
        blotch(g, r, 5, '#6a5a3a', 6, 0.1);
        grain(g, 0.03, r);
      },
      82,
    ),
  mattress: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#d9dfe0');
        for (let y = 0; y < 32; y += 8) rect(g, 0, y, 32, 1, '#b9c2c4');
        blotch(g, r, 3, '#a09060', 8, 0.08);
        grain(g, 0.03, r);
      },
      83,
    ),
  linen: () =>
    canvasTex(
      32,
      32,
      (g, r) => {
        fill(g, '#eceeea');
        for (let i = 0; i < 6; i++) rect(g, 0, Math.floor(r() * 32), 32, 1, 'rgba(150,160,160,0.25)');
        grain(g, 0.02, r);
      },
      84,
    ),
  vent: () =>
    canvasTex(
      32,
      32,
      (g) => {
        fill(g, '#b9bcb6');
        for (let y = 3; y < 30; y += 4) {
          rect(g, 2, y, 28, 2, '#2b2e2e');
          rect(g, 2, y + 2, 28, 1, '#e0e3dd');
        }
      },
      85,
      false,
    ),
  glow: () => {
    const t = canvasTex(
      64,
      64,
      (g) => {
        const gr = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        gr.addColorStop(0, 'rgba(255,255,255,1)');
        gr.addColorStop(0.25, 'rgba(255,255,255,0.35)');
        gr.addColorStop(1, 'rgba(255,255,255,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 64);
      },
      86,
      false,
    );
    t.magFilter = THREE.LinearFilter;
    t.minFilter = THREE.LinearFilter;
    return t;
  },
  shadow_blob: () => {
    const t = canvasTex(
      32,
      32,
      (g) => {
        const gr = g.createRadialGradient(16, 16, 0, 16, 16, 16);
        gr.addColorStop(0, 'rgba(0,0,0,0.55)');
        gr.addColorStop(1, 'rgba(0,0,0,0)');
        g.fillStyle = gr;
        g.fillRect(0, 0, 32, 32);
      },
      87,
      false,
    );
    t.magFilter = THREE.LinearFilter;
    return t;
  },
  grime: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        g.clearRect(0, 0, 64, 64);
        for (let k = 0; k < 18; k++) {
          const x = r() * 64;
          g.fillStyle = `rgba(60,48,30,${0.05 + r() * 0.08})`;
          g.fillRect(x, 0, 1 + r() * 3, 20 + r() * 44);
        }
        blotch(g, r, 10, '#3a3020', 12, 0.1);
      },
      88,
      false,
    ),

  brick: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#6a5a50');
        for (let y = 0; y < 64; y += 8)
          for (let x = (y / 8) % 2 ? -8 : 0; x < 64; x += 16) rect(g, x + 1, y + 1, 15, 7, hex('#9a6a52', 0.8 + r() * 0.35));
        blotch(g, r, 10, '#1a1410', 16, 0.12);
        grain(g, 0.05, r);
      },
      120,
    ),
  facade: () =>
    canvasTex(
      128,
      128,
      (g, r) => {
        // 외벽: 연한 콘크리트 패널 + 어두운 창 (3층)
        fill(g, '#bdb6a6');
        for (let y = 0; y < 128; y += 32) rect(g, 0, y, 128, 2, '#8e887a');
        for (let y = 0; y < 4; y++)
          for (let x = 0; x < 4; x++) {
            const wx = x * 32 + 6;
            const wy = y * 32 + 9;
            rect(g, wx - 1, wy - 1, 22, 16, '#7a766c');
            rect(g, wx, wy, 20, 14, r() < 0.12 ? '#3a3a2a' : '#141a1e');
            rect(g, wx + 10, wy, 1, 14, '#5a5a52');
            if (r() < 0.2) rect(g, wx + 2, wy + 2, 6, 10, 'rgba(120,140,150,0.25)');
          }
        blotch(g, r, 20, '#2a2a1a', 20, 0.08);
        for (let k = 0; k < 10; k++) rect(g, Math.floor(r() * 128), 0, 1, 20 + Math.floor(r() * 80), 'rgba(40,36,24,0.12)');
        grain(g, 0.04, r);
      },
      121,
    ),
  chainlink: () =>
    canvasTex(
      32,
      32,
      (g) => {
        g.clearRect(0, 0, 32, 32);
        g.strokeStyle = '#9aa0a0';
        g.lineWidth = 1;
        for (let k = -32; k < 64; k += 8) {
          g.beginPath();
          g.moveTo(k, 0);
          g.lineTo(k + 32, 32);
          g.stroke();
          g.beginPath();
          g.moveTo(k + 32, 0);
          g.lineTo(k, 32);
          g.stroke();
        }
      },
      122,
    ),
  ambulance: () =>
    canvasTex(
      128,
      64,
      (g, r) => {
        fill(g, '#e9e9e4');
        rect(g, 0, 30, 128, 8, '#c4302a');
        rect(g, 0, 39, 128, 2, '#2d5ac4');
        text(g, 'AMBULANCE', 64, 18, 12, '#c4302a', { font: 'Arial Black, Arial' });
        text(g, 'ALDER COUNTY EMS', 64, 50, 8, '#2d5ac4', { font: 'Arial Black, Arial' });
        // 생명의 별
        g.fillStyle = '#2d5ac4';
        for (let k = 0; k < 3; k++) {
          g.save();
          g.translate(112, 50);
          g.rotate((k * Math.PI) / 3);
          g.fillRect(-2, -7, 4, 14);
          g.restore();
        }
        blotch(g, r, 10, '#5a5040', 10, 0.06);
      },
      123,
      false,
    ),
  clock_face: () =>
    canvasTex(
      32,
      32,
      (g) => {
        fill(g, '#f4f2ea');
        g.strokeStyle = '#222';
        for (let k = 0; k < 12; k++) {
          const a = (k / 12) * Math.PI * 2;
          g.beginPath();
          g.moveTo(16 + Math.cos(a) * 12, 16 + Math.sin(a) * 12);
          g.lineTo(16 + Math.cos(a) * 14, 16 + Math.sin(a) * 14);
          g.stroke();
        }
        // 2001년의 그날에 멈춘 시계: 3시 14분
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(16, 16);
        g.lineTo(16 + Math.cos(-0.05) * 8, 16 + Math.sin(-0.05) * 8);
        g.stroke();
        g.lineWidth = 1;
        g.beginPath();
        g.moveTo(16, 16);
        g.lineTo(16 + Math.cos(-Math.PI / 2 + (14 / 60) * Math.PI * 2) * 12, 16 + Math.sin(-Math.PI / 2 + (14 / 60) * Math.PI * 2) * 12);
        g.stroke();
      },
      124,
      false,
    ),
  calendar: () =>
    canvasTex(
      64,
      80,
      (g, r) => {
        fill(g, '#f6f3ea');
        rect(g, 0, 0, 64, 14, '#2f5d55');
        text(g, 'MARCH 2001', 32, 7, 8, '#fff', { font: 'Arial Black, Arial' });
        for (let k = 0; k < 35; k++) {
          const x = (k % 7) * 9 + 1;
          const y = Math.floor(k / 7) * 12 + 18;
          rect(g, x, y, 8, 11, '#e9e6dc');
          if (k >= 4 && k - 3 <= 31) text(g, String(k - 3), x + 4, y + 4, 4, '#333', { font: 'Arial' });
        }
        // 3월 9일에 빨간 동그라미 (실험 90)
        g.strokeStyle = '#c33';
        g.beginPath();
        g.arc(5 * 9 + 5, 3 * 12 + 18 - 12 + 5, 5, 0, Math.PI * 2);
        g.stroke();
        grain(g, 0.03, r);
      },
      125,
      false,
    ),
  // ── 게시물·간판 (영어 텍스처) ──
  poster_hand: () => poster('#f6efd8', 'HOLD A FRIEND’S', 'HAND!', 'Stay together in the hallway.', 'hand', 90),
  poster_swap: () => poster('#e9f2f6', 'SWAP A PART,', 'KEEP YOUR HEART!', "Hoppy's Health Hour", 'swap', 91),
  poster_rounds: () => notice('ROUNDS BEGIN AT THE CHIME.', 'Please stay in your room.', '#d9e6ec', 92),
  poster_lights: () => notice('LIGHTS OUT AT 9.', 'Sleep is good medicine!', '#efe6c8', 93),
  poster_chance: () => poster('#fdf4e4', 'SECOND CHANCE', 'PROGRAM', 'No bills, just healing.', 'chance', 94),
  poster_shape: () => poster('#f3e6f0', 'ANY SHAPE IS A', 'GOOD SHAPE!', 'Second Nature Children’s Center', 'shape', 95),
  slogan: () =>
    canvasTex(
      512,
      96,
      (g, r) => {
        fill(g, '#e8e2d2');
        text(g, 'SECOND NATURE', 256, 20, 22, '#2f5d55', { font: 'Georgia, "Times New Roman", serif' });
        rect(g, 150, 34, 212, 1, '#2f5d55');
        text(g, 'The body you were born with', 256, 52, 18, '#3a3a3a', { font: 'Georgia, "Times New Roman", serif', weight: 'italic' });
        text(g, "doesn't have to be your final form.", 256, 74, 18, '#3a3a3a', { font: 'Georgia, "Times New Roman", serif', weight: 'italic' });
        blotch(g, r, 20, '#3a3020', 30, 0.05);
        grain(g, 0.03, r);
      },
      96,
      false,
    ),
  center_sign: () =>
    canvasTex(
      256,
      64,
      (g, r) => {
        fill(g, '#2d4f4a');
        rect(g, 3, 3, 250, 58, '#35605a');
        text(g, 'SECOND NATURE', 128, 22, 22, '#f2ead6', { font: 'Georgia, serif' });
        text(g, "CHILDREN'S CENTER  ·  EST. 1979", 128, 46, 11, '#d8c99a', { font: 'Arial, sans-serif' });
        grain(g, 0.04, r);
      },
      97,
      false,
    ),
  gate_sign: () =>
    canvasTex(
      256,
      128,
      (g, r) => {
        fill(g, '#e9e3d1');
        rect(g, 4, 4, 248, 120, '#efe9d8');
        // 새싹 로고
        g.fillStyle = '#4f8a5b';
        g.beginPath();
        g.ellipse(128 - 9, 26, 9, 5, -0.6, 0, Math.PI * 2);
        g.ellipse(128 + 9, 22, 11, 6, 0.6, 0, Math.PI * 2);
        g.fill();
        rect(g, 127, 24, 2, 14, '#4f8a5b');
        text(g, 'SECOND NATURE', 128, 52, 26, '#24453f', { font: 'Georgia, serif' });
        text(g, 'BIOMEDICAL  ·  HOLLOW PINES CAMPUS', 128, 74, 10, '#5a6a60', { font: 'Arial, sans-serif' });
        text(g, 'The body you were born with', 128, 94, 12, '#3a3a3a', { font: 'Georgia, serif', weight: 'italic' });
        text(g, "doesn't have to be your final form.", 128, 109, 12, '#3a3a3a', { font: 'Georgia, serif', weight: 'italic' });
        blotch(g, r, 30, '#3a3a20', 30, 0.08);
        blotch(g, r, 10, '#5a6a3a', 20, 0.1);
        grain(g, 0.05, r);
      },
      98,
      false,
    ),
  deer_sign: () => deerSign(false),
  /** 세 번째 표지판: 사슴의 앞발이 사람 손이고, 머리가 둥글다 */
  deer_sign_wrong: () => deerSign(true),
  exit_sign: () =>
    canvasTex(
      64,
      32,
      (g) => {
        fill(g, '#1a1515');
        text(g, 'EXIT', 32, 16, 18, '#ff3b30', { font: 'Arial Black, Arial, sans-serif' });
      },
      100,
      false,
    ),
  stair_sign: () => notice('STAIRWELL CLOSED', 'Use elevators. — Facilities', '#e9d36a', 101),
  portrait: () =>
    canvasTex(
      96,
      128,
      (g, r) => {
        // 창립자 헬렌 애시퍼드 박사의 초상 (유화풍)
        rect(g, 0, 0, 96, 128, '#8a6a2a');
        rect(g, 4, 4, 88, 120, '#b8913c');
        rect(g, 8, 8, 80, 112, '#2a3a32');
        const gr = g.createRadialGradient(48, 50, 4, 48, 60, 60);
        gr.addColorStop(0, '#4a5a48');
        gr.addColorStop(1, '#1a241e');
        g.fillStyle = gr;
        g.fillRect(8, 8, 80, 112);
        // 흰 가운, 블라우스
        g.fillStyle = '#e8e4d8';
        g.beginPath();
        g.moveTo(18, 120);
        g.quadraticCurveTo(22, 82, 48, 78);
        g.quadraticCurveTo(74, 82, 78, 120);
        g.fill();
        g.fillStyle = '#6a7a9a';
        g.beginPath();
        g.moveTo(40, 82);
        g.lineTo(48, 100);
        g.lineTo(56, 82);
        g.fill();
        // 얼굴
        g.fillStyle = '#e9c4a6';
        g.beginPath();
        g.ellipse(48, 56, 13, 17, 0, 0, Math.PI * 2);
        g.fill();
        rect(g, 44, 70, 8, 8, '#e0b898');
        // 회색 단발
        g.fillStyle = '#b9b6ae';
        g.beginPath();
        g.ellipse(48, 46, 16, 12, 0, Math.PI, 0);
        g.fill();
        g.fillRect(32, 44, 5, 20);
        g.fillRect(59, 44, 5, 20);
        // 눈, 미소
        rect(g, 42, 55, 3, 2, '#3a2a22');
        rect(g, 51, 55, 3, 2, '#3a2a22');
        rect(g, 44, 65, 8, 1, '#a65a5a');
        rect(g, 43, 64, 1, 1, '#a65a5a');
        rect(g, 52, 64, 1, 1, '#a65a5a');
        // 금속 명판
        rect(g, 30, 112, 36, 6, '#c9a64a');
        text(g, 'H. ASHFORD, M.D.', 48, 115, 4, '#3a2a10', { font: 'Arial, sans-serif' });
        grain(g, 0.06, r);
      },
      102,
      false,
    ),
  letters: () =>
    canvasTex(
      256,
      256,
      (g, r) => {
        // 감사 편지 벽: 코르크판 위의 편지, 크레용 그림, 폴라로이드
        fill(g, '#a87e52');
        for (let i = 0; i < 2500; i++) rect(g, Math.floor(r() * 256), Math.floor(r() * 256), 1, 1, hex('#a87e52', 0.75 + r() * 0.5));
        text(g, 'THANK YOU, SECOND NATURE!', 128, 10, 11, '#f7f1e2', { font: 'Arial Black, Arial, sans-serif' });
        const colors = ['#fbf8ef', '#f9efc8', '#e7f1f7', '#f6e3ea', '#e8f3e3'];
        for (let i = 0; i < 46; i++) {
          const x = 4 + r() * 220;
          const y = 20 + r() * 200;
          // 오른쪽 아래 구석은 비워 둔다 (주인공의 그림 자리)
          if (x > 180 && y > 180) continue;
          const w = 22 + r() * 16;
          const h = 26 + r() * 14;
          g.save();
          g.translate(x + w / 2, y + h / 2);
          g.rotate((r() - 0.5) * 0.3);
          g.fillStyle = 'rgba(0,0,0,0.25)';
          g.fillRect(-w / 2 + 1, -h / 2 + 1, w, h);
          const kind = r();
          if (kind < 0.55) {
            g.fillStyle = colors[Math.floor(r() * colors.length)];
            g.fillRect(-w / 2, -h / 2, w, h);
            g.fillStyle = 'rgba(40,50,90,0.6)';
            for (let l = 0; l < 6; l++) g.fillRect(-w / 2 + 3, -h / 2 + 5 + l * 4, w - 6 - r() * 8, 1);
          } else if (kind < 0.85) {
            g.fillStyle = '#fbfbf6';
            g.fillRect(-w / 2, -h / 2, w, h);
            // 크레용: 집, 해, 사람
            const cc = ['#e2533c', '#3c7fe2', '#e2b13c', '#4cb04c', '#b04cb0'];
            g.fillStyle = cc[Math.floor(r() * 5)];
            g.fillRect(-6, 0, 12, 8);
            g.beginPath();
            g.moveTo(-8, 0);
            g.lineTo(0, -7);
            g.lineTo(8, 0);
            g.fill();
            g.fillStyle = '#e2b13c';
            g.beginPath();
            g.arc(w / 2 - 6, -h / 2 + 6, 3, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#222';
            g.fillRect(-w / 2 + 4, 4, 1, 6);
            g.fillRect(-w / 2 + 6, 4, 1, 6);
          } else {
            // 폴라로이드: 웃는 아이와 흰 가운
            g.fillStyle = '#f2f0e8';
            g.fillRect(-w / 2, -h / 2, w, h);
            g.fillStyle = '#5a6a62';
            g.fillRect(-w / 2 + 2, -h / 2 + 2, w - 4, h - 9);
            g.fillStyle = '#e9c4a6';
            g.beginPath();
            g.arc(-3, -2, 3, 0, Math.PI * 2);
            g.fill();
            g.fillStyle = '#eee';
            g.fillRect(3, -4, 5, 10);
          }
          // 압정
          g.fillStyle = ['#d33', '#36c', '#3a3', '#dd3'][Math.floor(r() * 4)];
          g.fillRect(-1, -h / 2 + 1, 2, 2);
          g.restore();
        }
        grain(g, 0.03, r);
      },
      103,
      false,
    ),
  my_drawing: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        // 1994년, 여덟 살 주인공의 크레용 그림
        fill(g, '#fbfaf4');
        // 불길
        for (let k = 0; k < 7; k++) crayon(g, r, [[4 + k * 4, 50], [6 + k * 4, 30 - (k % 3) * 6], [9 + k * 4, 50]], k % 2 ? '#f08a24' : '#e2392b', 2);
        // 아이
        crayon(g, r, [[18, 50], [18, 40]], '#222', 1);
        g.fillStyle = '#e9c4a6';
        g.beginPath();
        g.arc(18, 37, 3, 0, Math.PI * 2);
        g.fill();
        // 흰 가운
        g.fillStyle = '#ffffff';
        g.strokeStyle = '#666';
        g.lineWidth = 1;
        g.fillRect(40, 30, 10, 18);
        g.strokeRect(40, 30, 10, 18);
        g.fillStyle = '#e9c4a6';
        g.beginPath();
        g.arc(45, 26, 4, 0, Math.PI * 2);
        g.fill();
        crayon(g, r, [[38, 34], [26, 38]], '#555', 1);
        // 글씨
        text(g, 'THANK YOU DOCTOR', 32, 6, 6, '#3c5ae2', { font: 'Comic Sans MS, Arial, sans-serif' });
        text(g, 'IT DOESNT HURT', 32, 13, 6, '#3c5ae2', { font: 'Comic Sans MS, Arial, sans-serif' });
        text(g, 'ANYMORE', 32, 20, 6, '#3c5ae2', { font: 'Comic Sans MS, Arial, sans-serif' });
        // 번진 이름
        g.fillStyle = 'rgba(60,60,160,0.5)';
        g.fillRect(36, 56, 22, 4);
        text(g, 'age 8', 12, 58, 5, '#3c5ae2', { font: 'Arial, sans-serif' });
      },
      104,
      false,
    ),
  home_scratch: () =>
    canvasTex(
      64,
      128,
      (g, r) => {
        // 공중전화 부스 안쪽 벽: 아이 글씨로 'HOME'이 수십 번
        fill(g, '#6d7472');
        grain(g, 0.06, r);
        for (let k = 0; k < 44; k++) {
          g.save();
          g.translate(4 + r() * 52, 6 + r() * 116);
          g.rotate((r() - 0.5) * 0.6);
          const s = 5 + r() * 6;
          g.font = `${s}px Arial, sans-serif`;
          g.fillStyle = `rgba(220,226,222,${0.35 + r() * 0.4})`;
          g.fillText('HOME', 0, 0);
          g.restore();
        }
      },
      105,
      false,
    ),
  height_marks: () =>
    canvasTex(
      32,
      128,
      (g, r) => {
        fill(g, '#b88d5d');
        for (let k = 0; k < 20; k++) rect(g, 0, Math.floor(r() * 128), 32, 1, hex('#8f6a42', 1, 0.4));
        const marks = [
          [92, '3/94'],
          [86, '6/94'],
          [80, '9/94'],
          [77, '12/94'],
        ] as [number, string][];
        for (const [y, s] of marks) {
          rect(g, 2, y, 14, 1, '#2a2a2a');
          text(g, s, 23, y, 5, '#2a2a2a', { font: 'Arial, sans-serif', weight: 'normal' });
        }
      },
      106,
      false,
    ),
  mood_chart: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        fill(g, '#fdfbf2');
        text(g, 'HOW DO YOU', 32, 6, 7, '#3a6a9a', { font: 'Arial Black, Arial' });
        text(g, 'FEEL TODAY?', 32, 13, 7, '#3a6a9a', { font: 'Arial Black, Arial' });
        const faces = ['#f4c430', '#8fd18f', '#9ab8e8', '#e88f8f'];
        faces.forEach((c, i) => {
          const x = 10 + (i % 2) * 30 + 6;
          const y = 26 + Math.floor(i / 2) * 20;
          g.fillStyle = c;
          g.beginPath();
          g.arc(x, y, 7, 0, Math.PI * 2);
          g.fill();
          rect(g, x - 3, y - 2, 1, 2, '#222');
          rect(g, x + 2, y - 2, 1, 2, '#222');
          g.strokeStyle = '#222';
          g.beginPath();
          if (i === 0) g.arc(x, y + 1, 3, 0.2, Math.PI - 0.2);
          else if (i === 3) g.arc(x, y + 5, 3, Math.PI + 0.3, -0.3);
          else {
            g.moveTo(x - 3, y + 3);
            g.lineTo(x + 3, y + 3);
          }
          g.stroke();
        });
        // 크레용 동그라미 (누군가가 고른 표정)
        g.strokeStyle = '#d33';
        g.lineWidth = 1.5;
        g.beginPath();
        g.ellipse(46, 46, 10, 9, 0.2, 0, Math.PI * 2);
        g.stroke();
        grain(g, 0.03, r);
      },
      107,
      false,
    ),
  hoppy_face: () =>
    canvasTex(
      64,
      64,
      (g) => {
        fill(g, '#e79db3');
        // 바느질한 웃음
        g.strokeStyle = '#7a2e48';
        g.lineWidth = 2;
        g.beginPath();
        g.arc(32, 30, 14, 0.25, Math.PI - 0.25);
        g.stroke();
        for (let k = 0; k < 9; k++) {
          const a = 0.35 + (k / 8) * (Math.PI - 0.7);
          const x = 32 + Math.cos(a) * 14;
          const y = 30 + Math.sin(a) * 14;
          rect(g, Math.round(x) - 1, Math.round(y) - 3, 1, 5, '#7a2e48');
        }
        g.fillStyle = '#a8546f';
        g.beginPath();
        g.ellipse(32, 30, 5, 3, 0, 0, Math.PI * 2);
        g.fill();
      },
      108,
      false,
    ),
  zipper: () =>
    canvasTex(
      32,
      64,
      (g) => {
        fill(g, '#e79db3');
        rect(g, 13, 0, 6, 64, '#5a5a5a');
        for (let y = 0; y < 64; y += 3) {
          rect(g, 13, y, 3, 2, '#c8c8c0');
          rect(g, 16, y + 1, 3, 2, '#a8a8a0');
        }
        rect(g, 11, 6, 10, 6, '#d8d8d0');
      },
      109,
      false,
    ),
  clipboard: () =>
    canvasTex(
      32,
      48,
      (g, r) => {
        fill(g, '#7a5a38');
        rect(g, 2, 4, 28, 42, '#f1efe6');
        rect(g, 10, 0, 12, 6, '#b9bcb6');
        for (let l = 0; l < 9; l++) rect(g, 5, 10 + l * 4, 14 + Math.floor(r() * 8), 1, '#4a5a7a');
        grain(g, 0.03, r);
      },
      110,
      false,
    ),
  tv_off: () =>
    canvasTex(
      64,
      48,
      (g) => {
        const gr = g.createRadialGradient(32, 22, 2, 32, 24, 40);
        gr.addColorStop(0, '#2a3230');
        gr.addColorStop(1, '#0d1110');
        g.fillStyle = gr;
        g.fillRect(0, 0, 64, 48);
        rect(g, 8, 6, 14, 3, 'rgba(255,255,255,0.08)');
      },
      111,
      false,
    ),
  window_night: () =>
    canvasTex(
      32,
      32,
      (g) => {
        fill(g, '#141c22');
      },
      112,
      false,
    ),
  room_chart: () =>
    canvasTex(
      32,
      48,
      (g, r) => {
        fill(g, '#e9e6da');
        rect(g, 0, 0, 32, 7, '#5a7a9a');
        text(g, 'PATIENT', 16, 3.5, 5, '#fff', { font: 'Arial' });
        for (let l = 0; l < 8; l++) rect(g, 3, 11 + l * 4, 18 + Math.floor(r() * 8), 1, '#4a4a5a');
      },
      113,
      false,
    ),
  hoppy_frame: () =>
    canvasTex(
      128,
      128,
      (g, r) => {
        // 놀이방 문의 인형 틀. 문 위 표어: ANY SHAPE IS A GOOD SHAPE!
        fill(g, '#f3e6f0');
        text(g, 'ANY SHAPE IS A GOOD SHAPE!', 64, 10, 9, '#b0406a', { font: 'Arial Black, Arial' });
        g.globalAlpha = 0.25;
        drawHoppy(g, 64, 74, 34);
        g.globalAlpha = 1;
        // 여섯 개의 빈 자리
        const slots = [
          [64, 52],
          [64, 88],
          [36, 82],
          [92, 82],
          [52, 112],
          [76, 112],
        ];
        for (const [x, y] of slots) {
          g.strokeStyle = '#b0406a';
          g.setLineDash([3, 2]);
          g.lineWidth = 2;
          g.strokeRect(x - 9, y - 9, 18, 18);
        }
        g.setLineDash([]);
        grain(g, 0.03, r);
      },
      114,
      false,
    ),
  stage_curtain: () =>
    canvasTex(
      64,
      64,
      (g, r) => {
        for (let x = 0; x < 64; x++) {
          const k = 0.7 + 0.3 * Math.sin(x / 2.5);
          rect(g, x, 0, 1, 64, hex('#9a2a3a', k));
        }
        blotch(g, r, 6, '#000000', 10, 0.1);
      },
      115,
    ),
  hhh_logo: () =>
    canvasTex(
      128,
      64,
      (g, r) => {
        fill(g, '#ffe8a8');
        g.fillStyle = '#ef8fb0';
        for (let k = 0; k < 14; k++) {
          g.beginPath();
          g.arc(r() * 128, r() * 64, 2 + r() * 4, 0, Math.PI * 2);
          g.fill();
        }
        drawHoppy(g, 22, 38, 12);
        text(g, "HOPPY'S", 80, 16, 14, '#d0406a', { font: 'Arial Black, Arial' });
        text(g, 'HEALTH HOUR', 80, 34, 13, '#3a7ac0', { font: 'Arial Black, Arial' });
        text(g, 'with your friends at Second Nature', 80, 52, 6, '#555', { font: 'Arial' });
      },
      116,
      false,
    ),
  emt_patch: () =>
    canvasTex(
      32,
      32,
      (g) => {
        fill(g, '#26324a');
        g.fillStyle = '#2d6ad8';
        g.fillRect(12, 4, 8, 24);
        g.fillRect(4, 12, 24, 8);
        g.fillStyle = '#fff';
        g.fillRect(15, 7, 2, 18);
      },
      117,
      false,
    ),
  dashboard: () =>
    canvasTex(
      128,
      32,
      (g, r) => {
        fill(g, '#1d1f22');
        for (const x of [24, 56]) {
          g.fillStyle = '#0a0b0c';
          g.beginPath();
          g.arc(x, 16, 12, 0, Math.PI * 2);
          g.fill();
          g.strokeStyle = '#ff9a3a';
          g.lineWidth = 1;
          for (let k = 0; k < 9; k++) {
            const a = Math.PI * 0.8 + (k / 8) * Math.PI * 1.4;
            g.beginPath();
            g.moveTo(x + Math.cos(a) * 9, 16 + Math.sin(a) * 9);
            g.lineTo(x + Math.cos(a) * 11, 16 + Math.sin(a) * 11);
            g.stroke();
          }
          g.strokeStyle = '#ff5a2a';
          g.beginPath();
          g.moveTo(x, 16);
          g.lineTo(x + Math.cos(2.3 + x / 30) * 9, 16 + Math.sin(2.3 + x / 30) * 9);
          g.stroke();
        }
        rect(g, 84, 8, 36, 14, '#0a0b0c');
        text(g, '154.280', 102, 15, 8, '#ff9a3a', { font: 'monospace' });
        grain(g, 0.04, r);
      },
      118,
      false,
    ),
};

/** 사슴 출몰 경고 표지판 (노란 마름모, 뛰어오르는 사슴) */
function deerSign(wrong: boolean) {
  return canvasTex(
    128,
    128,
    (g, r) => {
      g.clearRect(0, 0, 128, 128);
      const diamond = (inset: number) => {
        g.beginPath();
        g.moveTo(64, inset);
        g.lineTo(128 - inset, 64);
        g.lineTo(64, 128 - inset);
        g.lineTo(inset, 64);
        g.closePath();
      };
      g.fillStyle = '#e8b82a';
      diamond(1);
      g.fill();
      // 반사 시트의 얼룩과 긁힘
      g.save();
      diamond(1);
      g.clip();
      for (let i = 0; i < 260; i++) {
        g.fillStyle = r() < 0.5 ? 'rgba(120,80,10,0.10)' : 'rgba(255,240,170,0.10)';
        g.fillRect(r() * 128, r() * 128, 1 + r() * 3, 1);
      }
      g.fillStyle = 'rgba(70,50,20,0.18)';
      g.fillRect(0, 96, 128, 32);
      g.restore();
      g.strokeStyle = '#141414';
      g.lineWidth = 3;
      diamond(7);
      g.stroke();
      // 뛰어오르는 사슴 (오른쪽 위로)
      g.fillStyle = '#141414';
      g.strokeStyle = '#141414';
      g.lineCap = 'round';
      g.lineJoin = 'round';
      g.save();
      g.translate(64, 66);
      g.rotate(-0.22);
      // 몸통
      g.beginPath();
      g.ellipse(0, 0, 21, 8.5, 0, 0, Math.PI * 2);
      g.fill();
      // 엉덩이와 꼬리
      g.beginPath();
      g.ellipse(-16, -1, 8, 8, 0, 0, Math.PI * 2);
      g.fill();
      g.lineWidth = 3;
      g.beginPath();
      g.moveTo(-22, -5);
      g.lineTo(-27, -9);
      g.stroke();
      // 목
      g.lineWidth = 7;
      g.beginPath();
      g.moveTo(14, -3);
      g.lineTo(22, -15);
      g.stroke();
      // 머리
      if (!wrong) {
        g.beginPath();
        g.ellipse(26, -18, 6.5, 3.6, 0.35, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(21, -21);
        g.lineTo(23, -25);
        g.stroke();
        // 뿔
        g.lineWidth = 2;
        g.beginPath();
        g.moveTo(23, -21);
        g.lineTo(19, -33);
        g.moveTo(21, -27);
        g.lineTo(15, -31);
        g.moveTo(20, -31);
        g.lineTo(23, -36);
        g.stroke();
      } else {
        // 둥근 머리, 짧은 머리카락 선
        g.beginPath();
        g.arc(24, -19, 6.2, 0, Math.PI * 2);
        g.fill();
        g.lineWidth = 1.5;
        g.beginPath();
        g.moveTo(19, -24);
        g.lineTo(17, -27);
        g.moveTo(23, -25);
        g.lineTo(23, -28);
        g.stroke();
      }
      // 앞다리 (앞으로 뻗음)
      g.lineWidth = 3.4;
      g.beginPath();
      g.moveTo(14, 4);
      g.lineTo(24, 10);
      g.lineTo(33, 6);
      g.moveTo(11, 5);
      g.lineTo(20, 14);
      g.lineTo(30, 13);
      g.stroke();
      if (wrong) {
        // 발굽 대신 손가락
        g.lineWidth = 1.3;
        for (const [hx, hy] of [
          [33, 6],
          [30, 13],
        ]) {
          for (let k = -2; k <= 2; k++) {
            g.beginPath();
            g.moveTo(hx, hy);
            g.lineTo(hx + 4.5, hy + k * 1.6);
            g.stroke();
          }
        }
      }
      // 뒷다리 (뒤로 차냄)
      g.lineWidth = 3.8;
      g.beginPath();
      g.moveTo(-18, 4);
      g.lineTo(-24, 13);
      g.lineTo(-36, 18);
      g.moveTo(-14, 6);
      g.lineTo(-22, 17);
      g.lineTo(-33, 24);
      g.stroke();
      g.restore();
      grain(g, 0.05, r);
    },
    wrong ? 118 : 117,
    false,
  );
}

function poster(bg: string, l1: string, l2: string, sub: string, kind: string, seed: number) {
  return canvasTex(
    128,
    160,
    (g, r) => {
      fill(g, bg);
      rect(g, 4, 4, 120, 152, hex(bg, 1.02));
      text(g, l1, 64, 18, 12, '#2a5a8a', { font: 'Arial Black, Arial' });
      text(g, l2, 64, 34, 15, '#d04a6a', { font: 'Arial Black, Arial' });
      if (kind === 'hand') {
        // 호피와 아이가 손을 잡고 있다
        drawHoppy(g, 42, 100, 18);
        g.fillStyle = '#f2c9a8';
        g.beginPath();
        g.arc(88, 78, 9, 0, Math.PI * 2);
        g.fill();
        g.fillStyle = '#5b8fd0';
        g.fillRect(80, 88, 16, 24);
        g.fillStyle = '#f2c9a8';
        g.fillRect(81, 112, 5, 14);
        g.fillRect(90, 112, 5, 14);
        g.strokeStyle = '#f2c9a8';
        g.lineWidth = 3;
        g.beginPath();
        g.moveTo(80, 94);
        g.lineTo(60, 100);
        g.stroke();
        g.fillStyle = '#2a2a2a';
        g.fillRect(85, 76, 2, 2);
        g.fillRect(90, 76, 2, 2);
        g.fillStyle = '#d04a6a';
        g.beginPath();
        g.arc(70, 88, 4, 0, Math.PI * 2);
        g.fill();
      } else if (kind === 'swap') {
        drawHoppy(g, 64, 96, 24);
        // 떼어 놓은 귀와 팔 (정상 시절에는 귀여운 장난)
        g.fillStyle = '#ec9fb6';
        g.beginPath();
        g.ellipse(22, 120, 5, 12, 0.9, 0, Math.PI * 2);
        g.ellipse(106, 118, 5, 10, -0.5, 0, Math.PI * 2);
        g.fill();
        text(g, '→', 30, 104, 14, '#2a5a8a');
      } else if (kind === 'chance') {
        g.fillStyle = '#4f8a5b';
        g.beginPath();
        g.ellipse(52, 84, 18, 10, -0.6, 0, Math.PI * 2);
        g.ellipse(76, 78, 22, 12, 0.6, 0, Math.PI * 2);
        g.fill();
        rect(g, 62, 84, 4, 40, '#4f8a5b');
        text(g, 'Call 1-800-SECOND-N', 64, 136, 8, '#555', { font: 'Arial' });
      } else {
        drawHoppy(g, 40, 100, 16);
        drawHoppy(g, 88, 100, 16, true);
      }
      text(g, sub, 64, 148, 8, '#555', { font: 'Arial', weight: 'italic bold' });
      blotch(g, r, 10, '#5a4a20', 20, 0.06);
      grain(g, 0.04, r);
    },
    seed,
    false,
  );
}

function notice(l1: string, l2: string, bg: string, seed: number) {
  return canvasTex(
    128,
    64,
    (g, r) => {
      fill(g, bg);
      rect(g, 0, 0, 128, 10, '#2f5d55');
      text(g, 'SECOND NATURE CHILDREN’S CENTER', 64, 5, 6, '#fff', { font: 'Arial' });
      wrapText(g, l1, 64, 26, 11, 13, 118, '#222', 'Arial Black, Arial');
      text(g, l2, 64, 52, 8, '#444', { font: 'Arial', weight: 'italic bold' });
      blotch(g, r, 8, '#5a4a20', 16, 0.06);
      grain(g, 0.03, r);
    },
    seed,
    false,
  );
}

/** 방 번호 명판 */
export function plateTex(label: string) {
  const key = 'plate_' + label;
  let t = cache.get(key);
  if (!t) {
    t = canvasTex(
      64,
      32,
      (g, r) => {
        fill(g, '#2f5d55');
        rect(g, 2, 2, 60, 28, '#3c6e65');
        text(g, label, 32, 17, label.length > 4 ? 10 : 16, '#f2ead6', { font: 'Arial Black, Arial' });
        grain(g, 0.04, r);
      },
      label.length * 13,
      false,
    );
    cache.set(key, t);
  }
  return t;
}

/** 회진의 명찰 */
export function nameTagTex(name: string) {
  const key = 'tag_' + name;
  let t = cache.get(key);
  if (!t) {
    t = canvasTex(
      64,
      32,
      (g) => {
        fill(g, '#f5f5f0');
        rect(g, 0, 0, 64, 9, '#2f5d55');
        text(g, 'SECOND NATURE', 32, 4.5, 6, '#fff', { font: 'Arial' });
        text(g, name, 32, 20, 8, '#111', { font: 'Arial Black, Arial' });
        rect(g, 4, 26, 18, 3, '#9ab');
      },
      name.length * 7,
      false,
    );
    cache.set(key, t);
  }
  return t;
}

/** 우나의 얼굴 (표정마다) */
export function unaFaceTex(expr: 'neutral' | 'smile' | 'worry' | 'laugh' | 'blank' | 'angry' | 'sad') {
  const key = 'una_' + expr;
  let t = cache.get(key);
  if (!t) {
    t = canvasTex(
      64,
      64,
      (g) => {
        fill(g, '#f0d0bb');
        // 볼
        g.fillStyle = 'rgba(232,150,140,0.35)';
        g.beginPath();
        g.ellipse(20, 40, 5, 3, 0, 0, Math.PI * 2);
        g.ellipse(44, 40, 5, 3, 0, 0, Math.PI * 2);
        g.fill();
        // 눈썹
        const brow = expr === 'worry' || expr === 'sad' ? 2 : expr === 'angry' ? -2 : 0;
        g.fillStyle = '#4a3226';
        g.save();
        g.translate(22, 25);
        g.rotate(-brow * 0.12);
        g.fillRect(-5, 0, 10, 2);
        g.restore();
        g.save();
        g.translate(42, 25);
        g.rotate(brow * 0.12);
        g.fillRect(-5, 0, 10, 2);
        g.restore();
        // 눈: 크고 어두운 갈색, 하이라이트
        const eye = (x: number) => {
          if (expr === 'laugh') {
            g.strokeStyle = '#2a1a14';
            g.lineWidth = 2;
            g.beginPath();
            g.arc(x, 33, 4, Math.PI + 0.4, -0.4);
            g.stroke();
            return;
          }
          g.fillStyle = '#ffffff';
          g.beginPath();
          g.ellipse(x, 32, 5.5, 4.2, 0, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#4a2c1c';
          g.beginPath();
          g.arc(x, 32.5, 3.6, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#1a0e08';
          g.beginPath();
          g.arc(x, 32.5, 1.8, 0, Math.PI * 2);
          g.fill();
          g.fillStyle = '#fff';
          g.fillRect(x + 1, 30, 2, 2);
          g.fillStyle = '#2a1a14';
          g.fillRect(x - 6, 27.5, 12, 1.5);
        };
        eye(22);
        eye(42);
        // 코
        g.fillStyle = 'rgba(190,130,110,0.5)';
        g.fillRect(31, 39, 2, 3);
        // 입
        g.strokeStyle = '#b3555a';
        g.fillStyle = '#b3555a';
        g.lineWidth = 2;
        g.beginPath();
        if (expr === 'smile') g.arc(32, 45, 5, 0.3, Math.PI - 0.3);
        else if (expr === 'laugh') {
          g.ellipse(32, 48, 5, 3, 0, 0, Math.PI);
          g.fill();
        } else if (expr === 'worry' || expr === 'sad') g.arc(32, 52, 4, Math.PI + 0.5, -0.5);
        else if (expr === 'angry') {
          g.moveTo(27, 50);
          g.lineTo(37, 49);
        } else {
          g.moveTo(29, 49);
          g.lineTo(35, 49);
        }
        g.stroke();
      },
      200 + expr.length,
      false,
    );
    cache.set(key, t);
  }
  return t;
}

/**
 * 1인칭 왼팔의 피부. 침식(0..1)에 따라 매끈한 무늬가 손목에서 팔꿈치로 번진다 (G4.3)
 */
export function armSkinCanvas(): { tex: THREE.CanvasTexture; set: (k: number) => void } {
  // x = 팔 길이 (0 손목 → 256 팔꿈치), y = 둘레 (32 근처가 팔 안쪽)
  const W = 256;
  const H = 64;
  const c = document.createElement('canvas');
  c.width = W;
  c.height = H;
  const g = c.getContext('2d', { willReadFrequently: true })!;
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.magFilter = THREE.NearestFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.wrapT = THREE.RepeatWrapping;
  const r0 = rng(1994);
  const GRAFT = 150; // 이식 경계 (손목에서 이만큼)
  // 경계: 자로 잰 듯 곧은 둘레 선. 흉터는 없고, 털과 점이 거기서 끊길 뿐이다
  const edge: number[] = [];
  for (let y = 0; y <= H; y++) edge.push(GRAFT);
  // 뿌리처럼 갈라지는 선 (손목 안쪽에서 시작)
  type Curve = { pts: [number, number][]; at: number };
  const curves: Curve[] = [];
  const grow = (x: number, y: number, a: number, len: number, depth: number, at: number) => {
    const pts: [number, number][] = [[x, y]];
    for (let s = 0; s < len; s++) {
      a += (r0() - 0.5) * 0.7;
      x += Math.cos(a) * 3;
      y += Math.sin(a) * 2.2;
      pts.push([x, y]);
      if (depth < 2 && r0() < 0.08) grow(x, y, a + (r0() < 0.5 ? 0.8 : -0.8), Math.floor(len * 0.5), depth + 1, at + s / len);
    }
    curves.push({ pts, at });
  };
  for (let k = 0; k < 9; k++) grow(8 + r0() * 30, 30 + (r0() - 0.5) * 10, (r0() - 0.5) * 1.2, 30 + Math.floor(r0() * 30), 0, r0() * 0.3);
  // 정맥, 털, 점 (원래 피부에만)
  const veins: [number, number][][] = [];
  for (let k = 0; k < 3; k++) {
    let x = 0;
    let y = 22 + k * 9;
    const v: [number, number][] = [[x, y]];
    while (x < W) {
      x += 6;
      y += (r0() - 0.5) * 3;
      v.push([x, y]);
    }
    veins.push(v);
  }
  const hairs: [number, number, number][] = [];
  for (let i = 0; i < 160; i++) hairs.push([GRAFT + 1 + r0() * (W - GRAFT - 1), r0() * H, r0()]);
  const moles: [number, number][] = [];
  for (let i = 0; i < 6; i++) moles.push([GRAFT + 4 + r0() * (W - GRAFT - 8), r0() * H]);

  const line = (pts: [number, number][], upTo: number) => {
    g.beginPath();
    let on = false;
    for (const [x, y] of pts) {
      if (x > upTo) break;
      if (!on) {
        g.moveTo(x, y);
        on = true;
      } else g.lineTo(x, y);
    }
    g.stroke();
  };
  let last = -1;
  const set = (k: number) => {
    const q = Math.round(k * 40) / 40;
    if (q === last) return;
    last = q;
    const r = rng(77);
    // 원래 피부 (팔꿈치 쪽): 따뜻하고 결이 있다
    g.fillStyle = '#c99a7c';
    g.fillRect(0, 0, W, H);
    for (let i = 0; i < 1400; i++) {
      g.fillStyle = r() < 0.5 ? `rgba(150,95,70,${0.06 + r() * 0.08})` : `rgba(235,190,160,${0.05 + r() * 0.07})`;
      g.fillRect(Math.floor(r() * W), Math.floor(r() * H), 1, 1);
    }
    // 정맥 (손목 안쪽이 더 진하다)
    g.lineWidth = 2;
    for (const v of veins) {
      g.strokeStyle = 'rgba(95,110,150,0.22)';
      line(v, W);
    }
    // 이식된 피부 (손목 쪽): 한 톤 밝고, 모공도 털도 없이 지나치게 매끈하다.
    // 흉터는 없다 (DRI: "처음부터 이렇게 자란 피부"). 경계는 털과 점이 끊기는 자리로만 보인다
    g.fillStyle = '#ddb49b';
    g.beginPath();
    g.moveTo(0, 0);
    edge.forEach((x, y) => g.lineTo(x, y));
    g.lineTo(0, H);
    g.closePath();
    g.fill();
    const sheen = g.createLinearGradient(0, 0, 0, H);
    sheen.addColorStop(0, 'rgba(255,235,225,0)');
    sheen.addColorStop(0.5, 'rgba(255,235,225,0.22)');
    sheen.addColorStop(1, 'rgba(255,235,225,0)');
    g.fillStyle = sheen;
    g.fillRect(0, 0, GRAFT, H);
    // 털과 점 (원래 피부에만 있다)
    for (const [x, y, a] of hairs) {
      g.fillStyle = `rgba(70,45,30,${0.25 + a * 0.3})`;
      g.fillRect(Math.floor(x), Math.floor(y), 2, 1);
    }
    for (const [x, y] of moles) {
      g.fillStyle = 'rgba(90,55,40,0.7)';
      g.fillRect(Math.floor(x), Math.floor(y), 2, 2);
    }
    // 뿌리 무늬: 피부 아래에서 자란다. 상처가 아니라 매끈하게 도드라진 결 (q가 클수록 멀리, 또렷하게)
    const reach = 30 + q * (W - 30);
    for (const cv of curves) {
      if (cv.at > q + 0.15) continue;
      g.strokeStyle = `rgba(150,105,95,${0.18 + q * 0.3})`;
      g.lineWidth = 2;
      line(
        cv.pts.map(([x, y]) => [x, y + 1] as [number, number]),
        reach,
      );
      g.strokeStyle = `rgba(255,236,226,${0.35 + q * 0.4})`;
      g.lineWidth = 1.5;
      line(cv.pts, reach);
    }
    t.needsUpdate = true;
  };
  set(0.1);
  return { tex: t, set };
}
