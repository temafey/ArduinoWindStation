# Wind Station — финальная электрическая схема (источник истины для KiCad)

> Назначение: **точное, выверенное определение схемы** для пересоздания KiCad-проекта «с нуля, максимально правильно, с тестами и верификациями».
> Источники истины (сверено 2026-05-29): `esp32_wind_station/esp32_wind_station.ino` (распиновка + математика делителей), `wind-station-assembly.md` (силовая архитектура, обоснования), `bom-photos.md` (реальные детали и количества), `CLAUDE.md` (инварианты).
>
> Эта схема собирается на **двух уровнях**: пайка на перфоплате 90×60 (BOM #37). KiCad-проект документирует электрику и даёт нетлист/ERC/DRC — это не обязывает разводить заводскую плату, но делает связи проверяемыми.

---

## 0. Инварианты (нарушать нельзя)

1. **Аналоговые входы только на ADC1**: GPIO32/34/35. ADC2 (GPIO 0,2,4,12–15,25–27) не работает при активном WiFi.
2. **Делитель сигнала: верх 10k+5k последовательно (=15k), низ 10k** → `Vadc = Vsensor / 2.5` (firmware `SIGNAL_DIVIDER_RATIO = 2.5`, **не меняется**). 5V → 2.0V, чистая линейная зона ADC. Верхние 15k собраны из 10k+5k, так как номинала 15k нет в наличии; сумма точна, коэффициент 2.5 сохраняется.
3. **Делитель батареи 100k + 100k** → `Vbat = Vadc × 2.0` (`BATTERY_DIVIDER_RATIO = 2.0`).
4. **Питание ESP32 только через VIN** (шина ~4.7V), НЕ через USB при рабочем режиме.
5. **diode-OR на двух 1N5819**: адаптер и boost#2 сходятся катодами на одну шину RAIL.
6. Распиновка GPIO ↔ роль **жёстко привязана к firmware** (таблица §2). Менять GPIO = менять и `.ino`.

---

## 1. Перечень компонентов (refdes ↔ значение ↔ футпринт)

Футпринты выверены под установку KiCad 10.0 (все из глобальных библиотек, кроме ESP32 — проектная `WindStation.pretty`).

| Refdes | Значение | Символ | Футпринт | Лист |
|--------|----------|--------|----------|------|
| U4 | ESP32 DevKit V1 | `ESP32_DevKit:ESP32_30Pin` | `WindStation:ESP32_DevKit_V1_30pin` | root |
| U1 | TP4056 Type-C | `WindStation_modules:TP4056_Module` | `Connector_PinHeader_2.54mm:PinHeader_1x06_P2.54mm_Vertical` | 01 |
| U2 | Boost#2 (5V) | `WindStation_modules:MiniBoost_HW085` | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical` | 01 |
| U3 | Boost#1 (12V) | `WindStation_modules:MiniBoost_HW085` | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical` | 02 |
| D1 | 1N5819 (Schottky_A) | `Device:D_Schottky` | `Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal` | 01 |
| D2 | 1N5819 (Schottky_B) | `Device:D_Schottky` | `Diode_THT:D_DO-41_SOD81_P10.16mm_Horizontal` | 01 |
| F1 | PPTC 2A | `Device:Polyfuse` | `Fuse:Fuse_Bourns_MF-RG400` ⚠️ | 01 |
| BT1, BT2 | 18650 LG HG2 | `Device:Battery` | `Battery:BatteryHolder_Keystone_1042_1x18650` ⚠️ | 01 |
| C1 | 1000µF/16V | `Device:C_Polarized` | `Capacitor_THT:CP_Radial_D10.0mm_P5.00mm` | 01 |
| C2…C5 | 100nF | `Device:C` | `Capacitor_THT:C_Disc_D5.0mm_W2.5mm_P5.00mm` | 01/02/03 |
| SW1 | Главный выкл. SPDT | `Switch:SW_SPDT` | `Connector_PinHeader_2.54mm:PinHeader_1x03_P2.54mm_Vertical` (внешний, на проводах) | 01 |
| J1 | Адаптер 5V (панельный USB-C) | `Connector_Generic:Conn_01x02` | `Connector_PinHeader_2.54mm:PinHeader_1x02_P2.54mm_Vertical` | 01 |
| J2 | Датчик ветра | `WindStation_modules:WindSensor_0_5V` | `Connector_PinHeader_2.54mm:PinHeader_1x04_P2.54mm_Vertical` (= 2×KF301) | 02 |
| R1, R3 | 10k (верх делителя, часть A) | `Device:R` | `Resistor_THT:R_Axial_DIN0207_L6.3mm_D2.5mm_P10.16mm_Horizontal` | 02 |
| R12, R13 | 5k (верх делителя, часть B — последовательно с R1/R3, сумма 15k) | `Device:R` | `…R_Axial_DIN0207…P10.16mm…` | 02 |
| R2, R4 | 10k (низ делителя) | `Device:R` | `…R_Axial_DIN0207…P10.16mm…` | 02 |
| R5, R6 | 100k (делитель бат.) | `Device:R` | `…R_Axial_DIN0207…P10.16mm…` | 03 |
| R7…R11 | 220 (токоогр. LED) | `Device:R` | `…R_Axial_DIN0207…P10.16mm…` | 04 |
| D3 | LED зелёный (OK) | `Device:LED` | `LED_THT:LED_D5.0mm` | 04 |
| D4 | LED жёлтый (>5) | `Device:LED` | `LED_THT:LED_D5.0mm` | 04 |
| D5 | LED красный (>15) | `Device:LED` | `LED_THT:LED_D5.0mm` | 04 |
| D6 | LED зелёный (WiFi) | `Device:LED` | `LED_THT:LED_D5.0mm` | 04 |
| D7 | LED красный (error) | `Device:LED` | `LED_THT:LED_D5.0mm` | 04 |

**Всего 35 компонентов.** ⚠️ = сверить с реальной деталью (см. §6).

---

## 2. Распиновка ESP32 (жёстко привязана к firmware)

| Пин символа (№) | Имя | Сеть | Роль (из `.ino`) |
|---|---|---|---|
| 1 | VIN | `LOAD_RAIL` | основное питание (~4.7V после тумблера) |
| 2, 17 | GND | `GND` | общая земля |
| 16 | 3V3 | — (NC) | выход LDO, наружу не разводим |
| 12 | GPIO34 | `SPEED_ADC` | вход скорости (после делителя 10k+5k / 10k) |
| 11 | GPIO35 | `DIR_ADC` | вход направления |
| 10 | GPIO32 | `BAT_ADC` | мониторинг батареи |
| 7 | GPIO26 | `LED_GREEN` | зелёный OK |
| 6 | GPIO27 | `LED_YELLOW` | жёлтый >5 м/с |
| 5 | GPIO14 | `LED_RED` | красный >15 м/с |
| 8 | GPIO25 | `LED_WIFI` | зелёный WiFi |
| 9 | GPIO33 | `LED_ERROR` | красный ошибка |

Остальные пины ESP32 не подключены (no-connect).

---

## 3. Полный нетлист (определение всех соединений)

Каждая строка — сеть и её участники. Это эталон для проверки §5.3.

### Силовые сети
- **`GND`** — общая земля, **начинается с `OUT−`, т.е. после защиты**: J1.2, U1(IN−,OUT−)=пины 2/6, C1−, U2(IN−,OUT−), U3(IN−,OUT−), R2.2, R4.2, R6.2, C2−, C3−, C4−, C5−, D3..D7 катоды (K), J2.GND, ESP32 пины 2 и 17. **+ PWR_FLAG**.
- **`PACK_MINUS`** — 🔴 минус пакета 18650 **до** защиты: BT1−, BT2−, U1.B−(4). Ровно три участника. **Категорически не объединять с `GND`.** Внутри модуля между `B−`(4) и `OUT−`(6) стоят MOSFET'ы 8205A под управлением DW01A — размыкать эту пару и есть единственный способ, которым защита срабатывает. Любая внешняя связь `B−`↔`GND` пускает ток пакета в обход транзисторов и превращает DW01A в наблюдателя, отключённого от собственного рубильника. Ячейки LG HG2 — **незащищённые**, другой защиты в системе нет. Ток пакета обязан идти `BT−` → `B−` → (8205A) → `OUT−` → `GND`.
- **`ADAPTER_5V`** — +5V адаптера: J1.1, U1.IN+(1), D1.анод(A). **+ PWR_FLAG**.
- **`VBAT`** — батарея +: BT1+, BT2+, F1.1. **+ PWR_FLAG**.
- **`TP_B+`** — после PTC / клемма B+ TP4056: F1.2, U1.B+(3), R5.1 (верх делителя батареи). **+ PWR_FLAG** (вся сеть пассивная).
- **`TP_OUT`** — выход заряд/нагрузка TP4056: U1.OUT+(5), U2.IN+(1).
- **`BOOST2_OUT`** — выход boost#2 (~5V): U2.OUT+(3), D2.анод(A).
- **`RAIL_4V7`** — главная шина (~4.7V): D1.катод(K), D2.катод(K), C1+, SW1.общий (пин B/2). **+ PWR_FLAG**.
- **`LOAD_RAIL`** — после тумблера: SW1.нагрузка (пин A/1), ESP32.VIN(1), U3.IN+(1), C2.1. **+ PWR_FLAG**.
- **`V12_SENSOR`** — 12V на датчик: U3.OUT+(3), J2.VCC_12V(1).
- SW1.пин C(3) — **no-connect** (третий throw SPDT не используется).

### Сигнальные сети (датчик → делители → ADC)
- **`SPEED_SIG`** — сырой сигнал скорости 0–5V: J2.SPEED_OUT(3), R1.1.
- **`SPEED_MID`** — узел стыка верхней пары: R1.2, R12.1. Ровно два участника (10k↔5k), больше ничего.
- **`SPEED_ADC`** — R12.2, R2.1, C3.1, ESP32.GPIO34(12).
- **`DIR_SIG`** — J2.DIR_OUT(4), R3.1.
- **`DIR_MID`** — узел стыка верхней пары: R3.2, R13.1. Ровно два участника (10k↔5k), больше ничего.
- **`DIR_ADC`** — R13.2, R4.1, C4.1, ESP32.GPIO35(11).
- **`BAT_ADC`** — R5.2, R6.1, C5.1, ESP32.GPIO32(10).

### Сети LED (GPIO → 220Ω → анод; катод → GND)
| GPIO-сеть | участники | сеть резистор↔LED | LED |
|---|---|---|---|
| `LED_GREEN` | GPIO26(7), R7.1 | `N_R7_D3`: R7.2, D3.A | D3 (зел. OK) |
| `LED_YELLOW` | GPIO27(6), R8.1 | `N_R8_D4`: R8.2, D4.A | D4 (жёлт. >5) |
| `LED_RED` | GPIO14(5), R9.1 | `N_R9_D5`: R9.2, D5.A | D5 (кр. >15) |
| `LED_WIFI` | GPIO25(8), R10.1 | `N_R10_D6`: R10.2, D6.A | D6 (зел. WiFi) |
| `LED_ERROR` | GPIO33(9), R11.1 | `N_R11_D7`: R11.2, D7.A | D7 (кр. error) |

---

## 4. Иерархия листов KiCad

```
WindStation.kicad_sch (root)
├── U4 ESP32 + иерархические метки (LOAD_RAIL, GND, *_ADC, LED_*)
├── 01_power.kicad_sch       — J1, U1, D1, D2, F1, BT1, BT2, U2, C1, SW1, C2
│     hier-выходы: LOAD_RAIL, GND, TP_B+, (V12 берётся в 02 от LOAD_RAIL)
├── 02_sensor.kicad_sch      — U3, J2, R1..R4, R12, R13, C3, C4
│     hier-входы: LOAD_RAIL, GND;  выходы: SPEED_ADC, DIR_ADC
├── 03_battery_monitor.kicad_sch — R5, R6, C5
│     hier-входы: TP_B+, GND;  выход: BAT_ADC
└── 04_leds.kicad_sch        — R7..R11, D3..D7
      hier-входы: LED_GREEN/YELLOW/RED/WIFI/ERROR, GND
```

Активы, которые **переносятся из старого проекта** (они выверены, переделывать не нужно):
`esp32_devkit.kicad_sym`, `WindStation_modules.kicad_sym`, `WindStation.pretty/ESP32_DevKit_V1_30pin.kicad_mod`.

---

## 5. Тесты и верификации (критерии приёмки проекта)

### 5.1 ERC (Electrical Rule Check) — обязателен
- **Критерий: 0 ошибок.** Предупреждения разобрать поимённо.
- Обязательные `PWR_FLAG` на сетях без пина типа power_out: `GND`, `ADAPTER_5V`, `VBAT`, `TP_B+`, `RAIL_4V7`, `LOAD_RAIL`, **`PACK_MINUS`** (все три её пина — `passive`, драйвера нет → ERC «no driver» без флага). (`TP_OUT`, `BOOST2_OUT`, `V12_SENSOR` флаг НЕ нужен — их драйвит power_out пин boost/TP4056.)
- ⚠️ **Конфликт power-output на GND (выявлено при валидации).** В символах `WindStation_modules` минусовые пины помечены: `IN−`=power_in, `B−`=passive, `OUT−`=**power_out**. Три `OUT−` (U1/U2/U3) сходятся на `GND` → ERC выдаст «power output conflict», а добавленный на GND `PWR_FLAG` (он тоже power-output) усугубит. **Фикс в Pass 2:** в `WindStation_modules.kicad_sym` сменить тип всех возвратных пинов `IN−/OUT−/B−` на `passive` — тогда на GND остаются только passive/power_in и один `PWR_FLAG` (или символ `power:GND`) закрывает ERC начисто.
- `3V3` ESP32 (пин 16, тип output) и пин C тумблера — явный `no_connect`; все неиспользуемые пины ESP32 — тоже `no_connect`.
- Инструмент: `mcp__kicad-mcp__run_erc`.

### 5.2 Полнота футпринтов
- **Критерий: у всех 33 компонентов поле Footprint не пустое** и резолвится в библиотеке.
- Проверка: `list_schematic_components` + grep по `(property "Footprint" "…")`; ESP32 → `list_footprint_libraries` видит `WindStation/ESP32_DevKit_V1_30pin`.

### 5.3 Аудит нетлиста против firmware (главная верификация)
Сверить экспортированный нетлист (`export_netlist`) с таблицей §3. Контрольные точки:
- [ ] GPIO34 ↔ `SPEED_ADC`, и в этой сети ровно {R12.2, R2.1, C3.1, ESP32.12}; `SPEED_MID` = ровно {R1.2, R12.1}
- [ ] GPIO35 ↔ `DIR_ADC` {R13.2, R4.1, C4.1, ESP32.11}; `DIR_MID` = ровно {R3.2, R13.1}
- [ ] GPIO32 ↔ `BAT_ADC` {R5.2, R6.1, C5.1, ESP32.10}
- [ ] GPIO26/27/14/25/33 → R7/R8/R9/R10/R11 → D3/D4/D5/D6/D7 → GND (порядок цвет↔GPIO как в §3)
- [ ] делители: верх = 10k(R1/R3)+5k(R12/R13) последовательно со стороны сигнала (сумма 15k), низ 10k к GND (НЕ наоборот — инвариант №2); mid-узел (SPEED_MID/DIR_MID) несёт ровно эти два резистора, ничего больше
- [ ] делитель батареи 100k/100k от `TP_B+` (после PTC), не от RAIL
- [ ] VIN ← `LOAD_RAIL` (после тумблера), не напрямую RAIL
- [ ] diode-OR: D1.K и D2.K оба в `RAIL_4V7`; аноды раздельно (ADAPTER_5V / BOOST2_OUT)
- [ ] 🔴 **защита не обойдена:** `PACK_MINUS` = ровно {BT1−, BT2−, U1.4}, и `U1.4` **не** в `GND`; `U1.6` (OUT−) — в `GND`. Если экспорт нетлиста показал `B−` и `OUT−` в одной сети — сборка запрещена, DW01A обойдён (см. §3). Проверяется скриптом, а не глазами: сети валидны обе, ошибка только в модели — ERC/DRC её не ловят

### 5.4 DRC (после разводки/размещения)
- **Критерий: 0 нарушений.** Класс сетей `POWER` (RAIL/LOAD/VBAT/V12/GND) — ширина дорожки ≥ 0.8 мм (токи до ~0.8A пик WiFi + датчик).
- Инструмент: `mcp__kicad-mcp__run_drc`.

### 5.5 Кросс-чек BOM
- `export_bom` → количества совпадают с `bom-photos.md`: R 220×5, R 10k×4, R 5k×2, R 100k×2, C 100nF×4 (C2–C5), C 1000µF×1, D_Schottky×2, LED×5, 18650×2, и модули U1–U4.
- Расхождение → ошибка в схеме либо в BOM, разобрать.

### 5.6 Санити-чек питания (расчёт, не измерение)
- Подтвердить, что архитектура даёт RAIL 4.6–4.8V в обоих режимах и автономию ~20 ч (как в `wind-station-assembly.md` §«PWR LED и автономность»). Это документная сверка, не блокирует ERC/DRC.

---

## 6. Открытые пункты — сверить с реальными деталями (Pass 2)
1. **ESP32 межрядное расстояние** футпринта = 22.86 мм (0.9″). Замерить штангенциркулем реальный модуль; если 1.0″ — сдвинуть пады 16–30 на X=25.4.
2. **F1 PPTC** — реальный шаг ножек жёлтого дискового PPTC (обычно 5.08 мм) против `Fuse_Bourns_MF-RG400`.
3. **BT1/BT2** холдер — дешёвый, не Keystone; габарит/контакты сверить, при необходимости нарисовать свой футпринт.

---

## 7. План Pass 2 (создание проекта) — порядок и инструменты

> Выполняется **только при закрытом KiCad**. Старый проект `kicad/` сначала **архивируется** в `archive/kicad_v1/` (не удаляется безвозвратно — откатываемо), затем создаётся чистый.

1. Закрыть KiCad (проверить процесс). Перенести `kicad/` → `archive/kicad_v1/`. Сохранить переиспользуемые активы (§4) в новый `kicad/`.
2. `create_project` WindStation → `kicad/`.
3. `sym-lib-table`: ESP32_DevKit, WindStation_modules, Device, Switch, Connector_Generic, power. `fp-lib-table`: WindStation + глобальные.
4. Создать 4 подлиста + root, разместить 33 компонента (§1), развести по нетлисту (§3), проставить hier-метки (§4) и `PWR_FLAG` (§5.1).
5. Назначить футпринты (§1).
6. **ERC** → чинить до 0 ошибок (§5.1).
7. Аудит нетлиста против §3/§5.3.
8. Annotate → `Update PCB from Schematic`.
9. Контур платы под перфоплату 90×60, разместить, (опц.) развести; класс POWER ≥0.8мм.
10. **DRC** → 0 (§5.4).
11. Экспорт: `export_schematic_pdf`, `export_bom` (кросс-чек §5.5), `export_netlist`.

Прогресс ведём в `tasks/09-kicad-project.md`.
