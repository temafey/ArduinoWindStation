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
// Access: join the station's own WPA2 network, then http://MyWindProbeBETA.org
//         (192.168.4.1 always works too, and .local where mDNS is supported)
// OTA: flash over that same AP via Arduino IDE → Network Port
// ============================================

#include <WiFi.h>
#include <esp_wifi.h>     // esp_wifi_ap_get_sta_list — RSSI of the connected client
#include <DNSServer.h>    // resolves the station's own name for every client
#include <WebServer.h>
#include <ESPmDNS.h>
#include <ArduinoOTA.h>
#include <lwip/sockets.h> // lwip_send — the SSE frame goes out non-blocking, see sseFlush()
#include "web_content.h"  // dashboard build (gzip, PROGMEM) — see gen_web_header.py

// ===== ACCESS POINT =====
// Station mode is gone on purpose. The board used to keep a pool of home/hotspot
// networks and join the strongest one at boot, which meant the AP existed only
// while nothing was in range: the moment it associated, softAPdisconnect() shut
// the AP down ~15 s after power-up and the station vanished from the phone. It is
// now an access point and nothing else — it never scans, never joins, never has a
// reason to turn the AP off. The uplink features that depended on STA (network
// list in NVS, /api/wifi?add|del|connect, the 30 s rescan, the 3-minute fallback
// AP) went with it.
// The address people actually type. It resolves because the station runs its own
// DNS server for exactly this one name — no mDNS support needed on the client, so
// it works on Android too, where .local is unreliable.
//
// A real TLD, chosen deliberately for how it reads. Two consequences worth knowing,
// neither of which breaks anything here:
//   - This name is not registered to us. While a device is joined to the station it
//     asks the board for DNS, so a genuine site at this domain would be shadowed for
//     that device. The AP has no uplink anyway, so nothing else is reachable either.
//   - Browsers try HTTPS first for a real TLD and fall back to HTTP when the
//     handshake fails, which costs a moment on the first visit. Nothing to fix on
//     the board — it never listens on 443.
// Case is irrelevant (DNS is case-insensitive and the server lowercases both sides);
// it is spelled out this way only because that is how it looks in the address bar.
const char* portalHost  = "MyWindProbeBETA.org";
// mDNS label (single word, no dots) → also answers as mywindprobebeta.local, and
// this is the name ArduinoOTA advertises in the IDE's network port list.
const char* hostname    = "mywindprobebeta";
const char* otaPassword = "<OTA-пароль>";
const char* apSsid      = "WindStation";
// WPA2-PSK. The ESP32 needs 8..63 characters here; below 8 softAP() silently
// falls back to an open network, so this length is not incidental.
const char* apPassword  = "<AP-пароль>";
// Four is the driver default and more than one dashboard ever needs — a lower cap
// is one less way for a stranger to occupy a slot even without the password.
const int   apMaxClients = 4;

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
#define PIN_LED_WIFI      5   // Green — AP: blink when idle, solid with a client on  (col 8, was 25; strapping, boot flicker)
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
// Re-measure with the sensor still (see speedMv in /api/data) and update if the
// board changes.
//
// This floor is a SATURATION, not an offset. Above it the calibrated reading tracks
// the input; below it every input collapses onto the same ~145 mV. So it is used as a
// gate — at or under it the air is calm and speed is 0 — and is NOT subtracted from
// readings above it. Subtracting it (what this code did until 2026-08-08) shifted the
// whole scale down by one full floor: at 66.7 mV per m/s that is 2.2 m/s off every
// single sample, so a true 3 m/s reported 0.8 and a true 10 reported 7.8. Symptom:
// the station looked dead unless the cups were spun hard.
// Set a few mV above the measured floor so noise at rest cannot leak a phantom value.
// CONSEQUENCE, unchanged by the fix: real speeds below ~2.3 m/s still report 0, and
// the reading jumps straight from 0 to ~2.3 when the sensor crosses the gate. There is
// no measurement down there to interpret — firmware can stop corrupting the rest of
// the range, but it cannot invent the bottom of it. Only a level shift on the divider
// or an external ADC moves that boundary. HAS_LEVEL_SHIFT below is the first of those.
const float SPEED_ZERO_MV = 150.0f;

