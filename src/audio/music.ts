import type { AudioSys, PlayOpts, Voice } from './audio';
import type { Sfx } from './sfx';
import { LULLABY_BARS } from './sfx';
import type { Heart } from '../core/heart';
import { makeBuffer, sing, type SungNote } from './synth';
import { clamp, rng } from '../core/util';

/**
 * 음악.
 * 1) 메인 테마 「Whatever You Become」 — 자장가 하나가 회사의 네 계단을 따라 '시술'받는 주제와 변주 (07_AUDIO S4)
 * 2) 게임 속 적응형 음악 — 모든 레이어가 건물의 심장 박동 위에 있다 (S7)
 * 3) 챕터 1 크레딧 송 「부품은 바꿔도 (Swap a Part)」 (S5)
 *
 * 미리 녹음한 음원이 아니라, 실제 악기 녹음(CC0)과 합성 악기를 시퀀서가 실시간으로 연주한다.
 */

interface Ev {
  t: number;
  fn: (at: number) => void;
}

const BAR = 2.4; // 6/8, 8분음표 0.4초 (점4분음표 = 50)
const E8 = 0.4;
const THEME_LEN = 44 * BAR;

const THEME_CHORDS = [[48], [45], [48], [43], [45], [48], [43], [48]];
const LUSH = [
  [48, 52, 59, 62],
  [45, 52, 55, 59],
  [53, 57, 60, 64],
  [43, 50, 52, 59],
  [45, 55, 60, 62],
  [52, 55, 59, 60],
  [50, 53, 60, 64],
  [48, 52, 55, 59],
];
const FIFTHS = [
  [48, 55],
  [45, 52],
  [48, 55],
  [43, 50],
  [45, 52],
  [48, 55],
  [43, 50],
  [43, 50],
];

/** 크레딧 송 (2/4, 8분음표 단위). [음, 길이] — 0은 쉼 */
const SWAP_SONG: { line: string; kids?: boolean; notes: [number, number][]; chords: string[] }[] = [
  { line: '귀가 하나 떨어져도 괜찮아', notes: [[67, 1], [64, 1], [67, 1], [64, 1], [72, 1], [71, 1], [69, 1], [67, 1], [69, 1], [67, 1], [64, 6]], chords: ['C', 'C', 'F', 'C'] },
  { line: '새 귀를 붙이면 되니까', notes: [[65, 1], [65, 1], [69, 2], [67, 1], [65, 1], [64, 2], [62, 1], [64, 1], [67, 6]], chords: ['F', 'F', 'C', 'G'] },
  { line: '팔이 바뀌고 다리가 바뀌어도', notes: [[67, 1], [64, 1], [67, 1], [64, 1], [72, 2], [71, 1], [69, 1], [71, 1], [72, 1], [74, 1], [76, 5]], chords: ['C', 'C', 'F', 'C'] },
  { line: '호피는 호피야, 마음은 그대로', notes: [[74, 1], [72, 1], [69, 2], [74, 1], [72, 1], [69, 2], [67, 1], [69, 1], [67, 1], [64, 1], [62, 1], [60, 3]], chords: ['G', 'F', 'C', 'C'] },
  { line: '(아이들) 그대로! 그대로!', kids: true, notes: [[64, 1], [67, 1], [72, 4], [64, 1], [67, 1], [72, 4], [0, 4]], chords: ['C', 'C', 'C', 'G'] },
  { line: '부품은 바꿔도, 마음은 그대로', kids: true, notes: [[72, 1], [72, 1], [71, 1], [69, 1], [67, 1], [69, 2], [65, 1], [67, 1], [69, 1], [67, 1], [62, 1], [60, 4]], chords: ['F', 'G', 'G', 'C'] },
  { line: '…그런데 호피야,', notes: [[64, 2], [62, 1], [60, 1], [64, 2], [62, 2], [60, 8]], chords: ['Am', 'Am', 'F', 'F'] },
  { line: '원래 귀는 어디 갔니?', notes: [[60, 2], [62, 2], [64, 2], [65, 2], [67, 2], [71, 6]], chords: ['', '', '', ''] },
];
const UKE: Record<string, number[]> = {
  C: [60, 64, 67, 72],
  F: [60, 65, 69, 72],
  G: [59, 62, 67, 71],
  Am: [57, 60, 64, 69],
  Dm: [57, 62, 65, 69],
};
const KID_VOWELS: Record<string, string[]> = {
  '(아이들) 그대로! 그대로!': ['eu', 'ae', 'o', 'eu', 'ae', 'o'],
  '부품은 바꿔도, 마음은 그대로': ['u', 'u', 'eu', 'a', 'o', 'o', 'a', 'eu', 'eu', 'eu', 'ae', 'o'],
};

