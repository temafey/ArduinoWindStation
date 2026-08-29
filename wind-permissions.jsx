import { useState, useEffect, useCallback } from "react";
import { LINE, LINE_HI, TEXT, DIM, FAINT, MONO, SANS, NUM, glow } from "./ui-kit.js";

// ============================================================
// РАЗРЕШЕНИЯ БРАУЗЕРА
// ============================================================
// Главное, что должна объяснять эта панель: почему на самой станции геолокация
// не работает, и что это не поломка дашборда.
//
// Браузеры выдают «сильные» возможности — координаты, уведомления, датчики,
// сервис-воркеры — только защищённому контексту. Защищённый контекст это HTTPS,
// либо localhost, либо file://. Больше ничего. Приватный IP исключением не
// является: правило про localhost, а не про «локальную сеть».
//
// Почему станция не может отдавать HTTPS. Не из лени:
//   * сертификат от доверенного центра выдаётся на доменное имя, которым владеешь.
//     MyWindProbeBETA.org нам не принадлежит, а на приватный адрес 192.168.4.1
//     сертификат не выдаст никто и никогда — это записано в правилах CA/Browser
//     Forum и не обходится;
//   * самоподписанный сертификат браузер встретит красной страницей, а после
//     нажатия «всё равно перейти» происхождение с ошибкой сертификата в Chrome
//     всё равно не считается полноценно защищённым для части возможностей —
//     то есть цена заплачена, а геолокация так и не появилась;
//   * TLS на ESP32 стоит дорого: рукопожатие RSA-2048 занимает секунды, mbedTLS
//     съедает десятки килобайт флеша, которых осталось около 140, и кучу RAM
//     на каждое соединение. Отдавать 345 КБ ассетов через такой сервер —
//     верный способ уронить плату, которая одновременно опрашивает датчик.
//
// Поэтому здесь честный обход, а не имитация: на HTTP место указывается вручную
// одним касанием карты, а сама станция сообщает свои координаты через /api/site —
// её положение известно точно и без всякой геолокации.

const PERMS = [
  {
    id: "geolocation",
    name: "Своё место",
    what: "Синяя точка на карте мира. Нужна, только чтобы показать, где вы относительно станции.",
    api: "geolocation",
    needsSecure: true,
    check: () => typeof navigator !== "undefined" && !!navigator.geolocation,
    request: () => new Promise((res, rej) => {
      navigator.geolocation.getCurrentPosition(() => res("granted"), (e) => rej(e), { timeout: 12000 });
    }),
  },
  {
    id: "notifications",
    name: "Оповещения о шквале",
    what: "Уведомление, когда рост скорости отвечает критерию шквала ВМО — 8 м/с за минуту при пике от 11 м/с.",
    api: "notifications",
    needsSecure: true,
    check: () => typeof window !== "undefined" && "Notification" in window,
    request: async () => await Notification.requestPermission(),
  },
  {
    id: "storage",
    name: "Постоянное хранилище",
    what: "Просит браузер не вычищать настройки и список станций, когда на устройстве кончается место.",
    api: null,
    needsSecure: false,
    check: () => typeof navigator !== "undefined" && !!navigator.storage?.persist,
    request: async () => (await navigator.storage.persist()) ? "granted" : "denied",
  },
];

const STATE_VIEW = {
  granted: { label: "разрешено", color: "#34d399" },
  denied:  { label: "запрещено", color: "#f97316" },
  prompt:  { label: "не спрошено", color: null },
  unavailable: { label: "недоступно", color: null },
};

