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
#include <PPP.h>          // 4G uplink through the A7670E — see serviceModem()
#include <lwip/sockets.h> // lwip_send — the SSE frame goes out non-blocking, see sseFlush()
                          // and the interface-pinned reachability probe in modemProbe()
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

// The cloud channel is compiled in only when secrets.h says so, which is why these
// includes sit below it rather than with the others. All three ship inside the ESP32
// core already — esp-mqtt as libmqtt.a, mbedTLS for the command signatures, esp_random
// for the session nonce — so there is nothing to install and no library manager entry.
#if SECRET_HAS_CLOUD
  #include "mqtt_client.h"
  #include "mbedtls/md.h"
  #include "esp_random.h"
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

// v4: LEDs moved to the ESP32 bottom pin row, 220Ω resistors now on the board.
// Old top-row pins were 26/27/14/25/33. GPIO4/16/17/18 are plain GPIO; GPIO5 is a strapping pin
// (must be HIGH at boot) — an LED-to-GND via 220Ω doesn't hold it low, so it only flickers briefly
// at power-up. Harmless: assigned to WiFi LED, which is meant to be off until WiFi is up anyway.
// Breadboard columns below are for the 38-pin DevKitC (schematic v8, board seated from column 1);
// on the old 30-pin board the same five pins sat two columns to the left, in 5..9.
#define PIN_LED_RED       4   // Red — wind > 15 m/s OR battery 10-30% (blink <10%) (col 7, was 14)
#define PIN_LED_YELLOW   16   // Yellow — wind > 5 m/s OR battery 30-60%            (col 8, was 27)
#define PIN_LED_GREEN    17   // Green — battery > 60% (was "station OK")           (col 9, was 26)
#define PIN_LED_WIFI      5   // Green — solid when reachable (AP client or uplink)  (col 10, was 25; strapping, boot flicker)
#define PIN_LED_ERROR    18   // Red — error (ADC/WiFi)                             (col 11, was 33)

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
//   col 37 = "R" = modem RXD  <- GPIO27 (this board's TX)
//   col 38 = "T" = modem TXD  -> GPIO25 (this board's RX)
// The letters deliberately do NOT match across the link — this board's TX drives the
// modem's RX. Swapping the pair leaves both ends deaf and looks exactly like a dead
// modem, so the letters are spelled out here and not only in the wiring diagram.
//
// Third layout for the same two wires, and every time the copper won: v6 was drawn for
// 27/26, on the 30-pin board the harness actually landed on 26/25, and on the 38-pin board
// (schematic v8) it lands on 27/25. So GPIO26 is now the free one and sits BETWEEN the two
// wires — nothing may be plugged into it, or the pair drifts apart again. GPIO33 stays
// reserved for the P-FET gate that will cut modem power.
//
// Both are ADC2 pins, which is allowed: the ADC2-vs-WiFi conflict is about analog reads
// only, and these two are a UART. Same exemption as GPIO4 (LED) and GPIO13 (CHRG).
#define PIN_MODEM_RX     25   // ESP32 receives here          (breadboard col 11)
#define PIN_MODEM_TX     27   // ESP32 sends here             (breadboard col 9)
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
// coming back on GPIO25 — wrong pin, wrong baud, or the modem has no power.
unsigned long modemRxTotal = 0;

// ===== 4G UPLINK (PPP) =====
// Turns the AT console into an actual network interface: esp-modem drives the same two
// wires, dials the operator and hands lwIP a routable address. A separate flag from
// HAS_MODEM because the two really are independent — a modem on the bench is worth
// talking to long before it is worth routing traffic through, and this is the switch
// that gives the UART back to the console if PPP itself turns out to be the problem.
#define MODEM_USE_PPP 1

#if MODEM_USE_PPP
// Not a secret and deliberately not in secrets.h: the operator hands this string to
// anyone who registers on the network, and a wrong APN has to be readable while
// debugging rather than hidden behind a macro. The network volunteered it itself during
// step 0b — it is not guessed.
#define MODEM_APN "internet.mnc003.mcc255.gprs"

// Retry cadence. The first attempt is cheap because the usual failure is "the modem has
// not finished booting yet"; the ceiling is long because the usual PERSISTENT failure is
// "there is no LTE here at all", and a modem that cannot register burns ~0.1 A doing it.
// Same shape and the same ceiling as the WiFi uplink's backoff, for the same reason.
const unsigned long MODEM_RETRY_MIN_MS   = 15000;
const unsigned long MODEM_RETRY_MAX_MS   = 600000;   // 10 min
// Attachment is re-checked on a timer, not every pass: each check is a real AT+CGATT?
// round trip down the UART, and at 50 Hz that would be a permanent conversation.
const unsigned long MODEM_ATTACH_POLL_MS = 2000;
// Registration is neither instant nor guaranteed. Past this the DCE is torn down and the
// whole thing starts over: a module that has sat unattached for two minutes with a live
// SIM is wedged, not slow, and only a fresh bring-up clears that.
const unsigned long MODEM_ATTACH_MAX_MS  = 120000;
// From "CMUX is up" to "IPCP gave us an address". This part is out of our hands — it is
// the operator's PPP peer answering — and 45 s is several times the worst seen by hand.
const unsigned long MODEM_DIAL_MAX_MS    = 45000;
// How long the pre-flight AT waits for any answer at all before an attempt is abandoned.
// A modem that is awake replies in 10-20 ms, so this is generous by an order of magnitude
// and still two orders cheaper than letting PPP.begin() find out the hard way.
const unsigned long MODEM_PREFLIGHT_MS   = 300;

// Where the reachability probe knocks: 8.8.8.8:53. TCP, not ICMP, because a TCP connect
// is what the station will actually do for MQTT, and because lwIP gives us a raw socket
// but no ping. An address literal on purpose — resolving a name first would confuse "no
// route" with "no DNS", and those two failures have completely different fixes.
const uint32_t      MODEM_PROBE_ADDR     = 0x08080808;
const uint16_t      MODEM_PROBE_PORT     = 53;
const unsigned long MODEM_PROBE_MS       = 4000;
// Time over the modem, checked separately from the TCP reachability probe — see
// modemNtpProbe() for why a synced clock at home proves nothing about the 4G link.
// 216.239.35.0 = time1.google.com, an anycast address, used as a number so the check
// never depends on the resolver.
const uint32_t      MODEM_NTP_ADDR       = 0xD8EF2300;
const unsigned long MODEM_NTP_MS         = 4000;

// Where the bring-up is. Named states rather than a pile of booleans because the whole
// point of this machine is that /api/modem can say exactly which step is stuck, and
// "attached but never dialled" and "dialled but no address" are different faults.
enum ModemPppState : uint8_t {
  MODEM_PPP_STOPPED,    // the console owns the UART: nothing tried yet, or PPP released
  MODEM_PPP_ATTACHING,  // DCE up and answering AT, waiting for the network to attach
  MODEM_PPP_DIALING,    // CMUX entered, waiting for the PPP peer to negotiate an address
  MODEM_PPP_ONLINE,     // address in hand, the interface is usable
  MODEM_PPP_FAILED      // gave up; sitting out the backoff before trying again
};
ModemPppState modemPppState   = MODEM_PPP_STOPPED;
// RAM only, same rule as /api/zero and the pin override above: /api/modem?off turns the
// uplink off for this session, and what should survive a reboot goes into MODEM_USE_PPP.
bool          modemPppEnabled = true;
unsigned long modemNextTry    = 0;      // 0 = try on the very first pass through loop()
unsigned long modemRetryMs    = MODEM_RETRY_MIN_MS;
unsigned long modemStateSince = 0;      // when the current state was entered
unsigned long modemAttachPoll = 0;
uint16_t      modemTries      = 0;
String        modemLastError;

// Worst single stall this subsystem has ever cost loop(). Kept strictly apart from
// loopMaxMs, and that separation is the point: PPP.begin() and every AT round trip are
// synchronous calls that genuinely do block, so folding them in would swamp the telemetry
// window they land in with a number that only ever means "the modem was busy" — exactly
// the window someone would be reading to see whether the modem hurt the sensor loop.
// Unlike loopMaxMs this one is never reset: it is a high-water mark for the whole uptime,
// because the expensive events are rare and the point is to catch them at all. Both
// numbers are reported, neither is hidden. Measured on the bench: 188 ms for a bring-up
// that reached the network on the first attempt, against loopMax 3 ms while online.
unsigned long modemBusyMaxMs  = 0;

// Radio facts, cached. Every one of these is an AT round trip over the CMUX channel —
// PPP.RSSI() alone is a full AT+CSQ conversation with the module — which is exactly why
// /api/modem hides them behind ?radio=1 instead of answering them on every read. The
// telemetry frame is built up to 20 times a second, so asking the modem from inside
// buildDataJson() would put four synchronous UART conversations into every frame and
// starve the 50 Hz sensor loop outright. So they are asked once a minute from loop() and
// the frame only ever reads memory.
//
// One minute is chosen from what the numbers are for: signal strength and operator are
// "what kind of link is this", not a waveform — a dashboard gauge that lags reality by
// under a minute tells the same story, and the cost of being wrong is nil. Going faster
// would buy nothing and spend loop() time on every tick.
struct ModemRadio {
  int      rssi;        // dBm from AT+CSQ as the driver maps it; 99 = "module does not know"
  int      mode;        // PPP::networkMode() code — which radio access technology answered
  char     oper[24];    // network name; long enough for the longest PLMN alpha tag seen
  bool     attached;    // packet service attached, i.e. data is possible at all
  uint32_t at;          // millis() of the refresh that filled this; 0 = never filled
};
ModemRadio modemRadio = { 0, 0, "", false, 0 };
// How stale the cache is allowed to get before loop() spends AT time refilling it.
const unsigned long MODEM_RADIO_POLL_MS = 60000;

// Declared up here because buildDataJson() sits well above the PPP section but reports
// from it, and the .ino preprocessor does not generate prototypes for static functions.
static const char* modemPppStateName();
static void        modemRadioRefresh();
#endif  // MODEM_USE_PPP
#endif

// ===== WALL CLOCK =====
// A real date is not a convenience here, it is the gate in front of the first TLS
// handshake: a certificate is checked against the clock, and a board that boots at
// 1970 rejects every valid certificate it is shown. So nothing that needs TLS may run
// until this says the year is sane.
//
// The time comes from SNTP over whichever uplink is the default route — WiFi at home,
// PPP on the mast — and deliberately NOT from the modem's own clock, even though
// AT+CTZU=1 is set and the network does deliver NITZ. Measured on the bench 2026-09-11:
// AT+CCLK? returned "26/09/11,16:57:42+00" while real UTC was 08:57:42 — the date right,
// the clock ticking at the right rate, and the time of day exactly 8 hours ahead while
// claiming a zero offset. Eight hours is Beijing, which says where the bias comes from
// but not how to correct it portably. It happens to be harmless for certificate validity
// (those are measured in months) and fatal for anything that timestamps a sample, so the
// modem clock is used for one thing only: the cheap "is the year past 2020" sanity check
// on a link that has just come up. Real timestamps come from here.
#define NTP_SERVER_PRIMARY   "pool.ntp.org"
#define NTP_SERVER_SECONDARY "time.google.com"
// 2020-01-01T00:00:00Z. Anything below this is the SDK's un-synced epoch, not a date.
const time_t   CLOCK_VALID_EPOCH = 1577836800;
const unsigned long CLOCK_POLL_MS = 1000;   // time(nullptr) is cheap, but not free

bool          clockStarted   = false;  // configTime() called once; SNTP retries on its own
bool          clockValid     = false;  // latched true the first time the year looks real
unsigned long clockPoll      = 0;
unsigned long clockValidAtMs = 0;      // uptime at first sync — shows how long the gate held

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
// Candidates already tried and failed in the current pass over the list, one bit per
// homeNetworks[] entry. Without this the search re-picks the same network forever:
// `best` is recomputed from preference order on every scan, so a network that is on
// the air but will not let us in — stale password, a neighbour broadcasting the same
// name, a router refusing the join — hides every network below it in the list, and
// the board never tries the one that would have worked. The blind walk it replaced
// did get to them. Cleared when a link comes up and when a pass has tried everything
// the air had to offer.
//
// Entries past bit 31 are simply never excluded. The list is a handful of names in a
// header file, and degrading to the old behaviour is the right failure for a station
// that would have to grow a 33rd network first.
uint32_t staFailedMask = 0;
inline bool staHasFailed(int k) { return k < 32 && (staFailedMask & (1UL << k)); }
inline void staMarkFailed(int k) { if (k < 32) staFailedMask |= (1UL << k); }
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
                    // blob: is not decoration either. The live-imagery tab downloads a
                    // GOES frame with fetch() so it can show real progress in bytes, then
                    // hands the assembled Blob to an <img>; the background picker does the
                    // same to measure a photo before shrinking it. 'self' does not cover
                    // blob: — without it both features fail only on the board, where this
                    // header exists, and work in dev and on the public copy, where it does
                    // not. The picker's failure was the nastier one: the CSP block fires
                    // img.onerror, and the code reports a perfectly good photo as "не картинка".
                    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob: https:; "
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
  // pattern churned the heap 20x a second and fragmented it over long uptimes. Raised
  // from 448 when the uplink, cloud and site blocks were added: a full frame with a live
  // 4G link and a cloud error string runs past 700 bytes, and undersizing this puts the
  // realloc churn straight back.
  json.reserve(768);
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

  // ----- 4G uplink, cloud channel and where the station stands -----
  //
  // One rule governs everything below: a field that has no answer is ABSENT, not zero,
  // not "" and not null. The dashboard reads a missing key as "do not draw this row at
  // all" and a present-but-empty value as an honest "no data yet", and those are two
  // different pictures. A zero here would be the meteorological sin the optional-sensor
  // contract already spells out: 0 dBm is a signal reading, not the absence of a modem.
  // So the compile-time cases go behind #if and the runtime ones behind a real test.
#if HAS_MODEM && MODEM_USE_PPP
  // Free to report every frame: the state machine's own variable and a netif field, no
  // AT traffic. Same name normalisation /api/modem uses, so the two endpoints cannot
  // drift into describing the same state with two different words.
  json += "\"pppState\":\""     + String(modemPppStateName()) + "\",";
  // Only once IPCP has actually handed over an address. Before that PPP.localIP() reads
  // back 0.0.0.0, which looks like an address and is not one.
  if (PPP.hasIP()) {
    json += "\"pppIp\":\""      + PPP.localIP().toString() + "\",";
  }
  // The cached radio facts. Absent as a group until the cache has been filled at least
  // once — see ModemRadio for why these are never asked from inside this function.
  if (modemRadio.at) {
    json += "\"netOperator\":\"" + String(modemRadio.oper) + "\",";
    json += "\"netRssi\":"       + String(modemRadio.rssi) + ",";
    json += "\"netMode\":"       + String(modemRadio.mode) + ",";
    json += "\"netAttached\":"   + String(modemRadio.attached ? "true" : "false") + ",";
  }
#endif
#if SECRET_HAS_CLOUD
  // Defined far below this function, in the cloud section, and declared here for the same
  // reason as the loop counters further down: the JSON is built above everything it
  // reports on.
  extern volatile bool cloudConnected;
  extern char          cloudLastError[];
  json += "\"cloudConnected\":" + String(cloudConnected ? "true" : "false") + ",";
  // Only when there is something to say. An empty string would make the dashboard draw an
  // error row that reads "error: (nothing)" on a channel that is working perfectly.
  if (cloudLastError[0]) {
    json += "\"cloudError\":\""  + String(cloudLastError) + "\",";
  }
