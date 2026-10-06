import { rng } from '../core/util';
import type { AudioSys, PlayOpts, Vec3Like, Voice } from './audio';
import {
  SR,
  babble,
  bandpass,
  celesta,
  crossfadeLoop,
  crotale,
  glassHarmonica,
  bowedVibe,
  makeBuffer,
  musicBox,
  noiseLoop,
  normalize,
  onePole,
  resonate,
  sing,
  toyPiano,
  ukulele,
  vibraphone,
  type SungNote,
} from './synth';

/**
 * 효과음 은행.
 * 실제 녹음(마림바, 우드블록, 금속, 유리, 큰북…)을 우선 쓰고,
 * 녹음이 없는 것(발소리 재질, 문 삐걱임, 전화 신호음, 형광등…)은 물리에 가깝게 합성한다.
 */

export type FloorMat = 'lino' | 'tile' | 'carpet' | 'metal' | 'asphalt' | 'tissue' | 'wood';

const LULLABY: [number, number][][] = [
  [
    [64, 2],
    [62, 1],
    [64, 2],
    [67, 1],
  ],
  [
    [69, 2],
    [67, 1],
    [64, 2],
    [62, 1],
  ],
  [
    [64, 2],
    [67, 1],
    [69, 2],
    [72, 1],
  ],
  [
    [69, 2],
    [67, 1],
    [67, 3],
  ],
  [
    [72, 2],
    [69, 1],
    [67, 2],
    [64, 1],
  ],
  [
    [67, 2],
    [64, 1],
    [62, 2],
    [60, 1],
  ],
  [
    [62, 2],
    [64, 1],
    [67, 2],
    [64, 1],
  ],
  [
    [62, 2],
    [64, 1],
    [60, 3],
  ],
];
/** 자장가 8마디 (MIDI, 8분음표 개수). 07_AUDIO S4.2 */
export const LULLABY_BARS = LULLABY;
/** 가사 음절의 모음 (자장자장 우리 아가 / 봄은 다시 올 거야 / 어떤 모습으로 와도 / 엄마는 알아볼게) */
const LYRIC_VOWELS = ['a', 'a', 'a', 'a', 'u', 'i', 'a', 'a', 'o', 'eu', 'a', 'i', 'o', 'eo', 'a', 'eo', 'eo', 'eu', 'eu', 'o', 'a', 'o', 'eo', 'a', 'eu', 'a', 'a', 'o', 'e'];
const LYRIC_CONS = ['j', 'j', 'j', 'j', '', 'l', '', 'g', 'b', '', 'd', 's', '', 'g', '', '', 'd', 'm', 's', '', 'l', '', 'm', 'm', 'n', '', 'l', 'b', 'g'];

export class Sfx {
  private r = rng(4242);
  private stepIdx = 0;
  private harmCache = new Map<string, AudioBuffer>();
  constructor(readonly a: AudioSys) {}

  private reg(name: string, data: Float32Array, group?: string, root?: number) {
    this.a.register(name, makeBuffer(this.a.ctx, data), group, root);
  }

  buf(name: string) {
    return this.a.buffers.get(name) ?? null;
  }

