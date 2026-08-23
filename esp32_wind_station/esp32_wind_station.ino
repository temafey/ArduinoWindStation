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

// Every password this firmware needs lives in secrets.h, which is NOT in git.
// A missing file stops the build on purpose: the alternative is a board that
// silently comes up on an open network, and that failure is invisible until
// someone else is already on it.
#if __has_include("secrets.h")
  #include "secrets.h"
#else
  #error "secrets.h missing - copy esp32_wind_station/secrets.example.h to secrets.h and fill it in"
#endif

// ===== ACCESS POINT =====
// The AP is the station's own network and it is unconditional: it comes up at boot
// and nothing in this firmware ever takes it down. That is the whole lesson of the
// old station mode, which kept a pool of home/hotspot networks in NVS and joined
// the strongest one at boot — the moment it associated, softAPdisconnect() shut the
// AP down ~15 s after power-up and the station vanished from the phone.
//
// An uplink is back (see HAS_HOME_NETWORK below) but on the opposite terms: AP+STA,
// where joining a network is something the board does IN ADDITION to being an
// access point, never instead of it. What has not come back is the configurable
// part — the network list in NVS, /api/wifi?add|del|connect, the 30 s rescan and
// the 3-minute fallback AP are all still gone, and the uplink is one constant in
// this file rather than a form on a page.
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
const char* otaPassword = SECRET_OTA_PASSWORD;   // secrets.h
const char* apSsid      = "WindStation";
// WPA2-PSK. The ESP32 needs 8..63 characters here; below 8 softAP() silently
// falls back to an open network, so this length is not incidental.
const char* apPassword  = SECRET_AP_PASSWORD;    // secrets.h
// Four is the driver default and more than one dashboard ever needs — a lower cap
// is one less way for a stranger to occupy a slot even without the password.
const int   apMaxClients = 4;

// ===== HOME NETWORK (optional uplink) =====
// AP+STA: the AP above stays up unconditionally and the board ALSO joins a known
// 2.4 GHz network when one is in range. This is not the station mode that was
// removed — that one called softAPdisconnect() the moment it associated, which is
// why the station used to vanish from the phone ~15 s after power-up. Nothing here
// ever touches the AP; the uplink is strictly additive and its failure costs
// nothing but the uplink itself.
//
// What it buys: the dashboard is reachable from the house without leaving the
// network that has internet, and OTA runs over the LAN instead of forcing the
// laptop onto an AP with no uplink.
//
// Set to 0 for a pure access point (mast, field, anywhere the home net is out of
// range) — the retry loop below then does not exist at all.
// Comes from secrets.h so that a checkout whose secrets.h lists no networks still
// builds — as a pure access point, which is a working station and not a broken one.
#ifdef SECRET_HAS_HOME_NETWORK
  #define HAS_HOME_NETWORK SECRET_HAS_HOME_NETWORK
#else
  #define HAS_HOME_NETWORK 0
#endif

#if HAS_HOME_NETWORK
// The networks to try, in order of preference: home first, then the places the
// station actually travels to. Tried one per attempt, round-robin — never scanned.
// A scan would cost the AP a stall of its own before a single association is even
// attempted, and the list is short enough that walking it blind is cheaper.
//
// 2.4 GHz ONLY. The ESP32 has no 5 GHz radio, so the "-5G" twin of a dual-band
// router is invisible to it no matter what is written here.
//
// The list itself is SECRET_HOME_NETWORKS in secrets.h, which git does not track.
// It still ends up in plain text inside the compiled binary — that has not changed
// and cannot, since the firmware never writes NVS. What changed is that the
// passwords are no longer in the repository or its history.
struct HomeNetwork {
  const char* ssid;
  const char* password;
};
const HomeNetwork homeNetworks[] = { SECRET_HOME_NETWORKS };
const int homeNetworkCount = sizeof(homeNetworks) / sizeof(homeNetworks[0]);
#endif

// One association attempt gets this long before it is abandoned. A successful join
// takes 2-5 s; the rest is margin for a router that answers slowly. Only ever spent
// on a network a scan has just seen, so it is a wait for a slow answer and not a
// wait for silence.
const unsigned long STA_ASSOC_MS = 12000;
// Milliseconds the scan dwells on each of the 13 channels. Thirteen times this is
// how long the AP goes quiet per search, so the number is a direct cost: 120 ms
// gives ~1.6 s, short enough that an associated client rides it out on beacon-miss
// tolerance alone, long enough for a router's probe response to come back.
const unsigned long STA_SCAN_MS_PER_CHAN = 120;
// Backoff between searches. A search costs the AP its channel — the radio is one
// radio, and while it looks elsewhere the station's own network is off the air.
// That is what used to make the board unreachable from a phone in a field: six
// blind WiFi.begin() calls at 12 s each meant 72 s of thrashing after every
// power-up, and a phone's association simply does not survive it (a laptop retries
// long enough to slip through, which is why the fault looked like "phones only").
// Now a search is one scan, and if none of the known networks is on the air it ends
// there — no association is attempted at all. The wait still doubles after each
// failed search and resets the moment a link comes up.
const unsigned long STA_RETRY_MIN_MS = 30000;    // after the first failed search, 30 s
const unsigned long STA_RETRY_MAX_MS = 600000;   // ceiling, 10 min

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
#define PIN_LED_WIFI      5   // Green — solid when reachable (AP client or uplink)  (col 8, was 25; strapping, boot flicker)
#define PIN_LED_ERROR    18   // Red — error (ADC/WiFi)                             (col 9, was 33)

// TP4056 status, open-drain: the IC pulls the pin to GND, so INPUT_PULLUP and LOW=active.
// GPIO13/19 chosen because neither is a strapping pin — an open-drain line held LOW at
// power-up on GPIO0/2/12/15 would change boot mode or flash voltage and brick the boot.
#define PIN_CHARGE       13   // TP4056 CHRG  — LOW while charging
#define PIN_STDBY        19   // TP4056 STDBY — LOW when charge complete (see HAS_STDBY)

