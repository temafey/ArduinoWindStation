// Знак станции живёт отдельно от подсказчика намеренно. Знак виден всегда —
// он стоит в шапке, — а подсказчик открывают редко. Пока они лежали в одном
// файле, тридцать килобайт справки приходилось грузить ради одной картинки.

// ============================================================
// ЗНАК СТАНЦИИ
// ============================================================
// Киви вполоборота — тот же ракурс, что у эмодзи: половинка, срезанная под
// углом, поэтому срез виден не кругом, а эллипсом, и сбоку выступает кожура.
//
// Это единственное цветное пятно во всём интерфейсе, и исключение сделано
// осознанно: знак должен опознаваться мгновенно и издалека, а одноцветный
// силуэт киви от любого другого фрукта в разрезе не отличить — узнают его
// именно по сочетанию зелёной мякоти, светлой сердцевины и чёрного венца
// семечек. Правило «один акцент» касается показаний, а не подписи на бланке.
//
// Нарисован не как иконка, а как чертёж: тонкие линии, ни одной обводки
// толще полутора десятых, семечки развёрнуты по радиусу — так они и лежат
// в настоящем плоде. Наклон 18° и сжатие эллипса дают тот самый разворот,
// на котором видно и срез, и бок одновременно.
export function KiwiMark({ size = 40, g }) {
  const SEEDS = 13;
  const TILT = -18;
  // Полуоси среза. Отношение 0.76 — это косинус угла, под которым смотрим
  // на плоскость среза; отсюда и ощущение объёма без единой тени.
  const RX = 16.5, RY = 12.6;

  return (
    <svg width={size} height={size} viewBox="0 0 48 48"
         style={{ display: "block", flexShrink: 0,
                  filter: g === "off" ? undefined : "drop-shadow(0 0 6px rgba(140,195,74,0.35))" }}>
      <defs>
        {/* Мякоть светлеет к сердцевине — так у киви и есть */}
        <radialGradient id="kiwiFlesh" cx="0.5" cy="0.5">
          <stop offset="0%"   stopColor="#e8f5d6" />
          <stop offset="46%"  stopColor="#a5d16a" />
          <stop offset="88%"  stopColor="#7cb342" />
          <stop offset="100%" stopColor="#6b9e37" />
        </radialGradient>
        {/* Кожура: сверху светлее, снизу уходит в тень */}
        <linearGradient id="kiwiSkin" x1="0.25" y1="0" x2="0.75" y2="1">
          <stop offset="0%"   stopColor="#a2814f" />
          <stop offset="55%"  stopColor="#8a6a44" />
          <stop offset="100%" stopColor="#5f472c" />
        </linearGradient>
      </defs>

      <g transform={`rotate(${TILT} 24 24)`}>
        {/* Кожура — тот же эллипс чуть крупнее и сдвинутый вниз-вправо.
            Оттого она и выглядывает полумесяцем снизу, а не ровным ободком:
            именно так видно бок плода при наклоне. */}
        <ellipse cx="25" cy="25.4" rx={RX + 3} ry={RY + 2.6} fill="url(#kiwiSkin)" />
        <ellipse cx="25" cy="25.4" rx={RX + 3} ry={RY + 2.6} fill="none"
                 stroke="#4c3823" strokeWidth="0.5" opacity="0.8" />
        {/* Ворс: короткие штрихи по нижней кромке, где кожура и видна */}
        {Array.from({ length: 16 }).map((_, i) => {
          const a = (200 + i * 9) * (Math.PI / 180);
          const r1 = 1.0, r2 = 1.9;
          const x = 25 + (RX + 3) * Math.cos(a), y = 25.4 + (RY + 2.6) * Math.sin(a);
          return (
            <line key={i}
                  x1={x - r1 * Math.cos(a)} y1={y - r1 * Math.sin(a)}
                  x2={x + r2 * Math.cos(a)} y2={y + r2 * Math.sin(a)}
                  stroke="#b99a6d" strokeWidth="0.45" opacity="0.55" strokeLinecap="round" />
          );
        })}

        {/* Срез */}
        <ellipse cx="24" cy="23.6" rx={RX} ry={RY} fill="url(#kiwiFlesh)" />
        <ellipse cx="24" cy="23.6" rx={RX} ry={RY} fill="none"
                 stroke="#5f8f2c" strokeWidth="0.6" opacity="0.65" />
        {/* Тонкая светлая кайма под кожурой — у настоящего плода она есть */}
        <ellipse cx="24" cy="23.6" rx={RX - 1.4} ry={RY - 1.1} fill="none"
                 stroke="#cfe6a5" strokeWidth="0.5" opacity="0.5" />

        {/* Лучи мякоти от сердцевины к краю */}
        {Array.from({ length: 26 }).map((_, i) => {
          const a = (i * 360) / 26 * (Math.PI / 180);
          return (
            <line key={i}
                  x1={24 + RX * 0.26 * Math.cos(a)} y1={23.6 + RY * 0.26 * Math.sin(a)}
                  x2={24 + RX * 0.93 * Math.cos(a)} y2={23.6 + RY * 0.93 * Math.sin(a)}
                  stroke="#dff0c4" strokeWidth="0.35" opacity="0.45" />
          );
        })}

        {/* Венец семечек. Каждое развёрнуто по радиусу — в плоде они лежат
            именно так, и без этого разворота венец выглядит россыпью. */}
        {Array.from({ length: SEEDS }).map((_, i) => {
          const deg = (i * 360) / SEEDS + 8;
          const a = deg * (Math.PI / 180);
          const x = 24 + RX * 0.55 * Math.cos(a);
          const y = 23.6 + RY * 0.55 * Math.sin(a);
          return (
            <ellipse key={i} cx={x} cy={y} rx="1.15" ry="0.62" fill="#221c10"
                     transform={`rotate(${deg} ${x} ${y})`} />
          );
        })}

        {/* Сердцевина */}
        <ellipse cx="24" cy="23.6" rx={RX * 0.27} ry={RY * 0.27} fill="#f4fae8" />
        <ellipse cx="24" cy="23.6" rx={RX * 0.27} ry={RY * 0.27} fill="none"
                 stroke="#c9e0a0" strokeWidth="0.4" />
      </g>
    </svg>
  );
}
