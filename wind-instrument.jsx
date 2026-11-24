import { useMemo, useEffect, useRef, useState } from "react";
import { createRenderer, rig, project } from "./wind-tornado-gl.js";
import { LINE, FAINT, NUM, clamp01, INSTR_H } from "./ui-kit.js";

// ============================================================
// СОЛНЦЕ
// ============================================================
// Освещение сцены считается по настоящему положению солнца, а не по «если час
// больше шести». Формула стандартная, с точностью около градуса — для картинки
// более чем достаточно:
//
//   склонение   δ = 23.44° · sin(360°/365 · (N − 81))
//   часовой угол H = 15° · (солнечное время − 12)
//   sin(высоты)   = sin φ · sin δ + cos φ · cos δ · cos H
//
// Солнечное время берётся из UTC и долготы, поэтому часовой пояс знать не надо.
// Координаты приходят от самой станции через /api/site; без них берётся середина
// северных широт — картинка будет правдоподобной, просто не привязанной к месту.
function sunElevation(now, lat, lon) {
  const N = Math.floor((now - new Date(Date.UTC(now.getUTCFullYear(), 0, 0))) / 86400000);
  const decl = 23.44 * Math.sin((2 * Math.PI * (N - 81)) / 365);
  const utcHours = now.getUTCHours() + now.getUTCMinutes() / 60;
  const solar = utcHours + lon / 15;
  const H = 15 * (solar - 12);
  const r = Math.PI / 180;
  const sinEl = Math.sin(lat * r) * Math.sin(decl * r)
              + Math.cos(lat * r) * Math.cos(decl * r) * Math.cos(H * r);
  return Math.asin(Math.max(-1, Math.min(1, sinEl))) / r;
}

// Высота солнца -> сколько света в кадре. Пороги не выдуманы: −6° это конец
// гражданских сумерек (перестаёт хватать света для работы без фонаря), −18° —
// конец астрономических, после которых наступает настоящая ночь.
function daylight(elevDeg) {
  if (elevDeg >= 8) return 1;
  if (elevDeg <= -18) return 0;
  if (elevDeg >= -6) return 0.35 + 0.65 * ((elevDeg + 6) / 14);   // сумерки -> день
  return 0.35 * ((elevDeg + 18) / 12);                             // ночь -> сумерки
}