// ===== 4G MODEM (A7670E) — AT CONSOLE OVER THE NETWORK =====
// Set to 0 on a board with no modem wired and none of this is compiled in. It is a flag
// rather than plain code for two reasons: the spare board has no modem at all, and on the
// mast the console has no business being reachable (see handleAt for what that buys).
#define HAS_MODEM 1

#if HAS_MODEM
// v6 layout: the module sits label-DOWN across breadboard columns 36..42 and its pads are
// identified by silkscreen letter, never by number. Two of them come back here:
//   col 37 = "R" = modem RXD  <- GPIO26 (this board's TX)
//   col 38 = "T" = modem TXD  -> GPIO25 (this board's RX)
// The letters deliberately do NOT match across the link — this board's TX drives the
// modem's RX. Swapping the pair leaves both ends deaf and looks exactly like a dead
// modem, so the letters are spelled out here and not only in wiring-v6.html.
//
// The pins are 25/26 rather than the 26/27 the wiring diagram was drawn for: the harness
// went in one position off and cannot be moved without taking the board apart, so the
// firmware follows the copper. GPIO27 is free again; GPIO33 is the pin now reserved for
// the P-FET gate that will cut modem power (it used to be planned for GPIO25).
//
// Both are ADC2 pins, which is allowed: the ADC2-vs-WiFi conflict is about analog reads
// only, and these two are a UART. Same exemption as GPIO4 (LED) and GPIO13 (CHRG).
#define PIN_MODEM_RX     25   // ESP32 receives here
#define PIN_MODEM_TX     26   // ESP32 sends here
// SIMCom's own default, and the module has never been moved off it. Serial2 defaults to
// GPIO16/17 — the yellow and green LEDs — so begin() is always given the pins explicitly.
const unsigned long MODEM_BAUD = 115200;

// The wiring actually in force. Separate from the constants above because both are worth
// changing without a reflash: which of the two wires landed on which pin is a coin flip
// that costs a USB session to guess wrong, and a modem sitting at the wrong baud looks
// exactly like a modem that is not wired at all. RAM only, same rule as /api/zero — the
// value that works has to be copied back into the constants to survive a reboot.
uint8_t       modemPinRx = PIN_MODEM_RX;
uint8_t       modemPinTx = PIN_MODEM_TX;
unsigned long modemBaud  = MODEM_BAUD;

// Everything the modem has said since the last command went out. Sized for the longest
// answer worth reading in one piece (AT+COPS=? runs a few hundred bytes) with room left
// for the NMEA stream AT+CGNSSTST=1 turns on. That stream never stops, which is why an
// overflow drops the OLDEST half instead of refusing new bytes: on a stream the part
// worth having is always the tail.
#define MODEM_BUF_CAP  2048
char   modemBuf[MODEM_BUF_CAP];
size_t modemLen = 0;
// Bytes ever received. This is the number that tells a firmware problem from a wiring
// problem: a console that echoes the command but leaves total at 0 means nothing is
// coming back on GPIO26 — wrong pin, wrong baud, or the modem has no power.
unsigned long modemRxTotal = 0;
#endif

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

// ===== WHO CAME TO THE AP AND WHY THEY LEFT =====
// A client that cannot associate is invisible from the inside: softAPgetStationNum()
// only counts the ones that made it, so a phone stuck on "Connecting..." leaves no
// trace at all. The driver does say what happened — WIFI_EVENT_AP_STADISCONNECTED
// carries an 802.11 reason code — and this ring is the only place that survives long
// enough to read it: the laptop associates fine, so it can watch the phone fail from
// /api/wifi without a USB cable anywhere near a field.
//
// Written from the WiFi event task and read from the HTTP task without a lock. Both
// indices are single bytes and the entries are plain values, so the worst a race can
// do is print one stale line. A mutex here would cost more than the mistake.
#define AP_LOG_N 8
struct ApEvent {
  unsigned long ms;      // millis() when it happened
  uint8_t  mac[6];
  bool     joined;       // true = associated, false = left or was refused
  uint16_t reason;       // 802.11 reason code, meaningful only when joined == false
};
ApEvent apEventLog[AP_LOG_N];
uint8_t apEventCount = 0;   // how many slots are filled, saturates at AP_LOG_N
uint8_t apEventNext  = 0;   // where the next one goes

void apEventPush(const uint8_t* mac, bool joined, uint16_t reason) {
  ApEvent& e = apEventLog[apEventNext];
  e.ms = millis();
  memcpy(e.mac, mac, 6);
  e.joined = joined;
  e.reason = reason;
  apEventNext = (apEventNext + 1) % AP_LOG_N;
  if (apEventCount < AP_LOG_N) apEventCount++;
}

// Why the chip last started. Reported in /api/data because a station used away from
// the house runs on a battery, and a battery that sags under a transmit burst resets
// the board — which from the outside looks exactly like "it will not let my phone
// connect". Uptime alone does not distinguish a fresh power-up from a brownout loop;
// this does, and it is the one question the dashboard cannot answer by measuring.
const char* resetReasonName() {
  switch (esp_reset_reason()) {
    case ESP_RST_POWERON:  return "poweron";
    case ESP_RST_BROWNOUT: return "brownout";   // supply sagged — battery or wiring
    case ESP_RST_PANIC:    return "panic";
    case ESP_RST_TASK_WDT:
    case ESP_RST_WDT:
    case ESP_RST_INT_WDT:  return "watchdog";
    case ESP_RST_SW:       return "software";   // OTA finished, or Restart()
    case ESP_RST_EXT:      return "external";   // the EN button
    case ESP_RST_DEEPSLEEP: return "deepsleep";
    default:               return "unknown";
  }
}

