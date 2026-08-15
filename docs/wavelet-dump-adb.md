# Wavelet — Enable Enhanced Session Detection (DUMP permission) via PC ADB

**Device:** OnePlus Pad 3 (OxygenOS / Android 15)
**App package:** `com.pittvandewitt.wavelet`
**Goal:** Grant `android.permission.DUMP` so Wavelet's enhanced session detection can read audio sessions system-wide.

## 1. Prerequisites — on the tablet
- Settings → About device → tap **Build number** 7× → Developer options unlocked
- Developer options → enable **USB debugging**
- If present, also enable **USB debugging (Security settings)** — some OxygenOS builds require it for `pm grant` to actually apply

## 2. Prerequisites — on the PC
- Install Android **platform-tools** (adb)
  - Windows: download platform-tools, add folder to PATH
  - macOS: `brew install android-platform-tools`
  - Linux: distro package (e.g. `sudo apt install android-tools-adb`)
- Connect the Pad 3 via USB-C
- On the tablet, accept the **Allow USB debugging** prompt

## 3. Verify the connection
```
adb devices
```
Expect exactly one entry ending in `device` (not `unauthorized` / `offline`).

## 4. Grant the permission — single line
```
adb shell pm grant com.pittvandewitt.wavelet android.permission.DUMP
```
No output = success.

## 5. Verify it was granted
```
adb shell dumpsys package com.pittvandewitt.wavelet | grep DUMP
```
Expect: `android.permission.DUMP: granted=true`

## 6. Enable in app
Wavelet → Settings → turn on **Enhanced session detection**.

## Troubleshooting
| Error | Cause | Fix |
|---|---|---|
| `Error: no permission specified` | command split across two lines | run it as ONE line |
| `... has not requested permission android.permission.DUMP` | outdated app | update Wavelet from Play Store, retry |
| `SecurityException: Neither user 2000 nor current process has GRANT_RUNTIME_PERMISSIONS` | on-device shell lacks privilege on some OEM builds | grant from a real PC ADB session; enable "USB debugging (Security settings)"; or use Shizuku |

## Notes
- Grant persists across reboots. If detection drops, just re-run the `pm grant` command.
- The `adb shell` prefix is only for PC. From an on-device shell (LADB) use the bare `pm grant com.pittvandewitt.wavelet android.permission.DUMP`.

---

## Дополнительно (проверено)
- `android.permission.DUMP` имеет уровень `signature|privileged|development`. Именно флаг **`development`** позволяет выдавать её через `adb shell pm grant` — это штатный механизм, а не обход.
- Перед grant убедись, что приложение вообще объявило permission:
  ```
  adb shell dumpsys package com.pittvandewitt.wavelet | grep -i dump
  ```
  Если в `requested permissions` нет DUMP → это случай «outdated app» (обнови из Play Store).
- На некоторых сборках помогает явное указание пользователя:
  ```
  adb shell pm grant --user 0 com.pittvandewitt.wavelet android.permission.DUMP
  ```
- Альтернатива без ПК целиком: **Shizuku + LADB** прямо на планшете (bare `pm grant …`).