// ===== LOW-WIND LEVEL SHIFT (optional hardware mod) =====
// The whole reason the station is deaf below ~2.3 m/s (8 km/h) is that 0 m/s sits at
// 0 mV, i.e. inside the ADC's dead zone. Lift the divider node with a third resistor
// from 3V3 and 0 m/s lands at ~0.37 V instead — 200 mV clear of the floor, so the
// bottom of the range becomes an actual measurement and the gate can go back to being
// a plain offset subtraction.
//
//   sensor ──[15k]──┬── GPIO34        R3 from 3V3 to the same node
//                [10k]                (see FIRMWARE.md for the arithmetic)
//                  GND
//
// Set to 1 ONLY after R3 is physically fitted — with no resistor on the board this
// subtracts a bias that is not there and every reading comes out ~6 m/s low.
#define HAS_LEVEL_SHIFT 0

#if HAS_LEVEL_SHIFT
// R3 = 47k. Nominal figures for 15k/10k/47k off a 3.30 V rail:
//   bias at 0 m/s   0.374 V      gain 0.3548      full scale 2.15 V at 30 m/s
//   scale           59.1 mV per m/s   (was 66.7 without the shift)
// Both constants are NOMINAL and both must be replaced with measured values: the rail
// is not exactly 3.30 V and 5% resistors move the bias by tens of mV, which is whole
// tenths of a m/s at the bottom. Measure with /api/zero, see FIRMWARE.md.
const float SPEED_BIAS_MV_DEFAULT  = 374.0f;
// Inverse of the new divider gain, 1/0.3548. Replaces SIGNAL_DIVIDER_RATIO — R3 loads
// the node in parallel with the 10k, so the sensor sees a different ratio than before.
const float SIGNAL_DIVIDER_SHIFTED = 2.819f;
// Guard band above the measured bias, in mV. Only job is to keep ADC noise at rest from
// reading as a light breeze; at 59 mV per m/s, 6 mV is 0.1 m/s of deadband.
const float SPEED_BIAS_DEADBAND_MV = 6.0f;
#endif

// The zero point actually in use. Starts at the compile-time constant and can be
// re-measured in place through /api/zero without a reflash — the value that matters
// here is a property of this board's resistors and this chip's ADC offset, so it is
// worth being able to correct it with the sensor sitting still in front of you.
// Not persisted: NVS is never written by this firmware (see the OTA notes), so a
// number found in the field has to be copied back into the constant above to survive
// a reboot. /api/zero prints it in a form that can be pasted straight in.
#if HAS_LEVEL_SHIFT
float speedZeroMv = SPEED_BIAS_MV_DEFAULT;
#else
float speedZeroMv = SPEED_ZERO_MV;
#endif

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
// Averaged millivolts on the speed pin, before the calm gate. Exposed only so the
// floor can be re-measured in place: open /api/data with the sensor still and read
// speedMv — that number is what SPEED_ZERO_MV has to sit just above.
float speedMvRaw = 0;
// Spread of the 32 raw samples in one burst (max - min), in millivolts. This is the
// number that answers "is the radio getting into the analog side": with the sensor
// still it should be single-digit mV, and it stays that way whether or not a dashboard
// is streaming. Tens of mV that appear only while WiFi is transmitting mean the
// interference is real and belongs in a capacitor, not in a firmware constant.
float speedMvSpread = 0;
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
// In AP mode there is no uplink to measure, so this holds the RSSI of the client
// the station hears best — same units, same "is the link any good" question.
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

// ===== ACCESS POINT STATE =====
bool apUp = false;   // softAP() came up; false only if the radio failed outright