  /** 모든 합성음을 만든다. 무거우니 중간중간 화면에 양보한다 */
  async build(onProgress?: (p: number) => void) {
    const jobs: (() => void)[] = [];
    const add = (fn: () => void) => jobs.push(fn);

    // ── 악기 ──
    for (const m of [60, 64, 67, 69, 72, 74, 76, 79, 81, 84, 86, 88, 91]) add(() => this.reg(`mbox_${m}`, musicBox(m), 'mbox', m));
    for (const m of [60, 64, 67, 69, 72, 74, 76, 79, 81, 84, 88]) add(() => this.reg(`celesta_${m}`, celesta(m), 'celesta', m));
    for (const m of [60, 62, 64, 65, 67, 69, 71, 72, 74, 76, 77, 79, 81, 84]) add(() => this.reg(`toyp_${m}`, toyPiano(m), 'toyp', m));
    for (const m of [55, 60, 64, 67, 72, 76, 79]) add(() => this.reg(`vibe_${m}`, vibraphone(m), 'svibe', m));
    for (const m of [81, 86, 93]) add(() => this.reg(`crot_${m}`, crotale(m), 'crot', m));
    for (const m of [55, 57, 59, 60, 62, 64, 65, 67, 69, 71, 72]) add(() => this.reg(`uke_${m}`, ukulele(m), 'uke', m));

    // ── 목소리 ──
    add(() => this.reg('hum_theme', this.motherHum()));
    add(() => this.reg('una_hum', this.unaHum()));
    add(() => this.reg('call_911', this.call911()));
    add(() => this.reg('hoppy_voice', toyVoice(babble('새 친구! 부품 바꾸자!', { f0: 300, rate: 0.82, formantScale: 1.15, seed: 31, fall: 6 }))));
    add(() => this.reg('hoppy_hello', toyVoice(babble('안녕, 친구들! 호피의 건강 시간이에요!', { f0: 320, rate: 1.0, formantScale: 1.18, seed: 33, fall: 2 }))));
    add(() => this.reg('hoppy_right', toyVoice(babble('맞았어요! 잘했어요!', { f0: 340, rate: 1.0, formantScale: 1.18, seed: 35, fall: 1 }))));
    add(() => this.reg('hoppy_wrong', toyVoice(babble('틀렸어요!', { f0: 250, rate: 0.7, formantScale: 1.1, seed: 37, fall: 8 }))));
    add(() => this.reg('hoppy_q', toyVoice(babble('문제 나갑니다. 잘 듣고 골라 보세요.', { f0: 320, rate: 1.0, formantScale: 1.18, seed: 39, fall: 3 }))));
    add(() => this.reg('pa_rounds', paVoice(babble('회진 시간입니다. 병실에 머물러 주세요.', { f0: 205, rate: 0.95, formantScale: 1.0, seed: 41, fall: 3 }))));
    add(() => this.reg('radio_disp', radioVoice(babble('구급 일, 할로 파인스 캠퍼스, 공중전화 신고입니다. 녹음 재생합니다.', { f0: 190, rate: 1.1, formantScale: 1.0, seed: 43, fall: 2 }))));
    add(() => this.reg('radio_marcus', radioVoice(babble('들려? 신호가 안 잡혀. 거기 있어.', { f0: 125, rate: 1.0, formantScale: 0.88, seed: 45, fall: 3 }))));

    // ── 발소리 ──
    const mats: FloorMat[] = ['lino', 'tile', 'carpet', 'metal', 'asphalt', 'tissue', 'wood'];
    for (const m of mats) for (let i = 0; i < 4; i++) add(() => this.reg(`step_${m}_${i}`, footstep(m, i)));
    for (let i = 0; i < 4; i++) add(() => this.reg(`bare_${i}`, barefoot(i)));

    // ── 문·사물 ──
    for (let i = 0; i < 3; i++) add(() => this.reg(`creak_${i}`, creak(1.0 + i * 0.35, i)));
    add(() => this.reg('stretch', creak(3.2, 9, true)));
    add(() => this.reg('door_shut', doorShut(0)));
    add(() => this.reg('door_slam', doorShut(1)));
    for (let i = 0; i < 3; i++) add(() => this.reg(`paper_${i}`, paper(i)));
    for (let i = 0; i < 3; i++) add(() => this.reg(`velcro_${i}`, velcro(i)));
    add(() => this.reg('fold', paperFold()));
    add(() => this.reg('defib_charge', defibCharge()));
    add(() => this.reg('defib_zap', defibZap()));
    add(() => this.reg('squelch', squelch()));
    add(() => this.reg('static', staticLoop()));
    add(() => this.reg('dial_tone', dualTone(350, 440, 2, 0.4)));
    add(() => this.reg('ringback', ringback()));
    add(() => this.reg('fluoro', fluoro()));
    for (let i = 0; i < 3; i++) add(() => this.reg(`buzz_${i}`, buzz(i)));
    add(() => this.reg('elev_motor', elevMotor()));
    add(() => this.reg('elev_door', elevDoor()));
    add(() => this.reg('engine', engineLoop()));
    add(() => this.reg('wind', windLoop()));
    add(() => this.reg('breath_calm', breathLoop(3.6, 0.5)));
    add(() => this.reg('breath_run', breathLoop(1.3, 1)));
    add(() => this.reg('gasp', gasp()));
    add(() => this.reg('tinnitus', tinnitus()));
    add(() => this.reg('pressure', pressure()));
    add(() => this.reg('fire', fireCrackle()));
    add(() => this.reg('gulp', gulps()));
    add(() => this.reg('airshower', airShower()));
    add(() => this.reg('chute', chuteSlide()));
    add(() => this.reg('thud', thud(60, 0.35)));
    add(() => this.reg('thump_small', thud(110, 0.12)));
    add(() => this.reg('room_tone', roomTone()));
    add(() => this.reg('pipes', pipesLoop()));
    add(() => this.reg('heart_ear', earHeart()));
    add(() => this.reg('tv_static', tvStatic()));
    add(() => this.reg('crt_on', crtOn()));
    add(() => this.reg('switch', switchClick()));
    add(() => this.reg('zipper', zipper()));
    add(() => this.reg('plush_breath', plushBreath()));
    add(() => this.reg('swallow', thud(180, 0.1)));

    for (let i = 0; i < jobs.length; i++) {
      jobs[i]();
      if (i % 4 === 3) {
        onProgress?.(i / jobs.length);
        await new Promise((r) => setTimeout(r, 0));
      }
    }
    onProgress?.(1);
  }

  // ───────────────────────── 목소리 생성 ─────────────────────────

  /** 엄마의 허밍 — 자장가 8마디 (점4분음표 = 50, 8분음표 0.4초) */
  private motherHum() {
    const notes: SungNote[] = [];
    const e = 0.4;
    let t = 0;
    let syl = 0;
    LULLABY.forEach((bar, b) => {
      bar.forEach(([m, d], k) => {
        // 프레이즈 끝(2·4·6·8마디의 마지막 음)에서 숨을 쉰다
        const phraseEnd = k === bar.length - 1 && b % 2 === 1;
        notes.push({ midi: m, t, dur: d * e - (phraseEnd ? 0.22 : 0.015), vowel: 'm', vel: phraseEnd ? 0.8 : 0.95 });
        t += d * e;
        syl++;
      });
    });
    void syl;
    return sing(notes, { formantScale: 1.05, vibratoRate: 4.8, vibratoDepth: 0.22, glide: 0.09, breath: 0.07, closed: 0.85, seed: 1977, inhale: true, scoop: 40, tail: 1.2 });
  }

