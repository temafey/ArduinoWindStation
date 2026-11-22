import { useId } from "react";
import { ArtDefs, ArtFloor, artUrl } from "./wind-sensors-art.jsx";

// Машины и полевые зонды охотников за штормами: иллюстрации и справочные карточки.
//
// Рисунки свои — а не чужие фотографии. Снимки этих машин есть на Викискладе, но
// часть под лицензиями с обязательным указанием автора, часть неизвестного
// происхождения, а рисунок работает и там, где у станции нет выхода в интернет.
// Рисуем по общему виду, не по чертежам: детали (число осей, форма крыши, купол)
// передают узнаваемый облик, а не техническую документацию.
//
// Числа — только те, что нашлись у двух независимых источников или у самого
// владельца машины. Где источники расходятся (основа TIV 2, масса, год), это
// сказано в карточке словами «по разным данным» — в справочнике лучше признать
// разброс, чем выдать одно значение за общее.

const u = artUrl;

function Wheel({ P, cx, cy, r = 14 }) {
  return (
    <g>
      <circle cx={cx} cy={cy} r={r} fill="#0b0d11" />
      <circle cx={cx} cy={cy} r={r - 1.6} fill="#1b1f27" />
      <circle cx={cx} cy={cy} r={r * 0.6} fill={u(P, "mh")} />
      <circle cx={cx} cy={cy} r={r * 0.6} fill="none" stroke="#2a303b" strokeWidth="1" />
      <circle cx={cx} cy={cy} r={r * 0.22} fill={u(P, "dk")} />
      {[0, 72, 144, 216, 288].map((a) => {
        const t = (a * Math.PI) / 180;
        return <circle key={a} cx={cx + r * 0.4 * Math.cos(t)} cy={cy + r * 0.4 * Math.sin(t)} r="1.1" fill="#14171d" />;
      })}
      <path d={`M ${cx - r * 0.8} ${cy - r * 0.35} A ${r * 0.9} ${r * 0.9} 0 0 1 ${cx} ${cy - r * 0.92}`} stroke="#fff" strokeOpacity="0.28" strokeWidth="1.2" fill="none" />
    </g>
  );
}

// стекло кабины: тёмное, с диагональным бликом
const Glass = ({ d, P }) => (
  <g>
    <path d={d} fill="#06121c" />
    <path d={d} fill={u(P, "gl")} opacity="0.55" />
  </g>
);

function dowArt(P, A, rapid) {
  return (
    <g>
      <ArtFloor P={P} rx={66} />
      {/* шасси */}
      <rect x="14" y="108" width="100" height="14" rx="3" fill={u(P, "dh")} />
      {/* аппаратный отсек */}
      <rect x="64" y="64" width="50" height="46" rx="4" fill={u(P, "wh")} />
      <rect x="64" y="64" width="50" height="8" rx="4" fill="#fff" opacity="0.6" />
      {[72, 82, 92, 102].map((x) => <line key={x} x1={x} y1="76" x2={x} y2="106" stroke="#98a4b5" strokeWidth="1" />)}
      {/* кабина */}
      <path d="M 114 108 L 114 82 L 132 78 L 146 96 L 148 112 L 148 122 L 114 122 Z" fill={u(P, "dk")} />
      <Glass P={P} d="M 118 84 L 131 82 L 142 98 L 118 98 Z" />
      {/* пьедестал и тарелка */}
      <rect x="28" y="70" width="10" height="40" fill={u(P, "mh")} />
      <rect x="22" y="104" width="22" height="8" rx="2" fill={u(P, "dk")} />
      <g transform="rotate(-24 33 52)">
        <ellipse cx="33" cy="52" rx="22" ry="27" fill={u(P, "mh")} />
        <ellipse cx="33" cy="52" rx="19" ry="24" fill="#0b0f16" />
        <ellipse cx="33" cy="52" rx="14" ry="18" fill={u(P, "dk")} />
        <ellipse cx="28" cy="40" rx="7" ry="11" fill="#fff" opacity="0.12" />
        <rect x="31.4" y="52" width="3.2" height="28" fill={u(P, "mv")} />
        <circle cx="33" cy="80" r="4" fill={A} />
      </g>
      <path d="M 12 50 Q 6 52 6 62" stroke={A} strokeWidth="1.8" fill="none" strokeLinecap="round" strokeDasharray="2 3" />
      <path d="M 4 40 Q -4 48 -2 64" stroke={A} strokeWidth="1.4" fill="none" strokeLinecap="round" strokeDasharray="2 4" opacity="0.6" />
      {rapid && [-26, -12, 2, 16, 30].map((a, i) => (
        <path key={i} d={`M 33 52 L ${33 - 38 * Math.cos(((a + 14) * Math.PI) / 180)} ${52 - 38 * Math.sin(((a + 14) * Math.PI) / 180)}`} stroke={A} strokeWidth="1.2" strokeLinecap="round" opacity="0.7" />
      ))}
      <Wheel P={P} cx={36} cy={128} r={13} />
      <Wheel P={P} cx={62} cy={128} r={13} />
      <Wheel P={P} cx={130} cy={128} r={13} />
    </g>
  );
}

