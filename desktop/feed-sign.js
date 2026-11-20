// Подпись ленты обновлений:  node feed-sign.js <latest.json>
//
// Лента теперь лежит в интернете (Google Диск), а не только в своей сети, и хеш в
// latest.json больше ничего не гарантирует: кто может переписать ленту, перепишет и
// хеш. Поэтому latest.json подписывается ключом Ed25519, который живёт ТОЛЬКО на
// этом компьютере (%USERPROFILE%\.weathered_kiwi\feed-sign.pem, вне репозитория),
// а открытый ключ вшит в updater.js. Программа ставит обновление по сети лишь
// с верной подписью.
//
// ⚠️ Потерять ключ = установленные копии больше не примут ни одного обновления,
// пока их не переустановят из Kiwi_Drop с новым открытым ключом. Держать копию.
//
// Имя начинается с «feed» намеренно: маска упаковщика --ignore=^/feed не пускает
// файл в программу.
const fs = require("fs")
const os = require("os")
const path = require("path")
const crypto = require("crypto")

// Подписей две, над одной и той же строкой:
//   sig      — Ed25519 (feed-sign.pem), её проверяет программа для Windows;
//   sigP256  — ECDSA P-256 + SHA-256, DER (feed-sign-p256.pem), её проверяет
//              приложение Android: Ed25519 там есть только с Android 13.
const file = process.argv[2]
const dir = process.env.WK_FEED_KEYS || path.join(os.homedir(), ".weathered_kiwi")
if (!file) { console.error("usage: node feed-sign.js <latest.json>"); process.exit(2) }
const key = (name) => {
  const p = path.join(dir, name)
  if (!fs.existsSync(p)) { console.error("нет ключа подписи: " + p); process.exit(1) }
  return crypto.createPrivateKey(fs.readFileSync(p))
}

const raw = fs.readFileSync(file, "utf8").replace(/^﻿/, "")
const j = JSON.parse(raw)

// shell.json — сами оболочки (самообновление): { exe: {version, file, sha256, size},
// apk: {...} }. Каждая подписывается своей строкой и тем ключом, который умеет
// проверять её платформа: exe — Ed25519 (updater.js), apk — P-256 (MainActivity.java).
// Строки обязаны совпадать с shellMessage() в обоих местах.
if (process.argv[3] === "--shell") {
  const m = (kind, e) => Buffer.from(["wk-shell-v1", kind, e.version, e.file, String(e.sha256).toLowerCase(), e.size].join("\n"), "utf8")
  if (j.exe) j.exe.sig = crypto.sign(null, m("exe", j.exe), key("feed-sign.pem")).toString("base64")
  if (j.apk) j.apk.sigP256 = crypto.sign("sha256", m("apk", j.apk), key("feed-sign-p256.pem")).toString("base64")
  fs.writeFileSync(file, JSON.stringify(j, null, 2))
  process.exit(0)
}
// Строка обязана совпадать байт в байт с feedMessage() в updater.js и
// feedMessage() в MainActivity.java.
const msg = Buffer.from(["wk-feed-v1", j.version, j.file, String(j.sha256).toLowerCase(), j.size].join("\n"), "utf8")
j.sig = crypto.sign(null, msg, key("feed-sign.pem")).toString("base64")
j.sigP256 = crypto.sign("sha256", msg, key("feed-sign-p256.pem")).toString("base64")
fs.writeFileSync(file, JSON.stringify(j, null, 2))
