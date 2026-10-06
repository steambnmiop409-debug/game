import * as THREE from 'three';
import { Level, type RoomDef, type OpeningDef } from './level';
import { Kit, bed, ivStand, cabinet, chair, table, wallTV, tvCart, curtainTrack, sink, handrail, crashCart, wheelchair, gurney, counter, crtMonitor, shelf, pottedPlant, bench, vending, fountain, extinguisher, wallClock, paperScatter, fallenTiles, wetSign, receptionDesk, hoppyPedestal, payphone, kidTable, ballPit, toyBlocks, stage, shapeStudio, washer, laundryCart, pine, fence, lightPole, sedan, ambulance, gate } from './props';
import { addFixtures } from './lights';
import { mat } from './materials';
import { plateTex, tex } from './textures';

/**
 * 챕터 1 공간 배치.
 *  ground   : 정문·주차장·건물 정면 + 로비(1층, 천장 9m) + 공중전화 + 경비실 + 엘리베이터
 *  ward     : 3층 소아 병동 (x+200). 창밖으로 주차장 디오라마(y = -9)
 *  basement : 지하 세탁실 → 무균실 (x+400)
 * 좌표: x 동쪽, z 남쪽, y 위. 단위 m.
 */

export interface TVRef {
  screen: THREE.Mesh;
  led: THREE.Mesh;
  pos: THREE.Vector3;
}

