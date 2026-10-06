import { Emitter } from './events';
import { clamp } from './util';

/**
 * 걸음 박자 (G3.1). 회진과 호피 스와피는 이 박자에 맞춰 한 걸음씩 끊어 걷는다 (발디 오마주).
 * 퀴즈 오답과 발견으로 빨라지고, 추격 음악도 이 박자를 따른다.
 *
 * 박의 시각은 게임 시간으로 센다: 프레임이 느린 컴퓨터에서 게임이 느려지면 걸음도 같이 느려진다
 * (오디오 시계를 쓰면 느린 컴퓨터에서 크리처만 상대적으로 빨라진다).
 * 소리 예약용 'schedule' 이벤트에는 오디오 시각으로 바꾼 값을 넘긴다.
 */
export interface PaceEvents extends Record<string, unknown> {
  /** 오디오 예약용: 아직 오지 않은 박 (t = 오디오 시각, offT = 엇박의 오디오 시각) */
  schedule: { t: number; offT: number; index: number; bpm: number };
  /** 게임 로직용: 방금 한 박이 지났다 */
  beat: { index: number; bpm: number; t: number };
}

export class Pace extends Emitter<PaceEvents> {
  /** 현재 BPM (부드럽게 목표를 따라간다) */
  bpm = 60;
  /** 바닥 BPM: 퀴즈 오답(+15)처럼 챕터 끝까지 유지되는 상승분 */
  floor = 60;
  /** 일시적 상승분 (10초마다 -5) */
  private boost = 0;
  /** 난이도 배율 (G12.3) */
  mult = 1;

  private next = 0;
  private index = 0;
  private pending: { t: number; index: number }[] = [];
  private silentBeats = 0;
  private running = false;
  private decayAcc = 0;
  /** 게임 시간 (update의 dt를 더한다) */
  private gt = 0;

  constructor(private readonly clock: () => number) {
    super();
  }

  get targetBpm() {
    return clamp((this.floor + this.boost) * this.mult, 30, 180);
  }

  get interval() {
    return 60 / Math.max(1, this.bpm);
  }

  start() {
    this.running = true;
    this.next = this.gt + 0.4;
  }

  stop() {
    this.running = false;
    this.pending.length = 0;
  }

  /** 일시적 상승 (발견 +20) */
  add(delta: number) {
    this.boost = clamp(this.boost + delta, 0, 120);
  }

  /** 챕터 끝까지 남는 상승 (퀴즈 오답) */
  raiseFloor(delta: number) {
    this.floor = clamp(this.floor + delta, 40, 160);
  }

  /** 즉시 BPM 지정 (보스전 진입 등) */
  setImmediate(bpm: number) {
    this.boost = Math.max(0, bpm / this.mult - this.floor);
    this.bpm = bpm;
  }

  /** 침묵 예고 (S9-1): 다음 n박 동안 아무도 걷지 않는다 */
  silence(beats = 2) {
    this.silentBeats = Math.max(this.silentBeats, beats);
  }

  update(dt: number) {
    if (!this.running) return;
    this.gt += dt;
    const now = this.gt;
    const audioNow = this.clock();
    // BPM은 목표를 부드럽게 따라간다
    const tgt = this.targetBpm;
    this.bpm += (tgt - this.bpm) * (1 - Math.exp(-dt * 1.2));
    // 일시적 상승분 감쇠: 10초마다 -5
    this.decayAcc += dt;
    if (this.decayAcc >= 10) {
      this.decayAcc -= 10;
      this.boost = Math.max(0, this.boost - 5);
    }
    if (this.next < now - 1) this.next = now + 0.05;

    // 미리 예약 (0.2초 앞까지)
    while (this.next < now + 0.2) {
      const t = this.next;
      const iv = this.interval;
      if (this.silentBeats > 0) this.silentBeats--;
      else {
        this.index++;
        this.pending.push({ t, index: this.index });
        const at = audioNow + (t - now);
        this.emit('schedule', { t: at, offT: at + Math.min(0.32, iv * 0.35), index: this.index, bpm: this.bpm });
      }
      this.next = t + iv;
    }

    // 실제로 도달한 박을 게임 로직에 알린다
    while (this.pending.length && this.pending[0].t <= now) {
      const p = this.pending.shift()!;
      this.emit('beat', { index: p.index, bpm: this.bpm, t: p.t });
    }
  }

  reset(bpm = 60) {
    this.floor = bpm;
    this.boost = 0;
    this.bpm = bpm;
    this.silentBeats = 0;
    this.pending.length = 0;
    this.next = this.gt + 0.3;
  }
}
