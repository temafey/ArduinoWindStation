// Рисует значки Weathered_Kiwi: долька киви под жидким стеклом (Liquid Glass) —
// тот же материал, что у дашборда: тёмная сцена с живыми пятнами фона (палитра
// mountWall из wind-themes.js), фаска, верхний блик, свечение мякоти.
// Запуск: npx electron make-icon.js
//
// Выход:
//   build/icon.png, build/icon.ico      — Windows (плитка целиком, 16…256)
//   build/android/ic_launcher.png       — Android до 8.0 (плитка, 192)
//   build/android/ic_fg.png, ic_bg.png  — адаптивный значок 8.0+ (слои 432, маску даёт лаунчер)
//   build/android/ic_mono.png           — тематический значок Android 13+ (силуэт)
//   build/android/widget_preview*.png   — картинки виджетов в списке виджетов
//   build/icon-tonal.png, build/android/ic_tonal*.png — тональный значок (с 0.5.0)
const { app, BrowserWindow } = require("electron");
const fs = require("fs");
const path = require("path");

// Без этого capturePage отдаёт пиксели экрана с масштабом 150% — так и получился
// прежний значок 366×366 вместо 256.
app.commandLine.appendSwitch("force-device-scale-factor", "1");
app.disableHardwareAcceleration();

const OUT = path.join(__dirname, "build");
const AND = path.join(OUT, "android");

// ---------- киви ----------
// Центр (cx, cy), радиус r мякоти. Долька чуть наклонена и приплюснута — так она
// читается как срез, а не как мишень, и остаётся узнаваемой на 16 точках.
let uid = 0;
function kiwi(cx, cy, r, { glints = true, detail = true } = {}) {
  const id = "k" + (uid++);
  const RX = r, RY = r * 0.86, T = -18;
  let s = `<defs>
<radialGradient id="${id}f" cx=".46" cy=".42" r=".62"><stop offset="0" stop-color="#f6ffe6"/><stop offset=".22" stop-color="#d4f0a2"/><stop offset=".55" stop-color="#9ed45c"/><stop offset=".86" stop-color="#6fb33a"/><stop offset="1" stop-color="#4f8f2a"/></radialGradient>
<linearGradient id="${id}s" x1=".2" y1="0" x2=".8" y2="1"><stop offset="0" stop-color="#c49a5e"/><stop offset=".5" stop-color="#8a6436"/><stop offset="1" stop-color="#4a3419"/></linearGradient>
<radialGradient id="${id}h" cx=".5" cy=".5" r=".5"><stop offset="0" stop-color="#b8ff6a" stop-opacity=".55"/><stop offset=".55" stop-color="#7cff9a" stop-opacity=".16"/><stop offset="1" stop-color="#7cff9a" stop-opacity="0"/></radialGradient>
<linearGradient id="${id}g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".75"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<filter id="${id}b" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${r * 0.12}"/></filter>
<filter id="${id}d" x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="${r * 0.09}"/></filter>
</defs>`;
  // ореол мякоти — то самое «свечение» дашборда
  s += `<circle cx="${cx}" cy="${cy}" r="${r * 1.55}" fill="url(#${id}h)"/>`;
  s += `<g transform="rotate(${T} ${cx} ${cy})">`;
  // тень под долькой
  s += `<ellipse cx="${cx + r * .06}" cy="${cy + r * .2}" rx="${RX * 1.12}" ry="${RY * 1.12}" fill="#000" opacity=".55" filter="url(#${id}d)"/>`;
  // кожура и мякоть
  s += `<ellipse cx="${cx + r * .05}" cy="${cy + r * .07}" rx="${RX * 1.15}" ry="${RY * 1.17}" fill="url(#${id}s)"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${RX}" ry="${RY}" fill="url(#${id}f)"/>`;
  if (detail) {
    s += `<ellipse cx="${cx}" cy="${cy}" rx="${RX * .92}" ry="${RY * .92}" fill="none" stroke="#e9f8cf" stroke-width="${r * .035}" opacity=".45"/>`;
    for (let i = 0; i < 24; i++) { const a = i * 15 * Math.PI / 180;
      s += `<line x1="${cx + RX * .3 * Math.cos(a)}" y1="${cy + RY * .3 * Math.sin(a)}" x2="${cx + RX * .86 * Math.cos(a)}" y2="${cy + RY * .86 * Math.sin(a)}" stroke="#effbd9" stroke-width="${r * .022}" opacity=".38" stroke-linecap="round"/>`; }
  }
  const SEEDS = detail ? 12 : 8;
  for (let i = 0; i < SEEDS; i++) { const d = i * 360 / SEEDS + 8, a = d * Math.PI / 180;
    const x = cx + RX * .54 * Math.cos(a), y = cy + RY * .54 * Math.sin(a);
    s += `<ellipse cx="${x}" cy="${y}" rx="${r * .085}" ry="${r * .045}" fill="#1b160c" transform="rotate(${d} ${x} ${y})"/>`;
    if (detail) s += `<ellipse cx="${x - r * .02}" cy="${y - r * .02}" rx="${r * .03}" ry="${r * .014}" fill="#fff" opacity=".55" transform="rotate(${d} ${x} ${y})"/>`;
  }
  // сердцевина светится
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${RX * .3}" ry="${RY * .3}" fill="#fbfff2" filter="url(#${id}b)" opacity=".9"/>`;
  s += `<ellipse cx="${cx}" cy="${cy}" rx="${RX * .24}" ry="${RY * .24}" fill="#fdfff7"/>`;
  s += `</g>`;
  if (glints) {
    // стеклянная линза поверх дольки: дуга-блик сверху слева и точечный отблеск
    s += `<path d="M ${cx - r * .95} ${cy - r * .05} A ${r} ${r * .9} 0 0 1 ${cx + r * .15} ${cy - r * .9}" fill="none" stroke="url(#${id}g)" stroke-width="${r * .12}" stroke-linecap="round" opacity=".8"/>`;
    s += `<ellipse cx="${cx - r * .42}" cy="${cy - r * .5}" rx="${r * .16}" ry="${r * .08}" fill="#fff" opacity=".85" transform="rotate(-38 ${cx - r * .42} ${cy - r * .5})"/>`;
    s += `<circle cx="${cx + r * .58}" cy="${cy + r * .42}" r="${r * .045}" fill="#fff" opacity=".7"/>`;
  }
  return s;
}

// ---------- стеклянная сцена ----------
// Пятна — те же цвета, что у живого фона дашборда; над ними иней и верхний блик.
function scene(W, H, { rim = true, rx = 0 } = {}) {
  const id = "s" + (uid++);
  const blob = (x, y, r, c, o) => `<circle cx="${x * W}" cy="${y * H}" r="${r * Math.max(W, H)}" fill="url(#${id}${c})" opacity="${o}"/>`;
  const rg = (n, rgb) => `<radialGradient id="${id}${n}"><stop offset="0" stop-color="rgb(${rgb})"/><stop offset=".55" stop-color="rgb(${rgb})" stop-opacity=".42"/><stop offset="1" stop-color="rgb(${rgb})" stop-opacity="0"/></radialGradient>`;
  let s = `<defs>
<linearGradient id="${id}base" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#0d1430"/><stop offset=".55" stop-color="#070a1c"/><stop offset="1" stop-color="#04060f"/></linearGradient>
${rg("b", "48,104,255")}${rg("v", "150,70,235")}${rg("t", "20,190,180")}${rg("c", "235,120,90")}
<linearGradient id="${id}frost" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".08"/><stop offset=".5" stop-color="#fff" stop-opacity=".01"/><stop offset="1" stop-color="#fff" stop-opacity=".04"/></linearGradient>
<linearGradient id="${id}gloss" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".26"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>
<linearGradient id="${id}rim" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".7"/><stop offset=".35" stop-color="#fff" stop-opacity=".1"/><stop offset=".7" stop-color="#fff" stop-opacity=".05"/><stop offset="1" stop-color="#fff" stop-opacity=".35"/></linearGradient>
<clipPath id="${id}clip"><rect width="${W}" height="${H}" rx="${rx}"/></clipPath>
</defs><g clip-path="url(#${id}clip)">
<rect width="${W}" height="${H}" fill="url(#${id}base)"/>
${blob(.06, .02, .6, "b", .62)}${blob(1, .14, .5, "v", .55)}${blob(.14, 1.04, .5, "t", .42)}${blob(1, 1.06, .4, "c", .3)}
<rect width="${W}" height="${H}" fill="url(#${id}frost)"/>
<path d="M0 0 H${W} V${H * .34} C ${W * .7} ${H * .46}, ${W * .3} ${H * .44}, 0 ${H * .52} Z" fill="url(#${id}gloss)"/>
</g>`;
  if (rim) {
    const k = Math.min(W, H) / 48;
    s += `<rect x="${.45 * k}" y="${.45 * k}" width="${W - .9 * k}" height="${H - .9 * k}" rx="${rx - .45 * k}" fill="none" stroke="url(#${id}rim)" stroke-width="${.9 * k}"/>`;
    s += `<rect x="${1.3 * k}" y="${1.3 * k}" width="${W - 2.6 * k}" height="${H - 2.6 * k}" rx="${rx - 1.3 * k}" fill="none" stroke="#000" stroke-opacity=".35" stroke-width="${.5 * k}"/>`;
  }
  return s;
}

const svgDoc = (W, H, body, vbW = W, vbH = H) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${vbW} ${vbH}">${body}</svg>`;

// Плитка значка (Windows и старый Android): 48×48, скругление как у дашборда.
const tile = (detail) => scene(48, 48, { rx: 11 }) + kiwi(24, 24.5, 13.2, { detail, glints: detail });
// Мелкие размеры — без лучей и бликов: на 16 точках они превращаются в грязь.
const tileSvg = (n) => svgDoc(n, n, n <= 32 ? tile(false) : tile(true), 48, 48);

// Адаптивный значок: холст 108, лаунчер показывает центральные 72 и режет по своей
// маске, поэтому фаски нет (её срежет), а киви сидит в безопасном круге r=33.
const fgSvg = (n) => svgDoc(n, n, kiwi(54, 55, 25), 108, 108);
const bgSvg = (n) => svgDoc(n, n, scene(108, 108, { rim: false }), 108, 108);
const monoSvg = (n) => svgDoc(n, n, `<g transform="rotate(-18 54 55)"><ellipse cx="54" cy="55" rx="28.5" ry="25" fill="#fff"/>
<ellipse cx="54" cy="55" rx="22" ry="19" fill="none" stroke="#000" stroke-width="2.4"/></g>
<mask id="m"><rect width="108" height="108" fill="#fff"/>${Array.from({ length: 8 }, (_, i) => { const d = i * 45 + 8, a = d * Math.PI / 180;
  const x = 54 + 13.5 * Math.cos(a), y = 55 + 11.6 * Math.sin(a); return `<ellipse cx="${x}" cy="${y}" rx="2.2" ry="1.2" fill="#000" transform="rotate(${d} ${x} ${y})"/>`; }).join("")}</mask>`, 108, 108)
  .replace("<g ", '<g mask="url(#m)" ');

// ---------- тональный значок (с 0.5.0) ----------
// Плоская версия для темы «Тональная» и тумблера «Liquid Glass иконка» в настройках.
// Рисунок повторяет tonalSvg() из wind-kiwi.jsx — менять оба вместе.
// (cx, cy) — центр дольки, k — масштаб относительно плитки 48 (там RX = 12.2).
const T_TILE = "M24 2.5c11.4 0 15.6.4 18.3 3.2 2.8 2.7 3.2 6.9 3.2 18.3s-.4 15.6-3.2 18.3c-2.7 2.8-6.9 3.2-18.3 3.2s-15.6-.4-18.3-3.2C2.9 39.6 2.5 35.4 2.5 24s.4-15.6 3.2-18.3C8.4 2.9 12.6 2.5 24 2.5z";
function tonalKiwi(cx, cy, k) {
  const RX = 12.2 * k, RY = RX * 0.86;
  const seeds = Array.from({ length: 12 }, (_, i) => {
    const d = i * 30 + 8, a = d * Math.PI / 180, x = cx + RX * 0.54 * Math.cos(a), y = cy + RY * 0.54 * Math.sin(a);
    return `<ellipse cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" rx="${(1.15 * k).toFixed(2)}" ry="${(0.62 * k).toFixed(2)}" fill="#2a2214" transform="rotate(${d} ${x.toFixed(2)} ${y.toFixed(2)})"/>`;
  }).join("");
  return `<g transform="rotate(-18 ${cx} ${cy})">`
    + `<ellipse cx="${cx}" cy="${cy + 0.6 * k}" rx="${RX * 1.17}" ry="${RY * 1.19}" fill="#7d5c35"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${RX}" ry="${RY}" fill="#86c34f"/>`
    + `<ellipse cx="${cx}" cy="${cy}" rx="${RX * 0.8}" ry="${RY * 0.8}" fill="#a7d872"/>`
    + seeds
    + `<ellipse cx="${cx}" cy="${cy}" rx="${RX * 0.27}" ry="${RY * 0.27}" fill="#f3fbe6"/></g>`;
}
const tonalTileSvg = (n) => svgDoc(n, n, `<path d="${T_TILE}" fill="#d6ecc2"/>` + tonalKiwi(24, 24, 1), 48, 48);
// Адаптивный слой: долька в безопасном круге (как у стеклянного fgSvg), фон — плоский тон.
const tonalFgSvg = (n) => svgDoc(n, n, tonalKiwi(54, 54, 25 / 12.2 / 1.19), 108, 108);
const tonalBgSvg = (n) => svgDoc(n, n, `<rect width="108" height="108" fill="#d6ecc2"/>`, 108, 108);

