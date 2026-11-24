// Поиск СВОЕЙ станции без настройки — для установленных приложений (Windows, Android).
//
// Страница, отданная самой платой, адрес знает. А программа и приложение живут
// отдельно от платы, и «MyWindProbeBETA.org» им известно только внутри точки
// доступа WindStation: дома это имя не резолвится, а `.local` у Android-WebView
// ненадёжен. Поэтому порядок такой: известные адреса → обычные имена → перебор
// своей подсети /24 (подсети отдаёт оболочка: WKNative.lanPrefixes / wkWindow.lanPrefixes).
// Плата узнаётся по ответу /api/data: `speed` числом и `hostname` — не любой сосед.

export const CANDIDATES = ["MyWindProbeBETA.org", "192.168.4.1", "mywindprobebeta.local"];

export async function probe(host, ms = 3500) {
  const ctl = new AbortController();
  const t = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(`http://${host}/api/data`, { signal: ctl.signal, cache: "no-store" });
    if (!r.ok) return null;
    const j = await r.json();
    return Number.isFinite(j.speed) ? j : null;
  } catch { return null; } finally { clearTimeout(t); }
}

async function prefixes() {
  try {
    if (window.WKNative && typeof window.WKNative.lanPrefixes === "function") {
      return String(window.WKNative.lanPrefixes() || "").split(",").filter(Boolean);
    }
    if (window.wkWindow && typeof window.wkWindow.lanPrefixes === "function") {
      return (await window.wkWindow.lanPrefixes()) || [];
    }
  } catch { /* старая оболочка */ }
  return [];
}

// Возвращает { host, j } или null. `known` — адреса, которые уже встречались
// (последний staIp станции — самый надёжный: он не зависит от mDNS).
export async function discover(known = [], signal) {
  const first = [...new Set([...known.filter(Boolean), ...CANDIDATES])];
  const hit = await Promise.all(first.map(async (host) => ({ host, j: await probe(host, 2500) })));
  const ok = hit.find((r) => r.j);
  if (ok) return ok;

  const pres = (await prefixes()).filter((p) => !p.startsWith("192.168.4.")); // точка станции уже проверена выше
  for (const pre of pres) {
    let found = null;
    const hosts = Array.from({ length: 254 }, (_, i) => pre + (i + 1));
    let next = 0;
    const worker = async () => {
      while (!found && !(signal && signal.aborted)) {
        const i = next++;
        if (i >= hosts.length) return;
        const j = await probe(hosts[i], 900);
        if (j && j.hostname) found = { host: hosts[i], j };
      }
    };
    await Promise.all(Array.from({ length: 40 }, worker));
    if (found) return found;
  }
  return null;
}
