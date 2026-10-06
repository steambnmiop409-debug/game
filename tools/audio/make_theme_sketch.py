#!/usr/bin/env python3
"""메인 테마 「Whatever You Become (어떤 모습으로 와도)」 구조 스케치 MIDI 생성기 (외부 라이브러리 없음).

설계 문서: docs/design/07_AUDIO.md  S4
출력: assets/audio/sketch/whatever_you_become_sketch.mid

General MIDI 음색으로 구조를 확인하기 위한 스케치일 뿐 최종 음원이 아니다.
최종 음원은 실제 악기 녹음과 샘플로 만든다 (S10).

구조 = 주제와 변주. 엄마의 자장가 하나가 회사의 4단계를 차례로 '시술'받는다.
  도입(2) → 주제 「치료」(8) → 변주1 「개선」(8) → 변주2 「설계」(8)
        → 변주3 「인간 이후」(8) → 변주4 「실험 90」(8) → 끝(2)   = 44마디, 6/8
  - 주제:   엄마의 허밍 + 오르골 + 사람의 심장 박동. C로 해결(집).
  - 변주1: 엄마 목소리가 사라지고 첼레스타·현악·하프로 더 아름답게. Cmaj7로 끝(예쁘지만 집이 아님).
  - 변주2: 음 세 개 중 하나씩이 빠진다(기능 제거). 4마디째에 심장이 멈춘다. G로 끝(해결 안 됨).
  - 변주3: 음마다 다른 악기, 다른 위치(좌우). 마디 안의 순서가 거꾸로(여러 곳에 동시에).
  - 변주4: 선율 없이 잔향만 남는다(몸이 없다). 아주 느리고 거대한 건물의 심장과 숨.
"""
import os
import struct

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "audio", "sketch",
                   "whatever_you_become_sketch.mid")

PPQ = 480
EIGHTH = PPQ // 2
BAR = 6 * EIGHTH                 # 6/8
QUARTER_BPM = 75                 # 점4분음표 = 50

# 채널: (트랙 이름, GM 프로그램, 볼륨, 팬)
CH = {
    "hum":    (0, "Mother's Humming", 53, 100, 64),
    "mbox":   (1, "Music Box", 10, 92, 64),
    "cello":  (2, "Cello (roots)", 42, 70, 64),
    "celes":  (3, "Celesta", 8, 100, 64),
    "str":    (4, "Strings (lush)", 48, 72, 64),
    "harp":   (5, "Harp", 46, 80, 64),
    "vib":    (6, "Bowed Vibraphone", 92, 96, 64),
    "piano":  (7, "Piano (left)", 0, 92, 12),
    "harp2":  (8, "Harp (right)", 46, 92, 116),
    "drums":  (9, "Heart (drums)", 0, 100, 64),
    "glock":  (10, "Glockenspiel (far left)", 9, 70, 36),
    "bells":  (11, "Tubular Bells (far right)", 14, 64, 96),
    "echo":   (12, "Echo Only (halo pad)", 94, 60, 64),
    "bass":   (13, "Contrabass Breath", 43, 84, 64),
    "timp":   (14, "Timpani Heartbeat", 47, 96, 64),
}

N = {"C2": 36, "G2": 43, "A2": 45, "C3": 48, "D3": 50, "E3": 52, "F3": 53, "G3": 55, "A3": 57,
     "B3": 59, "C4": 60, "D4": 62, "E4": 64, "F4": 65, "G4": 67, "A4": 69, "B4": 71, "C5": 72,
     "D5": 74, "E5": 76, "G5": 79, "F2": 41}

# 자장가 8마디: (음, 8분음표 개수)
MELODY = [
    [("E4", 2), ("D4", 1), ("E4", 2), ("G4", 1)],
    [("A4", 2), ("G4", 1), ("E4", 2), ("D4", 1)],
    [("E4", 2), ("G4", 1), ("A4", 2), ("C5", 1)],
    [("A4", 2), ("G4", 1), ("G4", 3)],
    [("C5", 2), ("A4", 1), ("G4", 2), ("E4", 1)],
    [("G4", 2), ("E4", 1), ("D4", 2), ("C4", 1)],
    [("D4", 2), ("E4", 1), ("G4", 2), ("E4", 1)],
    [("D4", 2), ("E4", 1), ("C4", 3)],
]
LYRICS = ("자 장 자 장 우 리 아 가 봄 은 다 시 올 거 야 "
          "어 떤 모 습 으 로 와 도 엄 마 는 알 아 볼 게").split()

