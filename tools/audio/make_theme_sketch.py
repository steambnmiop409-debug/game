#!/usr/bin/env python3
"""메인 테마 「Lesson No.49」 구조 스케치 MIDI 생성기 (외부 라이브러리 없음).

설계 문서: docs/design/07_AUDIO.md  S4
출력: assets/audio/sketch/lesson49_sketch.mid

General MIDI 음색으로 구조(49마디, 템포 변화, 침묵, 흔들리는 '라')를 확인하기 위한 스케치일 뿐
최종 음원이 아니다. 최종 음원은 실제 악기 샘플과 녹음으로 만든다 (S10.1).

핵심 장치
- 오르골(아이의 목소리)의 A는 별도 채널에서 피치벤드로 −13.69센트(F 위 순정 장3도) 내린다.
- B 구간에서 첼레스타(평균율, 장난감 피아노 대역)가 같은 음을 겹쳐 A마다 맥놀이가 생긴다.
- 29마디 1~2박은 틱까지 끊긴 완전 침묵이다.
- 마지막은 F–C 빈 5도로 끝나며 C(으뜸화음)로 해결하지 않는다.
- 빈 5도는 오르간과 함께 아이들의 입 다문 허밍(킨더클라비어의 87명)으로도 깔린다.
"""
import math
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "audio", "sketch", "lesson49_sketch.mid")

PPQ = 480
BEATS_PER_BAR = 4
JUST_THIRD_CENTS = 1200 * math.log2(5 / 4) - 400   # = −13.686...
BEND_RANGE_CENTS = 200                              # RPN 0 = ±2반음

# ── 채널과 GM 음색 (0부터 셈) ─────────────────────────────────────────────
CH_MBOX, CH_MBOX_FLAT, CH_CELESTA, CH_ORGAN = 0, 1, 2, 3
CH_OOHS, CH_PIZZ, CH_TREM, CH_GLASS, CH_AAHS = 4, 5, 6, 7, 8
CH_DRUMS, CH_ACCORDION, CH_PIANO, CH_FORK, CH_BREATH, CH_HUM = 9, 10, 11, 12, 13, 14

CHANNELS = {
    # 채널: (트랙 이름, GM 프로그램, 볼륨)
    CH_MBOX: ("Music Box (child)", 10, 110),
    CH_MBOX_FLAT: ("Music Box (child, A = -13.7c)", 10, 110),
    CH_CELESTA: ("Toy Piano (celesta stand-in, ET)", 8, 82),
    CH_ORGAN: ("Pipe Organ F-C (Lost Chord)", 19, 72),
    CH_OOHS: ("Children's Choir Oohs", 53, 66),
    CH_PIZZ: ("Cello Pizzicato", 45, 80),
    CH_TREM: ("Strings Tremolo (sul pont.)", 44, 74),
    CH_GLASS: ("Glass Harmonica (bowed pad stand-in)", 92, 96),
    CH_AAHS: ("Choir Aahs", 52, 66),
    CH_DRUMS: ("Pendulum Tick (wood block)", 0, 92),
    CH_ACCORDION: ("Accordion Inhale (Bello)", 21, 104),
    CH_PIANO: ("Low Piano Cluster", 0, 92),
    CH_FORK: ("Tuning Fork A440 (ocarina stand-in)", 79, 100),
    CH_BREATH: ("Whisper (breath noise)", 121, 84),
    CH_HUM: ("Children's Humming F-C (closed mouth)", 53, 58),
}

# ── 음이름 → MIDI 번호 (C4 = 60) ──────────────────────────────────────────
NOTE = {"A1": 33, "A#1": 34, "B1": 35, "C2": 36, "D2": 38, "E2": 40, "F2": 41, "G2": 43, "A2": 45,
        "C3": 48, "F3": 53, "G#3": 56, "Ab3": 56, "A3": 57, "B3": 59, "C4": 60, "D4": 62, "E4": 64,
        "F4": 65, "G4": 67, "G#4": 68, "A4": 69, "B4": 71, "C5": 72, "E3": 52, "G3": 55}

# ── 「똑딱 노래」 12마디: (음, 박, 가사) — 음이 None이면 속삭임(쉼) ───────────
SONG = [
    [("G4", 1, "똑"), ("E4", 1, "딱"), ("G4", 1, "똑"), ("E4", 1, "딱")],
    [("A4", .5, "작"), ("A4", .5, "은"), ("G4", 1, "시"), ("E4", 2, "계")],
    [("F4", 1, "바"), ("F4", 1, "른"), ("D4", 1, "자"), ("D4", 1, "세")],
    [("E4", 1, "입"), ("D4", 1, "은"), ("C4", 2, "꾹")],
    [("C4", .5, "모"), ("E4", .5, "든"), ("G4", 1, "음"), ("C5", 1, "은"), ("B4", 1, "정")],
    [("A4", 1, "확"), ("G4", 1, "하"), ("E4", 2, "게")],
    [("A4", 1, "너"), ("A4", 1, "도"), ("G4", 1, "나"), ("E4", 1, "도")],
    [("D4", .5, "절"), ("E4", .5, "대"), ("D4", 1, "음"), ("C4", 2, "감")],
    [("A3", 1, "만"), ("C4", 1, "약"), ("E4", 1, "음"), ("A4", 1, "이")],
    [("G#4", 1, "틀"), ("F4", 1, "린"), ("E4", 1, "다"), ("D4", 1, "면")],
    [(None, 1, "쉿"), (None, 1, "쉿"), ("E4", .5, "넌"), ("D4", .5, "여"), ("C4", 1, "기")],
    [("B3", 1, "없"), ("C4", 1, "는"), ("B3", 1, "아"), ("A3", 1, "이")],
]

# 화음: 마디마다 [(시작 박, 길이 박, 화음 이름)]
MAJOR_CHORDS = [[(0, 4, "C")], [(0, 4, "Am")], [(0, 4, "Dm")], [(0, 2, "G"), (2, 2, "C")],
                [(0, 4, "C")], [(0, 4, "Am")], [(0, 4, "F")], [(0, 2, "G"), (2, 2, "C")],
                [(0, 4, "Am")], [(0, 4, "E7b9")], [(0, 4, "FC")], [(0, 4, "FC")]]
MINOR_CHORDS = [[(0, 4, c)] for c in ["Am", "F", "Dm", "E", "Am", "F", "Dm", "E", "Am", "E7b9", "FC", "FC"]]

OOHS_VOICING = {"C": [52, 55, 60], "Am": [52, 57, 60], "Dm": [53, 57, 62], "G": [55, 59, 62],
                "F": [53, 57, 60], "E": [52, 56, 59], "E7b9": [52, 56, 62, 65], "FC": [53, 60]}
AAHS_VOICING = {"Am": [57, 60, 64], "F": [57, 60, 65], "Dm": [57, 62, 65], "E": [56, 59, 64],
                "E7b9": [56, 62, 64, 65], "FC": [53, 60]}
TREM_VOICING = {"Am": [45, 52], "F": [41, 48], "Dm": [38, 45], "E": [40, 47], "E7b9": [40, 47], "FC": [41, 48]}
PIZZ_ROOT = {"C": 36, "Am": 45, "Dm": 38, "G": 43, "F": 41, "E": 40, "E7b9": 40}
ORGAN_FIFTHS = [41, 48, 53, 60]                       # F2 C3 F3 C4 — 3음(A) 없음

# 템포 지도: 마디 번호 → BPM (그 마디부터)
TEMPO_MAP = {1: 72, 33: 80, 36: 88, 39: 96, 42: 72, 43: 60, 44: 48, 45: 40, 46: 72}
MARKERS = {1: "Intro", 5: "A - music box", 17: "B - toy piano doubles (A wobbles)",
           29: "Rest - 2 beats of silence, then a breath", 30: "C - minor, accelerating",
           42: "Wind-down - spring runs out", 46: "Outro - hollow fifth, unresolved"}
TOTAL_BARS = 49


def bar_tick(bar, beat=0.0):
    return int(round(((bar - 1) * BEATS_PER_BAR + beat) * PPQ))


