// ============================================
// WIND STATION — ESP32
// ============================================
// Sensor: Polycarbonate 0-5V (speed + direction)
// Signal divider: 15kΩ top + 10kΩ bottom → 5V → 2.0V (linear ADC zone 150 mV … 2.45V)
// Battery divider: 100kΩ + 100kΩ → GPIO32
// LEDs: 5 standard through 220Ω resistors
// Power (diode-OR load sharing):
//   Adapter 5V ─► Schottky_A ─┐
//                             ├─► Rail ~4.7V ─► ESP32 VIN + Mini Boost #1 → 12V for sensor
//   Bat ─► PTC ─► TP4056 ─► Mini Boost #2 (5V) ─► Schottky_B ─┘
//   Boost #2 keeps rail at 4.7V on battery — without it AMS1117 dropout (0.8–1.25V)
//   causes ESP32 brownout on WiFi TX peaks.
//   Both boosts: Mini Boost Module (HW-085/TMF002, MT3608 IC).
// Access: http://windstation.local  (mDNS)
// OTA: flash over WiFi via Arduino IDE → Network Port
// ============================================

#include <WiFi.h>
#include <WiFiMulti.h>    // pick the strongest of several stored networks
#include <Preferences.h>  // NVS storage for the network list (/api/wifi)
#include <esp_wifi.h>     // esp_wifi_get_config — migrate the WiFiManager-era network
#include <WebServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <Ticker.h>       // boot-time WiFi LED blink while connect blocks loop()
#include "web_content.h"  // dashboard build (gzip, PROGMEM) — see gen_web_header.py
// WiFiManager dropped on purpose: its captive portal cost ~150 KB of flash and
// duplicated what the embedded dashboard already does. Setup fallback is now a
// plain SoftAP serving this same dashboard — add networks at http://192.168.4.1.

// ===== OTA SETTINGS =====
const char* hostname    = "windstation";
const char* otaPassword = "<OTA-пароль>";
const char* setupApName = "WindStation-Setup";  // open AP when no known WiFi is in range

// ===== PINS =====
#define PIN_WIND_SPEED   34   // ADC1 input-only — speed (via 15k/10k divider, Vadc 0-2.0V)
#define PIN_WIND_DIR     35   // ADC1 input-only — direction (via 15k/10k divider)
#define PIN_BATTERY      32   // ADC1 — battery (via 100k/100k divider)

// v4: LEDs moved to the ESP32 bottom pin row (breadboard cols 5-9), 220Ω resistors now on the board.
// Old top-row pins were 26/27/14/25/33. GPIO4/16/17/18 are plain GPIO; GPIO5 is a strapping pin
// (must be HIGH at boot) — an LED-to-GND via 220Ω doesn't hold it low, so it only flickers briefly
// at power-up. Harmless: assigned to WiFi LED, which is meant to be off until WiFi is up anyway.
#define PIN_LED_RED       4   // Red — wind > 15 m/s OR battery 10-30% (blink <10%) (col 5, was 14)
#define PIN_LED_YELLOW   16   // Yellow — wind > 5 m/s OR battery 30-60%            (col 6, was 27)
#define PIN_LED_GREEN    17   // Green — battery > 60% (was "station OK")           (col 7, was 26)
#define PIN_LED_WIFI      5   // Green — WiFi: blink while connecting, solid when up (col 8, was 25; strapping, boot flicker)
#define PIN_LED_ERROR    18   // Red — error (ADC/WiFi)                             (col 9, was 33)

// TP4056 status, open-drain: the IC pulls the pin to GND, so INPUT_PULLUP and LOW=active.
// GPIO13/19 chosen because neither is a strapping pin — an open-drain line held LOW at
// power-up on GPIO0/2/12/15 would change boot mode or flash voltage and brick the boot.
#define PIN_CHARGE       13   // TP4056 CHRG  — LOW while charging
#define PIN_STDBY        19   // TP4056 STDBY — LOW when charge complete (see HAS_STDBY)

// ===== CALIBRATION =====
// Signal divider: 15k top + 10k bottom → Vout = Vin × 10/(15+10) = Vin × 0.4
// Inverse: Vsensor = Vadc × (15+10)/10 = Vadc × 2.5
// Why 2.0V not 3.0V: ESP32 ADC linear zone at 11dB is 150 mV … 2.45V;
// old 10k+15k gave 3.0V and entered nonlinear zone (speeds >49 m/s were underread).
const float SIGNAL_DIVIDER_RATIO  = 2.5f;
// Battery divider 100k+100k: Vbat = Vadc × 2.0
const float BATTERY_DIVIDER_RATIO = 2.0f;

