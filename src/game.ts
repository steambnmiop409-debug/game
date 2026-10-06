import * as THREE from 'three';
import { Engine } from './core/engine';
import { Input } from './core/input';
import { Pace } from './core/pace';
import { AudioSys, type Voice } from './audio/audio';
import { Sfx, type FloorMat } from './audio/sfx';
import { Music } from './audio/music';
import { buildChapter1, type World } from './world/chapter1';
import { Lighting } from './world/lights';
import type { Door, Room } from './world/level';
import { Player, Viewmodel } from './entities/player';
import { Una } from './entities/una';
import { RoundsCrew } from './entities/rounds';
import { Hoppy } from './entities/hoppy';
import { Interactions, type Interactable } from './gameplay/interact';
import { Screen } from './gameplay/tapes';
import { Prologue } from './gameplay/prologue';
import { UI, type Settings } from './ui/ui';
import { CHARTS, CREDITS, EXAMINE, FAIL, GOALS, HINTS, NEXT, PLACES, TAPES, UNA, type Line, type Scan } from './data/text';
import { clamp, damp, rng } from './core/util';
import { Story } from './gameplay/story';

export class Cancel extends Error {
  constructor() {
    super('cancelled');
  }
}

export interface ScanTarget {
  id: string;
  pos: () => THREE.Vector3;
  scan: Scan | (() => Scan);
  range?: number;
  enabled?: () => boolean;
  onDone?: () => void;
}

export interface SaveData {
  checkpoint: string;
  parts: boolean[];
  tapes: string[];
  scans: string[];
  wrong: number;
  flags: Record<string, boolean | number | string>;
  charges: number;
}

const SAVE_KEY = 'secondnature.ch1.save';
const SETTINGS_KEY = 'secondnature.settings';

export class Game {
  engine: Engine;
  input: Input;
  audio = new AudioSys();
  sfx: Sfx;
  music: Music;
  pace: Pace;
  world!: World;
  light!: Lighting;
  player = new Player();
  vm = new Viewmodel();
  una!: Una;
  rounds!: RoundsCrew;
  hoppy!: Hoppy;
  inter = new Interactions();
  ui: UI;
  prologue!: Prologue;
  story!: Story;
  screens = new Map<string, Screen>();
  scanTargets = new Map<string, ScanTarget>();
  state: 'boot' | 'title' | 'play' | 'pause' | 'fail' | 'credits' = 'boot';
  area = 'ground';
  room: Room | null = null;
  private lastRoomId = '';
  token = 0;
  save: SaveData = Game.freshSave();
  settings: Settings = { master: 0.9, music: 0.8, sfx: 1, sens: 1, scale: 0.42, difficulty: 'yellow', subSize: 1 };
  t = 0;
  private last = performance.now();
  // 도구
  hasDevice = false;
  hasStetho = true;
  private scanT = 0;
  private scanTarget: ScanTarget | null = null;
  private scanShownT = 0;
  private cardCooldown = 0;
  /** 우나 손잡기 허용 */
  allowHold = false;
  /** 이벤트 중 조작 제한 */
  busy = false;
  // 환경
  private fogColor = new THREE.Color(0x1a2228);
  private fogDensity = 0.04;
  private ambTarget = 0.3;
  private extra: THREE.Light[] = [];
  private ambSirens: THREE.PointLight[] = [];
  private moon!: THREE.DirectionalLight;
  private titleSpot!: THREE.SpotLight;
  private loops: Record<string, Voice | null> = {};
  private r = rng(99);
  /** 화면 일그러짐·빨강 (스크립트용) */
  warp = 0;
  red = 0;
  extraDim = 0;
  titleCam = 0;
  /** 1인칭 팔을 강제로 보이게 (프롤로그의 왼팔) */
  vmForce = false;
  onBeat: ((i: number) => void)[] = [];

  constructor(
    readonly canvas: HTMLCanvasElement,
    uiRoot: HTMLElement,
  ) {
    this.engine = new Engine(canvas);
    this.input = new Input(canvas);
    this.ui = new UI(uiRoot);
    this.sfx = new Sfx(this.audio);
    this.pace = new Pace(() => this.audio.now);
    this.music = new Music(this.audio, this.sfx, this.pace);
    this.engine.overlay = this.vm.scene;
    this.loadSettings();
    // 개발용: ?fast — 그림자 끄고 낮은 해상도 (헤드리스 점검)
    const q = new URLSearchParams(location.search);
    if (q.has('fast')) {
      this.engine.renderer.shadowMap.enabled = false;
      this.settings.scale = 0.22;
      this.timeScale = Number(q.get('fast') || 1);
    }
  }

  static freshSave(): SaveData {
    return { checkpoint: 'prologue', parts: [false, false, false, false, false, false], tapes: [], scans: [], wrong: 0, flags: {}, charges: 3 };
  }

  // ───────────────────────────── 시작 ─────────────────────────────

