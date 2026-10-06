import * as THREE from 'three';
import { clamp, rng } from '../core/util';

/**
 * 오디오 엔진.
 * - 실제 악기 녹음(VSCO 2 CE, CC0)과 절차적 합성 버퍼를 함께 다룬다.
 * - 월드 소리는 HRTF 입체음향 + 방 잔향(두 개의 컨볼버를 교차 페이드) + 벽 차폐(저역 통과).
 * - 음악은 별도의 '홀' 잔향을 쓴다 (변주 4의 '잔향만 남은 소리'도 여기로 보낸다).
 * - 마스터: 은은한 대역 제한(90년대 CD-ROM 질감) → 리미터.
 */

export type Bus = 'music' | 'world' | 'ui' | 'voice' | 'amb' | 'heart';

export interface Vec3Like {
  x: number;
  y: number;
  z: number;
}

export interface PlayOpts {
  bus?: Bus;
  /** 오디오 시각. 생략하면 즉시 */
  at?: number;
  gain?: number;
  rate?: number;
  /** 센트 단위 미세 조정 */
  detune?: number;
  /** 월드 위치 (입체음향) */
  pos?: Vec3Like;
  /** 매 프레임 이 오브젝트의 위치를 따라간다 */
  follow?: THREE.Object3D;
  lowpass?: number;
  highpass?: number;
  loop?: boolean;
  loopStart?: number;
  loopEnd?: number;
  offset?: number;
  duration?: number;
  fadeIn?: number;
  /** 방 잔향 보내기 (월드 소리 기본 0.35) */
  send?: number;
  /** 음악 홀 잔향 보내기 */
  hall?: number;
  /** 원음 크기 (0이면 잔향만 남는다) */
  dry?: number;
  /** 입체음향이 아닐 때 좌우 (-1..1) */
  pan?: number;
  refDistance?: number;
  rolloff?: number;
  maxDistance?: number;
  /** 벽 차폐 계산을 하지 않는다 */
  noOcclude?: boolean;
}

export class Voice {
  ended = false;
  occl = 0;
  constructor(
    readonly src: AudioBufferSourceNode,
    readonly out: GainNode,
    readonly filter: BiquadFilterNode | null,
    readonly panner: PannerNode | null,
    readonly baseGain: number,
    readonly follow: THREE.Object3D | null,
    private readonly sys: AudioSys,
    readonly pos: THREE.Vector3 | null,
    readonly occludable: boolean,
  ) {
    src.onended = () => {
      this.ended = true;
      sys.release(this);
    };
  }

  stop(fade = 0.08, at?: number) {
    if (this.ended) return;
    const t = Math.max(at ?? this.sys.now, this.sys.now);
    try {
      this.out.gain.cancelScheduledValues(t);
      this.out.gain.setValueAtTime(this.out.gain.value, t);
      this.out.gain.linearRampToValueAtTime(0, t + fade);
      this.src.stop(t + fade + 0.02);
    } catch {
      /* 이미 멈춤 */
    }
  }

  setGain(v: number, time = 0.08) {
    if (this.ended) return;
    const t = this.sys.now;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(v * this.baseGain * (1 - this.occl * 0.45), t, time / 3);
  }

  setRate(r: number, time = 0.05) {
    if (this.ended) return;
    this.src.playbackRate.setTargetAtTime(r, this.sys.now, time / 3);
  }

  setPos(p: Vec3Like) {
    if (!this.panner || this.ended) return;
    const t = this.sys.now;
    this.panner.positionX.setTargetAtTime(p.x, t, 0.02);
    this.panner.positionY.setTargetAtTime(p.y, t, 0.02);
    this.panner.positionZ.setTargetAtTime(p.z, t, 0.02);
    this.pos?.set(p.x, p.y, p.z);
  }
}

export interface SampleEntry {
  buf: AudioBuffer;
  root: number;
  name: string;
}

interface RoomPreset {
  rt: number;
  bright: number;
  pre: number;
  send: number;
}

export const ROOMS: Record<string, RoomPreset> = {
  ward: { rt: 0.55, bright: 0.55, pre: 0.008, send: 0.32 },
  corridor: { rt: 1.25, bright: 0.6, pre: 0.012, send: 0.38 },
  clean: { rt: 0.32, bright: 0.95, pre: 0.004, send: 0.3 },
  lobby: { rt: 2.6, bright: 0.5, pre: 0.025, send: 0.5 },
  outside: { rt: 0.9, bright: 0.25, pre: 0.04, send: 0.18 },
  ambulance: { rt: 0.14, bright: 0.4, pre: 0.002, send: 0.15 },
  elevator: { rt: 0.22, bright: 0.7, pre: 0.003, send: 0.25 },
  playroom: { rt: 0.85, bright: 0.5, pre: 0.01, send: 0.34 },
  laundry: { rt: 1.4, bright: 0.65, pre: 0.015, send: 0.42 },
  vent: { rt: 0.3, bright: 1.0, pre: 0.002, send: 0.5 },
};

const BASE = import.meta.env.BASE_URL;

export class AudioSys {
  ctx!: AudioContext;
  ready = false;
  private master!: GainNode;
  private limiter!: DynamicsCompressorNode;
  readonly buses = {} as Record<Bus, GainNode>;
  private worldMuffle!: BiquadFilterNode;
  private worldPost!: GainNode;
  private roomIn!: GainNode;
  private convA!: ConvolverNode;
  private convB!: ConvolverNode;
  private convAGain!: GainNode;
  private convBGain!: GainNode;
  private useA = true;
  private hallIn!: GainNode;
  private hall!: ConvolverNode;
  room = 'ward';
  private irCache = new Map<string, AudioBuffer>();

  readonly groups = new Map<string, SampleEntry[]>();
  readonly buffers = new Map<string, AudioBuffer>();
  private lastPick = new Map<string, number>();
  private voices = new Set<Voice>();
  private occludeTimer = 0;
  private listenerPos = new THREE.Vector3();
  /** 벽 차폐 판정 (0 = 뚫림, 1 = 막힘). 레벨이 설정한다 */
  occluder: ((a: THREE.Vector3, b: THREE.Vector3) => number) | null = null;
  private rand = rng(9071);

  /** 볼륨 설정 (0..1) */
  volumes = { master: 0.9, music: 0.8, sfx: 1.0 };

  get now() {
    return this.ctx ? this.ctx.currentTime : performance.now() / 1000;
  }

  get running() {
    return !!this.ctx && this.ctx.state === 'running';
  }

  init() {
    if (this.ctx) return;
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;

    // 마스터: 은은한 대역 제한 → 부드러운 포화 → 리미터
    this.master = ctx.createGain();
    this.master.gain.value = this.volumes.master;
    const lp = ctx.createBiquadFilter();
    lp.type = 'lowpass';
    lp.frequency.value = 15500;
    lp.Q.value = 0.5;
    const shaper = ctx.createWaveShaper();
    shaper.curve = softClipCurve();
    shaper.oversample = '2x';
    this.limiter = ctx.createDynamicsCompressor();
    this.limiter.threshold.value = -7;
    this.limiter.knee.value = 4;
    this.limiter.ratio.value = 14;
    this.limiter.attack.value = 0.003;
    this.limiter.release.value = 0.22;
    const out = ctx.createGain();
    out.gain.value = 0.92;
    this.master.connect(lp);
    lp.connect(shaper);
    shaper.connect(this.limiter);
    this.limiter.connect(out);
    out.connect(ctx.destination);

    for (const b of ['music', 'world', 'ui', 'voice', 'amb', 'heart'] as Bus[]) {
      const g = ctx.createGain();
      this.buses[b] = g;
    }

    // 월드 버스: 먹먹함(청진기, 침대 밑, 실패) 필터
    this.worldMuffle = ctx.createBiquadFilter();
    this.worldMuffle.type = 'lowpass';
    this.worldMuffle.frequency.value = 20000;
    this.worldMuffle.Q.value = 0.7;
    this.worldPost = ctx.createGain();
    this.buses.world.connect(this.worldMuffle);
    this.buses.amb.connect(this.worldMuffle);
    this.worldMuffle.connect(this.worldPost);
    this.worldPost.connect(this.master);

    this.buses.heart.connect(this.master);
    this.buses.ui.connect(this.master);
    this.buses.voice.connect(this.master);
    this.buses.music.connect(this.master);

    // 방 잔향 (두 개를 교차 페이드)
    this.roomIn = ctx.createGain();
    this.convA = ctx.createConvolver();
    this.convB = ctx.createConvolver();
    this.convAGain = ctx.createGain();
    this.convBGain = ctx.createGain();
    this.convBGain.gain.value = 0;
    this.roomIn.connect(this.convA);
    this.roomIn.connect(this.convB);
    this.convA.connect(this.convAGain);
    this.convB.connect(this.convBGain);
    this.convAGain.connect(this.worldMuffle);
    this.convBGain.connect(this.worldMuffle);
    this.convA.buffer = this.roomIR('ward');

    // 음악 홀 잔향
    this.hallIn = ctx.createGain();
    this.hall = ctx.createConvolver();
    this.hall.buffer = makeIR(ctx, 4.2, 0.55, 0.03, 7);
    this.hallIn.connect(this.hall);
    this.hall.connect(this.buses.music);
    this.applyVolumes();
  }