const float SENSOR_VMAX = 5.0f;    // max sensor output voltage
// NEW sensor (voltage type 0-5V, DFRobot SEN0170 clone): 0-30 m/s, speed only.
// Old sensor was 0-60 m/s — leaving 60 here doubles every reading.
const float SPEED_MAX   = 30.0f;   // m/s at 5V
const float DIR_MAX     = 360.0f;  // degrees at 5V (old sensor only, see HAS_DIRECTION)

// New sensor has no direction channel — GPIO35 hangs unconnected.
// Set to 1 only if the old speed+direction sensor is wired back.
#define HAS_DIRECTION 0

// ESP32 ADC1 @11dB cannot read below ~150 mV: with 0 V in, analogReadMilliVolts()
// bottoms out around this value. Measured on this board at 0 wind: 143-145 mV on
// both GPIO34 and GPIO35 (identical floor on both = proof it is the ADC, not signal).
// Subtracted so calm air reports 0 instead of a phantom 2.2 m/s.
// Re-measure with the sensor still and update if the board changes.
// CONSEQUENCE: real speeds below ~2.2 m/s are indistinguishable from 0 and report 0.
// That is a hardware limit of this divider + ADC, not something firmware can recover.
const float SPEED_ZERO_MV = 145.0f;

// Battery divider now taps the holder wire, not TP_B+ (TP4056 back-feeds TP_B+ from
// USB and fakes a battery). No pack wired -> node floats, R6 100k pulls it to 0.
const float BATTERY_PRESENT_MV = 500.0f;  // <0.5V on pin (=1.0V pack) means absent

const float BATTERY_MIN = 3.5f;    // 0% — below this Mini Boost #2 loses regulation (MT3608 min Vin ~2V, but margin shrinks at 3.5V), rail 4.7V sags
const float BATTERY_MAX = 4.2f;    // 100%

// Set to 1 once TP4056 STDBY is wired to PIN_STDBY. With CHRG alone "full" cannot be
// told from "running on battery": CHRG goes high-Z both when charging finishes and when
// USB is unplugged. Without STDBY we fall back to a voltage guess, which misreads a
// freshly charged pack on battery power as "full".
#define HAS_STDBY 1
#if !HAS_STDBY
const float BATTERY_FULL_V = 4.05f;  // fallback "full" threshold when HAS_STDBY is 0
#endif

// External power is derived from the two status lines rather than measured on IN+:
// the TP4056 can only pull CHRG or STDBY low while its own input is powered, so
// "either line active" == "cable plugged in". Saves a divider and an ADC pin.
// Sticky release, not a plain sample: with no pack the IC ping-pongs charge<->standby
// at ~1 Hz and both lines read inactive in the gap between the two states. Asserting
// on the first active sample but releasing only after this hold keeps the dashboard
// steady while still noticing an unplugged cable within a few seconds.
const unsigned long STATUS_HOLD_MS = 3000;

// ===== STATE =====
float windSpeed = 0;
float windDir   = 0;
float windGust  = 0;
float batteryVoltage = 0;
int   batteryPercent = 0;
bool  batteryPresent = false;
// "absent" | "charging" | "full" | "discharging" — what the dashboard shows
const char* chargeState = "absent";
// "external" | "battery" — where the rail is fed from right now
const char* powerSource = "battery";

// Debounce state for the two open-drain status lines. `seen` guards the boot window:
// millis() starts at 0, so a bare "millis() - lastLow < HOLD" would read as recently
// active for the first 3 s after reset and report a cable that is not there.
bool chrgSeen = false,  stdbySeen = false;
unsigned long chrgLastLow = 0, stdbyLastLow = 0;
int   wifiRssi  = 0;
bool  adcError  = false;

unsigned long gustResetTimer = 0;

// Ring buffer for circular mean of direction
#define DIR_BUF_SIZE 5
float dirSinBuf[DIR_BUF_SIZE] = {0};
float dirCosBuf[DIR_BUF_SIZE] = {0};
int   dirBufIdx   = 0;
int   dirBufCount = 0;

// Per-LED mode instead of plain on/off: the API accepts "off"/"on"/"blink"
// (legacy true/false still parse). Blink phase is shared and flips in
// updateLEDs() every 500 ms → 1 Hz blink, so all blinking LEDs stay in sync.
enum LedMode : uint8_t { LED_MODE_OFF = 0, LED_MODE_ON = 1, LED_MODE_BLINK = 2 };
LedMode ledGreen  = LED_MODE_OFF;
LedMode ledYellow = LED_MODE_OFF;
LedMode ledRed    = LED_MODE_OFF;
LedMode ledWifi   = LED_MODE_BLINK;  // blinking until WiFi is up
bool ledAutoMode = true;
bool blinkPhase  = false;