export interface World {
  level: Level;
  spawn: Record<string, { pos: THREE.Vector3; yaw: number }>;
  at: Record<string, THREE.Vector3>;
  tvs: Record<string, TVRef>;
  beds: Record<string, { under: THREE.Vector3; head: THREE.Vector3 }>;
  meshes: Record<string, THREE.Object3D>;
  ambulance: ReturnType<typeof ambulance>;
  poleLights: THREE.Vector3[];
  sedanDome: THREE.Vector3;
  /** 회진 순찰 경로 (병동 복도) */
  roundsPath: THREE.Vector3[];
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const W0 = 200; // 병동 x 오프셋
const B0 = 400; // 지하 x 오프셋

export function buildChapter1(): World {
  const L = new Level();
  const room = (d: RoomDef) => L.addRoom(d);
  const open = (d: OpeningDef) => L.addOpening(d);
  const at: Record<string, THREE.Vector3> = {};
  const tvs: Record<string, TVRef> = {};
  const beds: World['beds'] = {};
  const meshes: Record<string, THREE.Object3D> = {};
  const spawn: World['spawn'] = {};

  // ═══════════════════════════ 1층 (ground) ═══════════════════════════
  const g = new Kit(L, 'ground');

  room({ id: 'outside', x0: -30, z0: 0, x1: 30, z1: 58, outdoor: true, floor: 'grass', area: 'ground', reverb: 'outside', step: 'asphalt', name: 'outside', light: 'none', fogColor: 0x4a4f55, fogDensity: 0.05, heart: 0.3 });
  room({ id: 'lobby', x0: -8, z0: -14, x1: 8, z1: 0, h: 9, floor: 'terrazzo', wall: 'paint_cream', wain: 'wainscot', wainH: 1.2, area: 'ground', reverb: 'lobby', step: 'tile', name: 'lobby', light: 'flicker', skin: 'facade', skinH: 12, fogColor: 0x1d252b, fogDensity: 0.03, fixtures: [[-4, -4], [4, -4], [-4, -10], [4, -10], [0, -7]] });
  room({ id: 'booth', x0: -11, z0: -6, x1: -8, z1: -2, h: 3, floor: 'lino_dark', wall: 'paint_grey', area: 'ground', reverb: 'ward', step: 'lino', name: 'booth', light: 'dim', fixtures: [[-9.5, -4]] });
  room({ id: 'security', x0: 8, z0: -12, x1: 13, z1: -7, h: 2.8, floor: 'carpet', wall: 'paint_grey', wain: 'wainscot', area: 'ground', reverb: 'ward', step: 'carpet', name: 'security', light: 'off', fixtures: [[10.5, -9.5]] });
  room({ id: 'carG', x0: -6, z0: -16.5, x1: -4, z1: -14, h: 2.5, floor: 'lino_dark', wall: 'steel', area: 'ground', reverb: 'elevator', step: 'metal', name: 'elevator', light: 'on', fixtures: [[-5, -15.25]] });
  room({ id: 'carG2', x0: 4, z0: -16.5, x1: 6, z1: -14, h: 2.5, floor: 'lino_dark', wall: 'steel', area: 'ground', reverb: 'elevator', step: 'metal', light: 'off' });

  open({ x0: -1, z0: 0, x1: 1, z1: 0, kind: 'double', id: 'entrance', mat: 'door_white', open: true, swing: -1 });
  open({ x0: -7, z0: 0, x1: -3, z1: 0, kind: 'window', sill: 0.9, top: 3.4 });
  open({ x0: 3, z0: 0, x1: 7, z1: 0, kind: 'window', sill: 0.9, top: 3.4 });
  open({ x0: -8, z0: -5.5, x1: -8, z1: -2.5, kind: 'arch', top: 2.6 });
  open({ x0: 8, z0: -9, x1: 8, z1: -8, kind: 'door', id: 'security', mat: 'door_metal', swing: 1 });
  open({ x0: -6, z0: -14, x1: -4, z1: -14, kind: 'elevator', id: 'elevG' });
  open({ x0: 4, z0: -14, x1: 6, z1: -14, kind: 'elevator', id: 'elevG2', locked: true });
  open({ x0: -8, z0: -12, x1: -8, z1: -11, kind: 'door', id: 'stairG', mat: 'door_metal', locked: true });
  open({ x0: 8, z0: -13.5, x1: 8, z1: -12, kind: 'double', id: 'clinic', mat: 'door_white', locked: true });

  // 건물 정면 (로비 바깥 피부 말고 나머지)
  g.at(0, 0, 0);
  for (const [x0, x1] of [
    [-26, -8.3],
    [8.3, 26],
  ]) {
    g.box('facade', (x0 + x1) / 2, 0, 0, x1 - x0, 12, 0.6);
  }
  g.box('facade', -26, 0, -16, 0.6, 12, 32);
  g.box('facade', 26, 0, -16, 0.6, 12, 32);
  g.box('concrete', 0, 12, -0.5, 52.6, 0.5, 1.2);
  L.addBox(-17, 0, 17.4, 0.6, 12);
  L.addBox(17, 0, 17.4, 0.6, 12);
  // 차양
  g.box('concrete', 0, 3.3, 1.8, 7, 0.35, 3.6);
  for (const s of [-1, 1]) {
    g.cyl('concrete', s * 3.1, 0, 3.3, 0.16, 3.3, 10);
    L.addBox(s * 3.1, 3.3, 0.35, 0.35, 3.3);
  }
  g.decal('center_sign', 0, 4.4, 0.32, 5, 1.25);
  // 진입로, 주차장
  L.batch('ground').flat('asphalt', -3.5, 3.6, 3.5, 58, 0.02, true, undefined, 4);
  L.batch('ground').flat('asphalt', 6, 3, 22, 22, 0.018, true, undefined, 4);
  L.batch('ground').flat('concrete', -4, 0.3, 4, 3.6, 0.025, true, undefined, 2);
  // 정문, 담장
  gate(g, 0, 40);
  fence(g, -30, 40, -4.8, 40);
  fence(g, 4.8, 40, 30, 40);
  // 소나무
  const pr = g.r;
  for (let i = 0; i < 46; i++) {
    const x = (pr() < 0.5 ? -1 : 1) * (7 + pr() * 22);
    const z = 6 + pr() * 50;
    if (x > 5 && x < 23 && z < 23) continue;
    pine(g, x, z, 7 + pr() * 6);
  }
  for (let i = 0; i < 20; i++) pine(g, -28 + i * 3 + pr(), 60 + pr() * 6, 8 + pr() * 5);
  const pole1 = lightPole(g, 5, 10, Math.PI / 2);
  const pole2 = lightPole(g, -5, 24, -Math.PI / 2);
  // 버려진 차 두 대
  sedan(g, 10, 12, 0.3);
  sedan(g, 17, 8, -0.1);
  // 구급차 (정문 바깥, 건물을 향해)
  const amb = ambulance(g, 1.5, 46, Math.PI);
  spawn.gate = { pos: V(-1.2, 0, 43), yaw: 0 };
  at.marcusWalk = V(18, 0, 56);

  // ── 로비 ──
  hoppyPedestal(g, 0, -6.5);
  at.pedestal = V(0, 1.6, -6.5);
  receptionDesk(g, 4.8, -10.6, 0);
  g.at(0, 0, 0);
  g.decal('slogan', 0, 5.6, -13.9, 10, 1.9);
  g.at(-8, -8.6, Math.PI / 2);
  g.box('wood_dark', 0, 1.7, 0.11, 1.36, 1.8, 0.06);
  g.decal('portrait', 0, 2.6, 0.145, 1.2, 1.6);
  at.portrait = V(-7.8, 2.4, -8.6);
  g.at(8, -3, -Math.PI / 2);
  g.box('wood_dark', 0, 0.45, 0.1, 3.8, 3.1, 0.04);
  g.decal('letters', 0, 2.0, 0.125, 3.6, 2.9);
  meshes.myDrawing = g.decal('my_drawing', 1.45, 0.82, 0.132, 0.42, 0.42);
  at.letters = V(7.8, 1.7, -3);
  at.myDrawing = V(7.8, 0.82, -1.55);
  g.at(-8, -1.4, Math.PI / 2);
  g.decal('poster_chance', 0, 1.7, 0.1, 0.8, 1.0);
  at.posterChance = V(-7.9, 1.7, -1.4);
  g.at(8, -6.4, -Math.PI / 2);
  g.decal('poster_swap', 0, 1.7, 0.1, 0.8, 1.0);
  at.posterSwap = V(7.9, 1.7, -6.4);
  g.at(-8, -11.5, Math.PI / 2);
  g.decal('stair_sign', 0, 2.35, 0.1, 0.8, 0.4);
  at.stair = V(-7.9, 1.6, -11.5);
  g.at(0, 0, Math.PI);
  g.decal('exit_sign', 0, 2.75, 0.12, 0.6, 0.3, { emissive: true });
  bench(g, -4.2, -2.4, Math.PI, 4);
  bench(g, 4.2, -2.4, Math.PI, 4);
  bench(g, -5.5, -11.0, Math.PI / 2, 3);
  for (const [x, z] of [
    [-7.2, -0.9],
    [7.2, -0.9],
    [-7.2, -13.2],
    [2.0, -13.2],
  ])
    pottedPlant(g, x, z);
  vending(g, -7.45, -6.8, Math.PI / 2);
  fountain(g, -7.95, -9.8, Math.PI / 2);
  wheelchair(g, -2.5, -9.6, 0.7);
  fallenTiles(g, 3, -3.4, 5);
  wetSign(g, -2.2, -1.5, 0.4);
  paperScatter(g, 5.6, -8.8, 12, 2.2);
  extinguisher(g, 8, -6.9, -Math.PI / 2);
  wallClock(g, 0, -14, 0, 3.4);
  at.clock = V(0, 3.4, -13.8);
  // 낙엽 (깨진 창으로 들어왔다)
  for (let i = 0; i < 6; i++) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(1.4, 1.4), new THREE.MeshStandardMaterial({ map: tex('leaves'), transparent: true, alphaTest: 0.3, roughness: 1, depthWrite: false }));
    m.rotation.x = -Math.PI / 2;
    m.rotation.z = pr() * 6;
    m.position.set(-5 + pr() * 3, 0.02 + i * 0.001, -0.8 - pr() * 2);
    m.receiveShadow = true;
    L.areaGroup('ground').add(m);
  }
  // 오리엔테이션 TV (테이프 #1)
  tvs.orientation = tvCart(g, 1.4, -12.9, 0);
  at.orientation = tvs.orientation.pos;
  // 엘리베이터 호출판
  g.at(-3.6, -14, 0);
  g.box('steel', 0, 1.1, 0.1, 0.14, 0.26, 0.04);
  meshes.callBtn = g.mesh(new THREE.BoxGeometry(0.05, 0.05, 0.02), mat('amber', false).mat, 0, 1.22, 0.13);
  at.elevG = V(-5, 1.2, -13.6);
  g.at(3.6, -14, 0);
  g.decal('stair_sign', 1.4, 2.6, 0.1, 0.6, 0.3);
  // 엘리베이터 내부 조작판
  g.at(-4, -15.25, -Math.PI / 2);
  g.box('steel', 0, 0.9, 0.1, 0.3, 0.6, 0.04);
  for (let i = 0; i < 4; i++) g.box(i === 3 ? 'amber' : 'plastic_white', 0, 0.98 + i * 0.12, 0.125, 0.06, 0.06, 0.02);
  at.carPanelG = V(-4.15, 1.2, -15.25);
  spawn.carG = { pos: V(-5, 0, -15.6), yaw: 0 };

  // ── 공중전화 ──
  const phone = payphone(g, -10.4, -4, Math.PI / 2);
  meshes.handset = phone.handset;
  meshes.cord = phone.cord;
  at.handset = phone.pos;
  at.booth = V(-10.2, 1.4, -4);
  g.at(-11, -2.6, Math.PI / 2);
  g.decal('poster_shape', 0, 1.7, 0.1, 0.6, 0.75);
  at.posterShape = V(-10.9, 1.7, -2.6);

  // ── 경비실 ──
  table(g, 11.6, -10.9, 0, 2.2, 0.8, 0.76, 'wood_dark');
  crtMonitor(g, 11.0, -11.15, 0, 0.78);
  crtMonitor(g, 11.5, -11.2, 0, 0.78);
  crtMonitor(g, 12.0, -11.15, 0, 0.78);
  chair(g, 11.4, -10.0, Math.PI, 'vinyl_seat');
  shelf(g, 12.55, -8.2, -Math.PI / 2, 1.4, 1.8, 0.45, 'files');
  // 충전 거치대 위의 재지시기
  g.at(10.4, -10.9, 0);
  g.box('plastic_dark', 0, 0.76, 0, 0.3, 0.06, 0.2);
  meshes.toolDock = g.mesh(new THREE.BoxGeometry(0.08, 0.04, 0.02), mat('green_led', false).mat, 0.1, 0.82, 0.1);
  meshes.toolOnDock = g.mesh(new THREE.BoxGeometry(0.1, 0.06, 0.24), mat('plastic_grey', false).mat, -0.02, 0.85, 0);
  at.tool = V(10.4, 0.9, -10.9);
  // 카드 걸이
  g.at(13, -10, -Math.PI / 2);
  g.box('cork', 0, 1.3, 0.1, 0.6, 0.45, 0.03);
  meshes.card = g.mesh(new THREE.BoxGeometry(0.08, 0.05, 0.005), mat('plastic_white', false).mat, 0.1, 1.42, 0.135);
  at.card = V(12.85, 1.42, -10.1);
  // 빈 쥐 우리 (판독 연습)
  g.at(9.0, -11.6, 0);
  g.box('steel', 0, 0, 0, 0.6, 0.9, 0.4);
  g.box('glass', 0, 0.9, 0, 0.42, 0.24, 0.3);
  g.box('steel', 0, 1.14, 0, 0.44, 0.02, 0.32);
  at.cage = V(9.0, 1.0, -11.6);
  L.addBox(9.0, -11.6, 0.6, 0.4, 1.2);
  // 테이프 #2 (DRI 시연)
  tvs.demo = tvCart(g, 9.3, -7.7, Math.PI * 0.75);
  at.demo = tvs.demo.pos;
  // 경비 일지
  g.at(12.2, -10.6, 0);
  g.box('paper', 0, 0.78, 0, 0.3, 0.01, 0.22, 0.2, { aoFloor: false });
  at.securityLog = V(12.2, 0.8, -10.6);

  // ═══════════════════════════ 3층 소아 병동 (ward) ═══════════════════════════
  const w = new Kit(L, 'ward');
  const wx = (x: number) => x + W0;
  const wardRoom = (id: string, x0: number, z0: number, x1: number, z1: number, wall: string, extra: Partial<RoomDef> = {}) =>
    room({ id, x0: wx(x0), z0, x1: wx(x1), z1, h: 2.9, floor: 'lino', wall, wain: 'wainscot_mint', area: 'ward', reverb: 'ward', step: 'lino', name: id, light: 'dim', fogColor: 0x182026, fogDensity: 0.04, ...extra });

  wardRoom('el3', -8, -3, -2, 6, 'paint_sky', { floor: 'lino_blue', reverb: 'corridor', light: 'dim', fixtures: [[wx(-5), 1.5]] });
  room({ id: 'carW', x0: wx(-6), z0: 6, x1: wx(-4), z1: 8.5, h: 2.5, floor: 'lino_dark', wall: 'steel', area: 'ward', reverb: 'elevator', step: 'metal', name: 'elevator', light: 'on', fixtures: [[wx(-5), 7.25]] });
  wardRoom('corridor', -2, 0, 34, 3, 'paint_cream', { reverb: 'corridor', light: 'flicker', fixtures: [0, 4.5, 9, 13.5, 18, 22.5, 27, 31.5].map((x) => [wx(x), 1.5] as [number, number]) });
  const north = [
    ['r301', -2, 'paint_sky'],
    ['r302', 4, 'paint_mint'],
    ['r303', 10, 'paint_yellow'],
    ['r304', 16, 'paint_pink'],
    ['r305', 22, 'paint_lav'],
    ['r306', 28, 'paint_grey'],
  ] as const;
  for (const [id, x0, wall] of north) {
    wardRoom(id, x0, -6, x0 + 6, 0, wall, { light: id === 'r304' ? 'off' : id === 'r306' ? 'flicker' : 'dim', fixtures: [[wx(x0 + 3), -3]] });
    open({ x0: wx(x0 + 1), z0: 0, x1: wx(x0 + 2), z1: 0, kind: 'door', id, swing: -1, open: id !== 'r304' });
    open({ x0: wx(x0 + 2.5), z0: -6, x1: wx(x0 + 4.5), z1: -6, kind: 'window', sill: 0.95, top: 2.3 });
  }
  wardRoom('lounge', -2, 3, 4, 9, 'paint_yellow', { light: 'off', floor: 'carpet', step: 'carpet', fixtures: [[wx(1), 6]] });
  wardRoom('nurse', 4, 3, 12, 8, 'paint_white', { light: 'on', fixtures: [[wx(6), 5.5], [wx(10), 5.5]] });
  const south = [
    ['r307', 12, 'paint_mint'],
    ['r308', 18, 'paint_sky'],
    ['r309', 24, 'paint_yellow'],
  ] as const;
  for (const [id, x0, wall] of south) {
    wardRoom(id, x0, 3, x0 + 6, 9, wall, { light: 'dim', fixtures: [[wx(x0 + 3), 6]] });
    open({ x0: wx(x0 + 1), z0: 3, x1: wx(x0 + 2), z1: 3, kind: 'door', id, swing: 1, open: true });
    open({ x0: wx(x0 + 2.5), z0: 9, x1: wx(x0 + 4.5), z1: 9, kind: 'window', sill: 0.95, top: 2.3 });
  }
  wardRoom('supply', 30, 3, 34, 9, 'paint_grey', { light: 'off', fixtures: [[wx(32), 6]] });
  wardRoom('playroom', 34, -6, 44, 9, 'paint_yellow', { h: 3.4, floor: 'foam', step: 'carpet', reverb: 'playroom', light: 'dim', wain: null, fixtures: [[wx(36.5), -3], [wx(41.5), -3], [wx(36.5), 2], [wx(41.5), 2], [wx(36.5), 6.5], [wx(41.5), 6.5]] });
  wardRoom('back', 33, 9, 44, 11, 'concrete_wall', { floor: 'concrete', step: 'tile', wain: null, h: 2.6, light: 'flicker', reverb: 'corridor', fixtures: [[wx(36), 10], [wx(41), 10]] });
  room({ id: 'vent', x0: wx(30), z0: 9.5, x1: wx(33), z1: 10.5, h: 0.9, floor: 'metal_floor', wall: 'steel', ceil: 'steel', area: 'ward', reverb: 'vent', step: 'metal', name: 'vent', light: 'none', low: true });
  wardRoom('laundry', 24, 9, 30, 16, 'wall_tile', { floor: 'tile_floor', step: 'tile', wain: null, h: 3, reverb: 'laundry', light: 'flicker', fixtures: [[wx(27), 11], [wx(27), 14]] });

  open({ x0: wx(-2), z0: 0, x1: wx(-2), z1: 3, kind: 'arch', top: 2.6 });
  open({ x0: wx(-6), z0: 6, x1: wx(-4), z1: 6, kind: 'elevator', id: 'elevW' });
  open({ x0: wx(-6), z0: -3, x1: wx(-5), z1: -3, kind: 'door', id: 'stairW', mat: 'door_metal', locked: true });
  open({ x0: wx(-8), z0: 0.5, x1: wx(-8), z1: 2.5, kind: 'window', sill: 0.95, top: 2.3 });
  open({ x0: wx(0), z0: 3, x1: wx(1), z1: 3, kind: 'door', id: 'lounge', swing: 1, open: true });
  open({ x0: wx(5), z0: 3, x1: wx(11), z1: 3, kind: 'arch', top: 2.4 });
  open({ x0: wx(31), z0: 3, x1: wx(32), z1: 3, kind: 'door', id: 'supply', swing: 1, mat: 'door_metal' });
  open({ x0: wx(34), z0: 0.5, x1: wx(34), z1: 2.5, kind: 'double', id: 'playroom', mat: 'door_white', locked: true, swing: 1 });
  open({ x0: wx(42), z0: 9, x1: wx(43), z1: 9, kind: 'door', id: 'staff', mat: 'door_metal', locked: true, swing: 1 });
  open({ x0: wx(33), z0: 9.5, x1: wx(33), z1: 10.5, kind: 'vent' });
  open({ x0: wx(30), z0: 9.5, x1: wx(30), z1: 10.5, kind: 'vent' });

  // 엘리베이터 홀
  w.at(wx(-8), 4.5, Math.PI / 2);
  w.decal(plateTex('3  PEDIATRICS'), 0, 2.2, 0.1, 1.2, 0.6);
  w.at(wx(-5.5), -3, 0);
  w.decal('stair_sign', 0, 2.4, 0.1, 0.7, 0.35);
  at.stairW = V(wx(-5.5), 1.5, -2.9);
  bench(w, wx(-7.4), 0.0, Math.PI / 2, 3);
  pottedPlant(w, wx(-7.3), 5.3);
  w.at(wx(-3.6), 6, Math.PI);
  w.box('steel', 0, 1.1, 0.1, 0.14, 0.26, 0.04);
  at.elevW = V(wx(-5), 1.2, 5.6);
  w.at(wx(-4), 7.25, -Math.PI / 2);
  w.box('steel', 0, 0.9, 0.1, 0.3, 0.6, 0.04);
  spawn.carW = { pos: V(wx(-5), 0, 7.6), yaw: Math.PI };

  // 복도: 손잡이 레일, 표지, 시계, 바퀴 침대
  handrail(w, wx(-1.5), 0.1, wx(33.5), 0.1, 0);
  handrail(w, wx(-1.5), 2.9, wx(33.5), 2.9, 0);
  gurney(w, wx(24.5), 2.1, Math.PI / 2 + 0.1);
  wheelchair(w, wx(15.2), 2.3, -0.5);
  ivStand(w, wx(8.5), 0.55, false);
  wallClock(w, wx(13), 3, Math.PI, 2.4);
  for (const [x, z, r, p] of [
    [3.2, 0, 0, 'poster_rounds'],
    [21.2, 3, Math.PI, 'poster_lights'],
    [27.4, 0, 0, 'poster_swap'],
  ] as [number, number, number, string][]) {
    w.at(wx(x), z, r);
    w.decal(p, 0, 1.75, z === 0 ? 0.1 : -0.1, 0.9, p === 'poster_swap' ? 1.1 : 0.45);
    at[p] = V(wx(x), 1.7, z === 0 ? 0.15 : 2.85);
  }
  // 문 옆 방 번호판
  for (const [id, x0] of north) {
    w.at(wx(x0 + 2.4), 0, 0);
    w.decal(plateTex(id.slice(1)), 0, 2.0, 0.1, 0.32, 0.16);
  }
  for (const [id, x0] of south) {
    w.at(wx(x0 + 2.4), 3, Math.PI);
    w.decal(plateTex(id.slice(1)), 0, 2.0, 0.1, 0.32, 0.16);
  }
  w.at(wx(1.6), 3, Math.PI);
  w.decal(plateTex('STAFF'), 0, 2.0, 0.1, 0.32, 0.16);
  w.at(wx(34), 1.5, -Math.PI / 2);
  w.decal('hhh_logo', 0, 2.65, 0.1, 1.6, 0.8);
  w.decal('poster_shape', 1.6, 1.6, 0.1, 0.6, 0.75);

  // 북쪽 병실 (각 방 하나의 이야기)
  const northSetup = (id: string, x0: number, tv: boolean, messy = false) => {
    const cx = wx(x0 + 3);
    const b = bed(w, cx - 1.2, -3.2, 0, { messy, blanket: messy ? 'linen' : 'gown' });
    beds[id] = b;
    cabinet(w, cx - 2.35, -5.4, 0);
    ivStand(w, cx - 0.2, -4.6);
    chair(w, cx + 1.4, -1.6, -2.4);
    curtainTrack(w, cx + 0.15, -3.2, Math.PI / 2, 3.6, 2.85, 0.35);
    // 차트 클립보드 (침대 발치)
    w.at(cx - 1.2, -2.15, 0);
    w.box('cardboard', 0, 0.5, 0.02, 0.26, 0.34, 0.015);
    w.decal('room_chart', 0, 0.7, 0.032, 0.2, 0.3);
    at['chart_' + id] = V(cx - 1.2, 0.7, -2.1);
    if (tv) {
      tvs[id] = wallTV(w, cx + 2.6, -5.2, -Math.PI / 4, 2.0);
      at['tv_' + id] = tvs[id].pos;
    }
  };
  northSetup('r301', -2, true);
  northSetup('r302', 4, false, true);
  northSetup('r303', 10, true);
  northSetup('r304', 16, false);
  northSetup('r305', 22, true);
  northSetup('r306', 28, true, true);
  // 302: 우나가 있던 침대 밑의 크레용
  w.at(wx(5.8), -3.0, 0.4);
  w.box('plastic_red', 0, 0.01, 0, 0.012, 0.012, 0.09, 0, { aoFloor: false });
  // 304: 1994년 화상 병동 — 주인공의 방
  w.at(wx(17.0), 0, 0);
  w.decal('height_marks', 0.04, 1.2, -0.1, 0.2, 0.8, { r: Math.PI });
  at.heightMarks = V(wx(17.05), 1.1, -0.2);
  w.at(wx(21.95), -2.5, -Math.PI / 2);
  w.decal('mood_chart', 0, 1.5, 0.1, 0.6, 0.6);
  at.moodChart = V(wx(21.9), 1.5, -2.5);
  // 304 정수기
  w.at(wx(21.4), -0.7, -Math.PI / 2);
  w.box('plastic_white', 0, 0, 0, 0.35, 1.0, 0.35);
  w.cyl('water', 0, 1.0, 0, 0.13, 0.42, 10);
  at.water = V(wx(21.4), 1.0, -0.7);
  L.addBox(wx(21.4), -0.7, 0.4, 0.4, 1.4);
  at.window304 = V(wx(19.5), 1.6, -5.9);

  // 남쪽 병실
  const southSetup = (id: string, x0: number, tv: boolean) => {
    const cx = wx(x0 + 3);
    const b = bed(w, cx + 1.2, 6.2, Math.PI);
    beds[id] = b;
    cabinet(w, cx + 2.35, 8.4, Math.PI);
    ivStand(w, cx + 0.2, 7.6);
    chair(w, cx - 1.4, 4.6, 0.7);
    curtainTrack(w, cx - 0.15, 6.2, Math.PI / 2, 3.6, 2.85, 0.4);
    w.at(cx + 1.2, 5.15, Math.PI);
    w.box('cardboard', 0, 0.5, 0.02, 0.26, 0.34, 0.015);
    w.decal('room_chart', 0, 0.7, 0.032, 0.2, 0.3);
    at['chart_' + id] = V(cx + 1.2, 0.7, 5.1);
    if (tv) {
      tvs[id] = wallTV(w, cx - 2.6, 8.2, (Math.PI * 3) / 4, 2.0);
      at['tv_' + id] = tvs[id].pos;
    }
  };
  southSetup('r307', 12, true);
  southSetup('r308', 18, false);
  southSetup('r309', 24, true);

  // 직원 휴게실 (2001년 3월에 멈춘 방)
  table(w, wx(1.5), 6.5, 0, 1.6, 0.9, 0.74, 'wood_light');
  for (const [x, z, r] of [
    [0.8, 5.8, 0],
    [2.2, 5.8, 0],
    [0.8, 7.2, Math.PI],
    [2.2, 7.2, Math.PI],
  ] as [number, number, number][])
    chair(w, wx(x), z, r, 'vinyl_orange');
  w.at(wx(1.5), 6.5, 0);
  for (let i = 0; i < 5; i++) w.cyl(['plastic_white', 'plastic_blue', 'plastic_red', 'plastic_yellow', 'plastic_green'][i], -0.5 + i * 0.25, 0.74, (i % 2) * 0.2 - 0.1, 0.04, 0.1, 8);
  at.mugs = V(wx(1.5), 0.85, 6.5);
  w.at(wx(-2), 7.5, Math.PI / 2);
  w.decal('calendar', 0, 1.65, 0.1, 0.5, 0.62);
  at.calendar = V(wx(-1.9), 1.6, 7.5);
  tvs.lounge = wallTV(w, wx(3.9), 4.2, -Math.PI / 2 - 0.3, 2.0);
  at.tv_lounge = tvs.lounge.pos;
  vending(w, wx(-1.5), 3.8, Math.PI / 2);

  // 간호사실: 계산대, 모니터, 응급 카트, 테이프 #3
  counter(w, wx(7), 3.6, Math.PI, 4.0, 1.05);
  crtMonitor(w, wx(5.8), 4.1, Math.PI, 1.09);
  crtMonitor(w, wx(8.2), 4.1, Math.PI, 1.09);
  chair(w, wx(7), 4.8, 0.2);
  chair(w, wx(9.8), 4.9, -0.4);
  shelf(w, wx(11.5), 6.5, -Math.PI / 2, 1.6, 1.9, 0.4, 'files');
  shelf(w, wx(4.5), 6.6, Math.PI / 2, 1.4, 1.9, 0.4, 'files');
  crashCart(w, wx(10.9), 4.4, -Math.PI / 2);
  tvs.intake = tvCart(w, wx(7.6), 7.3, 0.2);
  at.intake = tvs.intake.pos;
  sink(w, wx(5.8), 8, Math.PI);
  paperScatter(w, wx(8), 5.6, 9, 2.4);
  w.at(wx(8), 3.55, Math.PI);
  w.decal(plateTex("NURSES' STATION"), 0, 2.2, -0.5, 1.4, 0.35);

  // 물품 창고
  shelf(w, wx(31), 8.3, Math.PI, 1.6, 2.0, 0.45, 'linen');
  shelf(w, wx(33.4), 5.5, -Math.PI / 2, 1.6, 2.0, 0.45, 'boxes');
  at.supply = V(wx(32), 1, 6);

  // 놀이방: 모양 공방, 무대, 볼풀, 장난감
  w.at(wx(34), 0, 0);
  for (const [x, z, r] of [
    [39, -6, 0],
    [44, 1.5, -Math.PI / 2],
    [39, 9, Math.PI],
  ] as [number, number, number][]) {
    w.at(wx(x), z, r);
    w.decal('mural', 0, 2.6, r === 0 ? 0.1 : 0.1, 6, 1.5);
  }
  const studio = shapeStudio(w, wx(38.6), -4.3, 0);
  meshes.studioFrame = studio.frame;
  at.studioSlot = studio.slotPos;
  at.studioPanel = studio.panelPos;
  at.studioOut = studio.outPos;
  tvs.studio = wallTV(w, wx(36.0), -5.6, 0.25, 2.3);
  stage(w, wx(43), 3.5, -Math.PI / 2, 4.5, 2.0);
  at.stage = V(wx(43.1), 0.45, 3.5);
  at.hoppySeat = V(wx(43.3), 0.45, 3.5);
  w.at(wx(43.3), 3.5, -Math.PI / 2);
  w.box('plastic_red', 0, 0.45, 0, 0.7, 0.5, 0.6);
  ballPit(w, wx(37.6), 6.5, 3, 2.6);
  kidTable(w, wx(37.4), 1.0);
  kidTable(w, wx(40.6), 0.2);
  toyBlocks(w, wx(39.5), 3.2, 14);
  shelf(w, wx(43.5), -4.2, -Math.PI / 2, 1.8, 1.4, 0.4, 'toys');
  shelf(w, wx(35.4), -1.6, Math.PI / 2, 1.6, 1.4, 0.4, 'toys');
  w.at(wx(42.5), 9, Math.PI);
  w.decal(plateTex('STAFF ONLY'), 0, 2.25, 0.1, 0.5, 0.2);
  at.staffDoor = V(wx(42.5), 1.2, 8.8);

  // 직원 통로 → 환기 통로 → 세탁실
  // 떨어져 나온 환기구 덮개 (바닥에 기대 있다)
  w.at(wx(33.6), 10.6, Math.PI / 2);
  w.box('vent', 0, 0.0, 0.0, 0.9, 0.8, 0.02, 0.25, { aoFloor: false });
  at.ventIn = V(wx(33.3), 0.5, 10);
  shelf(w, wx(38), 10.75, Math.PI, 1.6, 1.8, 0.3, 'linen');
  at.backMid = V(wx(37), 0, 10);
  washer(w, wx(25), 15.2, Math.PI);
  washer(w, wx(26.1), 15.2, Math.PI);
  washer(w, wx(27.2), 15.2, Math.PI);
  laundryCart(w, wx(28.5), 12.5, 0.4);
  shelf(w, wx(29.6), 14.6, -Math.PI / 2, 1.4, 1.8, 0.45, 'linen');
  // 세탁물 투입구 (서쪽 벽)
  w.at(wx(24), 12.5, Math.PI / 2);
  w.box('steel', 0, 0.75, 0.05, 0.9, 1.0, 0.1);
  w.box('plastic_dark', 0, 0.85, 0.11, 0.7, 0.7, 0.02);
  meshes.chuteLid = w.mesh(new THREE.BoxGeometry(0.72, 0.72, 0.03), mat('steel', false).mat, 0, 1.21, 0.13);
  w.decal(plateTex('SOILED LINEN'), 0, 1.9, 0.1, 0.6, 0.18);
  at.chute = V(wx(24.3), 1.2, 12.5);

  // 회진 경로 (엘리베이터 홀 ↔ 복도 끝)
  const roundsPath = [V(wx(-5), 0, 1.5), V(wx(4), 0, 1.5), V(wx(14), 0, 1.5), V(wx(24), 0, 1.5), V(wx(32.5), 0, 1.5)];

  // 창밖 디오라마: 3층 아래의 주차장 (y = -9)
  const d = L.batch('ward');
  d.flat('asphalt', wx(-30), -80, wx(70), -6.5, -9, true, undefined, 6);
  d.flat('grass', wx(-30), 9.5, wx(70), 70, -9, true, undefined, 6);
  d.flat('grass', wx(-40), -80, wx(-12), 70, -9.01, true, undefined, 6);
  const dk = new Kit(L, 'ward');
  const sedanDome = sedan(dk, wx(19.2), -24, 0.5, -9);
  const pole3 = lightPole(dk, wx(15), -20, 0.3, 7, -9);
  for (let i = 0; i < 28; i++) {
    const x = wx(-30 + dk.r() * 100);
    const z = dk.r() < 0.5 ? -45 - dk.r() * 30 : 25 + dk.r() * 40;
    pine(dk, x, z, 9 + dk.r() * 6, -9);
  }
  // ── 주차장 줄
  for (let i = 0; i < 8; i++) {
    dk.at(wx(10 + i * 3), -28, 0, -9);
    dk.box('paint_white', 0, 0.005, 0, 0.12, 0.01, 5, 0, { aoFloor: false });
  }

  // ═══════════════════════════ 지하 (basement) ═══════════════════════════
  const b = new Kit(L, 'basement');
  const bx = (x: number) => x + B0;
  room({ id: 'b_laundry', x0: bx(0), z0: 0, x1: bx(10), z1: 9, h: 3.6, floor: 'concrete', wall: 'concrete_wall', area: 'basement', reverb: 'laundry', step: 'tile', name: 'basement', light: 'flicker', fogColor: 0x141818, fogDensity: 0.05, fixtures: [[bx(3), 3], [bx(7.5), 3], [bx(3), 7], [bx(7.5), 7]] });
  room({ id: 'b_hall', x0: bx(10), z0: 3.5, x1: bx(17), z1: 5.5, h: 2.7, floor: 'lino_dark', wall: 'paint_grey', wain: 'wainscot', area: 'basement', reverb: 'corridor', step: 'lino', name: 'b_hall', light: 'dim', fixtures: [[bx(12), 4.5], [bx(15.5), 4.5]] });
  room({ id: 'airlock', x0: bx(17), z0: 3, x1: bx(19), z1: 6, h: 2.5, floor: 'tile_white', wall: 'wall_tile', area: 'basement', reverb: 'clean', step: 'tile', name: 'airlock', light: 'on', fixtures: [[bx(18), 4.5]] });
  room({ id: 'clean', x0: bx(19), z0: 0, x1: bx(28), z1: 9, h: 3, floor: 'tile_white', wall: 'paint_white', wain: 'wall_tile', wainH: 1.4, area: 'basement', reverb: 'clean', step: 'tile', name: 'clean', light: 'on', fogColor: 0x262c30, fogDensity: 0.012, heart: 0.15, fixtures: [[bx(21.5), 2.5], [bx(25.5), 2.5], [bx(21.5), 6.5], [bx(25.5), 6.5]] });
  open({ x0: bx(10), z0: 4, x1: bx(10), z1: 5, kind: 'door', id: 'b_door', mat: 'door_metal', open: true, swing: 1 });
  open({ x0: bx(17), z0: 4, x1: bx(17), z1: 5, kind: 'door', id: 'air1', mat: 'door_white', swing: 1 });
  open({ x0: bx(19), z0: 4, x1: bx(19), z1: 5, kind: 'door', id: 'air2', mat: 'door_white', swing: 1 });

  // 지하 세탁실: 투입구 출구와 그 아래 수레
  b.at(bx(2), 2.2, 0);
  b.box('steel', 0, 3.0, 0, 1.1, 0.6, 1.1);
  b.box('plastic_dark', 0, 2.98, 0, 0.8, 0.02, 0.8);
  at.chuteOut = V(bx(2), 2.9, 2.2);
  laundryCart(b, bx(2), 2.2, 0.1, true);
  spawn.basement = { pos: V(bx(4.4), 0, 5.4), yaw: 0.63 };
  for (let i = 0; i < 4; i++) washer(b, bx(4.5 + i * 1.15), 8.4, Math.PI);
  for (let i = 0; i < 3; i++) washer(b, bx(9.4), 1.5 + i * 1.15, -Math.PI / 2);
  laundryCart(b, bx(6), 4.5, 0.6);
  laundryCart(b, bx(3.2), 6.6, -0.3);
  shelf(b, bx(0.4), 6.5, Math.PI / 2, 2.0, 2.0, 0.45, 'linen');
  // 바닥 배수구 (무언가가 빠져나간 곳)
  b.at(bx(5), 1.2, 0);
  b.box('steel', 0, 0.0, 0, 0.5, 0.012, 0.5, 0, { aoFloor: false });
  at.drain = V(bx(5), 0, 1.2);
  // 지하 복도
  gurney(b, bx(13.5), 5.0, Math.PI / 2);
  b.at(bx(16.9), 4.5, -Math.PI / 2);
  b.decal(plateTex('CLEAN ROOM'), 0, 2.2, 0.1, 0.6, 0.25);
  // 무균실
  const cleanBed = bed(b, bx(24), 4.5, Math.PI / 2, { rails: false });
  beds.clean = cleanBed;
  at.cleanBed = cleanBed.head;
  chair(b, bx(24.2), 3.1, 0, 'plastic_white');
  at.unaChair = V(bx(24.2), 0, 3.1);
  for (let i = 0; i < 3; i++) shelf(b, bx(27.5), 1.2 + i * 1.5, -Math.PI / 2, 1.3, 2.0, 0.45, 'boxes');
  table(b, bx(20.5), 1.0, 0, 1.6, 0.7, 0.9, 'steel');
  crtMonitor(b, bx(20.3), 1.0, 0, 0.92);
  ivStand(b, bx(25.6), 5.6);
  sink(b, bx(19.6), 7.6, Math.PI / 2);
  spawn.clean = { pos: V(bx(21), 0, 4.5), yaw: -Math.PI / 2 };

  addFixtures(L);
  L.build();

  return {
    level: L,
    spawn,
    at,
    tvs,
    beds,
    meshes,
    ambulance: amb,
    poleLights: [pole1, pole2, pole3],
    sedanDome,
    roundsPath,
  };
}
