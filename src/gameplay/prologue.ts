import * as THREE from 'three';
import { mat } from '../world/materials';
import { tex } from '../world/textures';
import { makeMarcus, type Rig } from '../entities/models';
import { rng } from '../core/util';

/**
 * 프롤로그: 구급차 조수석. 19번 군도, 안개, 같은 '사슴 출몰' 표지판이 세 번.
 * 차는 멈춰 있고, 길과 나무와 표지판이 다가온다 (흔들림과 엔진 소리로 달리는 느낌).
 */
export class Prologue {
  readonly group = new THREE.Group();
  readonly cab = new THREE.Group();
  readonly marcus: Rig;
  speed = 15;
  private trees: THREE.InstancedMesh[] = [];
  private treeZ: number[] = [];
  private treeX: number[] = [];
  private treeS: number[] = [];
  private roadMat: THREE.MeshStandardMaterial;
  private sign: THREE.Group;
  private signZ = -9999;
  private gateSign: THREE.Group;
  gateZ = -9999;
  private r = rng(1127);
  private t = 0;
  readonly seat = new THREE.Vector3(0.42, 1.28, 0.15);
  readonly armLight: THREE.PointLight;
  readonly radioLed: THREE.Mesh;
  headL: THREE.SpotLight;
  headR: THREE.SpotLight;
  /** 차체 흔들림 */
  rumble = 1;

