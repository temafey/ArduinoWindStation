"""Раздача для телефона и планшета: страница-установщик, интерфейс и лента обновлений.

Обычный http.server плюс один адрес — /feed/events. Это поток Server-Sent Events:
приложение на телефоне держит его открытым, а сервер пишет в него строку
`event: update`, как только в ленте появился новый latest.json. Так обновление
не ждёт очередного опроса, а приходит сразу, как только его опубликовал хук.

Запуск: python -I serve-phone.py <порт> <папка раздачи>   (зовёт serve-phone.ps1)
"""
import os
import sys
import time
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

PORT = int(sys.argv[1]) if len(sys.argv) > 1 else 8765
ROOT = os.path.abspath(sys.argv[2]) if len(sys.argv) > 2 else os.getcwd()
LATEST = os.path.join(ROOT, "feed", "latest.json")


def stamp():
    """Что считать «изменилось»: время и размер latest.json (его пишут последним)."""
    try:
        st = os.stat(LATEST)
        return (st.st_mtime_ns, st.st_size)
    except OSError:
        return None


class Handler(SimpleHTTPRequestHandler):
    def log_message(self, fmt, *args):
        # Окно сервера строками не зарастает: пишем в serve.log (кто что запросил),
        # чтобы можно было проверить, дошло ли обновление до устройства.
        try:
            line = "%s  %s  %s" % (time.strftime("%Y-%m-%d %H:%M:%S"), self.client_address[0], fmt % args)
            with open(os.path.join(ROOT, "..", "serve.log"), "a", encoding="utf-8") as f:
                f.write(line + chr(10))
        except Exception:
            pass

    def end_headers(self):
        # Ленту и интерфейс нельзя кэшировать, иначе «новое» окажется старым.
        self.send_header("Cache-Control", "no-store")
        super().end_headers()

    # Старый адрес оставлен: ссылки на него уже разосланы.
    SETUP_PATHS = ("/Kiwi_Drop.exe", "/Weathered_Kiwi-Setup.exe")

    def setup_file(self):
        """Самый новый установщик Windows из ../dist: версия — из имени файла."""
        import glob, re
        best, bv = None, (-1, -1, -1)
        # Kiwi_Drop-* — новое имя; старые Weathered_Kiwi-Setup-* тоже годятся.
        files = glob.glob(os.path.join(ROOT, "..", "dist", "Kiwi_Drop-*.exe")) + glob.glob(os.path.join(ROOT, "..", "dist", "Weathered_Kiwi-Setup-*.exe"))
        for f in files:
            m = re.search(r"-(\d+)\.(\d+)\.(\d+)\.exe$", f)
            if m and tuple(map(int, m.groups())) > bv:
                best, bv = f, tuple(map(int, m.groups()))
        return best

    APK_PATH = "/Weathered_Kiwi.apk"

    def apk_file(self):
        """APK прямо из android/out: копия в site/ устаревала после каждой пересборки."""
        f = os.path.join(ROOT, "..", "android", "out", "Weathered_Kiwi.apk")
        return f if os.path.isfile(f) else None

    def do_HEAD(self):
        if self.path.split("?")[0] in self.SETUP_PATHS:
            return self.send_setup(head=True)
        if self.path.split("?")[0] == self.APK_PATH:
            return self.send_setup(head=True, f=self.apk_file(), ctype="application/vnd.android.package-archive")
        return super().do_HEAD()

    def do_GET(self):
        path = self.path.split("?")[0]
        if path == "/feed/events":
            return self.events()
        if path in self.SETUP_PATHS:
            return self.send_setup()
        if path == self.APK_PATH:
            return self.send_setup(f=self.apk_file(), ctype="application/vnd.android.package-archive")
        return super().do_GET()

    def send_setup(self, head=False, f=None, ctype="application/octet-stream"):
        f = f or (self.setup_file() if self.path.split("?")[0] in self.SETUP_PATHS else None)
        if not f:
            self.send_error(404, "installer not built")
            return
        self.send_response(200)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(os.path.getsize(f)))
        self.send_header("Content-Disposition", 'attachment; filename="%s"' % os.path.basename(f))
        super(SimpleHTTPRequestHandler, self).end_headers()
        if head:
            return
        try:
            with open(f, "rb") as fh:
                while True:
                    chunk = fh.read(1 << 16)
                    if not chunk:
                        break
                    self.wfile.write(chunk)
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return

    def events(self):
        self.send_response(200)
        self.send_header("Content-Type", "text/event-stream")
        self.send_header("X-Accel-Buffering", "no")
        self.send_header("Connection", "keep-alive")
        super(SimpleHTTPRequestHandler, self).end_headers()
        last, idle = stamp(), 0.0
        try:
            self.wfile.write(b"retry: 3000\n\nevent: hello\ndata: ok\n\n")
            self.wfile.flush()
            while True:
                time.sleep(0.5)
                now = stamp()
                if now != last:
                    last = now
                    self.wfile.write(b"event: update\ndata: new\n\n")
                    self.wfile.flush()
                    idle = 0.0
                    continue
                idle += 0.5
                if idle >= 15:  # живой ли клиент: оборванный сокет даст ошибку записи
                    self.wfile.write(b": keepalive\n\n")
                    self.wfile.flush()
                    idle = 0.0
        except (BrokenPipeError, ConnectionResetError, ConnectionAbortedError, OSError):
            return


if __name__ == "__main__":
    srv = ThreadingHTTPServer(("0.0.0.0", PORT), partial(Handler, directory=ROOT))
    srv.daemon_threads = True
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass
