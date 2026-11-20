// Батарея самого устройства (телефон, ноутбук) — для значка в шапке, когда
// станция не подключена и показывать заряд станции нечем.
//
// Источники по порядку:
//   • приложение Android: WKNative.battery() → "процент,идёт_зарядка" (BatteryManager);
//   • браузер и Electron: navigator.getBattery() (Battery Status API) с событиями.
// Если API недоступен, значок остаётся пустым, как раньше. (Стационарный компьютер
// браузер описывает как «100%, на зарядке» — отличить его от полного ноутбука нельзя.)
import { useState, useEffect } from "react";

// Что за устройство: телефон, планшет или ноутбук (компьютер без батареи тоже
// «ноутбук» — отдельного значка для него нет, а батарею он всё равно не покажет).
export function deviceKind() {
  try {
    const ua = navigator.userAgent || "";
    const small = Math.min(screen.width, screen.height);
    if (/iPad/i.test(ua)) return "tablet";
    if (/Android|iPhone|iPod/i.test(ua)) {
      // У телефонов Android в UA есть «Mobile», у планшетов нет; запасной признак — размер экрана.
      return /Android/i.test(ua) && !/Mobile/i.test(ua) || small >= 600 ? "tablet" : "phone";
    }
    return "laptop";
  } catch { return "laptop"; }
}
export const DEVICE_NAME = { phone: "телефона", tablet: "планшета", laptop: "ноутбука" };

export function useDeviceBattery() {
  const [bat, setBat] = useState(null);       // { pct, charging } | null

  useEffect(() => {
    let alive = true, timer = 0, cleanup = () => {};

    const native = typeof window !== "undefined" && window.WKNative && typeof window.WKNative.battery === "function";
    if (native) {
      const read = () => {
        try {
          const [p, c] = String(window.WKNative.battery()).split(",");
          const pct = parseInt(p, 10);
          if (alive && Number.isFinite(pct) && pct >= 0) setBat({ pct, charging: c === "1" });
        } catch { /* моста нет — останется пусто */ }
      };
      read();
      timer = setInterval(read, 20000);
      cleanup = () => clearInterval(timer);
    } else if (typeof navigator !== "undefined" && navigator.getBattery) {
      navigator.getBattery().then((b) => {
        if (!alive) return;
        const read = () => setBat({ pct: Math.round(b.level * 100), charging: b.charging });
        read();
        const on = () => read();
        b.addEventListener("levelchange", on);
        b.addEventListener("chargingchange", on);
        cleanup = () => { b.removeEventListener("levelchange", on); b.removeEventListener("chargingchange", on); };
      }).catch(() => { /* API закрыт — останется пусто */ });
    }
    return () => { alive = false; cleanup(); };
  }, []);

  return bat;
}