export class Music {
  private events: Ev[] = [];
  private cursor = 0;
  private pieceStart = 0;
  private loopLen = 0;
  mode: 'off' | 'title' | 'credits' = 'off';
  private active: Voice[] = [];
  private r = rng(1987);
  /** 게임 속 레이어 */
  tension = 0;
  chase = 0;
  zone = 0.5;
  heartLevel = 1;
  heartMuffle = 0;
  /** 메뉴 음악 대기 중 박동 */
  private tensionVoices: Voice[] = [];
  private nextFragment = 0;
  private kidsBuffers = new Map<string, AudioBuffer>();
  onLyric: ((line: string, idx: number) => void) | null = null;
  onCreditsEnd: (() => void) | null = null;

  constructor(
    private readonly a: AudioSys,
    private readonly sfx: Sfx,
    heart: Heart,
  ) {
    heart.on('schedule', (e) => this.onBeat(e.t, e.dubT, e.index, e.bpm));
  }

  // ─────────────────────────── 공통 ───────────────────────────

  private n(group: string, midi: number, o: PlayOpts) {
    const v = this.a.note(group, midi, { bus: 'music', ...o });
    if (v) this.active.push(v);
    return v;
  }

  private s(name: string, o: PlayOpts) {
    const v = this.a.play(this.a.buffers.get(name), { bus: 'music', ...o });
    if (v) this.active.push(v);
    return v;
  }

  private load(events: Ev[], loopLen: number, startAt: number) {
    this.events = events.sort((x, y) => x.t - y.t);
    this.cursor = 0;
    this.pieceStart = startAt;
    this.loopLen = loopLen;
  }

  stop(fade = 1.5) {
    this.mode = 'off';
    this.events = [];
    for (const v of this.active) v.stop(fade);
    this.active = [];
  }

  update() {
    if (!this.a.running) return;
    const now = this.a.now;
    this.active = this.active.filter((v) => !v.ended);
    if (this.events.length) {
      const horizon = now + 0.35;
      for (;;) {
        if (this.cursor >= this.events.length) {
          if (this.loopLen > 0) {
            this.cursor = 0;
            this.pieceStart += this.loopLen;
          } else {
            this.events = [];
            break;
          }
        }
        const ev = this.events[this.cursor];
        const at = this.pieceStart + ev.t;
        if (at > horizon) break;
        if (at >= now - 0.05) ev.fn(Math.max(at, now));
        this.cursor++;
      }
    }
    this.updateTension();
  }

  // ─────────────────────────── 메인 테마 ───────────────────────────