const VEH = {
  // TIV 2: тяжёлая броня до земли, три оси, упор сзади
  tiv2: (P, A) => (
    <g>
      <ArtFloor P={P} rx={66} />
      <path d="M 14 112 L 14 92 Q 14 84 24 84 L 88 84 L 106 62 L 128 66 L 144 94 L 146 112 Q 146 124 134 124 L 26 124 Q 14 124 14 112 Z" fill={u(P, "dk")} />
      <path d="M 14 92 Q 14 84 24 84 L 88 84 L 106 62 L 128 66 L 134 76 L 24 90 Z" fill="#fff" opacity="0.1" />
      {/* бронелисты по бортам и юбка до земли */}
      <path d="M 18 96 L 110 96 L 110 120 L 18 120 Z" fill="#2c323d" stroke="#0b0d11" strokeWidth="1" />
      {[34, 56, 78, 100].map((x) => <line key={x} x1={x} y1="96" x2={x} y2="120" stroke="#0b0d11" strokeWidth="1" />)}
      {[[24, 101], [24, 115], [104, 101], [104, 115], [64, 101], [64, 115]].map(([x, y], i) => <circle key={i} r="1.4" cx={x} cy={y} fill="#6b7585" />)}
      <path d="M 16 122 L 148 122 L 146 136 L 22 140 Z" fill="#1d222b" stroke="#0b0d11" />
      <path d="M 22 126 L 146 126" stroke="#fff" strokeOpacity="0.18" />
      {/* кабина */}
      <Glass P={P} d="M 108 66 L 126 69 L 138 90 L 108 90 Z" />
      <path d="M 106 62 L 128 66 L 144 94 L 142 96 L 126 70 L 108 66 Z" fill="#9aa6b8" opacity="0.5" />
      {/* башенка камеры */}
      <rect x="52" y="72" width="30" height="14" rx="3" fill={u(P, "mv")} />
      <circle cx="82" cy="79" r="6.4" fill="#07090d" /><circle cx="82" cy="79" r="3.6" fill={A} opacity="0.85" /><circle cx="80.6" cy="77.6" r="1.2" fill="#fff" />
      {/* колёса: три оси */}
      <Wheel P={P} cx={40} cy={126} r={15} />
      <Wheel P={P} cx={72} cy={126} r={15} />
      <Wheel P={P} cx={122} cy={126} r={15} />
      {/* гидравлический упор */}
      <rect x="8" y="104" width="8" height="26" rx="2" fill={u(P, "mv")} />
      <path d="M 8 130 L 12 144 L 16 130 Z" fill={A} />
      <text x="48" y="112" fontSize="10.4" fontWeight="800" fill={A} fontFamily="system-ui, sans-serif" letterSpacing="1">TIV 2</text>
      <circle cx="140" cy="106" r="3" fill="#ffb15a" />
    </g>
  ),

  // TIV 1: более лёгкая база пикапа
  tiv1: (P, A) => (
    <g>
      <ArtFloor P={P} rx={64} />
      <path d="M 18 114 L 18 94 Q 18 86 28 86 L 84 86 L 100 66 L 124 70 L 142 96 L 144 114 Q 144 124 134 124 L 28 124 Q 18 124 18 114 Z" fill={u(P, "dk")} />
      <path d="M 18 94 Q 18 86 28 86 L 84 86 L 100 66 L 124 70 L 130 78 L 28 92 Z" fill="#fff" opacity="0.1" />
      <path d="M 22 98 L 106 98 L 106 120 L 22 120 Z" fill="#2c323d" stroke="#0b0d11" />
      {[40, 64, 86].map((x) => <line key={x} x1={x} y1="98" x2={x} y2="120" stroke="#0b0d11" />)}
      <Glass P={P} d="M 102 70 L 122 73 L 134 94 L 102 94 Z" />
      <path d="M 100 66 L 124 70 L 142 96 L 140 98 L 122 74 L 102 70 Z" fill="#9aa6b8" opacity="0.5" />
      {/* толстые трубы на крыше */}
      <rect x="34" y="74" width="46" height="10" rx="5" fill={u(P, "mv")} />
      <circle cx="80" cy="79" r="5" fill="#07090d" /><circle cx="80" cy="79" r="2.6" fill={A} opacity="0.85" />
      <path d="M 20 122 L 146 122 L 144 134 L 24 138 Z" fill="#1d222b" stroke="#0b0d11" />
      <Wheel P={P} cx={50} cy={126} r={15} />
      <Wheel P={P} cx={116} cy={126} r={15} />
      <text x="40" y="113" fontSize="10.4" fontWeight="800" fill={A} fontFamily="system-ui, sans-serif" letterSpacing="1">TIV</text>
    </g>
  ),

  // Dominator: бронепикап с крыльями-дверями и пусковыми трубами
  dominator: (P, A) => (
    <g>
      <ArtFloor P={P} rx={64} />
      {/* трубы для запуска зондов */}
      {[0, 1, 2].map((i) => <rect key={i} x={28 + i * 9} y={48 - i * 1.4} width="7" height="30" rx="2.4" transform={`rotate(-24 ${31 + i * 9} 78)`} fill={u(P, "mv")} />)}
      {[0, 1, 2].map((i) => <ellipse key={i} cx={20 + i * 9 - 4} cy={50 - i * 2.4} rx="3.4" ry="1.6" transform={`rotate(-24 ${20 + i * 9} 50)`} fill="#05070a" />)}
      {/* кузов и кабина */}
      <path d="M 14 116 L 14 90 L 64 90 L 70 64 L 106 64 L 118 88 L 142 92 L 146 116 Q 146 124 136 124 L 24 124 Q 14 124 14 116 Z" fill={u(P, "dk")} />
      <path d="M 14 90 L 64 90 L 70 64 L 106 64 L 112 76 L 24 96 Z" fill="#fff" opacity="0.1" />
      {/* крыло-дверь вверх */}
      <path d="M 70 64 L 108 64 L 118 88 L 76 88 Z" fill="#2c323d" stroke="#0b0d11" />
      <g transform="rotate(-28 90 66)">
        <path d="M 72 64 L 112 64 L 112 80 L 72 80 Z" fill={u(P, "dk")} stroke={A} strokeOpacity="0.6" />
        <path d="M 78 66 L 108 66 L 108 76 L 78 76 Z" fill="#06121c" />
        <path d="M 78 66 L 108 66 L 108 76 L 78 76 Z" fill={u(P, "gl")} opacity="0.5" />
      </g>
      <Glass P={P} d="M 76 68 L 104 68 L 112 84 L 74 84 Z" />
      {/* броня и полоса */}
      <path d="M 16 96 L 112 96 L 112 120 L 16 120 Z" fill="#2c323d" stroke="#0b0d11" />
      <path d="M 16 108 L 140 108" stroke={A} strokeWidth="4" opacity="0.9" />
      {[28, 52, 76, 100].map((x) => <line key={x} x1={x} y1="96" x2={x} y2="120" stroke="#0b0d11" />)}
      {/* светодиодная панель на крыше */}
      <rect x="76" y="58" width="26" height="5" rx="2" fill="#0b0d11" />
      {[80, 86, 92, 98].map((x, i) => <circle key={x} cx={x} cy="60.6" r="1.6" fill={i % 2 ? "#ff6a4d" : "#ffd166"} />)}
      <path d="M 18 122 L 148 122 L 146 132 L 22 134 Z" fill="#1d222b" stroke="#0b0d11" />
      <Wheel P={P} cx={46} cy={126} r={16} />
      <Wheel P={P} cx={118} cy={126} r={16} />
      {/* якорный упор */}
      <rect x="10" y="108" width="7" height="24" rx="2" fill={u(P, "mv")} />
      <path d="M 10 132 L 13.5 144 L 17 132 Z" fill={A} />
    </g>
  ),

  // доплеровский радар на грузовике: тарелка и пьедестал
  dow: (P, A) => dowArt(P, A, false),
  // быстрый скан: веер из нескольких лучей по высоте
  rsdow: (P, A) => dowArt(P, A, true),

  // C-диапазон: крупная тарелка на тяжёлом прицепе
  cow: (P, A) => (
    <g>
      <ArtFloor P={P} rx={66} />
      <rect x="10" y="110" width="104" height="10" rx="3" fill={u(P, "dh")} />
      <rect x="40" y="76" width="12" height="36" fill={u(P, "mh")} />
      <g transform="rotate(-18 46 50)">
        <ellipse cx="46" cy="50" rx="32" ry="38" fill={u(P, "mh")} />
        <ellipse cx="46" cy="50" rx="28.6" ry="34.6" fill="#0b0f16" />
        <ellipse cx="46" cy="50" rx="22" ry="27" fill={u(P, "dk")} />
        <ellipse cx="38" cy="34" rx="10" ry="14" fill="#fff" opacity="0.12" />
        <rect x="44.2" y="50" width="3.6" height="38" fill={u(P, "mv")} />
        <circle cx="46" cy="88" r="5" fill={A} />
        {[-1, 1].map((s) => <line key={s} x1={46} y1={88} x2={46 + s * 16} y2={22} stroke="#9aa6b8" strokeWidth="1.2" />)}
      </g>
      <rect x="72" y="86" width="42" height="26" rx="3" fill={u(P, "wh")} />
      <path d="M 114 110 L 114 86 L 132 82 L 146 98 L 148 112 L 148 122 L 114 122 Z" fill={u(P, "dk")} />
      <Glass P={P} d="M 118 88 L 131 86 L 142 100 L 118 100 Z" />
      <Wheel P={P} cx={34} cy={128} r={13} />
      <Wheel P={P} cx={58} cy={128} r={13} />
      <Wheel P={P} cx={130} cy={128} r={13} />
      <text x="82" y="104" fontSize="9.6" fontWeight="800" fill="#475569" fontFamily="system-ui, sans-serif">5 см</text>
    </g>
  ),

  // RaXPol: быстро вращающаяся тарелка
  raxpol: (P, A) => (
    <g>
      <ArtFloor P={P} rx={64} />
      <rect x="14" y="108" width="100" height="14" rx="3" fill={u(P, "dh")} />
      <rect x="60" y="68" width="54" height="42" rx="4" fill={u(P, "dk")} />
      <rect x="60" y="68" width="54" height="8" rx="4" fill="#fff" opacity="0.12" />
      {[70, 80, 90, 100].map((x) => <rect key={x} x={x} y="82" width="6" height="22" rx="1.6" fill="#0b0d11" />)}
      <path d="M 114 108 L 114 84 L 132 80 L 146 98 L 148 112 L 148 122 L 114 122 Z" fill={u(P, "dk")} />
      <Glass P={P} d="M 118 86 L 131 84 L 142 100 L 118 100 Z" />
      <rect x="30" y="74" width="8" height="36" fill={u(P, "mh")} />
      <g transform="rotate(-10 34 56)">
        <ellipse cx="34" cy="56" rx="20" ry="24" fill={u(P, "mh")} />
        <ellipse cx="34" cy="56" rx="17" ry="21" fill="#0b0f16" />
        <ellipse cx="34" cy="56" rx="12" ry="15" fill={u(P, "dk")} />
        <rect x="32.4" y="56" width="3.2" height="24" fill={u(P, "mv")} />
        <circle cx="34" cy="80" r="3.6" fill={A} />
      </g>
      {/* вращение 180°/с */}
      <path d="M 8 38 A 30 30 0 0 1 60 38" stroke={A} strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M 56 33 L 61 39 L 53 40" stroke={A} strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M 14 28 A 26 26 0 0 1 54 28" stroke={A} strokeWidth="1.4" fill="none" strokeLinecap="round" opacity="0.5" strokeDasharray="2 3" />
      <Wheel P={P} cx={36} cy={128} r={13} />
      <Wheel P={P} cx={62} cy={128} r={13} />
      <Wheel P={P} cx={130} cy={128} r={13} />
    </g>
  ),

  // ранние Dominator: бронированный внедорожник
  dominator12: (P, A) => (
    <g>
      <ArtFloor P={P} rx={62} />
      <path d="M 14 112 L 14 90 Q 14 84 22 84 L 70 84 L 84 64 L 118 64 L 134 86 L 144 92 Q 148 94 148 100 L 148 114 Q 148 122 138 122 L 24 122 Q 14 122 14 112 Z" fill={u(P, "dk")} />
      <path d="M 14 90 Q 14 84 22 84 L 70 84 L 84 64 L 118 64 L 124 72 L 24 92 Z" fill="#fff" opacity="0.1" />
      <path d="M 18 94 L 130 94 L 132 120 L 18 120 Z" fill="#2c323d" stroke="#0b0d11" />
      {[38, 62, 86, 110].map((x) => <line key={x} x1={x} y1="94" x2={x} y2="120" stroke="#0b0d11" />)}
      <path d="M 18 106 L 142 106" stroke={A} strokeWidth="3.4" opacity="0.9" />
      <Glass P={P} d="M 88 68 L 116 68 L 128 88 L 82 88 Z" />
      <Glass P={P} d="M 40 90 L 76 90 L 86 70 L 52 70 Z" />
      <rect x="64" y="66" width="2.4" height="24" fill="#0b0d11" opacity="0.6" />
      <rect x="64" y="58" width="48" height="5" rx="2" fill="#0b0d11" />
      {[70, 80, 90, 100].map((x, i) => <circle key={x} cx={x} cy="60.6" r="1.6" fill={i % 2 ? "#ff6a4d" : "#ffd166"} />)}
      <path d="M 16 122 L 148 122 L 146 134 L 20 138 Z" fill="#1d222b" stroke="#0b0d11" />
      <Wheel P={P} cx={44} cy={124} r={16} />
      <Wheel P={P} cx={116} cy={124} r={16} />
      <rect x="8" y="106" width="7" height="24" rx="2" fill={u(P, "mv")} />
      <path d="M 8 130 L 11.5 143 L 15 130 Z" fill={A} />
    </g>
  ),

  // мобильная мезосеть: машина со стойкой датчиков
  mesonet: (P, A) => (
    <g>
      <ArtFloor P={P} rx={62} />
      <path d="M 14 112 L 14 90 Q 14 84 22 84 L 70 84 L 84 64 L 118 64 L 134 86 L 144 92 Q 148 94 148 100 L 148 114 Q 148 122 138 122 L 24 122 Q 14 122 14 112 Z" fill="#c8362b" />
      <path d="M 14 90 Q 14 84 22 84 L 70 84 L 84 64 L 118 64 L 124 72 L 24 92 Z" fill="#fff" opacity="0.22" />
      <path d="M 14 106 L 148 106" stroke="#0b0d11" strokeOpacity="0.25" strokeWidth="2" />
      <Glass P={P} d="M 88 68 L 116 68 L 128 86 L 80 86 Z" />
      <Glass P={P} d="M 40 88 L 76 88 L 86 70 L 52 70 Z" />
      <rect x="64" y="64" width="2" height="22" fill="#0b0d11" opacity="0.5" />
      {/* багажник и мачта */}
      <rect x="44" y="60" width="72" height="3.6" rx="1.8" fill={u(P, "mv")} />
      {[52, 108].map((x) => <rect key={x} x={x} y="58" width="2.6" height="7" fill={u(P, "mv")} />)}
      <rect x="78" y="14" width="3.4" height="48" rx="1.6" fill={u(P, "mh")} />
      <circle cx="79.7" cy="13" r="2.6" fill={u(P, "dk")} />
      {[0, 120, 240].map((a, i) => {
        const r = ((a - 40) * Math.PI) / 180;
        const x = 79.7 + 10 * Math.cos(r), y = 11 + 3.2 * Math.sin(r);
        return <g key={i}><line x1="79.7" y1="11" x2={x} y2={y} stroke="#9aa6b8" strokeWidth="1.4" /><circle cx={x} cy={y} r="3.4" fill={u(P, "ach")} /></g>;
      })}
      <path d="M 68 28 L 79 28 M 94 26 L 79.7 26" stroke="#9aa6b8" strokeWidth="1.4" />
      <path d="M 94 22 L 112 18 L 112 34 L 94 30 Z" fill={u(P, "wh")} />
      <rect x="82" y="40" width="10" height="14" rx="3" fill={u(P, "whh")} />
      {[43, 46, 49, 52].map((y) => <line key={y} x1="82" y1={y} x2="92" y2={y} stroke="#7d8798" strokeWidth="0.8" />)}
      <path d="M 52 60 L 44 30" stroke="#1d222b" strokeWidth="1.2" /><circle cx="44" cy="29" r="1.6" fill={A} />
      <Wheel P={P} cx={44} cy={122} r={15} />
      <Wheel P={P} cx={116} cy={122} r={15} />
      <circle cx="144" cy="100" r="3" fill="#ffe27a" />
    </g>
  ),

  // TOTO: бочка с анемометром сверху
  toto: (P, A) => (
    <g>
      <ArtFloor P={P} rx={44} />
      <rect x="44" y="64" width="72" height="72" rx="6" fill={u(P, "or")} />
      <rect x="44" y="64" width="72" height="72" rx="6" fill={u(P, "mh")} opacity="0.35" />
      {[78, 108, 126].map((y) => <rect key={y} x="42" y={y} width="76" height="4" rx="2" fill="#7a3a0a" />)}
      <ellipse cx="80" cy="64" rx="36" ry="8" fill="#ffb15a" />
      <ellipse cx="80" cy="64" rx="32" ry="6" fill="#d9620f" />
      <Spec3 P={P} />
      <ellipse cx="80" cy="138" rx="40" ry="5" fill="#7a3a0a" />
      {/* мачта с чашками */}
      <rect x="78.4" y="22" width="3.2" height="44" fill={u(P, "mh")} />
      {[0, 120, 240].map((a, i) => {
        const r = ((a - 40) * Math.PI) / 180;
        const x = 80 + 14 * Math.cos(r), y = 24 + 4.4 * Math.sin(r);
        return <g key={i}><line x1="80" y1="24" x2={x} y2={y} stroke="#9aa6b8" strokeWidth="1.6" /><circle cx={x} cy={y} r="4.2" fill={u(P, "ach")} /></g>;
      })}
      <circle cx="80" cy="24" r="3" fill={u(P, "dk")} />
      <text x="80" y="108" textAnchor="middle" fontSize="15" fontWeight="800" fill="#fff" fontFamily="system-ui, sans-serif" opacity="0.92">TOTO</text>
      <text x="80" y="122" textAnchor="middle" fontSize="6.8" fill="#fff" opacity="0.8" fontFamily="system-ui, sans-serif">≈ 250–350 фунтов</text>
    </g>
  ),

  // «черепаха» Самарас: низкий конус, прижатый ветром
  turtle: (P, A) => (
    <g>
      <ArtFloor P={P} rx={52} />
      <ellipse cx="80" cy="130" rx="54" ry="9" fill={u(P, "dk")} />
      <path d="M 28 128 Q 36 92 80 82 Q 124 92 132 128 Q 80 142 28 128 Z" fill={u(P, "ac")} />
      <path d="M 40 112 Q 54 92 80 86 Q 70 98 62 118 Z" fill="#fff" opacity="0.4" />
      <path d="M 28 128 Q 80 142 132 128 L 132 132 Q 80 148 28 132 Z" fill="#000" opacity="0.28" />
      {/* датчики и антенна */}
      <ellipse cx="80" cy="84" rx="16" ry="5" fill={u(P, "mh")} />
      <ellipse cx="80" cy="83" rx="9" ry="2.8" fill="#0b0d11" />
      <rect x="79" y="52" width="2" height="32" fill="#9aa6b8" />
      <circle cx="80" cy="50" r="2.6" fill={A} /><circle cx="80" cy="50" r="6" fill={A} opacity="0.3" filter={u(P, "gw")} />
      {[48, 80, 112].map((x) => <ellipse key={x} cx={x} cy={x === 80 ? 116 : 122} rx="3.2" ry="2" fill="#07090d" />)}
      {/* ветер прижимает */}
      {[56, 70].map((y, i) => (
        <g key={y}>
          <path d={`M ${4} ${y} H ${26 - i * 4}`} stroke={A} strokeWidth="2" strokeLinecap="round" opacity={0.85 - i * 0.2} />
          <path d={`M ${22 - i * 4} ${y - 3} L ${27 - i * 4} ${y} L ${22 - i * 4} ${y + 3}`} stroke={A} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" opacity={0.85 - i * 0.2} />
        </g>
      ))}
    </g>
  ),
};