function lerp(a, b, t) { return a + (b - a) * t; }
// Период штриха полосы воронки — сумма штриха и пробела, ровно как в
// strokeDasharray (те же округления); сдвиг за круг ≈ 40, но кратен периоду.
function bandShift(w) {
  const p = Number((w * 0.5).toFixed(1)) + Number((w * 1.5).toFixed(1));
  return p > 0 ? +(p * Math.max(1, Math.round(40 / p))).toFixed(2) : 40;
}
function mixHex(h1, h2, t) {
  const p = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const [r1, g1, b1] = p(h1), [r2, g2, b2] = p(h2);
  const c = (a, b) => Math.round(lerp(a, b, t)).toString(16).padStart(2, "0");
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

// ============================================================
// ОКНО КАМЕРЫ
// ============================================================
// Если к плате подключена камера — показываем поток. Если нет — рисуем то,
// ради чего камеру и ставят.
//
// Что реально подключается, а что нет:
//   * ESP32-CAM отдаёт MJPEG по HTTP, и <img src> проигрывает его без единой
//     строки кода — рабочий путь;
//   * экшн-камеры поднимают свой WiFi и отдают RTSP или RTMP. Браузер их не
//     проиграет — ни один не умеет RTSP. Нужен промежуточный сервер,
//     перепаковывающий поток в HLS, а ESP32 такой сервер не потянет;
//   * USB-камеру ESP32 не возьмёт: у него нет USB-хоста.
export function CameraWindow({ url, accent, g, motion, speedMs, site, now, day, lite }) {
  if (url) {
    return (
      <div className="ink-dark" style={{ ...INSTR_FRAME, background: "#020407" }}>
        <img src={url} alt="Камера станции"
             style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
      </div>
    );
  }
  const fb = <TornadoScene accent={accent} g={g} motion={motion} speedMs={speedMs} site={site} now={now} day={day} />;
  return <TornadoCam motion={motion} speedMs={speedMs} site={site} now={now} day={day} lite={lite} fallback={fb} />;
}

// Камера — единственный прибор, который не вписывается, а заполняет: у неё
// нет «правильных» пропорций, есть кадр. Поэтому она растягивается на весь
// блок и обрезается по краям, как настоящее видео в окне.
const INSTR_FRAME = {
  position: "relative", flex: "1 1 auto", minHeight: INSTR_H / 2,
  width: "100%", overflow: "hidden",
};

// ============================================================
// СЦЕНА
// ============================================================
// Заглушка, но не серая надпись «нет сигнала»: то, что было бы в кадре, если бы
// камера стояла и в неё попало главное.
//
// Что здесь от настоящего суперячейкового смерча, а не от рисунка вообще:
//
//   * основание облака ниже и темнее фона, из него отдельно спущено стеновое
//     облако — воронка рождается именно из него, а не из ровного слоя;
//   * сама воронка светлее облака: конденсационная воронка состоит из
//     сконденсировавшейся влаги и на просвет действительно светлее тёмного
//     основания, пока не наберёт грунта;
//   * пыльный вихрь у земли шире воронки и светлее её — это поднятый грунт,
//     и по нему судят, что смерч коснулся земли;
//   * завеса осадков смещена вбок: у суперячейки осадки отнесены от восходящего
//     потока, поэтому воронку видно отдельно от стены дождя;
//   * горизонт с деревьями и столбами — без масштаба воронка выглядит дымком.
//
// Ночью сцена ведёт себя как настоящая ночная съёмка смерча: воронки не видно
// вовсе, потому что видеть её нечем — она не светится, а отражать нечего. Её
// выхватывают только вспышки, и именно так снимают ночные смерчи: серией
// кадров, в каждом из которых воронка проступает на долю секунды. Поэтому
// ночью молнии здесь заметно чаще, а подсветка воронки синхронна с ними.
function TornadoScene({ accent, g, motion, speedMs, site, now, day }) {
  const still = motion === "off";
  const bucket = Math.round(clamp01((speedMs || 0) / 30) * 6);

  // Координаты станции, если она их сообщила. 0/0 в secrets.h означает
  // «не настроено» — тогда берём среднюю северную широту.
  const lat = site && (site.lat || site.lon) ? site.lat : 50;
  const lon = site && (site.lat || site.lon) ? site.lon : 30;
  const elev = sunElevation(now || new Date(), lat, lon);
  const lightRaw = day ? 1 : daylight(elev);
  // Ступенями, чтобы сцена не пересобиралась каждую секунду: свет меняется
  // за минуты, а перерисовка сотни узлов стоит куда дороже.
  const lightStep = Math.round(lightRaw * 16);

  return useMemo(() => {
    const light = lightStep / 16;
    const night = light < 0.14;
    const sway = bucket / 6;
    const swayDur = (7.5 - sway * 3.5).toFixed(1);
    const spinDur = (3.4 - sway * 1.9).toFixed(1);
    // Ночью гроза бьёт чаще — иначе смотреть было бы не на что.
    const boltDur = night ? 4.2 : 12;

    // Небо: от почти чёрного до дневного пыльно-голубого. Тёплая полоса
    // у горизонта остаётся и ночью — это городская засветка или зарево.
    const sky = [
      mixHex("#04060a", "#243549", light),
      mixHex("#070a11", "#33485e", light),
      mixHex("#0a0e15", "#4a5c6b", light),
      mixHex("#120f0d", "#6d6553", light),
      mixHex("#0a0b0d", "#3f4046", light),
    ];
    const groundCol = mixHex("#05070a", "#23241f", light);
    const treeCol = mixHex("#04060a", "#151812", light);

    // Воронка шире прежней: верх 26 против 17, низ 9 против 4.6.
    const AX = 120, TOP = 24, GND = 100;
    const axisAt = (t) => AX + 11 * Math.sin(t * 2.2) * t - 6 * t * t;
    const widthAt = (t) => 26 - 17 * Math.pow(t, 0.7);
    const yAt = (t) => TOP + (GND - TOP) * t;

    const steps = 26;
    const left = [], right = [];
    for (let i = 0; i <= steps; i++) {
      const t = i / steps, x = axisAt(t), w = widthAt(t), y = yAt(t);
      left.push([x - w, y]);
      right.push([x + w, y]);
    }
    const funnel = `M ${left.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L ")}
                    L ${right.slice().reverse().map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L ")} Z`;

    const bands = [];
    for (let i = 1; i <= 10; i++) {
      const t = i / 11.5;
      const x = axisAt(t), w = widthAt(t), y = yAt(t);
      bands.push({ i, w, d: `M ${(x - w).toFixed(1)} ${y.toFixed(1)} A ${w.toFixed(1)} ${(w * 0.42).toFixed(1)} 0 0 0 ${(x + w).toFixed(1)} ${y.toFixed(1)}` });
    }

    const debris = Array.from({ length: 20 }).map((_, i) => ({
      i, orbit: 10 + ((i * 31) % 34), y: GND - ((i * 17) % 48),
      s: 0.5 + ((i * 11) % 8) / 9, dur: (1.5 + ((i * 7) % 14) / 5).toFixed(2),
    }));

    const trees = Array.from({ length: 26 }).map((_, i) => ({
      x: 4 + i * 7.6 + ((i * 13) % 4), h: 2.4 + ((i * 19) % 26) / 8, w: 1.6 + ((i * 7) % 12) / 7,
    }));

    // Ночью воронку показываем почти нулевой прозрачностью и подсвечиваем
    // синхронно со вспышкой — тем же классом, что и молния.
    const funnelOpacity = night ? 0.06 : lerp(0.25, 1, light);
    const litClass = night && !still ? "flash-lit" : undefined;

    // ---------- наведение камеры ----------
    // Ошибка прошлой версии: поворот считался вокруг точки на головке штатива,
    // а оптическая ось проходит выше — примерно на половину высоты корпуса.
    // Луч шёл параллельно нужному направлению, но со смещением вверх, и камера
    // снимала над воронкой. Теперь угол считается от самой оптической оси и
    // вокруг неё же выполняется поворот, поэтому линия визирования попадает
    // в цель точно.
    const HEAD = { x: 47, y: 70 };
    const K = 22 / 97;                       // единиц на миллиметр (D5500: 124×97×70)
    const bw = 70 * K, bh = 97 * K;
    const lensR = 32 * K, lensL = 60 * K, hoodL = 34 * K;
    const LA = { x: HEAD.x, y: HEAD.y - 13 };          // оптическая ось над головкой
    const target = { x: axisAt(0.42), y: yAt(0.42) };  // середина воронки
    const aim = (Math.atan2(target.y - LA.y, target.x - LA.x) * 180) / Math.PI;

    return (
      <div className="ink-dark" style={{ ...INSTR_FRAME, background: sky[4], overflow: "hidden" }}>
        <svg viewBox="0 0 200 125" width="100%" height="100%" className="no-glow"
             preserveAspectRatio="xMidYMid slice" style={{ display: "block" }}>
          <defs>
            <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={sky[0]} />
              <stop offset="46%" stopColor={sky[1]} />
              <stop offset="76%" stopColor={sky[2]} />
              <stop offset="94%" stopColor={sky[3]} />
              <stop offset="100%" stopColor={sky[4]} />
            </linearGradient>
            <linearGradient id="funnelFill" x1="0" y1="0" x2="1" y2="0">
              <stop offset="0%" stopColor="rgba(200,214,232,0.10)" />
              <stop offset="34%" stopColor="rgba(214,226,242,0.34)" />
              <stop offset="72%" stopColor="rgba(150,166,188,0.20)" />
              <stop offset="100%" stopColor="rgba(120,134,156,0.08)" />
            </linearGradient>
            <linearGradient id="rain" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={`rgba(150,168,192,${(0.06 + 0.16 * light).toFixed(3)})`} />
              <stop offset="100%" stopColor="rgba(150,168,192,0.01)" />
            </linearGradient>
            <radialGradient id="dust" cx="0.5" cy="0.85">
              <stop offset="0%" stopColor={`rgba(196,178,150,${(0.1 + 0.34 * light).toFixed(3)})`} />
              <stop offset="100%" stopColor="rgba(196,178,150,0)" />
            </radialGradient>
            <radialGradient id="vignette" cx="0.5" cy="0.45">
              <stop offset="55%" stopColor="rgba(0,0,0,0)" />
              <stop offset="100%" stopColor="rgba(0,0,0,0.55)" />
            </radialGradient>
            <clipPath id="funnelClip"><path d={funnel} /></clipPath>
          </defs>

          <rect x="0" y="0" width="200" height="125" fill="url(#sky)" />

          <path d="M 158 20 L 200 20 L 200 101 L 164 101 Z" fill="url(#rain)" />
          {Array.from({ length: 12 }).map((_, i) => (
            <line key={i} x1={160 + i * 3.4} y1="22" x2={154 + i * 3.4} y2="100"
                  stroke={`rgba(170,186,208,${(0.03 + 0.08 * light).toFixed(3)})`} strokeWidth="0.5" />
          ))}

          {/* Основание облака: рваный низ */}
          <path d="M 0 6 L 200 6 L 200 26 C 190 30, 182 24, 172 28 C 162 32, 154 25, 144 29
                   C 134 33, 126 26, 116 30 C 106 34, 98 26, 88 30 C 78 34, 70 25, 60 29
                   C 50 33, 42 26, 32 30 C 22 34, 12 26, 0 29 Z"
                fill={mixHex("#070a10", "#1b2733", light)} />
          <path d="M 0 6 L 200 6 L 200 21 C 176 25, 150 17, 126 22 C 100 27, 74 18, 48 23
                   C 30 26, 14 20, 0 23 Z"
                fill={mixHex("#04070c", "#141d27", light)} opacity="0.92" />
          <path d="M 88 25 C 93 40, 106 45, 122 45 C 140 45, 153 39, 156 25
                   C 148 32, 135 34, 121 34 C 105 34, 94 32, 88 25 Z"
                fill={mixHex("#03050a", "#101821", light)} />

          {/* Молния. Ночью чаще и ярче — она здесь единственный источник света. */}
          {!still && (
            <g className="lightning" style={{ animationDuration: `${boltDur}s` }}>
              <path d="M 58 10 L 66 28 L 60 28 L 72 48 L 54 32 L 61 32 L 51 14 Z"
                    fill="rgba(230,240,255,0.95)" />
              <ellipse cx="61" cy="26" rx={night ? 46 : 28} ry={night ? 22 : 13}
                       fill={`rgba(190,214,255,${night ? 0.24 : 0.14})`} />
              {night && (
                <path d="M 150 12 L 156 26 L 151 26 L 160 42 L 146 29 L 152 29 L 145 15 Z"
                      fill="rgba(226,238,255,0.75)" />
              )}
            </g>
          )}

          {/* Воронка. Ночью почти невидима и проступает только во вспышке. */}
          <g className={still ? undefined : "tornado-sway"}
             style={still ? undefined : { animationDuration: `${swayDur}s`, transformOrigin: `${AX}px ${TOP}px` }}>
            <g className={litClass} style={litClass ? { animationDuration: `${boltDur}s` } : undefined}
               opacity={funnelOpacity}>
              <path d={funnel} fill="url(#funnelFill)" />
              <path d={`M ${left.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L ")}`}
                    fill="none" stroke="rgba(226,236,250,0.30)" strokeWidth="0.7" />
              <path d={`M ${right.map((p) => p.map((n) => n.toFixed(1)).join(" ")).join(" L ")}`}
                    fill="none" stroke="rgba(236,244,255,0.6)" strokeWidth="0.9" />
              <g clipPath="url(#funnelClip)">
                {bands.map((b) => (
                  <path key={b.i} d={b.d} fill="none" stroke="rgba(232,240,252,0.5)"
                        strokeWidth="0.55" strokeDasharray={`${(b.w * 0.5).toFixed(1)} ${(b.w * 1.5).toFixed(1)}`}
                        className={still ? undefined : "funnel-band"}
                        // Сдвиг за круг — целое число периодов штриха: иначе на
                        // каждом повторе полоса перескакивала бы на полшага.
                        style={still ? undefined : { animationDuration: `${spinDur}s`, animationDelay: `${-b.i * 0.16}s`,
                                                     "--fb": `${-bandShift(b.w)}` }} />
                ))}
              </g>
            </g>
          </g>

          {/* Пыльный вихрь — тоже виден только при свете */}
          <g className={litClass} style={litClass ? { animationDuration: `${boltDur}s` } : undefined}
             opacity={night ? 0.08 : lerp(0.3, 1, light)}>
            <ellipse cx={axisAt(1)} cy={GND} rx="32" ry="10" fill="url(#dust)" />
            <path d={`M ${axisAt(1) - 32} ${GND + 2} C ${axisAt(1) - 20} ${GND - 9}, ${axisAt(1) + 20} ${GND - 9}, ${axisAt(1) + 32} ${GND + 2}`}
                  fill="none" stroke="rgba(206,190,164,0.4)" strokeWidth="0.7" />
            {!still && debris.map((d) => (
              <circle key={d.i} className="tornado-debris" r={d.s} cx={axisAt(1)} cy={d.y}
                      fill="rgba(214,200,176,0.72)"
                      style={{ animationDuration: `${d.dur}s`, animationDelay: `${-d.i * 0.17}s`,
                               transformOrigin: `${axisAt(1)}px ${d.y}px`, "--orbit": `${d.orbit}px` }} />
            ))}
          </g>

          {trees.map((t, i) => (
            <path key={i} d={`M ${t.x} 101 L ${t.x - t.w} 101 L ${t.x - t.w * 0.4} ${101 - t.h} L ${t.x + t.w * 0.4} ${101 - t.h} L ${t.x + t.w} 101 Z`}
                  fill={treeCol} />
          ))}
          <line x1="0" y1="101" x2="200" y2="101"
                stroke={`rgba(160,180,200,${(0.12 + 0.22 * light).toFixed(3)})`} strokeWidth="0.7" />
          {[14, 38, 62, 86, 110, 134, 158, 182].map((x) => (
            <g key={x}>
              <line x1={x} y1="101" x2={x} y2="96" stroke={treeCol} strokeWidth="1" />
              <line x1={x} y1="98" x2={x + 24} y2="98.6" stroke={treeCol} strokeWidth="0.4" />
            </g>
          ))}
          <rect x="0" y="101" width="200" height="24" fill={groundCol} />

          {/* Передний план: штатив и камера */}
          <g>
            {[{ foot: 26, w: 3.4, back: false },
              { foot: 49, w: 2.6, back: true },
              { foot: 70, w: 3.4, back: false }].map((leg, i) => {
              const topX = HEAD.x + (i - 1) * 2.2;
              const midX = topX + (leg.foot - topX) * 0.5;
              const midY = HEAD.y + (121 - HEAD.y) * 0.5;
              const rim = `rgba(198,214,238,${(0.12 + 0.24 * light).toFixed(3)})`;
              return (
                <g key={i} opacity={leg.back ? 0.75 : 1}>
                  <line x1={topX} y1={HEAD.y + 4} x2={midX} y2={midY}
                        stroke="#04060a" strokeWidth={leg.w} strokeLinecap="round" />
                  <line x1={midX} y1={midY} x2={leg.foot} y2="121"
                        stroke="#04060a" strokeWidth={leg.w * 0.75} strokeLinecap="round" />
                  <line x1={topX + 1} y1={HEAD.y + 4} x2={midX + 1} y2={midY} stroke={rim} strokeWidth="0.55" />
                  <line x1={midX + 0.8} y1={midY} x2={leg.foot + 0.8} y2="121" stroke={rim} strokeWidth="0.45" />
                  <rect x={midX - 1.6} y={midY - 2.2} width="3.2" height="4.4" rx="0.6"
                        fill="#04060a" stroke={rim} strokeWidth="0.5" />
                  <ellipse cx={leg.foot} cy="121.5" rx="2.4" ry="1.1" fill="#04060a" />
                </g>
              );
            })}
            <path d={`M 30 108 L ${HEAD.x} 104 L 66 109`} fill="none" stroke="#04060a" strokeWidth="1.1" />
            <rect x={HEAD.x - 2.4} y={HEAD.y + 2} width="4.8" height="9" fill="#04060a"
                  stroke={`rgba(198,214,238,${(0.1 + 0.2 * light).toFixed(3)})`} strokeWidth="0.5" />
            <circle cx={HEAD.x} cy={HEAD.y} r="4.2" fill="#04060a"
                    stroke={`rgba(198,214,238,${(0.14 + 0.28 * light).toFixed(3)})`} strokeWidth="0.7" />
            <line x1={HEAD.x - 4} y1={HEAD.y + 1} x2={HEAD.x - 11} y2={HEAD.y + 4}
                  stroke="#04060a" strokeWidth="1.8" strokeLinecap="round" />
            <circle cx={HEAD.x + 4.6} cy={HEAD.y - 4.6} r="1.3" fill="rgba(150,190,170,0.3)"
                    stroke={`rgba(198,214,238,${(0.14 + 0.26 * light).toFixed(3)})`} strokeWidth="0.4" />

            {/* Камера вращается вокруг оптической оси — тогда линия визирования
                попадает в цель, а не проходит параллельно над ней. */}
            <g transform={`rotate(${aim.toFixed(2)} ${LA.x} ${LA.y})`}>
              <g transform={`translate(${LA.x - bw * 0.35} ${LA.y - bh * 0.5})`}>
                {/* Площадка и ножка к головке — наклоняются вместе с камерой */}
                <rect x={bw * 0.22} y={bh} width={bw * 0.34} height="3.4" rx="0.5"
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.14 + 0.28 * light).toFixed(3)})`} strokeWidth="0.6" />
                <path d={`M 0 ${bh * 0.16}
                          C 0 ${bh * 0.05}, ${bw * 0.06} 0, ${bw * 0.18} 0
                          L ${bw * 0.86} 0
                          C ${bw * 0.97} 0, ${bw} ${bh * 0.07}, ${bw} ${bh * 0.2}
                          L ${bw} ${bh * 0.74}
                          C ${bw} ${bh * 0.93}, ${bw * 0.9} ${bh}, ${bw * 0.74} ${bh}
                          L ${bw * 0.2} ${bh}
                          C ${bw * 0.07} ${bh}, 0 ${bh * 0.9}, 0 ${bh * 0.76} Z`}
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.2 + 0.34 * light).toFixed(3)})`} strokeWidth="0.9" />
                <path d={`M ${bw * 0.3} 0 L ${bw * 0.34} ${-bh * 0.17}
                          L ${bw * 0.63} ${-bh * 0.17} L ${bw * 0.67} 0 Z`}
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.2 + 0.32 * light).toFixed(3)})`} strokeWidth="0.8"
                      strokeLinejoin="round" />
                <line x1={bw * 0.4} y1={-bh * 0.19} x2={bw * 0.58} y2={-bh * 0.19}
                      stroke={`rgba(198,214,238,${(0.18 + 0.28 * light).toFixed(3)})`} strokeWidth="1.1" />
                <rect x={-bw * 0.09} y={bh * 0.06} width={bw * 0.11} height={bh * 0.19} rx="0.6"
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.18 + 0.28 * light).toFixed(3)})`} strokeWidth="0.6" />
                <g transform={`translate(${-bw * 0.07} ${bh * 0.34}) rotate(-14)`}>
                  <rect x={-bw * 0.5} y="0" width={bw * 0.5} height={bh * 0.44} rx="0.6"
                        fill="rgba(120,150,185,0.16)"
                        stroke={`rgba(198,214,238,${(0.2 + 0.3 * light).toFixed(3)})`} strokeWidth="0.7" />
                  <rect x={-bw * 0.45} y={bh * 0.05} width={bw * 0.4} height={bh * 0.34}
                        fill="rgba(150,185,225,0.12)" />
                </g>
                <ellipse cx={bw * 0.16} cy={bh * 0.05} rx={bw * 0.09} ry={bh * 0.03}
                         fill="#04060a" stroke={`rgba(198,214,238,${(0.16 + 0.26 * light).toFixed(3)})`} strokeWidth="0.5" />
                <path d={`M ${bw * 0.9} ${bh * 0.2} L ${bw * 0.97} ${bh * 0.34}`}
                      stroke="#c8322d" strokeWidth="1.3" strokeLinecap="round" opacity="0.9" />
                <circle cx={bw * 0.78} cy={bh * 0.16} r="1.5" fill="#ef4444"
                        className={still ? undefined : "rec-blink"}
                        style={{ filter: g === "off" ? undefined : "drop-shadow(0 0 5px #ef4444)" }} />
                <rect x={bw - 1} y={bh * 0.5 - lensR * 1.05} width="2.4" height={lensR * 2.1}
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.2 + 0.28 * light).toFixed(3)})`} strokeWidth="0.6" />
                <rect x={bw + 1} y={bh * 0.5 - lensR} width={lensL} height={lensR * 2} rx="1"
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.22 + 0.32 * light).toFixed(3)})`} strokeWidth="0.9" />
                {[0.3, 0.52, 0.74].map((k) => (
                  <line key={k} x1={bw + 1 + lensL * k} y1={bh * 0.5 - lensR}
                        x2={bw + 1 + lensL * k} y2={bh * 0.5 + lensR}
                        stroke={`rgba(198,214,238,${(0.14 + 0.22 * light).toFixed(3)})`} strokeWidth="0.5" />
                ))}
                <path d={`M ${bw + 1 + lensL} ${bh * 0.5 - lensR}
                          L ${bw + 1 + lensL + hoodL} ${bh * 0.5 - lensR * 1.3}
                          L ${bw + 1 + lensL + hoodL} ${bh * 0.5 + lensR * 1.3}
                          L ${bw + 1 + lensL} ${bh * 0.5 + lensR} Z`}
                      fill="#04060a" stroke={`rgba(198,214,238,${(0.22 + 0.32 * light).toFixed(3)})`} strokeWidth="0.9"
                      strokeLinejoin="round" />
                <ellipse cx={bw + 1 + lensL + hoodL} cy={bh * 0.5} rx="1.2" ry={lensR * 1.3}
                         fill="rgba(150,180,220,0.18)"
                         stroke={`rgba(206,222,244,${(0.24 + 0.34 * light).toFixed(3)})`} strokeWidth="0.6" />
              </g>
            </g>
          </g>

          <rect x="0" y="0" width="200" height="125" fill="url(#vignette)" style={{ pointerEvents: "none" }} />
        </svg>

        <div style={{ position: "absolute", left: 9, top: 8, display: "flex", gap: 6 }}>
          <span style={{
            ...NUM, fontSize: 8.5, letterSpacing: 1.5, color: FAINT,
            border: `1px solid ${LINE}`, padding: "2px 6px", background: "rgba(2,4,7,0.72)",
          }}>
            НЕТ КАМЕРЫ
          </span>
          {/* Почему темно — сказано прямо, иначе ночная сцена читается как поломка */}
          <span style={{
            ...NUM, fontSize: 8.5, letterSpacing: 1.5, color: FAINT,
            border: `1px solid ${LINE}`, padding: "2px 6px", background: "rgba(2,4,7,0.72)",
          }}>
            {night ? "НОЧЬ · СВЕТ ТОЛЬКО ОТ МОЛНИЙ"
              : light < 0.55 ? `СУМЕРКИ · СОЛНЦЕ ${elev.toFixed(0)}°`
              : `ДЕНЬ · СОЛНЦЕ ${elev.toFixed(0)}°`}
          </span>
        </div>
      </div>
    );
  }, [accent, g, still, bucket, lightStep, elev]);
}

