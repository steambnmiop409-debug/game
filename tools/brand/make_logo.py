#!/usr/bin/env python3
"""OFF-KEY 로고 시안 생성기 (실로폰 워드마크).

설계 문서: docs/design/01_CONCEPT.md  B3
출력: assets/brand/offkey_logo.svg

- 7개의 장난감 실로폰 음판 위에 O F F - K E Y 를 5x7 픽셀 글자로 올린다.
- 음판은 왼쪽(긴 = 낮은 음)에서 오른쪽(짧은 = 높은 음)으로 짧아진다.
- 레일은 실제 실로폰처럼 음판 길이의 약 22.4% 지점(진동 마디)을 지난다.
- 하이픈 음판(4번째, 건반 49)은 못 하나에만 걸려 기울어 매달려 있다.
"""
import math
import os

OUT = os.path.join(os.path.dirname(__file__), "..", "..", "assets", "brand", "offkey_logo.svg")

# ── 5x7 픽셀 폰트 (필요한 글자만) ─────────────────────────────────────────
FONT = {
    "A": [".###.", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "C": [".###.", "#...#", "#....", "#....", "#....", "#...#", ".###."],
    "D": ["####.", "#...#", "#...#", "#...#", "#...#", "#...#", "####."],
    "E": ["#####", "#....", "#....", "####.", "#....", "#....", "#####"],
    "F": ["#####", "#....", "#....", "####.", "#....", "#....", "#...."],
    "H": ["#...#", "#...#", "#...#", "#####", "#...#", "#...#", "#...#"],
    "I": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "#####"],
    "K": ["#...#", "#..#.", "#.#..", "##...", "#.#..", "#..#.", "#...#"],
    "L": ["#....", "#....", "#....", "#....", "#....", "#....", "#####"],
    "M": ["#...#", "##.##", "#.#.#", "#.#.#", "#...#", "#...#", "#...#"],
    "N": ["#...#", "#...#", "##..#", "#.#.#", "#..##", "#...#", "#...#"],
    "O": [".###.", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "R": ["####.", "#...#", "#...#", "####.", "#.#..", "#..#.", "#...#"],
    "S": [".####", "#....", "#....", ".###.", "....#", "....#", "####."],
    "T": ["#####", "..#..", "..#..", "..#..", "..#..", "..#..", "..#.."],
    "U": ["#...#", "#...#", "#...#", "#...#", "#...#", "#...#", ".###."],
    "V": ["#...#", "#...#", "#...#", "#...#", "#...#", ".#.#.", "..#.."],
    "Y": ["#...#", "#...#", ".#.#.", "..#..", "..#..", "..#..", "..#.."],
    "-": [".....", ".....", ".....", "#####", ".....", ".....", "....."],
    ".": [".....", ".....", ".....", ".....", ".....", ".##..", ".##.."],
    "=": [".....", ".....", "#####", ".....", "#####", ".....", "....."],
    "?": [".###.", "#...#", "....#", "...#.", "..#..", ".....", "..#.."],
    "0": [".###.", "#...#", "#..##", "#.#.#", "##..#", "#...#", ".###."],
    "4": ["...#.", "..##.", ".#.#.", "#..#.", "#####", "...#.", "...#."],
    "9": [".###.", "#...#", "#...#", ".####", "....#", "...#.", ".##.."],
    " ": [".....", ".....", ".....", ".....", ".....", ".....", "....."],
}


def glyph_rects(ch, x, y, px, fill, extra=""):
    """글자 하나를 px 크기 정사각형 픽셀들로 그린다."""
    out = []
    for r, row in enumerate(FONT[ch]):
        for c, cell in enumerate(row):
            if cell == "#":
                out.append(
                    f'<rect x="{x + c * px:.1f}" y="{y + r * px:.1f}" '
                    f'width="{px}" height="{px}" fill="{fill}"{extra}/>'
                )
    return out


def text_rects(text, x, y, px, fill, gap=1, extra=""):
    out = []
    for i, ch in enumerate(text):
        out += glyph_rects(ch, x + i * (5 + gap) * px, y, px, fill, extra)
    return out


def text_width(text, px, gap=1):
    return len(text) * (5 + gap) * px - gap * px


def shade(hex_color, factor):
    """factor > 1 밝게, < 1 어둡게."""
    h = hex_color.lstrip("#")
    r, g, b = (int(h[i:i + 2], 16) for i in (0, 2, 4))
    if factor >= 1:
        r, g, b = (int(v + (255 - v) * (factor - 1)) for v in (r, g, b))
    else:
        r, g, b = (int(v * factor) for v in (r, g, b))
    return f"#{r:02x}{g:02x}{b:02x}"


# ── 레이아웃 ─────────────────────────────────────────────────────────────
W, H = 1000, 600
CY = 260                       # 음판 세로 중심선
BAR_W, GAP = 96, 16
X0 = 90
LETTERS = ["O", "F", "F", "-", "K", "E", "Y"]
COLORS = ["#E8382F", "#F28C28", "#F6D02F", "#9A9A9A", "#3FAE49", "#2F6FD6", "#7A3FB5"]
HEIGHTS = [300 - 14 * i for i in range(7)]   # 300 → 216
NODE = 0.224                   # 자유-자유 막대의 진동 마디 위치 (길이 대비)
LETTER_PX = 12
HYPHEN = 3                     # 건반 49 (떨어진 음판)
HANG_DEG = 22                  # 매달린 각도

BOARD = "#22382C"
RAIL = "#5A3A22"
NAIL = "#C9C9C9"
CHALK = "#EDEDE4"


def bar_cx(i):
    return X0 + i * (BAR_W + GAP) + BAR_W / 2


def node_y(i, top=True):
    off = (0.5 - NODE) * HEIGHTS[i]
    return CY - off if top else CY + off


def rail_y(x, top=True):
    """레일은 각 음판의 마디를 지나는 직선 (음판 길이가 선형으로 줄기 때문)."""
    i = (x - X0 - BAR_W / 2) / (BAR_W + GAP)
    h = 300 - 14 * i
    off = (0.5 - NODE) * h
    return CY - off if top else CY + off


def bar_shapes(i, x, y, w, h, color):
    hi, lo = shade(color, 1.3), shade(color, 0.7)
    s = [
        f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="4" fill="{color}" '
        f'stroke="#1a1a1a" stroke-width="3"/>',
        # 픽셀 베벨: 위·왼쪽 밝게, 아래·오른쪽 어둡게
        f'<rect x="{x + 6}" y="{y + 6}" width="{w - 12}" height="6" fill="{hi}"/>',
        f'<rect x="{x + 6}" y="{y + 6}" width="6" height="{h - 12}" fill="{hi}"/>',
        f'<rect x="{x + 6}" y="{y + h - 12}" width="{w - 12}" height="6" fill="{lo}"/>',
        f'<rect x="{x + w - 12}" y="{y + 6}" width="6" height="{h - 12}" fill="{lo}"/>',
    ]
    # 글자 (그림자 → 본체)
    gx = x + (w - 5 * LETTER_PX) / 2
    gy = CY - 7 * LETTER_PX / 2
    s += glyph_rects(LETTERS[i], gx + 4, gy + 4, LETTER_PX, shade(color, 0.45))
    s += glyph_rects(LETTERS[i], gx, gy, LETTER_PX, "#FFFDF5")
    return s


def nail(x, y):
    return (
        f'<circle cx="{x:.1f}" cy="{y:.1f}" r="6" fill="{NAIL}" stroke="#5e5e5e" stroke-width="2"/>'
        f'<rect x="{x - 3:.1f}" y="{y - 3:.1f}" width="2" height="2" fill="#ffffff"/>'
    )


def build():
    p = []
    p.append(
        f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {W} {H}" width="{W}" height="{H}" '
        f'shape-rendering="crispEdges">'
    )
    p.append("<title>OFF-KEY : 틀린 음의 아이 — 로고 시안</title>")

    # 칠판 배경과 나무 테
    p.append(f'<rect x="0" y="0" width="{W}" height="{H}" rx="18" fill="{RAIL}"/>')
    p.append(f'<rect x="14" y="14" width="{W - 28}" height="{H - 28}" rx="8" fill="{BOARD}"/>')
    for cx, cy, rx, ry in [(180, 120, 160, 40), (760, 90, 200, 30), (300, 520, 220, 36),
                           (820, 500, 140, 50), (520, 300, 300, 120)]:
        p.append(f'<ellipse cx="{cx}" cy="{cy}" rx="{rx}" ry="{ry}" fill="#ffffff" opacity="0.035"/>')

    # 칠판 낙서: A=440?
    p += text_rects("A=440?", 40, 40, 4, CHALK, extra=' opacity="0.5"')

    # 티코 (음판 뒤에서 얼굴을 내민다)
    wood, wood_dk, face = "#B5793F", "#5A3A22", "#E9C99A"
    p.append(f'<polygon points="872,380 972,380 948,130 896,130" fill="{wood}" '
             f'stroke="{wood_dk}" stroke-width="4"/>')
    p.append(f'<rect x="908" y="116" width="28" height="16" fill="{wood_dk}"/>')
    p.append(f'<polygon points="886,362 958,362 940,150 904,150" fill="{face}"/>')
    for ty in range(170, 350, 30):  # 옆면 빠르기 눈금
        p.append(f'<rect x="945" y="{ty}" width="8" height="3" fill="{wood_dk}"/>')
    for ex in (912, 934):  # 눈 (왼쪽, 로고 쪽을 본다)
        p.append(f'<ellipse cx="{ex}" cy="205" rx="9" ry="12" fill="#ffffff" stroke="#1a1a1a" stroke-width="2"/>')
        p.append(f'<rect x="{ex - 7}" y="203" width="6" height="8" fill="#1a1a1a"/>')
    p.append('<path d="M904 246 Q922 278 944 246 Z" fill="#1a1a1a"/>')
    p.append('<rect x="912" y="248" width="6" height="5" fill="#ffffff"/>'
             '<rect x="926" y="248" width="6" height="5" fill="#ffffff"/>')

    # 레일 (사다리꼴)
    xl, xr = X0 - 34, X0 + 7 * BAR_W + 6 * GAP + 34
    for top in (True, False):
        y1, y2 = rail_y(xl, top), rail_y(xr, top)
        p.append(
            f'<polygon points="{xl},{y1 - 11:.1f} {xr},{y2 - 11:.1f} {xr},{y2 + 11:.1f} {xl},{y1 + 11:.1f}" '
            f'fill="{RAIL}" stroke="#2e1d10" stroke-width="3"/>'
        )
        p.append(f'<line x1="{xl + 4}" y1="{y1 - 6:.1f}" x2="{xr - 4}" y2="{y2 - 6:.1f}" '
                 f'stroke="#7A5235" stroke-width="3"/>')

    # 빈 못 구멍 (떨어진 음판의 아래쪽 자리)
    hx = bar_cx(HYPHEN)
    p.append(f'<circle cx="{hx:.1f}" cy="{node_y(HYPHEN, False):.1f}" r="5" fill="#140c06"/>')

    # 음판 (하이픈 제외) + 그림자 + 못
    for i in range(7):
        if i == HYPHEN:
            continue
        x = X0 + i * (BAR_W + GAP)
        y = CY - HEIGHTS[i] / 2
        p.append(f'<rect x="{x + 7}" y="{y + 7}" width="{BAR_W}" height="{HEIGHTS[i]}" rx="4" '
                 f'fill="#000000" opacity="0.28"/>')
        p += bar_shapes(i, x, y, BAR_W, HEIGHTS[i], COLORS[i])
        p.append(nail(bar_cx(i), node_y(i, True)))
        p.append(nail(bar_cx(i), node_y(i, False)))

    # 하이픈 음판: 위쪽 못 하나에 걸려 기울어 있다. '49' 각인
    i = HYPHEN
    x = X0 + i * (BAR_W + GAP)
    y = CY - HEIGHTS[i] / 2
    pivx, pivy = bar_cx(i), node_y(i, True)
    p.append(f'<g transform="rotate({HANG_DEG} {pivx:.1f} {pivy:.1f})">')
    p.append(f'<rect x="{x + 7}" y="{y + 7}" width="{BAR_W}" height="{HEIGHTS[i]}" rx="4" '
             f'fill="#000000" opacity="0.28"/>')
    p += bar_shapes(i, x, y, BAR_W, HEIGHTS[i], COLORS[i])
    p.append(f'<circle cx="{pivx:.1f}" cy="{node_y(i, False):.1f}" r="5" fill="#3a3a3a"/>')  # 빈 구멍
    ew = text_width("49", 3)
    p += text_rects("49", pivx - ew / 2, y + HEIGHTS[i] - 52, 3, "#5c5c5c")
    p.append("</g>")
    p.append(nail(pivx, pivy))

    # 진자 막대 (로고 위로 기울어 가로지른다)
    pvx, pvy, tx, ty = 922, 345, 858, 120
    p.append(f'<line x1="{pvx}" y1="{pvy}" x2="{tx}" y2="{ty}" stroke="#2e1d10" stroke-width="6"/>')
    p.append(f'<line x1="{pvx}" y1="{pvy}" x2="{tx}" y2="{ty}" stroke="#8a6a44" stroke-width="2"/>')
    t = 0.35
    wx, wy = tx + (pvx - tx) * t, ty + (pvy - ty) * t
    ang = math.degrees(math.atan2(pvy - ty, pvx - tx)) - 90
    p.append(f'<rect x="{wx - 14:.1f}" y="{wy - 10:.1f}" width="28" height="20" fill="#C9A227" '
             f'stroke="#2e1d10" stroke-width="3" transform="rotate({ang:.1f} {wx:.1f} {wy:.1f})"/>')
    p.append(f'<circle cx="{pvx}" cy="{pvy}" r="6" fill="#2e1d10"/>')

    # 태그라인 (픽셀) + 한글 부제
    tag = "EVERY CHILD AN INSTRUMENT."
    center = X0 + (7 * BAR_W + 6 * GAP) / 2
    tw = text_width(tag, 4)
    p += text_rects(tag, center - tw / 2, 440, 4, CHALK)
    p.append(
        f'<text x="{center}" y="540" text-anchor="middle" fill="{CHALK}" font-size="36" '
        f'font-family="Galmuri11, NeoDunggeunmo, \'Noto Sans KR\', \'Malgun Gothic\', '
        f'\'Apple SD Gothic Neo\', sans-serif" letter-spacing="6" shape-rendering="auto">'
        f'틀린 음의 아이</text>'
    )

    # 말렛
    p.append('<line x1="842" y1="470" x2="975" y2="565" stroke="#3b2a1a" stroke-width="12" stroke-linecap="round"/>')
    p.append('<line x1="842" y1="470" x2="975" y2="565" stroke="#D9B382" stroke-width="7" stroke-linecap="round"/>')
    p.append('<circle cx="836" cy="465" r="22" fill="#C0262D" stroke="#1a1a1a" stroke-width="3" shape-rendering="auto"/>')
    p.append('<rect x="824" y="452" width="8" height="8" fill="#ff8a8a"/>')

    p.append("</svg>")
    return "\n".join(p)


if __name__ == "__main__":
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    with open(OUT, "w", encoding="utf-8") as f:
        f.write(build())
    print(os.path.normpath(OUT))
