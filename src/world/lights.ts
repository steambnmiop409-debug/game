import * as THREE from 'three';
import type { Fixture, Level } from './level';
import { mat } from './materials';
import { canvasTex, tex } from './textures';
import { clamp, rng } from '../core/util';
import type { AudioSys, Voice } from '../audio/audio';

/**
 * 조명.
 * - 손전등: 카메라에 붙은 스포트라이트 + 그림자 (가장 강한 입체감의 원천)
 * - 형광등: 고정된 수의 점광원을 가장 가까운 형광등에 다시 배치한다 (셰이더 재컴파일 없음)
 * - 가장 가까운 형광등 하나는 그림자를 드리우는 스포트라이트로
 * - 형광등 주위의 빛 번짐(빌보드)과 60Hz 웅웅거림
 */

const POOL = 7;

export class Lighting {
  flash: THREE.SpotLight;
  flashOn = true;
  flashLevel = 1;
  /** 손전등이 비추는 면까지의 대략 거리 (가까우면 과노출을 막는다) */
  flashDist = 5;
  private flashTarget = new THREE.Object3D();
  private pool: THREE.PointLight[] = [];
  key: THREE.SpotLight;
  private keyTarget = new THREE.Object3D();
  hemi: THREE.HemisphereLight;
  private halos = new Map<Fixture, THREE.Sprite>();
  private r = rng(60);
  private t = 0;
  private hum: Voice[] = [];
  private humFix: (Fixture | null)[] = [null, null];
  private humTimer = 0;
  /** 화면 전체 조명 배율 (정전 연출) */
  master = 1;
  /** 형광등 위치에서 플레이어 위치의 대략적인 밝기 (1인칭 손 밝기용) */
  ambientAtPlayer = 0.3;

  constructor(
    scene: THREE.Scene,
    private readonly camera: THREE.Camera,
    public level: Level,
    private readonly audio: AudioSys | null,
  ) {
    this.hemi = new THREE.HemisphereLight(0x2a3640, 0x0c0a08, 0.32);
    scene.add(this.hemi);

    this.flash = new THREE.SpotLight(0xfff0d8, 26, 26, 0.46, 0.55, 1.6);
    this.flash.map = flashCookie();
    this.flash.castShadow = true;
    this.flash.shadow.mapSize.set(1024, 1024);
    this.flash.shadow.bias = -0.0004;
    this.flash.shadow.normalBias = 0.03;
    this.flash.shadow.camera.near = 0.15;
    this.flash.shadow.camera.far = 26;
    this.flash.position.set(0.18, -0.2, 0.05);
    this.flashTarget.position.set(0.05, -0.15, -5);
    camera.add(this.flash);
    camera.add(this.flashTarget);
    this.flash.target = this.flashTarget;

    for (let i = 0; i < POOL; i++) {
      const p = new THREE.PointLight(0xeef3e6, 0, 9, 1.8);
      p.castShadow = false;
      scene.add(p);
      this.pool.push(p);
    }
    this.key = new THREE.SpotLight(0xf1f5ea, 0, 12, 1.15, 0.7, 1.6);
    this.key.castShadow = true;
    this.key.shadow.mapSize.set(512, 512);
    this.key.shadow.bias = -0.0006;
    this.key.shadow.normalBias = 0.04;
    this.key.shadow.camera.near = 0.2;
    this.key.shadow.camera.far = 12;
    scene.add(this.key);
    scene.add(this.keyTarget);
    this.key.target = this.keyTarget;
  }

  /** 형광등 빛 번짐 빌보드를 만든다 (레벨이 바뀔 때) */
  initHalos() {
    for (const s of this.halos.values()) s.removeFromParent();
    this.halos.clear();
    const m = new THREE.SpriteMaterial({ map: tex('glow'), color: 0xf3f6ea, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: true, opacity: 0.35 });
    for (const f of this.level.fixtures) {
      const s = new THREE.Sprite(m.clone());
      s.position.copy(f.pos).add(new THREE.Vector3(0, -0.12, 0));
      s.scale.set(2.2, 1.4, 1);
      s.renderOrder = 3;
      this.level.areaGroup(f.room.area).add(s);
      this.halos.set(f, s);
    }
  }