  startTitle() {
    this.stop(0.5);
    this.mode = 'title';
    const ev: Ev[] = [];
    const at = (bar: number, eighth = 0) => (bar - 1) * BAR + eighth * E8;
    const push = (t: number, fn: (at: number) => void) => ev.push({ t, fn });

    // 사람의 심장: 펠트 큰북 + 팀파니(F2)
    const heartbeat = (bar: number, bars: number, perBar = 2, vel = 1, eighthAt?: (b: number) => number) => {
      for (let b = 0; b < bars; b++) {
        for (let k = 0; k < perBar; k++) {
          const e = eighthAt ? eighthAt(b) : k * (6 / perBar);
          const t = at(bar + b, e);
          push(t, (x) => {
            this.s('heart_02', { at: x, gain: 0.55 * vel, lowpass: 900, hall: 0.25 });
            this.n('timp', 41, { at: x, gain: 0.35 * vel, lowpass: 600, hall: 0.2 });
          });
          push(t + E8 * 0.55, (x) => {
            this.s('heart_05', { at: x, gain: 0.32 * vel, lowpass: 700, hall: 0.2 });
          });
        }
      }
    };

    const melody = (bar: number, fn: (midi: number, t: number, dur: number, idx: number) => void) => {
      let idx = 0;
      LULLABY_BARS.forEach((notes, b) => {
        let e = 0;
        for (const [m, d] of notes) {
          fn(m, at(bar + b, e), d * E8, idx++);
          e += d;
        }
      });
    };

    // 도입 (1~2)
    heartbeat(1, 2);

    // 주제 「치료」 (3~10): 엄마의 허밍 + 오르골(한 옥타브 위) + 첼로 근음 + 심장
    push(at(3) - 0.75, (x) => this.s('hum_theme', { at: x, gain: 0.95, hall: 0.35 }));
    melody(3, (m, t, d) => push(t, (x) => this.n('mbox', m + 12, { at: x, gain: 0.22, hall: 0.45, duration: Math.max(d * 2.5, 1.2) })));
    THEME_CHORDS.forEach(([r], b) => push(at(3 + b), (x) => this.cello(r, x, BAR, 0.28)));
    heartbeat(3, 8, 2, 0.85);

    // 변주 1 「개선」 (11~18): 엄마 목소리가 사라진다. 첼레스타·현악·하프. Cmaj7로 끝
    melody(11, (m, t) => push(t, (x) => this.n('celesta', m + 12, { at: x, gain: 0.42, hall: 0.55 })));
    LUSH.forEach((ch, b) => {
      push(at(11 + b), (x) => ch.forEach((m) => this.strings(m, x, BAR, 0.16)));
      ch.forEach((m, i) => push(at(11 + b, i * 1.5), (x) => this.n('harp', m + 12, { at: x, gain: 0.3, hall: 0.5 })));
    });
    heartbeat(11, 8, 2, 0.6);

    // 변주 2 「설계」 (19~26): 세 음마다 하나씩 빠진다. 21마디 뒤로 심장이 멈춘다. G로 끝
    melody(19, (m, t, d, i) => {
      if ((i + 1) % 3 === 0) return;
      push(t, (x) => {
        const v = this.sfx.bowed(m + 12, Math.max(0.6, d * 1.6), { bus: 'music', at: x, gain: 0.32, hall: 0.6 });
        if (v) this.active.push(v);
      });
    });
    FIFTHS.forEach((ch, b) => push(at(19 + b), (x) => ch.forEach((m) => this.strings(m, x, BAR, 0.13, true))));
    heartbeat(19, 3, 2, 0.55);

    // 변주 3 「인간 이후」 (27~34): 음마다 다른 악기·다른 위치. 마디 안의 순서는 거꾸로
    const rota: [string, number, number][] = [
      ['piano', 0, -0.75],
      ['harp', 0, 0.75],
      ['glock', 12, -1],
      ['tbell', 12, 1],
    ];
    let ri = 0;
    LULLABY_BARS.forEach((notes, b) => {
      const pos: number[] = [];
      let e = 0;
      for (const [, d] of notes) {
        pos.push(e);
        e += d;
      }
      const rev = [...notes].reverse();
      rev.forEach(([m], k) => {
        const [inst, oct, pan] = rota[ri++ % rota.length];
        push(at(27 + b, pos[k]), (x) => this.n(inst, m + oct, { at: x, gain: inst === 'tbell' ? 0.2 : inst === 'glock' ? 0.22 : 0.36, pan, hall: 0.6 }));
      });
    });
    heartbeat(27, 8, 1, 0.5, (b) => (b * 5) % 6);

    // 변주 4 「실험 90」 (35~42): 선율이 없다. 지나간 자리의 잔향만 남는다
    push(at(35) - 0.75 + E8, (x) => this.s('hum_theme', { at: x, gain: 1.0, dry: 0, hall: 1.6 }));
    melody(35, (m, t) => push(t + E8, (x) => this.n('mbox', m + 12, { at: x, gain: 0.3, dry: 0, hall: 1.4 })));
    for (let b = 35; b <= 44; b++) {
      push(at(b), (x) => this.s(b % 2 ? 'bigdrum_00' : 'bigdrum_01', { at: x, gain: 0.7, lowpass: 500, hall: 0.4 }));
      push(at(b, 1), (x) => this.s('bigdrum_00', { at: x, gain: 0.32, lowpass: 400, hall: 0.3 }));
    }
    for (let b = 35; b <= 43; b += 2) push(at(b), (x) => this.breath(x, 2 * BAR));

    this.load(ev, THEME_LEN, this.a.now + 0.3);
  }

