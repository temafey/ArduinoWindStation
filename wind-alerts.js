// Голос, тренд-тревога, тихие часы и утренняя сводка.
//
// Голос — speechSynthesis: работает без сети и без разрешений, а руки в этот
// момент обычно заняты (стропы, парус, инструмент). Тревога по тренду
// отвечает на вопрос, на который порог не отвечает: «ветер растёт на глазах»
// при 9 м/с важнее, чем ровные 15, к которым все уже готовы.
//
// Тихие часы глушат и голос, и уведомления; что за ночь было — приходит одной
// сводкой утром, а не будильником в три часа.
import { useEffect, useRef } from "react";
import { logEvent } from "./wind-log.js";
import { pushNote } from "./wind-notify.js";
import { ACTIVITIES, verdict, windows } from "./wind-forecast.js";

export const ALERT_DEFAULTS = {
  voiceEvery: 0,        // минут между голосовыми сводками; 0 — только по кнопке
  trendAlarm: true,     // тревога «ветер растёт»
  trendRise: 5,         // м/с за 10 минут
  quiet: false,         // тихие часы
  quietFrom: 23,
  quietTo: 7,
  morning: true,        // утренняя сводка по окончании тихих часов
  winAlert: false,      // сообщать, когда у выбранного занятия открылось «окно»
  winHold: 15,          // минут подряд, сколько ветер должен продержаться в коридоре
};

export function quietNow(s, d = new Date()) {
  if (!s.quiet) return false;
  const h = d.getHours(), a = s.quietFrom ?? 23, b = s.quietTo ?? 7;
  return a > b ? h >= a || h < b : h >= a && h < b;
}

// «семь и три десятых» — чисто, без «м/с» сокращением: синтезатор читает
// «эм слэш эс» буквально.
function say(n) { return Number.isFinite(n) ? n.toFixed(n < 10 ? 1 : 0).replace(".", ",") : "нет данных"; }
export function summaryText(speed, gust, desc) {
  return `Ветер ${say(speed)} метра в секунду, порывы ${say(gust)}${desc ? `. ${desc}` : ""}.`;
}

export function speak(text) {
  try {
    const ss = window.speechSynthesis;
    if (!ss) return false;
    ss.cancel();
    const u = new SpeechSynthesisUtterance(text);
    u.lang = "ru-RU";
    const v = ss.getVoices().find((x) => /^ru/i.test(x.lang));
    if (v) u.voice = v;
    ss.speak(u);
    return true;
  } catch { return false; }
}

// Все уведомления — через ворота wind-notify.js (лимит 33 в сутки).
function notify(title, body, tag, opts) {
  if (live0.notify === false) return;
  pushNote(title, body, tag, opts);
}
let live0 = {};

const hhmm = (ms) => `${String(new Date(ms).getHours()).padStart(2, "0")}:${String(new Date(ms).getMinutes()).padStart(2, "0")}`;
const hhh = (ms) => `${String(new Date(ms).getHours()).padStart(2, "0")}:00`;

