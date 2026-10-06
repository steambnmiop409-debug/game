import * as THREE from 'three';
import { tex } from './textures';

/**
 * 재질 목록. size = 텍스처 한 장이 덮는 실제 크기(미터). 지오메트리 UV는 미터 단위로 만든다.
 * 조명은 PBR(MeshStandardMaterial): 손전등과 형광등이 리놀륨 바닥에 번들거리는 병원 특유의 반사를 위해서.
 */

export interface MatDef {
  mat: THREE.Material;
  size: [number, number];
}

interface Spec {
  tex?: string;
  color?: number;
  size?: [number, number];
  rough?: number;
  metal?: number;
  emissive?: number;
  emissiveIntensity?: number;
  transparent?: boolean;
  opacity?: number;
  side?: THREE.Side;
  basic?: boolean;
  alphaTest?: number;
  vertexColors?: boolean;
  depthWrite?: boolean;
  blending?: THREE.Blending;
  polygonOffset?: boolean;
}

const SPECS: Record<string, Spec> = {
  // 바닥
  lino: { tex: 'lino', size: [1.2, 1.2], rough: 0.42 },
  lino_blue: { tex: 'lino_blue', size: [1.2, 1.2], rough: 0.42 },
  lino_dark: { tex: 'lino_dark', size: [1.2, 1.2], rough: 0.5 },
  tile_floor: { tex: 'tile_floor', size: [0.8, 0.8], rough: 0.3 },
  tile_white: { tex: 'tile_white', size: [0.6, 0.6], rough: 0.22 },
  carpet: { tex: 'carpet', size: [1, 1], rough: 1 },
  terrazzo: { tex: 'terrazzo', size: [2, 2], rough: 0.32 },
  foam: { tex: 'foam', size: [1.2, 1.2], rough: 0.9 },
  asphalt: { tex: 'asphalt', size: [3, 3], rough: 0.85 },
  road: { tex: 'road', size: [7, 4], rough: 0.8 },
  grass: { tex: 'grass', size: [3, 3], rough: 1 },
  wood_floor: { tex: 'wood_floor', size: [1.5, 1.5], rough: 0.6 },
  concrete: { tex: 'concrete', size: [2, 2], rough: 0.9 },
  metal_floor: { tex: 'metal_floor', size: [1, 1], rough: 0.45, metal: 0.4 },
  // 천장
  ceiling: { tex: 'ceiling', size: [1.2, 1.2], rough: 0.95 },
  // 벽
  paint_mint: { tex: 'paint_mint', size: [2, 2], rough: 0.85 },
  paint_sky: { tex: 'paint_sky', size: [2, 2], rough: 0.85 },
  paint_yellow: { tex: 'paint_yellow', size: [2, 2], rough: 0.85 },
  paint_cream: { tex: 'paint_cream', size: [2, 2], rough: 0.85 },
  paint_pink: { tex: 'paint_pink', size: [2, 2], rough: 0.85 },
  paint_white: { tex: 'paint_white', size: [2, 2], rough: 0.6 },
  paint_grey: { tex: 'paint_grey', size: [2, 2], rough: 0.85 },
  paint_lav: { tex: 'paint_lav', size: [2, 2], rough: 0.85 },
  wainscot: { tex: 'wainscot', size: [1.6, 1.1], rough: 0.6 },
  wainscot_mint: { tex: 'wainscot_mint', size: [1.6, 1.1], rough: 0.55 },
  wall_tile: { tex: 'wall_tile', size: [0.8, 0.8], rough: 0.25 },
  concrete_wall: { tex: 'concrete_wall', size: [2, 2], rough: 0.95 },
  mural: { tex: 'mural', size: [8, 2], rough: 0.85 },
  tissue: { tex: 'tissue', size: [1, 1], rough: 0.7 },
  // 문
  door_wood: { tex: 'door_wood', size: [1, 2.1], rough: 0.6 },
  door_metal: { tex: 'door_metal', size: [1, 2.1], rough: 0.5, metal: 0.3 },
  door_white: { tex: 'door_white', size: [1, 2.1], rough: 0.4 },
  elevator: { tex: 'elevator', size: [2, 2.4], rough: 0.3, metal: 0.55 },
  frame: { color: 0x8a8f8c, rough: 0.5, metal: 0.3 },
  frame_wood: { tex: 'wood_dark', size: [0.5, 0.5], rough: 0.6 },
  // 소품
  wood_dark: { tex: 'wood_dark', size: [0.6, 0.6], rough: 0.65 },
  wood_light: { tex: 'wood_light', size: [0.6, 0.6], rough: 0.6 },
  steel: { tex: 'steel', size: [0.5, 0.5], rough: 0.35, metal: 0.5 },
  chrome: { color: 0xc8cccc, rough: 0.2, metal: 0.7 },
  paint_metal: { tex: 'paint_metal', size: [0.6, 0.6], rough: 0.55, metal: 0.1 },
  mattress: { tex: 'mattress', size: [0.8, 0.8], rough: 0.8 },
  linen: { tex: 'linen', size: [0.6, 0.6], rough: 0.9 },
  plastic_white: { color: 0xe6e6e0, rough: 0.45 },
  plastic_grey: { color: 0x8a8e8e, rough: 0.5 },
  plastic_dark: { color: 0x2a2c2e, rough: 0.5 },
  plastic_red: { color: 0xb8352f, rough: 0.45 },
  plastic_yellow: { color: 0xdcae2c, rough: 0.45 },
  plastic_blue: { color: 0x3f6ea8, rough: 0.45 },
  plastic_green: { color: 0x4f8f5a, rough: 0.45 },
  plastic_pink: { color: 0xe895b0, rough: 0.5 },
  rubber: { color: 0x1c1c1c, rough: 0.95 },
  vinyl_seat: { color: 0x3f6f78, rough: 0.55 },
  vinyl_orange: { color: 0xc0743a, rough: 0.55 },
  cork: { color: 0xa87e52, rough: 1 },
  paper: { color: 0xf1efe6, rough: 0.95 },
  cardboard: { color: 0xa2825a, rough: 1 },
  gown: { tex: 'gown', size: [0.25, 0.25], rough: 0.9 },
  knit: { tex: 'knit', size: [0.15, 0.15], rough: 1 },
  coat: { tex: 'coat', size: [0.7, 0.7], rough: 0.85 },
  navy: { tex: 'navy', size: [0.3, 0.3], rough: 0.9 },
  plush: { tex: 'plush', size: [0.3, 0.3], rough: 1 },
  plush_light: { tex: 'plush_light', size: [0.3, 0.3], rough: 1 },
  skin: { tex: 'skin', size: [0.2, 0.2], rough: 0.65 },
  skin_pale: { color: 0xe9ddd3, rough: 0.55 },
  hair: { tex: 'hair', size: [0.2, 0.2], rough: 0.7 },
  trousers: { color: 0x3a3e46, rough: 0.9 },
  shoe: { color: 0x222222, rough: 0.5 },
  eye_plastic: { color: 0x0a0a0c, rough: 0.08, metal: 0.1 },
  glass: { color: 0x1d2a30, rough: 0.05, metal: 0.2, transparent: true, opacity: 0.35, depthWrite: false },
  glass_frost: { color: 0xb8c8c8, rough: 0.3, transparent: true, opacity: 0.55 },
  water: { color: 0x6a8a9a, rough: 0.05, transparent: true, opacity: 0.6 },
  curtain: { color: 0xa7c4b9, rough: 1, side: THREE.DoubleSide },
  curtain_red: { tex: 'stage_curtain', size: [1.5, 3], rough: 1, side: THREE.DoubleSide },
  brick: { tex: 'brick', size: [1.2, 0.6], rough: 0.95 },
  facade: { tex: 'facade', size: [12, 12], rough: 0.9 },
  chainlink: { tex: 'chainlink', size: [0.6, 0.6], rough: 0.6, metal: 0.4, alphaTest: 0.5, side: THREE.DoubleSide },
  ambulance: { tex: 'ambulance', size: [1, 1], rough: 0.4 },
  white_paint: { color: 0xe6e6e2, rough: 0.4 },
  car_paint: { color: 0x5a2228, rough: 0.35, metal: 0.25 },
  bark: { color: 0x3b2c22, rough: 1 },
  pine: { color: 0x1d2e24, rough: 1 },
  pine_light: { color: 0x29402f, rough: 1 },
  ball_red: { color: 0xc23b33, rough: 0.4 },
  ball_blue: { color: 0x3a6cc0, rough: 0.4 },
  ball_yellow: { color: 0xe0b52e, rough: 0.4 },
  ball_green: { color: 0x3f9a50, rough: 0.4 },
  vent: { tex: 'vent', size: [1, 0.85], rough: 0.5, metal: 0.3 },
  canvas_bin: { color: 0xc9c2ae, rough: 1, side: THREE.DoubleSide },
  // 빛나는 것
  fixture: { basic: true, color: 0xfff6e0 },
  fixture_off: { color: 0x9a9890, rough: 0.4 },
  exit: { tex: 'exit_sign', basic: true },
  screen_dark: { tex: 'tv_off', basic: true },
  dash_glow: { tex: 'dashboard', basic: true },
  red_led: { basic: true, color: 0xff3020 },
  green_led: { basic: true, color: 0x40ff60 },
  amber: { basic: true, color: 0xffa040 },
  headlight: { basic: true, color: 0xfffbe8 },
  black: { basic: true, color: 0x000000 },
  void: { basic: true, color: 0x020304 },
};