  private cello(midi: number, at: number, dur: number, gain: number) {
    const v = this.n('cello', midi, { at, gain, hall: 0.4, fadeIn: 0.25 });
    v?.stop(0.6, at + dur);
  }

  private strings(midi: number, at: number, dur: number, gain: number, flat = false) {
    const group = midi < 57 ? 'cello' : 'violin';
    const v = this.n(group, midi, { at, gain: flat ? gain * 1.1 : gain, hall: 0.6, fadeIn: 0.45, lowpass: flat ? 2400 : 6000 });
    v?.stop(0.9, at + dur);
  }

  /** 콘트라베이스의 숨: 2마디 동안 부풀었다 꺼진다 */
  private breath(at: number, dur: number) {
    const v = this.n('cbass', 36, { at, gain: 0.0001, lowpass: 380, hall: 0.6 });
    if (v) {
      v.out.gain.setValueAtTime(0.0001, at);
      v.out.gain.linearRampToValueAtTime(0.5, at + dur * 0.5);
      v.out.gain.linearRampToValueAtTime(0.0001, at + dur);
      v.src.stop(at + dur + 0.1);
    }
    const b = this.s('breath_calm', { at, gain: 0.0001, rate: 0.45, lowpass: 500, hall: 0.5 });
    if (b) {
      b.out.gain.setValueAtTime(0.0001, at);
      b.out.gain.linearRampToValueAtTime(0.35, at + dur * 0.5);
      b.out.gain.linearRampToValueAtTime(0.0001, at + dur);
      b.src.stop(at + dur + 0.1);
    }
  }

  // ─────────────────────────── 게임 속 ───────────────────────────

  /** 건물의 심장 (L0). 박동 예약 이벤트에서 호출된다 */
  private onBeat(t: number, dubT: number, index: number, bpm: number) {
    if (!this.a.running) return;
    const lvl = this.heartLevel;
    if (lvl > 0.01) {
      const lp = 260 + 700 * (1 - this.heartMuffle);
      const g = 0.75 * lvl;
      this.a.play(this.a.any('heart'), { bus: 'heart', at: t, gain: g, lowpass: lp, send: 0.5, rate: 0.82 });
      this.a.note('timp', 34, { bus: 'heart', at: t, gain: 0.35 * lvl, lowpass: lp * 0.7, send: 0.4 });
      this.a.play(this.a.buffers.get('heart_ear'), { bus: 'heart', at: t, gain: 0.5 * lvl, rate: 0.7, send: 0.3 });
      this.a.play(this.a.any('heart'), { bus: 'heart', at: dubT, gain: g * 0.55, lowpass: lp * 0.9, send: 0.45, rate: 0.95 });
    }
    // L4 추격: 박동마다 팀파니와 저음 현
    if (this.chase > 0.05) {
      const c = this.chase;
      this.a.note('timp', index % 2 ? 41 : 46, { bus: 'music', at: t, gain: 0.5 * c, hall: 0.3 });
      const half = (60 / bpm) / 2;
      this.a.note('cbass', index % 4 < 2 ? 36 : 35, { bus: 'music', at: t, gain: 0.35 * c, lowpass: 900, duration: half * 0.9 });
      this.a.note('cello', index % 4 < 2 ? 48 : 47, { bus: 'music', at: t + half, gain: 0.22 * c, lowpass: 1500, duration: half * 0.8 });
      if (index % 2 === 0) this.a.note('xylo', [67, 64, 67, 64, 72][index % 5], { bus: 'music', at: t + half * 0.5, gain: 0.25 * c, detune: (this.r() - 0.5) * 80 });
    }
    // L2 구역 선율: 가끔 자장가의 조각이 멀리서 (박동에 맞춰)
    if (this.zone > 0.05 && this.chase < 0.2 && t > this.nextFragment) {
      this.nextFragment = t + 28 + this.r() * 30;
      this.fragment(t + (60 / bpm), 60 / bpm);
    }
  }

