// Обновление «как на телефоне». Работает только в настольной программе
// Weathered_Kiwi: её оболочка (desktop/preload.js) кладёт в окно мост
// window.wkUpdater. В браузере и на копии с платы моста нет, и хук отдаёт null —
// вкладки «Обновление» там не бывает вовсе, а не бывает «неактивной».
//
// Что считается обновлением — решает оболочка, а не дашборд: она сравнивает
// версию из ленты (desktop/update/latest.json) с той, что загружена сейчас.
// Дашборд только показывает состояние и нажимает «Обновить».
import { useEffect, useState } from "react";

const RECHECK_MS = 10 * 60 * 1000;
export const POST_UPDATE_KEY = "wk_post_update";

export function useAppUpdate() {
  const bridge = typeof window !== "undefined" ? window.wkUpdater : null;
  const [st, setSt] = useState(null);

  useEffect(() => {
    if (!bridge) return undefined;
    const ask = () => { bridge.check().catch(() => {}); };
    const off = bridge.onState(setSt);
    bridge.state().then(setSt).catch(() => {});
    ask();
    // Раз в десять минут и при возвращении в окно: человек, свернувший программу
    // на полдня, должен увидеть вкладку сразу, а не через очередной тик.
    const t = setInterval(ask, RECHECK_MS);
    window.addEventListener("focus", ask);
    return () => { off && off(); clearInterval(t); window.removeEventListener("focus", ask); };
  }, [bridge]);

  // Ошибка установки: метка «только что обновились» (она включает экран запуска
  // с полосой) не должна пережить неудачу, иначе он показался бы при обычном запуске.
  useEffect(() => {
    if (st && st.status === "error") { try { localStorage.removeItem(POST_UPDATE_KEY); } catch { /* приватный режим */ } }
  }, [st]);

  if (!bridge || !st || !st.info) return null;
  return {
    ...st,
    install: () => {
      // Перед установкой запоминаем, что обновляем и насколько оно тяжёлое: после
      // перезагрузки Boot (wind-guard.jsx) покажет полосу, длина которой от этого зависит.
      try {
        localStorage.setItem(POST_UPDATE_KEY, JSON.stringify({
          // Размер — для длины полосы на экране запуска. У программы целиком это
          // ~80 МБ установщика, а грузится после неё всё тот же интерфейс.
          from: st.current, to: st.info.version, size: st.info.kind === "shell" ? 0 : st.info.size || 0,
          notes: (st.info.notes || []).length, t: Date.now(),
        }));
      } catch { /* приватный режим */ }
      return bridge.install();
    },
  };
}

// Ручная проверка из окошка версии: «Найти обновление». Результат (есть оно или
// нет) отдаёт сама оболочка; здесь только занятость и вызов.
export function useUpdateCheck() {
  const bridge = typeof window !== "undefined" ? window.wkUpdater : null;
  const [busy, setBusy] = useState(false);
  const check = async () => {
    if (!bridge) return null;
    setBusy(true);
    try {
      const [s] = await Promise.all([bridge.check(), new Promise((r) => setTimeout(r, 900))]);
      return s;
    } catch { return null; } finally { setBusy(false); }
  };
  return { supported: !!bridge, busy, check };
}

// Что именно узнала проверка: установленная версия, версия в ленте, когда
// и откуда. Пустое не рисуется — старая оболочка этих полей не присылает.
const cmpVer = (a, b) => {
  const pa = String(a).split(".").map((n) => parseInt(n, 10) || 0), pb = String(b).split(".").map((n) => parseInt(n, 10) || 0)
  for (let i = 0; i < 3; i++) if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0)
  return 0
}
const VIA = { internet: "через интернет", lan: "в домашней сети", local: "на этом компьютере" }
export function VerFacts({ r }) {
  if (!r) return null
  const t = r.checkedAt ? new Date(r.checkedAt).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" }) : ""
  return (
    <span className="ver-facts">
      {r.shell && <><span>Программа</span><b>{r.shell}{r.shellLatest && cmpVer(r.shellLatest, r.shell) > 0 ? ` · есть ${r.shellLatest}` : ""}</b></>}
      {r.current && <><span>Интерфейс</span><b>{r.current}</b></>}
      <span>Последняя</span><b>{[r.latest, r.shellLatest].filter(Boolean).sort(cmpVer).pop() || (r.reached === false ? "неизвестно" : "—")}</b>
      {t && <><span>Проверено</span><span>{t}{r.reached && VIA[r.via] ? ` · ${VIA[r.via]}` : ""}</span></>}
    </span>
  )
}