// Catch-all DNS: every name resolves to the station. That is deliberate and it is
// what makes the dashboard open by itself.
//
// It started as name-only resolution, precisely to avoid answering the phone's
// connectivity probe (connectivitycheck.gstatic.com, captive.apple.com,
// msftconnecttest.com) and the "sign in to network" nag that follows. That nag
// turned out to be the feature: answering the probe is how a phone learns there
// is a page worth opening, and it removes the need to type an address at all —
// which also sidesteps the real reason typing failed, namely browsers resolving
// names through their own DNS-over-HTTPS instead of the one the AP handed out.
//
// The trade-off is now accepted on purpose: the network reads as "needs sign-in",
// and any other site opened while joined lands on the dashboard. There is no
// internet through this AP anyway, so nothing else was reachable to begin with.
//
// AsyncUDP-based, so it serves requests from its own task — nothing to pump in
// loop(); DNSServer::processNextRequest() is an empty stub in this core.
DNSServer dnsServer;

// Number of clients currently associated. Cheap enough to call from updateLEDs().
int apClients() {
  return WiFi.softAPgetStationNum();
}

// WiFi.RSSI() reports the uplink and returns nothing meaningful without one, so the
// dashboard's signal field would read 0 forever. Report the strongest associated
// client instead — with one dashboard connected that is the only link there is.
// 0 when nobody is connected, which is how the UI already renders "no signal".
int readClientRssi() {
  wifi_sta_list_t stations;
  if (esp_wifi_ap_get_sta_list(&stations) != ESP_OK || stations.num == 0) return 0;
  int best = -127;
  for (int i = 0; i < stations.num; i++) {
    if (stations.sta[i].rssi > best) best = stations.sta[i].rssi;
  }
  return best;
}

WebServer server(80);

// ===== SENSOR READ =====
// Sampling cadence, deliberately faster than the SSE push: every frame then carries a
// freshly averaged value instead of one up to a whole push period stale, and a gust
// peak lands inside a sample set rather than in the gap between two reads.
const unsigned long READ_INTERVAL_MS = 20;   // 50 Hz