#endif
  // Where the station stands. THREE decimals, and this is a security boundary rather than
  // a formatting preference: this very JSON is what cloudPublishState() pushes to the
  // retained `state` topic, which is read with the viewer credential that ships inside the
  // public dashboard bundle. Anything that lands here is public. Three decimals is ~100 m
  // — enough to centre a map, not enough to be a street address. Full precision stays in
  // /api/site, which only ever answers on the board's own network.
  // 0/0 still means "not configured" here, exactly as /api/site defines it.
  json += "\"siteLat\":"        + String((double)SECRET_STATION_LAT, 3) + ",";
  json += "\"siteLon\":"        + String((double)SECRET_STATION_LON, 3) + ",";
  json += "\"siteAltM\":"       + String((double)SECRET_STATION_ALT_M, 1) + ",";

  // The address to show a human, not the mDNS label — this is what the dashboard
  // prints as "станция доступна по адресу".
  json += "\"hostname\":\""     + String(portalHost) + "\",";
  json += "\"uptime\":"         + String(millis() / 1000) + ",";
  json += "\"resetReason\":\""  + String(resetReasonName()) + "\",";
  // Absolute time, seconds since the epoch, UTC — and 0 when the clock has never been
  // synced. Zero is not a date and the dashboard must read it as "unknown": a board
  // without an uplink genuinely does not know what day it is, and 1970 on a card would
  // be a lie told confidently. The flag is what gates TLS inside the firmware; the
  // number is here so the same fact can be checked from outside without a serial cable.
  // Both are defined below this function — one in the SSE section, one in the main-loop
  // section — and declared here because the JSON is built above them.
  extern unsigned long loopMaxMs;
  extern unsigned long sseDropped;
  extern unsigned long logBusyLast;
  // The health pair that used to exist only in the serial telemetry line. It is here
  // because the cable stopped being free: on this hardware opening the USB port pulses
  // DTR and resets the board, and a reset that does not go through ArduinoOTA.onStart()
  // leaves the modem stuck in CMUX — so reading loopMax over a cable now costs the 4G
  // uplink until someone power-cycles the module. Same numbers, same meaning, and the
  // same reset point: both are zeroed when the telemetry line is printed, so this is
  // "since the last telemetry line", not "since boot".
  json += "\"loopMax\":"        + String(loopMaxMs) + ",";
  json += "\"sseDrop\":"        + String(sseDropped) + ",";
  // How long the telemetry line itself blocked on the UART last time. Subtracted from
  // loopMax rather than left in it, so loopMax means "something starved the sensor loop"
  // and this one means "the console is slow" — two different problems that used to share
  // a number. Nonzero only while something is actually draining the port.
  json += "\"logMs\":"          + String(logBusyLast) + ",";
  json += "\"timeValid\":"      + String(clockValid ? "true" : "false") + ",";
  json += "\"epoch\":"          + String(clockValid ? (uint32_t)time(nullptr) : 0);
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

// True while esp-modem owns GPIO27/25. Everything that touches Serial2 has to ask first:
// the port is closed for the whole time PPP is up, and reading a closed port returns
// nothing at all rather than failing — a silence that looks exactly like a dead modem.
static bool modemPppOwnsUart() {
#if MODEM_USE_PPP
  return modemPppState == MODEM_PPP_ATTACHING
      || modemPppState == MODEM_PPP_DIALING
      || modemPppState == MODEM_PPP_ONLINE;
#else
  return false;
#endif
}

#if MODEM_USE_PPP
static const char* modemPppStateName() {
  switch (modemPppState) {
    case MODEM_PPP_ATTACHING: return "attaching";
    case MODEM_PPP_DIALING:   return "dialing";
    case MODEM_PPP_ONLINE:    return "online";
    case MODEM_PPP_FAILED:    return "failed";
    default:                  return "stopped";
  }
}

static void modemSetState(ModemPppState st) {
  modemPppState   = st;
  modemStateSince = millis();
}

// Hands the UART back to the raw console and forgets the DCE.
//
// Note what this cannot do: take the modem out of CMUX. A7670 firmware breaks on CMUX
// exit — the documented way back is a power cycle — so once the dial step has run, the
// console on the other side of this call sees CMUX framing where it expects plain AT,
// until the module is power-cycled. Before that step (the common case, since most
// failures are "no attach") CMUX was never entered and the console really does come back.
static void modemPppRelease(const char* why) {
  PPP.end();
  modemSetState(MODEM_PPP_STOPPED);
  // Forget the cached radio facts. They describe a link that no longer exists, and a
  // stale operator name next to a dead uplink reads as "the modem is fine" — the one
  // conclusion the reader must not draw. Empty cache means the fields vanish from
  // /api/data entirely, which is honest; a remembered value would be a lie with a
  // timestamp nobody looks at.
  modemRadio.at = 0;
  // end() puts both pin assignments back to -1, so this is not a no-op: the pair has to
  // be handed back to Serial2 explicitly before the console can hear anything again.
  modemUartStart();
  modemLen = 0;
  Serial.printf("Modem: PPP released (%s)\n", why);
}

static void modemBackoff() {
  modemRetryMs = (modemRetryMs > MODEM_RETRY_MAX_MS / 2) ? MODEM_RETRY_MAX_MS : modemRetryMs * 2;
  modemNextTry = millis() + modemRetryMs;
}

// One AT down the console UART, waiting briefly for any final result code. A pre-flight
// for the expensive part, and it earns its place with a measured number: a modem left in
// CMUX by an earlier boot answers a plain AT with total silence, and PPP.begin() takes
// 25 s to discover that — 25 s of frozen loop() on every single retry, for as long as the
// modem stays wedged. This question costs 300 ms and gives the same answer.
//
// Only ever called while Serial2 still owns the pins, i.e. from a STOPPED or FAILED state.
static bool modemRespondsToAt() {
  modemLen = 0;
  Serial2.print("AT");
  Serial2.write('\r');     // SIMCom terminates on a bare CR, never on LF
  unsigned long t0 = millis();
  while (millis() - t0 < MODEM_PREFLIGHT_MS) {
    modemPump();
    if (modemAnswered()) return true;
    delay(2);              // vTaskDelay underneath — the WiFi stack keeps running
  }
  return false;
}

// Brings the 4G interface up and keeps it up, from loop(), in slices.
//
// The station cannot afford the shape the PPP example uses — begin(), then a 60 s busy
// wait for the network to attach — because that is a full minute of dead sensor, dead
// dashboard, dead SSE and dead OTA on a board that is otherwise perfectly healthy, every
// single time the modem is slow. So the wait is turned inside out: the state lives in
// globals, each pass does at most one AT round trip and returns, and a modem that never
// registers at all costs nothing but one poll every two seconds.
//
// What still blocks, stated plainly rather than papered over: PPP.begin() is synchronous
// (~0.3 s when the modem answers, seconds when it does not) and so is every AT round trip
// in here. That time is charged to modemBusyMaxMs and subtracted from the loop timer —
// see the note there for why the two numbers must not be added together.
static void serviceModem() {
  if (!modemPppEnabled) return;
  unsigned long now = millis();

  switch (modemPppState) {

    case MODEM_PPP_ONLINE: {
      // The netif clears CONNECTED by itself when the carrier drops, and nothing else in
      // the firmware watches for it. Free to poll — this reads a status bit, not the UART.
      if (PPP.connected()) return;
      modemLastError = "carrier lost";
      modemPppRelease("carrier lost");
      modemSetState(MODEM_PPP_FAILED);
      // A link that WAS up gets the fast retry instead of the accumulated backoff: it has
      // just proved there is coverage here, so this is a handover, not a dead cell.
      modemRetryMs = MODEM_RETRY_MIN_MS;
      modemNextTry = now + modemRetryMs;
      return;
    }

    case MODEM_PPP_DIALING: {
      // Waiting on IPCP, which runs in the lwIP PPP task — so this poll is a local status
      // bit read and can happen every pass without saying a word to the modem.
      if (PPP.connected()) {
        // Pin public resolvers on the interface. The A7670 hands back 0.0.0.0 for DNS
        // often enough that it has to be handled rather than hoped about: IPCP gives an
        // address and a route, and then every name lookup fails on a link that looks
        // perfectly healthy.
        //
        // Unconditional, and NOT guarded by "only if IPCP gave us nothing", because that
        // test cannot be written: with a WiFi uplink up, dnsIP() reads back the GLOBAL
        // lwIP resolver table (the home router) rather than what this interface
        // negotiated, so the guard would never fire and the fix would never run. Measured
        // on the bench — the first build reported dns0 = the home router on a PPP link
        // that had just come up. Writing, unlike reading, is per interface and lands
        // where it is needed: the value takes effect when PPP becomes the default route,
        // which on the mast it will be, with no WiFi around to outrank it.
        PPP.dnsIP(0, IPAddress(8, 8, 8, 8));
        PPP.dnsIP(1, IPAddress(1, 1, 1, 1));
        modemSetState(MODEM_PPP_ONLINE);
        modemRetryMs   = MODEM_RETRY_MIN_MS;
        modemLastError = "";
        Serial.print("Modem: PPP online, IP ");
        Serial.print(PPP.localIP());
        Serial.print(", DNS ");
        Serial.println(PPP.dnsIP(0));
        return;
      }
      if (now - modemStateSince > MODEM_DIAL_MAX_MS) {
        modemLastError = "no address after CMUX";
        modemPppRelease("dial timeout");
        modemSetState(MODEM_PPP_FAILED);
        modemBackoff();
      }
      return;
    }

    case MODEM_PPP_ATTACHING: {
      if (now - modemAttachPoll < MODEM_ATTACH_POLL_MS) return;
      modemAttachPoll = now;
      if (!PPP.attached()) {
        if (now - modemStateSince > MODEM_ATTACH_MAX_MS) {
          modemLastError = "no attach in " + String(MODEM_ATTACH_MAX_MS / 1000) + " s";
          modemPppRelease("attach timeout");
          modemSetState(MODEM_PPP_FAILED);
          modemBackoff();
        }
        return;
      }
      // Attached. Dialling is the one step with nothing left to slice: set_mode() runs the
      // entire CMUX handshake and starts PPP inside a single synchronous call.
      //
      // CMUX and not plain DATA mode, and this is a one-way door. CMUX multiplexes an AT
      // channel alongside the data channel, which is the only reason /api/at survives the
      // station going online — and the A7670 cannot be taken back out of CMUX without a
      // power cycle, so entering it is a decision rather than a step.
      if (!PPP.mode(ESP_MODEM_MODE_CMUX)) {
        modemLastError = "CMUX refused";
        modemPppRelease("CMUX refused");
        modemSetState(MODEM_PPP_FAILED);
        modemBackoff();
        return;
      }
      modemSetState(MODEM_PPP_DIALING);
      Serial.println("Modem: attached, CMUX up, waiting for an address");
      return;
    }

    default: {   // STOPPED or FAILED — start an attempt once the backoff has run out
      if ((long)(now - modemNextTry) < 0) return;
      modemTries++;

      // Pre-flight on the console UART, before esp-modem is involved at all. Silence here
      // means one of exactly two things, and neither is fixable from this side: no modem
      // on the wires, or a modem still sitting in CMUX from an earlier boot of this chip.
      // Both want the same thing — power removed and restored — which is why GPIO33 is
      // reserved for a P-FET and why this message says so out loud.
      if (!modemRespondsToAt()) {
        modemLastError = "no answer to a bare AT: modem absent, or left in CMUX by an "
                         "earlier boot and needs its power cycled";
        modemSetState(MODEM_PPP_FAILED);
        modemBackoff();
        return;
      }

      // Serial2 and esp-modem want the same two pins from two different UART peripherals.
      // The console has to let go first, or begin() configures pins another peripheral is
      // still driving and the modem hears a fight instead of an AT.
      Serial2.end();
      PPP.setApn(MODEM_APN);
      // (tx, rx) — the opposite order from Serial2.begin(), worth spelling out because
      // getting it backwards leaves both ends deaf and looks exactly like dead hardware.
      // Re-set on every attempt on purpose: PPP::end() puts both pins back to -1, so this
      // is not the one-time call it reads like.
      PPP.setPins(modemPinTx, modemPinRx);
      // No setResetPin(), and that is deliberate. PWRKEY is tied to ground through R104 on
      // this board, so there is no reset line to pulse — and asking for one would send
      // begin() down the path that waits up to 50 s for the modem to answer instead of
      // giving up in half a second. Nothing called from loop() may cost 50 s.
      if (!PPP.begin(PPP_MODEM_SIM7600, 1, (int)modemBaud)) {
        modemLastError = "begin() failed";
        modemPppRelease("begin failed");
        modemSetState(MODEM_PPP_FAILED);
        modemBackoff();
        return;
      }

      // LTE only. Left alone the module falls back to 2G/3G the moment LTE wobbles, and on
      // this operator that is a data path which does not come back on its own. The setting
      // persists in NVM, so this is belt and braces after a factory reset.
      PPP.cmd("AT+CNMP=38", 2000);
      // NITZ. The time the network delivers is the ONLY clock this station will ever trust
      // for TLS: GNSS here reports a coherent, confident, moving fix in another hemisphere
      // whenever the jammers are on, and by every quality metric that fake looks BETTER
      // than the truth. Note AT+CTZU and not AT+CLTS — this module has no CLTS at all.
      PPP.cmd("AT+CTZU=1", 2000);

      modemSetState(MODEM_PPP_ATTACHING);
      modemAttachPoll = now;
      Serial.printf("Modem: PPP attempt %u, waiting for network attach\n", modemTries);
      return;
    }
  }
}

// Refills the radio cache, at most once a MODEM_RADIO_POLL_MS, and only when the link is
// genuinely up. Called from loop() right behind serviceModem() so its cost lands inside
// the same measured window and is charged to modemBusyMaxMs — these are four synchronous
// AT round trips and they must not be allowed to hide inside loopMaxMs, which exists to
// answer a different question ("what starved readSensors()").
//
// The guard is ONLINE and not merely modemPppOwnsUart(): the AT channel only exists once
// CMUX is up, and asking during ATTACHING would talk to a UART that esp-modem is still
// bringing up. PPP.connected() on top of that because the netif clears the carrier bit by
// itself, and a module whose cell has just gone away answers AT+CSQ with a long silence.
// The operator name is the only string in this section that comes back as free text from
// the network, and it must never be emitted raw. Both places that report it build JSON by
// hand, so one stray quote in a PLMN alpha tag does not corrupt "the operator field" — it
// corrupts the whole object, for everyone reading it. On /api/data that reader is also the
// public dashboard subscribed to the retained `state` topic; on /api/modem it is the system
// card, which parses the answer the same way. Control characters go too: they are legal in
// a C string and illegal inside a JSON string literal.
static String modemSafeText(const String& in, size_t maxLen) {
  String out;
  out.reserve(in.length() < maxLen ? in.length() : maxLen);
  for (size_t i = 0; i < in.length() && out.length() < maxLen; i++) {
    char c = in[i];
    if (c == '"' || c == '\\' || (unsigned char)c < 0x20) continue;
    out += c;
  }
  return out;
}