Ticker wifiBootBlink;

// ===== MULTI-WIFI =====
// Up to WIFI_MAX_NETS networks (home, phone hotspot, tablet, …) live in NVS and are
// managed from the dashboard via /api/wifi. On boot WiFiMulti scans and joins the
// strongest one; if nothing is in range, the WiFiManager portal takes over and the
// network entered there is added to the list too.
WiFiMulti wifiMulti;
Preferences wifiStore;   // NVS namespace "wifinets": n, s0..sN (ssid), p0..pN (pass)
const int WIFI_MAX_NETS = 6;

int loadStoredNetworks() {
  int added = 0;
  wifiStore.begin("wifinets", true);
  int n = wifiStore.getInt("n", 0);
  for (int i = 0; i < n && i < WIFI_MAX_NETS; i++) {
    String s = wifiStore.getString((String("s") + i).c_str(), "");
    String p = wifiStore.getString((String("p") + i).c_str(), "");
    if (s.length()) {
      wifiMulti.addAP(s.c_str(), p.c_str());  // addAP copies the strings
      added++;
    }
  }
  wifiStore.end();
  return added;
}

// Add or update (same SSID replaces the password). False when the list is full.
bool storeNetwork(const String& ssid, const String& pass) {
  if (!ssid.length()) return false;
  wifiStore.begin("wifinets", false);
  int n = wifiStore.getInt("n", 0);
  int slot = -1;
  for (int i = 0; i < n; i++) {
    if (wifiStore.getString((String("s") + i).c_str(), "") == ssid) { slot = i; break; }
  }
  if (slot < 0) {
    if (n >= WIFI_MAX_NETS) { wifiStore.end(); return false; }
    slot = n;
    wifiStore.putInt("n", n + 1);
  }
  wifiStore.putString((String("s") + slot).c_str(), ssid);
  wifiStore.putString((String("p") + slot).c_str(), pass);
  wifiStore.end();
  return true;
}

// Compact the list by moving the last entry into the freed slot.
// wifiMulti keeps its in-RAM copy until reboot — /api/wifi says so in the UI.
bool removeNetwork(const String& ssid) {
  wifiStore.begin("wifinets", false);
  int n = wifiStore.getInt("n", 0);
  bool found = false;
  for (int i = 0; i < n; i++) {
    if (wifiStore.getString((String("s") + i).c_str(), "") == ssid) {
      int last = n - 1;
      if (i != last) {
        wifiStore.putString((String("s") + i).c_str(), wifiStore.getString((String("s") + last).c_str(), ""));
        wifiStore.putString((String("p") + i).c_str(), wifiStore.getString((String("p") + last).c_str(), ""));
      }
      wifiStore.remove((String("s") + last).c_str());
      wifiStore.remove((String("p") + last).c_str());
      wifiStore.putInt("n", last);
      found = true;
      break;
    }
  }
  wifiStore.end();
  return found;
}

// Manual switch (/api/wifi?connect=SSID): executed from loop() a moment after the
// HTTP response is sent — switching inside the handler would kill the connection
// before the reply reaches the client.
String pendingSsid, pendingPass;
unsigned long pendingAt = 0;
bool wifiWasConnected = false;  // connect-transition detector for mDNS re-announce
unsigned long wifiLostAt = 0;   // when the connection dropped (runtime AP fallback)

// SSIDs are user input — escape the two characters that break a JSON string.
String jsonEscape(const String& s) {
  String out = s;
  out.replace("\\", "\\\\");
  out.replace("\"", "\\\"");
  return out;
}

WebServer server(80);

// ===== SENSOR READ =====
void readSensors() {
  const int SAMPLES = 10;
  uint32_t speedMvSum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    speedMvSum += analogReadMilliVolts(PIN_WIND_SPEED);
  }
  float speedMvAvg = speedMvSum / (float)SAMPLES;

  // Signal loss detector: pin pulled hard to GND for ~30 s.
  // NOTE: this can no longer catch a pulled signal wire — an open input reads the
  // same ~145 mV ADC floor as a sensor sitting at 0 V. Only a dead short shows up.
  static uint16_t zeroReadings = 0;
  if (speedMvAvg < 10.0f) {
    if (zeroReadings < 15) zeroReadings++;
  } else {
    zeroReadings = 0;
  }
  adcError = (zeroReadings >= 15);

  // Subtract the ADC floor before converting, so calm air gives a true 0.
  float speedMvNet = speedMvAvg - SPEED_ZERO_MV;
  if (speedMvNet < 0.0f) speedMvNet = 0.0f;
  float vSpeedSensor = (speedMvNet / 1000.0f) * SIGNAL_DIVIDER_RATIO;
  windSpeed = constrain(vSpeedSensor / SENSOR_VMAX * SPEED_MAX, 0.0f, SPEED_MAX);