const cache = new Map<string, MatDef>();

/**
 * @param vc 정점 색(가짜 앰비언트 오클루전)을 쓰는가. 정점 색이 없는 지오메트리(캐릭터 등)는 false
 */
export function mat(key: string, vc = true): MatDef {
  const ck = vc ? key : key + '#nv';
  let m = cache.get(ck);
  if (m) return m;
  const s = SPECS[key];
  if (!s) throw new Error(`재질 없음: ${key}`);
  let material: THREE.Material;
  if (s.basic) {
    const mb = new THREE.MeshBasicMaterial({ color: s.color ?? 0xffffff, map: s.tex ? tex(s.tex) : null, fog: true });
    if (key === 'fixture' || key === 'headlight') mb.color.multiplyScalar(2.2);
    material = mb;
  } else {
    material = new THREE.MeshStandardMaterial({
      color: s.color ?? 0xffffff,
      map: s.tex ? tex(s.tex) : null,
      roughness: s.rough ?? 0.8,
      metalness: s.metal ?? 0,
      transparent: !!s.transparent,
      opacity: s.opacity ?? 1,
      side: s.side ?? THREE.FrontSide,
      vertexColors: vc && (s.vertexColors ?? true),
      depthWrite: s.depthWrite ?? true,
      alphaTest: s.alphaTest ?? 0,
    });
    if (s.emissive) {
      (material as THREE.MeshStandardMaterial).emissive.setHex(s.emissive);
      (material as THREE.MeshStandardMaterial).emissiveIntensity = s.emissiveIntensity ?? 1;
    }
  }
  material.name = key;
  m = { mat: material, size: s.size ?? [1, 1] };
  cache.set(ck, m);
  return m;
}

/** 텍스처 한 장을 그대로 붙이는 판 (포스터, 간판) */
export function decalMat(texName: string | THREE.Texture, opts: { rough?: number; emissive?: boolean; transparent?: boolean } = {}) {
  const t = typeof texName === 'string' ? tex(texName) : texName;
  const key = 'decal_' + (typeof texName === 'string' ? texName : t.uuid) + (opts.emissive ? '_e' : '');
  let m = cache.get(key);
  if (!m) {
    const material = opts.emissive
      ? new THREE.MeshBasicMaterial({ map: t, transparent: !!opts.transparent, fog: true })
      : new THREE.MeshStandardMaterial({
          map: t,
          roughness: opts.rough ?? 0.8,
          transparent: opts.transparent ?? false,
          alphaTest: opts.transparent ? 0.02 : 0,
          depthWrite: !opts.transparent,
          polygonOffset: true,
          polygonOffsetFactor: -2,
          polygonOffsetUnits: -2,
        });
    m = { mat: material, size: [1, 1] };
    cache.set(key, m);
  }
  return m.mat;
}