  fixtureLevel(f: Fixture) {
    switch (f.state) {
      case 'on':
        return 1 - 0.03 * Math.sin(this.t * 120 + f.seed) * 0.5;
      case 'dim':
        return 0.35 + 0.03 * Math.sin(this.t * 7 + f.seed);
      case 'flicker': {
        // 긴 켜짐 + 짧은 깜빡임 다발
        const p = Math.sin(this.t * 0.7 + f.seed * 3) + Math.sin(this.t * 2.3 + f.seed);
        if (p > 1.2) return this.r() < 0.5 ? 0.05 : 0.9;
        return 0.92;
      }
      default:
        return 0;
    }
  }

  update(dt: number, area: string, extraDim = 0) {
    this.t += dt;
    const cam = this.camera.getWorldPosition(new THREE.Vector3());
    // 형광등 상태 갱신
    const cands: { f: Fixture; d: number; lv: number }[] = [];
    for (const f of this.level.fixtures) {
      const lv = this.fixtureLevel(f) * this.master * (1 - extraDim);
      f.level += (lv - f.level) * Math.min(1, dt * (f.state === 'flicker' ? 40 : 8));
      const panel = f.panel.material as THREE.MeshBasicMaterial;
      const k = clamp(f.level, 0, 1);
      panel.color.copy(f.color).multiplyScalar(0.25 + k * 2.2);
      const halo = this.halos.get(f);
      if (halo) {
        halo.visible = f.room.area === area && k > 0.05;
        (halo.material as THREE.SpriteMaterial).opacity = 0.32 * k;
      }
      if (f.room.area !== area || f.level < 0.02) continue;
      const d = f.pos.distanceTo(cam);
      if (d < 24) cands.push({ f, d, lv: f.level });
    }
    cands.sort((a, b) => a.d - b.d);
    // 가장 가까운 것 = 그림자 스포트
    const keyF = cands[0];
    if (keyF) {
      this.key.position.copy(keyF.f.pos).add(new THREE.Vector3(0, -0.08, 0));
      this.keyTarget.position.copy(keyF.f.pos).add(new THREE.Vector3(0, -3, 0));
      this.key.intensity = 14 * keyF.lv;
      this.key.color.copy(keyF.f.color);
    } else this.key.intensity = 0;
    // 나머지 = 점광원 (가장 먼 것은 거리에 따라 서서히 꺼진다 → 튀지 않는다)
    const rest = cands.slice(1, POOL + 2);
    const rMax = rest.length > POOL ? rest[POOL].d : 24;
    for (let i = 0; i < POOL; i++) {
      const p = this.pool[i];
      const c = rest[i];
      if (!c) {
        p.intensity = 0;
        continue;
      }
      const fade = clamp((rMax - c.d) / Math.max(0.5, rMax * 0.3), 0, 1);
      p.position.copy(c.f.pos).add(new THREE.Vector3(0, -0.25, 0));
      p.color.copy(c.f.color);
      p.intensity = 5.5 * c.lv * fade;
    }
    // 플레이어 위치 밝기 근사
    let amb = 0.12;
    for (const c of cands.slice(0, 4)) amb += (c.lv * 2.2) / (1 + c.d * c.d * 0.25);
    this.ambientAtPlayer += (clamp(amb, 0.08, 1.4) - this.ambientAtPlayer) * Math.min(1, dt * 4);

    // 손전등
    const fl = this.flashOn ? this.flashLevel : 0;
    const near = clamp(Math.pow(this.flashDist / 3.4, 1.6), 0.1, 1);
    this.flash.intensity += (26 * fl * near - this.flash.intensity) * Math.min(1, dt * 18);

    // 형광등 웅웅거림 (가장 가까운 켜진 두 개)
    this.humTimer -= dt;
    if (this.audio?.running && this.humTimer <= 0) {
      this.humTimer = 0.6;
      const near = cands.filter((c) => c.d < 7).slice(0, 2);
      for (let i = 0; i < 2; i++) {
        const want = near[i]?.f ?? null;
        if (this.humFix[i] !== want) {
          this.hum[i]?.stop(0.4);
          this.humFix[i] = want;
          if (want) {
            const v = this.audio.play(this.audio.buffers.get('fluoro'), { pos: want.pos, loop: true, gain: 0.0001, refDistance: 1.2, rolloff: 1.6, send: 0.1 });
            if (v) {
              v.setGain(0.16, 0.6);
              this.hum[i] = v;
            }
          }
        }
        const v = this.hum[i];
        const f = this.humFix[i];
        if (v && f) v.setGain(0.16 * clamp(f.level, 0, 1), 0.15);
      }
    }
  }