#if HAS_DIRECTION
  uint32_t dirMvSum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    dirMvSum += analogReadMilliVolts(PIN_WIND_DIR);
  }
  float dirMvAvg   = dirMvSum / (float)SAMPLES;
  float vDirSensor = (dirMvAvg / 1000.0f) * SIGNAL_DIVIDER_RATIO;
  float dirRaw = constrain(vDirSensor / SENSOR_VMAX * DIR_MAX, 0.0f, DIR_MAX);

  // Circular mean via sin/cos to correctly handle 0°↔360° wrap
  float rad = dirRaw * DEG_TO_RAD;
  dirSinBuf[dirBufIdx] = sinf(rad);
  dirCosBuf[dirBufIdx] = cosf(rad);
  dirBufIdx = (dirBufIdx + 1) % DIR_BUF_SIZE;
  if (dirBufCount < DIR_BUF_SIZE) dirBufCount++;

  float sSum = 0, cSum = 0;
  for (int i = 0; i < dirBufCount; i++) {
    sSum += dirSinBuf[i];
    cSum += dirCosBuf[i];
  }
  float meanRad = atan2f(sSum / dirBufCount, cSum / dirBufCount);
  windDir = fmodf(meanRad * RAD_TO_DEG + 360.0f, 360.0f);
#else
  windDir = 0;   // no direction channel; API reports null, not this value
#endif

  if (windSpeed > windGust) windGust = windSpeed;
}

// ===== BATTERY READ =====
void readBattery() {
  const int SAMPLES = 10;
  uint32_t mvSum = 0;
  for (int i = 0; i < SAMPLES; i++) {
    mvSum += analogReadMilliVolts(PIN_BATTERY);
  }
  float mvAvg = mvSum / (float)SAMPLES;

  // Divider top sits on the pack's own sense wire. Pack unplugged -> the column is
  // fed only by R6 100k to GND -> a few mV -> absent. Do not report a fake voltage.
  batteryPresent = (mvAvg >= BATTERY_PRESENT_MV);
  if (!batteryPresent) {
    batteryVoltage = 0;
    batteryPercent = 0;
    return;
  }

  batteryVoltage = (mvAvg / 1000.0f) * BATTERY_DIVIDER_RATIO;

  float pct = (batteryVoltage - BATTERY_MIN) / (BATTERY_MAX - BATTERY_MIN) * 100.0f;
  batteryPercent = (int)constrain(pct, 0.0f, 100.0f);
}

// ===== CHARGER STATUS =====
// True while the line reads active, and for STATUS_HOLD_MS after it stops. Open-drain:
// LOW means the TP4056 is pulling the line, i.e. that state is on.
static bool heldLow(uint8_t pin, bool &seen, unsigned long &lastLow) {
  if (digitalRead(pin) == LOW) {
    seen = true;
    lastLow = millis();
    return true;
  }
  return seen && (millis() - lastLow < STATUS_HOLD_MS);
}

// Called every 100 ms — readBattery()'s 30 s cadence would land on a random phase of
// the ~1 Hz blink and report charge state at the flip of a coin.
void readChargeStatus() {
  // Both lines must be sampled every pass, so evaluate before combining rather than
  // letting || short-circuit the second call and stall its debounce timer.
  bool charging = heldLow(PIN_CHARGE, chrgSeen, chrgLastLow);
#if HAS_STDBY
  bool charged  = heldLow(PIN_STDBY, stdbySeen, stdbyLastLow);
#else
  bool charged  = false;
#endif

  // The IC drives these pins only when its own input is powered, so either one active
  // proves the cable is in. Both idle means the rail is coming from the pack.
  powerSource = (charging || charged) ? "external" : "battery";

  if (!batteryPresent) {
    chargeState = "absent";
  } else if (charging) {
    chargeState = "charging";
  } else if (charged) {
    chargeState = "full";
#if !HAS_STDBY
  } else if (batteryVoltage >= BATTERY_FULL_V) {
    chargeState = "full";
#endif
  } else {
    chargeState = "discharging";
  }
}

// ===== LEDs =====
static void applyLed(uint8_t pin, LedMode m) {
  bool lit = (m == LED_MODE_ON) || (m == LED_MODE_BLINK && blinkPhase);
  digitalWrite(pin, lit ? HIGH : LOW);
}

