import { useId } from "react";

// Иллюстрации приборов: объёмные, с металлом, стеклом и бликами — в отличие от
// прежних линейных чертежей, которые читались только на 60 пикселях. Рисуются
// на «сцене» карточки (тёмной в обеих темах: приборы на ней всегда как на витрине),
// поэтому цвета у них свои, а не из темы. От темы зависит только акцент —
// цвет категории: им подсвечены потоки воздуха, лазер, капли, нить и так далее.
//
// Все рисунки — в одном квадрате 160 × 160, с тенью на «полу» в одном месте
// (y ≈ 148), чтобы в сетке карточек они стояли на одной линии. Градиенты
// общие на рисунок: id берётся из useId, иначе два рисунка на странице
// перетирали бы друг другу defs.

// ---------- общие градиенты и фильтры ----------
function Defs({ P, A }) {
  const stop = (o, c, op) => <stop offset={o} stopColor={c} stopOpacity={op} />;
  return (
    <defs>
      {/* металл: цилиндр, освещённый слева-сверху */}
      <linearGradient id={`${P}-mh`} x1="0" y1="0" x2="1" y2="0">
        {stop(0, "#4c5463")}{stop(0.16, "#b9c3d1")}{stop(0.36, "#f6f9fd")}{stop(0.6, "#9ba7b8")}{stop(0.84, "#5d6879")}{stop(1, "#363d4a")}
      </linearGradient>
      <linearGradient id={`${P}-mv`} x1="0" y1="0" x2="0" y2="1">
        {stop(0, "#4c5463")}{stop(0.16, "#b9c3d1")}{stop(0.36, "#f6f9fd")}{stop(0.6, "#9ba7b8")}{stop(0.84, "#5d6879")}{stop(1, "#363d4a")}
      </linearGradient>
      {/* тёмный пластик */}
      <linearGradient id={`${P}-dk`} x1="0" y1="0" x2="0" y2="1">
        {stop(0, "#5a6272")}{stop(0.18, "#363c48")}{stop(0.6, "#1b1f27")}{stop(1, "#0b0d11")}
      </linearGradient>
      <linearGradient id={`${P}-dh`} x1="0" y1="0" x2="1" y2="0">
        {stop(0, "#0d0f14")}{stop(0.3, "#4a5262")}{stop(0.5, "#2a303b")}{stop(1, "#0a0c10")}
      </linearGradient>
      {/* белая эмаль */}
      <linearGradient id={`${P}-wh`} x1="0" y1="0" x2="0" y2="1">
        {stop(0, "#ffffff")}{stop(0.5, "#e1e7ef")}{stop(1, "#9aa5b5")}
      </linearGradient>
      <linearGradient id={`${P}-whh`} x1="0" y1="0" x2="1" y2="0">
        {stop(0, "#aeb8c7")}{stop(0.3, "#ffffff")}{stop(0.7, "#dfe5ee")}{stop(1, "#8793a5")}
      </linearGradient>
      {/* акцент: светлее сверху, глубже снизу */}
      <linearGradient id={`${P}-ac`} x1="0" y1="0" x2="0" y2="1">
        <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${A} 55%, #ffffff)` }} />
        <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${A} 72%, #000000)` }} />
      </linearGradient>
      <linearGradient id={`${P}-ach`} x1="0" y1="0" x2="1" y2="0">
        <stop offset="0" style={{ stopColor: `color-mix(in srgb, ${A} 70%, #000000)` }} />
        <stop offset="0.4" style={{ stopColor: `color-mix(in srgb, ${A} 50%, #ffffff)` }} />
        <stop offset="1" style={{ stopColor: `color-mix(in srgb, ${A} 70%, #000000)` }} />
      </linearGradient>
      {/* стекло: блик в левом верхнем углу */}
      <radialGradient id={`${P}-gl`} cx="0.32" cy="0.26" r="0.8">
        {stop(0, "#ffffff", 0.9)}{stop(0.35, "#cfe6ff", 0.32)}{stop(1, "#8fb6e8", 0.05)}
      </radialGradient>
      <radialGradient id={`${P}-bl`} cx="0.5" cy="0.5" r="0.5">
        <stop offset="0" style={{ stopColor: A, stopOpacity: 0.55 }} />
        <stop offset="1" style={{ stopColor: A, stopOpacity: 0 }} />
      </radialGradient>
      <linearGradient id={`${P}-gold`} x1="0" y1="0" x2="1" y2="0">
        {stop(0, "#8a6a1e")}{stop(0.4, "#f6dc7e")}{stop(1, "#9c7a26")}
      </linearGradient>
      <linearGradient id={`${P}-or`} x1="0" y1="0" x2="0" y2="1">
        {stop(0, "#ffb15a")}{stop(1, "#d9620f")}
      </linearGradient>
      <filter id={`${P}-sh`} x="-30%" y="-80%" width="160%" height="260%"><feGaussianBlur stdDeviation="3.2" /></filter>
      <filter id={`${P}-gw`} x="-50%" y="-50%" width="200%" height="200%"><feGaussianBlur stdDeviation="2.6" /></filter>
    </defs>
  );
}

const u = (P, n) => `url(#${P}-${n})`;

// тень на полу и тонкое отражение — общие для всех приборов
function Floor({ P, rx = 46 }) {
  return (
    <g>
      <ellipse cx="80" cy="148" rx={rx} ry="6.5" fill="rgba(0,0,0,0.55)" filter={u(P, "sh")} />
    </g>
  );
}

// блик «спица» вдоль цилиндра: тонкая светлая линия на излучине
const Spec = ({ x, y, w, h, o = 0.55 }) => (
  <rect x={x} y={y} width={w} height={h} rx={Math.min(w, h) / 2} fill="#fff" opacity={o} />
);