  constructor() {
    const g = this.group;
    g.name = 'prologue';
    g.position.set(-1000, 0, 0);
    // 길
    const road = new THREE.Mesh(new THREE.PlaneGeometry(8, 260), (this.roadMat = (mat('road', false).mat as THREE.MeshStandardMaterial).clone()));
    this.roadMat.map = tex('road').clone();
    this.roadMat.map.wrapS = this.roadMat.map.wrapT = THREE.RepeatWrapping;
    this.roadMat.map.repeat.set(1, 260 / 4);
    this.roadMat.map.needsUpdate = true;
    road.rotation.x = -Math.PI / 2;
    road.position.set(-1.6, 0, -110);
    road.receiveShadow = true;
    g.add(road);
    for (const s of [-1, 1]) {
      const grass = new THREE.Mesh(new THREE.PlaneGeometry(60, 260), mat('grass', false).mat);
      grass.rotation.x = -Math.PI / 2;
      grass.position.set(-1.6 + s * 34, -0.02, -110);
      g.add(grass);
      // 가드레일
      const rail = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.3, 260), mat('steel', false).mat);
      rail.position.set(-1.6 + s * 4.6, 0.55, -110);
      g.add(rail);
    }
    // 나무 (인스턴스, 다가왔다가 뒤로 사라지면 앞으로 다시)
    const pineGeo = makePineGeo();
    const N = 140;
    for (const [key, geo] of [
      ['pine', pineGeo.dark],
      ['pine_light', pineGeo.light],
      ['bark', pineGeo.trunk],
    ] as [string, THREE.BufferGeometry][]) {
      const im = new THREE.InstancedMesh(geo, mat(key, false).mat, N);
      im.castShadow = true;
      im.receiveShadow = true;
      this.trees.push(im);
      g.add(im);
    }
    for (let i = 0; i < N; i++) {
      const side = i % 2 ? 1 : -1;
      this.treeX.push(-1.6 + side * (6 + this.r() * 22));
      this.treeZ.push(-this.r() * 240 + 20);
      this.treeS.push(0.8 + this.r() * 0.7);
    }
    // 사슴 출몰 표지판
    this.sign = new THREE.Group();
    const post = new THREE.Mesh(new THREE.BoxGeometry(0.08, 2.4, 0.08), mat('steel', false).mat);
    post.position.y = 1.2;
    this.sign.add(post);
    const plate = new THREE.Mesh(new THREE.PlaneGeometry(1.1, 1.1), new THREE.MeshStandardMaterial({ map: tex('deer_sign'), transparent: true, alphaTest: 0.5, roughness: 0.3, metalness: 0.1, emissive: 0x332a10 }));
    plate.position.set(0, 2.2, 0.05);
    this.sign.add(plate);
    this.sign.position.set(3.4, 0, -9999);
    g.add(this.sign);
    // 정문 간판 (끝에)
    this.gateSign = new THREE.Group();
    const board = new THREE.Mesh(new THREE.BoxGeometry(3.4, 1.7, 0.12), mat('wood_dark', false).mat);
    board.position.y = 1.8;
    this.gateSign.add(board);
    const face = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 1.6), new THREE.MeshStandardMaterial({ map: tex('gate_sign'), roughness: 0.6 }));
    face.position.set(0, 1.8, 0.07);
    this.gateSign.add(face);
    for (const s of [-1, 1]) {
      const p = new THREE.Mesh(new THREE.BoxGeometry(0.8, 2.6, 0.8), mat('brick', false).mat);
      p.position.set(s * 5.2 - 4, 1.3, 2);
      this.gateSign.add(p);
    }
    this.gateSign.position.set(3.8, 0, -9999);
    this.gateSign.rotation.y = -0.35;
    g.add(this.gateSign);

    // 구급차 운전석 내부
    const cab = this.cab;
    g.add(cab);
    const dark = mat('plastic_dark', false).mat;
    const dash = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.35, 0.6), dark);
    dash.position.set(0, 0.95, -0.85);
    cab.add(dash);
    const gauges = new THREE.Mesh(new THREE.PlaneGeometry(0.6, 0.15), mat('dash_glow', false).mat);
    gauges.position.set(-0.42, 1.08, -0.56);
    gauges.rotation.x = -0.5;
    cab.add(gauges);
    // 무전기
    const radio = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.08, 0.2), dark);
    radio.position.set(0.05, 0.84, -0.5);
    cab.add(radio);
    this.radioLed = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.012, 0.005), mat('red_led', false).mat);
    this.radioLed.position.set(0.14, 0.85, -0.398);
    cab.add(this.radioLed);
    const mic = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.09, 0.03), dark);
    mic.position.set(0.0, 0.72, -0.45);
    cab.add(mic);
    // 운전대
    const wheel = new THREE.Mesh(new THREE.TorusGeometry(0.19, 0.022, 8, 20), dark);
    wheel.position.set(-0.42, 1.1, -0.48);
    wheel.rotation.x = -1.0;
    cab.add(wheel);
    // 앞유리 기둥, 지붕, 문
    for (const s of [-1, 1]) {
      const pillar = new THREE.Mesh(new THREE.BoxGeometry(0.08, 1.0, 0.08), mat('white_paint', false).mat);
      pillar.position.set(s * 0.95, 1.55, -0.95);
      pillar.rotation.x = -0.35;
      cab.add(pillar);
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.7, 1.6), mat('plastic_grey', false).mat);
      door.position.set(s * 1.0, 0.75, 0.0);
      cab.add(door);
      const seat = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.15, 0.55), mat('vinyl_seat', false).mat);
      seat.position.set(s * 0.42, 0.62, 0.3);
      cab.add(seat);
      const back = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.7, 0.12), mat('vinyl_seat', false).mat);
      back.position.set(s * 0.42, 1.0, 0.62);
      cab.add(back);
    }
    const roof = new THREE.Mesh(new THREE.BoxGeometry(2.0, 0.06, 1.8), mat('plastic_grey', false).mat);
    roof.position.set(0, 2.0, -0.1);
    cab.add(roof);
    const backWall = new THREE.Mesh(new THREE.BoxGeometry(2.0, 1.4, 0.06), mat('plastic_grey', false).mat);
    backWall.position.set(0, 1.3, 0.8);
    cab.add(backWall);
    // 마커스 (운전석)
    this.marcus = makeMarcus();
    this.marcus.root.position.set(-0.42, 0.2, 0.25);
    this.marcus.legL.rotation.x = -1.4;
    this.marcus.legR.rotation.x = -1.4;
    this.marcus.shinL.rotation.x = 1.3;
    this.marcus.shinR.rotation.x = 1.3;
    this.marcus.armL.rotation.x = -1.1;
    this.marcus.armR.rotation.x = -1.1;
    this.marcus.foreL.rotation.x = -0.4;
    this.marcus.foreR.rotation.x = -0.4;
    this.marcus.root.rotation.y = Math.PI;
    this.marcus.root.children.forEach((c) => {
      if ((c as THREE.Mesh).isMesh && (c as THREE.Mesh).geometry.type === 'PlaneGeometry') c.visible = false;
    });
    cab.add(this.marcus.root);
    // 계기판 불빛
    this.armLight = new THREE.PointLight(0xff9a50, 0.6, 2.2, 2);
    this.armLight.position.set(-0.2, 1.15, -0.5);
    cab.add(this.armLight);
    // 전조등
    this.headL = new THREE.SpotLight(0xfff2d8, 60, 60, 0.42, 0.5, 1.4);
    this.headR = new THREE.SpotLight(0xfff2d8, 60, 60, 0.42, 0.5, 1.4);
    for (const [h, x] of [
      [this.headL, -0.7],
      [this.headR, 0.7],
    ] as [THREE.SpotLight, number][]) {
      h.position.set(x, 0.75, -1.4);
      const tg = new THREE.Object3D();
      tg.position.set(x * 0.5, 0, -25);
      cab.add(tg);
      h.target = tg;
      cab.add(h);
    }
    this.headL.castShadow = true;
    this.headL.shadow.mapSize.set(512, 512);
  }

  /** 사슴 표지판을 앞쪽에 세운다 */
  spawnSign(dist = 70) {
    this.signZ = -dist;
  }

  spawnGate(dist = 60) {
    this.gateZ = -dist;
  }

  get signDistance() {
    return -this.signZ;
  }

  update(dt: number) {
    this.t += dt;
    const dz = this.speed * dt;
    // 길 무늬가 흐른다
    if (this.roadMat.map) this.roadMat.map.offset.y += dz / 4;
    // 나무
    const m = new THREE.Matrix4();
    for (let i = 0; i < this.treeZ.length; i++) {
      this.treeZ[i] += dz;
      if (this.treeZ[i] > 12) {
        this.treeZ[i] -= 240;
        this.treeX[i] = -1.6 + (i % 2 ? 1 : -1) * (6 + this.r() * 22);
      }
      const s = this.treeS[i];
      m.makeScale(s, s, s).setPosition(this.treeX[i], 0, this.treeZ[i]);
      for (const im of this.trees) im.setMatrixAt(i, m);
    }
    for (const im of this.trees) im.instanceMatrix.needsUpdate = true;
    // 표지판
    this.signZ += dz;
    this.sign.position.z = this.signZ;
    this.gateZ += dz;
    this.gateSign.position.z = this.gateZ;
    // 차체 흔들림
    const k = this.rumble * Math.min(1, this.speed / 15);
    this.cab.position.y = Math.sin(this.t * 13) * 0.004 * k + Math.sin(this.t * 3.1) * 0.006 * k;
    this.cab.rotation.z = Math.sin(this.t * 1.7) * 0.004 * k;
  }

  /** 카메라(조수석)의 월드 위치 */
  seatWorld() {
    return this.cab.localToWorld(this.seat.clone());
  }
}

