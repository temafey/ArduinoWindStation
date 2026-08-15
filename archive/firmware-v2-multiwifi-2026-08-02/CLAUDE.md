# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project type

DIY hardware project, not a traditional software codebase. No package manager, no build system, no tests, no git. Three interdependent artifacts in a flat directory:

- `esp32_wind_station.ino` — Arduino/C++ firmware for ESP32 DevKit V1 (30-pin, Type-C)
- `wind-dashboard.jsx` — standalone React component, single file. Rendered two ways: (a) by the `wind-ui/` Vite app for development, (b) **embedded in the firmware** — the production build is gzipped into `esp32_wind_station/web_content.h` (generated, do not hand-edit) and served by the ESP32 itself at `/`, so any phone/tablet/laptop on the same network just opens the station's IP. After changing the dashboard run: `cd wind-ui && npm run build`, then `python esp32_wind_station/gen_web_header.py`, then recompile+flash the firmware
- `wind-station-assembly.md` — hardware assembly guide (BOM, wiring, pinout, diagnostics, Russian)

Documentation, UI strings, Serial logs and inline comments are in Russian. Keep it Russian when editing.

## Architecture — how the three files interact

Changing any of these without updating the others breaks the system. **Edit as a set, not individually.**

### Shared HTTP API contract (firmware ↔ dashboard)