void updateLEDs() {
  bool wifiOk = (WiFi.status() == WL_CONNECTED);
  blinkPhase = !blinkPhase;  // called every 500 ms → 1 Hz blink

  if (ledAutoMode) {
    // Green — battery above 60%. Off when no pack is wired (nothing to report).
    ledGreen = (batteryPresent && batteryPercent > 60) ? LED_MODE_ON : LED_MODE_OFF;

    // Yellow/red combine wind and battery with OR: either condition lights the LED.
    // In practice they rarely collide — the pack only drains when mains is gone.
    bool batYellow = batteryPresent && batteryPercent >= 30 && batteryPercent <= 60;
    ledYellow = (windSpeed > 5.0f || batYellow) ? LED_MODE_ON : LED_MODE_OFF;

    if (batteryPresent && batteryPercent < 10) {
      ledRed = LED_MODE_BLINK;  // critically low pack outranks the wind indication
    } else {
      bool batRed = batteryPresent && batteryPercent >= 10 && batteryPercent < 30;
      ledRed = (windSpeed > 15.0f || batRed) ? LED_MODE_ON : LED_MODE_OFF;
    }

    // WiFi LED: blink while (re)connecting, solid once associated.
    ledWifi = wifiOk ? LED_MODE_ON : LED_MODE_BLINK;
  }

  applyLed(PIN_LED_GREEN,  ledGreen);
  applyLed(PIN_LED_YELLOW, ledYellow);
  applyLed(PIN_LED_RED,    ledRed);
  applyLed(PIN_LED_WIFI,   ledWifi);
  digitalWrite(PIN_LED_ERROR, (adcError || !wifiOk) ? HIGH : LOW);
}

const char* ledModeStr(LedMode m) {
  switch (m) {
    case LED_MODE_ON:    return "on";
    case LED_MODE_BLINK: return "blink";
    default:             return "off";
  }
}

// "on"/"true" → on, "blink" → blink, anything else ("off"/"false") → off.
// true/false kept so an older dashboard build keeps working.
LedMode parseLedMode(const String& v) {
  if (v == "blink")             return LED_MODE_BLINK;
  if (v == "on" || v == "true") return LED_MODE_ON;
  return LED_MODE_OFF;
}

// ===== HTTP API =====
void sendCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
}

String buildDataJson() {
  String json = "{";
  json += "\"speed\":"          + String(windSpeed, 1) + ",";
#if HAS_DIRECTION
  json += "\"direction\":"      + String(windDir, 0)   + ",";
  json += "\"dirPresent\":true,";
#else
  json += "\"direction\":null,";
  json += "\"dirPresent\":false,";
#endif
  json += "\"gust\":"           + String(windGust, 1)  + ",";
  // LED fields are mode strings ("off"/"on"/"blink"), not booleans — the dashboard
  // normalizes booleans from older firmware, not the other way around.
  json += "\"ledGreen\":\""     + String(ledModeStr(ledGreen))  + "\",";
  json += "\"ledYellow\":\""    + String(ledModeStr(ledYellow)) + "\",";
  json += "\"ledRed\":\""       + String(ledModeStr(ledRed))    + "\",";
  json += "\"ledWifi\":\""      + String(ledModeStr(ledWifi))   + "\",";
  json += "\"ledAuto\":"        + String(ledAutoMode ? "true" : "false") + ",";
  if (batteryPresent) {
    json += "\"battery\":"        + String(batteryVoltage, 2) + ",";
    json += "\"batteryPercent\":" + String(batteryPercent) + ",";
  } else {
    json += "\"battery\":null,";
    json += "\"batteryPercent\":null,";
  }
  json += "\"batteryPresent\":" + String(batteryPresent ? "true" : "false") + ",";
  json += "\"chargeState\":\""  + String(chargeState) + "\",";
  json += "\"powerSource\":\""  + String(powerSource) + "\",";
  json += "\"speedMax\":"       + String(SPEED_MAX, 0) + ",";
  json += "\"wifiRssi\":"       + String(wifiRssi) + ",";
  json += "\"adcError\":"       + String(adcError ? "true" : "false") + ",";
  json += "\"hostname\":\""     + String(hostname) + ".local\",";
  json += "\"uptime\":"         + String(millis() / 1000);
  json += "}";
  return json;
}

void handleData() {
  sendCors();
  server.send(200, "application/json", buildDataJson());
}

// ===== SSE STREAM =====
// WebServer serves one client at a time and always replies "Connection: close",
// so polling above 1 Hz used to exhaust lwIP's 16 TCP PCBs (60 s TIME_WAIT each).
// Instead the dashboard subscribes once to /api/stream and we push a frame every
// SSE_PUSH_MS over that single long-lived connection — zero per-sample TCP churn.
// The trick: NetworkClient's socket is a shared_ptr, so keeping a copy here holds
// the connection open after WebServer drops its own reference at end of request.
// One subscriber is enough (one dashboard); a new subscribe replaces the old one.
const unsigned long SSE_PUSH_MS = 250;
NetworkClient sseClient;