void readSensors() {
  // 32, not 10: averaging N samples of the same instant cuts ADC noise by sqrt(N),
  // so 3.2x more samples buys 1.8x less jitter on the number. At ~80 us per
  // analogReadMilliVolts() the burst costs ~2.6 ms, ~13% of the 20 ms budget.
  const int SAMPLES = 32;
  // Interquartile mean, not a plain average. A WiFi transmit burst is ~1 ms of a few
  // hundred mA through the same rails and a strong near field over the same board, and
  // the 2.6 ms sample burst is short enough to land inside one — so the disturbance is
  // not white noise sprinkled over the set, it is a contiguous run of samples pushed
  // the same way. A mean carries that straight into the reading; discarding the lowest
  // and highest eight survives a burst that corrupts up to a quarter of the set at each
  // end. Price is the noise floor: sqrt(16) instead of sqrt(32) of averaging, ~1.4x more
  // jitter on a quiet board, which is the cheaper of the two errors by far.
  const int TRIM = 8;
  uint16_t s[SAMPLES];
  for (int i = 0; i < SAMPLES; i++) {
    s[i] = (uint16_t)analogReadMilliVolts(PIN_WIND_SPEED);
  }
  // Insertion sort: 32 elements, already-near-sorted in the common case, and it costs
  // a few microseconds against the 2.6 ms the conversions themselves take.
  for (int i = 1; i < SAMPLES; i++) {
    uint16_t v = s[i];
    int j = i - 1;
    while (j >= 0 && s[j] > v) { s[j + 1] = s[j]; j--; }
    s[j + 1] = v;
  }
  speedMvSpread = (float)(s[SAMPLES - 1] - s[0]);   // diagnostic, see the declaration
  uint32_t speedMvSum = 0;
  for (int i = TRIM; i < SAMPLES - TRIM; i++) {
    speedMvSum += s[i];
  }
  float speedMvAvg = speedMvSum / (float)(SAMPLES - 2 * TRIM);

  // Signal loss detector: pin pulled hard to GND for ~30 s.
  // NOTE: this can no longer catch a pulled signal wire — an open input reads the
  // same ~145 mV ADC floor as a sensor sitting at 0 V. Only a dead short shows up.
  // Trip count is tied to READ_INTERVAL_MS, not a bare sample count: the detector is
  // about "dead-low for ~1.5 s", and speeding the loop from 100 ms to 20 ms would
  // otherwise fire the error LED after 300 ms and make it flicker on noise.
  static const uint16_t ZERO_TRIP = 1500 / READ_INTERVAL_MS;
  static uint16_t zeroReadings = 0;
  if (speedMvAvg < 10.0f) {
    if (zeroReadings < ZERO_TRIP) zeroReadings++;
  } else {
    zeroReadings = 0;
  }
  adcError = (zeroReadings >= ZERO_TRIP);

  speedMvRaw = speedMvAvg;   // published for field calibration, see /api/zero

#if HAS_LEVEL_SHIFT
  // With R3 fitted, 0 m/s is a real voltage sitting well above the ADC floor, so the
  // zero point IS an additive offset now and subtracting it is correct — the exact
  // opposite of the no-shift case below, which is why the two must never be mixed up.
  float speedMv = (speedMvAvg <= speedZeroMv + SPEED_BIAS_DEADBAND_MV)
                    ? 0.0f : (speedMvAvg - speedZeroMv);
  float vSpeedSensor = (speedMv / 1000.0f) * SIGNAL_DIVIDER_SHIFTED;
#else
  // Gate on the ADC floor instead of subtracting it: at or below the floor there is no
  // signal to read (calm air), above it the calibrated millivolts are already the input.
  float speedMv = (speedMvAvg <= speedZeroMv) ? 0.0f : speedMvAvg;
  float vSpeedSensor = (speedMv / 1000.0f) * SIGNAL_DIVIDER_RATIO;
#endif
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
  bool wifiOk = apUp;  // the AP is the whole network now — nothing to lose or retry
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

    // WiFi LED: solid once something is associated to the AP, blink while it waits.
    // The old "blink = still connecting" is gone with STA mode; the AP is up within
    // a moment of boot, so a permanently solid LED would carry no information at all.
    ledWifi = (wifiOk && apClients() > 0) ? LED_MODE_ON : LED_MODE_BLINK;
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
  // One allocation instead of a dozen reallocs per frame. At 20 Hz the old growth
  // pattern churned the heap 20x a second and fragmented it over long uptimes.
  json.reserve(448);
  // 2 decimals, not 1: 0.1 m/s quantising was coarser than the sensor's own noise
  // after 32x averaging, so the last digit of real resolution was being rounded away
  // before it ever reached the air.
  json += "\"speed\":"          + String(windSpeed, 2) + ",";
#if HAS_DIRECTION
  json += "\"direction\":"      + String(windDir, 0)   + ",";
  json += "\"dirPresent\":true,";
#else
  json += "\"direction\":null,";
  json += "\"dirPresent\":false,";
#endif
  json += "\"gust\":"           + String(windGust, 2)  + ",";
  // Diagnostic, not a measurement: raw averaged mV on the speed pin. Lets the ADC
  // floor be checked without a USB cable — the dashboard ignores this field.
  json += "\"speedMv\":"        + String(speedMvRaw, 1) + ",";
  // Two more diagnostics, also ignored by the dashboard: the zero point currently in
  // force (so /api/zero can be checked without guessing) and the spread of one sample
  // burst, which is how radio interference on the analog side shows itself.
  json += "\"speedZeroMv\":"    + String(speedZeroMv, 1) + ",";
  json += "\"speedSpreadMv\":"  + String(speedMvSpread, 0) + ",";
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
  // The address to show a human, not the mDNS label — this is what the dashboard
  // prints as "станция доступна по адресу".
  json += "\"hostname\":\""     + String(portalHost) + "\",";
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
// 50 ms = 20 Hz. The old 250 ms was chosen against per-sample TCP churn, which the
// single long-lived connection already solved; at ~330 bytes a frame this costs
// ~6.6 kB/s of airtime, nothing on a 802.11n link, and it is what makes the gauge
// track the cups instead of stepping after them.
const unsigned long SSE_PUSH_MS = 50;
NetworkClient sseClient;

// The frame being handed to the socket, and how many of its bytes already left. A new
// frame is only built once the previous one is fully out — see sseFlush() for why the
// socket is written to directly and what happens when the client cannot keep up.
String        sseFrame;
size_t        sseSent    = 0;
unsigned long sseDropped = 0;   // frames skipped because the previous one was still going

// Hand over as much of the pending frame as the socket will take this instant, never
// more, never waiting.
//
// sseClient.print() cannot be used for this. NetworkClient::write() loops up to
// WIFI_CLIENT_MAX_WRITE_RETRY (10) times around a select() whose timeout is
// WIFI_CLIENT_SELECT_TIMEOUT_US (1 s) — so a subscriber whose receive window is full
// stalls the whole of loop() for up to ten seconds. Everything else in loop() stops
// with it, readSensors() included: the sensor is simply not sampled for that period,
// so a short spell of slow rotation lands entirely in the blind window and never
// reaches the dashboard at all, while the frames that do arrive are stale by however
// long the stall lasted.
//
// c.setTimeout(500) used to sit here and was documented as a 500 ms write timeout. It
// was neither. NetworkClient declares its own `int _timeout` that shadows Stream's and
// never overrides setTimeout(), so the value landed in the Stream member that write()
// does not read; and the send() inside write() passes MSG_DONTWAIT, which makes
// SO_SNDTIMEO irrelevant anyway. The retry loop above was always the real bound.
//
// A full buffer therefore costs a skipped frame instead of a stalled loop. That is the
// right trade for a live gauge: 50 ms later there is a newer sample, and a backlog of
// old ones has no value to the dashboard.
void sseFlush() {
  if (sseSent >= sseFrame.length()) return;
  int fd = sseClient.fd();
  if (fd < 0) return;
  int n = lwip_send(fd, sseFrame.c_str() + sseSent, sseFrame.length() - sseSent, MSG_DONTWAIT);
  if (n > 0) {
    sseSent += n;
  } else if (n < 0 && errno != EAGAIN && errno != EWOULDBLOCK) {
    sseClient.stop();   // real socket error, not just a full window
  }
}

void handleStream() {
  NetworkClient c = server.client();
  // Nagle withholds a small segment until the previous one is ACKed, so at 20 Hz it
  // would both delay a frame by up to a full RTT and coalesce neighbouring frames
  // into one segment — the client then gets two samples with one timestamp. Off.
  c.setNoDelay(true);
  // Blocking, but harmless: this is the first thing written to a brand new socket, so
  // the send buffer is empty and the headers go out without ever filling it.
  c.print(F("HTTP/1.1 200 OK\r\n"
            "Content-Type: text/event-stream\r\n"
            "Cache-Control: no-cache\r\n"
            "Access-Control-Allow-Origin: *\r\n"
            "Connection: keep-alive\r\n\r\n"));
  if (sseClient.connected()) sseClient.stop();
  sseClient = c;
  sseFrame = "data: " + buildDataJson() + "\n\n";  // first frame, drained by sseFlush()
  sseSent  = 0;
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

// Zero-point calibration in place, with the cups held still.
//   GET /api/zero            — what is in force now, and what the pin reads this instant
//   GET /api/zero?set        — adopt the current reading as the zero point
//   GET /api/zero?set=374.0  — adopt an explicit value
//   GET /api/zero?reset      — back to the compile-time constant
// RAM only, deliberately: this firmware never writes NVS (an OTA image flashed over a
// wrong partition offset would take the settings with it), so the point of the endpoint
// is to FIND the number in five minutes of trying, not to store it. The reply echoes it
// as the source line to paste back into the constant, which is where it belongs anyway —
// the value is a property of the resistors, and those do not change between reboots.
void handleZero() {
  if (server.hasArg("reset")) {
#if HAS_LEVEL_SHIFT
    speedZeroMv = SPEED_BIAS_MV_DEFAULT;
#else
    speedZeroMv = SPEED_ZERO_MV;
#endif
  } else if (server.hasArg("set")) {
    String v = server.arg("set");
    // Empty value means "take what the sensor reads right now" — that is the whole
    // point of the flag form, and it is the form used with the cups held still.
    float mv = (v.length() == 0) ? speedMvRaw : v.toFloat();
    // Refuse nonsense rather than silently bricking the scale: 0 would disable the gate
    // entirely and let the ADC floor read as 2.2 m/s of permanent phantom wind, and
    // anything past ~1 V is already a good fraction of the useful range.
    if (mv > 20.0f && mv < 1000.0f) speedZeroMv = mv;
  }

  String json = "{";
  json += "\"zeroMv\":"     + String(speedZeroMv, 1) + ",";
  json += "\"speedMv\":"    + String(speedMvRaw, 1) + ",";
  json += "\"spreadMv\":"   + String(speedMvSpread, 0) + ",";
  json += "\"levelShift\":" + String(HAS_LEVEL_SHIFT ? "true" : "false") + ",";
#if HAS_LEVEL_SHIFT
  json += "\"constant\":\"const float SPEED_BIAS_MV_DEFAULT = "
          + String(speedZeroMv, 1) + "f;\"}";
#else
  json += "\"constant\":\"const float SPEED_ZERO_MV = "
          + String(speedZeroMv, 1) + "f;\"}";
#endif

  sendCors();
  server.send(200, "application/json", json);
}

void handleResetGust() {
  windGust = windSpeed;
  gustResetTimer = millis();
  sendCors();
  server.send(200, "text/plain", "OK");
}

// Read-only now. The station has no uplink to configure, so add/del/connect are
// gone — but the endpoint stays, because the dashboard baked into web_content.h
// still polls it and cannot be rebuilt on this machine. The old response shape is
// preserved: "nets" is an empty list and "max" is 0, which is exactly what the UI
// reads when there is nothing to add and no room to add it.
void handleWifiControl() {
  String json = "{";
  json += "\"mode\":\"ap\",";
  json += "\"apOnly\":true,";
  json += "\"current\":\"" + String(apSsid) + "\",";
  json += "\"ip\":\"" + WiFi.softAPIP().toString() + "\",";
  json += "\"clients\":" + String(apClients()) + ",";
  json += "\"host\":\"" + String(portalHost) + "\",";
  json += "\"max\":0,";
  json += "\"nets\":[]}";

  sendCors();
  server.send(200, "application/json", json);
}

// ===== NETWORK SERVICES =====
// mDNS + OTA start once, right after the AP is up. There is no reconnect path any
// more — the subnet is ours and fixed at 192.168.4.x, so nothing ever needs
// re-announcing and the old servicesStarted guard has nothing left to guard.
void startNetworkServices() {
  Serial.printf("AP '%s' up  IP: %s\n", apSsid, WiFi.softAPIP().toString().c_str());
  digitalWrite(PIN_LED_ERROR, LOW);

  // Clients get this address as their DNS server from the AP's own DHCP, so
  // answering everything with our own IP is all it takes.
  if (dnsServer.start(53, "*", WiFi.softAPIP())) {
    Serial.printf("DNS: catch-all -> %s  (http://%s)\n",
                  WiFi.softAPIP().toString().c_str(), portalHost);
  } else {
    Serial.println("DNS server failed — reach the dashboard at 192.168.4.1");
  }

  // DHCP option 114: hands the portal URL straight to the client, so a modern
  // phone can skip probing altogether. Belt and braces next to the redirect
  // below — older clients ignore the option, newer ones prefer it.
#if ESP_IDF_VERSION >= ESP_IDF_VERSION_VAL(5, 4, 2)
  if (WiFi.AP.enableDhcpCaptivePortal()) {
    Serial.println("Captive portal: DHCP option 114 advertised");
  }
#endif

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
  // The SSE subscriber is stopped too — its 20 Hz frames would compete with the
  // OTA transfer for WiFi airtime and TCP buffers (and at 20 Hz that competition
  // is five times what it used to be, so dropping it matters more, not less).
  ArduinoOTA.onStart([]() {
    sseClient.stop();
    sseFrame = "";      // nothing left half-sent to a socket that no longer exists
    sseSent  = 0;
    server.close();
    Serial.println("OTA start");
  });
  ArduinoOTA.onEnd  ([]() { Serial.println("OTA end");   });
  ArduinoOTA.onError([](ota_error_t) { server.begin(); });
  ArduinoOTA.begin();
  Serial.println("OTA ready");
}

// ===== SETUP =====
void setup() {
  // Before Serial.begin — the UART divisor is derived from the CPU clock, so changing
  // the frequency afterwards would garble the console. Normally already 240 MHz from
  // the core's default sdkconfig; pinned here so a board profile that boots at 80 MHz
  // cannot quietly stretch every ADC burst and JSON build.
  setCpuFrequencyMhz(240);

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

  // The WiFi driver keeps its own copy of the last STA credentials in NVS and joins
  // that network on its own the moment station mode is started — that is exactly the
  // behaviour being removed here, and it would survive every OTA update because the
  // nvs partition is never rewritten. So bring STA up once, wipe the stored config
  // (second argument of disconnect() is eraseap), and only then switch to pure AP.
  // Order matters: persistent(false) first would route the erase to RAM and leave
  // the credentials sitting in flash.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  WiFi.persistent(false);   // nothing this firmware does should write creds back
  WiFi.mode(WIFI_AP);
  WiFi.setHostname(hostname);
  WiFi.softAPsetHostname(hostname);

  // WPA2-protected AP on the default 192.168.4.1/24. Channel 1, not hidden: hiding
  // an SSID stops nobody who can run a scanner and mostly annoys phones, the
  // passphrase is what actually keeps strangers out.
  apUp = WiFi.softAP(apSsid, apPassword, 1 /*channel*/, 0 /*hidden*/, apMaxClients);

  // A client in power save only listens on the DTIM beacon; until then the AP holds
  // its frames. Arduino's APClass::create() memsets the whole wifi_config_t and then
  // never assigns dtim_period, so what reaches the driver is 0 — outside the documented
  // 1..10 range and not something to rely on when the number decides how long a phone
  // waits for its data. Pinned to 1 (every beacon, ~102 ms) so a sleeping dashboard is
  // never held longer than one beacon interval. Costs the client a little battery.
  wifi_config_t apConf;
  if (esp_wifi_get_config(WIFI_IF_AP, &apConf) == ESP_OK) {
    apConf.ap.beacon_interval = 100;
    apConf.ap.dtim_period     = 1;
    esp_wifi_set_config(WIFI_IF_AP, &apConf);
  }

  // ===== LOW-LATENCY LINK =====
  // Set after softAP() — starting an interface re-inits the driver and restores the
  // defaults these two lines exist to override.
  // Default power save parks the receiver between beacons and only drains the
  // buffer on wake-up. Measured on this board with it on: ping 3 ms at best but
  // 287 ms at worst, and SSE frames landing 147-360 ms apart instead of a steady
  // 250 — the frame is ready on time, it just waits for the radio. Off means the
  // receiver runs continuously: ~30 mA idle becomes ~120 mA, which is the entire
  // price of turning 47 ms of jitter into single-digit milliseconds.
  WiFi.setSleep(false);
  // Max TX power. Throughput is not the issue here (a frame is ~330 bytes), retries
  // are: every 802.11 retransmit costs a full airtime slot and surfaces as a latency
  // spike, so buy link margin with power this station has no reason to conserve.
  WiFi.setTxPower(WIFI_POWER_19_5dBm);

  if (apUp) {
    startNetworkServices();
  } else {
    // softAP() only fails if the radio itself refused to start — the station is
    // then unreachable by any route, so the error LED is the only way to say so.
    Serial.println("softAP() FAILED — no network");
    digitalWrite(PIN_LED_ERROR, HIGH);
  }

  server.on("/api/data",   HTTP_GET, handleData);
  server.on("/api/stream", HTTP_GET, handleStream);
  server.on("/api/led",    HTTP_GET, handleLedControl);
  server.on("/api/gust",   HTTP_GET, handleResetGust);
  server.on("/api/zero",   HTTP_GET, handleZero);
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
  // Anything not registered above is a captive-portal probe: the OS asks for a
  // known URL and judges the network by the answer. A 302 elsewhere is the
  // universal "you are behind a portal" signal — Android expects 204 from
  // /generate_204, Apple expects a page containing Success, Windows expects
  // its connecttest.txt — so redirecting satisfies none of them on purpose, and
  // each platform then offers to open the target. That target is the dashboard.
  //
  // Sending the name rather than 192.168.4.1: to have reached this handler the
  // client must have resolved something through our own DNS, so the name is
  // guaranteed to resolve for it too — and it is the address worth showing.
  server.onNotFound([]() {
    server.sendHeader("Location", String("http://") + portalHost + "/", true);
    server.send(302, "text/plain", "");
  });

  server.begin();
  Serial.println("HTTP: 80");
}

// ===== MAIN LOOP =====
unsigned long lastRead    = 0;
unsigned long lastSse     = 0;
unsigned long lastLog     = 0;
unsigned long lastBattery = 0;
unsigned long lastCharge  = 0;
unsigned long lastLed     = 0;
unsigned long lastRssi    = 0;
// Longest single pass through loop() since the last Serial line. Everything here is
// cooperative, so one slow call delays every other subsystem — this is what makes that
// visible instead of leaving it to be guessed from symptoms.
unsigned long loopMaxMs   = 0;

void loop() {
  unsigned long loopStart = millis();

  ArduinoOTA.handle();
  server.handleClient();

  if (millis() - lastRead > READ_INTERVAL_MS) {
    readSensors();
    lastRead = millis();
  }

  // Queue a frame for the SSE subscriber (if any); drop the slot once it disconnects.
  // Only one frame is ever outstanding: if the previous one has not finished leaving,
  // this tick is skipped rather than queued behind it, so the link never accumulates a
  // backlog of samples the dashboard would render late.
  if (millis() - lastSse > SSE_PUSH_MS) {
    if (sseClient.connected()) {
      if (sseSent >= sseFrame.length()) {
        sseFrame = "data: " + buildDataJson() + "\n\n";
        sseSent  = 0;
      } else {
        sseDropped++;
      }
    } else {
      sseClient.stop();
      sseFrame = "";
      sseSent  = 0;
    }
    lastSse = millis();
  }

  // Every pass, not every push: a frame the socket could only take half of drains as
  // soon as the window reopens instead of waiting out the next 50 ms tick.
  sseFlush();

  // Serial log stays slow — 250 ms would flood the console.
  if (millis() - lastLog > 2000) {
    lastLog = millis();
    // loopMax and sse are the two numbers that tell a laggy dashboard from a laggy
    // sensor: loopMax is the longest single pass since the last line (anything past a
    // few ms means something in loop() is blocking and readSensors() is being starved),
    // sse counts frames skipped because the subscriber could not take them in time.
    // "±N" is the spread of the last sample burst. It is printed next to the raw mV on
    // purpose: those two together say whether a wrong reading is a wrong zero point
    // (mV off, spread small) or interference (mV jumping, spread large).
    Serial.printf("V=%.1f m/s (%.0f mV ±%.0f, zero %.0f)  D=%.0f°  G=%.1f  "
                  "Bat=%.2fV (%d%%) %s/%s  RSSI=%d  loopMax=%lums  sseDrop=%lu\n",
                  windSpeed, speedMvRaw, speedMvSpread, speedZeroMv, windDir, windGust,
                  batteryVoltage, batteryPercent, powerSource, chargeState, wifiRssi,
                  loopMaxMs, sseDropped);
    loopMaxMs  = 0;
    sseDropped = 0;
  }

  // LED status updates independently so LED_WIFI follows the client count without
  // waiting on the 2-second Serial tick.
  if (millis() - lastLed > 500) {
    updateLEDs();
    lastLed = millis();
  }

  if (millis() - lastRssi > 5000) {
    wifiRssi = readClientRssi();
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

  // Nothing to reconnect to and nothing to rescan for: an AP has no uplink that can
  // drop. What used to live here — the manual switch, the connect-transition
  // detector, the 3-minute fallback AP and the 30 s blocking wifiMulti.run() — is
  // gone with station mode, which also gives the dashboard back the seconds the
  // rescan used to freeze it for.

  unsigned long elapsed = millis() - loopStart;
  if (elapsed > loopMaxMs) loopMaxMs = elapsed;
}
