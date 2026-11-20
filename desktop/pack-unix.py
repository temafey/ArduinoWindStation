# Сборки для macOS и Linux прямо из Windows, без Mac и без Linux.
#   python -I desktop\pack-unix.py <версия>
#
# Почему не electron-packager: на Windows он распаковывает Electron через файловую
# систему, а она теряет то, без чего программа на чужой системе не запустится, —
# права на исполнение (Linux) и символические ссылки внутри Electron.framework
# (macOS). Поэтому архив собирается из официального zip Electron запись за записью:
# права и ссылки переезжают байт в байт, добавляется только наша папка app.
#
# macOS: сборка без подписи Apple. Первый запуск — правой кнопкой → «Открыть»,
# а если система пишет «повреждено»: xattr -cr /Applications/Weathered_Kiwi.app
import io, os, pathlib, plistlib, sys, tarfile, time, zipfile

HERE = pathlib.Path(__file__).resolve().parent
ELECTRON = "33.4.11"
CACHE = pathlib.Path(os.environ["LOCALAPPDATA"]) / "electron" / "Cache"
SHELL_FILES = ["main.js", "preload.js", "updater.js", "widgets.js", "widget-preload.js",
               "widget.html", "drive-feed.json", "lan-feed.txt", "package.json",
               "app/index.html", "build/icon.png"]


def electron_zip(plat, arch):
    hits = list(CACHE.rglob(f"electron-v{ELECTRON}-{plat}-{arch}.zip"))
    if not hits:
        sys.exit(f"нет electron-v{ELECTRON}-{plat}-{arch}.zip в кэше — сначала @electron/get")
    return hits[0]


def app_files():
    for rel in SHELL_FILES:
        p = HERE / rel
        if p.exists():
            yield rel, p.read_bytes()


def mac(arch, ver, out):
    src = zipfile.ZipFile(electron_zip("darwin", arch))
    dst = zipfile.ZipFile(out, "w", zipfile.ZIP_DEFLATED)
    for zi in src.infolist():
        name = zi.filename
        if not name.startswith("Electron.app/") or name.endswith("default_app.asar"):
            continue
        data = src.read(zi)
        if name == "Electron.app/Contents/Info.plist":
            pl = plistlib.loads(data)
            pl.update(CFBundleName="Weathered_Kiwi", CFBundleDisplayName="Weathered_Kiwi",
                      CFBundleIdentifier="org.windstation.weatheredkiwi",
                      CFBundleShortVersionString=ver, CFBundleVersion=ver)
            data = plistlib.dumps(pl)
        if name.endswith("Contents/Resources/electron.icns") and (HERE / "build/icon.icns").exists():
            data = (HERE / "build/icon.icns").read_bytes()
        nz = zipfile.ZipInfo("Weathered_Kiwi.app/" + name[len("Electron.app/"):], zi.date_time)
        nz.external_attr, nz.create_system = zi.external_attr, 3   # права и ссылки как были
        dst.writestr(nz, data, zipfile.ZIP_STORED if (zi.external_attr >> 28) == 0xA else zipfile.ZIP_DEFLATED)
    now = time.localtime()[:6]
    for rel, data in app_files():
        nz = zipfile.ZipInfo("Weathered_Kiwi.app/Contents/Resources/app/" + rel, now)
        nz.external_attr, nz.create_system = 0o100644 << 16, 3
        dst.writestr(nz, data, zipfile.ZIP_DEFLATED)
    dst.close()


LINUX_RUN = """#!/bin/sh
# Запуск Weathered_Kiwi. На Ubuntu 24+ песочница Chromium без root не поднимается
# (AppArmor режет user namespaces) — тогда запускаемся без неё.
D="$(cd "$(dirname "$0")" && pwd)"
F=""
if [ "$(cat /proc/sys/kernel/apparmor_restrict_unprivileged_userns 2>/dev/null)" = "1" ] && \\
   [ ! -u "$D/chrome-sandbox" ]; then F="--no-sandbox"; fi
exec "$D/weathered_kiwi" $F "$@"
"""
LINUX_INSTALL = """#!/bin/sh
# Ярлык в меню приложений: ./install.sh
D="$(cd "$(dirname "$0")" && pwd)"
mkdir -p "$HOME/.local/share/applications"
cat > "$HOME/.local/share/applications/weathered-kiwi.desktop" <<EOF
[Desktop Entry]
Type=Application
Name=Weathered_Kiwi
Comment=Станция ветра
Exec="$D/weathered-kiwi.sh"
Icon=$D/resources/app/build/icon.png
Categories=Utility;Science;
Terminal=false
EOF
echo "Готово: Weathered_Kiwi появился в меню приложений."
"""


def linux(arch, ver, out):
    src = zipfile.ZipFile(electron_zip("linux", arch))
    top = "Weathered_Kiwi/"
    with tarfile.open(out, "w:gz") as tar:
        def add(name, data, mode):
            ti = tarfile.TarInfo(top + name)
            ti.size, ti.mode, ti.mtime = len(data), mode, int(time.time())
            tar.addfile(ti, io.BytesIO(data))
        for zi in src.infolist():
            if zi.is_dir() or zi.filename.endswith("default_app.asar"):
                continue
            mode = (zi.external_attr >> 16) & 0o7777 or 0o644
            name = "weathered_kiwi" if zi.filename == "electron" else zi.filename
            if name in ("weathered_kiwi", "chrome_crashpad_handler", "chrome-sandbox") or name.endswith(".so"):
                mode |= 0o755
            add(name, src.read(zi), mode)
        for rel, data in app_files():
            add("resources/app/" + rel, data, 0o644)
        add("weathered-kiwi.sh", LINUX_RUN.encode(), 0o755)
        add("install.sh", LINUX_INSTALL.encode(), 0o755)


if __name__ == "__main__":
    ver = sys.argv[1] if len(sys.argv) > 1 else "0.0.0"
    dist = HERE / "dist"
    dist.mkdir(exist_ok=True)
    for arch in ("arm64", "x64"):
        mac(arch, ver, dist / f"Weathered_Kiwi-mac-{arch}.zip")
        linux(arch, ver, dist / f"Weathered_Kiwi-linux-{arch}.tar.gz")
    print("ok", ver)