  applyVolumes() {
    if (!this.ctx) return;
    const t = this.now;
    this.master.gain.setTargetAtTime(this.volumes.master, t, 0.05);
    this.buses.music.gain.setTargetAtTime(this.volumes.music, t, 0.05);
    for (const b of ['world', 'ui', 'voice', 'amb', 'heart'] as Bus[]) this.buses[b].gain.setTargetAtTime(this.volumes.sfx, t, 0.05);
  }

  async resume() {
    if (!this.ctx) this.init();
    if (this.ctx.state !== 'running') {
      try {
        await this.ctx.resume();
      } catch {
        /* 사용자 제스처 전 */
      }
    }
  }

  suspend() {
    if (this.ctx && this.ctx.state === 'running') this.ctx.suspend();
  }

  // ───────────────────────────── 샘플 ─────────────────────────────

  async loadSamples(onProgress?: (done: number, total: number) => void) {
    const res = await fetch(`${BASE}audio/vsco/manifest.json`);
    const manifest = (await res.json()) as Record<string, { group: string; root?: number }>;
    const names = Object.keys(manifest);
    let done = 0;
    const work = names.map(async (name) => {
      try {
        const r = await fetch(`${BASE}audio/vsco/${name}.mp3`);
        const ab = await r.arrayBuffer();
        const raw = await this.ctx.decodeAudioData(ab);
        const buf = trimLeading(this.ctx, raw);
        const m = manifest[name];
        const entry: SampleEntry = { buf, root: m.root ?? 60, name };
        let g = this.groups.get(m.group);
        if (!g) this.groups.set(m.group, (g = []));
        g.push(entry);
        this.buffers.set(name, buf);
      } catch (e) {
        console.warn('샘플 로드 실패', name, e);
      }
      done++;
      onProgress?.(done, names.length);
    });
    await Promise.all(work);
    for (const g of this.groups.values()) g.sort((a, b) => a.root - b.root || a.name.localeCompare(b.name));
  }

  /** 합성 버퍼를 이름으로 등록 */
  register(name: string, buf: AudioBuffer, group?: string, root = 60) {
    this.buffers.set(name, buf);
    if (group) {
      let g = this.groups.get(group);
      if (!g) this.groups.set(group, (g = []));
      g.push({ buf, root, name });
      g.sort((a, b) => a.root - b.root);
    }
  }

  has(group: string) {
    return (this.groups.get(group)?.length ?? 0) > 0;
  }

  /** 음높이가 있는 그룹에서 가장 가까운 샘플과 재생 속도 */
  pick(group: string, midi: number): { buf: AudioBuffer; rate: number } | null {
    const g = this.groups.get(group);
    if (!g || !g.length) return null;
    let best = g[0];
    let bd = Infinity;
    for (const e of g) {
      // 위로 올리는 것보다 아래로 내리는 쪽이 자연스럽다 (약간의 가중)
      const d = Math.abs(e.root - midi) + (e.root < midi ? 0.3 : 0);
      if (d < bd) {
        bd = d;
        best = e;
      }
    }
    return { buf: best.buf, rate: Math.pow(2, (midi - best.root) / 12) };
  }

  /** 음높이 없는 그룹에서 직전과 다른 하나를 고른다 */
  any(group: string, idx?: number): AudioBuffer | null {
    const g = this.groups.get(group);
    if (!g || !g.length) return null;
    if (idx !== undefined) return g[clamp(idx, 0, g.length - 1)].buf;
    let i = Math.floor(this.rand() * g.length);
    if (g.length > 1 && i === this.lastPick.get(group)) i = (i + 1) % g.length;
    this.lastPick.set(group, i);
    return g[i].buf;
  }

  // ───────────────────────────── 재생 ─────────────────────────────

  play(buf: AudioBuffer | null | undefined, o: PlayOpts = {}): Voice | null {
    if (!this.ctx || !buf) return null;
    const ctx = this.ctx;
    const at = Math.max(o.at ?? ctx.currentTime, ctx.currentTime);
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.playbackRate.value = o.rate ?? 1;
    if (o.detune) src.detune.value = o.detune;
    if (o.loop) {
      src.loop = true;
      if (o.loopStart !== undefined) src.loopStart = o.loopStart;
      if (o.loopEnd !== undefined) src.loopEnd = o.loopEnd;
    }
    let node: AudioNode = src;
    let filter: BiquadFilterNode | null = null;
    if (o.highpass) {
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = o.highpass;
      node.connect(hp);
      node = hp;
    }
    const positional = !!(o.pos || o.follow);
    if (o.lowpass || (positional && !o.noOcclude)) {
      filter = ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = o.lowpass ?? 20000;
      filter.Q.value = 0.6;
      node.connect(filter);
      node = filter;
    }
    const out = ctx.createGain();
    const base = o.gain ?? 1;
    if (o.fadeIn) {
      out.gain.setValueAtTime(0, at);
      out.gain.linearRampToValueAtTime(base, at + o.fadeIn);
    } else out.gain.value = base;
    node.connect(out);

    let panner: PannerNode | null = null;
    let pos: THREE.Vector3 | null = null;
    let last: AudioNode = out;
    if (positional) {
      panner = ctx.createPanner();
      panner.panningModel = 'HRTF';
      panner.distanceModel = 'inverse';
      panner.refDistance = o.refDistance ?? 1.4;
      panner.rolloffFactor = o.rolloff ?? 1.15;
      panner.maxDistance = o.maxDistance ?? 60;
      const p = o.follow ? o.follow.getWorldPosition(new THREE.Vector3()) : new THREE.Vector3(o.pos!.x, o.pos!.y, o.pos!.z);
      pos = p.clone();
      panner.positionX.value = p.x;
      panner.positionY.value = p.y;
      panner.positionZ.value = p.z;
      out.connect(panner);
      last = panner;
    } else if (o.pan) {
      const sp = ctx.createStereoPanner();
      sp.pan.value = clamp(o.pan, -1, 1);
      out.connect(sp);
      last = sp;
    }

    const bus = o.bus ?? (positional ? 'world' : 'ui');
    const dry = o.dry ?? 1;
    if (dry > 0) {
      if (dry !== 1) {
        const dg = ctx.createGain();
        dg.gain.value = dry;
        last.connect(dg);
        dg.connect(this.buses[bus]);
      } else last.connect(this.buses[bus]);
    }
    const send = o.send ?? (bus === 'world' || bus === 'amb' || bus === 'voice' ? ROOMS[this.room]?.send ?? 0.3 : 0);
    if (send > 0) {
      const sg = ctx.createGain();
      sg.gain.value = send;
      last.connect(sg);
      sg.connect(this.roomIn);
    }
    if (o.hall) {
      const hg = ctx.createGain();
      hg.gain.value = o.hall;
      last.connect(hg);
      hg.connect(this.hallIn);
    }

    if (o.duration !== undefined) src.start(at, o.offset ?? 0, o.duration);
    else src.start(at, o.offset ?? 0);
    const v = new Voice(src, out, filter, panner, base, o.follow ?? null, this, pos, positional && !o.noOcclude);
    this.voices.add(v);
    if (v.occludable && pos) this.applyOcclusion(v, true);
    return v;
  }