void handleStream() {
  NetworkClient c = server.client();
  // 500 ms write timeout so a half-dead subscriber can't stall loop() for seconds.
  c.setTimeout(500);
  c.print(F("HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream\r\n"
            "Cache-Control: no-cache\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Connection: keep-alive\r\n\r\n"));
  c.print("data: " + buildDataJson() + "\n\n");  // first frame right away
  if (sseClient.connected()) sseClient.stop();
  sseClient = c;
  // No server.send() on purpose — the response above is the whole reply.
}

void handleLedControl() {
  if (server.hasArg("auto")) {
    ledAutoMode = server.arg("auto") == "true";
  }
  if (!ledAutoMode) {
    if (server.hasArg("green"))  ledGreen  = parseLedMode(server.arg("green"));
    if (server.hasArg("yellow")) ledYellow = parseLedMode(server.arg("yellow"));
    if (server.hasArg("red"))    ledRed    = parseLedMode(server.arg("red"));
    if (server.hasArg("wifi"))   ledWifi   = parseLedMode(server.arg("wifi"));
  }
  sendCors();
  server.send(200, "text/plain", "OK");
}

void handleResetGust() {
  windGust = windSpeed;
  gustResetTimer = millis();
  sendCors();
  server.send(200, "text/plain", "OK");
}

// ?add=SSID&pass=…  — add/update a network (joins the scan pool immediately)
// ?del=SSID         — remove from NVS (wifiMulti forgets it after reboot)
// ?connect=SSID     — switch to a stored network now (executed after the reply;
//                     if it fails, the 30 s rescan falls back to the strongest)
// Response either way: current connection + stored SSIDs (passwords never leave NVS).
void handleWifiControl() {
  if (server.hasArg("add")) {
    String ssid = server.arg("add");
    String pass = server.hasArg("pass") ? server.arg("pass") : "";
    if (storeNetwork(ssid, pass)) {
      wifiMulti.addAP(ssid.c_str(), pass.c_str());
    }
  }
  if (server.hasArg("del")) {
    removeNetwork(server.arg("del"));
  }
  if (server.hasArg("connect")) {
    String target = server.arg("connect");
    if (target != WiFi.SSID()) {
      wifiStore.begin("wifinets", true);
      int n = wifiStore.getInt("n", 0);
      for (int i = 0; i < n; i++) {
        if (wifiStore.getString((String("s") + i).c_str(), "") == target) {
          pendingSsid = target;
          pendingPass = wifiStore.getString((String("p") + i).c_str(), "");
          pendingAt = millis();
          break;
        }
      }
      wifiStore.end();
    }
  }

  String json = "{";
  if (pendingSsid.length()) {
    json += "\"switching\":\"" + jsonEscape(pendingSsid) + "\",";
  }
  json += "\"current\":\"" + jsonEscape(WiFi.SSID()) + "\",";
  json += "\"ip\":\"" + WiFi.localIP().toString() + "\",";
  json += "\"max\":" + String(WIFI_MAX_NETS) + ",";
  json += "\"nets\":[";
  wifiStore.begin("wifinets", true);
  int n = wifiStore.getInt("n", 0);
  for (int i = 0; i < n; i++) {
    String s = wifiStore.getString((String("s") + i).c_str(), "");
    if (!s.length()) continue;
    if (i) json += ",";
    json += "{\"ssid\":\"" + jsonEscape(s) + "\"}";
  }
  wifiStore.end();
  json += "]}";

  sendCors();
  server.send(200, "application/json", json);
}

// ===== NETWORK SERVICES =====
// mDNS + OTA start once, on the first successful STA connect — either right in
// setup() or later from loop() when the station began life as the setup AP.
bool servicesStarted = false;