// маленький блик на крышке бочки
function Spec3({ P }) {
  return <ellipse cx="62" cy="63" rx="12" ry="2.4" fill="#fff" opacity="0.45" />;
}

export function VehicleArt({ kind, accent = "#fbbf24", size = 120, title }) {
  const P = `va${useId().replace(/[^a-zA-Z0-9]/g, "")}`;
  const draw = VEH[kind];
  if (!draw) return null;
  return (
    <svg width={size === "fill" ? undefined : size} height={size === "fill" ? undefined : size} viewBox="0 0 160 160" role="img" aria-label={title}
         style={{ display: "block", flexShrink: 0, overflow: "visible", ...(size === "fill" ? { height: "94%", width: "auto", aspectRatio: "1 / 1" } : null) }}>
      <ArtDefs P={P} A={accent} />
      {draw(P, accent)}
    </svg>
  );
}
export const VEHICLE_ART_KINDS = Object.keys(VEH);

// ============================================================
// КАРТОЧКИ
// ============================================================
// Те же поля, что у приборов в wind-meteo.jsx: id, cat, art, name, kind, tag,
// specs, why, caveat, url. art — ключ VehicleArt.
export const CHASER_CATS = [
  { id: "armor", label: "Бронемашины" },
  { id: "radar", label: "Радары на колёсах" },
  { id: "station", label: "Станции и зонды" },
  { id: "air", label: "Воздух и сеть" },
];