// Картинки виджетов для списка виджетов — в том же материале, что рисует WindWidget.java.
function widgetPreview(W, H, wide) {
  let s = `<defs><filter id="sh" x="-20%" y="-20%" width="140%" height="140%"><feGaussianBlur stdDeviation="10"/></filter>
<linearGradient id="arc" x1="0" y1="1" x2="1" y2="0"><stop offset="0" stop-color="#5ee0ff"/><stop offset=".6" stop-color="#7cf0b4"/><stop offset="1" stop-color="#ffd166"/></linearGradient>
<filter id="gl" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="5"/></filter></defs>`;
  const m = 14;
  s += `<rect x="${m + 4}" y="${m + 10}" width="${W - 2 * m - 8}" height="${H - 2 * m - 6}" rx="30" fill="#000" opacity=".5" filter="url(#sh)"/>`;
  s += `<g transform="translate(${m} ${m})">${scene(W - 2 * m, H - 2 * m, { rx: 30 })}</g>`;
  const R = wide ? (H - 2 * m) * 0.33 : (W - 2 * m) * 0.31;
  const cx = wide ? m + 26 + R + 8 : W / 2, cy = wide ? H / 2 + 6 : H / 2 + 8;
  const arc = (r, a0, a1) => { const p = (a) => [cx + r * Math.cos(a * Math.PI / 180), cy + r * Math.sin(a * Math.PI / 180)];
    const [x0, y0] = p(a0), [x1, y1] = p(a1); return `M${x0} ${y0} A${r} ${r} 0 ${a1 - a0 > 180 ? 1 : 0} 1 ${x1} ${y1}`; };
  s += `<path d="${arc(R, 135, 405)}" fill="none" stroke="#fff" stroke-opacity=".1" stroke-width="${R * .16}" stroke-linecap="round"/>`;
  s += `<path d="${arc(R, 135, 280)}" fill="none" stroke="url(#arc)" stroke-width="${R * .16}" stroke-linecap="round" filter="url(#gl)" opacity=".8"/>`;
  s += `<path d="${arc(R, 135, 280)}" fill="none" stroke="url(#arc)" stroke-width="${R * .16}" stroke-linecap="round"/>`;
  s += `<text x="${cx}" y="${cy + R * .14}" text-anchor="middle" font-family="Segoe UI Light, sans-serif" font-size="${R * .62}" fill="#f4f8ff">6.4</text>`;
  s += `<text x="${cx}" y="${cy + R * .48}" text-anchor="middle" font-family="Segoe UI, sans-serif" font-size="${R * .2}" fill="#fff" fill-opacity=".55">м/с</text>`;
  s += `<text x="${m + 22}" y="${m + 34}" font-family="Segoe UI Semibold, sans-serif" font-size="15" letter-spacing="1.5" fill="#fff" fill-opacity=".6">ВЕТЕР</text>`;
  if (wide) {
    const x = cx + R + 40;
    const row = (y, k, v) => `<text x="${x}" y="${y}" font-family="Segoe UI, sans-serif" font-size="15" fill="#fff" fill-opacity=".5">${k}</text><text x="${W - m - 24}" y="${y}" text-anchor="end" font-family="Consolas, monospace" font-size="17" fill="#f4f8ff">${v}</text>`;
    s += `<text x="${x}" y="${cy - R * .55}" font-family="Segoe UI Semibold, sans-serif" font-size="21" fill="#f4f8ff">Умеренный</text>`;
    s += row(cy - R * .05, "Порыв", "9.1 м/с") + row(cy + R * .32, "Батарея", "86 %");
    let p = ""; for (let i = 0; i <= 24; i++) { const xx = x + (W - m - 24 - x) * i / 24, yy = cy + R * .82 - 18 * (0.5 + 0.5 * Math.sin(i * .7) * Math.cos(i * .23)); p += (i ? "L" : "M") + xx + " " + yy; }
    s += `<path d="${p}" fill="none" stroke="#7cf0b4" stroke-width="2.4" stroke-linejoin="round" opacity=".9"/>`;
  }
  return svgDoc(W, H, s);
}