void startNetworkServices() {
  Serial.printf("WiFi OK: %s  IP: %s\n", WiFi.SSID().c_str(), WiFi.localIP().toString().c_str());
  digitalWrite(PIN_LED_WIFI, HIGH);
  digitalWrite(PIN_LED_ERROR, LOW);

  if (servicesStarted) {
    // Reconnect (possibly a different subnet) — just re-announce mDNS.
    MDNS.end();
    if (MDNS.begin(hostname)) MDNS.addService("http", "tcp", 80);
    return;
  }
  servicesStarted = true;

  if (MDNS.begin(hostname)) {
    MDNS.addService("http", "tcp", 80);
    Serial.printf("mDNS: http://%s.local\n", hostname);
  }

  ArduinoOTA.setHostname(hostname);
  ArduinoOTA.setPassword(otaPassword);
  // ArduinoOTA.handle() blocks for the whole upload, so server.handleClient()
  // never runs and the dashboard's polls pile up unaccepted. lwIP has only
  // 16 TCP PCBs (CONFIG_LWIP_MAX_ACTIVE_TCP) and holds closed ones in TIME_WAIT
  // for 60 s, so the pool is empty after ~8 s — then tcp_kill_prio() reaps the
  // OTA socket itself and the upload dies around 5 %. Shut port 80 for the
  // duration; a successful update reboots, a failed one restores the server.
  // The SSE subscriber is stopped too — its 4 Hz frames would compete with the
  // OTA transfer for WiFi airtime and TCP buffers.
  ArduinoOTA.onStart([]() { sseClient.stop(); server.close(); Serial.println("OTA start"); });
  ArduinoOTA.onEnd  ([]() { Serial.println("OTA end");   });
  ArduinoOTA.onError([](ota_error_t) { server.begin(); });
  ArduinoOTA.begin();
  Serial.println("OTA ready");
}

// ===== SETUP =====
void setup() {
  Serial.begin(115200);
  Serial.println("\n=== Wind Station ===");

  pinMode(PIN_LED_GREEN,  OUTPUT);
  pinMode(PIN_LED_YELLOW, OUTPUT);
  pinMode(PIN_LED_RED,    OUTPUT);
  pinMode(PIN_LED_WIFI,   OUTPUT);
  pinMode(PIN_LED_ERROR,  OUTPUT);

  // TP4056 status lines are open-drain and float when inactive — internal pullup required.
  pinMode(PIN_CHARGE, INPUT_PULLUP);
#if HAS_STDBY
  pinMode(PIN_STDBY,  INPUT_PULLUP);
#endif

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_WIND_SPEED, ADC_11db);
  analogSetPinAttenuation(PIN_WIND_DIR,   ADC_11db);
  analogSetPinAttenuation(PIN_BATTERY,    ADC_11db);

  // Connecting blocks loop(), so updateLEDs() can't run yet — blink LED_WIFI from a
  // hardware timer for the whole attempt. digitalRead() on an OUTPUT pin returns the
  // output latch on ESP32, so toggling works.
  wifiBootBlink.attach_ms(250, []() {
    digitalWrite(PIN_LED_WIFI, !digitalRead(PIN_LED_WIFI));
  });

  WiFi.mode(WIFI_STA);
  WiFi.setHostname(hostname);

  // Network pool: the NVS list (/api/wifi) plus whatever single network the WiFi
  // driver itself remembers (that is where the old WiFiManager portal stored it).
  int known = loadStoredNetworks();
  wifi_config_t drvConf;
  if (esp_wifi_get_config(WIFI_IF_STA, &drvConf) == ESP_OK && drvConf.sta.ssid[0]) {
    wifiMulti.addAP((const char*)drvConf.sta.ssid, (const char*)drvConf.sta.password);
    known++;
  }

  bool connected = false;
  if (known > 0) {
    Serial.printf("Scanning for %d known network(s)...\n", known);
    connected = (wifiMulti.run(12000) == WL_CONNECTED);
  }
  wifiBootBlink.detach();

  if (connected) {
    // Idempotent: also migrates the driver-stored network into our NVS list.
    storeNetwork(WiFi.SSID(), WiFi.psk());
    startNetworkServices();
    wifiWasConnected = true;  // loop()'s transition detector must not re-fire
  } else {
    // No known network in range (or empty pool). Open AP serving this same
    // dashboard: connect to WindStation-Setup, open http://192.168.4.1, add your
    // network in settings. loop() rescans the pool every 30 s and joins as soon
    // as a known network appears, then shuts the AP down.
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(setupApName);
    Serial.printf("No known networks — AP '%s' up, dashboard at http://192.168.4.1\n", setupApName);
    digitalWrite(PIN_LED_ERROR, HIGH);
  }

  server.on("/api/data",   HTTP_GET, handleData);
  server.on("/api/stream", HTTP_GET, handleStream);
  server.on("/api/led",    HTTP_GET, handleLedControl);
  server.on("/api/gust",   HTTP_GET, handleResetGust);
  server.on("/api/wifi",   HTTP_GET, handleWifiControl);
  // Embedded dashboard: "/" is index.html, the rest are its hashed assets.
  for (size_t i = 0; i < WEB_ASSET_COUNT; i++) {
    const WebAsset* a = &WEB_ASSETS[i];
    server.on(a->path, HTTP_GET, [a]() {
      server.sendHeader("Content-Encoding", "gzip");
      server.sendHeader("Cache-Control", a->cacheControl);
      server.send_P(200, a->mime, (const char*)a->data, a->len);
    });
  }
  server.begin();
  Serial.println("HTTP: 80");
}