class Track:
    def __init__(self):
        self.events = []  # (tick, order, bytes)

    def add(self, tick, data, order=1):
        self.events.append((tick, order, bytes(data)))

    def meta(self, tick, kind, payload):
        self.add(tick, bytes([0xFF, kind]) + vlq(len(payload)) + payload, order=0)

    def cc(self, tick, ch, num, val):
        self.add(tick, [0xB0 | ch, num, max(0, min(127, int(val)))])

    def note(self, tick, ch, key, dur_ticks, vel):
        self.add(tick, [0x90 | ch, key, vel], order=2)
        self.add(tick + max(1, dur_ticks), [0x80 | ch, key, 0], order=0)

    def ramp(self, ch, num, t0, t1, v0, v1, steps=16):
        for k in range(steps + 1):
            self.cc(t0 + (t1 - t0) * k // steps, ch, num, v0 + (v1 - v0) * k / steps)

    def encode(self):
        out, last = bytearray(), 0
        for tick, _, data in sorted(self.events, key=lambda e: (e[0], e[1])):
            out += vlq(tick - last) + data
            last = tick
        out += vlq(0) + bytes([0xFF, 0x2F, 0x00])
        return b"MTrk" + struct.pack(">I", len(out)) + bytes(out)


def vlq(n):
    buf = [n & 0x7F]
    n >>= 7
    while n:
        buf.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(buf)


def build():
    tracks = {ch: Track() for ch in CHANNELS}
    conductor = Track()

    # 지휘 트랙: 이름, 박자표, 템포, 구간 표시
    conductor.meta(0, 0x03, "OFF-KEY - Lesson No.49 (structure sketch)".encode())
    conductor.meta(0, 0x58, bytes([4, 2, 24, 8]))
    for bar, bpm in TEMPO_MAP.items():
        conductor.meta(bar_tick(bar), 0x51, (60_000_000 // bpm).to_bytes(3, "big"))
    for bar, text in MARKERS.items():
        conductor.meta(bar_tick(bar), 0x06, text.encode())

    # 채널 초기화
    for ch, (name, prog, vol) in CHANNELS.items():
        t = tracks[ch]
        t.meta(0, 0x03, name.encode())
        if ch != CH_DRUMS:
            t.add(0, [0xC0 | ch, prog])
        t.cc(0, ch, 7, vol)
        t.cc(0, ch, 11, 127)
        # 피치벤드 범위 ±2반음 (RPN 0) 명시
        for num, val in ((101, 0), (100, 0), (6, 2), (38, 0), (101, 127), (100, 127)):
            t.cc(0, ch, num, val)
    bend = 8192 + round(JUST_THIRD_CENTS / BEND_RANGE_CENTS * 8192)
    tracks[CH_MBOX_FLAT].add(1, [0xE0 | CH_MBOX_FLAT, bend & 0x7F, (bend >> 7) & 0x7F])

    def play_song(first_bar, song_bars, melody_ch, flat_ch, vel, lyrics=False, whisper=True,
                  last_hold=None):
        for k, bar_notes in enumerate(song_bars):
            bar = first_bar + k
            beat = 0.0
            for i, (name, dur, syl) in enumerate(bar_notes):
                t = bar_tick(bar, beat)
                if lyrics:
                    tracks[CH_MBOX].meta(t, 0x05, syl.encode("utf-8"))
                if name is None:
                    if whisper:
                        tracks[CH_BREATH].note(t, CH_BREATH, 60, PPQ // 2, 76)
                else:
                    is_a = name.startswith("A") and not name.startswith("Ab")
                    ch = flat_ch if (is_a and flat_ch is not None) else melody_ch
                    length = dur
                    if last_hold and k == len(song_bars) - 1 and i == len(bar_notes) - 1:
                        length = last_hold
                    tracks[ch].note(t, ch, NOTE[name], int(length * PPQ * 0.95), vel)
                beat += dur

    def play_chords(first_bar, chords, ch, voicing, vel, roots=False):
        for k, bar_chords in enumerate(chords):
            for beat, dur, name in bar_chords:
                if name not in voicing:
                    continue
                t = bar_tick(first_bar + k, beat)
                if roots:   # 피치카토: 1박과 3박에 근음
                    for b in range(int(dur)):
                        if (beat + b) % 2 == 0:
                            tracks[ch].note(bar_tick(first_bar + k, beat + b), ch, voicing[name], PPQ // 2, vel)
                else:
                    for key in voicing[name]:
                        tracks[ch].note(t, ch, key, int(dur * PPQ) - 10, vel)

    # 도입 (1~4): 소리굽쇠 → 틱 → 빈 5도
    tracks[CH_FORK].note(bar_tick(1), CH_FORK, NOTE["A4"], 6 * PPQ, 84)
    tracks[CH_FORK].ramp(CH_FORK, 11, bar_tick(1), bar_tick(2, 2), 120, 0)
    org = tracks[CH_ORGAN]
    org.cc(0, CH_ORGAN, 11, 0)
    for key in ORGAN_FIFTHS:
        org.note(bar_tick(3), CH_ORGAN, key, bar_tick(29) - bar_tick(3), 70)
    org.ramp(CH_ORGAN, 11, bar_tick(3), bar_tick(5), 0, 70)
    org.cc(bar_tick(5), CH_ORGAN, 11, 48)     # A: 아주 여리게
    org.cc(bar_tick(17), CH_ORGAN, 11, 58)    # B: 여리게

    # 아이들의 허밍 (3~28마디, 46~49마디): 오르간과 같은 빈 5도, 3음 없음
    hum = tracks[CH_HUM]
    hum.cc(0, CH_HUM, 11, 0)
    for key in (NOTE["F3"], NOTE["C4"]):
        hum.note(bar_tick(3), CH_HUM, key, bar_tick(29) - bar_tick(3) - 10, 64)
        hum.note(bar_tick(46), CH_HUM, key, bar_tick(50) - bar_tick(46) - 10, 64)
    hum.ramp(CH_HUM, 11, bar_tick(3), bar_tick(5), 0, 60)
    hum.ramp(CH_HUM, 11, bar_tick(46), bar_tick(50) - 20, 30, 110, steps=32)

    # A (5~16): 오르골 + 가사
    play_song(5, SONG, CH_MBOX, CH_MBOX_FLAT, 92, lyrics=True)

    # B (17~28): 오르골 + 장난감 피아노(평균율, 같은 음) + 합창 허밍 + 첼로 피치카토
    play_song(17, SONG, CH_MBOX, CH_MBOX_FLAT, 92)
    play_song(17, SONG, CH_CELESTA, None, 74, whisper=False)
    play_chords(17, MAJOR_CHORDS, CH_OOHS, OOHS_VOICING, 52)
    play_chords(17, MAJOR_CHORDS[:10], CH_PIZZ, PIZZ_ROOT, 70, roots=True)

    # 쉼 (29): 1~2박 완전 침묵, 3~4박 아코디언 들숨 (F단조)
    acc = tracks[CH_ACCORDION]
    acc.cc(bar_tick(29, 2), CH_ACCORDION, 11, 8)
    for key in (NOTE["F3"], NOTE["Ab3"], NOTE["C4"]):
        acc.note(bar_tick(29, 2), CH_ACCORDION, key, 2 * PPQ - 20, 100)
    acc.ramp(CH_ACCORDION, 11, bar_tick(29, 2), bar_tick(30) - 10, 8, 127)

    # C (30~41): 단조 재화성, 가속
    for key in ORGAN_FIFTHS:
        org.note(bar_tick(30), CH_ORGAN, key, bar_tick(42) - bar_tick(30), 70)
    org.cc(bar_tick(30), CH_ORGAN, 11, 44)
    play_song(30, SONG, CH_GLASS, None, 88, whisper=False)
    play_chords(30, MINOR_CHORDS, CH_TREM, TREM_VOICING, 60)
    play_chords(30, MINOR_CHORDS, CH_AAHS, AAHS_VOICING, 50)
    for bar in (30, 34, 38):
        for key in (NOTE["A1"], NOTE["A#1"], NOTE["B1"], NOTE["C2"]):
            tracks[CH_PIANO].note(bar_tick(bar), CH_PIANO, key, 4 * PPQ, 72)

    # 태엽 풀림 (42~45): 오르골 혼자 노래 9~12마디. 마지막 A3에만 평균율 A3가 겹친다
    play_song(42, SONG[8:], CH_MBOX, CH_MBOX_FLAT, 88, last_hold=3)
    tracks[CH_CELESTA].note(bar_tick(45, 3), CH_CELESTA, NOTE["A3"], 3 * PPQ, 60)

    # 끝 (46~49): 빈 5도가 커지고, 해결 없이 끊긴다
    for key in ORGAN_FIFTHS:
        org.note(bar_tick(46), CH_ORGAN, key, bar_tick(50) - bar_tick(46) - 10, 74)
    org.ramp(CH_ORGAN, 11, bar_tick(46), bar_tick(50) - 20, 20, 120, steps=32)

    # 펜듈럼 틱: 2~28, 30~41, 48~49마디 (1박은 높은 우드블록)
    tick_bars = list(range(2, 29)) + list(range(30, 42)) + [48, 49]
    for bar in tick_bars:
        for beat in range(BEATS_PER_BAR):
            key, vel = (76, 100) if beat == 0 else (77, 84)
            tracks[CH_DRUMS].note(bar_tick(bar, beat), CH_DRUMS, key, PPQ // 8, vel)

    body = conductor.encode() + b"".join(tracks[ch].encode() for ch in CHANNELS)
    header = b"MThd" + struct.pack(">IHHH", 6, 1, 1 + len(CHANNELS), PPQ)
    return header + body


def duration_seconds():
    secs, bpm = 0.0, TEMPO_MAP[1]
    for bar in range(1, TOTAL_BARS + 1):
        bpm = TEMPO_MAP.get(bar, bpm)
        secs += BEATS_PER_BAR * 60 / bpm
    return secs


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(build())
    d = duration_seconds()
    print(f"{os.path.normpath(OUT)}  |  {TOTAL_BARS} bars  |  {int(d // 60)}:{d % 60:04.1f}  |  "
          f"A bend {JUST_THIRD_CENTS:.2f} cents")
