import * as THREE from 'three';
import { mat } from '../world/materials';
import { canvasTex, nameTagTex, tex, unaFaceTex } from '../world/textures';

/**
 * 캐릭터 모형 (저폴리 3D). 관절은 이름 있는 그룹 계층.
 * 빌보드가 아니라 입체로 만들고, 손전등 그림자를 받는다 (R.E.P.O. 수준의 입체감).
 */

const M = (key: string) => mat(key, false).mat;

function part(geo: THREE.BufferGeometry, key: string | THREE.Material, x = 0, y = 0, z = 0) {
  const m = new THREE.Mesh(geo, typeof key === 'string' ? M(key) : key);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

function joint(name: string, x = 0, y = 0, z = 0) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(x, y, z);
  return g;
}

/** 아래로 매달린 원기둥 (관절에서 길이 len만큼 아래로) */
function limb(rTop: number, rBot: number, len: number, key: string | THREE.Material, seg = 7) {
  const g = new THREE.CylinderGeometry(rTop, rBot, len, seg);
  g.translate(0, -len / 2, 0);
  return part(g, key);
}

export interface Rig {
  root: THREE.Group;
  body: THREE.Group;
  hips: THREE.Group;
  chest: THREE.Group;
  neck: THREE.Group;
  head: THREE.Group;
  armL: THREE.Group;
  armR: THREE.Group;
  foreL: THREE.Group;
  foreR: THREE.Group;
  legL: THREE.Group;
  legR: THREE.Group;
  shinL: THREE.Group;
  shinR: THREE.Group;
  face?: THREE.Mesh;
  height: number;
}

function blobShadow(size: number) {
  const m = new THREE.Mesh(
    new THREE.PlaneGeometry(size, size),
    new THREE.MeshBasicMaterial({ map: tex('shadow_blob'), transparent: true, depthWrite: false, fog: true }),
  );
  m.rotation.x = -Math.PI / 2;
  m.position.y = 0.01;
  m.renderOrder = 1;
  return m;
}

// ───────────────────────────── 우나 ─────────────────────────────

/**
 * 우나: 열한두 살쯤의 여자아이. 맨발, 낡은 환자복 위에 간호사가 준 카디건.
 * 모형에는 이상한 점이 하나도 없다 (A1.3 규칙 7). 그리고 숨 쉬는 움직임도 없다.
 */