function makePineGeo() {
  const parts: { dark: THREE.BufferGeometry[]; light: THREE.BufferGeometry[]; trunk: THREE.BufferGeometry[] } = { dark: [], light: [], trunk: [] };
  const h = 10;
  const trunk = new THREE.CylinderGeometry(0.15, 0.22, h * 0.35, 6);
  trunk.translate(0, h * 0.175, 0);
  parts.trunk.push(trunk);
  for (let i = 0; i < 4; i++) {
    const y = h * 0.2 + (i * h * 0.75) / 4;
    const r = (1 - i / 4) * h * 0.22 + 0.3;
    const c = new THREE.ConeGeometry(r, h * 0.36, 7);
    c.translate(0, y + h * 0.18, 0);
    (i % 2 ? parts.dark : parts.light).push(c);
  }
  return { dark: merge(parts.dark), light: merge(parts.light), trunk: merge(parts.trunk) };
}

function merge(geos: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  const uv: number[] = [];
  for (const g of geos) {
    const ng = g.index ? g.toNonIndexed() : g;
    pos.push(...(ng.getAttribute('position').array as Float32Array));
    nor.push(...(ng.getAttribute('normal').array as Float32Array));
    uv.push(...(ng.getAttribute('uv').array as Float32Array));
  }
  const out = new THREE.BufferGeometry();
  out.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  out.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  out.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  return out;
}