// ---------- приборы ----------
const ART = {
  // Young 05103: винт, корпус, длинный хвост
  propvane: (P, A) => (
    <g>
      <Floor P={P} />
      <ellipse cx="80" cy="146" rx="22" ry="5" fill={u(P, "dk")} />
      <rect x="58" y="140" width="44" height="6" rx="3" fill={u(P, "dh")} />
      <rect x="75" y="94" width="10" height="48" fill={u(P, "mh")} />
      <rect x="69" y="88" width="22" height="12" rx="3" fill={u(P, "mh")} />
      {/* корпус и колпак */}
      <rect x="40" y="68" width="64" height="20" rx="10" fill={u(P, "mv")} />
      <Spec x={46} y={71} w={52} h={2.4} />
      <rect x="62" y="64" width="24" height="6" rx="2" fill={u(P, "dh")} />
      <ellipse cx="38" cy="78" rx="8" ry="9" fill={u(P, "ac")} />
      <ellipse cx="35" cy="75" rx="3" ry="4" fill="#fff" opacity="0.55" />
      {/* диск вращения и лопасти */}
      <ellipse cx="33" cy="78" rx="11" ry="44" fill={u(P, "bl")} opacity="0.35" />
      <ellipse cx="33" cy="78" rx="11" ry="44" fill="none" stroke={A} strokeOpacity="0.45" strokeWidth="1" strokeDasharray="3 4" />
      <path d="M 37 72 C 30 58 24 46 30 30 C 38 40 43 58 41 72 Z" fill={u(P, "mh")} />
      <path d="M 34 62 C 31 52 30 44 31 38" stroke="#fff" strokeOpacity="0.7" strokeWidth="1.2" fill="none" />
      <path d="M 37 84 C 30 98 24 110 30 126 C 38 116 43 98 41 84 Z" fill={u(P, "mh")} />
      <path d="M 34 94 C 31 104 30 112 31 118" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.2" fill="none" />
      <circle cx="38" cy="78" r="3.6" fill={u(P, "dk")} />
      {/* хвост с оперением */}
      <rect x="100" y="76" width="30" height="4" rx="2" fill={u(P, "mv")} />
      <path d="M 104 74 L 150 54 L 150 100 L 104 84 Z" fill={u(P, "wh")} />
      <path d="M 104 74 L 150 54 L 150 62 L 108 78 Z" fill="#fff" opacity="0.55" />
      <path d="M 126 66 L 150 58 L 150 96 L 126 86 Z" fill={u(P, "ac")} opacity="0.85" />
      <path d="M 104 74 L 150 54 L 150 100 L 104 84 Z" fill="none" stroke="#7d8898" strokeWidth="0.8" />
    </g>
  ),

  // три чашки на траверсах
  cups: (P, A) => {
    const cup = (x, y, k) => (
      <g key={k} transform={`rotate(-38 ${x} ${y})`}>
        <path d={`M ${x - 10} ${y - 1} Q ${x - 10} ${y + 12} ${x} ${y + 13} Q ${x + 10} ${y + 12} ${x + 10} ${y - 1} Z`} fill={u(P, "ach")} />
        <ellipse cx={x} cy={y - 1} rx="10" ry="4" fill={u(P, "dk")} />
        <ellipse cx={x} cy={y - 1.6} rx="8.4" ry="2.8" fill="#04060a" />
        <path d={`M ${x - 7} ${y + 3} Q ${x - 7} ${y + 8} ${x - 2} ${y + 10}`} stroke="#fff" strokeOpacity="0.65" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      </g>
    );
    return (
      <g>
        <Floor P={P} />
        <ellipse cx="80" cy="146" rx="24" ry="5.5" fill={u(P, "dk")} />
        <rect x="70" y="84" width="20" height="60" rx="3" fill={u(P, "mh")} />
        <Spec x={73} y={90} w={2.4} h={46} />
        <rect x="68" y="78" width="24" height="10" rx="3" fill={u(P, "dh")} />
        {/* дальние траверсы и чашки */}
        <path d="M 80 60 L 52 54" stroke={u(P, "mv")} strokeWidth="3.6" strokeLinecap="round" />
        <path d="M 80 60 L 108 54" stroke={u(P, "mv")} strokeWidth="3.6" strokeLinecap="round" />
        {cup(50, 54, "l")}
        {cup(110, 54, "r")}
        {/* ось и ступица */}
        <rect x="77" y="48" width="6" height="34" rx="2" fill={u(P, "mh")} />
        <ellipse cx="80" cy="60" rx="11" ry="5.2" fill={u(P, "dk")} />
        <ellipse cx="80" cy="58.6" rx="8" ry="3" fill="#2b323d" />
        {/* ближняя чашка */}
        <path d="M 80 62 L 80 76" stroke={u(P, "mv")} strokeWidth="3.6" strokeLinecap="round" />
        {cup(80, 76, "f")}
      </g>
    );
  },

  // чашки и флюгер на общей траверсе
  cupvane: (P, A) => (
    <g>
      <Floor P={P} />
      <ellipse cx="80" cy="146" rx="22" ry="5" fill={u(P, "dk")} />
      <rect x="75" y="72" width="10" height="72" fill={u(P, "mh")} />
      <rect x="28" y="66" width="104" height="9" rx="4.5" fill={u(P, "mv")} />
      <Spec x={34} y={68} w={92} h={1.8} />
      <rect x="70" y="62" width="20" height="16" rx="4" fill={u(P, "dh")} />
      {/* ротор слева */}
      <rect x="39" y="40" width="5" height="28" rx="2" fill={u(P, "mh")} />
      {[0, 120, 240].map((a, i) => {
        const r = ((a - 70) * Math.PI) / 180;
        const x = 41.5 + 17 * Math.cos(r), y = 38 + 5.5 * Math.sin(r);
        return (
          <g key={i}>
            <line x1="41.5" y1="38" x2={x} y2={y} stroke={u(P, "mv")} strokeWidth="2.6" strokeLinecap="round" />
            <circle cx={x} cy={y} r="6" fill={u(P, "ach")} />
            <ellipse cx={x - 1.4} cy={y - 1.8} rx="2.2" ry="1.4" fill="#fff" opacity="0.7" />
          </g>
        );
      })}
      <circle cx="41.5" cy="38" r="3.6" fill={u(P, "dk")} />
      {/* флюгер справа */}
      <rect x="117" y="46" width="5" height="22" rx="2" fill={u(P, "mh")} />
      <path d="M 98 53 L 122 49 L 122 59 L 98 57 Z" fill={u(P, "wh")} />
      <path d="M 122 46 L 146 42 L 146 64 L 122 60 Z" fill={u(P, "ac")} />
      <path d="M 122 46 L 146 42 L 146 48 L 124 51 Z" fill="#fff" opacity="0.5" />
      <circle cx="120" cy="53" r="3.4" fill={u(P, "dk")} />
    </g>
  ),

  // классический флюгер с розой ветров
  vane: (P, A) => (
    <g>
      <Floor P={P} />
      <ellipse cx="80" cy="146" rx="22" ry="5" fill={u(P, "dk")} />
      <rect x="76" y="82" width="8" height="62" fill={u(P, "mh")} />
      {/* роза: два крестовых прута и буквы */}
      <rect x="40" y="108" width="80" height="4" rx="2" fill={u(P, "mv")} />
      <rect x="78" y="100" width="4" height="20" rx="2" fill={u(P, "mv")} />
      {[["С", 80, 98], ["Ю", 80, 128], ["З", 36, 114], ["В", 124, 114]].map(([t, x, y]) => (
        <g key={t}>
          <circle cx={x} cy={y - 3.6} r="7" fill={u(P, "dk")} stroke={A} strokeOpacity="0.5" strokeWidth="0.8" />
          <text x={x} y={y - 0.6} textAnchor="middle" fontSize="8.6" fontWeight="700" fill="#fff" fontFamily="system-ui, sans-serif">{t}</text>
        </g>
      ))}
      {/* подвижная часть */}
      <rect x="22" y="68" width="116" height="5" rx="2.5" fill={u(P, "mv")} />
      <Spec x={28} y={69.2} w={104} h={1.4} />
      <path d="M 8 70.5 L 34 56 L 34 85 Z" fill={u(P, "ac")} />
      <path d="M 8 70.5 L 34 56 L 34 64 Z" fill="#fff" opacity="0.45" />
      <path d="M 112 70.5 L 150 50 L 144 70.5 L 150 91 Z" fill={u(P, "wh")} />
      <path d="M 112 70.5 L 150 50 L 146 62 Z" fill="#fff" opacity="0.6" />
      <circle cx="80" cy="70.5" r="8" fill={u(P, "dk")} />
      <circle cx="80" cy="70.5" r="4.4" fill={u(P, "mh")} />
      <circle cx="132" cy="70.5" r="3.2" fill={u(P, "dh")} />
    </g>
  ),

  // Gill WindSonic: четыре головки по кольцу
  sonic2d: (P, A) => (
    <g>
      <Floor P={P} />
      <rect x="62" y="106" width="36" height="32" rx="4" fill={u(P, "dh")} />
      <rect x="62" y="106" width="36" height="6" rx="3" fill="#4a5262" opacity="0.7" />
      <rect x="72" y="136" width="16" height="9" rx="2" fill={u(P, "dk")} />
      <rect x="68" y="94" width="24" height="14" rx="3" fill={u(P, "mh")} />
      {/* задние стойки */}
      {[62, 98].map((x) => <rect key={x} x={x - 3.2} y="60" width="6.4" height="48" rx="3" fill={u(P, "mh")} opacity="0.7" />)}
      {/* верхний диск */}
      <ellipse cx="80" cy="56" rx="38" ry="9.5" fill={u(P, "dk")} />
      <path d="M 42 56 Q 42 48 80 46.5 Q 118 48 118 56 Q 80 62 42 56 Z" fill={u(P, "mv")} />
      <ellipse cx="80" cy="53.6" rx="30" ry="5.4" fill="#fff" opacity="0.32" />
      <ellipse cx="80" cy="54" rx="9" ry="3.2" fill={u(P, "dh")} />
      {/* лучи между головками */}
      <path d="M 56 84 L 104 84" stroke={A} strokeWidth="1.4" strokeDasharray="2.4 3" strokeLinecap="round" />
      <path d="M 58 92 L 102 76" stroke={A} strokeWidth="1.1" strokeDasharray="2 3.4" opacity="0.6" />
      <path d="M 58 76 L 102 92" stroke={A} strokeWidth="1.1" strokeDasharray="2 3.4" opacity="0.6" />
      <path d="M 56 84 L 104 84" stroke={A} strokeWidth="5" opacity="0.2" filter={u(P, "gw")} />
      {/* передние стойки с головками */}
      {[48, 112].map((x, i) => (
        <g key={x}>
          <rect x={x - 4} y="58" width="8" height="52" rx="4" fill={u(P, "mh")} />
          <Spec x={x - 2.4} y={64} w={1.8} h={36} />
          <rect x={x + (i ? -11 : 4)} y="79" width="7" height="10" rx="2" fill={u(P, "dk")} />
          <ellipse cx={x + (i ? -11 : 11)} cy="84" rx="1.8" ry="5" fill={A} />
        </g>
      ))}
    </g>
  ),

  // трёхосевой: паук из трёх консолей
  sonic3d: (P, A) => (
    <g>
      <Floor P={P} />
      <rect x="48" y="116" width="64" height="26" rx="5" fill={u(P, "dh")} />
      <rect x="48" y="116" width="64" height="7" rx="3.5" fill="#4a5262" opacity="0.7" />
      <circle cx="58" cy="132" r="2.4" fill={A} />
      <rect x="92" y="128" width="12" height="7" rx="2" fill="#0a0c10" />
      <rect x="75" y="64" width="10" height="54" rx="3" fill={u(P, "mh")} />
      <Spec x={77.4} y={70} w={2} h={40} />
      {/* консоли */}
      {[[80, 22], [38, 36], [122, 36]].map(([x, y], i) => (
        <g key={i}>
          <path d={`M 80 64 L ${x} ${y + 8}`} stroke={u(P, "mv")} strokeWidth="5" strokeLinecap="round" />
          <path d={`M 80 64 L ${x} ${y + 8}`} stroke="#fff" strokeOpacity="0.4" strokeWidth="1.3" strokeLinecap="round" transform="translate(-0.8 -0.8)" />
          <rect x={x - 5} y={y} width="10" height="12" rx="3" fill={u(P, "dk")} />
          <ellipse cx={x} cy={y + 12} rx="5" ry="2.2" fill={A} />
        </g>
      ))}
      {/* нижние головки */}
      {[[80, 78], [56, 86], [104, 86]].map(([x, y], i) => (
        <g key={i}>
          <rect x={x - 4.4} y={y} width="8.8" height="11" rx="3" fill={u(P, "dk")} />
          <ellipse cx={x} cy={y} rx="4.4" ry="1.9" fill={A} />
        </g>
      ))}
      {/* звуковые трассы */}
      {[[80, 34, 80, 78], [38, 48, 56, 86], [122, 48, 104, 86]].map((l, i) => (
        <g key={i}>
          <line x1={l[0]} y1={l[1] + 4} x2={l[2]} y2={l[3]} stroke={A} strokeWidth="1.3" strokeDasharray="2 3" strokeLinecap="round" />
          <line x1={l[0]} y1={l[1] + 4} x2={l[2]} y2={l[3]} stroke={A} strokeWidth="5" opacity="0.16" filter={u(P, "gw")} />
        </g>
      ))}
    </g>
  ),

  // Kestrel: ручной, с крыльчаткой и экраном
  handheld: (P, A) => (
    <g>
      <Floor P={P} rx={36} />
      <rect x="50" y="34" width="60" height="108" rx="16" fill="#e8741a" />
      <rect x="53" y="37" width="54" height="102" rx="13.5" fill={u(P, "dk")} />
      <rect x="53" y="37" width="54" height="26" rx="13" fill="#fff" opacity="0.08" />
      {/* экран */}
      <rect x="60" y="64" width="40" height="38" rx="5" fill="#04100d" />
      <rect x="61.5" y="65.5" width="37" height="35" rx="4" fill="#0f3a2f" />
      <rect x="61.5" y="65.5" width="37" height="14" rx="4" fill="#fff" opacity="0.14" />
      <text x="80" y="90" textAnchor="middle" fontSize="19" fontWeight="700" fill="#b8ffd8" fontFamily="ui-monospace, Consolas, monospace">5.2</text>
      <text x="80" y="98.4" textAnchor="middle" fontSize="6.4" fill="#7fd9b0" fontFamily="system-ui, sans-serif">м/с</text>
      {/* кнопки */}
      {[[66, 114], [94, 114], [66, 126], [94, 126]].map(([x, y], i) => (
        <g key={i}>
          <circle cx={x} cy={y} r="5.6" fill="#0a0c10" />
          <circle cx={x} cy={y - 0.6} r="4.6" fill={i === 1 ? "#e8741a" : "#3b4352"} />
          <ellipse cx={x - 1} cy={y - 2.4} rx="2" ry="1.1" fill="#fff" opacity="0.5" />
        </g>
      ))}
      {/* крыльчатка */}
      <rect x="60" y="20" width="40" height="22" rx="8" fill={u(P, "dk")} />
      <ellipse cx="80" cy="30" rx="15" ry="7.4" fill="#06080b" />
      {[0, 72, 144, 216, 288].map((a) => {
        const r = (a * Math.PI) / 180;
        return <path key={a} d={`M 80 30 L ${80 + 13 * Math.cos(r)} ${30 + 6.2 * Math.sin(r)}`} stroke={A} strokeWidth="2.6" strokeLinecap="round" />;
      })}
      <circle cx="80" cy="30" r="2.6" fill={u(P, "mh")} />
      <ellipse cx="80" cy="30" rx="15" ry="7.4" fill="none" stroke="#fff" strokeOpacity="0.25" />
    </g>
  ),

  // горячая проволока: щуп с нитью
  hotwire: (P, A) => (
    <g>
      <Floor P={P} />
      <g transform="rotate(-18 80 84)">
        <path d="M 128 84 C 150 84 152 108 134 116" stroke="#14171d" strokeWidth="4" fill="none" strokeLinecap="round" />
        <rect x="84" y="73" width="50" height="22" rx="9" fill={u(P, "dk")} />
        <Spec x={92} y={76} w={34} h={2.4} o={0.35} />
        <rect x="96" y="73" width="3" height="22" fill="#e8741a" opacity="0.9" />
        <rect x="40" y="80" width="48" height="8" rx="3" fill={u(P, "mv")} />
        <Spec x={44} y={81.2} w={40} h={1.6} />
        <rect x="76" y="77" width="14" height="14" rx="3" fill={u(P, "mh")} />
        {/* вилки */}
        <path d="M 40 82 L 22 70" stroke={u(P, "mv")} strokeWidth="2.4" strokeLinecap="round" />
        <path d="M 40 86 L 22 98" stroke={u(P, "mv")} strokeWidth="2.4" strokeLinecap="round" />
        <circle cx="21" cy="69" r="2.2" fill={u(P, "mh")} />
        <circle cx="21" cy="99" r="2.2" fill={u(P, "mh")} />
        {/* нить и её свечение */}
        <path d="M 21 69 L 21 99" stroke="#ffb15a" strokeWidth="6" opacity="0.7" filter={u(P, "gw")} />
        <path d="M 21 69 L 21 99" stroke="#fff3d6" strokeWidth="1.4" />
        {[0, 1, 2].map((i) => (
          <path key={i} d={`M ${12 - i * 5} ${74 + i * 1} q -3 10 0 20`} stroke={A} strokeOpacity={0.55 - i * 0.14} strokeWidth="1.2" fill="none" strokeLinecap="round" />
        ))}
      </g>
    </g>
  ),

  // трубка Пито: Г-образная, с поддоном
  pitot: (P, A) => (
    <g>
      <Floor P={P} />
      <rect x="64" y="124" width="56" height="8" rx="3" fill={u(P, "dk")} />
      {[70, 114].map((x) => <circle key={x} cx={x} cy="128" r="1.8" fill={u(P, "mh")} />)}
      <rect x="86" y="68" width="12" height="58" rx="4" fill={u(P, "mh")} />
      <Spec x={88.6} y={72} w={2} h={46} />
      {/* штуцер давления */}
      <rect x="96" y="96" width="22" height="7" rx="3" fill={u(P, "mv")} />
      <rect x="116" y="94" width="5" height="11" rx="2" fill={u(P, "dk")} />
      {/* основная трубка */}
      <rect x="30" y="56" width="68" height="14" rx="6" fill={u(P, "mv")} />
      <Spec x={38} y={59} w={54} h={2.2} />
      <path d="M 30 56 Q 14 56 12 63 Q 14 70 30 70 Z" fill={u(P, "mv")} />
      <ellipse cx="13" cy="63" rx="2.4" ry="3.2" fill="#05070a" />
      {/* статические отверстия */}
      {[52, 60, 68].map((x) => <ellipse key={x} cx={x} cy="63" rx="1.8" ry="2.6" fill="#0b0d11" />)}
      {/* набегающий поток */}
      {[44, 63, 82].map((y, i) => (
        <g key={y}>
          <path d={`M ${2 + i * 3} ${y} L 14 ${y}`} stroke={A} strokeWidth="1.8" strokeLinecap="round" opacity={0.9 - i * 0.12} />
          <path d={`M 11 ${y - 3} L 15 ${y} L 11 ${y + 3}`} stroke={A} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.9 - i * 0.12} />
        </g>
      ))}
    </g>
  ),

  // дождемер-качалка: воронка и срез
  raingauge: (P, A) => {
    const drop = (x, y, s, k) => (
      <path key={k} d={`M ${x} ${y} Q ${x - 4 * s} ${y + 7 * s} ${x} ${y + 9 * s} Q ${x + 4 * s} ${y + 7 * s} ${x} ${y} Z`} fill={u(P, "ac")} opacity="0.95" />
    );
    return (
      <g>
        <Floor P={P} />
        <rect x="42" y="130" width="76" height="12" rx="5" fill={u(P, "dk")} />
        <rect x="48" y="62" width="64" height="70" fill={u(P, "mh")} />
        <Spec x={53} y={68} w={2.6} h={56} />
        {/* окно с качалкой */}
        <rect x="62" y="86" width="36" height="32" rx="5" fill="#070a10" />
        <rect x="62" y="86" width="36" height="32" rx="5" fill="none" stroke="#fff" strokeOpacity="0.4" />
        <path d="M 70 112 L 80 100 L 90 112 Z" fill="#2a303b" />
        <g transform="rotate(-14 80 100)">
          <path d="M 64 100 L 80 100 L 80 110 L 64 110 Z" fill={u(P, "ac")} />
          <path d="M 80 100 L 96 100 L 96 110 L 80 110 Z" fill="#1d2430" stroke={A} strokeOpacity="0.6" />
        </g>
        <circle cx="80" cy="100" r="2.4" fill={u(P, "mh")} />
        <path d="M 66 114 Q 80 118 94 114" stroke={A} strokeOpacity="0.5" fill="none" />
        {/* обод и воронка */}
        <ellipse cx="80" cy="62" rx="34" ry="9.6" fill={u(P, "mh")} />
        <ellipse cx="80" cy="62" rx="31" ry="8" fill="#0b0f16" />
        <ellipse cx="80" cy="63.6" rx="24" ry="5.4" fill={u(P, "dk")} />
        <ellipse cx="80" cy="64.4" rx="6" ry="2.2" fill="#04060a" />
        <path d="M 49 60 Q 80 70 111 60" stroke="#fff" strokeOpacity="0.55" strokeWidth="1.4" fill="none" />
        {/* капли */}
        {drop(58, 14, 1.1, 0)}{drop(82, 6, 1.3, 1)}{drop(102, 20, 1, 2)}{drop(72, 32, 0.9, 3)}{drop(92, 38, 0.85, 4)}
      </g>
    );
  },

  // дисдрометр: лазерная пелена между двумя головками
  disdrometer: (P, A) => (
    <g>
      <Floor P={P} rx={58} />
      <rect x="22" y="124" width="116" height="9" rx="4" fill={u(P, "dk")} />
      <rect x="30" y="112" width="100" height="14" rx="6" fill={u(P, "mv")} />
      <Spec x={38} y={114.4} w={84} h={2} />
      {/* лазерная пелена */}
      <rect x="54" y="88" width="52" height="14" fill="#ff3b30" opacity="0.28" filter={u(P, "gw")} />
      <rect x="54" y="92" width="52" height="6" rx="3" fill="#ff5a4a" opacity="0.85" />
      <rect x="54" y="94.2" width="52" height="1.6" rx="1" fill="#ffe3df" />
      {/* головки */}
      {[0, 1].map((i) => {
        const x = i ? 104 : 24;
        return (
          <g key={i}>
            <rect x={x} y="68" width="32" height="48" rx="8" fill={u(P, "dh")} />
            <rect x={x} y="68" width="32" height="10" rx="5" fill="#fff" opacity="0.12" />
            <ellipse cx={i ? x + 1 : x + 31} cy="95" rx="3.6" ry="11" fill="#05070a" />
            <ellipse cx={i ? x + 1 : x + 31} cy="95" rx="2" ry="8" fill={i ? "#7fb3ff" : "#ff5a4a"} opacity="0.9" />
            <circle cx={x + 16} cy="76" r="2" fill={A} />
          </g>
        );
      })}
      {/* частицы осадков */}
      {[[68, 36, 0], [80, 20, 1], [92, 46, 2], [74, 66, 3]].map(([x, y, k]) => (
        <g key={k}>
          <path d={`M ${x} ${y} L ${x - 1} ${y + 14}`} stroke={A} strokeOpacity="0.4" strokeWidth="1.2" strokeLinecap="round" />
          <circle cx={x} cy={y + 15} r={2 + (k % 2)} fill={u(P, "ac")} />
        </g>
      ))}
      <circle cx="80" cy="95" r="3" fill="#fff" opacity="0.9" />
      <circle cx="80" cy="95" r="6" fill="#fff" opacity="0.35" filter={u(P, "gw")} />
    </g>
  ),

  // зонд температуры и влажности с фильтром
  probe: (P, A) => (
    <g>
      <Floor P={P} rx={56} />
      <g transform="rotate(-14 80 84)">
        {/* кабель */}
        <path d="M 134 84 C 152 84 154 110 138 122" stroke="#14171d" strokeWidth="4.4" fill="none" strokeLinecap="round" />
        {/* корпус */}
        <rect x="88" y="70" width="46" height="28" rx="9" fill={u(P, "dk")} />
        <Spec x={96} y={73} w={30} h={2.6} o={0.3} />
        <rect x="100" y="70" width="14" height="28" fill={A} opacity="0.85" />
        <rect x="100" y="70" width="14" height="6" fill="#fff" opacity="0.3" />
        <text x="107" y="88" textAnchor="middle" fontSize="6.6" fontWeight="700" fill="#06101c" fontFamily="system-ui, sans-serif">RH</text>
        {/* трубка */}
        <rect x="50" y="78" width="42" height="12" rx="4" fill={u(P, "mv")} />
        <Spec x={54} y={80} w={34} h={1.8} />
        {/* фильтр-колпачок */}
        <rect x="14" y="72" width="40" height="24" rx="11" fill={u(P, "whh")} />
        {[22, 28, 34, 40, 46].map((x) => <line key={x} x1={x} y1="73" x2={x} y2="95" stroke="#7d8798" strokeOpacity="0.75" strokeWidth="1" />)}
        <path d="M 18 78 Q 22 74 30 74" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
        <rect x="52" y="74" width="4" height="20" rx="1.6" fill={u(P, "dk")} />
      </g>
      {/* капля и градусник */}
      <path d="M 40 28 Q 33 38 40 42 Q 47 38 40 28 Z" fill={u(P, "ac")} />
      <rect x="116" y="22" width="6" height="22" rx="3" fill="#0d121a" stroke="#fff" strokeOpacity="0.4" />
      <rect x="117.6" y="30" width="2.8" height="14" rx="1.4" fill="#ff6a4d" />
      <circle cx="119" cy="46" r="5" fill="#0d121a" stroke="#fff" strokeOpacity="0.4" />
      <circle cx="119" cy="46" r="3.2" fill="#ff6a4d" />
    </g>
  ),

  // радиационный экран: стопка тарелок
  shield: (P, A) => (
    <g>
      <Floor P={P} />
      <rect x="75" y="108" width="10" height="38" rx="3" fill={u(P, "mh")} />
      <rect x="66" y="128" width="28" height="6" rx="2" fill={u(P, "dk")} />
      {/* центральный стержень с датчиком */}
      <rect x="77" y="40" width="6" height="74" fill={u(P, "dk")} />
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => {
        const y = 44 + i * 9.4, r = 26 + i * 1.8;
        return (
          <g key={i}>
            <path d={`M ${80 - r} ${y + 6} Q 80 ${y - 9} ${80 + r} ${y + 6} Q 80 ${y + 12} ${80 - r} ${y + 6} Z`} fill={u(P, "wh")} />
            <path d={`M ${80 - r} ${y + 6} Q 80 ${y + 12} ${80 + r} ${y + 6}`} stroke="#7d8798" strokeOpacity="0.8" strokeWidth="0.9" fill="none" />
            <path d={`M ${80 - r + 4} ${y + 3} Q 80 ${y - 6} ${80 + r - 4} ${y + 3}`} stroke="#fff" strokeOpacity="0.9" strokeWidth="1.2" fill="none" />
            <path d={`M ${80 - r} ${y + 6} Q 80 ${y + 12} ${80 + r} ${y + 6} L ${80 + r} ${y + 7.4} Q 80 ${y + 13.4} ${80 - r} ${y + 7.4} Z`} fill="#000" opacity="0.18" />
          </g>
        );
      })}
      <path d="M 54 38 Q 80 18 106 38 Q 80 44 54 38 Z" fill={u(P, "wh")} />
      <path d="M 60 34 Q 80 22 100 34" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* солнечные лучи, отражённые тарелками */}
      {[[18, 12, 40, 30], [30, 6, 50, 24], [8, 24, 30, 40]].map((l, i) => (
        <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#ffd166" strokeWidth="2.2" strokeLinecap="round" opacity={0.9 - i * 0.15} />
      ))}
      <circle cx="14" cy="12" r="6" fill="#ffd166" />
      <circle cx="14" cy="12" r="11" fill="#ffd166" opacity="0.35" filter={u(P, "gw")} />
      <path d="M 124 62 L 142 54 M 126 76 L 146 76 M 124 90 L 142 98" stroke={A} strokeWidth="1.6" strokeLinecap="round" strokeDasharray="1.6 4" />
    </g>
  ),

  // BME280 на плате
  chip: (P, A) => (
    <g>
      <Floor P={P} rx={52} />
      <rect x="28" y="36" width="104" height="92" rx="8" fill="#2b2f8f" />
      <rect x="30" y="38" width="100" height="88" rx="6.5" fill="#3a3fb0" />
      <rect x="30" y="38" width="100" height="22" rx="6.5" fill="#fff" opacity="0.09" />
      {/* дорожки */}
      {[48, 56, 64, 72, 80].map((y, i) => <path key={y} d={`M 38 ${y} H ${52 + i * 3} L ${58 + i * 3} ${y + 6} H 70`} stroke="#6a72e6" strokeOpacity="0.55" strokeWidth="1" fill="none" />)}
      {/* отверстия */}
      {[[40, 48], [120, 48]].map(([x, y]) => (
        <g key={x}><circle cx={x} cy={y} r="5" fill="#d9b44a" /><circle cx={x} cy={y} r="2.8" fill="#0b0d18" /></g>
      ))}
      {/* металлическая крышка датчика */}
      <rect x="62" y="52" width="36" height="34" rx="3" fill={u(P, "mh")} />
      <rect x="62" y="52" width="36" height="34" rx="3" fill="none" stroke="#fff" strokeOpacity="0.55" />
      <rect x="66" y="56" width="28" height="26" rx="2" fill={u(P, "mv")} />
      <circle cx="84" cy="62" r="2.6" fill="#07090d" />
      <rect x="68" y="76" width="14" height="1.6" fill="#fff" opacity="0.7" />
      {/* мелкие компоненты */}
      {[[46, 74], [46, 82], [106, 70], [106, 78]].map(([x, y]) => (
        <g key={`${x}${y}`}><rect x={x} y={y} width="9" height="5" rx="1" fill="#0b0d12" /><rect x={x} y={y} width="2.4" height="5" fill="#cfd6e2" /><rect x={x + 6.6} y={y} width="2.4" height="5" fill="#cfd6e2" /></g>
      ))}
      <text x="42" y="104" fontSize="8.4" fontWeight="700" fill="#e9ecff" fontFamily="ui-monospace, Consolas, monospace">BME280</text>
      {/* штыри */}
      {[0, 1, 2, 3, 4, 5].map((i) => (
        <g key={i}>
          <rect x={42 + i * 14} y="112" width="8" height="18" rx="1.6" fill={u(P, "gold")} />
          <circle cx={46 + i * 14} cy="116" r="2.2" fill="#2b2f8f" />
        </g>
      ))}
      <circle cx="118" cy="86" r="4" fill={A} opacity="0.9" />
      <circle cx="118" cy="86" r="8" fill={A} opacity="0.3" filter={u(P, "gw")} />
    </g>
  ),

  // барометр: корпус со штуцером и шкалой
  baro: (P, A) => (
    <g>
      <Floor P={P} rx={50} />
      <rect x="40" y="38" width="80" height="78" rx="12" fill={u(P, "mv")} />
      <rect x="44" y="42" width="72" height="70" rx="9" fill={u(P, "dk")} />
      <rect x="44" y="42" width="72" height="20" rx="9" fill="#fff" opacity="0.1" />
      {/* шкала */}
      <circle cx="80" cy="76" r="25" fill="#05080d" />
      <circle cx="80" cy="76" r="25" fill="none" stroke="#fff" strokeOpacity="0.3" strokeWidth="1" />
      {Array.from({ length: 21 }, (_, i) => {
        const a = ((-210 + i * 12) * Math.PI) / 180, major = i % 5 === 0;
        return <line key={i} x1={80 + 21 * Math.cos(a)} y1={76 + 21 * Math.sin(a)} x2={80 + (major ? 15.4 : 18) * Math.cos(a)} y2={76 + (major ? 15.4 : 18) * Math.sin(a)} stroke={major ? A : "#8e98a8"} strokeWidth={major ? 1.6 : 0.9} strokeLinecap="round" />;
      })}
      <path d="M 80 76 L 91 61" stroke="#ff6a4d" strokeWidth="2" strokeLinecap="round" />
      <circle cx="80" cy="76" r="3.4" fill={u(P, "mh")} />
      <text x="80" y="95" textAnchor="middle" fontSize="6.8" fill="#9aa6b8" fontFamily="system-ui, sans-serif">гПа</text>
      <path d="M 58 58 Q 80 46 102 58" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* штуцер */}
      <rect x="70" y="114" width="20" height="10" rx="2" fill={u(P, "gold")} />
      <rect x="74" y="124" width="12" height="9" fill={u(P, "mv")} />
      <rect x="71" y="132" width="18" height="5" rx="2.4" fill={u(P, "mv")} />
      <rect x="73" y="137" width="14" height="5" rx="2.4" fill={u(P, "mv")} />
      {/* кабельный ввод */}
      <rect x="118" y="70" width="14" height="12" rx="3" fill={u(P, "dk")} />
      <path d="M 132 76 C 146 76 148 96 138 106" stroke="#14171d" strokeWidth="4" fill="none" strokeLinecap="round" />
      <circle cx="108" cy="50" r="2.4" fill={A} />
    </g>
  ),

  // пиранометр CMP22: два купола под козырьком
  pyrano: (P, A) => (
    <g>
      <Floor P={P} rx={52} />
      <ellipse cx="80" cy="124" rx="44" ry="12" fill={u(P, "whh")} />
      <rect x="36" y="100" width="88" height="24" fill={u(P, "whh")} />
      <ellipse cx="80" cy="100" rx="44" ry="11" fill={u(P, "wh")} />
      <ellipse cx="80" cy="124" rx="44" ry="12" fill="none" stroke="#6c7686" strokeOpacity="0.6" />
      {/* уровень и ножки */}
      <circle cx="54" cy="112" r="5.6" fill="#0d121a" stroke="#fff" strokeOpacity="0.6" />
      <circle cx="54" cy="112" r="3.2" fill={A} opacity="0.4" />
      <ellipse cx="53" cy="111.4" rx="1.6" ry="1.2" fill={A} />
      {[40, 120].map((x) => <rect key={x} x={x - 4} y="130" width="8" height="8" rx="2" fill={u(P, "dk")} />)}
      {/* датчик под куполом */}
      <ellipse cx="80" cy="96" rx="22" ry="6" fill="#07090d" />
      {[0, 60, 120].map((a) => {
        const r = (a * Math.PI) / 180;
        return <line key={a} x1={80 - 19 * Math.cos(r)} y1={96 - 4.6 * Math.sin(r)} x2={80 + 19 * Math.cos(r)} y2={96 + 4.6 * Math.sin(r)} stroke="#f2f6fb" strokeOpacity="0.8" strokeWidth="1.6" />;
      })}
      <circle cx="80" cy="96" r="3.8" fill="#f2f6fb" />
      {/* купола */}
      <path d="M 44 98 Q 44 50 80 48 Q 116 50 116 98 Q 80 108 44 98 Z" fill={u(P, "gl")} stroke="#cfe6ff" strokeOpacity="0.7" />
      <path d="M 56 96 Q 56 64 80 62 Q 104 64 104 96 Q 80 102 56 96 Z" fill={u(P, "gl")} stroke="#cfe6ff" strokeOpacity="0.5" />
      <path d="M 54 84 Q 56 62 74 54" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" opacity="0.9" />
      <path d="M 66 86 Q 68 72 78 68" stroke="#fff" strokeWidth="1.6" fill="none" strokeLinecap="round" opacity="0.7" />
      <ellipse cx="96" cy="58" rx="5" ry="2.2" fill="#fff" opacity="0.35" transform="rotate(30 96 58)" />
      {/* козырёк */}
      <path d="M 34 94 Q 80 114 126 94 L 126 100 Q 80 120 34 100 Z" fill={u(P, "wh")} />
      <path d="M 34 94 Q 80 114 126 94" stroke="#fff" strokeWidth="1.2" fill="none" />
      {/* разъём */}
      <rect x="122" y="108" width="12" height="9" rx="3" fill={u(P, "dk")} />
      <path d="M 134 112 C 146 112 148 128 140 136" stroke="#14171d" strokeWidth="3.6" fill="none" strokeLinecap="round" />
      {/* лучи */}
      {[[20, 24, 40, 44], [40, 10, 54, 36], [124, 10, 108, 36], [142, 26, 120, 46]].map((l, i) => (
        <line key={i} x1={l[0]} y1={l[1]} x2={l[2]} y2={l[3]} stroke="#ffd166" strokeWidth="2" strokeLinecap="round" opacity="0.85" strokeDasharray="5 3" />
      ))}
    </g>
  ),

  // детектор молний: плата, ферритовая антенна, разряд
  lightning: (P, A) => (
    <g>
      <Floor P={P} rx={52} />
      {/* разряд */}
      <path d="M 96 4 L 68 44 L 84 44 L 70 72 L 106 32 L 88 32 L 102 4 Z" fill="#ffe27a" opacity="0.55" filter={u(P, "gw")} />
      <path d="M 96 4 L 68 44 L 84 44 L 70 72 L 106 32 L 88 32 L 102 4 Z" fill={u(P, "gold")} />
      <path d="M 96 4 L 68 44 L 84 44 L 74 62" stroke="#fffbe5" strokeWidth="1.6" fill="none" strokeLinecap="round" />
      {/* волны */}
      {[16, 26].map((r, i) => <path key={r} d={`M ${40 - i * 2} ${50 + r} A ${r + 14} ${r + 14} 0 0 1 ${40 - i * 2} ${50 - r}`} stroke={A} strokeOpacity={0.7 - i * 0.25} strokeWidth="1.6" fill="none" strokeLinecap="round" />)}
      {/* плата */}
      <rect x="22" y="82" width="116" height="52" rx="7" fill="#0e3a52" />
      <rect x="24" y="84" width="112" height="48" rx="5.5" fill="#145a7d" />
      <rect x="24" y="84" width="112" height="14" rx="5.5" fill="#fff" opacity="0.08" />
      {/* феррит с обмоткой */}
      <rect x="34" y="62" width="92" height="22" rx="11" fill={u(P, "dk")} />
      <rect x="34" y="62" width="92" height="22" rx="11" fill="none" stroke="#fff" strokeOpacity="0.25" />
      {Array.from({ length: 14 }, (_, i) => (
        <g key={i}>
          <rect x={44 + i * 5.2} y="60" width="2.8" height="26" rx="1.2" fill="#e7a24a" />
          <rect x={44 + i * 5.2} y="60" width="1.2" height="26" rx="0.6" fill="#ffe3b0" opacity="0.8" />
        </g>
      ))}
      {/* микросхема и мелочь */}
      <rect x="62" y="98" width="30" height="24" rx="2.4" fill="#07090d" />
      <circle cx="68" cy="104" r="1.8" fill="#8e98a8" />
      <text x="77" y="116" textAnchor="middle" fontSize="6.4" fontWeight="700" fill="#cfd6e2" fontFamily="ui-monospace, Consolas, monospace">AS3935</text>
      {[0, 1, 2, 3, 4, 5].map((i) => <rect key={i} x={64 + i * 4.8} y="122" width="2.6" height="4" fill="#cfd6e2" />)}
      {[34, 108].map((x) => <rect key={x} x={x} y="104" width="9" height="5" rx="1" fill="#0b0d12" />)}
      {[0, 1, 2, 3, 4].map((i) => <rect key={i} x={30 + i * 22} y="128" width="7" height="12" rx="1.4" fill={u(P, "gold")} />)}
      <circle cx="124" cy="94" r="3.6" fill="#ff6a4d" /><circle cx="124" cy="94" r="7" fill="#ff6a4d" opacity="0.35" filter={u(P, "gw")} />
    </g>
  ),
};

// ---------- публичный компонент ----------
// узкие приборы чуть крупнее — иначе в общей сетке они теряются рядом с широкими
const SCALE = { cups: 1.18, cupvane: 1.08, sonic3d: 1.08, sonic2d: 1.06, handheld: 1.06, shield: 1.04 };
export function SensorArt({ kind, accent = "#7dd3fc", size = 120, title }) {
  const P = `sa${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const draw = ART[kind];
  if (!draw) return null;
  return (
    <svg width={size === "fill" ? undefined : size} height={size === "fill" ? undefined : size} viewBox="0 0 160 160" role="img" aria-label={title}
         style={{ display: "block", flexShrink: 0, overflow: "visible", ...(size === "fill" ? { height: "94%", width: "auto", aspectRatio: "1 / 1" } : null) }}>
      <Defs P={P} A={accent} />
      <g transform={SCALE[kind] ? `translate(80 148) scale(${SCALE[kind]}) translate(-80 -148)` : undefined}>{draw(P, accent)}</g>
    </svg>
  );
}

export const SENSOR_ART_KINDS = Object.keys(ART);
// для картинок машин: общие градиенты и пол
export { Defs as ArtDefs, Floor as ArtFloor, Spec as ArtSpec, u as artUrl };