async function render(win, svg, n) {
  await win.setContentSize(n, n);
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    `<body style="margin:0;background:transparent;overflow:hidden">${svg}</body>`));
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage();
  const sz = img.getSize();
  return (sz.width === n ? img : img.resize({ width: n, height: n, quality: "best" })).toPNG();
}

async function renderWH(win, svg, W, H) {
  win.setContentSize(W, H);
  await win.loadURL("data:text/html;charset=utf-8," + encodeURIComponent(
    `<body style="margin:0;background:transparent;overflow:hidden">${svg}</body>`));
  await new Promise((r) => setTimeout(r, 250));
  const img = await win.webContents.capturePage();
  return (img.getSize().width === W ? img : img.resize({ width: W, height: H, quality: "best" })).toPNG();
}

app.whenReady().then(async () => {
  fs.mkdirSync(AND, { recursive: true });
  const win = new BrowserWindow({ width: 256, height: 256, show: false, transparent: true, frame: false, useContentSize: true });

  // Windows: каждый размер рисуется сам, а не ужимается из 256 — так мелкие остаются резкими.
  const sizes = [16, 24, 32, 48, 64, 128, 256];
  const pngs = [];
  for (const n of sizes) pngs.push(await render(win, tileSvg(n), n));
  fs.writeFileSync(path.join(OUT, "icon.png"), pngs[pngs.length - 1]);
  const head = Buffer.alloc(6); head.writeUInt16LE(1, 2); head.writeUInt16LE(sizes.length, 4);
  let off = 6 + 16 * sizes.length; const dirs = [];
  sizes.forEach((n, i) => { const d = Buffer.alloc(16);
    d[0] = n >= 256 ? 0 : n; d[1] = n >= 256 ? 0 : n; d.writeUInt16LE(1, 4); d.writeUInt16LE(32, 6);
    d.writeUInt32LE(pngs[i].length, 8); d.writeUInt32LE(off, 12); off += pngs[i].length; dirs.push(d); });
  fs.writeFileSync(path.join(OUT, "icon.ico"), Buffer.concat([head, ...dirs, ...pngs]));

  // Android
  fs.writeFileSync(path.join(AND, "ic_launcher.png"), await render(win, tileSvg(192), 192));
  fs.writeFileSync(path.join(AND, "ic_fg.png"), await render(win, fgSvg(432), 432));
  fs.writeFileSync(path.join(AND, "ic_bg.png"), await render(win, bgSvg(432), 432));
  fs.writeFileSync(path.join(AND, "ic_mono.png"), await render(win, monoSvg(432), 432));
  // Тональный значок: окно Windows (main.js, wk:set-icon) и второй ярлык Android
  // (activity-alias .TonalLauncher в манифесте).
  fs.writeFileSync(path.join(OUT, "icon-tonal.png"), await render(win, tonalTileSvg(256), 256));
  fs.writeFileSync(path.join(AND, "ic_tonal.png"), await render(win, tonalTileSvg(192), 192));
  fs.writeFileSync(path.join(AND, "ic_tonal_fg.png"), await render(win, tonalFgSvg(432), 432));
  fs.writeFileSync(path.join(AND, "ic_tonal_bg.png"), await render(win, tonalBgSvg(432), 432));
  fs.writeFileSync(path.join(AND, "widget_preview.png"), await renderWH(win, widgetPreview(360, 360, false), 360, 360));
  fs.writeFileSync(path.join(AND, "widget_preview_wide.png"), await renderWH(win, widgetPreview(720, 340, true), 720, 340));
  win.destroy();
  app.quit();
});