static void modemRadioRefresh() {
  if (modemPppState != MODEM_PPP_ONLINE) return;
  if (!PPP.connected()) return;
  if (modemRadio.at && (millis() - modemRadio.at) < MODEM_RADIO_POLL_MS) return;

  modemRadio.attached = PPP.attached();
  modemRadio.rssi     = PPP.RSSI();
  modemRadio.mode     = PPP.networkMode();

  // Through the same filter, once a minute, rather than on every frame at 20 Hz.
  String op = modemSafeText(PPP.operatorName(), sizeof(modemRadio.oper) - 1);
  strlcpy(modemRadio.oper, op.c_str(), sizeof(modemRadio.oper));

  modemRadio.at = millis();
  // millis() is 0 for exactly one millisecond after boot and 0 is the "never filled"
  // marker here. Cheaper to nudge the timestamp by 1 ms than to carry a second flag.
  if (modemRadio.at == 0) modemRadio.at = 1;
}

// Proves the ESP32's own TCP/IP stack reaches the internet THROUGH THE MODEM. That is a
// narrower claim than either "the modem is online" or "the station has internet", and with
// a WiFi uplink also up all three can disagree. The ordinary test — open a socket, see
// whether it connects — would quietly leave over WiFi and report success for the wrong
// interface, so the socket is bound to the PPP address before it is allowed to connect.
// Worst case that turns into a false NEGATIVE (a bind lwIP declines to route), never a
// false positive, which is the right way round for a test whose whole job is to stop us
// believing the link works when it does not.
//
// Blocks for up to MODEM_PROBE_MS, like /api/at?wait= and for the same reason: an operator
// asked for it, the stall is bounded, and it shows up honestly in loopMax.
static bool modemProbe(String& detail) {
  if (!PPP.hasIP()) { detail = "no PPP address"; return false; }

  int sock = lwip_socket(AF_INET, SOCK_STREAM, IPPROTO_TCP);
  if (sock < 0) { detail = "socket() failed"; return false; }

  bool ok = false;
  struct sockaddr_in src;
  memset(&src, 0, sizeof(src));
  src.sin_family      = AF_INET;
  src.sin_port        = 0;
  src.sin_addr.s_addr = (uint32_t)PPP.localIP();

  if (lwip_bind(sock, (struct sockaddr*)&src, sizeof(src)) != 0) {
    detail = "bind to the PPP address failed, errno " + String(errno);
  } else {
    // SO_SNDTIMEO is what bounds a blocking connect() in lwIP — there is no connect
    // timeout option. Without it a black-holed route hangs in here for over a minute.
    struct timeval tv;
    tv.tv_sec  = MODEM_PROBE_MS / 1000;
    tv.tv_usec = (MODEM_PROBE_MS % 1000) * 1000;
    lwip_setsockopt(sock, SOL_SOCKET, SO_SNDTIMEO, &tv, sizeof(tv));

    struct sockaddr_in dst;
    memset(&dst, 0, sizeof(dst));
    dst.sin_family      = AF_INET;
    dst.sin_port        = lwip_htons(MODEM_PROBE_PORT);
    dst.sin_addr.s_addr = lwip_htonl(MODEM_PROBE_ADDR);

    unsigned long t0 = millis();
    ok = (lwip_connect(sock, (struct sockaddr*)&dst, sizeof(dst)) == 0);
    detail = ok ? ("connected in " + String(millis() - t0) + " ms")
                : ("connect failed after " + String(millis() - t0) + " ms, errno " + String(errno));
  }
  lwip_close(sock);
  return ok;
}

// The same trick as modemProbe(), asking a different question: does a UDP round trip
// complete over the modem, and does the answer carry a date. Together they are the whole
// prerequisite for TLS on the mast — a certificate is checked against a clock, and the
// clock has to arrive over the only link there is.
//
// It exists because serviceClock() cannot answer this at home. SNTP goes out over the
// DEFAULT route, and at home that is WiFi (priority 100 against PPP's 20), so a synced
// clock here proves the house has internet, not the modem. Binding the socket to the PPP
// address is what makes the question specific, exactly as in modemProbe().
//
// The server is an IP, not a name, on purpose: a name would drag in the resolver, and
// the resolver is global in lwIP — so a failure would not say whether DNS or the modem
// was at fault. 216.239.35.0 is one of Google's anycast NTP addresses; it is stable, and
// being anycast it is answered by whatever is nearest rather than by one machine.
static bool modemNtpProbe(String& detail) {
  if (!PPP.hasIP()) { detail = "no PPP address"; return false; }

  int sock = lwip_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (sock < 0) { detail = "socket() failed"; return false; }

  bool ok = false;
  struct sockaddr_in src;
  memset(&src, 0, sizeof(src));
  src.sin_family      = AF_INET;
  src.sin_port        = 0;
  src.sin_addr.s_addr = (uint32_t)PPP.localIP();

  if (lwip_bind(sock, (struct sockaddr*)&src, sizeof(src)) != 0) {
    detail = "bind to the PPP address failed, errno " + String(errno);
  } else {
    struct timeval tv;
    tv.tv_sec  = MODEM_NTP_MS / 1000;
    tv.tv_usec = (MODEM_NTP_MS % 1000) * 1000;
    lwip_setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in dst;
    memset(&dst, 0, sizeof(dst));
    dst.sin_family      = AF_INET;
    dst.sin_port        = lwip_htons(123);
    dst.sin_addr.s_addr = lwip_htonl(MODEM_NTP_ADDR);

    uint8_t pkt[48];
    memset(pkt, 0, sizeof(pkt));
    pkt[0] = 0x1B;   // LI = 0, version 3, mode 3 (client) — the whole request

    unsigned long t0 = millis();
    int sent = lwip_sendto(sock, pkt, sizeof(pkt), 0, (struct sockaddr*)&dst, sizeof(dst));
    if (sent != (int)sizeof(pkt)) {
      detail = "sendto failed, errno " + String(errno);
    } else {
      int got = lwip_recv(sock, pkt, sizeof(pkt), 0);
      unsigned long rt = millis() - t0;
      if (got < 48) {
        detail = "no reply in " + String(rt) + " ms, errno " + String(errno);
      } else {
        // Transmit timestamp, bytes 40..43: seconds since 1900. 2208988800 is the gap
        // between the NTP epoch and the Unix one.
        uint32_t secs1900 = ((uint32_t)pkt[40] << 24) | ((uint32_t)pkt[41] << 16)
                          | ((uint32_t)pkt[42] << 8)  |  (uint32_t)pkt[43];
        uint32_t unix = secs1900 - 2208988800UL;
        struct tm g;
        time_t tt = (time_t)unix;
        gmtime_r(&tt, &g);
        char when[24];
        snprintf(when, sizeof(when), "%04d-%02d-%02d %02d:%02d:%02dZ",
                 g.tm_year + 1900, g.tm_mon + 1, g.tm_mday,
                 g.tm_hour, g.tm_min, g.tm_sec);
        // The delta against the board's own clock is the useful half: it says whether
        // the time the mast would get over 4G agrees with the time it already has.
        long drift = (long)unix - (long)time(nullptr);
        detail = String(when) + ", round trip " + String(rt) + " ms, board clock off by "
               + String(drift) + " s";
        ok = true;
      }
    }
  }
  lwip_close(sock);
  return ok;
}

// Third question of the same shape: does a NAME turn into an address over the modem.
//
// It has to be asked by hand, because lwIP's resolver is global — one table shared by
// every interface — so an ordinary getaddrinfo() at home is answered by the home router
// over WiFi and says nothing about the 4G link. The resolver pinned on the PPP interface
// in the DIALING branch cannot be read back either (dnsIP() reads that same global
// table), so the only honest way to know the pin works is to send the query at it
// directly, from a socket bound to the PPP address. On the mast this whole dance stops
// being necessary — there PPP is the default route and the global resolver IS this one —
// but on the mast is exactly where finding out would be too late.
//
// The query is assembled by hand rather than borrowed from a library: it is 12 bytes of
// header, the name in length-prefixed labels, and four bytes of type and class.
static bool modemDnsProbe(const String& name, IPAddress server, String& detail) {
  if (!PPP.hasIP()) { detail = "no PPP address"; return false; }
  if (name.length() == 0 || name.length() > 200) { detail = "bad name"; return false; }

  uint8_t  q[300];
  uint16_t id = (uint16_t)random(1, 65535);
  q[0] = id >> 8; q[1] = id & 0xFF;
  q[2] = 0x01; q[3] = 0x00;      // standard query, recursion desired
  q[4] = 0x00; q[5] = 0x01;      // one question
  q[6] = q[7] = q[8] = q[9] = q[10] = q[11] = 0;
  int w = 12;

  // Labels: every dot becomes a length byte in front of the piece that follows it.
  int start = 0;
  while (start <= (int)name.length()) {
    int dot = name.indexOf('.', start);
    if (dot < 0) dot = name.length();
    int len = dot - start;
    if (len <= 0 || len > 63) { detail = "bad label in name"; return false; }
    q[w++] = (uint8_t)len;
    for (int i = 0; i < len; i++) q[w++] = (uint8_t)name.charAt(start + i);
    start = dot + 1;
  }
  q[w++] = 0x00;                 // root label ends the name
  q[w++] = 0x00; q[w++] = 0x01;  // QTYPE  = A
  q[w++] = 0x00; q[w++] = 0x01;  // QCLASS = IN

  int sock = lwip_socket(AF_INET, SOCK_DGRAM, IPPROTO_UDP);
  if (sock < 0) { detail = "socket() failed"; return false; }

  bool ok = false;
  struct sockaddr_in src;
  memset(&src, 0, sizeof(src));
  src.sin_family      = AF_INET;
  src.sin_port        = 0;
  src.sin_addr.s_addr = (uint32_t)PPP.localIP();

  if (lwip_bind(sock, (struct sockaddr*)&src, sizeof(src)) != 0) {
    detail = "bind to the PPP address failed, errno " + String(errno);
  } else {
    struct timeval tv;
    tv.tv_sec  = MODEM_NTP_MS / 1000;
    tv.tv_usec = (MODEM_NTP_MS % 1000) * 1000;
    lwip_setsockopt(sock, SOL_SOCKET, SO_RCVTIMEO, &tv, sizeof(tv));

    struct sockaddr_in dst;
    memset(&dst, 0, sizeof(dst));
    dst.sin_family      = AF_INET;
    dst.sin_port        = lwip_htons(53);
    dst.sin_addr.s_addr = (uint32_t)server;

    unsigned long t0 = millis();
    if (lwip_sendto(sock, q, w, 0, (struct sockaddr*)&dst, sizeof(dst)) != w) {
      detail = "sendto failed, errno " + String(errno);
    } else {
      uint8_t r[512];
      int got = lwip_recv(sock, r, sizeof(r), 0);
      unsigned long rt = millis() - t0;
      if (got < 12) {
        detail = "no reply in " + String(rt) + " ms, errno " + String(errno);
      } else if (r[0] != q[0] || r[1] != q[1]) {
        detail = "reply id does not match the query";   // someone else's answer
      } else if ((r[3] & 0x0F) != 0) {
        detail = "server answered rcode " + String(r[3] & 0x0F) + " after " + String(rt) + " ms";
      } else {
        int qd = (r[4] << 8) | r[5];
        int an = (r[6] << 8) | r[7];
        int at = 12;
        // Walk past the echoed question(s): labels until a zero byte, then type+class.
        for (int i = 0; i < qd && at < got; i++) {
          while (at < got && r[at] != 0) {
            if ((r[at] & 0xC0) == 0xC0) { at += 2; break; }   // compression pointer
            at += 1 + r[at];
          }
          if (at < got && r[at] == 0) at++;
          at += 4;
        }
        for (int i = 0; i < an && at + 12 <= got; i++) {
          if ((r[at] & 0xC0) == 0xC0) at += 2;
          else { while (at < got && r[at] != 0) at += 1 + r[at]; at++; }
          if (at + 10 > got) break;
          int type = (r[at] << 8) | r[at + 1];
          int rdl  = (r[at + 8] << 8) | r[at + 9];
          at += 10;
          if (type == 1 && rdl == 4 && at + 4 <= got) {
            detail = name + " -> " + String(r[at]) + "." + String(r[at + 1]) + "."
                   + String(r[at + 2]) + "." + String(r[at + 3])
                   + " in " + String(rt) + " ms, asked " + server.toString();
            ok = true;
            break;
          }
          at += rdl;
        }
        if (!ok) detail = "reply carried no A record, " + String(an) + " answers, "
                        + String(rt) + " ms";
      }
    }
  }
  lwip_close(sock);
  return ok;
}
#endif  // MODEM_USE_PPP

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
//   &pins=RX,TX                 re-open UART2 on other pins, e.g. pins=25,27. Only 25, 26
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
  // Re-wiring first, so ?pins=25,27&cmd=AT does both in one request.
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
  // Silently ignored while PPP owns the pair: Serial2 is closed, and re-opening it here
  // would point a second UART peripheral at pins esp-modem is actively driving. Use
  // /api/modem?off first if the wiring really has to be moved.
  if (reopen && !modemPppOwnsUart()) { modemUartStart(); modemLen = 0; }

  String cmd;
  if (server.hasArg("plain"))     cmd = server.arg("plain");   // POST body, not form-decoded
  else if (server.hasArg("cmd"))  cmd = server.arg("cmd");
  cmd.trim();

  unsigned long waitMs = 500;
  if (server.hasArg("wait")) waitMs = (unsigned long)constrain(server.arg("wait").toInt(), 0L, 3000L);

  String out;
  unsigned long waited = 0;

#if MODEM_USE_PPP
  // Same console, same URL, different pipe. Once PPP is up the UART belongs to esp-modem
  // and Serial2 is closed, but CMUX carries an AT channel alongside the data channel — so
  // the command goes down that instead and the console keeps working while the station is
  // online. That matters more than it sounds: on the mast this is the only handle on the
  // modem there will ever be, and losing it the moment the link comes up would be the
  // worst possible trade.
  if (modemPppOwnsUart()) {
    if (cmd.length()) {
      // wait=0 is meaningless here — esp_modem takes a timeout, not a poll budget, and 0
      // would fail every command instantly. The console's "fire and collect later" trick
      // does not exist on this path because CMUX answers on its own channel anyway.
      String reply;
      unsigned long t0 = millis();
      bool ok = PPP.cmd(cmd.c_str(), reply, (int)(waitMs ? waitMs : 500));
      waited = millis() - t0;
      out = "> " + cmd + "\n" + reply;
      if (!out.endsWith("\n")) out += "\n";
      out += "-- ok=" + String(ok ? 1 : 0);
    } else {
      // No URC buffer on this path: esp-modem consumes the unsolicited traffic itself.
      out = "-- no command; URCs are consumed by esp-modem while PPP is up";
    }
    out += " via=CMUX state=" + String(modemPppStateName())
         + " waited=" + String(waited) + "ms\n";
    server.send(200, "text/plain", out);
    return;
  }
#endif

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