  /** 우나가 기억하는 자장가: 첫 줄만 가사, 나머지는 허밍 */
  private unaHum() {
    const notes: SungNote[] = [];
    const e = 0.42;
    let t = 0;
    let syl = 0;
    LULLABY.slice(0, 4).forEach((bar) => {
      bar.forEach(([m, d]) => {
        const first = syl < 8;
        notes.push({ midi: m, t, dur: d * e - 0.02, vowel: first ? LYRIC_VOWELS[syl] : 'm', cons: first ? (LYRIC_CONS[syl] as SungNote['cons']) : '', vel: first ? 0.85 : 0.6 });
        t += d * e;
        syl++;
      });
    });
    return sing(notes, { formantScale: 1.22, vibratoRate: 5.6, vibratoDepth: 0.08, glide: 0.06, breath: 0.03, closed: 0.0, seed: 101, scoop: 15, tail: 0.6 });
  }

  /** 2009년 11월 27일 02:14의 녹음. 아이의 목소리가 전화선과 잡음 너머로 */
  private call911() {
    const v = babble('도와주세요. 여기서 나가고 싶어요. 집에, 집에 가고 싶어요.', { f0: 285, rate: 0.92, formantScale: 1.22, seed: 2009, fall: 4 });
    return phoneLine(v);
  }

  // ───────────────────────── 재생 도우미 ─────────────────────────

  play(name: string, o: PlayOpts = {}) {
    return this.a.play(this.buf(name), o);
  }

  /** 발소리. 반환: 실제 소음 반경 계산은 게임 쪽에서 */
  step(mat: FloorMat, pos: Vec3Like | null, loud: number, bus: 'world' | 'heart' = 'world') {
    this.stepIdx = (this.stepIdx + 1 + Math.floor(this.r() * 3)) % 4;
    const b = this.buf(`step_${mat}_${this.stepIdx}`);
    if (pos) return this.a.play(b, { pos, gain: 0.55 * loud, rate: 0.94 + this.r() * 0.12, refDistance: 1.2 });
    return this.a.play(b, { bus, gain: 0.32 * loud, rate: 0.94 + this.r() * 0.12, send: 0.25 });
  }

  bare(pos: Vec3Like) {
    return this.a.play(this.buf(`bare_${Math.floor(this.r() * 4)}`), { pos, gain: 0.35, rate: 0.95 + this.r() * 0.1, refDistance: 1 });
  }

  /** 회진의 발소리: 약음한 마림바 저음 */
  roundsStep(pos: Vec3Like, gain = 1) {
    const m = [41, 43, 41, 40][Math.floor(this.r() * 4)];
    this.a.note('marimba', m, { pos, gain: 0.9 * gain, lowpass: 520, refDistance: 2.4 });
    this.a.play(this.buf('thump_small'), { pos, gain: 0.35 * gain, rate: 0.7, refDistance: 2 });
  }

  /** 볼펜 딸깍 (실제 우드블록 녹음을 높게) */
  penClick(pos?: Vec3Like, gain = 0.5) {
    const b = this.a.any('wood');
    const at = this.a.now;
    this.a.play(b, { pos, gain, rate: 2.6, at, bus: pos ? 'world' : 'ui' });
    this.a.play(b, { pos, gain: gain * 0.8, rate: 3.1, at: at + 0.07, bus: pos ? 'world' : 'ui' });
  }

  paper(pos?: Vec3Like, gain = 0.6) {
    return this.a.play(this.buf(`paper_${Math.floor(this.r() * 3)}`), { pos, gain, bus: pos ? 'world' : 'ui', rate: 0.9 + this.r() * 0.2 });
  }

  creak(pos: Vec3Like, gain = 0.6) {
    this.a.play(this.buf(`creak_${Math.floor(this.r() * 3)}`), { pos, gain, rate: 0.85 + this.r() * 0.3 });
  }

  doorShut(pos: Vec3Like, slam = false) {
    this.a.play(this.buf(slam ? 'door_slam' : 'door_shut'), { pos, gain: slam ? 1 : 0.7 });
    this.a.play(this.a.any('wood'), { pos, gain: 0.45, rate: 0.8, at: this.a.now + 0.03 });
  }

  /** 원내 방송 차임 — 언제나 같은 세 음 (E5 · C5 · G4) */
  chime(at = this.a.now) {
    const o = { bus: 'world' as const, gain: 0.5, send: 0.6, highpass: 220 };
    this.a.note('svibe', 76, { ...o, at });
    this.a.note('svibe', 72, { ...o, at: at + 0.62 });
    this.a.note('svibe', 67, { ...o, at: at + 1.24 });
  }

  /** 심전도 '삐' (크로탈레스) */
  beep(gain = 0.25) {
    this.a.note('crot', 93, { bus: 'ui', gain, lowpass: 5000 });
  }

  /** 유리 하모니카 (필요할 때 만들어 둔다) */
  harmonica(midi: number, dur: number, o: PlayOpts = {}): Voice | null {
    const key = `${midi}_${Math.round(dur * 4)}`;
    let b = this.harmCache.get(key);
    if (!b) {
      b = makeBuffer(this.a.ctx, glassHarmonica(midi, Math.round(dur * 4) / 4));
      this.harmCache.set(key, b);
    }
    return this.a.play(b, o);
  }

