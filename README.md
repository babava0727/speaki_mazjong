# SPK 마작

스피키와 1:1로 두는 3D 1인칭 리치 마작 웹게임입니다.
손으로 패를 집어 버리고, 패산에서 직접 패를 뽑고, 쯔모하면 손패를 쓸어 넘어뜨립니다.

- 난이도: 쉬움 · 보통 · 어려움 · 신역
- 길이: 동풍전 · 반장전
- 업적과 업적 보상(버터의 도움, 뽑은 패 확인하기, 테이블 내려치기·뒤집기, 점봉 던지기)

## 플레이

마우스로 하는 게임이라 PC 브라우저(Chrome, Edge 등)를 권장합니다.

## 내 컴퓨터에서 실행

```
python serve.py
```

그다음 브라우저에서 `http://localhost:8123` 을 엽니다. (Windows에서는 `start.bat`을 실행해도 됩니다.)
`index.html`을 더블클릭해서 여는 방식은 브라우저 보안 정책 때문에 동작하지 않습니다.

## 빌드와 배포

```
python build.py
```

`dist/` 폴더와 `spk-mahjong-web.zip`이 만들어집니다. 자세한 배포 방법은 [배포_안내.md](배포_안내.md)를 보세요.
이 저장소는 `main` 브랜치에 올리면 GitHub Actions가 자동으로 빌드해서 GitHub Pages에 게시합니다.

## 구성

- `index.html`, `style.css`, `js/` — 게임 코드(빌드 도구 없이 바로 실행되는 ES 모듈)
- `vendor/three/` — three.js r170 (MIT)
- `fonts/` — MonaS12(화면 글꼴), Noto Serif JP 일부 글자(패 한자, SIL OFL)
- `image/`, `audio/`, `models/` — 그림, 배경음·효과음·음성, 손 모델