// ===== MAIN LOOP =====
unsigned long lastRead    = 0;
unsigned long lastSse     = 0;
unsigned long lastWifiRetry = 0;
unsigned long lastLog     = 0;
unsigned long lastBattery = 0;
unsigned long lastCharge  = 0;
unsigned long lastLed     = 0;
unsigned long lastRssi    = 0;

void loop() {
  ArduinoOTA.handle();
  server.handleClient();

  // 100 ms: the SSE stream pushes at 4 Hz, so sampling faster than the push rate
  // keeps every frame fresh and catches short gusts that a slower cadence missed.
  if (millis() - lastRead > 100) {
    readSensors();
    lastRead = millis();
  }

  // Push a frame to the SSE subscriber (if any); drop the slot once it disconnects.
  if (millis() - lastSse > SSE_PUSH_MS) {
    if (sseClient.connected()) {
      sseClient.print("data: " + buildDataJson() + "\n\n");
    } else {
      sseClient.stop();
    }
    lastSse = millis();
  }

  // Serial log stays slow — 250 ms would flood the console.
  if (millis() - lastLog > 2000) {
    lastLog = millis();
    Serial.printf("V=%.1f m/s  D=%.0f°  G=%.1f  Bat=%.2fV (%d%%) %s/%s  RSSI=%d\n",
                  windSpeed, windDir, windGust, batteryVoltage, batteryPercent,
                  powerSource, chargeState, wifiRssi);
  }

  // LED status updates independently so LED_WIFI reacts to network loss without 2-second delay.
  if (millis() - lastLed > 500) {
    updateLEDs();
    lastLed = millis();
  }

  if (millis() - lastRssi > 5000) {
    wifiRssi = WiFi.RSSI();
    lastRssi = millis();
  }

  if (millis() - lastBattery > 30000) {
    readBattery();
    lastBattery = millis();
  }

  // Fast poll: the charger blinks at ~1 Hz when it has no pack to work with.
  if (millis() - lastCharge > 100) {
    readChargeStatus();
    lastCharge = millis();
  }

  if (millis() - gustResetTimer > 600000) {
    windGust = windSpeed;
    gustResetTimer = millis();
  }

  // Manual switch requested via /api/wifi?connect=… — run it now that the HTTP
  // reply has had time to flush. Failure is safe: the rescan below falls back.
  if (pendingSsid.length() && millis() - pendingAt > 300) {
    Serial.printf("Switching to '%s'\n", pendingSsid.c_str());
    WiFi.disconnect();
    WiFi.begin(pendingSsid.c_str(), pendingPass.c_str());
    pendingSsid = "";
    pendingPass = "";
    lastWifiRetry = millis();  // full 30 s for the switch before the rescan interferes
  }

  // Any fresh connect (boot AP → joined, manual switch, reconnect) — possibly a new
  // subnet, so re-announce mDNS and light the services on first connect.
  bool wifiNowConnected = (WiFi.status() == WL_CONNECTED);
  if (wifiNowConnected && !wifiWasConnected) {
    if (WiFi.getMode() != WIFI_STA) {
      WiFi.softAPdisconnect(true);
      WiFi.mode(WIFI_STA);
    }
    startNetworkServices();
  }
  if (!wifiNowConnected && wifiWasConnected) wifiLostAt = millis();
  wifiWasConnected = wifiNowConnected;

  // Offline for 3 min straight (moved out of range, router died for good) — raise
  // the setup AP alongside the ongoing rescans, so the station is always reachable
  // at http://192.168.4.1. The connect-transition above shuts it down again.
  if (!wifiNowConnected && WiFi.getMode() == WIFI_STA && wifiLostAt && millis() - wifiLostAt > 180000) {
    WiFi.mode(WIFI_AP_STA);
    WiFi.softAP(setupApName);
    Serial.printf("Offline 3 min — AP '%s' up, dashboard at http://192.168.4.1\n", setupApName);
  }

  // Network gone (home router down, walked out with only the phone hotspot, …):
  // rescan the whole pool instead of relying on auto-reconnect, which only retries
  // the last network. run() blocks a few seconds, but the station is offline anyway.
  // Also the join path for the setup-AP state: as soon as a known network appears,
  // connect to it and shut the AP down (via the transition handler above).
  if (!wifiNowConnected && millis() - lastWifiRetry > 30000) {
    Serial.println("WiFi lost — rescanning known networks");
    wifiMulti.run(8000);
    lastWifiRetry = millis();
  }
}