  private bowCache = new Map<string, AudioBuffer>();
  bowed(midi: number, dur: number, o: PlayOpts = {}): Voice | null {
    const key = `${midi}_${Math.round(dur * 4)}`;
    let b = this.bowCache.get(key);
    if (!b) {
      b = makeBuffer(this.a.ctx, bowedVibe(midi, Math.round(dur * 4) / 4));
      this.bowCache.set(key, b);
    }
    return this.a.play(b, o);
  }

  private babbleCache = new Map<string, AudioBuffer>();
  /** 녹음·TV·무전 속 목소리 (뜻은 자막으로) */
  speak(text: string, kind: 'toy' | 'pa' | 'radio' | 'phone' | 'tape', o: PlayOpts = {}) {
    const key = kind + text;
    let b = this.babbleCache.get(key);
    if (!b) {
      const params = {
        toy: { f0: 320, rate: 1, formantScale: 1.18 },
        pa: { f0: 205, rate: 0.95, formantScale: 1 },
        radio: { f0: 130, rate: 1.05, formantScale: 0.9 },
        phone: { f0: 285, rate: 0.92, formantScale: 1.22 },
        tape: { f0: 200, rate: 1, formantScale: 1 },
      }[kind];
      let d = babble(text, { ...params, seed: text.length * 7 + kind.length, fall: 3 });
      d = kind === 'toy' ? toyVoice(d) : kind === 'pa' ? paVoice(d) : kind === 'radio' ? radioVoice(d) : kind === 'phone' ? phoneLine(d) : tapeVoice(d);
      b = makeBuffer(this.a.ctx, d);
      this.babbleCache.set(key, b);
    }
    return this.a.play(b, o);
  }
}

// ───────────────────────── 장치 음색 ─────────────────────────

function toyVoice(d: Float32Array) {
  // 작은 스피커: 대역 제한 + 포화
  onePole(d, 380, true);
  onePole(d, 3200);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 2.4);
  return normalize(d, 0.75);
}

function paVoice(d: Float32Array) {
  onePole(d, 330, true);
  onePole(d, 2900);
  resonate(d, 1200, 400, 0.08);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 1.6);
  return normalize(d, 0.7);
}

function radioVoice(d: Float32Array) {
  onePole(d, 420, true);
  onePole(d, 2600);
  const r = rng(91);
  for (let i = 0; i < d.length; i++) d[i] = Math.tanh(d[i] * 3) * 0.8 + (r() * 2 - 1) * 0.06;
  const pre = squelch();
  const out = new Float32Array(d.length + pre.length * 2);
  out.set(pre, 0);
  out.set(d, pre.length);
  out.set(pre.map((x) => x * 0.7), pre.length + d.length);
  return normalize(out, 0.7);
}

function phoneLine(d: Float32Array) {
  onePole(d, 450, true);
  onePole(d, 2800);
  const r = rng(2014);
  const n = d.length + Math.floor(0.8 * SR);
  const out = new Float32Array(n);
  let hiss = 0;
  for (let i = 0; i < n; i++) {
    hiss = 0.7 * hiss + 0.3 * (r() * 2 - 1);
    // 테이프 와우 (아주 느린 음정 흔들림 대신 진폭 흔들림)
    const wob = 1 + 0.08 * Math.sin((2 * Math.PI * 0.6 * i) / SR);
    const v = i >= Math.floor(0.4 * SR) && i - Math.floor(0.4 * SR) < d.length ? d[i - Math.floor(0.4 * SR)] : 0;
    // 간헐적 끊김 잡음
    const crack = r() < 0.0004 ? (r() * 2 - 1) * 0.8 : 0;
    out[i] = Math.tanh(v * 2.2 * wob) * 0.7 + hiss * 0.08 + crack;
  }
  return normalize(out, 0.7);
}

function tapeVoice(d: Float32Array) {
  onePole(d, 250, true);
  onePole(d, 4000);
  const r = rng(77);
  for (let i = 0; i < d.length; i++) d[i] = d[i] * (1 + 0.05 * Math.sin((2 * Math.PI * 0.8 * i) / SR)) + (r() * 2 - 1) * 0.02;
  return normalize(d, 0.7);
}

// ───────────────────────── 합성 효과음 ─────────────────────────

function env(n: number, fn: (t: number) => number) {
  const d = new Float32Array(n);
  for (let i = 0; i < n; i++) d[i] = fn(i / SR);
  return d;
}

