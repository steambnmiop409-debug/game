#!/usr/bin/env python3
"""『SECOND NATURE (세컨드 네이처)』 로고 시안 생성기.

설계 문서: docs/design/01_CONCEPT.md  B3
출력: assets/brand/second_nature_logo.svg

- 땅 위: 깨끗한 의료 기업의 얼굴. 5x7 비트맵 워드마크 'SECOND NATURE', 'U' 화분에서 자란 새싹, 슬로건.
- 땅 아래: 새싹의 뿌리가 글자 아래 전체로 퍼진다. 깊어질수록 흙빛에서 살빛으로 바뀌고,
  가장 깊은 뿌리 끝은 작은 손 모양이다. (건물 지하의 잔여체)
- 뿌리 모양은 고정 시드(1987)로 만든다. 다시 실행해도 같은 그림이 나온다.
"""
import os
import random

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "brand", "second_nature_logo.svg")

# ── 5x7 라틴 비트맵 ───────────────────────────────────────────────────────
LATIN = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "B": ["####.", "#...#", "#...#", "####.", "#...#", "#...#", "####."],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "7": ["#####", "....#", "...#.", "..#..", ".#...", ".#...", ".#..."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    "1": ["..#..", ".##..", "..#..", "..#..", "..#..", "..#..", ".###."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
}

HAND = [  # 뿌리 끝의 작은 손 (손바닥이 위, 손가락이 아래)
    "..###..",
    ".#####.",
    ".#.#.#.",
    ".#.#.#.",
    ".#...#.",
]

W, H = 1000, 680
GROUND = 330
SKY, SOIL = "#F3F6F4", "#191314"
MINT, MINT_DK = "#3E9E86", "#24614F"
INK = "#2E2A28"


def bitmap(rows, x, y, px, fill, extra=""):
    out = []
    for r, row in enumerate(rows):
        for c, cell in enumerate(row):
            if cell == "#":
                out.append(f'<rect x="{x + c * px:.1f}" y="{y + r * px:.1f}" width="{px}" height="{px}" '
                           f'fill="{fill}"{extra}/>')
    return out


def latin(text, x, y, px, fill, extra=""):
    out = []
    for i, ch in enumerate(text):
        out += bitmap(LATIN[ch], x + i * 6 * px, y, px, fill, extra)
    return out


def latin_width(text, px):
    return len(text) * 6 * px - px


def lerp_color(a, b, t):
    a = [int(a[i:i + 2], 16) for i in (1, 3, 5)]
    b = [int(b[i:i + 2], 16) for i in (1, 3, 5)]
    return "#" + "".join(f"{int(x + (y - x) * t):02x}" for x, y in zip(a, b))


def root_color(y):
    t = min(1.0, max(0.0, (y - GROUND) / (H - GROUND)))
    return lerp_color("#5B3B2E", "#D9A3A0", t ** 0.8)


def grow_roots(rng, x, y, thick, depth, out, hands):
    """뿌리 하나를 아래로 자라게 한다. 픽셀 블록 6px."""
    P = 6
    bias = rng.uniform(-0.7, 0.7)
    steps = rng.randint(22, 44) - depth * 6
    for _ in range(max(8, steps)):
        y += P
        x += round(bias + rng.uniform(-1.1, 1.1)) * P
        x = min(W - 30, max(30, x))
        if y > H - 18:
            break
        col = root_color(y)
        for k in range(thick):
            out.append(f'<rect x="{x + k * P}" y="{y}" width="{P}" height="{P}" fill="{col}"/>')
        if rng.random() < 0.05 and thick > 1:  # 혹처럼 부푼 마디
            out.append(f'<rect x="{x - P}" y="{y - P}" width="{P * (thick + 2)}" height="{P * 2}" fill="{col}"/>')
        if depth < 3 and rng.random() < 0.10:
            grow_roots(rng, x, y, max(1, thick - 1), depth + 1, out, hands)
    if thick == 1 and y > GROUND + 170 and rng.random() < 0.6:
        hands.append((x - 9, y))


def build():
    rng = random.Random(1987)
    p = [f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
         f'shape-rendering="crispEdges">',
         "<title>SECOND NATURE (세컨드 네이처) — 로고 시안</title>"]

    # 땅 위: 의료 차트 같은 모눈
    p.append(f'<rect x="0" y="0" width="{W}" height="{GROUND}" fill="{SKY}"/>')
    for gx in range(0, W, 20):
        p.append(f'<rect x="{gx}" y="0" width="1" height="{GROUND}" fill="#E2EAE6"/>')
    for gy in range(0, GROUND, 20):
        p.append(f'<rect x="0" y="{gy}" width="{W}" height="1" fill="#E2EAE6"/>')

    # 땅 아래
    p.append(f'<rect x="0" y="{GROUND}" width="{W}" height="{H - GROUND}" fill="{SOIL}"/>')

    # 뿌리 (먼저 그려서 지면선이 위를 덮게 한다)
    # 워드마크 위치 (5x7 비트맵, 픽셀 11)
    word, wpx = "SECOND NATURE", 11
    wx = (W - latin_width(word, wpx)) // 2
    wy = 96
    u_x = wx + word.index("U") * 6 * wpx          # 'U' = 새싹을 심은 화분
    sprout_x = u_x + 2 * wpx + (wpx - 6) // 2      # U 안쪽 가운데 (줄기 폭 6px)

    # 뿌리 (먼저 그려서 지면선이 위를 덮게 한다)
    roots, hands = [], []
    grow_roots(rng, sprout_x, GROUND, 3, 0, roots, hands)              # 새싹의 원뿌리
    for sx in (wx + 30, wx + 3 * 6 * wpx, wx + 8 * 6 * wpx):          # 글자들 밑의 뿌리
        grow_roots(rng, sx, GROUND, 2, 1, roots, hands)
    for _ in range(5):                                                 # 가는 잔뿌리
        grow_roots(rng, rng.randint(80, W - 80), GROUND, 1, 2, roots, hands)
    p += roots
    for hx, hy in hands[:9]:
        p += bitmap(HAND, hx, hy, 3, "#F0C8C0")

    p.append(f'<rect x="0" y="{GROUND - 2}" width="{W}" height="4" fill="{INK}"/>')

    # 워드마크 (그림자 → 본체)
    p += latin(word, wx + 5, wy + 5, wpx, MINT_DK)
    p += latin(word, wx, wy, wpx, MINT)

    # 새싹 ('U' 화분 속에서 위로)
    stem_top = wy - 44
    for yy in range(stem_top, wy + 2 * wpx, 6):
        p.append(f'<rect x="{sprout_x}" y="{yy}" width="6" height="6" fill="#4E9A3F"/>')
    leaf_l = ["..####", ".#####", "######", ".####."]
    leaf_r = ["####..", "#####.", "######", ".####."]
    p += bitmap(leaf_l, sprout_x - 36, stem_top - 22, 6, "#6CCB5F")
    p += bitmap(leaf_r, sprout_x + 6, stem_top - 16, 6, "#6CCB5F")

    # 회사 표기, 한국어 제목, 슬로건
    tag = "BIOMEDICAL  EST. 1974"
    p += latin(tag, (W - latin_width(tag, 4)) // 2, 196, 4, INK)
    font = ("font-family=\"Galmuri11, NeoDunggeunmo, 'Noto Sans KR', 'Malgun Gothic', "
            "'Apple SD Gothic Neo', sans-serif\" shape-rendering=\"auto\"")
    p.append(f'<text x="{W // 2}" y="262" text-anchor="middle" fill="{INK}" font-size="30" '
             f'font-weight="bold" letter-spacing="8" {font}>세컨드 네이처</text>')
    p.append(f'<text x="{W // 2}" y="304" text-anchor="middle" fill="#5A5F5C" font-size="18" {font}>'
             f'태어난 모습이 당신의 최종 형태일 필요는 없습니다.</text>')

    # 땅 아래 구석의 대상 번호
    p.append(f'<rect x="18" y="{H - 40}" width="66" height="30" fill="{SOIL}"/>')
    p += latin("1-01", 26, H - 34, 3, "#8A7476")

    p.append("</svg>")
    return "\n".join(p)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(build())
    print(os.path.normpath(OUT))