  /** 자장가 두 마디 조각. 8분음표 = 박동 간격의 1/3 */
  private fragment(at: number, beat: number) {
    const start = Math.floor(this.r() * 4) * 2;
    const inst = this.r() < 0.6 ? 'mbox' : 'celesta';
    const e8 = beat / 3;
    let t = at;
    for (let b = start; b < start + 2; b++) {
      for (const [m, d] of LULLABY_BARS[b]) {
        // 가끔 한 음이 빠진다
        if (this.r() > 0.12) this.a.note(inst, m + 12, { bus: 'music', at: t, gain: 0.12 * this.zone, hall: 0.9, dry: 0.5, detune: (this.r() - 0.5) * 18 });
        t += d * e8;
      }
    }
  }

  /** L3 긴장 레이어: 바이올린 트레몰로와 유리 하모니카가 서서히 */
  private updateTension() {
    const want = clamp(this.tension, 0, 1);
    if (want > 0.1 && this.tensionVoices.length === 0 && this.a.running) {
      const at = this.a.now;
      const set = [this.r() < 0.5 ? 81 : 80, 87, 88];
      for (const m of set) {
        const v = this.a.note('vtrem', m, { bus: 'music', at, gain: 0.0001, lowpass: 5000, hall: 0.5, loop: true, loopStart: 0.8, loopEnd: 3.8 });
        if (v) this.tensionVoices.push(v);
      }
      const g = this.sfx.harmonica(this.r() < 0.5 ? 75 : 74, 8, { bus: 'music', at, gain: 0.0001, hall: 0.8 });
      if (g) this.tensionVoices.push(g);
    }
    for (const v of this.tensionVoices) v.setGain(want * 0.12, 0.8);
    if (want < 0.02 && this.tensionVoices.length) {
      for (const v of this.tensionVoices) v.stop(1.2);
      this.tensionVoices = [];
    }
    this.tensionVoices = this.tensionVoices.filter((v) => !v.ended);
  }

  /** L5 스팅어 */
  stinger(kind: 'discover' | 'reveal' | 'scare' | 'wrong' | 'soft' | 'memory' | 'dread') {
    const at = this.a.now;
    switch (kind) {
      case 'discover':
        this.a.play(this.a.any('bowcym'), { bus: 'music', at, gain: 0.5, hall: 0.4 });
        this.a.note('vtrem', 87, { bus: 'music', at, gain: 0.25, duration: 2.5, hall: 0.4 });
        this.a.note('vtrem', 88, { bus: 'music', at, gain: 0.2, duration: 2.5, hall: 0.4 });
        this.a.note('timp', 41, { bus: 'music', at, gain: 0.6 });
        break;
      case 'reveal':
        this.a.play(this.a.any('gongscrape'), { bus: 'music', at, gain: 0.45, hall: 0.6 });
        this.sfx.harmonica(76, 4, { bus: 'music', at, gain: 0.18, hall: 0.8 });
        break;
      case 'scare':
        this.a.play(this.a.any('bigdrum'), { bus: 'music', at, gain: 0.9 });
        this.a.play(this.a.any('bowcym'), { bus: 'music', at, gain: 0.6, rate: 1.3 });
        this.a.note('piano', 26, { bus: 'music', at, gain: 0.6 });
        this.a.note('piano', 27, { bus: 'music', at, gain: 0.6 });
        break;
      case 'wrong':
        this.a.play(this.a.any('flex'), { bus: 'music', at, gain: 0.35, rate: 0.8 });
        this.a.note('piano', 31, { bus: 'music', at, gain: 0.45 });
        break;
      case 'soft':
        this.a.note('glock', 88, { bus: 'music', at, gain: 0.18, hall: 0.8 });
        this.a.note('glock', 81, { bus: 'music', at: at + 0.4, gain: 0.14, hall: 0.8 });
        break;
      case 'memory':
        this.a.play(this.a.buffers.get('chimes_00'), { bus: 'music', at, gain: 0.25, hall: 0.8 });
        this.sfx.harmonica(72, 3, { bus: 'music', at, gain: 0.14, hall: 1 });
        break;
      case 'dread':
        this.a.note('cbass', 28, { bus: 'music', at, gain: 0.5, duration: 5, fadeIn: 1, lowpass: 400 });
        this.a.play(this.a.any('bowcym'), { bus: 'music', at: at + 0.5, gain: 0.35, rate: 0.7, hall: 0.7 });
        break;
    }
  }

  // ─────────────────────────── 크레딧 송 ───────────────────────────

