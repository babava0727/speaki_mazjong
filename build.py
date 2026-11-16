# 배포용 빌드: 게임에 필요한 파일만 dist/에 모으고, 올리기 쉬운 zip(spk-mahjong-web.zip)도 만든다
# 사용: python build.py
# - 원본 글꼴(ttf), 개발용 파일(serve.py, start.bat, .claude 등)은 넣지 않는다
# - 게임을 고쳐 다시 올렸을 때 브라우저가 예전 스크립트를 섞어 쓰지 않도록 스크립트·스타일 주소에 빌드 번호를 붙인다
import re
import shutil
import time
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent
DIST = ROOT / 'dist'
ZIP = ROOT / 'spk-mahjong-web.zip'
BUILD = time.strftime('%Y%m%d%H%M%S')

# 그대로 복사할 것(폴더는 통째로)
COPY = [
    'style.css',
    'js',
    'vendor',
    'models/right.glb',
    'image',
    'audio',
    'fonts/MonaS12.woff2',
    'fonts/MonaS12-Bold.woff2',
    'fonts/NotoSerifJP-tiles.woff2',
]


def main():
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir()
    for rel in COPY:
        src, dst = ROOT / rel, DIST / rel
        if not src.exists():
            raise SystemExit(f'빠진 파일: {rel}')
        dst.parent.mkdir(parents=True, exist_ok=True)
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)

    # 빌드 번호 붙이기: index.html의 style.css·main.js, 게임 스크립트끼리의 import
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    html = html.replace('href="style.css"', f'href="style.css?v={BUILD}"')
    html = html.replace('src="js/main.js"', f'src="js/main.js?v={BUILD}"')
    (DIST / 'index.html').write_text(html, encoding='utf-8')
    for js in (DIST / 'js').glob('*.js'):
        code = js.read_text(encoding='utf-8')
        code = re.sub(r"""(from\s+|import\()(['"])(\./[\w-]+\.js)\2""", rf"\1\2\3?v={BUILD}\2", code)
        js.write_text(code, encoding='utf-8')

    # 올리기용 zip(맨 위에 index.html이 오도록)
    if ZIP.exists():
        ZIP.unlink()
    with zipfile.ZipFile(ZIP, 'w', zipfile.ZIP_DEFLATED) as z:
        for f in sorted(DIST.rglob('*')):
            if f.is_file():
                z.write(f, f.relative_to(DIST).as_posix())

    files = [f for f in DIST.rglob('*') if f.is_file()]
    size = sum(f.stat().st_size for f in files)
    print(f'빌드 {BUILD}: dist/ 파일 {len(files)}개, {size / 1e6:.1f} MB')
    print(f'zip: {ZIP.name} {ZIP.stat().st_size / 1e6:.1f} MB')


if __name__ == '__main__':
    main()