Firmware exposes on port 80. Primary data channel is the SSE stream (`/api/stream`, 4 Hz); the dashboard also polls `/api/data` as heartbeat/fallback — every 5s while the stream is alive, every 1s otherwise (never faster: >1 Hz polling exhausts lwIP's 16 TCP PCBs, 60s TIME_WAIT each, because WebServer always closes connections).

- `GET /api/data` — JSON with `speed`, `direction`, `dirPresent`, `gust`, `speedMax`, `ledGreen`, `ledYellow`, `ledRed`, `ledWifi`, `ledAuto`, `battery`, `batteryPercent`, `batteryPresent`, `chargeState`, `powerSource`, `wifiRssi`, `adcError`, `hostname`, `uptime`. The dashboard treats the raw response as its `data` state — renames or type changes must happen in lockstep. The four `led*` fields are mode strings `off` / `on` / `blink` (the dashboard also normalizes booleans from pre-blink firmware); `ledAuto` stays boolean. `chargeState` is one of `absent` / `charging` / `full` / `discharging`; `powerSource` is `external` / `battery`. Both come from the TP4056 status lines on GPIO13/19, not from a voltage guess — see the CHRG/STDBY section of the assembly doc.
- `GET /api/led?auto=true|false` and `?green=…&yellow=…&red=…&wifi=…` with values `off` / `on` / `blink` (legacy `true`/`false` still parse; only effective when `auto=false`)
- `GET /api/stream` — Server-Sent Events: pushes the same JSON as `/api/data` every 250 ms over one long-lived connection (`data: {...}\n\n` frames). Single subscriber — a new connect replaces the previous one. Works because WebServer's `NetworkClient` socket is a `shared_ptr`: the firmware keeps a copy after the request ends. Old firmware returns 404 here; the dashboard falls back to polling and retries every 15s.
- `GET /api/gust` — reset peak gust
- `GET /api/wifi` — station WiFi network pool (up to 6, stored in NVS namespace `wifinets`): returns `{current, ip, max, nets:[{ssid}]}` (passwords never leave NVS). `?add=SSID&pass=…` adds/updates (joins the scan pool immediately), `?del=SSID` removes (WiFiMulti forgets it after reboot). Managed from the dashboard settings dialog
- `GET /` and hashed `/assets/*` — the embedded dashboard (gzip from PROGMEM, `Content-Encoding: gzip`), routes registered from `web_content.h`. GET only — HEAD returns 404
- All responses send `Access-Control-Allow-Origin: *`

WiFi connect logic (WiFiManager was removed to save ~82 KB flash): on boot WiFiMulti scans the NVS pool plus the WiFi-driver-stored network (migration path from the WiFiManager era) and joins the strongest; if none is in range the station opens an **open AP `WindStation-Setup`** serving the same embedded dashboard at `http://192.168.4.1` where networks can be added; loop() rescans every 30 s, joins when a known network appears, shuts the AP, and starts mDNS/OTA on first connect (`startNetworkServices()`).

Dashboard discovers firmware via mDNS (`windstation.local`) and falls back to user-entered host in a `localStorage`-backed settings dialog. When the page is served by the station itself (port 80, non-localhost) it uses `window.location.host` and ignores localStorage.

### Shared GPIO pin map (firmware ↔ assembly doc ↔ physical wiring)

The pinout table in `wind-station-assembly.md` must match the `PIN_*` macros in the firmware. Currently:

- **Analog in (ADC1 only)**: GPIO34 = wind speed, GPIO35 = wind direction, GPIO32 = battery voltage
- **Digital out (LEDs)**: GPIO17 = green (battery >60%), GPIO16 = yellow (wind >5 m/s OR battery 30–60%), GPIO4 = red (wind >15 m/s OR battery 10–30%, blinks at <10%), GPIO5 = WiFi (blinks while connecting, solid when up), GPIO18 = error (v4 moved LEDs to the ESP32 bottom pin row, breadboard cols 5–9, 220Ω resistors now on the board; was 26/27/14/25/33). GPIO4 is an ADC2 pin used here as a plain digital output (allowed — the ADC2/WiFi conflict is analog-read only). GPIO5 is a strapping pin: an LED-to-GND via 220Ω only makes it flicker briefly at boot, harmless (assigned to the WiFi LED, off until WiFi is up anyway).

**Never move analog inputs to ADC2 (GPIO 0, 2, 4, 12–15, 25–27)** — ADC2 is unusable while WiFi radio is active on ESP32. (Digital output on an ADC2 pin, like the GPIO4 LED, is fine — the restriction is on analog reads.)

### Signal math depends on external resistor values

Firmware constants and BOM resistor values must agree. Current design:

- Wind sensor divider: **10 kΩ + 5 kΩ in series (= 15 kΩ) top + 10 kΩ bottom** → `Vsensor = Vadc × 2.5` (constant `SIGNAL_DIVIDER_RATIO` in firmware, UNCHANGED — the resistor kit has no 15 kΩ, so the 15 kΩ top arm is built from 10 kΩ + 5 kΩ in series; the ratio is identical). Rationale: ESP32 ADC @ 11dB is cleanly linear only 150 mV … 2.45 V; putting the larger arm (10 kΩ + 5 kΩ = 15 kΩ) on the bottom instead of the top would give 3.0 V at full sensor output and enter the nonlinear zone, under-reading speeds >49 m/s by 5–15%.
- Battery divider: 100 kΩ + 100 kΩ → `Vbat = Vadc × 2.0` (`BATTERY_DIVIDER_RATIO`)
- Power rail: diode-OR load sharing via **two 1N5819 Schottky** + **two Mini Boost modules** (HW-085/TMF002 with MT3608 IC; #1=12V for sensor, #2=5V from battery). Rail sits at ~4.7V regardless of source. Second boost exists because AMS1117 dropout is 0.8–1.25V (not 0.3V); without boost#2 a single diode from battery would leave rail at 3.4V and ESP32 would brownout on WiFi TX.

Changing physical resistors without updating the constant produces silently wrong readings. A past version used 10k/20k with a bug of the form `(raw/4095) × 1.515 × 60` that reported speeds 1.5× too high — if you touch the ADC math, preserve the use of `analogReadMilliVolts()` (applies eFuse calibration) rather than raw `analogRead()`.

## Commands

**Build & flash firmware:**
- Arduino IDE with ESP32 Board Manager
- Board: `ESP32 Dev Module`, 115200 baud
- First flash over USB. Subsequent flashes over WiFi: `Tools → Port → Network Port → windstation`, password `<OTA-пароль>`
- WiFi SSID/password are hardcoded constants at the top of the `.ino` — edit before flashing

**Run the dashboard:**
- Single `.jsx` file, no tooling in this repo. Paste into any React project that supports JSX + ES modules (CRA, Vite, etc.) and render `<WindDashboard />`
- Default `demoMode: true` simulates plausible wind data with no ESP32 needed — useful for iterating on UI without hardware

**No build/lint/test infrastructure exists.** Don't invent commands; don't add toolchain config unless asked.

## Project state

Module is pre-assembly as of 2026-04-12. The assembly doc's BOM section is the source of truth for which parts are purchased vs. pending. Notable hardware decisions already made and reflected in code/doc:

- TP4056 + Schottky 1N5819 for load sharing (not YX-850)
- 10 kΩ bottom + **10 kΩ + 5 kΩ in series (= 15 kΩ)** top signal divider (top arm built as 10 kΩ + 5 kΩ in series — no 15 kΩ in the kit; not 20 kΩ — the older value pushed ADC into its non-linear range)
- Battery voltage monitoring on GPIO32 via 100k/100k divider
- mDNS hostname `windstation` and OTA password `<OTA-пароль>`

## Editing conventions

- Three files move together. When firmware pin/API/math changes, update the assembly doc's pinout table, BOM, and diagnostics in the same change; update dashboard fields if API shape changed.
- Assembly doc uses Mermaid diagrams for power flow and enclosure layout — keep them in sync with the BOM.
- Safety-critical sections (battery handling, boost module preset verification, polarity warnings) in the assembly doc are load-bearing; don't trim them for brevity.