  private kids(line: string, notes: [number, number][], e8: number) {
    let b = this.kidsBuffers.get(line);
    if (!b) {
      const vow = KID_VOWELS[line] ?? [];
      const sung: SungNote[] = [];
      let t = 0;
      let vi = 0;
      for (const [m, d] of notes) {
        if (m > 0) sung.push({ midi: m, t, dur: d * e8 * 0.9, vowel: vow[vi++ % Math.max(1, vow.length)] ?? 'a', vel: 0.9 });
        t += d * e8;
      }
      // 아이 세 명: 조금씩 다른 포먼트와 음정
      const v1 = sing(sung, { formantScale: 1.26, vibratoDepth: 0.06, seed: 11, breath: 0.08 });
      const v2 = sing(sung.map((n) => ({ ...n, midi: n.midi + 0.08 })), { formantScale: 1.3, vibratoDepth: 0.08, seed: 12, breath: 0.08 });
      const v3 = sing(sung.map((n) => ({ ...n, midi: n.midi - 0.07, t: n.t + 0.012 })), { formantScale: 1.22, vibratoDepth: 0.05, seed: 13, breath: 0.08 });
      const len = Math.max(v1.length, v2.length, v3.length);
      const mix = new Float32Array(len);
      for (let i = 0; i < len; i++) mix[i] = ((v1[i] ?? 0) + (v2[i] ?? 0) + (v3[i] ?? 0)) / 2.4;
      b = makeBuffer(this.a.ctx, mix);
      this.kidsBuffers.set(line, b);
    }
    return b;
  }

  startCredits() {
    this.stop(0.3);
    this.mode = 'credits';
    const ev: Ev[] = [];
    const e8 = 60 / 112 / 2;
    const bar = e8 * 4;
    const push = (t: number, fn: (at: number) => void) => ev.push({ t, fn });
    let t = bar * 2;
    // 전주: 우쿨렐레와 장난감 피아노
    for (let k = 0; k < 4; k++) push(k * e8 * 2, (x) => this.strum('C', x, 0.3));
    push(0, (x) => this.n('glock', 84, { at: x, gain: 0.2, hall: 0.4 }));

    SWAP_SONG.forEach((ln, li) => {
      const lineStart = t;
      const last = li === SWAP_SONG.length - 1;
      const slow = li >= SWAP_SONG.length - 2;
      push(lineStart, () => this.onLyric?.(ln.line, li));
      // 반주
      ln.chords.forEach((c, b) => {
        if (!c) return;
        for (let k = 0; k < 2; k++) push(lineStart + b * bar + k * e8 * 2, (x) => this.strum(c, x, slow ? 0.16 : 0.26));
        if (!slow) push(lineStart + b * bar, (x) => this.n('cello', UKE[c][0] - 24, { at: x, gain: 0.16, duration: bar * 0.9, lowpass: 1500 }));
      });
      // 선율
      let tt = lineStart;
      for (const [m, d] of ln.notes) {
        if (m > 0) {
          const inst = last ? 'mbox' : 'toyp';
          const dd = slow ? d * 1.15 : d;
          push(tt, (x) => this.n(inst, m, { at: x, gain: last ? 0.35 : 0.3, hall: last ? 0.8 : 0.3, detune: last ? -25 : 0 }));
          if (li === 4 || li === 5) push(tt, (x) => this.n('glock', m + 12, { at: x, gain: 0.1, hall: 0.4 }));
          tt += dd * e8;
        } else tt += d * e8;
      }
      if (ln.kids)
        push(lineStart, (x) => {
          const v = this.a.play(this.kids(ln.line, ln.notes, e8), { bus: 'music', at: x, gain: 0.55, hall: 0.45 });
          if (v) this.active.push(v);
        });
      t = lineStart + 16 * e8 * (slow ? 1.15 : 1);
    });
    push(t + 2.5, () => this.onCreditsEnd?.());
    this.load(ev, 0, this.a.now + 0.2);
  }

  private strum(chord: string, at: number, gain: number) {
    const notes = UKE[chord];
    if (!notes) return;
    notes.forEach((m, i) => this.n('uke', m, { at: at + i * 0.014, gain: gain * (i === 0 ? 1 : 0.8), hall: 0.25 }));
  }
}