  /** 음높이가 있는 악기 한 음 */
  note(group: string, midi: number, o: PlayOpts = {}): Voice | null {
    const p = this.pick(group, midi);
    if (!p) return null;
    return this.play(p.buf, { ...o, rate: (o.rate ?? 1) * p.rate });
  }

  release(v: Voice) {
    this.voices.delete(v);
  }

  stopAll(fade = 0.3, filter?: (v: Voice) => boolean) {
    for (const v of this.voices) if (!filter || filter(v)) v.stop(fade);
  }

  // ───────────────────────────── 공간 ─────────────────────────────

  setListener(cam: THREE.Camera) {
    if (!this.ctx) return;
    const l = this.ctx.listener;
    const p = cam.getWorldPosition(this.listenerPos);
    const f = new THREE.Vector3(0, 0, -1).applyQuaternion(cam.quaternion);
    const u = new THREE.Vector3(0, 1, 0).applyQuaternion(cam.quaternion);
    const t = this.ctx.currentTime;
    if (l.positionX) {
      l.positionX.setTargetAtTime(p.x, t, 0.015);
      l.positionY.setTargetAtTime(p.y, t, 0.015);
      l.positionZ.setTargetAtTime(p.z, t, 0.015);
      l.forwardX.setTargetAtTime(f.x, t, 0.015);
      l.forwardY.setTargetAtTime(f.y, t, 0.015);
      l.forwardZ.setTargetAtTime(f.z, t, 0.015);
      l.upX.setTargetAtTime(u.x, t, 0.015);
      l.upY.setTargetAtTime(u.y, t, 0.015);
      l.upZ.setTargetAtTime(u.z, t, 0.015);
    } else {
      (l as unknown as { setPosition(x: number, y: number, z: number): void }).setPosition(p.x, p.y, p.z);
    }
  }

  private applyOcclusion(v: Voice, instant = false) {
    if (!this.occluder || !v.pos || !v.filter) return;
    const occ = this.occluder(this.listenerPos, v.pos);
    if (Math.abs(occ - v.occl) < 0.05 && !instant) return;
    v.occl = occ;
    const f = 20000 * Math.pow(700 / 20000, occ);
    const t = this.now;
    if (instant) v.filter.frequency.value = f;
    else v.filter.frequency.setTargetAtTime(f, t, 0.08);
  }

  update(dt: number) {
    if (!this.ctx) return;
    for (const v of this.voices) {
      if (v.follow && v.panner) {
        const p = v.follow.getWorldPosition(new THREE.Vector3());
        v.setPos(p);
      }
    }
    this.occludeTimer -= dt;
    if (this.occludeTimer <= 0) {
      this.occludeTimer = 0.15;
      for (const v of this.voices) if (v.occludable) this.applyOcclusion(v);
    }
  }

  /** 방 잔향 프리셋으로 교차 페이드 */
  setRoom(name: string) {
    if (!this.ctx || name === this.room || !ROOMS[name]) return;
    this.room = name;
    const ir = this.roomIR(name);
    const t = this.now;
    if (this.useA) {
      this.convB.buffer = ir;
      this.convBGain.gain.setTargetAtTime(1, t, 0.25);
      this.convAGain.gain.setTargetAtTime(0, t, 0.25);
    } else {
      this.convA.buffer = ir;
      this.convAGain.gain.setTargetAtTime(1, t, 0.25);
      this.convBGain.gain.setTargetAtTime(0, t, 0.25);
    }
    this.useA = !this.useA;
  }

