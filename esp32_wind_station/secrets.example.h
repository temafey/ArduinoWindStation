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