export const CHASERS = [
  {
    id: "tiv1", vart: "tiv1", cat: "armor",
    name: "TIV 1", kind: "Первый броневик Шона Кэйси",
    tag: "киносъёмка изнутри",
    specs: [
      ["База", "Ford F-450 Super Duty 1997 года, сдвоенные колёса, дизель"],
      ["Создатель", "кинорежиссёр Шон Кэйси (IMAX)"],
      ["Заявленная стойкость", "ветер до 265 км/ч (165 миль/ч)"],
      ["Масса", "около 7.5 т — по неофициальным данным"],
    ],
    why: "С него началась история машин, которые подъезжают к смерчу не ради данных, а ради кадра: Кэйси хотел снять воронку изнутри на плёнку IMAX. TIV 1 показал, что обычный грузовик с бронёй и упорами в землю остаётся на колёсах там, где всё остальное уже летит.",
    caveat: "Цифры стойкости — заявления самой команды, независимых испытаний нет. По разным данным его строили в начале 2000-х, точный год в справочниках расходится.",
    url: "https://en.wikipedia.org/wiki/Tornado_Intercept_Vehicle",
  },
  {
    id: "tiv2", vart: "tiv2", cat: "armor",
    name: "TIV 2", kind: "Бронированный перехватчик, второе поколение",
    tag: "6×4, броня до земли",
    specs: [
      ["База", "по разным данным — Dodge Ram 3500, дизель Cummins"],
      ["Появился", "около 2008 года, заменил TIV 1"],
      ["Масса", "около 6.5 т после облегчения (раньше 7.5 т и больше)"],
      ["Схема", "три оси; по Википедии привод на две (6×4), в других источниках иначе"],
      ["Клиренс", "гидравлика: высоко на дороге, низко при перехвате"],
    ],
    why: "Переделанный TIV: тяжёлые броневые юбки до земли, лёгкий корпус, опускание на грунт. Облегчение с 7.5 до 6.5 т сделали ради скорости: чем быстрее такая машина занимает позицию, тем лучше шанс успеть. Цель та же — оказаться внутри воронки с камерой.",
    caveat: "Машина телевизионная, не научная: данных она почти не даёт, а риск огромен. Упоры в землю — упомянуты в описаниях, но подтверждений в серьёзных источниках немного, поэтому в числах их нет.",
    url: "https://en.wikipedia.org/wiki/Tornado_Intercept_Vehicle",
  },
  {
    id: "dominator3", vart: "dominator", cat: "armor",
    name: "Dominator 3", kind: "Бронепикап Рида Таймера",
    tag: "в смерч ради зондов",
    specs: [
      ["База", "Ford F-350 Super Duty, 2012–2013 года (источники расходятся)"],
      ["Особенности", "броня, гидравлические упоры, лебёдка, пневмоподвеска, двери-«крылья»"],
      ["Стоимость", "около 750 тыс. долларов — по сообщениям прессы"],
      ["Эпизод", "май 2023: заезд в смерч у Спалдинга, Небраска"],
      ["Ветер внутри", "по оценке команды, 160–170 миль/ч (около 260–270 км/ч)"],
    ],
    why: "Первый Dominator не на базе машины General Motors. Строился под научную задачу: заехать в смерч и измерить его изнутри, закрепив машину упорами. По сообщениям, на борту ещё и пусковые трубы для зондов — их выстреливают на пути вихря.",
    caveat: "Скорость ветра внутри — оценка самой команды, а не измерение по стандартной шкале: EF-рейтинг даёт обследование ущерба, а не бортовой прибор. Про пусковые трубы источники осторожны, как про вооружение это читать не стоит.",
    url: "https://www.thedrive.com/news/the-tornado-chasing-dominator-3-started-life-as-a-2013-ford-f-350-super-duty",
  },
  {
    id: "dominator12", vart: "dominator12", cat: "armor",
    name: "Dominator 1 и 2", kind: "Первые броневики Таймера на базе внедорожников",
    tag: "Tahoe и Yukon XL",
    specs: [
      ["Основа", "внедорожники General Motors: Chevrolet Tahoe и GMC Yukon XL"],
      ["Защита", "бронелисты, поликарбонат, защитное напыление LINE-X"],
      ["Роль", "поиск смерча для телепередачи и научных проектов"],
    ],
    why: "Ранние Dominator выросли из обычных полноприводных SUV: на них нарастили броню и стекло, и этого хватило, чтобы подъезжать к смерчам ближе обычных охотников. Именно их опыт потом лёг в тяжёлый Dominator 3.",
    caveat: "Подробные характеристики ранних машин в открытых источниках скудные: перечислено только то, что называют сразу несколько публикаций.",
    url: "https://en.wikipedia.org/wiki/SRV_Dominator",
  },
  {
    id: "dow67", vart: "dow", cat: "radar",
    name: "DOW6 и DOW7", kind: "Доплеровские радары на грузовиках, X-диапазон",
    tag: "два передатчика по 250 кВт",
    specs: [
      ["Диапазон", "X, 9.35–9.55 ГГц, двойная поляризация"],
      ["Мощность", "два передатчика по 250 кВт — рекорд среди мобильных X-радаров"],
      ["Луч", "узкий, 0.8–0.9°"],
      ["Шаг по дальности", "от 15 до 600 м"],
      ["Хозяин", "DOW Facility при Иллинойсском университете (прежде CSWR, Джошуа Вурман)"],
    ],
    why: "Это те самые «радары на колёсах», которые просвечивают смерч с расстояния в километры и дают скорость вращения вихря. На них держится большая часть научных измерений внутренней структуры смерчей в США.",
    caveat: "Радар видит не землю, а слой на высоте луча, поэтому его рекордные скорости не идут в рейтинг EF. Состав парка меняется: источники по-разному называют нынешние машины.",
    url: "https://en.wikipedia.org/wiki/Doppler_on_Wheels",
  },
  {
    id: "rsdow", vart: "rsdow", cat: "radar",
    name: "Rapid-Scan DOW", kind: "Радар с двенадцатью лучами одновременно",
    tag: "скан в разы быстрее",
    specs: [
      ["Принцип", "12 лучей по высоте одновременно, а не один луч по очереди"],
      ["Диапазон", "X, двойная частота и поляризация"],
      ["Зачем", "поймать смерч, который меняется быстрее, чем крутится обычная антенна"],
    ],
    why: "Обычный радар обходит небо по одному углу за оборот, и смерч успевает измениться. Двенадцать лучей сразу дают срез по всей высоте за один оборот — это и есть «быстрый скан».",
    caveat: "Цена быстрого скана — другая схема работы радара: мощность на каждый из лучей делится, поэтому его используют на близких дистанциях. Точные числа для Rapid-Scan DOW здесь не приведены — их нет у независимых источников.",
    url: "https://en.wikipedia.org/wiki/Doppler_on_Wheels",
  },
  {
    id: "cow", vart: "cow", cat: "radar",
    name: "COW (C-band On Wheels)", kind: "Быстро разворачиваемый радар C-диапазона",
    tag: "длина волны 5 см",
    specs: [
      ["Диапазон", "C, длина волны 5 см (у X-радаров — 3 см)"],
      ["Появился", "конец 2018 года"],
      ["Передатчики", "два по 1 МВт — по данным Википедии, вторичный источник"],
    ],
    why: "Волна длиннее — ослабление в сильном дожде меньше, а потому радар видит дальше сквозь ливень. COW занимает место между мобильным X-радаром и стационарным NEXRAD: ездит, но стреляет дальше.",
    caveat: "Заявленные два мегаватта — из вторичного источника (Википедия), у владельца радара цифры могут быть поданы иначе. Парк DOW меняется, поэтому состав на сегодня сверяйте на сайте владельца.",
    url: "https://en.wikipedia.org/wiki/Doppler_on_Wheels",
  },
  {
    id: "raxpol", vart: "raxpol", cat: "radar",
    name: "RaXPol", kind: "Быстро вращающийся радар Университета Оклахомы",
    tag: "один экземпляр",
    specs: [
      ["Разработка", "ProSensing вместе с Университетом Оклахомы, около 2011 года"],
      ["Частота", "9730 МГц (X-диапазон)"],
      ["Антенна", "параболическая тарелка 2.4 м, двойная поляризация"],
      ["Скорость вращения", "около 180° в секунду"],
      ["Полный объём", "10 углов места примерно за 20 секунд"],
      ["Шаг по дальности", "7.5–75 м"],
    ],
    why: "Радар, который крутится так быстро, что за 20 секунд строит объёмную картину смерча — на порядок быстрее обычного. Для этого он прыгает по частотам, чтобы быстро накапливать независимые измерения. Данные доступны исследователям через NSF.",
    caveat: "Пиковая мощность передатчика — 20 кВт, у X-радаров DOW — по 250 кВт. Это осознанная цена быстрого скана: такой радар, вероятно, работает на меньших дистанциях, но независимых сравнений дальности в открытых источниках нет.",
    url: "https://en.wikipedia.org/wiki/RaXPol",
  },
  {
    id: "toto", vart: "toto", cat: "station",
    name: "TOTO", kind: "Прототип полевого зонда для смерчей, 1979 год",
    tag: "бочка с датчиками",
    specs: [
      ["Назвали", "TOtable Tornado Observatory — «переносная обсерватория смерча»"],
      ["Создатели", "Эл Бедард и Карл Рамзи (NOAA)"],
      ["Масса", "250–350 фунтов (около 115–160 кг)"],
      ["Устройство", "металлическая бочка, позже окрашенная в оранжевый"],
    ],
    why: "Идея была простой и безумной: поставить прибор на пути смерча и дождаться. Бочка весила достаточно, чтобы остаться на месте. Имя прибору дали по собачке Тото из «Волшебника страны Оз», а по данным Смитсоновского журнала, он вдохновил сюжет фильма «Смерч» (Twister).",
    caveat: "Бочку, по описаниям, красили в оранжевый в последние годы службы. Это скорее история, чем рабочий инструмент: идея «прибор на пути смерча» пережила сам TOTO, а попасть в траекторию вслепую — главная трудность этого способа.",
    url: "https://en.wikipedia.org/wiki/TOtable_Tornado_Observatory",
  },
  {
    id: "turtle", vart: "turtle", cat: "station",
    name: "Turtle (Тим Самарас)", kind: "Низкий конусный зонд, прижимаемый ветром",
    tag: "рекорд давления",
    specs: [
      ["Форма", "приплюснутый конус: сам ветер прижимает его к земле"],
      ["Меряет", "давление, влажность, температуру, скорость и направление ветра"],
      ["Рекорд", "24 июня 2003, Манчестер, Южная Дакота: падение 100 гПа за 5 секунд"],
      ["Запись", "Книга рекордов Гиннесса: наибольшее измеренное падение давления в смерче"],
    ],
    why: "Тим Самарас сделал TOTO лёгким и умным: вместо бочки — низкий конус, который ветер вдавливает в землю. Его бросали на пути смерча, и один из них записал самое быстрое и глубокое падение давления, измеренное внутри вихря.",
    caveat: "Годы в источниках расходятся: «черепаху» называют 1999 годом и началом 2000-х. Самарас погиб 31 мая 2013 года близ Эль-Рино; его работа жива, но чужие повторения такого опасны.",
    url: "https://en.wikipedia.org/wiki/Tim_Samaras",
  },
];

// Краткая памятка вместо учебника: только то, что у независимых источников совпало.
export const CHASE_NOTES = [
  "Не ездите в одиночку: Национальная служба погоды США советует хотя бы двоих в машине.",
  "Не доверяйте радару на сто процентов — смотрите сами: радар задерживается и не видит у земли.",
  "Не опирайтесь на чужой путь отхода — даже по карте и GPS дорога может оказаться ловушкой.",
  "Ливень, мокрый асфальт и порывистый ветер опасны и для опытных наблюдателей.",
  "После погони разберите её: что можно было сделать безопаснее.",
];