  async start() {
    this.ui.showHud(false);
    // 그래픽 먼저 (오디오는 클릭 뒤)
    this.world = buildChapter1();
    const scene = this.engine.scene;
    scene.add(this.world.level.root);
    scene.add(this.engine.camera);
    this.light = new Lighting(scene, this.engine.camera, this.world.level, this.audio);
    this.light.initHalos();
    this.prologue = new Prologue();
    this.world.level.areaGroup('road').add(this.prologue.group);
    this.una = new Una(scene);
    this.rounds = new RoundsCrew(scene, this.world.level);
    this.hoppy = new Hoppy(scene);
    this.setupExtraLights();
    this.setupScreens();
    this.story = new Story(this);
    this.audio.occluder = (a, b) => clamp(this.world.level.wallsBetween(a.x, a.z, b.x, b.z, true) * 0.55, 0, 1);
    this.player.floorAt = (x, z) => this.floorAt(x, z);
    this.player.onStep = (m, loud) => this.sfx.step(m, null, loud);
    this.una.onStep = (p) => this.sfx.bare(new THREE.Vector3(p.x, p.y + 0.05, p.z));
    this.rounds.onStep = (r) => this.sfx.roundsStep(new THREE.Vector3(r.pos.x, r.pos.y + 0.1, r.pos.z));
    this.rounds.onSpot = () => {
      this.music.stinger('discover');
      this.pace.add(20);
      this.music.tension = 1;
    };
    this.rounds.onCatch = () => this.fail('rounds');
    this.hoppy.onCatch = () => this.fail('hoppy');
    this.hoppy.onStep = (p) => {
      this.audio.play(this.audio.buffers.get(`velcro_${Math.floor(this.r() * 3)}`), { pos: p, gain: 0.5 });
      this.audio.play(this.audio.any('hand'), { pos: p, gain: 0.7, lowpass: 600, rate: 0.7 });
    };
    this.pace.on('beat', (e) => this.beat(e.index));
    // 브라우저에서 Esc는 포인터 잠금만 풀고 키 입력은 오지 않는다 → 잠금이 풀리면 일시정지
    this.input.onUnlock = () => {
      if (this.state === 'play' && this.input.wantLock && !this.ui.docOpen) this.pause();
    };
    // 첫 화면 (제목 장면을 미리 그려 둔다)
    this.setArea('ground');
    this.hoppy.place(new THREE.Vector3(0, 0.6, -6.5), 0, 'seated');
    this.titleCamera(0);
    requestAnimationFrame(() => this.frame());
    const gate = this.ui.gate(async () => {
      await this.audio.resume();
      this.applySettings();
      gate.progress(0.05, '실제 악기 녹음을 불러오는 중…');
      await this.audio.loadSamples((d, n) => gate.progress(0.05 + (d / n) * 0.55, '실제 악기 녹음을 불러오는 중…'));
      await this.sfx.build((p) => gate.progress(0.6 + p * 0.4, '목소리와 효과음을 만드는 중…'));
      this.pace.start();
      this.showTitle();
    });
    (window as unknown as { __ready: boolean }).__ready = true;
  }

  // ───────────────────────────── 제목 화면 ─────────────────────────────

  showTitle() {
    this.state = 'title';
    this.token++;
    this.ui.showHud(false);
    this.ui.clearSubs();
    this.input.wantLock = false;
    this.input.exitLock();
    this.rounds.clear();
    this.una.show(false);
    this.setArea('ground');
    this.hoppy.place(new THREE.Vector3(0, 0.6, -6.5), 0, 'seated');
    this.light.setFlash(false);
    this.audio.stopAll(0.5, (v) => !!v.panner);
    for (const k of Object.keys(this.loops)) this.stopLoop(k);
    this.music.startTitle();
    const has = this.hasSave();
    this.ui.title({
      canContinue: has,
      onNew: () => this.newGame(),
      onContinue: () => this.continueGame(),
      onSettings: () => this.ui.settings(this.settings, (s) => this.onSettings(s), () => {}),
      onCredits: () => this.showCreditsOnly(),
    });
    this.ui.fade(false, 1.5);
  }

  private titleCamera(dt: number) {
    this.titleCam += dt;
    const a = 0.35 + Math.sin(this.titleCam * 0.05) * 0.35;
    const cam = this.engine.camera;
    cam.position.set(Math.sin(a) * 4.6 - 0.6, 1.1 + Math.sin(this.titleCam * 0.2) * 0.08, -6.5 + Math.cos(a) * 4.6);
    cam.lookAt(-1.1, 1.55, -6.5);
    cam.fov = 60;
    cam.updateProjectionMatrix();
    this.light.flash.intensity = 0;
    this.titleSpot.intensity = 70;
  }

  newGame() {
    this.save = Game.freshSave();
    this.writeSave();
    this.begin();
  }

  continueGame() {
    this.loadSave();
    this.begin();
  }

  private begin() {
    this.titleSpot.intensity = 0;
    this.music.stop(2);
    this.ui.clearMenus();
    this.state = 'play';
    this.input.wantLock = true;
    this.input.requestLock();
    this.ui.showHud(true);
    this.applyProgress();
    this.story.run(this.save.checkpoint);
  }

  /** 저장된 진행을 세계에 반영 */
  applyProgress() {
    this.pace.reset(60);
    this.pace.raiseFloor(this.save.wrong * 15);
    this.hasDevice = !!this.save.flags.device;
    this.ui.parts(this.save.flags.quiz ? this.save.parts : null);
    this.vm.setSkin(Number(this.save.flags.encroach ?? 0.1));
  }

  // ───────────────────────────── 저장 ─────────────────────────────

  hasSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      return !!s && JSON.parse(s).checkpoint !== 'prologue';
    } catch {
      return false;
    }
  }

  loadSave() {
    try {
      const s = localStorage.getItem(SAVE_KEY);
      if (s) this.save = { ...Game.freshSave(), ...JSON.parse(s) };
    } catch {
      this.save = Game.freshSave();
    }
  }

  writeSave() {
    try {
      localStorage.setItem(SAVE_KEY, JSON.stringify(this.save));
    } catch {
      /* 저장 불가 환경 */
    }
  }

  checkpoint(name: string) {
    this.save.checkpoint = name;
    this.save.charges = Math.max(this.save.charges, 3);
    this.writeSave();
  }

  private loadSettings() {
    try {
      const s = localStorage.getItem(SETTINGS_KEY);
      if (s) this.settings = { ...this.settings, ...JSON.parse(s) };
    } catch {
      /* 무시 */
    }
  }

  onSettings(s: Settings) {
    this.settings = s;
    try {
      localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
    } catch {
      /* 무시 */
    }
    this.applySettings();
  }

  applySettings() {
    const s = this.settings;
    this.audio.volumes = { master: s.master, music: s.music, sfx: s.sfx };
    this.audio.applyVolumes();
    this.player.sens = s.sens;
    this.engine.setRenderScale(s.scale);
    this.ui.subSize(s.subSize);
    this.rounds.range = s.difficulty === 'green' ? 5.8 : s.difficulty === 'red' ? 9 : 7.5;
    this.pace.mult = s.difficulty === 'green' ? 0.85 : s.difficulty === 'red' ? 1.2 : 1;
  }

  // ───────────────────────────── 스크립트 도우미 ─────────────────────────────

  /** 현재 스크립트가 유효한지 확인 (재시작되면 Cancel) */
  check(tok: number) {
    if (tok !== this.token) throw new Cancel();
  }

  async wait(secs: number, tok = this.token) {
    const end = this.t + secs;
    while (this.t < end) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      this.check(tok);
    }
  }

  async until(cond: () => boolean, tok = this.token) {
    while (!cond()) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      this.check(tok);
    }
  }

  async say(line: Line, tok = this.token) {
    this.check(tok);
    await this.ui.say(line);
    this.check(tok);
  }

  async sayAll(lines: Line[], tok = this.token) {
    for (const l of lines) await this.say(l, tok);
  }

  door(id: string): Door {
    const d = this.world.level.doors.find((x) => x.id === id);
    if (!d) throw new Error('문 없음: ' + id);
    return d;
  }

  openDoor(id: string, open = true, sound = true) {
    const d = this.door(id);
    if (d.open === open) return;
    d.setOpen(open);
    const p = d.center.setY(1.2);
    if (!sound) return;
    if (d.def.kind === 'elevator') this.sfx.play('elev_door', { pos: p, gain: 0.7 });
    else if (open) this.sfx.creak(p, 0.5);
    else setTimeout(() => this.sfx.doorShut(p), 350);
  }

  /** 문 상호작용 (열고 닫기, 잠김) */
  private setupDoors() {
    for (const d of this.world.level.doors) {
      if (d.def.kind === 'elevator') continue;
      this.inter.add({
        id: 'door:' + d.id,
        pos: () => d.center.setY(1.1),
        range: 2.0,
        cone: 0.5,
        prompt: () => (d.locked ? '[E] 잠겨 있다' : d.open ? '[E] 문 닫기' : '[E] 문 열기'),
        onUse: () => {
          if (d.locked) {
            this.sfx.play('door_shut', { pos: d.center.setY(1.1), gain: 0.25, rate: 1.8 });
            const msg = d.id.startsWith('stair') ? EXAMINE.stair[1] : d.id === 'clinic' ? EXAMINE.lockedWing[0] : d.id === 'staff' ? '"STAFF ONLY" — 열쇠가 필요하다.' : d.id === 'playroom' ? '놀이방 문이 잠겨 있다. 안쪽에서 음악 소리가 희미하게 난다.' : '잠겨 있다.';
            this.ui.tip(msg, 3);
            // 잠긴 문 앞에서 헤매지 않도록, 지금 가야 할 곳을 이어서 알려 준다
            const hint = this.currentHint();
            if (hint) setTimeout(() => this.state === 'play' && this.ui.tip(hint, 8), 3000);
            return;
          }
          this.openDoor(d.id, !d.open);
        },
      });
    }
  }

  examine(key: string, lines = EXAMINE[key]) {
    if (!lines) return;
    this.ui.clearSubs();
    lines.forEach((t) => this.ui.say({ who: '', text: t }));
  }

  async readDoc(key: string) {
    const doc = CHARTS[key];
    if (!doc) return;
    this.sfx.paper();
    this.player.mode = 'locked';
    this.input.exitLock();
    await this.ui.showDoc(doc);
    this.sfx.paper();
    if (this.state === 'play') {
      this.player.mode = 'walk';
      this.input.requestLock();
    }
  }

  // ───────────────────────────── 화면 (TV) ─────────────────────────────

  private setupScreens() {
    for (const [k, tv] of Object.entries(this.world.tvs)) {
      const s = new Screen(tv.screen);
      this.screens.set(k, s);
    }
  }

  /** 테이프 재생 (카메라가 화면 앞으로) */
  async playTape(id: string, screenKey: string, tok = this.token) {
    const tape = TAPES[id];
    const tv = this.world.tvs[screenKey];
    const scr = this.screens.get(screenKey);
    if (!tape || !tv || !scr) return;
    const normal = new THREE.Vector3(0, 0, 1).applyQuaternion(tv.screen.getWorldQuaternion(new THREE.Quaternion()));
    const camPos = tv.pos.clone().addScaledVector(normal, 0.85);
    this.player.mode = 'locked';
    this.player.camOverride = { pos: camPos, look: tv.pos.clone(), k: 3.5, fov: 58 };
    this.vm.tool = 'none';
    this.busy = true;
    this.ui.vhs(tape.label);
    this.sfx.play('crt_on', { pos: tv.pos, gain: 0.6 });
    this.sfx.play('switch', { pos: tv.pos, gain: 0.5 });
    this.audio.muffle(0.25, 0.4, 3000);
    let skipped = false;
    this.input.clearLatch();
    const skipCheck = () => !!this.input.take('KeyE', 'Escape');
    const t0 = this.t;
    try {
      for (const shot of tape.shots) {
        if (skipped) break;
        const start = this.t;
        let voice: Voice | null = null;
        if (shot.sub && shot.voice) voice = this.sfx.speak(shot.sub.text, shot.voice, { pos: tv.pos, gain: 0.9, refDistance: 2 });
        if (shot.sub) this.ui.say({ ...shot.sub, dur: shot.dur - 0.2 });
        while (this.t - start < shot.dur) {
          scr.frame(shot.scene, this.t - t0, tape.stamp, this.t - start);
          await new Promise((r) => requestAnimationFrame(() => r(null)));
          this.check(tok);
          if (this.t - t0 > 0.5 && skipCheck()) {
            skipped = true;
            break;
          }
        }
        voice?.stop(0.2);
      }
    } finally {
      this.ui.clearSubs();
      this.ui.vhs(null);
      this.audio.muffle(0, 0.4);
      scr.off();
      this.player.camOverride = null;
      this.player.mode = 'walk';
      this.busy = false;
    }
    if (!this.save.tapes.includes(id)) {
      this.save.tapes.push(id);
      this.writeSave();
    }
    this.ui.tip(`기록: ${tape.summary}`, 7);
  }

  // ───────────────────────────── 판독 ─────────────────────────────

  addScan(t: ScanTarget) {
    this.scanTargets.set(t.id, t);
  }

  private updateDevice(dt: number) {
    const vm = this.vm;
    if (!this.hasDevice || this.player.mode === 'locked' || this.busy) {
      vm.scanAim = 0;
      if (this.scanShownT <= 0) this.ui.scan(null);
      return;
    }
    vm.tool = 'device';
    // 자기 팔 보기
    const lookingDown = this.player.pitch < -0.75 && this.player.mode === 'walk';
    vm.pose = this.player.holding ? 'hold' : lookingDown ? 'inspect' : 'idle';
    const eye = this.player.eye;
    const dir = this.player.look;
    let aimed: ScanTarget | null = null;
    let best = Infinity;
    for (const st of this.scanTargets.values()) {
      if (st.enabled && !st.enabled()) continue;
      if (st.id === 'self') {
        if (lookingDown) {
          aimed = st;
          best = -1;
        }
        continue;
      }
      const p = st.pos();
      const to = p.clone().sub(eye);
      const d = to.length();
      if (d > (st.range ?? 7)) continue;
      const ang = to.normalize().angleTo(dir);
      if (ang > 0.16 + Math.max(0, 1.5 - d) * 0.15) continue;
      if (this.world.level.wallsBetween(eye.x, eye.z, p.x, p.z, true) > 0) continue;
      if (ang < best) {
        best = ang;
        aimed = st;
      }
    }
    const holding = this.input.isDown('Mouse0');
    if (holding) {
      vm.scanAim = 1;
      if (aimed && aimed === this.scanTarget) this.scanT += dt;
      else {
        this.scanTarget = aimed;
        this.scanT = 0;
      }
      if (aimed) {
        const p = clamp(this.scanT / 1.3, 0, 1);
        this.ui.scanning(p);
        vm.drawScreen(['READING...', aimed.id.toUpperCase().slice(0, 12)], p);
        if (Math.floor(this.scanT * 8) !== Math.floor((this.scanT - dt) * 8)) this.sfx.play('switch', { bus: 'ui', gain: 0.08, rate: 2.2 });
        if (this.scanT >= 1.3) {
          const sc = typeof aimed.scan === 'function' ? aimed.scan() : aimed.scan;
          this.ui.scan(sc);
          this.scanShownT = 7;
          vm.drawScreen([sc.head, 'DONE'], 0);
          this.sfx.beep(0.3);
          const first = !this.save.scans.includes(aimed.id);
          if (first) {
            this.save.scans.push(aimed.id);
            this.writeSave();
          }
          const target = aimed;
          this.scanTarget = null;
          this.scanT = -999;
          if (sc.after && first) this.sayAll(sc.after).catch(() => {});
          target.onDone?.();
        }
      } else {
        vm.drawScreen(['NO TARGET'], 0);
        if (this.scanShownT <= 0) this.ui.scan(null);
      }
    } else {
      vm.scanAim = 0;
      this.scanT = 0;
      this.scanTarget = null;
      if (this.scanShownT <= 0) {
        this.ui.scan(null);
        vm.drawScreen(['SN-RI 3', aimed ? 'TARGET ▶' : 'READY', `RELAX x${this.save.charges}`], 0);
      }
    }
    if (this.scanShownT > 0) {
      this.scanShownT -= dt;
      if (this.scanShownT <= 0) this.ui.scan(null);
    }
    // 진정 카드
    this.cardCooldown -= dt;
    if (this.input.wasPressed('Mouse2') && this.cardCooldown <= 0) {
      this.cardCooldown = 0.8;
      if (this.save.charges <= 0) {
        this.sfx.play('switch', { bus: 'ui', gain: 0.3, rate: 0.6 });
        this.ui.tip('진정 카드가 비었다.', 2);
        return;
      }
      this.save.charges--;
      this.sfx.play('card_zap', { bus: 'ui', gain: 0.35, rate: 1.6 });
      this.audio.play(this.audio.any('glock'), { bus: 'ui', gain: 0.2, rate: 1.5 });
      vm.drawScreen(['RELAX ▶', `x${this.save.charges}`], 0);
      this.engine.post.u.uWhite.value = 0.12;
      let hit = false;
      for (const r of this.rounds.members) {
        const to = r.pos.clone().setY(eye.y).sub(eye);
        const d = to.length();
        if (d < 9 && to.normalize().angleTo(dir) < 0.3 && this.world.level.wallsBetween(eye.x, eye.z, r.pos.x, r.pos.z) === 0) {
          r.stun(4);
          hit = true;
        }
      }
      const h = this.hoppy;
      if (h.state === 'chase') {
        const to = h.pos.clone().setY(eye.y).sub(eye);
        const d = to.length();
        if (d < 9 && to.normalize().angleTo(dir) < 0.35 && this.world.level.wallsBetween(eye.x, eye.z, h.pos.x, h.pos.z) === 0) {
          h.stun(3.2);
          this.sfx.play('zipper', { pos: h.pos.clone().setY(1.2), gain: 0.6 });
          hit = true;
        }
      }
      if (hit) this.sfx.play('card_zap', { bus: 'world', pos: eye.clone().addScaledVector(dir, 3), gain: 0.5 });
    }
  }

  // ───────────────────────────── 환경 ─────────────────────────────

  floorAt(x: number, z: number): FloorMat {
    const r = this.world.level.roomAt(x, z);
    if (r?.outdoor) return Math.abs(x) < 3.6 || (x > 6 && x < 22 && z > 3 && z < 22) ? 'asphalt' : 'carpet';
    return r?.step ?? 'lino';
  }

  setArea(a: string) {
    this.area = a;
    for (const [k, g] of this.world.level.areas) g.visible = k === a;
    const outside = a === 'ground' || a === 'road';
    this.moon.intensity = outside ? 0.25 : 0;
    for (const l of this.extra) l.visible = true;
  }

  private setupExtraLights() {
    const scene = this.engine.scene;
    // 제목 화면: 받침대 위 인형탈을 비추는 한 줄기 빛
    this.titleSpot = new THREE.SpotLight(0xe8eef0, 0, 16, 0.32, 0.6, 1.2);
    this.titleSpot.position.set(1.5, 8.6, -4.2);
    this.titleSpot.target.position.set(0, 1.2, -6.5);
    this.titleSpot.castShadow = true;
    this.titleSpot.shadow.mapSize.set(1024, 1024);
    this.titleSpot.shadow.bias = -0.0005;
    scene.add(this.titleSpot, this.titleSpot.target);
    this.moon = new THREE.DirectionalLight(0x8aa0c0, 0.25);
    this.moon.position.set(-30, 40, 30);
    scene.add(this.moon);
    // 가로등 (나트륨 주황)
    for (const p of this.world.poleLights) {
      const l = new THREE.PointLight(0xffa04a, 0, 22, 1.4);
      l.position.copy(p);
      scene.add(l);
      this.extra.push(l);
      (l as THREE.PointLight & { base: number }).base = 9;
    }
    // 세단 실내등과 주차장 가로등 (3층 창밖 디오라마)
    const dome = new THREE.PointLight(0xffd8a0, 0, 7, 1.4);
    dome.position.copy(this.world.sedanDome);
    scene.add(dome);
    (dome as THREE.PointLight & { base: number }).base = 6;
    this.extra.push(dome);
    const lot = new THREE.SpotLight(0xffa04a, 0, 34, 0.9, 0.6, 1.1);
    lot.position.copy(this.world.poleLights[2]);
    lot.target.position.copy(this.world.sedanDome).setY(-9);
    scene.add(lot, lot.target);
    (lot as THREE.SpotLight & { base: number }).base = 120;
    this.extra.push(lot);
    // 구급차 전조등과 경광등
    const amb = this.world.ambulance;
    for (const hp of [amb.headL, amb.headR]) {
      const s = new THREE.SpotLight(0xfff2d8, 0, 40, 0.5, 0.5, 1.3);
      s.position.copy(hp);
      const tg = new THREE.Object3D();
      tg.position.copy(hp).addScaledVector(amb.dir, 20).setY(0);
      scene.add(tg);
      s.target = tg;
      scene.add(s);
      (s as THREE.SpotLight & { base: number }).base = 40;
      this.extra.push(s);
    }
    for (const bp of amb.bar) {
      const l = new THREE.PointLight(0xff2a20, 0, 14, 1.5);
      l.position.copy(bp);
      scene.add(l);
      this.ambSirens.push(l);
    }
  }

  private updateEnvironment(dt: number) {
    if (this.area === 'road') {
      const scene = this.engine.scene;
      if (scene.fog instanceof THREE.FogExp2) {
        scene.fog.color.setHex(0x323940);
        scene.fog.density = 0.042;
      }
      scene.background = new THREE.Color(0x323940);
      this.light.hemi.intensity = 0.25;
      this.moon.intensity = 0.15;
      return;
    }
    const r = this.player.room ?? this.room;
    if (r && r.id !== this.lastRoomId) {
      this.lastRoomId = r.id;
      this.room = r;
      this.audio.setRoom(r.reverb);
      const name = PLACES[r.name ?? ''] ?? PLACES[r.id];
      if (name && this.state === 'play') this.ui.place(name);
    }
    const room = this.room;
    if (room) {
      const fc = new THREE.Color(room.fogColor ?? 0x1a2228);
      this.fogColor.lerp(fc, 1 - Math.exp(-dt * 2));
      this.fogDensity = damp(this.fogDensity, room.fogDensity ?? 0.04, 2, dt);
      this.ambTarget = room.outdoor ? 0.45 : room.reverb === 'clean' ? 1.1 : room.light === 'on' ? 0.5 : room.light === 'dim' || room.light === 'flicker' ? 0.34 : 0.2;
    }
    const scene = this.engine.scene;
    if (!(scene.fog instanceof THREE.FogExp2)) scene.fog = new THREE.FogExp2(0x1a2228, 0.04);
    (scene.fog as THREE.FogExp2).color.copy(this.fogColor);
    (scene.fog as THREE.FogExp2).density = this.fogDensity;
    scene.background = this.fogColor;
    this.light.hemi.intensity = damp(this.light.hemi.intensity, this.ambTarget * (1 - this.extraDim) * this.light.master, 2, dt);
    // 바깥 조명
    const out = this.area === 'ground';
    const ward = this.area === 'ward';
    for (const l of this.extra) {
      const base = (l as THREE.Light & { base: number }).base ?? 1;
      const isDome = l.position.y < -2;
      l.intensity = (isDome ? ward : out) ? base : 0;
    }
    const phase = Math.floor(this.t * 3) % 2;
    this.ambSirens.forEach((l, i) => {
      l.intensity = out && this.save.flags.sirens !== 0 ? (phase === i ? 6 : 0.2) : 0;
      l.color.setHex(i === 0 ? 0xff2a20 : 0xf0f0ff);
    });
    const lamps = this.world.ambulance.lamps;
    lamps[0].visible = phase === 0;
    lamps[1].visible = phase === 1;
  }

  startLoop(key: string, buf: string, opts: Parameters<AudioSys['play']>[1] = {}) {
    if (this.loops[key]) return;
    this.loops[key] = this.audio.play(this.audio.buffers.get(buf), { loop: true, ...opts });
  }

  stopLoop(key: string, fade = 0.6) {
    this.loops[key]?.stop(fade);
    this.loops[key] = null;
  }

  // ───────────────────────────── 실패 ─────────────────────────────

  async fail(kind: keyof typeof FAIL) {
    if (this.state !== 'play') return;
    this.state = 'fail';
    this.token++;
    const info = FAIL[kind];
    this.player.mode = 'locked';
    this.input.exitLock();
    if (kind === 'hoppy') this.sfx.play('hoppy_voice', { bus: 'voice', gain: 1 });
    else this.sfx.paper(undefined, 0.8);
    this.sfx.play('tinnitus', { bus: 'ui', gain: 0.5 });
    this.audio.muffle(1, 1.5, 300);
    this.music.stinger('scare');
    await this.ui.white(true, 1.6);
    this.audio.stopAll(0.6, (v) => !!v.panner);
    this.music.chase = 0;
    this.music.tension = 0;
    this.ui.clearSubs();
    this.ui.fail(
      { complaint: info.complaint, note: info.note, place: PLACES[this.room?.name ?? ''] ?? '' },
      () => this.retry(),
      () => {
        this.ui.white(false, 0.3);
        this.showTitle();
      },
    );
  }

  retry() {
    this.ui.clearMenus();
    this.ui.white(false, 0.6);
    this.audio.muffle(0, 0.5);
    this.loadSave();
    this.state = 'play';
    this.input.wantLock = true;
    this.input.requestLock();
    this.applyProgress();
    this.story.run(this.save.checkpoint);
  }

  // ───────────────────────────── 일시정지 ─────────────────────────────

  pause() {
    if (this.state !== 'play' || this.ui.docOpen) return;
    this.state = 'pause';
    this.audio.suspend();
    this.input.exitLock();
    const d = new Date();
    this.ui.pause(
      {
        time: `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`,
        place: PLACES[this.room?.name ?? ''] ?? '—',
        patient: this.save.flags.metUna ? '우나 (여, 11~12세 추정) — 맨발, 환자복, 카디건' : '신고자 (미성년 여아 추정) — 미발견',
        notes: this.save.flags.metUna ? '물을 마시지 않음. 차가운 타일 위를 맨발로 걸음. 추위 호소 없음.' : '—',
      },
      () => this.resume(),
      () => this.ui.settings(this.settings, (s) => this.onSettings(s), () => {}),
      () => {
        this.audio.resume();
        this.showTitle();
      },
    );
  }

  resume() {
    this.ui.clearMenus();
    this.state = 'play';
    this.audio.resume();
    this.input.requestLock();
  }

  // ───────────────────────────── 박자 ─────────────────────────────

  private beat(index: number) {
    if (this.state !== 'play') return;
    const sense = this.sense();
    this.rounds.onBeat(sense);
    this.hoppy.onBeat(this.world.level, this.player.pos);
    for (const f of this.onBeat) f(index);
  }

  sense() {
    let heat = 1;
    if (this.player.holding) heat = 0;
    else if (this.player.mode === 'hidden') heat = 0.22;
    else if (this.player.crouchK > 0.5) heat = 0.85;
    else if (this.player.sprinting) heat = 1.2;
    if (this.player.mode === 'locked' && !this.player.holding) heat = Math.min(heat, 0.6);
    return { pos: this.player.pos.clone(), heat };
  }

  // ───────────────────────────── 루프 ─────────────────────────────

  perf = { frame: 0, render: 0, n: 0 };
  /** 개발용: 시간 배율 (헤드리스 점검에서 느린 프레임을 보정) */
  timeScale = 1;

  private frame() {
    requestAnimationFrame(() => this.frame());
    const now = performance.now();
    const dt = Math.min(0.05 * this.timeScale, ((now - this.last) / 1000) * this.timeScale);
    this.last = now;
    if (this.state !== 'pause') this.t += dt;
    this.update(dt);
    this.input.endFrame();
    const after = performance.now();
    this.perf.frame = this.perf.frame * 0.95 + (after - now) * 0.05;
    this.perf.n++;
  }

  private update(dt: number) {
    const inp = this.input;
    if (this.state === 'title' || this.state === 'boot') {
      this.titleCamera(dt);
      this.hoppy.update(dt, this.world.level, this.player.pos, this.t);
      this.light.update(dt, this.area);
      this.updateEnvironmentTitle(dt);
      this.music.update();
      this.pace.update(dt);
      this.renderFrame(dt);
      return;
    }
    if (this.state === 'pause') {
      if (inp.rawPressed('Escape')) this.resume();
      this.renderFrame(0);
      return;
    }
    if (this.state === 'play') {
      if (this.ui.docOpen) {
        if (inp.rawPressed('KeyE') || inp.rawPressed('Escape')) this.ui.closeDoc();
      } else if (inp.rawPressed('Escape') || (inp.rawPressed('KeyP') && !inp.locked)) {
        this.pause();
        return;
      }
      this.pace.update(dt);
      this.player.update(dt, inp, this.world.level);
      if (this.player.mode === 'walk' && !this.busy) this.handleActions();
      else {
        this.ui.prompt(null);
        this.ui.crosshair(false, false);
      }
      this.updateDevice(dt);
      this.una.update(dt, this.player, this.world.level, this.t);
      const sense = this.sense();
      this.rounds.update(dt, sense);
      this.hoppy.update(dt, this.world.level, this.player.pos, this.t);
      if (this.area === 'road') this.prologue.update(dt);
      // 문 열림·닫힘 애니메이션 (열린 각도가 충돌 판정도 정한다)
      for (const d of this.world.level.doors) d.update(dt);
      this.npcOpenDoors();
      this.updateEnvironment(dt);
      this.updateMusicLayers(dt);
      this.ui.stamina(this.player.stamina);
      this.ui.update(dt);
      this.story.update(dt);
      this.updateHint(dt);
    }
    if (this.state === 'fail' || this.state === 'credits') {
      this.pace.update(dt);
    }
    this.light.flashDist = this.flashDistance();
    this.light.update(dt, this.area, this.extraDim);
    this.music.update();
    this.renderFrame(dt);
  }

  /** 시선 방향으로 벽·바닥·천장까지의 거리 */
  private flashDistance() {
    const p = this.player;
    const eye = p.eye;
    const dir = p.look;
    let d = 8;
    const h = Math.hypot(dir.x, dir.z);
    if (h > 1e-3) d = Math.min(d, this.world.level.rayDist(eye.x, eye.z, dir.x / h, dir.z / h, 8) / h);
    const r = p.room;
    if (dir.y < -1e-3) d = Math.min(d, (eye.y - (r?.y ?? 0)) / -dir.y);
    if (dir.y > 1e-3 && r && !r.outdoor) d = Math.min(d, (r.y + r.h - eye.y) / dir.y);
    return d;
  }

  private updateEnvironmentTitle(dt: number) {
    const lobby = this.world.level.rooms.find((r) => r.id === 'lobby')!;
    this.room = lobby;
    this.player.room = lobby;
    this.updateEnvironment(dt);
  }

  private updateMusicLayers(dt: number) {
    const near = this.rounds.nearest(this.player.pos);
    const t = near.round ? clamp(1 - (near.dist - 2) / 10, 0, 1) : 0;
    const want = this.rounds.chasing ? 1 : t * 0.8;
    this.music.tension = damp(this.music.tension, want, 1.5, dt);
    if (this.music.tension < 0.03 && want === 0) this.music.tension = 0;
  }

  /** 우나, 회진, 쫓아오는 호피는 잠기지 않은 문 앞에 오면 문을 연다 (길 찾기는 문을 지나갈 수 있다고 본다) */
  private npcOpenDoors() {
    const movers: THREE.Vector3[] = [];
    if (this.una.rig.root.visible && !this.una.poseLock && this.una.mode !== 'off') movers.push(this.una.pos);
    for (const r of this.rounds.members) movers.push(r.pos);
    if (this.hoppy.state === 'chase') movers.push(this.hoppy.pos);
    if (!movers.length) return;
    for (const d of this.world.level.doors) {
      const k = d.def.kind;
      if (d.open || d.locked || (k !== 'door' && k !== 'double') || d.id.startsWith('air')) continue;
      const c = d.center;
      if (movers.some((p) => Math.abs(p.x - c.x) < 1.1 && Math.abs(p.z - c.z) < 1.1)) this.openDoor(d.id, true);
    }
  }

  // ───────────────────────────── 힌트 ─────────────────────────────

  private stuckT = 0;
  private stuckGoal: string | null = null;

  /** 지금 목표에 맞는 구체적인 힌트 */
  currentHint(): string | null {
    const g = this.ui.goalText;
    if (!g) return null;
    const key = Object.keys(GOALS).find((k) => GOALS[k] === g);
    return (key && HINTS[key]) || null;
  }

  showHint() {
    const h = this.currentHint();
    this.ui.tip(h ?? '지금은 주변을 살펴본다.', 9);
    this.stuckT = 0;
  }

  /** 같은 목표에서 오래 머물면 힌트를 한 번씩 보여 준다 */
  private updateHint(dt: number) {
    if (this.ui.goalText !== this.stuckGoal) {
      this.stuckGoal = this.ui.goalText;
      this.stuckT = 0;
    }
    if (this.player.mode !== 'walk' || this.busy || this.ui.docOpen) return;
    this.stuckT += dt;
    if (this.stuckT > 75 && this.currentHint()) this.showHint();
  }

  private handleActions() {
    const inp = this.input;
    const eye = this.player.eye;
    if (inp.wasPressed('KeyH')) this.showHint();
    // 상호작용
    const it = this.inter.pick(eye, this.player.look, this.world.level, this.area);
    this.ui.prompt(it ? this.inter.promptOf(it) : null);
    this.ui.crosshair(!!it, true);
    if (it && inp.wasPressed(it.key ?? 'KeyE')) it.onUse();
    // 손전등
    if (inp.wasPressed('KeyF') && this.area !== 'road') {
      this.light.setFlash(!this.light.flashOn);
      this.sfx.play('switch', { bus: 'ui', gain: 0.35 });
    }
    // 우나의 손
    const u = this.una;
    if (this.allowHold && u.rig.root.visible && (u.mode === 'follow' || u.mode === 'idle' || u.mode === 'hold')) {
      const near = u.pos.distanceTo(this.player.pos) < 1.8;
      if (inp.isDown('KeyQ') && (near || u.mode === 'hold')) {
        if (u.mode !== 'hold') {
          u.mode = 'hold';
          this.player.holding = true;
          this.sfx.play('paper_1', { bus: 'ui', gain: 0.1, rate: 0.6 });
          if (!this.save.flags.firstHold) {
            this.save.flags.firstHold = 1;
            this.say(UNA.flinch).catch(() => {});
          }
        }
      } else if (u.mode === 'hold') {
        u.follow();
        this.player.holding = false;
      }
    } else if (this.player.holding) this.player.holding = false;
    this.vm.pose = this.player.holding ? 'hold' : this.vm.pose === 'hold' ? 'idle' : this.vm.pose;
  }

  private renderFrame(dt: number) {
    const cam = this.engine.camera;
    if (this.state === 'play' || this.state === 'fail' || this.state === 'pause' || this.state === 'credits') {
      if (this.state === 'play') this.player.applyCamera(cam, dt, this.t);
      this.vm.update(dt, cam, this.player, this.light.ambientAtPlayer, this.light.flashOn);
      this.vm.root.visible = this.vmForce || (this.state === 'play' && this.player.mode !== 'locked' && this.area !== 'road' && this.player.mode !== 'hidden') || (this.player.mode === 'hidden' && this.player.holding);
    } else this.vm.root.visible = false;
    this.audio.setListener(cam);
    this.audio.update(dt);
    const post = this.engine.post.u;
    post.uWhite.value = Math.max(0, post.uWhite.value - dt * 1.5);
    post.uWarp.value = damp(post.uWarp.value, this.warp, 4, dt);
    post.uRed.value = damp(post.uRed.value, this.red, 3, dt);
    post.uPulse.value = 0;
    post.uCA.value = 0.012 + this.warp * 0.03;
    const r0 = performance.now();
    this.engine.render(dt);
    this.perf.render = this.perf.render * 0.95 + (performance.now() - r0) * 0.05;
  }

  // ───────────────────────────── 크레딧 ─────────────────────────────

  async showCreditsOnly() {
    this.state = 'credits';
    this.music.stop(1);
    const c = this.ui.credits(CREDITS, NEXT);
    this.music.onLyric = (l) => c.lyric(l);
    this.music.startCredits();
    await new Promise<void>((r) => (this.music.onCreditsEnd = r));
    await c.done;
    this.showTitle();
  }

  /** 개발용: 체크포인트에서 바로 시작 */
  debugStart(cp: string, extra: Partial<SaveData> = {}) {
    this.save = { ...Game.freshSave(), checkpoint: cp, ...extra };
    const order = ['prologue', 'gate', 'lobby', 'ward', 'una', 'quiz', 'r304', 'playroom', 'chase', 'basement', 'clean'];
    const i = order.indexOf(cp);
    if (i >= 3) Object.assign(this.save.flags, { device: 1, card: 1, titleCard: 1 });
    if (i >= 4) this.save.flags.metUna = 1;
    if (i >= 6) this.save.parts = [true, true, true, true, true, true];
    if (i >= 6) this.save.flags.quiz = 1;
    if (i >= 8) this.save.flags.key = 1;
    this.writeSave();
    this.begin();
  }

  // 외부(디버그)용
  addInteract(i: Interactable) {
    this.inter.add(i);
  }

  initDoors() {
    this.setupDoors();
  }
}
