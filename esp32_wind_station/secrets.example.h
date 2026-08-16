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
// secrets.h is in .gitignore; this template is the only one of the two in git.
// The two values below are the ones the documentation names, so a checkout with
// no changes at all builds a station that behaves exactly as described in
// wind-station-assembly.md — just without the home uplink.
// ============================================

// WPA2-PSK of the station's own access point. The ESP32 needs 8..63 characters:
// below 8, softAP() silently falls back to an OPEN network.
#define SECRET_AP_PASSWORD  "<AP-пароль>"

// ArduinoOTA. Anyone who can reach port 3232 on the board and knows this string
// can replace the firmware.
#define SECRET_OTA_PASSWORD "<OTA-пароль>"

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