#if MODEM_USE_PPP
// Read-out for the 4G uplink, plus the two controls that matter when it misbehaves.
//
//   GET /api/modem           cheap: netif-level facts only, no word said to the modem
//   GET /api/modem?radio=1   adds RSSI, operator and network mode — four AT round trips,
//                            so it is opt-in rather than part of every read
//   GET /api/modem?probe=1   opens a TCP connection to 8.8.8.8:53 pinned to the PPP
//                            interface (see modemProbe) — the actual "does the station
//                            have internet through the modem" question, blocks up to 4 s
//   GET /api/modem?ntp=1     asks an NTP server for the date over a UDP socket pinned to
//                            the PPP interface — "can the mast learn what day it is over
//                            4G", which is the prerequisite for TLS and which a synced
//                            clock at home does not answer (SNTP leaves over WiFi here)
//   GET /api/modem?dns=NAME  resolves NAME by hand over a UDP socket pinned to the PPP
//                            interface, asking the resolver that was pinned there. The
//                            value IS the name ("?dns=1" asks for a default one) — this
//                            is the only way to tell whether the pin took, because
//                            lwIP's resolver table is global and reads back the router
//   GET /api/modem?off=1     release the UART back to the AT console and stop retrying
//   GET /api/modem?on=1      re-enable and retry immediately
//
// The "=1" is not decoration and it is not optional. WebServer::_parseArguments() DROPS
// any query argument that has no '=' — it logs "arg missing value" and moves on — so a
// bare ?probe never reaches hasArg() at all and the endpoint answers as if nothing was
// asked. Silent, and indistinguishable from a flag that simply did nothing.
//
// Behind crossSiteWrite() and, like /api/at, deliberately without the CORS header: ?off
// takes the station's uplink down, and the readout carries the operator and the assigned
// address. Same reasoning as the AT console — a foreign tab can fire a request blind but
// must not be able to read the answer.
void handleModem() {
  if (crossSiteWrite()) return;

  if (server.hasArg("off")) {
    modemPppEnabled = false;
    modemPppRelease("api");
  }
  if (server.hasArg("on")) {
    modemPppEnabled = true;
    modemRetryMs    = MODEM_RETRY_MIN_MS;
    modemNextTry    = millis();          // now, not after the backoff
  }

  String j = "{";
  j += "\"state\":\"" + String(modemPppStateName()) + "\"";
  j += ",\"enabled\":"    + String(modemPppEnabled ? "true" : "false");
  j += ",\"ownsUart\":"   + String(modemPppOwnsUart() ? "true" : "false");
  j += ",\"tries\":"      + String(modemTries);
  j += ",\"stateForMs\":" + String(millis() - modemStateSince);
  j += ",\"retryMs\":"    + String(modemRetryMs);
  j += ",\"busyMaxMs\":"  + String(modemBusyMaxMs);
  j += ",\"lastError\":"  + (modemLastError.length() ? ("\"" + modemLastError + "\"") : String("null"));
  j += ",\"apn\":\"" MODEM_APN "\"";

  // Address, route and resolvers. All local reads — no AT traffic, no stall.
  j += ",\"hasIp\":" + String(PPP.hasIP() ? "true" : "false");
  j += ",\"ip\":\""   + PPP.localIP().toString()   + "\"";
  j += ",\"gw\":\""   + PPP.gatewayIP().toString() + "\"";
  j += ",\"dns0\":\"" + PPP.dnsIP(0).toString()    + "\"";
  j += ",\"dns1\":\"" + PPP.dnsIP(1).toString()    + "\"";
  // Which interface the stack would use by default. Worth reporting rather than forcing:
  // at home the WiFi uplink outranks PPP and that is the right answer — the 4G link is
  // for the mast, where there is no WiFi to outrank it. Changing the priority is a
  // decision for the cloud client, not for the code that just brings the link up.
  j += ",\"routePrio\":" + String(PPP.getRoutePrio());
  j += ",\"isDefault\":" + String(PPP.isDefault() ? "true" : "false");

  if (server.hasArg("radio") && modemPppOwnsUart()) {
    j += ",\"attached\":" + String(PPP.attached() ? "true" : "false");
    j += ",\"rssi\":"     + String(PPP.RSSI());
    j += ",\"netMode\":"  + String(PPP.networkMode());
    j += ",\"operator\":\"" + modemSafeText(PPP.operatorName(), 48) + "\"";
    // IMEI is deliberately NOT here. It identifies the SIM's owner to anyone who can
    // reach this endpoint, and /api/at can print it on request when it is actually needed.
  }

  if (server.hasArg("probe")) {
    String detail;
    bool ok = modemProbe(detail);
    j += ",\"probe\":"       + String(ok ? "true" : "false");
    j += ",\"probeDetail\":\"" + detail + "\"";
  }

  if (server.hasArg("dns")) {
    String name = server.arg("dns");
    if (name.length() == 0 || name == "1") name = "pool.ntp.org";
    String detail;
    bool ok = modemDnsProbe(name, IPAddress(8, 8, 8, 8), detail);
    j += ",\"dns\":"       + String(ok ? "true" : "false");
    j += ",\"dnsDetail\":\"" + detail + "\"";
  }

  if (server.hasArg("ntp")) {
    String detail;
    bool ok = modemNtpProbe(detail);
    j += ",\"ntp\":"       + String(ok ? "true" : "false");
    j += ",\"ntpDetail\":\"" + detail + "\"";
  }

  j += "}";
  server.send(200, "application/json", j);
}
#endif  // MODEM_USE_PPP
#endif

// ===== CLOUD UPLINK (MQTT over TLS) =====
// The station's half of the remote channel: ONE MQTT/TLS connection held open for the
// whole session, wind pushed up at 5 packets a second, signed commands coming back down
// the same socket. CGNAT means nothing can ever connect TO the station (see the modem
// section), so every byte in both directions rides a connection the station opened.
//
// Why esp-mqtt and not PubSubClient. Any client built on NetworkClientSecure does its TLS
// handshake synchronously in the calling task — one to three seconds during which the
// 50 Hz sampler, the SSE push and the web server all stop. In a session-based deployment
// that handshake happens on every power-up and again on every reconnect, so it is not a
// rare cost. esp-mqtt runs its own FreeRTOS task and nothing here ever waits on the
// network: loop() only ever hands it buffers. It ships inside the ESP32 core already
// (libmqtt.a, CONFIG_MQTT_PROTOCOL_311=y) — there is nothing to install.
//
// Memory, because it is not free and not what one would guess: the core's mbedTLS is
// built with CONFIG_MBEDTLS_SSL_MAX_CONTENT_LEN=16384 and no asymmetric variant, so the
// record buffers are 16 kB EACH and both live as long as the socket does. That is ~32 kB
// of heap gone for the whole session, plus this client's own buffers and task stack, plus
// a handshake peak on top. The Serial telemetry line carries free/min heap for exactly
// this reason — read it after the link has been up a while, not right after boot.
#if SECRET_HAS_CLOUD

// Root certificates, in the order that makes the pin survive the transition Let's Encrypt
// is in the middle of. Measured against the live broker 2026-09-12, the chain served is
//
//     leaf CN=*.s1.eu.hivemq.cloud  <-  CN=YR1  <-  CN=Root YR  <-  ISRG Root X1
//
// i.e. "Generation Y", with Root YR cross-signed by the old X1. Today EITHER root alone
// validates it — X1 through the cross-signature, Root YR directly — which is precisely
// why both are here rather than whichever one happens to work this month: pinning X1
// alone breaks on the day the cross-signature stops being sent, and pinning Root YR alone
// breaks if the broker rolls back to a classic chain. Two roots cost 3.8 kB of flash and
// remove both failure modes. Neither expires before 2035.
//
// PEM, and the length field stays 0: esp-mqtt then requires a NUL-terminated buffer and
// works the length out itself.
static const char CLOUD_ROOT_CA[] = R"CACERT(
-----BEGIN CERTIFICATE-----
MIIFazCCA1OgAwIBAgIRAIIQz7DSQONZRGPgu2OCiwAwDQYJKoZIhvcNAQELBQAw
TzELMAkGA1UEBhMCVVMxKTAnBgNVBAoTIEludGVybmV0IFNlY3VyaXR5IFJlc2Vh
cmNoIEdyb3VwMRUwEwYDVQQDEwxJU1JHIFJvb3QgWDEwHhcNMTUwNjA0MTEwNDM4
WhcNMzUwNjA0MTEwNDM4WjBPMQswCQYDVQQGEwJVUzEpMCcGA1UEChMgSW50ZXJu
ZXQgU2VjdXJpdHkgUmVzZWFyY2ggR3JvdXAxFTATBgNVBAMTDElTUkcgUm9vdCBY
MTCCAiIwDQYJKoZIhvcNAQEBBQADggIPADCCAgoCggIBAK3oJHP0FDfzm54rVygc
h77ct984kIxuPOZXoHj3dcKi/vVqbvYATyjb3miGbESTtrFj/RQSa78f0uoxmyF+
0TM8ukj13Xnfs7j/EvEhmkvBioZxaUpmZmyPfjxwv60pIgbz5MDmgK7iS4+3mX6U
A5/TR5d8mUgjU+g4rk8Kb4Mu0UlXjIB0ttov0DiNewNwIRt18jA8+o+u3dpjq+sW
T8KOEUt+zwvo/7V3LvSye0rgTBIlDHCNAymg4VMk7BPZ7hm/ELNKjD+Jo2FR3qyH
B5T0Y3HsLuJvW5iB4YlcNHlsdu87kGJ55tukmi8mxdAQ4Q7e2RCOFvu396j3x+UC
B5iPNgiV5+I3lg02dZ77DnKxHZu8A/lJBdiB3QW0KtZB6awBdpUKD9jf1b0SHzUv
KBds0pjBqAlkd25HN7rOrFleaJ1/ctaJxQZBKT5ZPt0m9STJEadao0xAH0ahmbWn
OlFuhjuefXKnEgV4We0+UXgVCwOPjdAvBbI+e0ocS3MFEvzG6uBQE3xDk3SzynTn
jh8BCNAw1FtxNrQHusEwMFxIt4I7mKZ9YIqioymCzLq9gwQbooMDQaHWBfEbwrbw
qHyGO0aoSCqI3Haadr8faqU9GY/rOPNk3sgrDQoo//fb4hVC1CLQJ13hef4Y53CI
rU7m2Ys6xt0nUW7/vGT1M0NPAgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNV
HRMBAf8EBTADAQH/MB0GA1UdDgQWBBR5tFnme7bl5AFzgAiIyBpY9umbbjANBgkq
hkiG9w0BAQsFAAOCAgEAVR9YqbyyqFDQDLHYGmkgJykIrGF1XIpu+ILlaS/V9lZL
ubhzEFnTIZd+50xx+7LSYK05qAvqFyFWhfFQDlnrzuBZ6brJFe+GnY+EgPbk6ZGQ
3BebYhtF8GaV0nxvwuo77x/Py9auJ/GpsMiu/X1+mvoiBOv/2X/qkSsisRcOj/KK
NFtY2PwByVS5uCbMiogziUwthDyC3+6WVwW6LLv3xLfHTjuCvjHIInNzktHCgKQ5
ORAzI4JMPJ+GslWYHb4phowim57iaztXOoJwTdwJx4nLCgdNbOhdjsnvzqvHu7Ur
TkXWStAmzOVyyghqpZXjFaH3pO3JLF+l+/+sKAIuvtd7u+Nxe5AW0wdeRlN8NwdC
jNPElpzVmbUq4JUagEiuTDkHzsxHpFKVK7q4+63SM1N95R1NbdWhscdCb+ZAJzVc
oyi3B43njTOQ5yOf+1CceWxG1bQVs5ZufpsMljq4Ui0/1lvh+wjChP4kqKOJ2qxq
4RgqsahDYVvTH9w7jXbyLeiNdd8XM2w9U/t7y0Ff/9yi0GE44Za4rF2LN9d11TPA
mRGunUHBcnWEvgJBQl9nJEiU0Zsnvgc/ubhPgXRR4Xq37Z0j4r7g1SgEEzwxA57d
emyPxgcYxn/eR44/KJ4EBs+lVDR3veyJm+kXQ99b21/+jh5Xos1AnX5iItreGCc=
-----END CERTIFICATE-----
-----BEGIN CERTIFICATE-----
MIIFKTCCAxGgAwIBAgIRAOxGNJNgz0sP+KmC2Tqpyj0wDQYJKoZIhvcNAQELBQAw
LjELMAkGA1UEBhMCVVMxDTALBgNVBAoTBElTUkcxEDAOBgNVBAMTB1Jvb3QgWVIw
HhcNMjUwOTAzMDAwMDAwWhcNNDUwOTAyMjM1OTU5WjAuMQswCQYDVQQGEwJVUzEN
MAsGA1UEChMESVNSRzEQMA4GA1UEAxMHUm9vdCBZUjCCAiIwDQYJKoZIhvcNAQEB
BQADggIPADCCAgoCggIBANvGJnN78CTJdWL3+eGfsLN5TrNBJs+VH9hRXqRbwxu9
sGNiB0BD1fcOxbSUQCJIM1xE13Db+5Cw1w0s0EBYsvuIP/6joF0w8cuImbgR1OGg
YbSQ4OpzI+DG8SGuTlcE873OCS+kh3srlo6vl43M5OJg4Aeo1sfHp6kTJDoIiFBN
JAY+OKfX/FUvYKuhjT+no49lmqmupSBI5PkBQiqrEGtWU5uxU/cQWHGu8jSjFBzn
ZqvbNPLMXMLFxCb3WTfrJBXXjqvWG+v4bjzxjjeAtOlU7qarRDvNOyAuQYLln904
M+faKx8hnLCpJ15ZqaEgcNlY+9MMWcC5yvL2A2j3l9+2buggZX+dOE91zYmIdawT
vSZuVvlbRrAlLxIB6pwMBjneXCjYQ8+3BCCjssbSNpZU3hTcBDdhfAlEDlYr6pEa
tnMdmDT5BqnKC92bd0EhM1fbLHioLccLCuievT8ZkPhZrq7Mii7gNXAcUEAR8+lz
Yal+9zTg7C5DALyVOeG/CqfRAMn1KSHCR0NSA6P8tn/mGRlnCct5rtVCLnVySVpU
6H1qGg3DgTOuskf8eahTMiYbI5ezPJmO5ertalskQ1utp74+eDy92PI4ftHKTbq9
IWhH4YZKh3WnJEIt+oQvlYZbY8tpEroKrFB6PFGzrJIDRyts4HqvuH52RFj2zv/B
AgMBAAGjQjBAMA4GA1UdDwEB/wQEAwIBBjAPBgNVHRMBAf8EBTADAQH/MB0GA1Ud
DgQWBBTe51tg0CJtQCh9Pw0B/qS1UrRRlDANBgkqhkiG9w0BAQsFAAOCAgEAWHnf
713Bdkq7t5yN2dNIgQakUb94X9WuyhMEHHkgx4oDpSUlnG0w4g94MoqaEUE31ZjR
LU7L5LD1g9ujFHTQu8AD215AHMVQFbm6j8hQxdXHAzDajFNQnOlDJrLjzIx176oy
AjvUtejZx2NNmdb5fd0WGVGsCdoAJ3N8ozo7ajE8t6vfxStZb4BQ9WYJGHUDrv2N
i5tJF6CNiPnlzs3BUfECRbE4JSk+jvy8+VoGiFE8qsH/j78x2fjgQhAQFV7P7Zxy
dBTZ1wEkNpZNW2qnaK1SKBLa+xf6E06YRIq5uaI+HWH8SY1y5VbRgzq40EKg3yxP
06fz+uYAUIFJoLNfhwRCc3Q6pQVuMX3yAjHAes4gk4moGcLQ5p7HAh39yeylZc1J
41sx/jKwLIkPE6Rr1Nf4pxdsxf9SA4yOEiAkDgq04DVxn8hgYFdUtBCuiuVC2heA
EiqVEa+8QZjuw8Gj0EbHXcRd1nInvGqRS1o9Is7YBdQN57X1AYveGBNNqjICSb7c
awuw1EawTDrs13VUlJVEsbQ0/O/1aaV73mCdOQ8azqL2KTv1Ewu1xbquE2S+kdQU
To9TUwat3wUA6cwXh1EfpS/3fJ0aGah5hdpRyoCLDlsSn8tkrjMfFFX0viC+GxHc
sI1ANRYvqSFC2X1VRZfDg+wD6E21BccmifG4yWc=
-----END CERTIFICATE-----
)CACERT";