#if HAS_HOME_NETWORK
// ===== UPLINK STATE =====
// Driver auto-reconnect is turned off in setup() so there is exactly one place that
// decides when to associate — otherwise the driver's own retries and the backoff
// below would both be scanning, and the AP would stall twice as often for it.
bool staUp = false;                              // last observed link state
unsigned long staBackoffMs  = STA_RETRY_MIN_MS;  // wait after a failed search
unsigned long staNextAttempt = 0;                // millis() of the next search
bool staScanning = false;                        // an async scan is in flight
int  staTrying = -1;                             // homeNetworks[] index being joined, -1 = none
unsigned long staAssocDeadline = 0;              // when to abandon that association
// WiFi.status() is only ever written by driver events, never by begin(), so the
// value standing when an association starts is the previous attempt's verdict.
// Kept here so a failure can be told from a leftover: see serviceUplink().
wl_status_t staStatusAtBegin = WL_NO_SHIELD;
// Set when a completed scan saw none of the known networks. It is the "we are
// somewhere else entirely" flag, and it is what buys a client on the AP total
// radio silence: see the guard in serviceUplink().
bool staNoneInRange = false;
#endif

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

// The dashboard has one signal field, so this reports whichever link the dashboard
// is most likely looking through. A client associated to our AP wins: it is the
// direct link to whoever is reading the page. Only when the AP is empty does the
// uplink RSSI stand in — that is the case where the page is being served over the
// home network and WiFi.RSSI() is the link that matters.
// 0 when there is neither, which is how the UI already renders "no signal".
int readClientRssi() {
  wifi_sta_list_t stations;
  if (esp_wifi_ap_get_sta_list(&stations) == ESP_OK && stations.num > 0) {
    int best = -127;
    for (int i = 0; i < stations.num; i++) {
      if (stations.sta[i].rssi > best) best = stations.sta[i].rssi;
    }
    return best;
  }
#if HAS_HOME_NETWORK
  if (WiFi.status() == WL_CONNECTED) return WiFi.RSSI();
#endif
  return 0;
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

    // WiFi LED: solid when the station is reachable by someone, blinking when it is
    // shouting into an empty room. "Reachable" is either a client on the AP or a live
    // uplink — a board sitting on the home network with nobody's phone attached is
    // working perfectly, and it used to blink anyway, which trained the eye to ignore
    // the one LED that is supposed to mean "look at me". Blink is now the exception.
    bool reachable = apClients() > 0;
#if HAS_HOME_NETWORK
    reachable = reachable || staUp;
#endif
    ledWifi = (wifiOk && reachable) ? LED_MODE_ON : LED_MODE_BLINK;
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
// Read-only endpoints stay wide open. The wildcard is deliberate: the same
// dashboard bundle is also published over HTTPS as a demo, and a browser there
// must at least be able to try.
void sendCors() {
  server.sendHeader("Access-Control-Allow-Origin", "*");
}

// Headers put on every embedded page. None of them make an http:// origin a
// secure context — only real TLS does that, and a station on a private IP cannot
// hold a CA-signed certificate — but they are the part that is actually free.
// Permissions-Policy explicitly *allows* geolocation for our own origin so the
// browser's own gate is the only thing left in the way, and shuts the doors
// nothing here uses.
void sendPageSecurity() {
  server.sendHeader("X-Content-Type-Options", "nosniff");
  server.sendHeader("Referrer-Policy", "no-referrer");
  server.sendHeader("Permissions-Policy",
                    "geolocation=(self), camera=(), microphone=(), usb=(), payment=()");
  // https: is needed wholesale in img/connect: the world map pulls live warnings
  // from api.weather.gov and radar rasters from NOAA, and those hostnames are not
  // ours to pin. 'unsafe-inline' for styles because the whole dashboard is styled
  // with inline style attributes on purpose — see the note in wind-dashboard.jsx.
  server.sendHeader("Content-Security-Policy",
                    "default-src 'self'; script-src 'self'; "
                    "style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; "
                    "connect-src 'self' https:; font-src 'self'; "
                    "object-src 'none'; base-uri 'none'; frame-ancestors 'none'");
}

// Guard for endpoints that change something. The threat is not a neighbour on the
// LAN, it is any page the phone already has open: this API takes plain GETs, so a
// random site can point a request at 192.168.4.1/api/led and the browser will
// send it. A wildcard Access-Control-Allow-Origin hides the *reply* from that
// script and does nothing to stop the request from arriving and taking effect.
// With /api/at on the board that request could send an SMS.
//
// A same-origin GET from our own dashboard carries no Origin header at all, so
// "Origin present and not ours" is exactly the cross-site case and nothing else.
// One string compare, no password to type on a phone keyboard, no state to store.
// localhost is allowed on purpose: that is `npm run dev` pointed at a real board,
// and losing it would cost more than the guard is worth.
bool crossSiteWrite() {
  if (!server.hasHeader("Origin")) return false;
  String o = server.header("Origin");
  if (o == "null") return false;                                  // file:// and sandboxes
  if (o == String("http://") + portalHost)             return false;
  if (o == "http://" + WiFi.softAPIP().toString())     return false;
  if (WiFi.status() == WL_CONNECTED &&
      o == "http://" + WiFi.localIP().toString())      return false;
  if (o.startsWith("http://localhost:") ||
      o.startsWith("http://127.0.0.1:"))               return false;
  sendCors();
  server.send(403, "text/plain", "cross-site request refused\n");
  Serial.printf("HTTP: refused cross-site write from %s\n", o.c_str());
  return true;
}

// Where the station physically is. The coordinates have sat in secrets.h unused
// since they were added -- nothing on the board needed them. The world map does:
// it has to centre on something, and on a copy served over plain http:// the
// browser flatly refuses to hand out the *viewer's* position, so the *station's*
// is the only real coordinate in reach. Served at full precision because this is
// the owner's own device on the owner's own network; the rounding rule in the docs
// is about what goes into git, not about what the board tells its own dashboard.
//
// 0/0 means "not configured" rather than the Gulf of Guinea, and the dashboard
// reads it that way.
void handleSite() {
  sendCors();
  String j = "{";
  j += "\"lat\":"  + String((double)SECRET_STATION_LAT, 5) + ",";
  j += "\"lon\":"  + String((double)SECRET_STATION_LON, 5) + ",";
  j += "\"altM\":" + String((double)SECRET_STATION_ALT_M, 1) + ",";
  j += "\"host\":\"" + String(portalHost) + "\"";
  j += "}";
  server.send(200, "application/json", j);
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
  // Uplink status. Added fields, not changed ones — a dashboard build that predates
  // them ignores what it does not know. staIp is the only way to learn the address
  // the board answers on at home without opening the router or a serial console.
  // staSsid is which network of the list actually answered, so it is read from the
  // driver rather than from homeNetworks[] — with several candidates the constant
  // would only say which one was tried last.
#if HAS_HOME_NETWORK
  json += "\"staSsid\":"        + (staUp ? "\"" + WiFi.SSID() + "\"" : String("null")) + ",";
  json += "\"staConnected\":"   + String(staUp ? "true" : "false") + ",";
  json += "\"staIp\":"          + (staUp ? "\"" + WiFi.localIP().toString() + "\"" : String("null")) + ",";
#else
  json += "\"staSsid\":null,";
  json += "\"staConnected\":false,";
  json += "\"staIp\":null,";
#endif
  // The address to show a human, not the mDNS label — this is what the dashboard
  // prints as "станция доступна по адресу".
  json += "\"hostname\":\""     + String(portalHost) + "\",";
  json += "\"uptime\":"         + String(millis() / 1000) + ",";
  json += "\"resetReason\":\""  + String(resetReasonName()) + "\"";
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
  if (crossSiteWrite()) return;
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
  if (crossSiteWrite()) return;
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
  if (crossSiteWrite()) return;
  windGust = windSpeed;
  gustResetTimer = millis();
  sendCors();
  server.send(200, "text/plain", "OK");
}

// Read-only. add/del/connect are still gone: the uplink is a compile-time constant,
// not something to type into a form, so there remains nothing here to configure.
// That is why "apOnly" stays true even with the uplink built in — the dashboard
// reads that flag as "no network settings to show", which is still the truth, and
// flipping it would make the old baked-in UI offer an editor backed by endpoints
// that no longer exist. "nets":[] and "max":0 are preserved for the same reason.
// The uplink* fields are additive; a dashboard that predates them ignores them.
void handleWifiControl() {
  String json = "{";
  json += "\"mode\":\"ap\",";
  json += "\"apOnly\":true,";
  json += "\"current\":\"" + String(apSsid) + "\",";
  json += "\"ip\":\"" + WiFi.softAPIP().toString() + "\",";
  json += "\"clients\":" + String(apClients()) + ",";
  json += "\"host\":\"" + String(portalHost) + "\",";
#if HAS_HOME_NETWORK
  json += "\"uplinkSsid\":" + (staUp ? "\"" + WiFi.SSID() + "\"" : String("null")) + ",";
  json += "\"uplinkConnected\":" + String(staUp ? "true" : "false") + ",";
  json += "\"uplinkIp\":" + (staUp ? "\"" + WiFi.localIP().toString() + "\"" : String("null")) + ",";
  json += "\"uplinkRssi\":" + String(staUp ? WiFi.RSSI() : 0) + ",";
  // Names only, never passwords. Answers "which networks will this build even try",
  // which is otherwise only visible by reading the source or the serial log.
  json += "\"uplinkKnown\":[";
  for (int i = 0; i < homeNetworkCount; i++) {
    if (i) json += ",";
    json += "\"" + String(homeNetworks[i].ssid) + "\"";
  }
  json += "],";
#else
  json += "\"uplinkSsid\":null,";
  json += "\"uplinkConnected\":false,";
  json += "\"uplinkIp\":null,";
  json += "\"uplinkRssi\":0,";
  json += "\"uplinkKnown\":[],";
#endif
  // Последние приходы и уходы клиентов точки. Читается с ноутбука, пока телефон
  // пытается подключиться: снаружи «Connecting…» и тишина, а здесь причина отказа
  // числом. `ago` — секунд назад, чтобы не сверять миллисекунды с аптаймом.
  json += "\"apLog\":[";
  for (uint8_t i = 0; i < apEventCount; i++) {
    // Свежие сверху: идём назад от последней записи.
    uint8_t idx = (apEventNext + AP_LOG_N - 1 - i) % AP_LOG_N;
    const ApEvent& e = apEventLog[idx];
    char mac[18];
    snprintf(mac, sizeof(mac), "%02x:%02x:%02x:%02x:%02x:%02x",
             e.mac[0], e.mac[1], e.mac[2], e.mac[3], e.mac[4], e.mac[5]);
    if (i) json += ",";
    json += "{\"ago\":" + String((millis() - e.ms) / 1000);
    json += ",\"mac\":\"" + String(mac) + "\"";
    json += ",\"event\":\"" + String(e.joined ? "join" : "leave") + "\"";
    if (!e.joined) {
      json += ",\"reason\":" + String(e.reason);
      json += ",\"why\":\"" + String(WiFi.STA.disconnectReasonName((wifi_err_reason_t)e.reason)) + "\"";
    }
    json += "}";
  }
  json += "],";
  json += "\"max\":0,";
  json += "\"nets\":[]}";

  sendCors();
  server.send(200, "application/json", json);
}

#if HAS_MODEM
// ===== MODEM AT CONSOLE =====
// (Re)opens UART2 on whatever pins and baud are currently in force. Called once from
// setup() and again from handleAt when either is changed at runtime. end() first, so the
// old pins are released instead of being left driven — moving TX without that would
// leave the previous pin parked HIGH.
static void modemUartStart() {
  Serial2.end();
  // 1 kB instead of the driver's 256 B: at 115200 the default holds only ~22 ms of
  // traffic, and one OTA handshake is longer than that, so a running NMEA stream would
  // lose characters in the gap. Must be called before begin().
  Serial2.setRxBufferSize(1024);
  Serial2.begin(modemBaud, SERIAL_8N1, modemPinRx, modemPinTx);
  Serial.printf("Modem: UART2 RX=GPIO%u TX=GPIO%u @%lu\n", modemPinRx, modemPinTx, modemBaud);
}

// Drains the modem UART into modemBuf. Runs every pass through loop() and never blocks —
// the same rule serviceUplink() and sseFlush() follow, and for the same reason: anything
// that waits in here starves the 50 Hz sensor and the SSE stream along with it. Capped
// per call so an NMEA stream cannot stretch one pass into something loopMax will notice.
static void modemPump() {
  int budget = 512;
  while (Serial2.available() && budget-- > 0) {
    if (modemLen >= MODEM_BUF_CAP) {
      // Keep the tail, and pay one memmove for it rather than shifting per byte.
      memmove(modemBuf, modemBuf + MODEM_BUF_CAP / 2, MODEM_BUF_CAP / 2);
      modemLen = MODEM_BUF_CAP / 2;
    }
    modemBuf[modemLen++] = (char)Serial2.read();
    modemRxTotal++;
  }
}

// True once the buffer ends in a final result code. Lets a command return the moment the
// modem is done instead of always burning the whole timeout — real answers land in
// 20-60 ms, so the full wait is only ever paid by a command that got no reply at all.
// The LAST LINE is tested rather than the tail of the buffer, because "+CME ERROR: 10"
// ends in a number and would never match a word.
static bool modemAnswered() {
  size_t end = modemLen;
  while (end > 0 && (modemBuf[end - 1] == '\r' || modemBuf[end - 1] == '\n')) end--;
  if (end == 0) return false;
  size_t start = end;
  while (start > 0 && modemBuf[start - 1] != '\n' && modemBuf[start - 1] != '\r') start--;
  const char* line = modemBuf + start;
  size_t n = end - start;
  if (n == 2  && memcmp(line, "OK",    2) == 0) return true;
  if (n == 5  && memcmp(line, "ERROR", 5) == 0) return true;
  if (n >= 10 && (memcmp(line, "+CME ERROR", 10) == 0 ||
                  memcmp(line, "+CMS ERROR", 10) == 0)) return true;
  if (line[0] == '>') return true;   // waiting for SMS text
  return false;
}

// AT console for the 4G/GPS module, over the network instead of over a cable. It exists
// because the module sits label-down on the breadboard with its own micro-USB facing the
// table: the UART pair is the only way in, and the alternative was flashing a bridge
// sketch that would have taken the whole station (dashboard, OTA, telemetry) with it.
//
//   GET  /api/at?cmd=AT%2BCSQ   from a browser's address bar. "+" MUST be written %2B —
//                               WebServer decodes a literal + as a space.
//   POST /api/at                body = the raw command, Content-Type: text/plain. No
//                               escaping. The content type matters: with curl's default
//                               form type the body is form-decoded and + becomes a space
//                               all over again.
//   GET  /api/at                no command — collect whatever the modem said since:
//                               URCs, the NMEA stream, the answer to a slow command.
//   &wait=N                     how long to wait for the reply, ms (default 500, clamped
//                               to 0..3000). AT+COPS=? can take two minutes: fire it with
//                               wait=0 and pick the answer up afterwards. That is the
//                               whole reason the buffer outlives the request.
//   &pins=RX,TX                 re-open UART2 on other pins, e.g. pins=26,25. Only 25, 26
//                               and 27 are accepted — the three this harness can plausibly
//                               sit on. Which of the two wires landed on which pin is a
//                               coin flip, and guessing wrong otherwise costs a USB
//                               session with the buttons.
//   &baud=N                     re-open at another rate (9600..921600). A modem answering
//                               at the wrong baud is indistinguishable from one that is
//                               not wired at all.
//
// Both are RAM only, same rule as /api/zero: the combination that works has to go back
// into PIN_MODEM_RX / PIN_MODEM_TX / MODEM_BAUD to survive a reboot.
//
// The wait DOES block loop() for its duration — up to 3 s of frozen dashboard if asked
// for. That is a deliberate, operator-initiated, bounded stall and it shows up honestly
// in loopMax; it is a different animal from the unbounded block on a lagging SSE client
// that sseFlush() exists to avoid.
//
// Deliberately NOT wrapped in sendCors(): every other endpoint is read-only telemetry,
// while a command here can send an SMS or reset the modem. Without the header a page open
// in a browser on this network can still fire a request blind, but it cannot read the
// reply — so it cannot lift the IMEI, the ICCID or the SIM contents out of a foreign tab.
// That narrows the hole. HAS_MODEM 0 is what closes it.
void handleAt() {
  if (crossSiteWrite()) return;
  // Re-wiring first, so ?pins=26,25&cmd=AT does both in one request.
  bool reopen = false;
  if (server.hasArg("pins")) {
    String v = server.arg("pins");
    int comma = v.indexOf(',');
    if (comma > 0) {
      int rx = v.substring(0, comma).toInt();
      int tx = v.substring(comma + 1).toInt();
      // Whitelist, not a range check: an arbitrary number here would let a query string
      // point the UART at an LED or a strapping pin.
      bool okRx = (rx == 25 || rx == 26 || rx == 27);
      bool okTx = (tx == 25 || tx == 26 || tx == 27);
      if (okRx && okTx && rx != tx) { modemPinRx = rx; modemPinTx = tx; reopen = true; }
    }
  }
  if (server.hasArg("baud")) {
    long b = server.arg("baud").toInt();
    if (b >= 9600 && b <= 921600) { modemBaud = (unsigned long)b; reopen = true; }
  }
  if (reopen) { modemUartStart(); modemLen = 0; }

  String cmd;
  if (server.hasArg("plain"))     cmd = server.arg("plain");   // POST body, not form-decoded
  else if (server.hasArg("cmd"))  cmd = server.arg("cmd");
  cmd.trim();

  unsigned long waitMs = 500;
  if (server.hasArg("wait")) waitMs = (unsigned long)constrain(server.arg("wait").toInt(), 0L, 3000L);

  String out;
  unsigned long waited = 0;

  if (cmd.length()) {
    modemLen = 0;              // the reply to THIS command and nothing older
    Serial2.print(cmd);
    Serial2.write('\r');       // SIMCom terminates on a bare CR, never on LF
    unsigned long t0 = millis();
    while (millis() - t0 < waitMs) {
      modemPump();
      if (modemAnswered()) break;
      delay(2);                // vTaskDelay under the hood — the WiFi stack keeps running
    }
    waited = millis() - t0;
    out = "> " + cmd + "\n";
  } else {
    modemPump();
  }

  // Raw bytes, not JSON: this is a console, and escaping a modem's CR/LF into a string
  // literal makes every answer harder to read for no gain in a browser.
  out.reserve(out.length() + modemLen + 96);
  for (size_t i = 0; i < modemLen; i++) out += modemBuf[i];
  // "uart=" is here so a silent modem is never ambiguous about which pins were listening.
  out += "\n-- buf=" + String(modemLen) + " total=" + String(modemRxTotal)
       + " waited=" + String(waited) + "ms"
       + " uart=RX" + String(modemPinRx) + "/TX" + String(modemPinTx)
       + "@" + String(modemBaud) + "\n";

  server.send(200, "text/plain", out);
}
#endif

// ===== NETWORK SERVICES =====
// mDNS + OTA start once, right after the AP is up — the AP's subnet is ours and
// fixed at 192.168.4.x, so on that interface nothing ever needs re-announcing and
// the old servicesStarted guard has nothing left to guard. The one exception is
// mDNS when an uplink appears later: serviceUplink() restarts it so the name also
// answers on the home network.
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

#if HAS_HOME_NETWORK
// Uplink state machine, polled from loop(). Deliberately never blocks: WiFi.begin()
// only kicks the association off, and the result is read on a later pass. The old
// station mode's 30-second blocking wifiMulti.run() is exactly what this avoids —
// it used to freeze the dashboard and starve readSensors() for whole seconds.
//
// The AP is not touched anywhere in here. There is no path in this function that
// can take the station off the air.
//
// A search is scan first, associate second, and that order is the whole point. The
// old version walked homeNetworks[] blind, calling WiFi.begin() on each name in turn
// and waiting STA_ASSOC_MS for silence — six names cost 72 s of the AP's channel
// every time the board was switched on away from home. Asking the air once who is
// actually there costs ~1.6 s and answers for the whole list at once, and when the
// answer is "none of yours" the search ends without touching the station interface.
//
// Order is preference: of the known networks the scan found, the earliest one in
// homeNetworks[] wins, not the loudest. The list is written by preference and that
// is the meaning it should keep.
void serviceUplink() {
  bool now = (WiFi.status() == WL_CONNECTED);

  if (now != staUp) {
    staUp = now;
    if (now) {
      staBackoffMs = STA_RETRY_MIN_MS;   // a good link earns a fast retry next time
      staNoneInRange = false;            // and the surroundings are evidently ours
      staTrying = -1;                    // the attempt this link came from is over
      Serial.printf("Uplink '%s' joined  IP: %s  RSSI=%d\n",
                    WiFi.SSID().c_str(), WiFi.localIP().toString().c_str(), WiFi.RSSI());
      // mDNS was started when the AP was the only interface, so its responder is
      // bound to that one and the name stays invisible from the house. Restarting
      // it now re-announces on both.
      MDNS.end();
      if (MDNS.begin(hostname)) {
        MDNS.addService("http", "tcp", 80);
        Serial.printf("mDNS: http://%s.local (also on the home network)\n", hostname);
      }
      // Joining brought the station interface up and moved the AP to the router's
      // channel — both are driver re-inits, and the radio tuning from setup() is
      // exactly the kind of setting that does not always survive one. Cheap to
      // reassert, and silently losing half the TX power here would look like
      // "the AP got weaker after a while" and be almost impossible to trace.
      WiFi.setSleep(false);
      WiFi.setTxPower(WIFI_POWER_21dBm);
    } else {
      Serial.println("Uplink lost — AP unaffected");
      staNextAttempt = millis() + staBackoffMs;
    }
  }

  if (now) return;

  // ----- an association is in flight -----
  if (staTrying >= 0) {
    wl_status_t st = WiFi.status();
    // Only a status that has MOVED since begin() says anything about this attempt.
    // begin() does not clear the previous one, so "no such network" left over from
    // the last candidate would otherwise abort a join to a network the scan has
    // just seen — on the first pass through loop(), before the radio has done
    // anything at all. When the verdict repeats unchanged the deadline catches it
    // instead: slower, and never wrong.
    bool refused = (st != staStatusAtBegin) && (st == WL_NO_SSID_AVAIL || st == WL_CONNECT_FAILED);
    // Signed comparison so the wrap of millis() at 49.7 days cannot park this forever.
    if (!refused && (long)(millis() - staAssocDeadline) < 0) return;
    Serial.printf("Uplink: '%s' %s\n", homeNetworks[staTrying].ssid,
                  refused ? "refused the join" : "did not answer in time");
    staTrying = -1;
    // The driver keeps retrying an association it started unless it is told to stop,
    // and those retries are off-channel time nobody asked for. This is the one
    // WiFi.disconnect() outside setup(); false/false means station interface only
    // and no NVS write, so the AP does not notice it happened.
    WiFi.disconnect(false, false);
    staNextAttempt = millis() + staBackoffMs;
    if (staBackoffMs < STA_RETRY_MAX_MS) staBackoffMs = min(staBackoffMs * 2, STA_RETRY_MAX_MS);
    return;
  }

  // ----- a scan is in flight -----
  if (staScanning) {
    int n = WiFi.scanComplete();
    if (n == WIFI_SCAN_RUNNING) return;
    staScanning = false;
    if (n < 0) {
      Serial.println("Uplink: scan failed — nothing learned, will look again");
      WiFi.scanDelete();
      staNextAttempt = millis() + STA_RETRY_MIN_MS;
      return;
    }

    // Earliest entry in homeNetworks[] that the scan actually saw. Its channel and
    // BSSID are copied out before scanDelete() frees the results — handing both to
    // begin() keeps the association on one channel instead of hunting for the name.
    int best = -1, bestScan = -1;
    for (int i = 0; i < n && best != 0; i++) {
      String found = WiFi.SSID(i);
      for (int k = 0; k < homeNetworkCount; k++) {
        if ((best < 0 || k < best) && found.equals(homeNetworks[k].ssid)) { best = k; bestScan = i; }
      }
    }
    int32_t ch = 0;
    uint8_t bssid[6] = {0};
    if (best >= 0) {
      ch = WiFi.channel(bestScan);
      memcpy(bssid, WiFi.BSSID(bestScan), 6);
    }
    WiFi.scanDelete();   // the result table is heap this station has better uses for

    if (best < 0) {
      // Nothing of ours on the air. This is the field, and there is nothing here to
      // associate to — so do not spend a single WiFi.begin() proving it.
      if (!staNoneInRange) Serial.printf("Uplink: none of the %d known networks on the air\n",
                                         homeNetworkCount);
      staNoneInRange = true;
      staNextAttempt = millis() + staBackoffMs;
      if (staBackoffMs < STA_RETRY_MAX_MS) staBackoffMs = min(staBackoffMs * 2, STA_RETRY_MAX_MS);
      return;
    }

    staNoneInRange = false;
    Serial.printf("Uplink: '%s' is on channel %d, joining\n", homeNetworks[best].ssid, (int)ch);
    WiFi.begin(homeNetworks[best].ssid, homeNetworks[best].password, ch, bssid);
    staTrying = best;
    staStatusAtBegin = WiFi.status();
    staAssocDeadline = millis() + STA_ASSOC_MS;
    return;
  }

  // ----- idle: is it time to look again? -----
  if ((long)(millis() - staNextAttempt) < 0) return;

  // Somebody is on the AP right now and the last look found nothing of ours: the
  // board is out in a field being used, exactly the case where a scan can only
  // interrupt the one client that matters for a network that is not there. Check
  // again when they leave. This is why the search must be cheap AND skippable —
  // cheap alone still puts a 1.6 s hole in the middle of somebody's session.
  if (staNoneInRange && apClients() > 0) {
    staNextAttempt = millis() + STA_RETRY_MIN_MS;
    return;
  }

  // Async: scanComplete() is read on a later pass, so loop() keeps serving. Active
  // scan, hidden networks not asked for — a hidden SSID is not one of ours.
  if (WiFi.scanNetworks(true, false, false, STA_SCAN_MS_PER_CHAN) == WIFI_SCAN_RUNNING) {
    staScanning = true;
  } else {
    staNextAttempt = millis() + STA_RETRY_MIN_MS;   // driver busy; ask again shortly
  }
}
#endif

// ===== SETUP =====
void setup() {
  // Before Serial.begin — the UART divisor is derived from the CPU clock, so changing
  // the frequency afterwards would garble the console. Normally already 240 MHz from
  // the core's default sdkconfig; pinned here so a board profile that boots at 80 MHz
  // cannot quietly stretch every ADC burst and JSON build.
  setCpuFrequencyMhz(240);

  Serial.begin(115200);
  Serial.println("\n=== Wind Station ===");

#if HAS_MODEM
  // Below setCpuFrequencyMhz() for exactly the reason Serial is: the UART divisor comes
  // from the CPU clock.
  modemUartStart();
  Serial.println("Modem: AT console on /api/at");
#endif

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

  Serial.printf("Last reset: %s\n", resetReasonName());

  analogReadResolution(12);
  analogSetPinAttenuation(PIN_WIND_SPEED, ADC_11db);
  analogSetPinAttenuation(PIN_WIND_DIR,   ADC_11db);
  analogSetPinAttenuation(PIN_BATTERY,    ADC_11db);

  // The WiFi driver keeps its own copy of the last STA credentials in NVS and joins
  // that network by itself the moment station mode starts — including credentials
  // left by some earlier build, which survive every OTA update because the nvs
  // partition is never rewritten. The uplink below must be the one in this source
  // and nothing else, so bring STA up once, wipe the stored config (the second
  // argument of disconnect() is eraseap), and only then set the working mode.
  // Order matters: persistent(false) first would route the erase to RAM and leave
  // the credentials sitting in flash.
  WiFi.mode(WIFI_STA);
  WiFi.disconnect(true, true);
  WiFi.persistent(false);   // nothing this firmware does should write creds back
#if HAS_HOME_NETWORK
  WiFi.mode(WIFI_AP_STA);
#else
  WiFi.mode(WIFI_AP);
#endif
  WiFi.setHostname(hostname);       // before begin(): this is the name DHCP is told
  WiFi.softAPsetHostname(hostname);

  // WPA2-protected AP on the default 192.168.4.1/24. Channel 1, not hidden: hiding
  // an SSID stops nobody who can run a scanner and mostly annoys phones, the
  // passphrase is what actually keeps strangers out.
  apUp = WiFi.softAP(apSsid, apPassword, 1 /*channel*/, 0 /*hidden*/, apMaxClients);

  // Association and its failure, straight from the driver. The reason code is the
  // whole point: 15 (4WAY_HANDSHAKE_TIMEOUT) is a wrong passphrase, 5 (ASSOC_TOOMANY)
  // is a full AP, 2 and 4 are the client giving up on a radio that was elsewhere.
  // Printed to Serial and kept in the ring for /api/wifi.
  WiFi.onEvent([](arduino_event_id_t, arduino_event_info_t info) {
    const uint8_t* m = info.wifi_ap_staconnected.mac;
    apEventPush(m, true, 0);
    Serial.printf("AP: %02x:%02x:%02x:%02x:%02x:%02x joined (%d on the air)\n",
                  m[0], m[1], m[2], m[3], m[4], m[5], apClients());
  }, ARDUINO_EVENT_WIFI_AP_STACONNECTED);

  WiFi.onEvent([](arduino_event_id_t, arduino_event_info_t info) {
    const uint8_t* m = info.wifi_ap_stadisconnected.mac;
    uint16_t r = info.wifi_ap_stadisconnected.reason;
    apEventPush(m, false, r);
    Serial.printf("AP: %02x:%02x:%02x:%02x:%02x:%02x left — reason %u (%s)\n",
                  m[0], m[1], m[2], m[3], m[4], m[5], r,
                  WiFi.STA.disconnectReasonName((wifi_err_reason_t)r));
  }, ARDUINO_EVENT_WIFI_AP_STADISCONNECTED);

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
    // Same story as dtim_period, same cause: APClass::create() memsets wifi_config_t
    // and never restores pmf_cfg, so an AP that IDF would have built as
    // {capable = true, required = false} goes on the air advertising no management
    // frame protection at all. Restored to the documented default rather than raised
    // above it — capable lets a client that wants PMF have it, required would lock
    // out anything that does not.
    apConf.ap.pmf_cfg.capable  = true;
    apConf.ap.pmf_cfg.required = false;
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
  //
  // Asks for the top of the enum rather than a value known to be reachable: the
  // driver clamps to whatever the PHY and the calibration data actually allow, so
  // this yields the chip's ceiling instead of a guess about it. Which is why the
  // result is read back and printed — the number in the log is measured, not assumed.
  WiFi.setTxPower(WIFI_POWER_21dBm);
  Serial.printf("TX power: %.1f dBm (asked for the maximum the radio allows)\n",
                (int)WiFi.getTxPower() / 4.0);

  if (apUp) {
    startNetworkServices();
  } else {
    // softAP() only fails if the radio itself refused to start — the station is
    // then unreachable by any route, so the error LED is the only way to say so.
    Serial.println("softAP() FAILED — no network");
    digitalWrite(PIN_LED_ERROR, HIGH);
  }

#if HAS_HOME_NETWORK
  // Kicked off last and never waited on: setup() must not spend seconds here, and
  // whether the home network answers changes nothing about the AP that is already
  // serving. serviceUplink() picks up the result on a later pass through loop().
  //
  // One radio, one channel: the AP came up on channel 1, and when the uplink
  // associates to a router on another channel the AP follows it there. Clients on
  // the AP drop and rejoin once for that — unavoidable on a single-radio part, and
  // the reason this is the last thing setup() does. Away from home no association
  // happens at all (serviceUplink() scans before it joins), so the AP keeps
  // channel 1 and a phone has a still target to aim at.
  WiFi.setAutoReconnect(false);   // serviceUplink() owns retries, see staBackoffMs
  // No WiFi.begin() here on purpose: staNextAttempt in the past makes the first pass
  // through loop() start the search, so the list is walked by one piece of code
  // instead of two that could disagree about which candidate is next.
  staNextAttempt = millis();
  Serial.printf("Uplink: %d known network(s), scanning for them in the background (2.4 GHz only)\n",
                homeNetworkCount);
#endif

  // WebServer keeps only the headers it is told to keep, and crossSiteWrite()
  // needs Origin. Without this call server.header("Origin") is always empty and
  // the guard silently passes everything.
  static const char* kCollect[] = { "Origin" };
  server.collectHeaders(kCollect, 1);

  server.on("/api/site",   HTTP_GET, handleSite);
  server.on("/api/data",   HTTP_GET, handleData);
  server.on("/api/stream", HTTP_GET, handleStream);
  server.on("/api/led",    HTTP_GET, handleLedControl);
  server.on("/api/gust",   HTTP_GET, handleResetGust);
  server.on("/api/zero",   HTTP_GET, handleZero);
  server.on("/api/wifi",   HTTP_GET, handleWifiControl);
#if HAS_MODEM
  // Same handler both ways: GET carries the command in ?cmd= for a browser, POST carries
  // it raw in the body for a terminal. See handleAt for why both forms exist.
  server.on("/api/at",     HTTP_GET,  handleAt);
  server.on("/api/at",     HTTP_POST, handleAt);
#endif
  // Embedded dashboard: "/" is index.html, the rest are its hashed assets.
  for (size_t i = 0; i < WEB_ASSET_COUNT; i++) {
    const WebAsset* a = &WEB_ASSETS[i];
    server.on(a->path, HTTP_GET, [a]() {
      server.sendHeader("Content-Encoding", "gzip");
      server.sendHeader("Cache-Control", a->cacheControl);
      sendPageSecurity();
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
    // Файлы дашборда — исключение из перехвата, и это не мелочь. Имена у них
    // с хэшем: после каждой прошивки они новые, а браузер может держать в кэше
    // прежнюю index.html и просить по старому имени. Уйди такой запрос на
    // портал, браузер получил бы в ответ HTML вместо JavaScript, подавился бы
    // им и не нарисовал ничего — пустой экран с одним фоном, без единого
    // внятного сообщения. Честный 404 говорит браузеру правду.
    if (server.uri().startsWith("/assets/")) {
      server.send(404, "text/plain", "no such asset");
      return;
    }
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

#if HAS_MODEM
  // Every pass, not on a timer: the driver's ring holds well under a second of a running
  // NMEA stream, and what is not drained in time is simply lost.
  modemPump();
#endif

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

  // The AP itself has nothing to service — it has no uplink that can drop, so the
  // manual switch, the 3-minute fallback AP and the 30 s blocking wifiMulti.run()
  // that used to sit here are gone for good. What is left is the optional uplink,
  // and it is a different thing entirely: no rescan, no blocking call, and no
  // authority over the AP. Unthrottled because a pass costs one cached status read;
  // the expensive part, WiFi.begin(), is behind staNextAttempt.
#if HAS_HOME_NETWORK
  serviceUplink();
#endif

  unsigned long elapsed = millis() - loopStart;
  if (elapsed > loopMaxMs) loopMaxMs = elapsed;
}
