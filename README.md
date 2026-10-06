# SECOND NATURE (세컨드 네이처)

![SECOND NATURE 로고 시안](assets/brand/second_nature_logo.svg)

> **태어난 모습이 당신의 최종 형태일 필요는 없습니다.**

2009년 추수감사절 다음 날 새벽, 8년 전 문을 닫은 의료 연구단지의 공중전화에서 911 신고가 걸려 온다.
"도와주세요. 여기서 나가고 싶어요. 집에 가고 싶어요."
출동한 구급대원은 그곳에서 이 시설에서 유일하게 멀쩡해 보이는 여자아이, 우나를 만난다.
우나는 말하고, 겁먹고, 농담한다. 그런데 물을 마시지 않고, 잠을 자지 않고, 청진기를 대도 아무 소리가 나지 않는다.
그리고 이 건물은 누구도 나가게 두지 않는다. **건물이 괴물이기 때문이다.**

- 장르: 1인칭 챕터제 호러 (5챕터)
- 배경: 미국 애팔래치아의 가상 마을 매로우 크릭 / 게임 언어: 한국어
- 그래픽: 발디의 수학교실 시절의 레트로 3D (빌보드 스프라이트, 저해상도 텍스처)
- 핵심: 건물의 심장 박동에 맞춰 걷는 **박동 은신**, 우나의 손을 잡고 숨는 **동반자 시스템**, 구급 장비로 건물을 진찰하기
- 엔진: TypeScript + Three.js + Web Audio API
- 상태: **기획 단계 (v0.3)**

## 설계 문서

전체 설계는 [`docs/design/00_INDEX.md`](docs/design/00_INDEX.md)에서 시작한다.
대설계 → 중설계 → 소설계의 트리 구조로 되어 있다.

| 문서 | 내용 |
|------|------|
| [01_CONCEPT](docs/design/01_CONCEPT.md) | 컨셉, 핵심 기둥, 이름, 로고, 톤·윤리 원칙, 원안과 확장 |
| [02_WORLD](docs/design/02_WORLD.md) | 핵심 공포와 현실의 뿌리, 세계의 규칙, 장소, 회사, 실험 연대기, 연표 |
| [03_CHARACTERS](docs/design/03_CHARACTERS.md) | 우나, 인물, 크리처 도감 |
| [04_GAMEPLAY](docs/design/04_GAMEPLAY.md) | 게임 시스템 |
| [05_CHAPTERS](docs/design/05_CHAPTERS.md) | 챕터 1~5, 엔딩 |
| [06_ART](docs/design/06_ART.md) | 아트 바이블, 흉터 없는 몸의 시각 규칙 |
| [07_AUDIO](docs/design/07_AUDIO.md) | 사운드·음악 바이블, 메인 테마 악보 |
| [08_PRODUCTION](docs/design/08_PRODUCTION.md) | 기술, 마일스톤 |

## 산출물 다시 만들기

```bash
python3 tools/brand/make_logo.py          # → assets/brand/second_nature_logo.svg
python3 tools/audio/make_theme_sketch.py  # → assets/audio/sketch/whatever_you_become_sketch.mid
```

두 스크립트 모두 파이썬 표준 라이브러리만 쓴다.