  private roomIR(name: string) {
    let ir = this.irCache.get(name);
    if (!ir) {
      const p = ROOMS[name];
      ir = makeIR(this.ctx, Math.min(4, p.rt * 1.6 + 0.2), p.bright, p.pre, name.length * 31 + 7, p.rt);
      this.irCache.set(name, ir);
    }
    return ir;
  }

  /**
   * 월드 소리를 먹먹하게 (0 = 그대로, 1 = 벽 너머/청진기)
   * @param cutoff 완전히 먹먹할 때의 차단 주파수
   */
  muffle(amount: number, time = 0.15, cutoff = 380) {
    if (!this.ctx) return;
    const f = 20000 * Math.pow(cutoff / 20000, clamp(amount, 0, 1));
    this.worldMuffle.frequency.setTargetAtTime(f, this.now, time / 3);
  }

  /** 월드 소리 전체 크기 (실패 연출, 무균실) */
  worldLevel(v: number, time = 0.3) {
    if (!this.ctx) return;
    this.worldPost.gain.setTargetAtTime(v, this.now, time / 3);
  }

  busLevel(bus: Bus, v: number, time = 0.3) {
    if (!this.ctx) return;
    const base = bus === 'music' ? this.volumes.music : this.volumes.sfx;
    this.buses[bus].gain.setTargetAtTime(v * base, this.now, time / 3);
  }
}

/** 앞쪽 무음(MP3 디코더 지연 포함)을 잘라 박자에 정확히 맞춘다 */
function trimLeading(ctx: AudioContext, b: AudioBuffer): AudioBuffer {
  const d = b.getChannelData(0);
  let peak = 0;
  for (let i = 0; i < d.length; i++) peak = Math.max(peak, Math.abs(d[i]));
  const th = Math.max(0.004, peak * 0.012);
  let i0 = 0;
  while (i0 < d.length && Math.abs(d[i0]) < th) i0++;
  i0 = Math.max(0, i0 - 48);
  if (i0 < 8) return b;
  const out = ctx.createBuffer(b.numberOfChannels, b.length - i0, b.sampleRate);
  for (let c = 0; c < b.numberOfChannels; c++) out.copyToChannel(b.getChannelData(c).subarray(i0), c);
  return out;
}

function softClipCurve() {
  const n = 2048;
  const c = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const x = (i / (n - 1)) * 2 - 1;
    c[i] = Math.tanh(x * 1.15) / Math.tanh(1.15);
  }
  return c;
}

/**
 * 잔향 임펄스 응답 생성.
 * 지수 감쇠 노이즈 + 시간에 따라 어두워지는 저역 통과(고역이 먼저 사라진다) + 초기 반사.
 */
export function makeIR(ctx: BaseAudioContext, seconds: number, bright: number, pre: number, seed: number, rt60 = seconds * 0.7) {
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(seconds * sr));
  const ir = ctx.createBuffer(2, len, sr);
  for (let ch = 0; ch < 2; ch++) {
    const r = rng(seed * 13 + ch * 101);
    const d = ir.getChannelData(ch);
    let y = 0;
    const preN = Math.floor(pre * sr);
    const fc0 = 2500 + bright * 9000;
    for (let i = preN; i < len; i++) {
      const t = (i - preN) / sr;
      const env = Math.pow(10, (-3 * t) / rt60);
      const fc = Math.max(250, fc0 * Math.exp(-t * (2.2 / rt60)));
      const a = Math.exp((-2 * Math.PI * fc) / sr);
      y = (1 - a) * (r() * 2 - 1) + a * y;
      d[i] = y * env;
    }
    // 초기 반사
    const taps = 7;
    for (let k = 0; k < taps; k++) {
      const ti = preN + Math.floor((0.003 + r() * 0.05 * Math.min(1, rt60)) * sr);
      if (ti < len) d[ti] += (r() < 0.5 ? -1 : 1) * (0.5 - k * 0.05) * (0.4 + bright * 0.4);
    }
    // 시작 부분을 부드럽게
    for (let i = 0; i < Math.min(len, 64); i++) d[i] *= i / 64;
  }
  return ir;
}