export function makeUna(): Rig {
  const root = joint('una');
  const body = joint('body');
  root.add(body);
  root.add(blobShadow(0.7));
  const hips = joint('hips', 0, 0.72, 0);
  body.add(hips);
  // 환자복 아랫단 (치마처럼)
  const skirt = part(new THREE.CylinderGeometry(0.15, 0.2, 0.36, 10, 1, true), 'gown', 0, -0.14, 0);
  (skirt.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  hips.add(skirt);
  const chest = joint('chest', 0, 0.02, 0);
  hips.add(chest);
  chest.add(part(new THREE.CylinderGeometry(0.125, 0.15, 0.44, 10), 'gown', 0, 0.22, 0));
  // 카디건: 앞이 열린 원통
  const cardi = part(new THREE.CylinderGeometry(0.14, 0.168, 0.42, 12, 1, true, Math.PI * 0.12, Math.PI * 1.76), 'knit', 0, 0.22, 0);
  (cardi.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  chest.add(cardi);
  chest.add(part(new THREE.SphereGeometry(0.13, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'knit', 0, 0.42, 0));
  const neck = joint('neck', 0, 0.47, 0);
  chest.add(neck);
  neck.add(part(new THREE.CylinderGeometry(0.035, 0.04, 0.08, 8), 'skin', 0, 0.04, 0));
  const head = joint('head', 0, 0.08, 0);
  neck.add(head);
  const skull = part(new THREE.SphereGeometry(0.1, 14, 12), 'skin', 0, 0.1, 0);
  skull.scale.set(1, 1.15, 1.06);
  skull.castShadow = false;
  head.add(skull);
  // 얼굴: 구의 앞쪽 조각에 얼굴 텍스처
  const faceMat = new THREE.MeshStandardMaterial({ map: unaFaceTex('neutral'), roughness: 0.6 });
  const face = part(new THREE.SphereGeometry(0.1015, 14, 10, Math.PI * 0.5 - 0.95, 1.9, Math.PI * 0.18, Math.PI * 0.62), faceMat, 0, 0.1, 0);
  face.scale.set(1, 1.15, 1.06);
  head.add(face);
  // 머리카락: 뒤통수와 정수리, 등까지 내려오는 머리, 앞머리
  const hairCap = part(new THREE.SphereGeometry(0.108, 14, 10, Math.PI * 0.5 + 0.95, Math.PI * 2 - 1.9, 0, Math.PI * 0.62), 'hair', 0, 0.105, 0);
  hairCap.scale.set(1.03, 1.15, 1.08);
  head.add(hairCap);
  const top = part(new THREE.SphereGeometry(0.11, 14, 6, 0, Math.PI * 2, 0, Math.PI * 0.3), 'hair', 0, 0.11, -0.004);
  top.scale.set(1.02, 1.12, 1.06);
  head.add(top);
  const back = part(new THREE.BoxGeometry(0.21, 0.36, 0.06), 'hair', 0, -0.03, -0.085);
  back.rotation.x = 0.12;
  head.add(back);
  for (const s of [-1, 1]) {
    const side = part(new THREE.BoxGeometry(0.035, 0.22, 0.07), 'hair', s * 0.098, 0.02, 0.0);
    head.add(side);
  }
  // 앞머리: 이마를 덮는 구 조각
  const bangs = part(new THREE.SphereGeometry(0.1045, 14, 6, Math.PI * 0.5 - 1.05, 2.1, Math.PI * 0.1, Math.PI * 0.21), 'hair', 0, 0.1, 0.002);
  bangs.scale.set(1.03, 1.15, 1.07);
  head.add(bangs);

  // 팔: 카디건 소매, 손
  const mkArm = (s: number) => {
    const sh = joint(s < 0 ? 'armL' : 'armR', s * 0.16, 0.4, 0);
    chest.add(sh);
    sh.add(limb(0.042, 0.036, 0.25, 'knit'));
    const fore = joint('fore', 0, -0.25, 0);
    sh.add(fore);
    fore.add(limb(0.036, 0.03, 0.2, 'knit'));
    const hand = part(new THREE.BoxGeometry(0.045, 0.08, 0.025), 'skin', 0, -0.24, 0);
    fore.add(hand);
    sh.rotation.z = s * 0.08;
    return { sh, fore };
  };
  const L = mkArm(-1);
  const R = mkArm(1);
  // 다리: 맨다리, 맨발
  const mkLeg = (s: number) => {
    const hip = joint(s < 0 ? 'legL' : 'legR', s * 0.075, -0.02, 0);
    hips.add(hip);
    hip.add(limb(0.055, 0.042, 0.36, 'skin'));
    const shin = joint('shin', 0, -0.36, 0);
    hip.add(shin);
    shin.add(limb(0.04, 0.03, 0.32, 'skin'));
    const foot = part(new THREE.BoxGeometry(0.06, 0.04, 0.15), 'skin', 0, -0.33, 0.035);
    shin.add(foot);
    return { hip, shin };
  };
  const LL = mkLeg(-1);
  const RL = mkLeg(1);
  return { root, body, hips, chest, neck, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.hip, legR: RL.hip, shinL: LL.shin, shinR: RL.shin, face, height: 1.45 };
}

export function setUnaFace(rig: Rig, expr: Parameters<typeof unaFaceTex>[0]) {
  if (!rig.face) return;
  (rig.face.material as THREE.MeshStandardMaterial).map = unaFaceTex(expr);
  (rig.face.material as THREE.MeshStandardMaterial).needsUpdate = true;
}

// ───────────────────────────── 회진 ─────────────────────────────

/**
 * 회진: 흰 가운을 입은 키 큰 형체. 얼굴이 처음부터 없었던 것처럼 매끈하다.
 * 가운에는 실제 직원의 명찰이 그대로 달려 있다.
 */
export function makeRound(name: string): Rig {
  const root = joint('round');
  const body = joint('body');
  root.add(body);
  root.add(blobShadow(0.9));
  const hips = joint('hips', 0, 1.0, 0);
  body.add(hips);
  const chest = joint('chest', 0, 0.02, 0);
  hips.add(chest);
  // 긴 가운
  const coat = part(new THREE.CylinderGeometry(0.19, 0.27, 1.25, 12, 1, true), 'coat', 0, 0.05, 0);
  (coat.material as THREE.MeshStandardMaterial).side = THREE.DoubleSide;
  chest.add(coat);
  chest.add(part(new THREE.SphereGeometry(0.2, 12, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'coat', 0, 0.66, 0));
  // 명찰
  const tag = part(new THREE.PlaneGeometry(0.1, 0.05), new THREE.MeshStandardMaterial({ map: nameTagTex(name), roughness: 0.5 }), 0.09, 0.52, 0.2);
  tag.rotation.y = 0.15;
  chest.add(tag);
  const neck = joint('neck', 0, 0.7, 0);
  chest.add(neck);
  neck.add(part(new THREE.CylinderGeometry(0.045, 0.055, 0.16, 8), 'skin_pale', 0, 0.08, 0));
  const head = joint('head', 0, 0.16, 0);
  neck.add(head);
  const skull = part(new THREE.SphereGeometry(0.11, 14, 12), new THREE.MeshStandardMaterial({ map: tex('faceless'), roughness: 0.5 }), 0, 0.13, 0.01);
  skull.scale.set(1, 1.38, 1.1);
  head.add(skull);
  // 회색으로 센 짧은 머리 (사람이었던 흔적)
  const hair = part(new THREE.SphereGeometry(0.115, 12, 6, 0, Math.PI * 2, 0, Math.PI * 0.35), new THREE.MeshStandardMaterial({ color: 0x8a8580, roughness: 0.9 }), 0, 0.15, -0.005);
  hair.scale.set(1, 1.35, 1.1);
  head.add(hair);
  const mkArm = (s: number) => {
    const sh = joint(s < 0 ? 'armL' : 'armR', s * 0.22, 0.6, 0);
    chest.add(sh);
    sh.add(limb(0.05, 0.045, 0.38, 'coat'));
    const fore = joint('fore', 0, -0.38, 0);
    sh.add(fore);
    fore.add(limb(0.045, 0.04, 0.34, 'coat'));
    const hand = part(new THREE.BoxGeometry(0.06, 0.16, 0.03), 'skin_pale', 0, -0.42, 0);
    fore.add(hand);
    sh.rotation.z = s * 0.06;
    return { sh, fore };
  };
  const L = mkArm(-1);
  const R = mkArm(1);
  // 클립보드 (왼손)
  const clip = part(new THREE.BoxGeometry(0.24, 0.32, 0.015), new THREE.MeshStandardMaterial({ map: tex('clipboard'), roughness: 0.7 }), 0.02, -0.42, 0.06);
  clip.rotation.x = -0.9;
  L.fore.add(clip);
  L.fore.rotation.x = -1.0;
  L.sh.rotation.x = 0.25;
  const mkLeg = (s: number) => {
    const hip = joint(s < 0 ? 'legL' : 'legR', s * 0.09, -0.05, 0);
    hips.add(hip);
    hip.add(limb(0.07, 0.06, 0.48, 'trousers'));
    const shin = joint('shin', 0, -0.48, 0);
    hip.add(shin);
    shin.add(limb(0.055, 0.045, 0.44, 'trousers'));
    shin.add(part(new THREE.BoxGeometry(0.1, 0.07, 0.26), 'shoe', 0, -0.46, 0.05));
    return { hip, shin };
  };
  const LL = mkLeg(-1);
  const RL = mkLeg(1);
  // 살짝 앞으로 숙인 자세
  chest.rotation.x = 0.08;
  head.rotation.x = 0.12;
  return { root, body, hips, chest, neck, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.hip, legR: RL.hip, shinL: LL.shin, shinR: RL.shin, height: 2.05 };
}

// ───────────────────────────── 호피 스와피 ─────────────────────────────

/**
 * 호피 스와피 인형탈. 키 2m의 분홍 토끼. 벨크로로 붙인 팔다리가 엉뚱한 자리에 있다:
 * 귀 자리에 팔, 팔 자리에 다리, 그리고 다리 자리에 길고 납작한 귀 — 그것으로 걷는다.
 */
export function makeHoppy(): Rig & { eyes: THREE.Mesh[]; zipper: THREE.Mesh } {
  const root = joint('hoppy');
  const body = joint('body');
  root.add(body);
  root.add(blobShadow(1.3));
  const hips = joint('hips', 0, 0.82, 0);
  body.add(hips);
  const chest = joint('chest', 0, 0, 0);
  hips.add(chest);
  const belly = part(new THREE.SphereGeometry(0.42, 14, 10), 'plush', 0, 0.42, 0);
  belly.scale.set(1, 1.25, 0.9);
  chest.add(belly);
  const patch = part(new THREE.SphereGeometry(0.3, 12, 8), 'plush_light', 0, 0.4, 0.17);
  patch.scale.set(0.9, 1.15, 0.6);
  chest.add(patch);
  // 등 지퍼
  const zipper = part(new THREE.PlaneGeometry(0.12, 0.7), new THREE.MeshStandardMaterial({ map: tex('zipper'), roughness: 0.6 }), 0, 0.45, -0.385);
  zipper.rotation.y = Math.PI;
  chest.add(zipper);
  // 벨크로 패치
  for (const [x, y, z] of [
    [0.36, 0.72, 0.05],
    [-0.36, 0.72, 0.05],
    [0.2, 0.0, 0.1],
    [-0.2, 0.0, 0.1],
  ]) {
    const v = part(new THREE.BoxGeometry(0.14, 0.1, 0.02), 'plush_light', x, y, z);
    v.lookAt(new THREE.Vector3(x * 3, y, z * 3 + 0.5));
    chest.add(v);
  }
  const neck = joint('neck', 0, 0.92, 0);
  chest.add(neck);
  const head = joint('head', 0, 0.05, 0);
  neck.add(head);
  const skull = part(new THREE.SphereGeometry(0.36, 16, 12), 'plush', 0, 0.3, 0);
  skull.scale.set(1.08, 0.98, 1);
  skull.castShadow = false;
  head.add(skull);
  // 볼과 주둥이 (마스코트다운 둥근 얼굴)
  const muzzle = part(new THREE.SphereGeometry(0.16, 12, 8), 'plush_light', 0, 0.2, 0.25);
  muzzle.scale.set(1.25, 0.8, 0.7);
  head.add(muzzle);
  const nose = part(new THREE.SphereGeometry(0.04, 8, 6), new THREE.MeshStandardMaterial({ color: 0xa8546f, roughness: 0.5 }), 0, 0.27, 0.355);
  head.add(nose);
  const face = part(new THREE.SphereGeometry(0.205, 16, 10, Math.PI * 0.5 - 0.9, 1.8, Math.PI * 0.45, Math.PI * 0.4), new THREE.MeshStandardMaterial({ map: tex('hoppy_face'), roughness: 0.9 }), 0, 0.2, 0.072);
  face.scale.set(1.25, 0.8, 0.7);
  head.add(face);
  const eyes: THREE.Mesh[] = [];
  for (const s of [-1, 1]) {
    const e = part(new THREE.SphereGeometry(0.085, 12, 8), 'eye_plastic', s * 0.15, 0.4, 0.29);
    e.scale.set(1, 1.15, 0.6);
    head.add(e);
    eyes.push(e);
    const hl = new THREE.Mesh(new THREE.SphereGeometry(0.018, 6, 4), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    hl.position.set(s * 0.15 - 0.025, 0.44, 0.335);
    head.add(hl);
  }
  // 귀 자리의 팔 (머리 위로 솟은 두 팔과 손)
  const mkHeadArm = (s: number) => {
    const sh = joint(s < 0 ? 'armL' : 'armR', s * 0.2, 0.58, -0.02);
    head.add(sh);
    sh.add(part(new THREE.SphereGeometry(0.1, 8, 6), 'plush_light', 0, 0, 0));
    sh.add(limb(0.095, 0.085, 0.36, 'plush'));
    sh.rotation.z = Math.PI - s * 0.55;
    const fore = joint('fore', 0, -0.36, 0);
    sh.add(fore);
    fore.add(part(new THREE.SphereGeometry(0.088, 8, 6), 'plush', 0, 0, 0));
    fore.add(limb(0.085, 0.075, 0.32, 'plush'));
    const paw = part(new THREE.SphereGeometry(0.1, 10, 8), 'plush_light', 0, -0.37, 0);
    paw.scale.set(1.1, 0.8, 0.75);
    fore.add(paw);
    for (let f = -1; f <= 1; f++) {
      const fg = part(new THREE.CylinderGeometry(0.026, 0.022, 0.11, 6), 'plush_light', f * 0.055, -0.47, 0.02);
      fg.rotation.z = f * 0.25;
      fore.add(fg);
    }
    fore.rotation.z = -s * 0.9;
    return { sh, fore };
  };
  const L = mkHeadArm(-1);
  const R = mkHeadArm(1);
  // 팔 자리의 다리 (옆으로 늘어진 두 다리, 큰 발)
  for (const s of [-1, 1]) {
    const sh = joint('shoulderLeg', s * 0.4, 0.72, 0);
    chest.add(sh);
    sh.add(limb(0.09, 0.08, 0.42, 'plush'));
    sh.rotation.z = s * 0.9;
    sh.rotation.x = 0.3;
    const foot = part(new THREE.SphereGeometry(0.11, 10, 8), 'plush_light', 0, -0.48, 0.1);
    foot.scale.set(0.9, 0.7, 1.9);
    sh.add(foot);
    const pad = part(new THREE.SphereGeometry(0.05, 8, 6), new THREE.MeshStandardMaterial({ color: 0xd9708f, roughness: 0.8 }), 0, -0.55, 0.12);
    pad.scale.set(1, 0.4, 1.4);
    sh.add(pad);
  }
  // 다리 자리의 귀 (길고 납작하다, 관절이 아닌 곳에서 꺾인다)
  const mkEarLeg = (s: number) => {
    const hip = joint(s < 0 ? 'legL' : 'legR', s * 0.17, 0.05, 0);
    hips.add(hip);
    const outer = part(new THREE.CylinderGeometry(0.085, 0.11, 0.46, 8), 'plush', 0, -0.23, 0);
    outer.scale.z = 0.45;
    hip.add(outer);
    const inner = part(new THREE.CylinderGeometry(0.05, 0.07, 0.42, 8), 'plush_light', 0, -0.23, 0.04);
    inner.scale.z = 0.3;
    hip.add(inner);
    const shin = joint('shin', 0, -0.46, 0);
    hip.add(shin);
    const o2 = part(new THREE.CylinderGeometry(0.11, 0.06, 0.4, 8), 'plush', 0, -0.2, 0);
    o2.scale.z = 0.45;
    shin.add(o2);
    const tip = part(new THREE.SphereGeometry(0.07, 8, 6), 'plush', 0, -0.4, 0.04);
    tip.scale.set(1, 0.6, 1.5);
    shin.add(tip);
    return { hip, shin };
  };
  const LL = mkEarLeg(-1);
  const RL = mkEarLeg(1);
  return { root, body, hips, chest, neck, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.hip, legR: RL.hip, shinL: LL.shin, shinR: RL.shin, height: 2.0, eyes, zipper };
}

// ───────────────────────────── 마커스 ─────────────────────────────

function marcusFace() {
  return canvasTex(
    64,
    64,
    (g) => {
      g.fillStyle = '#c99a78';
      g.fillRect(0, 0, 64, 64);
      g.fillStyle = 'rgba(60,40,30,0.35)';
      g.fillRect(14, 42, 36, 14);
      g.fillStyle = '#3a2418';
      g.fillRect(16, 24, 12, 3);
      g.fillRect(36, 24, 12, 3);
      g.fillStyle = '#1a120c';
      g.fillRect(19, 30, 6, 4);
      g.fillRect(39, 30, 6, 4);
      g.fillStyle = 'rgba(120,70,50,0.6)';
      g.fillRect(30, 34, 4, 8);
      g.fillStyle = '#7a4a3a';
      g.fillRect(24, 48, 16, 2);
    },
    301,
    false,
  );
}

/** 동료 구급대원 마커스 벨 */
export function makeMarcus(): Rig {
  const root = joint('marcus');
  const body = joint('body');
  root.add(body);
  root.add(blobShadow(0.8));
  const hips = joint('hips', 0, 0.95, 0);
  body.add(hips);
  const chest = joint('chest', 0, 0.02, 0);
  hips.add(chest);
  chest.add(part(new THREE.CylinderGeometry(0.2, 0.18, 0.62, 10), 'navy', 0, 0.3, 0));
  chest.add(part(new THREE.SphereGeometry(0.2, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), 'navy', 0, 0.6, 0));
  // 반사띠
  chest.add(part(new THREE.CylinderGeometry(0.205, 0.205, 0.04, 10, 1, true), new THREE.MeshStandardMaterial({ color: 0xd8d8a0, roughness: 0.3, emissive: 0x303020 }), 0, 0.12, 0));
  const neck = joint('neck', 0, 0.66, 0);
  chest.add(neck);
  neck.add(part(new THREE.CylinderGeometry(0.06, 0.07, 0.1, 8), 'skin', 0, 0.05, 0));
  const head = joint('head', 0, 0.1, 0);
  neck.add(head);
  const skull = part(new THREE.SphereGeometry(0.115, 12, 10), new THREE.MeshStandardMaterial({ color: 0xc99a78, roughness: 0.6 }), 0, 0.12, 0);
  skull.scale.set(1, 1.15, 1.08);
  skull.castShadow = false;
  head.add(skull);
  const face = part(new THREE.SphereGeometry(0.117, 12, 8, Math.PI * 0.5 - 0.9, 1.8, Math.PI * 0.2, Math.PI * 0.6), new THREE.MeshStandardMaterial({ map: marcusFace(), roughness: 0.6 }), 0, 0.12, 0);
  face.scale.set(1, 1.15, 1.08);
  head.add(face);
  // 모자
  head.add(part(new THREE.CylinderGeometry(0.12, 0.125, 0.08, 12), 'navy', 0, 0.22, 0));
  const brim = part(new THREE.BoxGeometry(0.16, 0.015, 0.1), 'navy', 0, 0.19, 0.13);
  head.add(brim);
  const mkArm = (s: number) => {
    const sh = joint(s < 0 ? 'armL' : 'armR', s * 0.23, 0.56, 0);
    chest.add(sh);
    sh.add(limb(0.06, 0.055, 0.3, 'navy'));
    const fore = joint('fore', 0, -0.3, 0);
    sh.add(fore);
    fore.add(limb(0.05, 0.045, 0.28, 'navy'));
    fore.add(part(new THREE.BoxGeometry(0.07, 0.1, 0.04), 'skin', 0, -0.32, 0));
    return { sh, fore };
  };
  const L = mkArm(-1);
  const R = mkArm(1);
  const mkLeg = (s: number) => {
    const hip = joint(s < 0 ? 'legL' : 'legR', s * 0.1, -0.03, 0);
    hips.add(hip);
    hip.add(limb(0.08, 0.07, 0.46, 'navy'));
    const shin = joint('shin', 0, -0.46, 0);
    hip.add(shin);
    shin.add(limb(0.065, 0.055, 0.42, 'navy'));
    shin.add(part(new THREE.BoxGeometry(0.11, 0.08, 0.27), 'shoe', 0, -0.44, 0.05));
    return { hip, shin };
  };
  const LL = mkLeg(-1);
  const RL = mkLeg(1);
  return { root, body, hips, chest, neck, head, armL: L.sh, armR: R.sh, foreL: L.fore, foreR: R.fore, legL: LL.hip, legR: RL.hip, shinL: LL.shin, shinR: RL.shin, height: 1.85 };
}

// ───────────────────────────── 걷기 애니메이션 ─────────────────────────────

/** 걷기 주기 phase(라디안)와 세기 amt(0..1)로 팔다리를 흔든다 */
export function walkPose(r: Rig, phase: number, amt: number, opts: { armSwing?: number; stiff?: boolean } = {}) {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  const leg = 0.55 * amt;
  r.legL.rotation.x = s * leg;
  r.legR.rotation.x = -s * leg;
  r.shinL.rotation.x = Math.max(0, -c) * 0.7 * amt;
  r.shinR.rotation.x = Math.max(0, c) * 0.7 * amt;
  const arm = (opts.armSwing ?? 0.4) * amt;
  r.armL.rotation.x = -s * arm;
  r.armR.rotation.x = s * arm;
  r.body.position.y = Math.abs(c) * 0.035 * amt;
}