// Topic layout. <id> is SECRET_MQTT_STATION_ID and is deliberately SHORT ("mast"): the
// topic string is retransmitted in every single PUBLISH, so at 5 packets a second its
// length is a standing traffic cost — a 32-character cluster id in place of four
// characters worked out at ~13% of the whole uplink budget.
//
//   live    QoS 0, not retained, 5/s   — the fast half: a burst of speed samples
//   state   QoS 1, retained,     5 s   — the slow half: everything /api/data carries
//   status  QoS 1, retained,     LWT   — {"online":true|false}
//   cmd     QoS 1                      — signed commands coming down
//   ack     QoS 1                      — what was actually done about them
//   hist    QoS 1                      — minute aggregates that piled up while offline
//
// Splitting fast from slow is the whole point of the format: chargeState and uptime do
// not change between frames and cost more to send than the wind does. The dashboard
// reassembles {...state, speed: s[i], gust: g} and gets an object shaped exactly like an
// SSE frame, so its existing render path is untouched.
#define CLOUD_TOPIC_MAX 64
char cloudTopicLive  [CLOUD_TOPIC_MAX];
char cloudTopicState [CLOUD_TOPIC_MAX];
char cloudTopicStatus[CLOUD_TOPIC_MAX];
char cloudTopicCmd   [CLOUD_TOPIC_MAX];
char cloudTopicAck   [CLOUD_TOPIC_MAX];
char cloudTopicHist  [CLOUD_TOPIC_MAX];
char cloudClientId   [48];

// 4 samples per packet at 5 packets/s is 20 Hz delivered in bursts — the same rate the
// local SSE stream runs at, and indistinguishable from it once the dashboard plays the
// burst back one sample per 50 ms. Going faster buys nothing: LTE Cat-1 RTT is 150-400 ms,
// so past ~5 Hz packets queue behind the network instead of arriving sooner. That is a
// number from the physics of the link, not from the tariff.
#define CLOUD_LIVE_SAMPLES 4
const unsigned long CLOUD_SAMPLE_MS       = 50;     // 20 Hz, same cadence as the SSE push
const unsigned long CLOUD_LIVE_MS         = 200;    // 5 packets/s
// On battery the rate drops to 1 packet/s. Cheap, and on a mast running off the pack
// there is most likely nobody watching anyway.
const unsigned long CLOUD_LIVE_MS_BATTERY = 1000;
const unsigned long CLOUD_STATE_MS        = 5000;   // slow half, unconditionally
const unsigned long CLOUD_STATE_MIN_MS    = 1000;   // floor for change-driven pushes
const unsigned long CLOUD_AGG_MS          = 60000;  // one aggregate a minute

// TLS handshake needs more stack than the default. 8192 is the documented figure for
// certificate verification and it is not generous — the default is what fails, and it
// fails silently, as a reconnect loop.
const int CLOUD_TASK_STACK     = 8192;
// Both directions of the MQTT-level buffer. The largest thing passing through is a state
// frame (~600 B) or a history batch, so 2 kB has room and costs 4 kB of heap.
const int CLOUD_BUFFER_SIZE    = 2048;
// Hard backstop on the outbox. Live frames are never queued while disconnected (see
// serviceCloud) so this should never be reached; it is here so a bug in that rule costs
// a few dropped frames instead of the heap.
const uint64_t CLOUD_OUTBOX_LIMIT = 4096;
const int CLOUD_KEEPALIVE_S    = 60;
const int CLOUD_RECONNECT_MS   = 10000;
const int CLOUD_NET_TIMEOUT_MS = 10000;

// How far ahead a command's expiry may sit. Combined with "exp must still be in the
// future" this bounds the replay window at both ends: a captured packet stops working on
// its own, and one signed with exp in 2099 is refused rather than being valid forever.
const uint32_t CLOUD_CMD_MAX_FUTURE_S = 900;
#define CLOUD_CMD_MAX   384    // a command larger than this is not one of ours
#define CLOUD_CMD_QUEUE 4

// Minute aggregates, kept in RAM and nowhere else. 200 of them is a bit over three hours.
// The 5 Hz live stream is deliberately NOT buffered across a disconnect: wind data is
// alive exactly as long as it is live, and replaying a minute of stale samples into a
// gauge would be showing the viewer something untrue. A min/avg/max per minute is the
// honest thing to keep, it survives a reconnect, and it costs 3.2 kB.
//
// RAM and not SPIFFS on purpose: this firmware never writes flash (same rule as
// /api/zero), and a ring that dies with the power is a smaller loss than breaking that.
#define CLOUD_AGG_N 200
struct CloudAgg {
  uint32_t t;      // epoch seconds at the end of the minute, 0 if the clock was not set
  float    mn;
  float    avg;
  float    mx;
};
CloudAgg cloudAgg[CLOUD_AGG_N];
uint32_t cloudAggTotal = 0;    // how many have ever been produced; index = total % N
uint32_t cloudAggSent  = 0;    // how many of those have reached the broker
float    cloudAccMin = 0, cloudAccMax = 0, cloudAccSum = 0;
uint32_t cloudAccN   = 0;
unsigned long cloudAccSince = 0;
// Big enough to drain three hours in a few seconds, small enough to fit the buffer.
#define CLOUD_HIST_BATCH 15

// Client handle and the flags the MQTT task writes. Anything the MQTT task touches is
// either volatile or a queue: its handler runs on its own task, on the other core.
esp_mqtt_client_handle_t cloudClient = nullptr;
volatile bool     cloudConnected = false;
volatile bool     cloudNeedHello = false;   // connected: subscribe + status + backlog
bool              cloudStarted   = false;   // client created and started
// RAM only, same rule as /api/modem?off and /api/zero: this turns the channel off for
// this session, and what should survive a reboot belongs in SECRET_HAS_CLOUD.
bool              cloudEnabled   = true;
// Pin the MQTT socket to the modem instead of letting the routing table choose. RAM only,
// like every other runtime switch here, and false on every boot: on the mast PPP is the
// only route and the question does not arise, so this exists purely to ask "does TLS
// survive a 4G link" while a WiFi route is also present — the one situation in which
// watching the default route cannot answer it. Set through /api/cloud?via=ppp.
bool              cloudBindPpp   = false;
char              cloudBoundIf[8] = "";   // lwIP name actually bound, empty when unbound
volatile uint32_t cloudConnects  = 0;
volatile uint32_t cloudErrors    = 0;
uint32_t          cloudPubLive   = 0;
uint32_t          cloudPubDrop   = 0;
uint32_t          cloudCmdOk     = 0;
uint32_t          cloudCmdBad    = 0;
// Written by the MQTT task, read by loop() and /api/cloud. A torn read here shows a
// mangled diagnostic string and nothing worse, which is the right trade against taking a
// lock on the error path.
char              cloudLastError[96] = "";

char     cloudSessionId[17] = "";     // 8 random bytes as hex, regenerated every boot
uint32_t cloudCmdLastId     = 0;      // highest command id executed in THIS session
uint8_t  cloudHmacKey[32];
bool     cloudHmacKeyOk     = false;

float         cloudLiveBuf[CLOUD_LIVE_SAMPLES];
uint8_t       cloudLiveCount = 0;
uint32_t      cloudLiveSeq   = 0;
unsigned long cloudSampleAt  = 0;
unsigned long cloudLiveAt    = 0;
unsigned long cloudStateAt   = 0;
unsigned long cloudHistAt    = 0;
QueueHandle_t cloudCmdQueue  = nullptr;

// The slow fields, remembered so a change can push a state frame without waiting out the
// 5 s tick. Comparing the built JSON would not work — uptime moves every second, so every
// comparison would differ and every tick would publish.
struct CloudSlow {
  const char* charge;
  const char* power;
  int         batteryPercent;
  uint8_t     leds;        // four 2-bit modes packed
  bool        ledAuto;
  bool        adcError;
  bool        staUp;
  bool        clockValid;
};
CloudSlow cloudSlowLast = { nullptr, nullptr, -1, 0xFF, false, false, false, false };
// Set when a slow field moves, cleared when the frame carrying it actually leaves. See
// the publish site in serviceCloud() for why this cannot be a local.
bool cloudSlowDirty = false;

// ---- small helpers -------------------------------------------------------------------

static int cloudHexNibble(char c) {
  if (c >= '0' && c <= '9') return c - '0';
  if (c >= 'a' && c <= 'f') return c - 'a' + 10;
  if (c >= 'A' && c <= 'F') return c - 'A' + 10;
  return -1;
}

// Strict: the whole string must be hex and must fill the buffer exactly. Anything else is
// a configuration mistake, and a half-decoded key would be a silent one.
static bool cloudHexToBytes(const char* hex, uint8_t* out, size_t outLen) {
  if (!hex || strlen(hex) != outLen * 2) return false;
  for (size_t i = 0; i < outLen; i++) {
    int hi = cloudHexNibble(hex[i * 2]);
    int lo = cloudHexNibble(hex[i * 2 + 1]);
    if (hi < 0 || lo < 0) return false;
    out[i] = (uint8_t)((hi << 4) | lo);
  }
  return true;
}

// Constant-time compare. On a 32-byte tag over a slow link the timing channel is mostly
// theoretical, but the memcmp version is not shorter or clearer, so there is nothing to
// trade away by doing it properly.
static bool cloudEqualCt(const uint8_t* a, const uint8_t* b, size_t n) {
  uint8_t diff = 0;
  for (size_t i = 0; i < n; i++) diff |= (uint8_t)(a[i] ^ b[i]);
  return diff == 0;
}

// Minimal field readers for a message of known, fixed shape. Not a JSON parser and not
// pretending to be one: a command is a flat object of five fields that we generate the
// signing rules for, so the useful behaviour here is to be rigid. Any payload with a
// backslash inside a string is refused outright by the caller rather than unescaped —
// nothing we send needs an escape, so their presence means the message is not ours.
static bool cloudJsonStr(const char* json, const char* key, char* out, size_t outLen) {
  char pat[24];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* p = strstr(json, pat);
  if (!p) return false;
  p = strchr(p + strlen(pat), ':');
  if (!p) return false;
  p++;
  while (*p == ' ' || *p == '\t') p++;
  if (*p != '"') return false;
  p++;
  size_t n = 0;
  while (*p && *p != '"') {
    if (*p == '\\' || n + 1 >= outLen) return false;
    out[n++] = *p++;
  }
  if (*p != '"') return false;
  out[n] = 0;
  return true;
}

static bool cloudJsonNum(const char* json, const char* key, long long* out) {
  char pat[24];
  snprintf(pat, sizeof(pat), "\"%s\"", key);
  const char* p = strstr(json, pat);
  if (!p) return false;
  p = strchr(p + strlen(pat), ':');
  if (!p) return false;
  p++;
  while (*p == ' ' || *p == '\t') p++;
  if (*p != '-' && (*p < '0' || *p > '9')) return false;
  char* end = nullptr;
  long long v = strtoll(p, &end, 10);
  if (end == p) return false;
  *out = v;
  return true;
}

// ---- outgoing frames -----------------------------------------------------------------

// Non-blocking publish, and the choice of call is the entire point of this wrapper.
//
// esp_mqtt_client_publish() writes to the socket in the CALLER's context for QoS 0 — one
// slow socket and loop() is stopped, which is exactly the stall this whole subsystem was
// built to avoid. enqueue() hands the message to the MQTT task and returns.
//
// The `store` argument is the second trap and it is not obvious: with store=false only
// QoS 1 and 2 are enqueued and a QoS 0 message is silently DROPPED. Every live frame is
// QoS 0, so store must be true or the fast half of the channel publishes nothing at all
// while reporting no error whatsoever.
//
// What it costs, measured 2026-09-12 rather than assumed. The MQTT task sits in a poll on
// the socket and only drains the outbox when it wakes, so an enqueued message waits out
// the remainder of that poll — about a second on the stock build (the core ships esp-mqtt
// with CONFIG_MQTT_USE_CUSTOM_CONFIG unset, so the poll timeout is the default one).
// Command round trip, operator to station and back over the broker:
//
//     1162 ms median          — ack alone, waiting for the poll to expire
//      442 ms median          — same ack when a second inbound message wakes the task
//                               250 ms early, i.e. the real path is ~200 ms
//
// So roughly a second of the delay is queue, not network, and it is a CONSTANT lag rather
// than jitter: live frames at 1 Hz arrive 1005 ms apart (median over 30), evenly spaced.
// At the 5 Hz rate expect one burst of five per wake-up instead of five even frames —
// harmless, because the dashboard plays a burst back on its own 50 ms clock.
//
// Left as is on purpose. The cure would be esp_mqtt_client_publish(), whose own
// documentation says it "might block for several seconds", in the CALLER's task — which
// is loop(), which is the 50 Hz sampler. A second of lag on a wind reading is worth far
// less than a sampler that stops. Nothing in the public API wakes the task early.
static bool cloudSend(const char* topic, const char* payload, int qos, int retain) {
  if (!cloudClient || !cloudConnected) return false;
  int id = esp_mqtt_client_enqueue(cloudClient, topic, payload, (int)strlen(payload),
                                   qos, retain, true);
  if (id < 0) {
    cloudPubDrop++;
    return false;
  }
  return true;
}

// The fast half. {"q":<seq>,"s":[...],"g":<gust>} — about 60 bytes on the wire.
//
// `q` is a packet counter, not a timestamp: the dashboard plays the burst back on its own
// 50 ms clock and only needs to know whether it missed a packet. A timestamp would cost
// ten bytes in every packet to say something the receiver already knows.
static void cloudPublishLive() {
  if (cloudLiveCount == 0) return;
  char buf[128];
  int n = snprintf(buf, sizeof(buf), "{\"q\":%lu,\"s\":[", (unsigned long)cloudLiveSeq);
  for (uint8_t i = 0; i < cloudLiveCount && n > 0 && n < (int)sizeof(buf); i++) {
    n += snprintf(buf + n, sizeof(buf) - n, "%s%.2f", i ? "," : "", cloudLiveBuf[i]);
  }
  if (n > 0 && n < (int)sizeof(buf)) {
    snprintf(buf + n, sizeof(buf) - n, "],\"g\":%.2f}", windGust);
  }
  // QoS 0 and not retained: a live sample that arrives late is worse than one that never
  // arrives, so there is nothing here worth a retransmission.
  if (cloudSend(cloudTopicLive, buf, 0, 0)) cloudPubLive++;
  cloudLiveSeq++;
  cloudLiveCount = 0;
}

// The slow half. Exactly what /api/data carries, plus sessionId — so the public dashboard
// gets the same object shape the local one already renders, and the whole difference
// between the two builds is where the bytes came from.
static void cloudPublishState() {
  String json = buildDataJson();
  if (json.length() < 2) return;
  json.remove(json.length() - 1);                       // drop the closing brace
  json += ",\"sessionId\":\"" + String(cloudSessionId) + "\"}";
  cloudSend(cloudTopicState, json.c_str(), 1, 1);       // retained: a late viewer still
  cloudStateAt = millis();                              // gets the current picture
}