// ============================================================
// КАМЕРА НА СМЕРЧЕ (WebGL)
// ============================================================
// Настоящая трёхмерная сцена — см. wind-tornado-gl.js. Здесь: цикл кадров,
// молнии, подстройка разрешения под видеокарту и рамка видоискателя поверх.
// Рамка автофокуса стоит по настоящей проекции смерча на кадр, а не «примерно».
// Без WebGL (или если шейдер не собрался) показывается прежняя рисованная сцена.
const HUD_FONT = { fontFamily: "ui-monospace, 'Cascadia Mono', Consolas, monospace", letterSpacing: 1.2 };
const chip = {
  ...HUD_FONT, fontSize: 8.5, color: "rgba(235,242,250,0.92)", padding: "2px 6px",
  background: "rgba(0,0,0,0.42)", border: "1px solid rgba(255,255,255,0.22)", borderRadius: 3,
  textShadow: "0 1px 2px rgba(0,0,0,0.6)",
};

function TornadoCam({ motion, speedMs, site, now, day, lite, fallback }) {
  const wrap = useRef(null), cv = useRef(null);
  const af = useRef(null), tc = useRef(null), zm = useRef(null);
  const [ok, setOk] = useState(true);
  // Лёгкий режим: шейдер большой, и на слабом устройстве его сборка может подвесить
  // страницу. Сначала — дешёвая рисованная сцена, настоящий кадр — после того,
  // как дашборд отрисовался и затих.
  const [armed, setArmed] = useState(!lite);
  useEffect(() => {
    if (!lite) { setArmed(true); return undefined; }
    const t = setTimeout(() => setArmed(true), 2500);
    return () => clearTimeout(t);
  }, [lite]);
  const lat = site && (site.lat || site.lon) ? site.lat : 50;
  const lon = site && (site.lat || site.lon) ? site.lon : 30;
  const elev = sunElevation(now || new Date(), lat, lon);
  const light = day ? 1 : daylight(elev);
  const live = useRef({ light, wind: 0 });
  live.current.light = light;
  live.current.wind = clamp01((speedMs || 0) / 30);
  const still = motion === "off";
  const calm = motion === "calm";

  useEffect(() => {
    const c = cv.current, box = wrap.current;
    if (!armed || !c || !box) return undefined;
    const r = createRenderer(c);
    if (!r) { setOk(false); return undefined; }
    let raf = 0, dead = false, visible = true, last = 0, k = lite ? 0.5 : 1, slow = 0, frames = 0;
    const T0 = 14 + Math.random() * 400;                 // каждый раз — другой момент съёмки
    const born = performance.now();
    let nextBolt = 5, boltAt = -99, boltX = 0, boltSeed = 1, lastSec = -1;

    const fit = () => {
      const w = box.clientWidth || 640, h = box.clientHeight || 360;
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const px = Math.min(w * h * dpr * dpr * 0.8, 600000) * k * k;
      const sc = Math.sqrt(px / (w * h));
      c.width = Math.max(160, Math.round(w * sc)); c.height = Math.max(90, Math.round(h * sc));
      return { w, h, q: c.width * c.height < 330000 ? 1 : 0 };
    };
    let dim = fit();

    const state = (tt) => {
      const wind = live.current.wind, lt = live.current.light;
      const g = rig(tt, wind);
      // молнии: днём редко и слабо, ночью чаще и ярко
      if (tt > nextBolt) {
        boltAt = tt; boltX = (Math.random() - 0.5) * 0.9; boltSeed = Math.random() * 50 + 1;
        nextBolt = tt + (lt > 0.5 ? 9 + Math.random() * 14 : 3.5 + Math.random() * 6);
      }
      const dt = tt - boltAt;
      const amp = lt > 0.5 ? 0.5 : 1;
      let flash = 0;
      if (dt >= 0 && dt < 1.2) flash = Math.max(Math.exp(-dt * 8), dt > 0.16 ? 0.75 * Math.exp(-(dt - 0.16) * 7) : 0) * amp;
      return {
        t: tt % 5000, cam: g.cam, yaw: g.yaw, pitch: g.pitch, roll: g.roll, tanHalf: g.tanHalf, tx: g.tx,
        light: lt, flash, bolt: [boltX, boltSeed, dt >= 0 && dt < 0.24 ? 1 : 0],
        spin: 0.55 + 0.9 * wind, wind, q: dim.q, g,
      };
    };

    const hud = (tt, s) => {
      const g = s.g;
      const a = dim.w / dim.h;
      const pr = project(g, a, [g.tx + 0.5, 2.0, 16.5]);
      if (af.current && pr) {
        // раз в ~19 секунд автофокус «ищет» и снова ловит цель
        const ph = tt % 19;
        const hunting = ph > 17.2 && ph < 18.4;
        const sz = hunting ? 64 : 46;
        af.current.style.transform = `translate(${(pr.x * dim.w - sz / 2).toFixed(1)}px, ${(pr.y * dim.h - sz / 2).toFixed(1)}px)`;
        af.current.style.width = af.current.style.height = `${sz}px`;
        af.current.style.setProperty("--afc", hunting ? "rgba(255,255,255,.9)" : "rgba(120,255,160,.95)");
        af.current.style.opacity = pr.x > 0.03 && pr.x < 0.97 ? "1" : "0";
      }
      const sec = Math.floor(tt);
      if (tc.current && sec !== lastSec) {
        lastSec = sec;
        const m = Math.floor(sec / 60) % 60, ss = sec % 60;
        tc.current.textContent = `REC ${String(Math.floor(sec / 3600) % 24).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
      }
      if (zm.current) zm.current.textContent = `${(12 / g.tanHalf).toFixed(0)} мм`;
    };

    const frame = (nowMs) => {
      raf = 0;
      if (dead) return;
      raf = requestAnimationFrame(frame);
      if (document.hidden || !visible) return;
      const want = calm ? 22 : 32;
      if (nowMs - last < 1000 / want - 2) return;
      const dtm = nowMs - last; last = nowMs;
      const tt = T0 + (nowMs - born) / 1000;
      const s = state(tt);
      r.draw(s);
      hud(tt, s);
      // видеокарта не тянет — снижаем разрешение, пока кадр не уложится
      frames++;
      if (frames > 12) {
        slow = slow * 0.9 + dtm * 0.1;
        if (slow > 62 && k > 0.4) { k *= 0.85; dim = fit(); slow = 40; }
      }
    };

    const still1 = () => { const tt = T0 + 25; const s = state(tt); r.draw(s); hud(tt, s); };
    const ro = new ResizeObserver(() => { dim = fit(); if (still) still1(); });
    ro.observe(box);
    const io = new IntersectionObserver((es) => { visible = es[0].isIntersecting; });
    io.observe(box);
    if (still) still1();
    else raf = requestAnimationFrame(frame);
    return () => { dead = true; if (raf) cancelAnimationFrame(raf); ro.disconnect(); io.disconnect(); r.dispose(); };
  }, [still, calm, armed, lite]);

  if (!ok || !armed) return fallback;
  const sunTxt = light < 0.14 ? "НОЧЬ · СВЕТ ТОЛЬКО ОТ МОЛНИЙ" : day || light >= 0.55 ? "ДЕНЬ" : `СУМЕРКИ · СОЛНЦЕ ${elev.toFixed(0)}°`;
  const corner = { position: "absolute", width: 10, height: 10, borderColor: "var(--afc, rgba(120,255,160,.95))", borderStyle: "solid", borderWidth: 0 };
  return (
    <div ref={wrap} className="ink-dark no-glow" style={{ ...INSTR_FRAME, background: "#05080c" }}>
      <canvas ref={cv} style={{ width: "100%", height: "100%", display: "block" }} />
      <div ref={af} aria-hidden="true" style={{ position: "absolute", left: 0, top: 0, width: 46, height: 46, pointerEvents: "none", transition: "width .25s ease, height .25s ease, opacity .3s ease", willChange: "transform" }}>
        <i style={{ ...corner, left: 0, top: 0, borderLeftWidth: 1.5, borderTopWidth: 1.5 }} />
        <i style={{ ...corner, right: 0, top: 0, borderRightWidth: 1.5, borderTopWidth: 1.5 }} />
        <i style={{ ...corner, left: 0, bottom: 0, borderLeftWidth: 1.5, borderBottomWidth: 1.5 }} />
        <i style={{ ...corner, right: 0, bottom: 0, borderRightWidth: 1.5, borderBottomWidth: 1.5 }} />
      </div>
      <div style={{ position: "absolute", left: 9, top: 8, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
        <span style={{ ...chip, display: "inline-flex", alignItems: "center", gap: 5 }}>
          <i className={still ? undefined : "rec-blink"} style={{ width: 6, height: 6, borderRadius: 9, background: "#ef4444", display: "inline-block" }} />
          <span ref={tc}>REC 00:00:00</span>
        </span>
        <span style={chip}>НЕТ КАМЕРЫ · ДЕМО-КАДР</span>
        <span style={chip}>{sunTxt}</span>
      </div>
      <div style={{ position: "absolute", left: 9, bottom: 8, display: "flex", gap: 6 }}>
        <span style={chip}>1/1000 · f/5.6 · ISO 400</span>
        <span style={chip}>AF-C</span>
        <span style={chip} ref={zm}>38 мм</span>
      </div>
    </div>
  );
}