THEME_CHORDS = [["C3", "G3", "E4"], ["A2", "E3", "C4"], ["C3", "G3", "E4"], ["G2", "D3", "B3"],
                ["A2", "E3", "C4"], ["C3", "G3", "E4"], ["G2", "D3", "B3"], ["C3", "G3", "E4"]]
LUSH_CHORDS = [["C3", "E3", "B3", "D4"], ["A2", "E3", "G3", "B3"], ["F3", "A3", "C4", "E4"],
               ["G2", "D3", "E3", "B3"], ["A2", "G3", "C4", "D4"], ["E3", "G3", "B3", "C4"],
               ["D3", "F3", "C4", "E4"], ["C3", "E3", "G3", "B3"]]       # 마지막 Cmaj7
FIFTHS = [["C3", "G3"], ["A2", "E3"], ["C3", "G3"], ["G2", "D3"],
          ["A2", "E3"], ["C3", "G3"], ["G2", "D3"], ["G2", "D3"]]          # 마지막 G (미해결)

SECTIONS = {1: "Intro - a human heartbeat", 3: "Theme: Treat - mother's lullaby, resolves home",
            11: "Var.1: Improve - more beautiful, mother's voice gone",
            19: "Var.2: Design - notes removed, heart stops",
            27: "Var.3: Post-Human - everywhere at once",
            35: "Var.4: Experiment 90 - only the echo remains",
            43: "Outro - the building's heart"}
TOTAL_BARS = 44


def vlq(n):
    buf = [n & 0x7F]
    n >>= 7
    while n:
        buf.insert(0, (n & 0x7F) | 0x80)
        n >>= 7
    return bytes(buf)


