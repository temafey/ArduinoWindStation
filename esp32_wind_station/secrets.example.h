// ============================================
// WIND STATION — SECRETS TEMPLATE
// ============================================
// Copy this file to secrets.h in the same folder and fill it in. The sketch does
// not compile without secrets.h — that is on purpose: a missing password should
// stop the build loudly, not produce a board that quietly comes up on an open
// network or refuses OTA.
//
//   copy secrets.example.h secrets.h
//
// secrets.h is in .gitignore; this template is the only one of the two in git,
// so nothing here is a real credential. Every value below MUST be replaced —
// they are placeholders, not defaults, and two of them are too short to work.
// ============================================

// WPA2-PSK of the station's own access point. The ESP32 needs 8..63 characters:
// below 8, softAP() silently falls back to an OPEN network with no error at all,
// so pick a real passphrase here before the first flash.
#define SECRET_AP_PASSWORD  "CHANGE_ME_8_to_63_chars"

// ArduinoOTA. Anyone who can reach port 3232 on the board and knows this string
// can replace the firmware, so it deserves a random one rather than a memorable one.
#define SECRET_OTA_PASSWORD "CHANGE_ME_ota_password"

// 1 = also join a home network (AP+STA, additive — the AP is never taken down).
// 0 = pure access point; the whole uplink retry machine is compiled out.
// Left at 0 here so an unedited copy builds and runs without inventing networks.
#define SECRET_HAS_HOME_NETWORK 0

// Uplink candidates, in order of preference. 2.4 GHz ONLY — the ESP32 has no
// 5 GHz radio. Ignored while SECRET_HAS_HOME_NETWORK is 0.
//
// One macro spanning several lines: every line but the last ends in a backslash,
// and only /* */ comments go inside it — a // comment would swallow the rest of
// the spliced line and with it the networks below.
#define SECRET_HOME_NETWORKS               \
  { "YourHomeSSID",   "YourPassword"   },  \
  { "YourPhoneAP",    "YourPassword2"  },

// Where the station stands, for the map on the dashboard. The station is
// stationary, so these are constants rather than something the firmware keeps
// solving for — measure once with the GNSS module (or read them off any map) and
// paste them here. Full precision is a home address, which is why they live in
// the untracked file and not in the sketch.
#define SECRET_STATION_LAT   0.0
#define SECRET_STATION_LON   0.0
#define SECRET_STATION_ALT_M 0.0

// ============================================
// CLOUD UPLINK over 4G — task 10. Leave HAS_CLOUD at 0 until the modem is wired:
// at 0 the whole MQTT client is compiled out and nothing below is read.
//
// The station keeps ONE MQTT/TLS connection open for the whole session and pushes
// five packets per second, so the remote dashboard looks as live as the local one.
// Everything here is a credential or an identifier, which is why it lives in the
// untracked file. The dashboard's viewer account is a different, subscribe-only
// login and lives in wind-ui/.env (VITE_MQTT_VIEWER_*), never here and never in git.
// ============================================
#define SECRET_HAS_CLOUD 0

// Broker. Port 8883 is MQTT over TLS; the host name must match the certificate,
// so it cannot be replaced with an IP address (the network hands out no DNS on
// this SIM — the firmware sets a resolver by hand, see the task file).
#define SECRET_MQTT_HOST     "xxxxxxxx.s1.eu.hivemq.cloud"
#define SECRET_MQTT_PORT     8883

// Station account: may publish wind/<id>/{live,state,status,ack} and subscribe to
// wind/<id>/cmd — nothing else. Set that up as an ACL on the broker, not as a habit.
#define SECRET_MQTT_USER     "CHANGE_ME_station_user"
#define SECRET_MQTT_PASSWORD "CHANGE_ME_station_password"

// Topic prefix. A short nickname on purpose: not the IMEI, not the coordinates —
// this string ends up in a dashboard that anyone can open.
#define SECRET_MQTT_STATION_ID "station1"

// Shared key for the HMAC on incoming commands. The station only VERIFIES with it;
// whoever queues a command signs with the same key from a browser or curl. Random
// hex, not a passphrase — it is never typed by a human.
#define SECRET_CMD_HMAC_KEY  "CHANGE_ME_32_random_bytes_in_hex"
