# OFF-KEY : 틀린 음의 아이

![OFF-KEY 로고 시안](assets/brand/offkey_logo.svg)

> **박자 안에 숨고, 소리로 맞서는 레트로 음악학교 호러.**

1996년 겨울, 어린이 음악원 *알레그레토 꼬마 음악원*의 생방송 발표회 도중 아이와 관객 440명이 '소리'가 되어 사라졌다.
10년 뒤, 그 학교에서 "음이 낮다"는 이유로 쫓겨났던 단 한 명의 아이가 피아노 조율사가 되어 돌아온다.

- 장르: 1인칭 챕터제 호러 (5챕터)
- 그래픽: 발디의 수학교실 시절의 레트로 3D (빌보드 스프라이트, 저해상도 텍스처)
- 핵심: 박자에 맞춰 걸어 발소리를 숨기는 **박자 은신**, 소리를 녹음하고 비트는 **공명기**
- 상태: **기획 단계**

## 설계 문서

전체 설계는 [`docs/design/00_INDEX.md`](docs/design/00_INDEX.md)에서 시작한다.
대설계 → 중설계 → 소설계의 트리 구조로 되어 있다.

| 문서 | 내용 |
|------|------|
| [01_CONCEPT](docs/design/01_CONCEPT.md) | 컨셉, 핵심 기둥, 이름, 로고, 차별화 |
| [02_WORLD](docs/design/02_WORLD.md) | 세계관, 세계의 규칙, 장소, 연표, 미스터리 |
| [03_CHARACTERS](docs/design/03_CHARACTERS.md) | 인물, 크리처 도감 |
| [04_GAMEPLAY](docs/design/04_GAMEPLAY.md) | 게임 시스템 |
| [05_CHAPTERS](docs/design/05_CHAPTERS.md) | 챕터 1~5, 엔딩 |
| [06_ART](docs/design/06_ART.md) | 아트 바이블 |
| [07_AUDIO](docs/design/07_AUDIO.md) | 사운드·음악 바이블, 메인 테마 악보 |
| [08_PRODUCTION](docs/design/08_PRODUCTION.md) | 기술, 마일스톤 |

## 산출물 다시 만들기

```bash
python3 tools/brand/make_logo.py          # → assets/brand/offkey_logo.svg
python3 tools/audio/make_theme_sketch.py  # → assets/audio/sketch/lesson49_sketch.mid
```

두 스크립트 모두 파이썬 표준 라이브러리만 쓴다.