// Has anything in the slow half actually moved? Cheap enough to run every pass.
static bool cloudSlowChanged() {
  CloudSlow now;
  now.charge         = chargeState;
  now.power          = powerSource;
  now.batteryPercent = batteryPresent ? batteryPercent : -1;
  now.leds           = (uint8_t)(ledGreen | (ledYellow << 2) | (ledRed << 4) | (ledWifi << 6));
  now.ledAuto        = ledAutoMode;
  now.adcError       = adcError;
#if HAS_HOME_NETWORK
  now.staUp          = staUp;
#else
  now.staUp          = false;
#endif
  now.clockValid     = clockValid;

  bool changed = (now.charge != cloudSlowLast.charge) ||
                 (now.power  != cloudSlowLast.power)  ||
                 (now.batteryPercent != cloudSlowLast.batteryPercent) ||
                 (now.leds   != cloudSlowLast.leds)   ||
                 (now.ledAuto    != cloudSlowLast.ledAuto)  ||
                 (now.adcError   != cloudSlowLast.adcError) ||
                 (now.staUp      != cloudSlowLast.staUp) ||
                 (now.clockValid != cloudSlowLast.clockValid);
  cloudSlowLast = now;
  return changed;
}

// ---- minute aggregates ---------------------------------------------------------------

static void cloudAggSample(float v) {
  if (cloudAccN == 0) {
    cloudAccMin = cloudAccMax = v;
    cloudAccSum = 0;
    cloudAccSince = millis();
  }
  if (v < cloudAccMin) cloudAccMin = v;
  if (v > cloudAccMax) cloudAccMax = v;
  cloudAccSum += v;
  cloudAccN++;

  if (millis() - cloudAccSince < CLOUD_AGG_MS) return;

  CloudAgg& slot = cloudAgg[cloudAggTotal % CLOUD_AGG_N];
  slot.t   = clockValid ? (uint32_t)time(nullptr) : 0;
  slot.mn  = cloudAccMin;
  slot.mx  = cloudAccMax;
  slot.avg = cloudAccSum / (float)cloudAccN;
  cloudAggTotal++;
  cloudAccN = 0;

  // The ring has overwritten what was never sent — count it as sent so the backlog
  // pointer cannot chase entries that no longer exist.
  if (cloudAggTotal - cloudAggSent > CLOUD_AGG_N) cloudAggSent = cloudAggTotal - CLOUD_AGG_N;
}

// Drain whatever piled up while the link was down, a batch per call so the outbox is
// never handed three hours of history in one go.
static void cloudPublishHist() {
  if (cloudAggSent >= cloudAggTotal) return;
  uint32_t take = cloudAggTotal - cloudAggSent;
  if (take > CLOUD_HIST_BATCH) take = CLOUD_HIST_BATCH;

  String json = "{\"from\":" + String(cloudAggSent) + ",\"a\":[";
  for (uint32_t i = 0; i < take; i++) {
    const CloudAgg& a = cloudAgg[(cloudAggSent + i) % CLOUD_AGG_N];
    if (i) json += ",";
    json += "[" + String(a.t) + "," + String(a.mn, 2) + "," + String(a.avg, 2) + "," +
            String(a.mx, 2) + "]";
  }
  json += "]}";
  if (cloudSend(cloudTopicHist, json.c_str(), 1, 0)) cloudAggSent += take;
}

// ---- commands ------------------------------------------------------------------------
//
// The socket is TLS and the broker authenticates both ends, and neither of those is why a
// command is trusted. The topic has two endpoints and the second one is somebody else's
// infrastructure, so what actually authorises a command is a signature the station can
// check by itself, whoever delivered it and however.
//
//   wind/<id>/cmd  {"id":17,"op":"gust-reset","args":"","exp":1789000000,"sig":"<64 hex>"}
//
//   sig = HMAC-SHA256(key, id "\n" op "\n" args "\n" exp "\n" sessionId)
//
// sessionId is in the signed data but NOT on the wire: the station knows its own and
// substitutes it. That is what closes the replay hole the `id` counter leaves open —
// `id` cannot survive a reboot, because this firmware never writes NVS and there is no
// RTC, so after a restart lastId is 0 again and yesterday's captured packet would be
// accepted. A session nonce regenerated at every boot makes it fail the signature check
// instead, with nothing stored anywhere. `id` stays, and is honestly a within-session
// defence rather than an across-reboot one.
//
// Whoever signs must reproduce that string byte for byte: id and exp are plain decimal
// with no padding, args is the raw string (empty when there is none), the separator is a
// single \n, and the key is SECRET_CMD_HMAC_KEY decoded from hex to its 32 bytes.

static bool cloudVerifySig(const char* signedData, const char* sigHex) {
  if (!cloudHmacKeyOk) return false;
  uint8_t want[32];
  if (!cloudHexToBytes(sigHex, want, sizeof(want))) return false;

  uint8_t got[32];
  const mbedtls_md_info_t* md = mbedtls_md_info_from_type(MBEDTLS_MD_SHA256);
  if (!md) return false;
  if (mbedtls_md_hmac(md, cloudHmacKey, sizeof(cloudHmacKey),
                      (const unsigned char*)signedData, strlen(signedData), got) != 0) {
    return false;
  }
  return cloudEqualCt(got, want, sizeof(got));
}

// Deadline for a commanded restart, 0 when none is pending. A reboot cannot happen inside
// the command handler: the ack and the offline status have only been ENQUEUED at that
// point, and restarting immediately would drop both — the operator would see a station
// that went silent with no answer to the thing they asked for.
unsigned long cloudRebootAt = 0;

// Pull one key out of an /api/led-style argument string: "auto=false&green=on".
static bool cloudArgValue(const char* args, const char* key, char* out, size_t outLen) {
  size_t klen = strlen(key);
  const char* p = args;
  while (p && *p) {
    const char* eq = strchr(p, '=');
    if (!eq) return false;
    const char* amp = strchr(eq, '&');
    if ((size_t)(eq - p) == klen && strncmp(p, key, klen) == 0) {
      size_t vlen = amp ? (size_t)(amp - eq - 1) : strlen(eq + 1);
      if (vlen + 1 > outLen) return false;
      memcpy(out, eq + 1, vlen);
      out[vlen] = 0;
      return true;
    }
    if (!amp) return false;
    p = amp + 1;
  }
  return false;
}

// Execute a verified command. Runs in loop(), never on the MQTT task — everything it
// touches is state loop() owns, and reaching into it from another core would be a race
// that only ever shows up as an impossible reading.
//
// Whitelist, and it is the whole list. There is deliberately no "run this request" or
// "write this register": the value of a closed list is that reading it is enough to know
// what a stolen key could do.
static bool cloudRunCommand(const char* op, const char* args, char* detail, size_t detailLen) {
  if (strcmp(op, "gust-reset") == 0) {
    windGust = windSpeed;
    gustResetTimer = millis();
    snprintf(detail, detailLen, "gust reset to %.2f", windSpeed);
    return true;
  }

  if (strcmp(op, "zero-set") == 0) {
    // Empty args means "adopt what the pin reads right now", the form used with the cups
    // held still. Same guard rails as /api/zero: zero would disable the gate and turn the
    // ADC floor into 2.2 m/s of permanent phantom wind, and a volt is already a big slice
    // of the useful range. RAM only, like everything else here.
    float mv = (args[0] == 0) ? speedMvRaw : atof(args);
    if (!(mv > 20.0f && mv < 1000.0f)) {
      snprintf(detail, detailLen, "refused %.1f mV, expected 20..1000", mv);
      return false;
    }
    speedZeroMv = mv;
    snprintf(detail, detailLen, "zero = %.1f mV", mv);
    return true;
  }

  if (strcmp(op, "led") == 0) {
    char v[16];
    if (cloudArgValue(args, "auto", v, sizeof(v))) ledAutoMode = (strcmp(v, "true") == 0);
    if (!ledAutoMode) {
      if (cloudArgValue(args, "green",  v, sizeof(v))) ledGreen  = parseLedMode(String(v));
      if (cloudArgValue(args, "yellow", v, sizeof(v))) ledYellow = parseLedMode(String(v));
      if (cloudArgValue(args, "red",    v, sizeof(v))) ledRed    = parseLedMode(String(v));
      if (cloudArgValue(args, "wifi",   v, sizeof(v))) ledWifi   = parseLedMode(String(v));
    }
    snprintf(detail, detailLen, "auto=%s", ledAutoMode ? "true" : "false");
    return true;
  }

  if (strcmp(op, "reboot") == 0) {
    cloudRebootAt = millis() + 1500;
    snprintf(detail, detailLen, "rebooting in 1.5 s");
    return true;
  }

  if (strcmp(op, "ota") == 0) {
    // Reserved on purpose rather than quietly missing from the list. Updating over 4G is
    // pull-only (espota needs an inbound connection, which CGNAT makes impossible), so it
    // is HTTPUpdate against a URL and it lands with that step — see the OTA section of
    // tasks/10. Refusing loudly here is better than an operator wondering why nothing
    // happened.
    snprintf(detail, detailLen, "ota not implemented yet — see tasks/10, pull-OTA step");
    return false;
  }

  snprintf(detail, detailLen, "unknown op");
  return false;
}

// Verify, then run, then say what happened. Every exit publishes an ack: a command that
// was rejected is exactly the case where the operator most needs to hear why, and silence
// is indistinguishable from a dead link.
static void cloudHandleCommand(const char* json) {
  char op[32] = "", args[128] = "", sig[80] = "", detail[96] = "";
  long long id = 0, exp = 0;
  bool ok = false;

  if (!cloudJsonNum(json, "id", &id) || !cloudJsonNum(json, "exp", &exp) ||
      !cloudJsonStr(json, "op", op, sizeof(op)) ||
      !cloudJsonStr(json, "sig", sig, sizeof(sig))) {
    snprintf(detail, sizeof(detail), "malformed");
  } else if (!cloudJsonStr(json, "args", args, sizeof(args))) {
    args[0] = 0;                                   // args is optional, absent == empty
  }

  // The op is echoed back in the ack, so it has to be safe to paste into JSON. The
  // extractor already refuses quotes and backslashes; this also rules out control
  // characters, which would produce an ack no parser would accept. A whitelist rather
  // than an escaper, because every real op is lowercase letters and a hyphen.
  if (detail[0] == 0) {
    for (const char* p = op; *p; p++) {
      bool sane = (*p >= 'a' && *p <= 'z') || (*p >= 'A' && *p <= 'Z') ||
                  (*p >= '0' && *p <= '9') || *p == '-' || *p == '_';
      if (!sane) {
        op[0] = 0;
        snprintf(detail, sizeof(detail), "bad op");
        break;
      }
    }
  }

  if (detail[0] == 0) {
    if (id <= 0 || id > 0x7FFFFFFFLL) {
      snprintf(detail, sizeof(detail), "bad id");
    } else if ((uint32_t)id <= cloudCmdLastId) {
      // Within a session this is the replay guard. Across a reboot it is useless by
      // construction, which is what sessionId is for.
      snprintf(detail, sizeof(detail), "id %lld not newer than %lu", id,
               (unsigned long)cloudCmdLastId);
    } else if (!clockValid) {
      // Without a real clock exp cannot be judged, and accepting commands anyway would
      // mean accepting them forever. The station is not in a hurry.
      snprintf(detail, sizeof(detail), "no clock yet");
    } else {
      time_t now = time(nullptr);
      if (exp <= (long long)now) {
        snprintf(detail, sizeof(detail), "expired %lld s ago", (long long)now - exp);
      } else if (exp - (long long)now > (long long)CLOUD_CMD_MAX_FUTURE_S) {
        snprintf(detail, sizeof(detail), "exp too far ahead");
      } else if (!cloudHmacKeyOk) {
        snprintf(detail, sizeof(detail), "no usable HMAC key in this build");
      } else {
        // The canonical signed string. Built here and nowhere else, so there is one
        // definition of it in the firmware.
        char signedData[256];
        int n = snprintf(signedData, sizeof(signedData), "%lld\n%s\n%s\n%lld\n%s",
                         id, op, args, exp, cloudSessionId);
        if (n <= 0 || n >= (int)sizeof(signedData)) {
          snprintf(detail, sizeof(detail), "command too long to sign");
        } else if (!cloudVerifySig(signedData, sig)) {
          snprintf(detail, sizeof(detail), "bad signature");
        } else {
          // Only past every check does the id advance — otherwise anyone able to reach
          // the topic could burn the counter forward with garbage and lock the real
          // operator out.
          cloudCmdLastId = (uint32_t)id;
          ok = cloudRunCommand(op, args, detail, sizeof(detail));
        }
      }
    }
  }

  if (ok) cloudCmdOk++; else cloudCmdBad++;
  Serial.printf("Cloud cmd id=%lld op=%s: %s (%s)\n", id, op[0] ? op : "?",
                ok ? "ok" : "refused", detail);

  char ack[256];
  snprintf(ack, sizeof(ack), "{\"id\":%lld,\"ok\":%s,\"op\":\"%s\",\"detail\":\"%s\"}",
           id, ok ? "true" : "false", op, detail);
  cloudSend(cloudTopicAck, ack, 1, 0);
}

// ---- the client itself ---------------------------------------------------------------

// Retained, so a dashboard that opens the page an hour later still learns the station is
// away instead of waiting for a frame that is never coming.
static const char CLOUD_LWT_MSG[] = "{\"online\":false}";

// Runs on the MQTT client's own task, on whichever core it landed. It therefore does as
// little as possible: raise a flag, or copy a payload into a queue. Subscribing and
// publishing are left to loop() — not because esp-mqtt forbids doing them here, it does
// not, but because every byte of station state belongs to loop() and keeping the boundary
// in one place is worth more than saving a pass.
static void cloudEventHandler(void* arg, esp_event_base_t base, int32_t id, void* data) {
  esp_mqtt_event_handle_t ev = (esp_mqtt_event_handle_t)data;
  switch ((esp_mqtt_event_id_t)id) {

    case MQTT_EVENT_CONNECTED:
      cloudConnected = true;
      cloudNeedHello = true;
      cloudConnects++;
      break;

    case MQTT_EVENT_DISCONNECTED:
      cloudConnected = false;
      break;

    case MQTT_EVENT_ERROR:
      cloudErrors++;
      if (ev && ev->error_handle) {
        if (ev->error_handle->error_type == MQTT_ERROR_TYPE_TCP_TRANSPORT) {
          snprintf(cloudLastError, sizeof(cloudLastError),
                   "transport: esp-tls 0x%x, sock errno %d",
                   ev->error_handle->esp_tls_last_esp_err, ev->error_handle->esp_transport_sock_errno);
        } else if (ev->error_handle->error_type == MQTT_ERROR_TYPE_CONNECTION_REFUSED) {
          // return code 5 is "not authorized" — wrong user, wrong password, or a
          // credential the broker has since deleted. 4 is bad user/password on some
          // brokers. Worth spelling out: this is the failure that otherwise looks like
          // a network problem and gets debugged as one.
          snprintf(cloudLastError, sizeof(cloudLastError),
                   "broker refused connection, CONNACK rc=%d",
                   (int)ev->error_handle->connect_return_code);
        } else {
          snprintf(cloudLastError, sizeof(cloudLastError), "error type %d",
                   (int)ev->error_handle->error_type);
        }
      }
      break;

    case MQTT_EVENT_DATA: {
      if (!ev || !cloudCmdQueue) break;
      // One fragment only. esp-mqtt splits a payload larger than the buffer across
      // several events, and a command that needs splitting is not a command of ours —
      // reassembling it would be code that only ever runs for malformed input.
      if (ev->current_data_offset != 0 || ev->data_len != ev->total_data_len) break;
      if (ev->data_len <= 0 || ev->data_len >= CLOUD_CMD_MAX) break;
      if (!ev->topic || ev->topic_len != (int)strlen(cloudTopicCmd)) break;
      if (strncmp(ev->topic, cloudTopicCmd, ev->topic_len) != 0) break;

      // A stack copy, NUL-terminated: what the event carries is neither terminated nor
      // valid after this call returns.
      char msg[CLOUD_CMD_MAX];
      memcpy(msg, ev->data, ev->data_len);
      msg[ev->data_len] = 0;
      // Non-blocking on purpose. A full queue means commands are arriving faster than
      // loop() can run them, which is either a flood or a bug, and neither is improved
      // by stalling the MQTT task.
      xQueueSend(cloudCmdQueue, msg, 0);
      break;
    }

    default:
      break;
  }
}