  /** 형광등이 '탁' 하고 나간다 */
  blowFixture(f: Fixture) {
    f.state = 'dead';
    if (this.audio) {
      this.audio.play(this.audio.buffers.get('buzz_1'), { pos: f.pos, gain: 0.6 });
      this.audio.play(this.audio.any('glass'), { pos: f.pos, gain: 0.25, rate: 1.4 });
    }
  }

  setFlash(on: boolean) {
    this.flashOn = on;
  }
}

/** 손전등 쿠키: 밝은 중심, 둥근 테두리, 반사경의 고리 */
function flashCookie() {
  const t = canvasTex(
    128,
    128,
    (g) => {
      g.fillStyle = '#000';
      g.fillRect(0, 0, 128, 128);
      const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
      gr.addColorStop(0, 'rgba(255,255,255,1)');
      gr.addColorStop(0.18, 'rgba(255,250,240,0.95)');
      gr.addColorStop(0.32, 'rgba(200,195,185,0.55)');
      gr.addColorStop(0.36, 'rgba(255,250,240,0.75)');
      gr.addColorStop(0.55, 'rgba(160,155,150,0.35)');
      gr.addColorStop(0.85, 'rgba(60,60,60,0.12)');
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      g.fillStyle = gr;
      g.fillRect(0, 0, 128, 128);
      // 렌즈의 먼지
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(0,0,0,${0.05 + Math.random() * 0.08})`;
        g.beginPath();
        g.arc(30 + Math.random() * 68, 30 + Math.random() * 68, 1 + Math.random() * 3, 0, Math.PI * 2);
        g.fill();
      }
    },
    777,
    false,
  );
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearFilter;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

/** 형광등 등기구를 천장에 만들고 레벨에 등록한다 */
export function addFixtures(level: Level) {
  const r = rng(314);
  for (const room of level.rooms) {
    if (room.outdoor || room.light === 'none' || !room.ceil) continue;
    let spots = room.fixtures;
    if (!spots) {
      spots = [];
      const w = room.x1 - room.x0;
      const d = room.z1 - room.z0;
      const nx = Math.max(1, Math.round(w / 3.6));
      const nz = Math.max(1, Math.round(d / 3.6));
      for (let i = 0; i < nx; i++) for (let j = 0; j < nz; j++) spots.push([room.x0 + ((i + 0.5) * w) / nx, room.z0 + ((j + 0.5) * d) / nz]);
    }
    const b = level.batch(room.area, room.group);
    // 천장이 높은 방(로비 9m)은 매입등 대신 줄에 매단 등을 4.2m 높이에 단다. 빛이 바닥까지 닿는다
    const pendant = room.h > 4.5;
    for (const [x, z] of spots) {
      const top = room.y + room.h;
      const y = pendant ? room.y + 4.2 : top - 0.02;
      if (pendant) {
        for (const s of [-1, 1]) b.box('steel', x + s * 0.5, y, z, 0.02, top - y, 0.02, 0, { aoFloor: false });
        b.box('paint_metal', x, y - 0.02, z, 1.3, 0.1, 0.7, 0, { aoFloor: false });
      }
      // 매입형 등기구 틀
      b.box('fixture_off', x, y - 0.04, z, 1.24, 0.04, 0.64, 0, { aoFloor: false, noTop: !pendant });
      const panel = new THREE.Mesh(new THREE.PlaneGeometry(1.14, 0.54), mat('fixture', false).mat.clone());
      panel.rotation.x = Math.PI / 2;
      panel.position.set(x, y - 0.045, z);
      level.variantGroup(room.area, room.group).add(panel);
      let state: Fixture['state'] = room.light === 'flicker' ? (r() < 0.5 ? 'flicker' : 'on') : room.light === 'dead' ? 'dead' : room.light === 'off' ? 'off' : room.light === 'dim' ? 'dim' : 'on';
      if (state === 'on' && r() < 0.08) state = 'flicker';
      const color = new THREE.Color(room.reverb === 'clean' ? 0xf4f8ff : r() < 0.2 ? 0xe6f2d8 : 0xf2f3e8);
      level.fixtures.push({ pos: new THREE.Vector3(x, y - 0.06, z), room, state, panel, level: 0, seed: r() * 100, color });
    }
  }
}
