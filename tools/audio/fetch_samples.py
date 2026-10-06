#!/usr/bin/env python3
"""
VSCO 2 Community Edition(CC0 1.0)에서 챕터 1에 쓸 실제 악기 녹음만 골라
모노 MP3로 줄여 public/audio/vsco/ 에 넣고, 음높이 표 manifest.json을 만든다.

  python3 tools/audio/fetch_samples.py [작업 폴더]

- 원본: https://github.com/sgossner/VSCO-2-CE (라이선스: CC0 1.0 Universal)
- 필요: git, ffmpeg(libmp3lame), numpy
- 음높이는 파일 이름의 음 이름을 후보로 삼고, 실제 스펙트럼으로 옥타브를 검증한다
  (이 라이브러리는 악기마다 옥타브 표기 관례가 다르다).
"""
import fnmatch
import json
import math
import os
import re
import subprocess
import sys
import wave

import numpy as np

REPO = "https://github.com/sgossner/VSCO-2-CE.git"
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
OUT = os.path.join(ROOT, "public", "audio", "vsco")

# (그룹, 글롭 패턴, 최대 길이(초), 음높이 판정)
#   'sci'   파일 이름이 과학적 음이름 (가운데 C = C4)
#   'yam'   파일 이름이 야마하식 음이름 (가운데 C = C3). 스펙트럼 검증으로 확인했다
#   'piano' 업라이트 피아노의 MappingChart.txt (파일 번호 n → MIDI 21 + 2n, 044 → 108)
#   'timp'  팀파니: 주음(1,1 모드)을 스펙트럼 분석으로 잰 표
#   'peak'  가장 강한 부분음
#   'none'  음높이 없음
SELECT = [
    # 건물의 심장 — 펠트로 덮은(머플) 큰북과 손바닥으로 친 큰 북
    ("heart", "VSCO 1 Percussion/drums/bass/bdrum_muted_mp_*.wav", 2.5, "none"),
    ("heart", "VSCO 1 Percussion/drums/bass/bdrum_muted_pp_*.wav", 2.5, "none"),
    ("heart", "VSCO 1 Percussion/drums/bass/bdrum_muted_ppp_*.wav", 2.5, "none"),
    ("hand", "VSCO 1 Percussion/drums/other/ethnic/giant/hand/EthnicLargeHand_hit_pp_*.wav", 2.0, "none"),
    ("hand", "VSCO 1 Percussion/drums/other/ethnic/giant/hand/EthnicLargeHand_hit_ppp_*.wav", 2.0, "none"),
    ("bigdrum", "Percussion/BDrumNewhit_v3_rr1_Sum.wav", 5.0, "none"),
    ("bigdrum", "Percussion/BDrumNewhit_v6_rr1_Sum.wav", 5.0, "none"),
    ("bdroll", "VSCO 1 Percussion/drums/bass/bdrum_roll_quieter*.wav", 8.0, "none"),
    ("timp", "Percussion/Timpani/Timpani?_Hit_v1_rr1_Sum.wav", 4.0, "timp"),
    ("timp", "Percussion/Timpani/Timpani?_Hit_v3_rr1_Sum.wav", 4.0, "timp"),
    ("timproll", "Percussion/Timpani/Rolls/Timpani2_Roll_v3_rr1_Sum.wav", 7.0, "none"),
    ("timproll", "Percussion/Timpani/Rolls/Timpani4_Roll_v3_rr1_Sum.wav", 7.0, "none"),
    # 정상 시절의 병원 — 글로켄슈필, 하프, 실로폰, 튜블러 벨, 비브라폰
    ("glock", "Percussion/Glock/glock_medium_*.wav", 3.5, "yam"),
    ("xylo", "Percussion/Xylo/Xylo_Medium_*_ff_01_far.wav", 1.6, "yam"),
    ("tbell", "Percussion/TB_hit_*.wav", 6.0, "yam"),
    ("vibe", "Percussion/vibraring_v1_rr1.wav", 6.0, "peak"),
    ("harp", "Strings/Harp/KSHarp_*.wav", 4.0, "sci"),
    # 회진 — 마림바 저음, 펠트 피아노
    ("marimba", "Percussion/Marimba/Marimba_hit_Outrigger_*.wav", 2.5, "yam"),
    ("piano", "Keys/Upright Piano/Player_dyn1_rr1_0[0-4][02468].wav", 5.0, "piano"),
    # 건물의 숨 — 첼로와 콘트라베이스
    ("cello", "Strings/Cello Section/susvib/susvib_*_v1_1.wav", 6.0, "yam"),
    ("cbass", "Strings/Solo Contrabass/SusNV/BKCtbss_SusNV_*_v1_rr1.wav", 6.0, "yam"),
    ("violin", "Strings/Solo Violin/Arco Vib/LLVln_ArcoVib_*_p.wav", 5.0, "sci"),
    ("vtrem", "Strings/Solo Violin/Trem/LLVln_trem_*_v1_rr1.wav", 5.0, "yam"),
    # 공포의 질감 — 활로 그은 서스펜디드 심벌, 공 긁기, 배관
    ("bowcym", "Percussion/susCymb1-bow-*.wav", 8.0, "none"),
    ("gongscrape", "Percussion/gongscrape_pp.wav", 8.0, "none"),
    ("tuba", "Miscellania Raw/Misc 2/tubaMP*.wav", 6.0, "none"),
    ("bubbles", "Miscellania Raw/Misc 1/bubbles*.wav", 4.0, "none"),
    ("metal", "Miscellania Raw/Misc 1/metal_hit[1-6].wav", 2.5, "none"),
    ("glass", "Miscellania Raw/Misc 1/glass_break[1-3].wav", 3.0, "none"),
    ("chain", "Miscellania Raw/Misc 1/chain_grind.wav", 4.0, "none"),
    ("chimes", "VSCO 1 Percussion/varMetal/various/windchimes_slowDesc*.wav", 6.0, "none"),
    ("flex", "VSCO 1 Percussion/varMetal/various/flexatone_long*.wav", 4.0, "none"),
    ("vslap", "VSCO 1 Percussion/varWood/vibraslap*.wav", 2.5, "none"),
    ("wood", "VSCO 1 Percussion/varWood/wood_click_pp*.wav", 0.6, "none"),
    ("wood", "VSCO 1 Percussion/varWood/wood_click_mp*.wav", 0.6, "none"),
    ("slit", "VSCO 1 Percussion/varWood/log_drum/slitdrum0_ppp*.wav", 1.2, "none"),
    ("tri", "VSCO 1 Percussion/varMetal/triangle/3/triangle3_hit_pp*.wav", 3.0, "none"),
    ("ratchet", "VSCO 1 Percussion/varWood/ratchet*.wav", 2.0, "none"),
]