class Track:
    def __init__(self):
        self.ev = []

    def add(self, t, data, order=1):
        self.ev.append((t, order, bytes(data)))

    def meta(self, t, kind, payload):
        self.add(t, bytes([0xFF, kind]) + vlq(len(payload)) + payload, 0)

    def cc(self, t, ch, num, val):
        self.add(t, [0xB0 | ch, num, max(0, min(127, int(val)))])

    def note(self, t, ch, key, dur, vel):
        self.add(t, [0x90 | ch, key, vel], 2)
        self.add(t + max(1, dur), [0x80 | ch, key, 0], 0)

    def ramp(self, ch, num, t0, t1, v0, v1, steps=16):
        for k in range(steps + 1):
            self.cc(t0 + (t1 - t0) * k // steps, ch, num, v0 + (v1 - v0) * k / steps)

    def encode(self):
        out, last = bytearray(), 0
        for t, _, d in sorted(self.ev, key=lambda e: (e[0], e[1])):
            out += vlq(t - last) + d
            last = t
        out += vlq(0) + b"\xFF\x2F\x00"
        return b"MTrk" + struct.pack(">I", len(out)) + bytes(out)


def bar_t(bar, eighth=0):
    return (bar - 1) * BAR + eighth * EIGHTH


def build():
    tr = {k: Track() for k in CH}
    cond = Track()
    cond.meta(0, 0x03, b"SECOND NATURE - Whatever You Become (structure sketch)")
    cond.meta(0, 0x58, bytes([6, 3, 36, 8]))                       # 6/8
    cond.meta(0, 0x51, (60_000_000 // QUARTER_BPM).to_bytes(3, "big"))
    for bar, text in SECTIONS.items():
        cond.meta(bar_t(bar), 0x06, text.encode())

    for key, (ch, name, prog, vol, pan) in CH.items():
        t = tr[key]
        t.meta(0, 0x03, name.encode())
        if ch != 9:
            t.add(0, [0xC0 | ch, prog])
        t.cc(0, ch, 7, vol)
        t.cc(0, ch, 10, pan)
        t.cc(0, ch, 11, 127)
        t.cc(0, ch, 91, 40)

    def melody(first_bar, key, vel, octave=0, drop_every=0, lyrics=False, delay=0):
        idx = 0
        for b, notes in enumerate(MELODY):
            e = 0
            for name, dur in notes:
                idx += 1
                start = bar_t(first_bar + b, e) + delay
                if lyrics:
                    tr[key].meta(start, 0x05, LYRICS[idx - 1].encode("utf-8"))
                if not (drop_every and idx % drop_every == 0):
                    tr[key].note(start, CH[key][0], N[name] + 12 * octave, dur * EIGHTH - 20, vel)
                e += dur

    def chords(first_bar, key, table, vel, arpeggio=False):
        ch = CH[key][0]
        for b, notes in enumerate(table):
            if arpeggio:
                for i, name in enumerate(notes):
                    tr[key].note(bar_t(first_bar + b, i), ch, N[name] + 12, 2 * EIGHTH, vel)
            else:
                for name in notes:
                    tr[key].note(bar_t(first_bar + b), ch, N[name], BAR - 20, vel)

    def heartbeat(first_bar, bars, per_bar=2, key="timp", note=N["F2"], vel=(78, 54)):
        ch = CH[key][0]
        step = 6 // per_bar
        for b in range(bars):
            for k in range(per_bar):
                t = bar_t(first_bar + b, k * step)
                tr[key].note(t, ch, note, EIGHTH, vel[0])                 # lub
                tr[key].note(t + EIGHTH // 2, ch, note, EIGHTH, vel[1])   # dub

    # 도입 (1~2): 사람의 심장
    heartbeat(1, 2)

    # 주제 「치료」 (3~10): 엄마의 허밍 + 오르골 + 심장. C로 해결
    melody(3, "hum", 84, lyrics=True)
    melody(3, "mbox", 70, octave=1)
    chords(3, "cello", [[c[0]] for c in THEME_CHORDS], 56)
    heartbeat(3, 8)

    # 변주1 「개선」 (11~18): 엄마 목소리 없음. 더 아름답게. Cmaj7로 끝
    melody(11, "celes", 92, octave=1)
    chords(11, "str", LUSH_CHORDS, 58)
    chords(11, "harp", LUSH_CHORDS, 52, arpeggio=True)
    heartbeat(11, 8, vel=(64, 44))

    # 변주2 「설계」 (19~26): 세 음마다 하나씩 빠진다. 4마디째(22)부터 심장이 멈춘다. G로 끝
    melody(19, "vib", 88, drop_every=3)
    chords(19, "str", FIFTHS, 44)
    heartbeat(19, 3, vel=(60, 40))

    # 변주3 「인간 이후」 (27~34): 음마다 다른 악기·위치, 마디 안 순서는 거꾸로
    rota = ["piano", "harp2", "glock", "bells"]
    i = 0
    for b, notes in enumerate(MELODY):
        e = 0
        events = []
        for name, dur in notes:
            events.append((e, name, dur))
            e += dur
        for (pos, _, dur), (_, name, _) in zip(events, reversed(events)):
            key = rota[i % len(rota)]
            tr[key].note(bar_t(27 + b, pos), CH[key][0], N[name] + (12 if key in ("glock", "bells") else 0),
                         dur * EIGHTH - 20, 84)
            i += 1
    for b in range(8):                                              # 심장이 아무 데서나 뛴다
        tr["timp"].note(bar_t(27 + b, (b * 5) % 6), CH["timp"][0], N["F2"], EIGHTH, 50)

    # 변주4 「실험 90」 (35~42): 선율 없이 잔향만. 거대한 건물의 심장(마디당 한 번), 콘트라베이스 숨
    tr["echo"].cc(bar_t(35), CH["echo"][0], 91, 127)
    melody(35, "echo", 34, delay=EIGHTH)
    for b in range(35, 45):
        tr["drums"].note(bar_t(b), 9, 35, EIGHTH, 110)               # Acoustic Bass Drum
        tr["drums"].note(bar_t(b) + EIGHTH, 9, 35, EIGHTH, 70)
    for b in range(35, 45, 2):                                      # 숨: 2마디마다 부풀었다 꺼진다
        tr["bass"].note(bar_t(b), CH["bass"][0], N["C2"], 2 * BAR - 20, 70)
        tr["bass"].ramp(CH["bass"][0], 11, bar_t(b), bar_t(b + 1), 20, 120, steps=12)
        tr["bass"].ramp(CH["bass"][0], 11, bar_t(b + 1), bar_t(b + 2) - 30, 120, 10, steps=12)

    body = cond.encode() + b"".join(tr[k].encode() for k in CH)
    header = b"MThd" + struct.pack(">IHHH", 6, 1, 1 + len(CH), PPQ)
    return header + body


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "wb") as f:
        f.write(build())
    secs = TOTAL_BARS * 3 * 60 / QUARTER_BPM
    print(f"{os.path.normpath(OUT)}  |  {TOTAL_BARS} bars (6/8)  |  {int(secs // 60)}:{secs % 60:04.1f}")