function footstep(mat: FloorMat, v: number): Float32Array {
  const r = rng(1000 + v * 17 + mat.length * 131);
  const n = Math.floor(0.35 * SR);
  const out = new Float32Array(n);
  const P = {
    lino: { thump: 95, td: 0.03, click: 0.35, cf: 2600, ring: 0, rf: 0, scuff: 0.15, squeak: v === 2 },
    tile: { thump: 120, td: 0.02, click: 0.7, cf: 5200, ring: 0.2, rf: 2400, scuff: 0.1, squeak: false },
    carpet: { thump: 80, td: 0.04, click: 0.05, cf: 900, ring: 0, rf: 0, scuff: 0.35, squeak: false },
    metal: { thump: 140, td: 0.03, click: 0.5, cf: 4200, ring: 0.5, rf: 780, scuff: 0.1, squeak: false },
    asphalt: { thump: 70, td: 0.03, click: 0.2, cf: 3000, ring: 0, rf: 0, scuff: 0.6, squeak: false },
    tissue: { thump: 55, td: 0.07, click: 0.0, cf: 600, ring: 0, rf: 0, scuff: 0.2, squeak: false },
    wood: { thump: 100, td: 0.05, click: 0.4, cf: 2200, ring: 0.15, rf: 320, scuff: 0.1, squeak: false },
  }[mat];
  // 뒤꿈치 '쿵' + 앞꿈치 (두 번의 접촉)
  for (const [t0, g] of [
    [0, 1],
    [0.045 + r() * 0.02, 0.55],
  ] as [number, number][]) {
    const s0 = Math.floor(t0 * SR);
    let y = 0;
    const a = Math.exp((-2 * Math.PI * P.cf) / SR);
    for (let i = 0; i < Math.floor(0.12 * SR) && s0 + i < n; i++) {
      const t = i / SR;
      const th = Math.sin(2 * Math.PI * P.thump * t * (1 - t * 3)) * Math.exp(-t / P.td);
      y = (1 - a) * (r() * 2 - 1) + a * y;
      const cl = y * Math.exp(-t / 0.006) * P.click;
      out[s0 + i] += (th * 0.9 + cl) * g;
    }
  }
  // 끌림
  if (P.scuff) {
    let y = 0;
    for (let i = 0; i < Math.floor(0.12 * SR); i++) {
      const t = i / SR;
      y = 0.8 * y + 0.2 * (r() * 2 - 1);
      const e = Math.sin(Math.PI * Math.min(1, t / 0.12)) * P.scuff;
      // 아스팔트: 알갱이
      const grit = mat === 'asphalt' && r() < 0.02 ? (r() * 2 - 1) * 1.5 : 0;
      out[Math.floor(0.02 * SR) + i] += (y + grit) * e * 0.4;
    }
  }
  if (P.ring) {
    const rf = P.rf * (0.95 + r() * 0.1);
    for (let i = 0; i < n; i++) {
      const t = i / SR;
      out[i] += (Math.sin(2 * Math.PI * rf * t) + 0.5 * Math.sin(2 * Math.PI * rf * 2.71 * t)) * Math.exp(-t / (mat === 'metal' ? 0.12 : 0.03)) * P.ring * 0.4;
    }
  }
  if (P.squeak) {
    const s0 = Math.floor(0.05 * SR);
    for (let i = 0; i < Math.floor(0.06 * SR); i++) {
      const t = i / SR;
      const f = 1700 + 900 * (t / 0.06);
      out[s0 + i] += Math.sin(2 * Math.PI * f * t) * Math.sin((Math.PI * t) / 0.06) * 0.15;
    }
  }
  return normalize(out, 0.85);
}

function barefoot(v: number) {
  const r = rng(300 + v);
  const n = Math.floor(0.12 * SR);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.6 * y + 0.4 * (r() * 2 - 1);
    out[i] = y * Math.exp(-t / 0.008) * 0.7 + Math.sin(2 * Math.PI * 140 * t) * Math.exp(-t / 0.015) * 0.5;
  }
  bandpass(out, 1100, 0.9);
  return normalize(out, 0.7);
}

/** 문 경첩의 삐걱임: 마찰의 스틱-슬립 펄스열이 나무 몸통을 울린다 */
function creak(seconds: number, seed: number, long = false) {
  const r = rng(seed * 7 + 3);
  const n = Math.floor(seconds * SR);
  const exc = new Float32Array(n);
  let ph = 0;
  let rate = 18 + r() * 10;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const p = t / seconds;
    // 마찰 속도의 변화 → 펄스 간격의 변화
    const target = long ? 12 + 50 * Math.sin(Math.PI * p) + 18 * Math.sin(p * 17) : 15 + 70 * Math.sin(Math.PI * p) * (0.6 + 0.4 * Math.sin(p * 9 + seed));
    rate += (target - rate) * 0.0008;
    ph += rate / SR;
    if (ph >= 1) {
      ph -= 1;
      exc[i] = 1 + r() * 0.4;
    }
  }
  const out = new Float32Array(n);
  for (const [f, bw, g] of [
    [310, 25, 1],
    [760, 40, 0.7],
    [1580, 70, 0.4],
    [2900, 120, 0.15],
  ] as [number, number, number][]) {
    const tmp = exc.slice();
    bandpass(tmp, f * (0.9 + r() * 0.2), f / bw);
    for (let i = 0; i < n; i++) out[i] += tmp[i] * g;
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    out[i] *= Math.min(1, t / 0.05) * Math.min(1, (seconds - t) / 0.15);
  }
  return normalize(out, 0.75);
}