# 팀파니 다섯 대의 주음(1,1 모드) — 1 : 1.5 : 1.98 부분음 계열로 확인한 값 (MIDI)
TIMPANI_PRINCIPAL = {1: 41.46, 2: 46.84, 3: 49.5, 4: 52.42, 5: 54.55}

NOTE_RE = re.compile(r"_([A-G]#?)(-?\d)(?:_|\.)")
NAMES = {"C": 0, "C#": 1, "D": 2, "D#": 3, "E": 4, "F": 5, "F#": 6, "G": 7, "G#": 8, "A": 9, "A#": 10, "B": 11}


def sh(*args, cwd=None):
    subprocess.run(args, cwd=cwd, check=True)


def read_wav_mono(path):
    with wave.open(path, "rb") as w:
        n, ch, sw, sr = w.getnframes(), w.getnchannels(), w.getsampwidth(), w.getframerate()
        raw = w.readframes(n)
    if sw == 2:
        a = np.frombuffer(raw, dtype="<i2").astype(np.float64) / 32768
    elif sw == 3:
        b = np.frombuffer(raw, dtype=np.uint8).reshape(-1, 3)
        v = (b[:, 0].astype(np.int32) | (b[:, 1].astype(np.int32) << 8) | (b[:, 2].astype(np.int32) << 16))
        v = np.where(v >= 1 << 23, v - (1 << 24), v)
        a = v.astype(np.float64) / (1 << 23)
    elif sw == 4:
        a = np.frombuffer(raw, dtype="<i4").astype(np.float64) / (1 << 31)
    else:
        raise ValueError(f"샘플 폭 {sw} 미지원: {path}")
    a = a.reshape(-1, ch).mean(axis=1)
    return a, sr


def spectrum_peak_hz(a, sr):
    """어택 직후 구간에서 가장 강한 저역 부분음의 주파수 (정밀도 0.5Hz 수준)."""
    start = int(np.argmax(np.abs(a) > 0.05 * np.max(np.abs(a))))
    seg = a[start + int(0.05 * sr): start + int(0.05 * sr) + (1 << 15)]
    if len(seg) < 4096:
        seg = a[start: start + (1 << 15)]
    seg = seg * np.hanning(len(seg))
    n = 1 << 17
    sp = np.abs(np.fft.rfft(seg, n))
    freqs = np.fft.rfftfreq(n, 1 / sr)
    sp[freqs < 25] = 0
    sp[freqs > 5000] = 0
    return freqs, sp


def midi_of(hz):
    return 69 + 12 * math.log2(hz / 440)


def detect_root(a, sr, nominal_pc=None, nominal_midi=None):
    """파일 이름의 음 이름(음계 이름)이 있으면 옥타브만 스펙트럼으로 정한다."""
    freqs, sp = spectrum_peak_hz(a, sr)
    if nominal_pc is not None:
        best, best_score = None, -1
        for m in range(nominal_midi - 24, nominal_midi + 25, 12):
            f0 = 440 * 2 ** ((m - 69) / 12)
            if f0 < 25 or f0 > 4500:
                continue
            # 기본음과 낮은 배음 근처의 에너지 (기본음 가중)
            score = 0
            for k, wgt in ((1, 1.0), (2, 0.5), (3, 0.3)):
                band = (freqs > f0 * k * 0.97) & (freqs < f0 * k * 1.03)
                if band.any():
                    score += wgt * sp[band].max()
            # 기본음 아래 한 옥타브에 에너지가 없어야 진짜 기본음이다
            sub = (freqs > f0 * 0.485) & (freqs < f0 * 0.515)
            if sub.any() and sp[sub].max() > 0.5 * score:
                score *= 0.3
            if score > best_score:
                best, best_score = m, score
        # 정확한 음높이 (미세 조정)
        f0 = 440 * 2 ** ((best - 69) / 12)
        band = (freqs > f0 * 0.97) & (freqs < f0 * 1.03)
        fine = freqs[band][np.argmax(sp[band])] if band.any() else f0
        return round(midi_of(fine), 2)
    # 이름이 없으면 가장 강한 피크
    peak = freqs[np.argmax(sp)]
    return round(midi_of(peak), 2)