static void cloudStart() {
  esp_mqtt_client_config_t cfg = {};

  cfg.broker.address.hostname  = SECRET_MQTT_HOST;
  cfg.broker.address.transport = MQTT_TRANSPORT_OVER_SSL;
  cfg.broker.address.port      = SECRET_MQTT_PORT;
  // Certificate verification against the two-root bundle above. Length 0 = PEM, and the
  // hostname is checked against the certificate CN by default — skip_cert_common_name_check
  // stays false, which is the entire reason the broker is addressed by name and never by
  // address.
  cfg.broker.verification.certificate = CLOUD_ROOT_CA;

  cfg.credentials.username  = SECRET_MQTT_USER;
  cfg.credentials.client_id = cloudClientId;
  cfg.credentials.authentication.password = SECRET_MQTT_PASSWORD;

  cfg.session.last_will.topic  = cloudTopicStatus;
  cfg.session.last_will.msg    = CLOUD_LWT_MSG;
  cfg.session.last_will.qos    = 1;
  cfg.session.last_will.retain = 1;
  cfg.session.keepalive        = CLOUD_KEEPALIVE_S;

  // Auto-reconnect stays ON — the reconnect machine is already written and correct, and
  // a hand-rolled one here would be a second backoff loop fighting the modem's.
  cfg.network.reconnect_timeout_ms = CLOUD_RECONNECT_MS;
  cfg.network.timeout_ms           = CLOUD_NET_TIMEOUT_MS;

#if HAS_MODEM && MODEM_USE_PPP
  // SO_BINDTODEVICE under the hood, so it must outlive the client — hence static, not a
  // local that dies with this function. Failing to resolve the name is not fatal: the
  // client then goes out over the default route, which is honestly reported below rather
  // than silently pretending the test ran over 4G.
  static struct ifreq cloudIfr;
  cloudBoundIf[0] = 0;
  if (cloudBindPpp && PPP.netif() &&
      esp_netif_get_netif_impl_name(PPP.netif(), cloudIfr.ifr_name) == ESP_OK) {
    cfg.network.if_name = &cloudIfr;
    snprintf(cloudBoundIf, sizeof(cloudBoundIf), "%s", cloudIfr.ifr_name);
  }
#endif

  cfg.task.stack_size = CLOUD_TASK_STACK;
  cfg.buffer.size     = CLOUD_BUFFER_SIZE;
  cfg.outbox.limit    = CLOUD_OUTBOX_LIMIT;

  cloudClient = esp_mqtt_client_init(&cfg);
  if (!cloudClient) {
    snprintf(cloudLastError, sizeof(cloudLastError), "client init failed (out of heap?)");
    Serial.println("Cloud: client init failed");
    return;
  }
  esp_mqtt_client_register_event(cloudClient, MQTT_EVENT_ANY, cloudEventHandler, nullptr);
  esp_err_t err = esp_mqtt_client_start(cloudClient);
  if (err != ESP_OK) {
    snprintf(cloudLastError, sizeof(cloudLastError), "start failed: %s", esp_err_to_name(err));
    Serial.printf("Cloud: start failed: %s\n", esp_err_to_name(err));
    esp_mqtt_client_destroy(cloudClient);
    cloudClient = nullptr;
    return;
  }
  cloudStarted = true;
  Serial.printf("Cloud: connecting to %s:%d as '%s', session %s, via %s, free heap %u\n",
                SECRET_MQTT_HOST, (int)SECRET_MQTT_PORT, SECRET_MQTT_USER,
                cloudSessionId, cloudBoundIf[0] ? cloudBoundIf : "default route",
                (unsigned)ESP.getFreeHeap());
}

// Deliberate shutdown: OTA, or /api/cloud?off=1.
//
// The offline status has to be published by hand here, and that is not belt and braces.
// A clean MQTT DISCONNECT tells the broker NOT to publish the will — that is what the
// protocol says it means — so a graceful stop would otherwise leave the retained status
// saying "online" forever. The LWT still covers every UNgraceful case, which is most of
// them: a dead link, a panic, a brownout, a modem left in CMUX.
//
// Honest caveat: the goodbye is enqueued, not flushed. esp-mqtt drains its outbox before
// honouring the stop in the usual case, but it is not promised. Worst case the retained
// status lags by the length of an OTA and is corrected the moment the station comes back.
static void cloudGoodbye(const char* why) {
  if (!cloudStarted) return;
  if (cloudConnected) cloudSend(cloudTopicStatus, CLOUD_LWT_MSG, 1, 1);
  esp_mqtt_client_stop(cloudClient);
  esp_mqtt_client_destroy(cloudClient);
  cloudClient    = nullptr;
  cloudStarted   = false;
  cloudConnected = false;
  cloudNeedHello = false;
  cloudLiveCount = 0;
  Serial.printf("Cloud: stopped (%s)\n", why);
}

// Called every pass, like serviceUplink() and serviceClock(). An ordinary pass is a
// couple of comparisons; nothing in here blocks, and nothing in here waits on the
// network — the expensive parts all live on the MQTT task.
static void serviceCloud() {
  // A commanded restart, once the ack has had time to leave. FIRST thing in the function
  // and not last: a reboot that has already been acknowledged has to happen even if the
  // link dies inside the 1.5 s grace period, and every early return below this point
  // (disabled, no route, not connected) would otherwise swallow it — leaving an operator
  // with a station that answered "rebooting in 1.5 s" and then simply did not.
  // The modem needs the same courtesy an OTA gets: restarting the ESP32 while the A7670
  // sits in CMUX leaves an uplink that nothing short of a power cycle can rebuild.
  if (cloudRebootAt && (long)(millis() - cloudRebootAt) >= 0) {
    cloudGoodbye("reboot commanded");
#if HAS_MODEM && MODEM_USE_PPP
    if (modemPppOwnsUart()) {
      PPP.mode(ESP_MODEM_MODE_COMMAND);
      PPP.end();
      Serial.println("Cloud: asked the modem to leave CMUX before reboot");
    }
#endif
    Serial.println("Cloud: rebooting on command");
    Serial.flush();
    ESP.restart();
  }

  if (!cloudEnabled) {
    if (cloudStarted) cloudGoodbye("disabled at runtime");
    return;
  }

  bool haveUplink = (WiFi.status() == WL_CONNECTED);
#if HAS_MODEM && MODEM_USE_PPP
  haveUplink = haveUplink || (modemPppState == MODEM_PPP_ONLINE);
#endif

  if (!cloudStarted) {
    // Two gates, and the second one is the one that gets forgotten. A certificate is
    // checked against the clock, and the ESP32 boots in 1970 — so the first handshake
    // fails with "certificate is not yet valid" long before any of this matters. Nothing
    // may start until serviceClock() has a real date. The route gate is the cheap one:
    // starting a TLS client with no default route just burns handshakes.
    if (!haveUplink || !clockValid) return;
    cloudStart();
    return;
  }

  unsigned long now = millis();

  // Sampling runs whether or not the link is up: the aggregate ring is the station's own
  // record of the last three hours, not a send buffer.
  if (now - cloudSampleAt >= CLOUD_SAMPLE_MS) {
    cloudSampleAt = now;
    cloudAggSample(windSpeed);
    if (cloudLiveCount >= CLOUD_LIVE_SAMPLES) {
      // Buffer full and nothing has published it yet — keep the newest window rather
      // than the oldest. Only reachable at the reduced battery rate, where a packet
      // covers the last 200 ms of a whole second.
      memmove(cloudLiveBuf, cloudLiveBuf + 1, sizeof(float) * (CLOUD_LIVE_SAMPLES - 1));
      cloudLiveCount = CLOUD_LIVE_SAMPLES - 1;
    }
    cloudLiveBuf[cloudLiveCount++] = windSpeed;
  }

  if (!cloudConnected) {
    // The 5 Hz tail is dropped, not queued. Deliberate: a gauge fed a minute of stale
    // samples on reconnect would be showing the viewer something that is not true now,
    // and the minute aggregates already carry what actually happened.
    cloudLiveCount = 0;
    return;
  }

  if (cloudNeedHello) {
    cloudNeedHello = false;
    esp_mqtt_client_subscribe(cloudClient, cloudTopicCmd, 1);
    char hello[96];
    snprintf(hello, sizeof(hello), "{\"online\":true,\"sessionId\":\"%s\"}", cloudSessionId);
    cloudSend(cloudTopicStatus, hello, 1, 1);
    cloudPublishState();
    Serial.printf("Cloud: connected (#%lu), subscribed to %s, free heap %u / min %u\n",
                  (unsigned long)cloudConnects, cloudTopicCmd,
                  (unsigned)ESP.getFreeHeap(), (unsigned)ESP.getMinFreeHeap());
  }

  // Fast half.
  unsigned long liveEvery = (strcmp(powerSource, "battery") == 0)
                              ? CLOUD_LIVE_MS_BATTERY : CLOUD_LIVE_MS;
  if (now - cloudLiveAt >= liveEvery) {
    cloudLiveAt = now;
    cloudPublishLive();
  }

  // Slow half: on the clock, or as soon as something in it actually moves.
  //
  // The flag has to be remembered rather than used on the spot. cloudSlowChanged() re-arms
  // its snapshot on every call, so a given change is reported exactly ONCE — and if that
  // one report lands inside the CLOUD_STATE_MIN_MS floor, the pass that saw it is not
  // allowed to publish and no later pass ever hears about it again. The charger could go
  // from charging to full and the viewer would keep seeing "charging" until the next 5 s
  // tick. Sticky until the frame is actually sent.
  if (cloudSlowChanged()) cloudSlowDirty = true;
  if ((now - cloudStateAt >= CLOUD_STATE_MS) ||
      (cloudSlowDirty && now - cloudStateAt >= CLOUD_STATE_MIN_MS)) {
    cloudSlowDirty = false;
    cloudPublishState();
  }

  // Backlog, one batch a second so it never competes with the live stream for the outbox.
  if (cloudAggSent < cloudAggTotal && now - cloudHistAt >= 1000) {
    cloudHistAt = now;
    cloudPublishHist();
  }

  // Commands, run here and nowhere else.
  if (cloudCmdQueue) {
    char msg[CLOUD_CMD_MAX];
    while (xQueueReceive(cloudCmdQueue, msg, 0) == pdTRUE) cloudHandleCommand(msg);
  }

}

// Once, from setup(), before anything can publish. Nothing here touches the network.
static void cloudInit() {
  const char* sid = SECRET_MQTT_STATION_ID;
  snprintf(cloudTopicLive,   CLOUD_TOPIC_MAX, "wind/%s/live",   sid);
  snprintf(cloudTopicState,  CLOUD_TOPIC_MAX, "wind/%s/state",  sid);
  snprintf(cloudTopicStatus, CLOUD_TOPIC_MAX, "wind/%s/status", sid);
  snprintf(cloudTopicCmd,    CLOUD_TOPIC_MAX, "wind/%s/cmd",    sid);
  snprintf(cloudTopicAck,    CLOUD_TOPIC_MAX, "wind/%s/ack",    sid);
  snprintf(cloudTopicHist,   CLOUD_TOPIC_MAX, "wind/%s/hist",   sid);

  // Eight bytes of hardware randomness, new on every boot. This is the session nonce the
  // command signature is bound to, so it has to be unpredictable, not merely unique —
  // a counter would let tomorrow's signature be computed today.
  uint32_t a = esp_random(), b = esp_random();
  snprintf(cloudSessionId, sizeof(cloudSessionId), "%08lx%08lx",
           (unsigned long)a, (unsigned long)b);
  // Unique client id per boot. Two clients sharing an id take turns kicking each other
  // off the broker forever, and after an unclean disconnect the old session can still be
  // holding the name — a per-boot suffix makes that impossible rather than unlikely.
  snprintf(cloudClientId, sizeof(cloudClientId), "wind-%s-%s", sid, cloudSessionId);

  cloudHmacKeyOk = cloudHexToBytes(SECRET_CMD_HMAC_KEY, cloudHmacKey, sizeof(cloudHmacKey));
  if (!cloudHmacKeyOk) {
    // Loud, and fail closed: with no usable key every command is refused. The alternative
    // — falling back to the literal string as key bytes — would mean two builds could
    // disagree about what was signed while both believing they were right.
    Serial.println("Cloud: SECRET_CMD_HMAC_KEY is not 64 hex chars — commands DISABLED");
  }

  cloudCmdQueue = xQueueCreate(CLOUD_CMD_QUEUE, CLOUD_CMD_MAX);
  if (!cloudCmdQueue) Serial.println("Cloud: command queue alloc failed");

  Serial.printf("Cloud: %s:%d, topics wind/%s/*, session %s\n",
                SECRET_MQTT_HOST, (int)SECRET_MQTT_PORT, sid, cloudSessionId);
}

// Diagnostics, shaped like /api/modem and guarded the same way: crossSiteWrite() because
// ?off=1 drops the channel, and NO CORS header at all because a page in another tab has
// no business reading where this station reports to. Nothing secret is echoed — not the
// password, not the HMAC key, not a byte of either.
void handleCloud() {
  if (crossSiteWrite()) return;

  if (server.hasArg("off")) {
    cloudEnabled = false;
    if (cloudStarted) cloudGoodbye("/api/cloud?off=1");
  } else if (server.hasArg("on")) {
    cloudEnabled = true;
  } else if (server.hasArg("via")) {
    // ?via=ppp pins the socket to the modem, ?via=auto hands it back to the routing
    // table. Either way the client is torn down and rebuilt, because the interface is
    // chosen once, at init. The session nonce is NOT reissued: it belongs to the boot,
    // not to the socket, so commands signed a moment ago stay valid across the swap.
    bool want = server.arg("via").equalsIgnoreCase("ppp");
    if (want != cloudBindPpp) {
      cloudBindPpp = want;
      if (cloudStarted) cloudGoodbye(want ? "rebinding to PPP" : "back to the default route");
    }
  }

  String json = "{";
  json += "\"enabled\":"    + String(cloudEnabled ? "true" : "false") + ",";
  json += "\"started\":"    + String(cloudStarted ? "true" : "false") + ",";
  json += "\"connected\":"  + String(cloudConnected ? "true" : "false") + ",";
  json += "\"host\":\""     + String(SECRET_MQTT_HOST) + "\",";
  json += "\"port\":"       + String((int)SECRET_MQTT_PORT) + ",";
  json += "\"user\":\""     + String(SECRET_MQTT_USER) + "\",";
  json += "\"stationId\":\"" + String(SECRET_MQTT_STATION_ID) + "\",";
  json += "\"sessionId\":\"" + String(cloudSessionId) + "\",";
  json += "\"clockValid\":" + String(clockValid ? "true" : "false") + ",";
  json += "\"hmacKey\":"    + String(cloudHmacKeyOk ? "true" : "false") + ",";
  json += "\"connects\":"   + String((unsigned long)cloudConnects) + ",";
  json += "\"errors\":"     + String((unsigned long)cloudErrors) + ",";
  json += "\"pubLive\":"    + String(cloudPubLive) + ",";
  json += "\"pubDrop\":"    + String(cloudPubDrop) + ",";
  json += "\"cmdOk\":"      + String(cloudCmdOk) + ",";
  json += "\"cmdBad\":"     + String(cloudCmdBad) + ",";
  json += "\"cmdLastId\":"  + String(cloudCmdLastId) + ",";
  json += "\"aggTotal\":"   + String(cloudAggTotal) + ",";
  json += "\"aggPending\":" + String(cloudAggTotal - cloudAggSent) + ",";
  json += "\"heapFree\":"   + String((unsigned long)ESP.getFreeHeap()) + ",";
  json += "\"heapMin\":"    + String((unsigned long)ESP.getMinFreeHeap()) + ",";
  json += "\"via\":\""       + String(cloudBindPpp ? "ppp" : "auto") + "\",";
  json += "\"boundIf\":\""   + String(cloudBoundIf) + "\",";
  json += "\"lastError\":\"" + String(cloudLastError) + "\"}";
  server.send(200, "application/json", json);
}