function doorShut(slam: number) {
  const r = rng(55 + slam);
  const n = Math.floor(0.9 * SR);
  const out = env(n, (t) => {
    const low = Math.sin(2 * Math.PI * (slam ? 55 : 75) * t * (1 - t)) * Math.exp(-t / (slam ? 0.16 : 0.09));
    const mid = Math.sin(2 * Math.PI * 190 * t) * Math.exp(-t / 0.05) * 0.5;
    return low + mid;
  });
  let y = 0;
  for (let i = 0; i < Math.floor(0.03 * SR); i++) {
    y = 0.4 * y + 0.6 * (r() * 2 - 1);
    out[i] += y * Math.exp(-i / (0.004 * SR)) * (slam ? 0.9 : 0.5);
  }
  // 문틀 덜컹임
  for (let k = 0; k < (slam ? 4 : 2); k++) {
    const s0 = Math.floor((0.05 + k * 0.045 + r() * 0.02) * SR);
    for (let i = 0; i < Math.floor(0.03 * SR) && s0 + i < n; i++) out[s0 + i] += (r() * 2 - 1) * Math.exp(-i / (0.004 * SR)) * 0.25 / (k + 1);
  }
  return normalize(out, slam ? 0.95 : 0.8);
}

function paper(v: number) {
  const r = rng(700 + v);
  const n = Math.floor(0.28 * SR);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.3 * y + 0.7 * (r() * 2 - 1);
    const flutter = 0.5 + 0.5 * Math.sin(2 * Math.PI * (30 + v * 7) * t + r() * 0.3);
    out[i] = y * Math.sin(Math.PI * (t / 0.28)) * flutter;
  }
  bandpass(out, 3200, 0.8);
  return normalize(out, 0.6);
}

function paperFold() {
  const r = rng(808);
  const n = Math.floor(2.4 * SR);
  const out = new Float32Array(n);
  for (let k = 0; k < 14; k++) {
    const s0 = Math.floor((0.05 + k * 0.16 + r() * 0.05) * SR);
    let y = 0;
    for (let i = 0; i < Math.floor(0.09 * SR) && s0 + i < n; i++) {
      y = 0.2 * y + 0.8 * (r() * 2 - 1);
      out[s0 + i] += y * Math.exp(-i / (0.012 * SR)) * (0.5 + r() * 0.5);
    }
  }
  bandpass(out, 2600, 0.7);
  return normalize(out, 0.7);
}

function velcro(v: number) {
  const r = rng(900 + v);
  const dur = 0.35 + v * 0.08;
  const n = Math.floor(dur * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const dens = 0.12 * Math.sin((Math.PI * t) / dur);
    if (r() < dens) out[i] = (r() * 2 - 1) * (0.6 + r() * 0.4);
  }
  bandpass(out, 2300, 0.6);
  return normalize(out, 0.7);
}

function defibCharge() {
  const dur = 2.2;
  const n = Math.floor(dur * SR);
  let ph = 0;
  return normalize(
    env(n, (t) => {
      const f = 900 + 2400 * Math.pow(t / dur, 0.7);
      ph += (2 * Math.PI * f) / SR;
      const buzz = Math.sign(Math.sin(2 * Math.PI * 120 * t)) * 0.05;
      return (Math.sin(ph) * 0.6 + Math.sin(ph * 2) * 0.15 + buzz) * Math.min(1, t / 0.1);
    }),
    0.45,
  );
}

function defibZap() {
  const r = rng(1234);
  const n = Math.floor(1.2 * SR);
  const out = env(n, (t) => Math.sin(2 * Math.PI * 48 * t * (1 - t * 0.5)) * Math.exp(-t / 0.18) * 1.2);
  let y = 0;
  for (let i = 0; i < Math.floor(0.25 * SR); i++) {
    y = 0.2 * y + 0.8 * (r() * 2 - 1);
    const crackle = r() < 0.3 ? 1 : 0.2;
    out[i] += y * Math.exp(-i / (0.05 * SR)) * crackle * 0.9;
  }
  return normalize(out, 0.95);
}