def main():
    args = [x for x in sys.argv[1:] if not x.startswith("--")]
    work = args[0] if args else os.path.join(ROOT, ".vsco-cache")
    repo = os.path.join(work, "repo")
    if not os.path.isdir(repo):
        os.makedirs(work, exist_ok=True)
        sh("git", "clone", "--depth", "1", "--filter=blob:none", "--no-checkout", REPO, repo)
    files = subprocess.run(["git", "ls-tree", "-r", "--name-only", "HEAD"], cwd=repo, capture_output=True, text=True, check=True).stdout.splitlines()

    chosen = []
    for group, pat, maxlen, mode in SELECT:
        hits = sorted(f for f in files if fnmatch.fnmatchcase(f, pat))
        if not hits:
            print(f"[경고] 없음: {pat}")
        for f in hits:
            chosen.append((group, f, maxlen, mode))
    sh("git", "checkout", "HEAD", "--", *[c[1] for c in chosen], cwd=repo)

    os.makedirs(OUT, exist_ok=True)
    manifest = {}
    total = 0
    counters = {}
    for group, f, maxlen, mode in chosen:
        src = os.path.join(repo, f)
        a, sr = read_wav_mono(src)
        root = None
        m = NOTE_RE.search(os.path.basename(f))
        if mode in ("sci", "yam") and m:
            pc = NAMES[m.group(1)]
            nominal = 12 * (int(m.group(2)) + 1) + pc + (12 if mode == "yam" else 0)
            det = detect_root(a, sr, pc, nominal)
            # 옥타브는 이름을 믿고, 미세 음정(녹음 당시의 조율)만 스펙트럼에서 가져온다
            frac = det - round(det)
            root = round(nominal + frac, 2) if (round(det) - nominal) % 12 == 0 else nominal
        elif mode == "piano":
            n = int(re.search(r"_(\d{3})\.wav$", f).group(1))
            root = 108 if n >= 44 else 21 + 2 * n
        elif mode == "timp":
            k = int(re.search(r"Timpani(\d)_", f).group(1))
            root = TIMPANI_PRINCIPAL[k]
        elif mode == "peak":
            root = detect_root(a, sr)
        idx = counters.get(group, 0)
        counters[group] = idx + 1
        name = f"{group}_{idx:02d}"
        dst = os.path.join(OUT, name + ".mp3")
        # 앞 무음 제거, 최대 길이, 끝 페이드, 모노, 정규화(-1dB 피크)
        peak = float(np.max(np.abs(a))) or 1.0
        gain_db = -1.0 - 20 * math.log10(peak)
        fade = min(0.6, maxlen * 0.25)
        af = (
            f"volume={gain_db:.2f}dB,silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.002,"
            f"atrim=0:{maxlen},afade=t=out:st={maxlen - fade}:d={fade}"
        )
        if not os.path.exists(dst) or "--force" in sys.argv:
            sh("ffmpeg", "-loglevel", "error", "-y", "-i", src, "-ac", "1", "-ar", "44100", "-af", af,
               "-c:a", "libmp3lame", "-q:a", "4", dst)
        size = os.path.getsize(dst)
        total += size
        entry = {"src": f, "group": group}
        if root is not None:
            entry["root"] = root
        manifest[name] = entry
        print(f"{name:14s} root={root!s:7s} {size/1024:6.1f}KB  {f}")

    with open(os.path.join(OUT, "manifest.json"), "w", encoding="utf-8") as fp:
        json.dump(manifest, fp, ensure_ascii=False, indent=1)
    with open(os.path.join(OUT, "LICENSE.txt"), "w", encoding="utf-8") as fp:
        fp.write(
            "These samples are excerpts from VS Chamber Orchestra: Community Edition (VSCO 2 CE)\n"
            "by Versilian Studios — recorded by Sam Gossner & Simon Dalzell, sample cutting by Elan Hickler/Soundemote.\n"
            "Source: https://github.com/sgossner/VSCO-2-CE\n"
            "License: CC0 1.0 Universal (public domain dedication).\n"
            "Converted to mono MP3, trimmed and normalized by tools/audio/fetch_samples.py.\n"
        )
    print(f"\n총 {len(manifest)}개, {total/1024/1024:.2f}MB → {OUT}")


if __name__ == "__main__":
    main()