#endif  // SECRET_HAS_CLOUD

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
#if HAS_MODEM && MODEM_USE_PPP
    // Try to leave the modem in a state the next boot can talk to.
    //
    // This is the expensive half of a lesson learned on the bench: the ESP32 reboots after
    // an OTA, the modem does NOT, and it is still in CMUX — where a plain AT gets no reply
    // at all (measured: total=0 bytes). So the first build came up on 4G perfectly, and
    // the very next OTA left an uplink that could not be rebuilt without walking to the
    // modem and pulling its power. On a mast that is the whole difference between a
    // remote update and a trip.
    //
    // Asking esp-modem for COMMAND mode sends the CMUX close-down frame, which is exactly
    // the operation A7670 firmware is documented to handle badly. Attempting it anyway is
    // not recklessness, it is arithmetic: if it works the uplink survives the update, and
    // if it wedges the module we are in precisely the state we are already in without it
    // — one that only a power cycle clears. The permanent fix is the P-FET on GPIO33,
    // because a brownout or a panic reboots the ESP32 without ever reaching this line.
    if (modemPppOwnsUart()) {
      PPP.mode(ESP_MODEM_MODE_COMMAND);
      PPP.end();
      Serial.println("OTA start: asked the modem to leave CMUX");
    }
#endif
#if SECRET_HAS_CLOUD
    // Say goodbye before the reboot. A clean DISCONNECT suppresses the will, so without
    // this the retained status would keep claiming the station is online for the whole
    // update — and the public dashboard would show a live badge over a frozen gauge.
    cloudGoodbye("OTA start");
#endif
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
// is the meaning it should keep — and it keeps it all the way down, because a
// candidate that fails is struck off for the rest of the pass (staFailedMask) and
// the next scan moves on to the one below it. Preference must not become a dead end:
// without that, a first entry that is on the air but unjoinable would be re-picked
// forever and every network under it would be unreachable.
void serviceUplink() {
  bool now = (WiFi.status() == WL_CONNECTED);

  if (now != staUp) {
    staUp = now;
    if (now) {
      staBackoffMs = STA_RETRY_MIN_MS;   // a good link earns a fast retry next time
      staNoneInRange = false;            // and the surroundings are evidently ours
      staTrying = -1;                    // the attempt this link came from is over
      staFailedMask = 0;                 // whatever refused us before starts forgiven
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
    staMarkFailed(staTrying);   // so the next scan looks past it instead of at it
    staTrying = -1;
    // The driver keeps retrying an association it started unless it is told to stop,
    // and those retries are off-channel time nobody asked for. This is the one
    // WiFi.disconnect() outside setup(); false/false means station interface only
    // and no NVS write, so the AP does not notice it happened.
    WiFi.disconnect(false, false);
    // Straight on to the next candidate, with no wait and no doubling: the backoff is
    // the price of a whole pass that came up empty, not of one name in it. Doubling
    // here would push the second network in the list half an hour out for the sole
    // reason that the first one is broken. The next scan decides whether there is a
    // next candidate at all, and it is the scan — not this branch — that closes a pass.
    staNextAttempt = millis();
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
    // Two answers out of one walk through the results. `seen` is whether any of our
    // names is on the air at all; `best` is the earliest of them in preference order
    // that this pass has not already tried. They part ways in exactly one case — every
    // candidate in range has already refused us — and telling that case apart is the
    // whole point: it has to end the pass, not get reported as somebody else's
    // neighbourhood.
    int best = -1, bestScan = -1;
    bool seen = false;
    for (int i = 0; i < n && best != 0; i++) {
      String found = WiFi.SSID(i);
      for (int k = 0; k < homeNetworkCount; k++) {
        if (!found.equals(homeNetworks[k].ssid)) continue;
        seen = true;
        if (!staHasFailed(k) && (best < 0 || k < best)) { best = k; bestScan = i; }
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
      if (seen) {
        // Everything of ours that is on the air has now had its turn and refused.
        // That is a completed pass, so the failures are forgiven and the next pass
        // starts again from the top of the list. This is the one place the backoff
        // is actually earned — the wait belongs to an empty pass, not to one name.
        Serial.println("Uplink: every known network in range refused — pass over, backing off");
        staFailedMask = 0;
        staNoneInRange = false;   // they ARE here; we just cannot get in
      } else {
        // Nothing of ours on the air. This is the field, and there is nothing here to
        // associate to — so do not spend a single WiFi.begin() proving it.
        if (!staNoneInRange) Serial.printf("Uplink: none of the %d known networks on the air\n",
                                           homeNetworkCount);
        staNoneInRange = true;
        staFailedMask = 0;        // nothing pending — wherever we are next, start clean
      }
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

// ===== WALL CLOCK SERVICE =====
// Called every pass, like serviceUplink(): an ordinary pass is one comparison, and it
// never blocks. configTime() does not wait for an answer — it hands the server names to
// the SNTP task and returns — and the poll below reads the RTC, not the network.
static void serviceClock() {
  bool haveUplink = (WiFi.status() == WL_CONNECTED);
#if HAS_MODEM && MODEM_USE_PPP
  haveUplink = haveUplink || (modemPppState == MODEM_PPP_ONLINE);
#endif
  // Starting SNTP with no route at all just burns retries in a background task, and in
  // the field (AP only, no uplink of any kind) there is nothing to sync against ever.
  if (!haveUplink) return;

  if (!clockStarted) {
    // UTC with no DST rule, on purpose: the station reports absolute time and leaves the
    // naming of it to whoever reads it. A local offset here is one more thing that would
    // be quietly wrong twice a year on a mast nobody visits.
    configTime(0, 0, NTP_SERVER_PRIMARY, NTP_SERVER_SECONDARY);
    clockStarted = true;
    Serial.println("Clock: SNTP started (UTC)");
    return;
  }
  if (clockValid) return;              // latched: a clock that became real stays real

  unsigned long now = millis();
  if (now - clockPoll < CLOCK_POLL_MS) return;
  clockPoll = now;
  time_t t = time(nullptr);
  if (t < CLOCK_VALID_EPOCH) return;

  clockValid     = true;
  clockValidAtMs = now;
  struct tm g;
  gmtime_r(&t, &g);
  Serial.printf("Clock: synced %04d-%02d-%02d %02d:%02d:%02d UTC, %lu s after boot\n",
                g.tm_year + 1900, g.tm_mon + 1, g.tm_mday,
                g.tm_hour, g.tm_min, g.tm_sec, now / 1000);
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

#if HAS_MODEM
  // Below setCpuFrequencyMhz() for exactly the reason Serial is: the UART divisor comes
  // from the CPU clock.
  modemUartStart();
  Serial.println("Modem: AT console on /api/at");
#if MODEM_USE_PPP
  // Nothing is dialled here on purpose. The first attempt happens on the first pass
  // through loop(), by which point the AP, the web server and OTA are all already up —
  // so a modem that is missing, wedged or out of coverage cannot delay any of them.
  Serial.println("Modem: 4G uplink enabled, status on /api/modem");
#endif
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
  //
  // The auth mode is spelled out, and that is not decoration. This call used to end
  // at apMaxClients and take whatever WIFI_AP_DEFAULT_AUTH_MODE happened to be in the
  // core of the day — and the laptop's saved profile for this SSID says WPA3SAE, so
  // at some point it was not WPA2 at all. A WPA3-SAE access point is required by spec
  // to have management frame protection on; this one advertised pmf_cfg all zeros
  // (see below), which makes it a non-compliant SAE AP. Android's supplicant checks
  // and walks away — "Connecting..." and then silence, with the network still in the
  // list — while Windows shrugs and associates. That is the whole "the laptop gets in
  // and the phone never does" story, and it had nothing to do with distance or radio.
  //
  // WPA2-PSK with CCMP is the most widely accepted combination there is, and it is
  // what the documentation always claimed this AP was. Pinned here so it no longer
  // depends on a default, a core version, or whatever the driver kept from an older
  // build.
  apUp = WiFi.softAP(apSsid, apPassword, 1 /*channel*/, 0 /*hidden*/, apMaxClients,
                     false /*ftm_responder*/,
                     WIFI_AUTH_WPA2_PSK, WIFI_CIPHER_TYPE_CCMP);

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

  // Read back and print what the AP actually went on the air as. The mode was never
  // stated in code and never shown anywhere, so the only way to learn it was to open
  // the saved profile on a machine that had already connected — which is a poor way
  // to find out that half the devices in the house cannot join. Now it is one line
  // in the boot log.
  if (esp_wifi_get_config(WIFI_IF_AP, &apConf) == ESP_OK) {
    const char* mode = apConf.ap.authmode == WIFI_AUTH_WPA2_PSK      ? "WPA2-PSK"
                     : apConf.ap.authmode == WIFI_AUTH_WPA_WPA2_PSK  ? "WPA/WPA2-PSK"
                     : apConf.ap.authmode == WIFI_AUTH_WPA2_WPA3_PSK ? "WPA2/WPA3-PSK"
                     : apConf.ap.authmode == WIFI_AUTH_WPA3_PSK      ? "WPA3-SAE"
                     : apConf.ap.authmode == WIFI_AUTH_OPEN          ? "OPEN (!)"
                     : "other";
    Serial.printf("AP security: %s, PMF capable=%d required=%d, dtim=%d\n",
                  mode, apConf.ap.pmf_cfg.capable, apConf.ap.pmf_cfg.required,
                  apConf.ap.dtim_period);
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

#if SECRET_HAS_CLOUD
  // Topics, session nonce and the HMAC key, all of it local — the client itself is not
  // started until serviceCloud() sees both a route and a real date.
  cloudInit();
#endif

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
#if MODEM_USE_PPP
  server.on("/api/modem",  HTTP_GET,  handleModem);
#endif
#endif
#if SECRET_HAS_CLOUD
  // Guarded and CORS-free for the same reason as /api/modem: ?off=1 drops the remote
  // channel, and where this station reports to is nobody else's tab's business.
  server.on("/api/cloud",  HTTP_GET,  handleCloud);
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
// How long the last telemetry line took to reach the UART. Reported on the NEXT line,
// because it can only be measured after the printf returns — at 115200 baud a long line
// is milliseconds of blocking, and this says how many of them.
unsigned long logBusyLast = 0;

void loop() {
  unsigned long loopStart = millis();
  // Time spent inside the Serial telemetry line, charged to its own number and taken back
  // out at the bottom — the same treatment the modem gets, for a sharper reason. The print
  // happens in the very pass that then zeroes loopMaxMs, so its own cost is the first
  // thing written into the fresh counter: without this, loopMax reports the length of the
  // diagnostic string whenever nothing else in the window was slower, and the one number
  // watched for "something is starving readSensors()" answers a question nobody asked.
  unsigned long logBusy = 0;

  ArduinoOTA.handle();
  server.handleClient();

#if HAS_MODEM
  // Every pass, not on a timer: the driver's ring holds well under a second of a running
  // NMEA stream, and what is not drained in time is simply lost. Skipped once PPP owns
  // the pins — Serial2 is closed then, and esp-modem does its own draining.
  if (!modemPppOwnsUart()) modemPump();
#endif

#if HAS_MODEM && MODEM_USE_PPP
  // Unthrottled, like serviceUplink(): an ordinary pass costs one comparison, and every
  // step that is actually expensive sits behind its own timer inside. The cost of the
  // expensive passes is measured here rather than left to loopMaxMs — see modemBusyMaxMs.
  unsigned long modemBusy = millis();
  serviceModem();
  // Inside the same measured window on purpose: the once-a-minute radio refresh is four
  // AT round trips, exactly the kind of stall modemBusyMaxMs exists to account for, and
  // leaving it outside would push it into loopMaxMs where it would read as "something is
  // starving the sensor loop" once every sixty seconds.
  modemRadioRefresh();
  modemBusy = millis() - modemBusy;
  if (modemBusy > modemBusyMaxMs) modemBusyMaxMs = modemBusy;
#endif

  serviceClock();

#if SECRET_HAS_CLOUD
  // Unthrottled like the other service functions: an ordinary pass is a couple of
  // comparisons, every periodic action inside is behind its own timer, and nothing here
  // ever touches the network — publishing is a memcpy into the MQTT task's outbox.
  serviceCloud();
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
    // heap is here because of the cloud channel and it is not decoration: mbedTLS holds
    // two 16 kB record buffers for as long as the MQTT socket lives, so the number to
    // watch is the MINIMUM after the link has been up a while — not the free figure
    // right after boot, which is measured before any of that has been allocated.
    Serial.printf("V=%.1f m/s (%.0f mV ±%.0f, zero %.0f)  D=%.0f°  G=%.1f  "
                  "Bat=%.2fV (%d%%) %s/%s  RSSI=%d  loopMax=%lums (log %lums)  "
                  "sseDrop=%lu  heap=%lu/min %lu\n",
                  windSpeed, speedMvRaw, speedMvSpread, speedZeroMv, windDir, windGust,
                  batteryVoltage, batteryPercent, powerSource, chargeState, wifiRssi,
                  loopMaxMs, logBusyLast, sseDropped,
                  (unsigned long)ESP.getFreeHeap(), (unsigned long)ESP.getMinFreeHeap());
    logBusy     = millis() - lastLog;
    logBusyLast = logBusy;
    loopMaxMs   = 0;
    sseDropped  = 0;
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
#if HAS_MODEM && MODEM_USE_PPP
  // Modem time is charged to modemBusyMaxMs and taken back out here. Not to flatter the
  // number: loopMaxMs is reset on every telemetry line, so one synchronous PPP.begin()
  // would make the line that reports the bring-up — the one someone is reading precisely
  // to see whether the modem hurt anything — say 188 ms and hide the only thing it is
  // actually watched for, the sensor loop or an SSE write going slow.
  elapsed = (elapsed > modemBusy) ? elapsed - modemBusy : 0;
#endif
  elapsed = (elapsed > logBusy) ? elapsed - logBusy : 0;
  if (elapsed > loopMaxMs) loopMaxMs = elapsed;
}