function squelch() {
  const r = rng(66);
  const n = Math.floor(0.16 * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = (r() * 2 - 1) * Math.min(1, (n - i) / (0.02 * SR));
  bandpass(out, 1500, 0.5);
  out[0] = 0.9;
  return normalize(out, 0.5);
}

function staticLoop() {
  const d = noiseLoop(3, 0, 71);
  bandpass(d, 1800, 0.4);
  const r = rng(72);
  for (let i = 0; i < d.length; i++) if (r() < 0.0008) d[i] += (r() * 2 - 1) * 2;
  return normalize(d, 0.5);
}

/** 미국 전화 신호음 (정밀 톤 플랜): 발신음 350+440Hz, 1초 안에 정수 주기 → 이음매 없음 */
function dualTone(f1: number, f2: number, seconds: number, gain: number) {
  const n = Math.floor(seconds * SR);
  return env(n, (t) => (Math.sin(2 * Math.PI * f1 * t) + Math.sin(2 * Math.PI * f2 * t)) * 0.5 * gain);
}

/** 링백: 440+480Hz, 2초 울리고 4초 쉰다 */
function ringback() {
  const n = Math.floor(6 * SR);
  return env(n, (t) => (t < 2 ? (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.2 * Math.min(1, t / 0.01, (2 - t) / 0.01) : 0));
}

/** 형광등: 전원 60Hz → 120Hz 웅웅거림과 배음, 안정기의 미세한 지글거림 */
function fluoro() {
  const n = Math.floor(2 * SR);
  const r = rng(60);
  const d = env(n, (t) => {
    const w = 2 * Math.PI * 60 * t;
    return Math.sin(2 * w) * 0.5 + Math.sin(4 * w) * 0.22 + Math.sin(6 * w) * 0.12 + Math.sin(1 * w) * 0.08 + Math.sin(14 * w) * 0.03 + (r() * 2 - 1) * 0.012;
  });
  return normalize(d, 0.4);
}

function buzz(v: number) {
  const r = rng(500 + v);
  const n = Math.floor((0.25 + v * 0.15) * SR);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const on = Math.sin(2 * Math.PI * 9 * t + v) > -0.2 ? 1 : 0;
    out[i] = on * (Math.sign(Math.sin(2 * Math.PI * 120 * t)) * 0.3 + (r() * 2 - 1) * 0.4) * (r() < 0.02 ? 2 : 1);
  }
  onePole(out, 4500);
  return normalize(out, 0.5);
}

function elevMotor() {
  const n = Math.floor(3 * SR);
  const r = rng(808);
  const d = env(n, (t) => {
    const w = 2 * Math.PI * t;
    return Math.sin(w * 50) * 0.35 + Math.sin(w * 100) * 0.2 + Math.sin(w * 600) * 0.03 + Math.sin(w * 150) * 0.08 + (r() * 2 - 1) * 0.04;
  });
  onePole(d, 1800);
  return normalize(crossfadeLoop(d, Math.floor(0.3 * SR)), 0.5);
}

function elevDoor() {
  const r = rng(909);
  const n = Math.floor(1.6 * SR);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.97 * y + 0.03 * (r() * 2 - 1);
    out[i] = y * 5 * Math.sin(Math.PI * Math.min(1, t / 1.3)) + (t > 1.3 ? Math.sin(2 * Math.PI * 90 * t) * Math.exp(-(t - 1.3) / 0.05) : 0);
  }
  return normalize(out, 0.7);
}

function engineLoop() {
  const n = Math.floor(4 * SR);
  const r = rng(321);
  let road = 0;
  const d = env(n, (t) => {
    const w = 2 * Math.PI * t;
    road = 0.995 * road + 0.005 * (r() * 2 - 1);
    // 4기통 2,000rpm 근처: 점화 약 33Hz
    return Math.sin(w * 33) * 0.3 + Math.sin(w * 66) * 0.18 + Math.sin(w * 99) * 0.06 + road * 9 + (r() * 2 - 1) * 0.015;
  });
  onePole(d, 900);
  return normalize(crossfadeLoop(d, Math.floor(0.4 * SR)), 0.6);
}

function windLoop() {
  const n = Math.floor(8 * SR);
  const r = rng(1111);
  const out = new Float32Array(n);
  let y = 0;
  let lf = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    lf = 0.5 + 0.3 * Math.sin(2 * Math.PI * 0.11 * t) + 0.2 * Math.sin(2 * Math.PI * 0.27 * t + 1);
    const a = Math.exp((-2 * Math.PI * (300 + 500 * lf)) / SR);
    y = (1 - a) * (r() * 2 - 1) + a * y;
    out[i] = y * lf;
  }
  return normalize(crossfadeLoop(out, Math.floor(0.6 * SR)), 0.6);
}

function breathLoop(cycle: number, intensity: number) {
  const n = Math.floor(cycle * 2 * SR);
  const r = rng(Math.floor(cycle * 100));
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = (i / SR) % cycle;
    const p = t / cycle;
    // 들숨 40%, 날숨 45%, 쉼 15%
    let e = 0;
    let f = 900;
    if (p < 0.4) {
      e = Math.sin((Math.PI * p) / 0.4) * 0.6;
      f = 1400;
    } else if (p < 0.85) {
      e = Math.sin((Math.PI * (p - 0.4)) / 0.45);
      f = 800;
    }
    const a = Math.exp((-2 * Math.PI * f) / SR);
    y = (1 - a) * (r() * 2 - 1) + a * y;
    out[i] = y * e * (0.5 + intensity * 0.5);
  }
  onePole(out, 180, true);
  return normalize(out, 0.5);
}

function gasp() {
  const r = rng(4);
  const n = Math.floor(0.6 * SR);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.7 * y + 0.3 * (r() * 2 - 1);
    out[i] = y * Math.exp(-t / 0.18) * Math.min(1, t / 0.02);
  }
  bandpass(out, 1300, 0.7);
  return normalize(out, 0.6);
}

/** 이명: 청력 안전을 위해 4kHz 아래 (S10.4) */
function tinnitus() {
  const n = Math.floor(4 * SR);
  return env(n, (t) => Math.sin(2 * Math.PI * 3150 * t) * 0.08 * Math.min(1, t / 0.4, (4 - t) / 1.2));
}

/** 공간이 바뀔 때의 기압 변화 */
function pressure() {
  const n = Math.floor(1.8 * SR);
  const r = rng(77);
  let y = 0;
  return normalize(
    env(n, (t) => {
      y = 0.995 * y + 0.005 * (r() * 2 - 1);
      return (Math.sin(2 * Math.PI * 28 * t) * 0.6 + y * 10) * Math.sin(Math.PI * Math.min(1, t / 1.8));
    }),
    0.8,
  );
}