// «Окно» занятия: ветер в коридоре профиля (wind-forecast.js ACTIVITIES) держится
// holdMin минут подряд — тогда пора; вышел из него на 5 минут подряд — закрылось.
// Пик берётся по секундной истории за 5 минут, а не по «порыву станции»: тот
// держит максимум с последнего сброса и навсегда закрыл бы окно после одного шквала.
// Заранее: по прогнозу окно начнётся в ближайшие полтора часа (или ветер выйдет
// из коридора в ближайший час) — одно уведомление на каждое такое событие.
export function stepWindow(w, { s, data, history, fc, quiet, logKey }, now) {
  if (!s.winAlert || history.length < 120) { w.okSince = 0; w.badSince = 0; return; }
  const act = ACTIVITIES.find((a) => a.id === s.activity) || ACTIVITIES[0];
  const tail = history.slice(-300);
  const avg = tail.reduce((a, h) => a + (h.s || 0), 0) / tail.length;
  const peak = tail.reduce((a, h) => Math.max(a, h.s || 0), 0);
  const v = verdict(act, avg, peak);
  if (!v) return;
  const hold = (s.winHold || 15) * 60000;
  const say1 = (n) => (Number.isFinite(n) ? n.toFixed(n < 10 ? 1 : 0).replace(".", ",") : "—");
  const send = (title, body, tag, every) => {
    if (quiet) return;
    notify(title, body, tag, { every });
  };
  if (!w.open) {
    if (v.lvl === 0) {
      w.okSince = w.okSince || now;
      if (now - w.okSince >= hold) {
        w.open = true; w.badSince = 0; w.endSent = false; w.soonFor = 0;
        const win = fc ? windows(fc, act, 12).find((x) => x.from <= now && x.to > now) : null;
        send(`${act.label}: окно открыто`,
          `Ветер ${say1(avg)} м/с, пик ${say1(peak)} — держится уже ${Math.round((now - w.okSince) / 60000)} мин.` +
          (win ? ` По прогнозу — до ${hhh(win.to)}.` : ""), "wind-win", 45 * 60000);
        logEvent(logKey, "window", `${act.label}: окно открыто, ветер ${say1(avg)} м/с`);
      }
    } else {
      w.okSince = 0;
      // заранее: ближайшее окно по прогнозу
      const nxt = fc ? windows(fc, act, 3).find((x) => x.from > now && x.from - now <= 90 * 60000) : null;
      if (nxt && w.soonFor !== nxt.from) {
        w.soonFor = nxt.from;
        send(`${act.label}: скоро окно`, `По прогнозу ветер подойдёт около ${hhh(nxt.from)} (до ${say1(nxt.peak)} м/с), сейчас ${say1(avg)} м/с.`, "wind-win-soon", 40 * 60000);
      }
    }
    return;
  }
  // окно открыто
  if (v.lvl !== 0) {
    w.badSince = w.badSince || now;
    if (now - w.badSince >= 5 * 60000) {
      w.open = false; w.okSince = 0; w.badSince = 0;
      send(`${act.label}: окно закрылось`, `Ветер ${say1(avg)} м/с, пик ${say1(peak)} — ${v.why}.`, "wind-win", 45 * 60000);
      logEvent(logKey, "window", `${act.label}: окно закрылось (${v.why})`);
    }
  } else {
    w.badSince = 0;
    if (!w.endSent && fc) {
      const out = fc.find((p) => p.t > now && p.t - now <= 75 * 60000 && (() => { const q = verdict(act, p.s, p.g); return q && q.lvl !== 0; })());
      if (out) { w.endSent = true; send(`${act.label}: ветер скоро уйдёт`, `По прогнозу к ${hhmm(out.t)} ветер выйдет из вашего коридора.`, "wind-win-end", 40 * 60000); }
    }
  }
}

export function useAlerts({ settings, data, history, connected, desc, logKey, fc }) {
  const s = { ...ALERT_DEFAULTS, ...settings };
  const live = useRef({});
  live.current = { s, data, history, connected, desc, logKey, fc };
  const win = useRef({ open: false, okSince: 0, badSince: 0, endSent: false, soonFor: 0 });
  const lastVoice = useRef(0);
  const lastTrend = useRef(0);
  const night = useRef({ gust: 0, max: 0, alarms: 0, on: false });

  useEffect(() => {
    const id = setInterval(() => {
      const { s, data, history, connected, desc, logKey, fc } = live.current;
      live0 = s;
      const now = Date.now();
      const quiet = quietNow(s);
      // утренняя сводка: накопили за тихие часы — отдали один раз, когда кончились
      const n = night.current;
      if (quiet && connected) {
        n.on = true;
        n.gust = Math.max(n.gust, data.gust || 0);
        n.max = Math.max(n.max, data.speed || 0);
      } else if (n.on && !quiet) {
        if (s.morning) {
          notify("Ночь на станции", `Сильнейший порыв ${say(n.gust)} м/с, максимум ветра ${say(n.max)}.` +
            (n.alarms ? ` Тревог было: ${n.alarms}.` : " Тревог не было."), "wind-morning", { every: 12 * 3600000 });
        }
        night.current = { gust: 0, max: 0, alarms: 0, on: false };
      }
      if (!connected) { win.current.okSince = 0; win.current.badSince = 0; return; }
      // окно занятия — только с настоящей станции: у демо ветер выдуманный
      if (logKey) stepWindow(win.current, { s, data, history, fc, quiet, logKey }, now);
      // голосовая сводка по расписанию
      if (s.voiceEvery > 0 && !quiet && now - lastVoice.current >= s.voiceEvery * 60000) {
        lastVoice.current = now;
        speak(summaryText(data.speed, data.gust, desc));
      }
      // тренд: минута сейчас против минуты десятиминутной давности
      if (s.trendAlarm && history.length >= 600 && now - lastTrend.current > 20 * 60000) {
        const mean = (a) => a.reduce((x, h) => x + (h.s || 0), 0) / a.length;
        const rise = mean(history.slice(-60)) - mean(history.slice(-600, -540));
        if (rise >= (s.trendRise || 5)) {
          lastTrend.current = now;
          logEvent(logKey, "alarm", `Ветер растёт: +${rise.toFixed(1)} м/с за 10 минут`);
          if (quiet) n.alarms++;
          else {
            notify("Ветер усиливается", `+${rise.toFixed(1)} м/с за 10 минут, сейчас ${say(data.speed)} м/с.`, "wind-trend", { every: 20 * 60000, urgent: true });
            if (s.voiceEvery > 0) speak(`Внимание. Ветер усиливается: плюс ${say(rise)} за десять минут.`);
          }
        }
      }
    }, 5000);
    return () => clearInterval(id);
  }, []);
}