export default function Permissions({ g }) {
  const secure = typeof window !== "undefined" && !!window.isSecureContext;
  const [states, setStates] = useState({});
  const [busy, setBusy] = useState(null);
  const [note, setNote] = useState(null);

  const refresh = useCallback(async () => {
    const next = {};
    for (const p of PERMS) {
      if (!p.check()) { next[p.id] = "unavailable"; continue; }
      if (p.needsSecure && !secure) { next[p.id] = "unavailable"; continue; }
      if (p.id === "notifications") { next[p.id] = Notification.permission; continue; }
      if (p.id === "storage") {
        next[p.id] = navigator.storage.persisted
          ? ((await navigator.storage.persisted()) ? "granted" : "prompt")
          : "prompt";
        continue;
      }
      // permissions.query знает состояние, не открывая диалог. Safari до 16 его
      // для геолокации не умеет — там остаётся «не спрошено», и это правда.
      if (navigator.permissions?.query) {
        try {
          const r = await navigator.permissions.query({ name: p.api });
          next[p.id] = r.state;
          continue;
        } catch { /* имя не поддерживается этим браузером */ }
      }
      next[p.id] = "prompt";
    }
    setStates(next);
  }, [secure]);

  useEffect(() => { refresh(); }, [refresh]);

  const ask = async (p) => {
    setBusy(p.id);
    setNote(null);
    try {
      const r = await p.request();
      setNote({ ok: r === "granted", text: r === "granted" ? `«${p.name}» разрешено.` : `«${p.name}» осталось запрещённым.` });
    } catch (e) {
      setNote({
        ok: false,
        text: e && e.code === 1
          ? `Вы отказали в доступе. Вернуть можно только в настройках сайта в браузере — повторный запрос отсюда браузер больше не покажет.`
          : `Не получилось: ${e?.message || "браузер не ответил"}.`,
      });
    } finally {
      setBusy(null);
      refresh();
    }
  };

  return (
    <div style={{ marginBottom: 22 }}>
      <div style={{
        color: DIM, fontSize: 9, letterSpacing: 2.4, textTransform: "uppercase",
        fontFamily: SANS, fontWeight: 500, textShadow: glow(g, 0.35),
      }}>
        Разрешения браузера
      </div>

      {/* Состояние контекста — первое, что надо знать: от него зависит всё ниже */}
      <div style={{
        border: `1px solid ${LINE}`,
        borderLeft: `2px solid ${secure ? "#34d399" : "#f97316"}`,
        padding: "9px 11px", marginTop: 9,
        fontSize: 10.5, lineHeight: 1.6, color: "rgba(231,238,246,0.82)", fontFamily: SANS,
      }}>
        <b style={{ color: TEXT }}>
          {secure ? "Защищённый контекст" : "Незащищённый контекст"}
        </b>{" — "}
        <span style={{ ...NUM, fontSize: 10 }}>
          {typeof window !== "undefined" ? window.location.origin : ""}
        </span>
        {secure
          ? ". Все возможности ниже доступны."
          : ". Браузер не отдаёт координаты и уведомления страницам по обычному HTTP — это его правило, не ограничение дашборда. Исключение только для localhost."}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 9 }}>
        {PERMS.map((p) => {
          const st = states[p.id] || "prompt";
          const view = STATE_VIEW[st] || STATE_VIEW.prompt;
          const canAsk = st === "prompt" || (st === "denied" && p.id === "storage");
          return (
            <div key={p.id} style={{
              border: `1px solid ${LINE}`, padding: "9px 11px",
              display: "flex", gap: 10, alignItems: "flex-start", flexWrap: "wrap",
            }}>
              <div style={{ flex: "1 1 220px", minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
                  <span style={{ fontFamily: SANS, fontSize: 12, color: TEXT, textShadow: glow(g, 0.4) }}>
                    {p.name}
                  </span>
                  <span style={{
                    ...NUM, fontSize: 9, letterSpacing: 1,
                    color: view.color || FAINT,
                    textShadow: view.color && g !== "off" ? `0 0 6px ${view.color}` : "none",
                  }}>
                    {view.label}
                  </span>
                </div>
                <div style={{ color: DIM, fontSize: 10.5, lineHeight: 1.55, marginTop: 3, fontFamily: SANS }}>
                  {p.what}
                </div>
              </div>
              <button
                onClick={() => ask(p)}
                disabled={!canAsk || busy === p.id}
                style={{
                  background: canAsk ? "rgba(231,238,246,0.08)" : "transparent",
                  border: `1px solid ${canAsk ? LINE_HI : LINE}`,
                  color: canAsk ? TEXT : FAINT,
                  fontFamily: SANS, fontSize: 10, letterSpacing: 1,
                  padding: "5px 11px", cursor: canAsk ? "pointer" : "default",
                  flexShrink: 0, transition: "all .18s ease",
                }}
              >
                {busy === p.id ? "СПРАШИВАЮ…"
                  : st === "granted" ? "УЖЕ ЕСТЬ"
                  : st === "unavailable" ? "НЕДОСТУПНО"
                  : st === "denied" ? "ЗАКРЫТО В БРАУЗЕРЕ"
                  : "РАЗРЕШИТЬ"}
              </button>
            </div>
          );
        })}
      </div>

      {note && (
        <div style={{
          border: `1px solid ${LINE}`, borderLeft: `2px solid ${note.ok ? "#34d399" : "#f97316"}`,
          padding: "9px 11px", marginTop: 8, fontSize: 10.5, lineHeight: 1.6,
          color: "rgba(231,238,246,0.85)", fontFamily: SANS,
        }}>
          {note.text}
        </div>
      )}

      {!secure && (
        <div style={{ color: FAINT, fontSize: 10, lineHeight: 1.65, marginTop: 9, fontFamily: SANS }}>
          Почему станция не отдаёт HTTPS, а не «просто включить его»: сертификат доверенного
          центра выдают на домен, которым владеешь, а на приватный адрес вида 192.168.4.1 его
          не выдаст никто. Самоподписанный даст красную страницу, и часть возможностей всё равно
          останется закрытой. Плюс TLS на ESP32 — это секунды на рукопожатие и десятки килобайт
          флеша из оставшихся ста сорока. Поэтому вместо имитации сделано так: место можно
          указать вручную касанием карты, а свои координаты станция сообщает сама
          через <span style={{ ...NUM, fontSize: 10 }}>/api/site</span>.
        </div>
      )}
    </div>
  );
}
