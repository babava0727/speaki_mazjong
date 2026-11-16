# 개발용 로컬 서버: 브라우저가 예전 파일을 캐시해 두지 않도록 매번 새로 받게 한다
# 사용: python serve.py [포트] [폴더]   예) python serve.py 8126 dist  (빌드 결과 확인)
import sys
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


class NoCacheHandler(SimpleHTTPRequestHandler):
    def end_headers(self):
        self.send_header('Cache-Control', 'no-cache, no-store, must-revalidate')
        super().end_headers()


port = int(sys.argv[1]) if len(sys.argv) > 1 else 8123
folder = sys.argv[2] if len(sys.argv) > 2 else '.'
ThreadingHTTPServer(('', port), partial(NoCacheHandler, directory=folder)).serve_forever()