function fireCrackle() {
  const n = Math.floor(3 * SR);
  const r = rng(1994);
  const out = new Float32Array(n);
  let roar = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    roar = 0.995 * roar + 0.005 * (r() * 2 - 1);
    out[i] = roar * 6 * Math.min(1, t / 0.3, (3 - t) / 0.6);
    if (r() < 0.004) {
      const len = Math.floor((0.002 + r() * 0.01) * SR);
      const g = r();
      for (let k = 0; k < len && i + k < n; k++) out[i + k] += (r() * 2 - 1) * g * Math.exp(-k / (len * 0.3));
    }
  }
  return normalize(out, 0.7);
}

function gulps() {
  const n = Math.floor(1.6 * SR);
  const out = new Float32Array(n);
  for (let k = 0; k < 3; k++) {
    const s0 = Math.floor((0.1 + k * 0.45) * SR);
    for (let i = 0; i < Math.floor(0.12 * SR); i++) {
      const t = i / SR;
      const f = 220 - 600 * t;
      out[s0 + i] += Math.sin(2 * Math.PI * f * t) * Math.exp(-t / 0.03);
    }
  }
  return normalize(out, 0.5);
}

function airShower() {
  const n = Math.floor(3.5 * SR);
  const r = rng(9);
  let y = 0;
  return normalize(
    env(n, (t) => {
      y = 0.6 * y + 0.4 * (r() * 2 - 1);
      return y * Math.min(1, t / 0.15, (3.5 - t) / 0.4);
    }),
    0.5,
  );
}

function chuteSlide() {
  const n = Math.floor(1.6 * SR);
  const r = rng(13);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.9 * y + 0.1 * (r() * 2 - 1);
    out[i] = y * 4 * Math.min(1, t / 0.05) * Math.exp(-t / 0.9);
  }
  resonate(out, 420, 30, 0.2);
  resonate(out, 1150, 50, 0.1);
  return normalize(out, 0.8);
}

function thud(f: number, len: number) {
  const n = Math.floor(len * SR);
  return normalize(
    env(n, (t) => Math.sin(2 * Math.PI * f * t * (1 - t)) * Math.exp(-t / (len * 0.3))),
    0.8,
  );
}

function roomTone() {
  const d = noiseLoop(6, 2, 333);
  onePole(d, 200);
  return normalize(d, 0.4);
}

function pipesLoop() {
  const n = Math.floor(10 * SR);
  const r = rng(444);
  const out = new Float32Array(n);
  let y = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    y = 0.999 * y + 0.001 * (r() * 2 - 1);
    const gurgle = Math.sin(2 * Math.PI * (40 + 8 * Math.sin(t * 0.7)) * t) * (0.5 + 0.5 * Math.sin(t * 0.9)) * 0.3;
    out[i] = y * 30 + gurgle;
  }
  onePole(out, 400);
  return normalize(crossfadeLoop(out, Math.floor(0.8 * SR)), 0.5);
}

/** 내 귀에 들리는 내 심장 (아주 낮고 둔한 두 번의 '쿵') */
function earHeart() {
  const n = Math.floor(0.6 * SR);
  return normalize(
    env(n, (t) => {
      const a = Math.sin(2 * Math.PI * 48 * t) * Math.exp(-t / 0.05);
      const t2 = t - 0.24;
      const b = t2 > 0 ? Math.sin(2 * Math.PI * 58 * t2) * Math.exp(-t2 / 0.04) * 0.6 : 0;
      return (a + b) * Math.min(1, t / 0.004);
    }),
    0.9,
  );
}

function tvStatic() {
  const d = noiseLoop(2, 0, 4040);
  onePole(d, 7000);
  return normalize(d, 0.4);
}

function crtOn() {
  const n = Math.floor(0.7 * SR);
  const r = rng(15);
  return normalize(
    env(n, (t) => (t < 0.02 ? (r() * 2 - 1) : 0) + Math.sin(2 * Math.PI * 60 * t) * Math.exp(-t / 0.15) * 0.6 + (r() * 2 - 1) * 0.2 * Math.exp(-t / 0.3)),
    0.6,
  );
}

function switchClick() {
  const r = rng(16);
  const n = Math.floor(0.06 * SR);
  return normalize(
    env(n, (t) => (r() * 2 - 1) * Math.exp(-t / 0.004) + Math.sin(2 * Math.PI * 1800 * t) * Math.exp(-t / 0.006) * 0.4),
    0.6,
  );
}

function zipper() {
  const r = rng(17);
  const n = Math.floor(0.9 * SR);
  const out = new Float32Array(n);
  let ph = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    ph += (60 + 140 * Math.sin((Math.PI * t) / 0.9)) / SR;
    if (ph >= 1) {
      ph -= 1;
      for (let k = 0; k < 60 && i + k < n; k++) out[i + k] += (r() * 2 - 1) * Math.exp(-k / 12);
    }
  }
  bandpass(out, 3000, 0.8);
  return normalize(out, 0.6);
}

function plushBreath() {
  const n = Math.floor(3 * SR);
  const r = rng(18);
  let y = 0;
  return normalize(
    env(n, (t) => {
      y = 0.98 * y + 0.02 * (r() * 2 - 1);
      return y * 8 * Math.pow(Math.sin(Math.PI * (t / 3)), 2);
    }),
    0.5,
  );
}
