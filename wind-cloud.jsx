// ============================================================
// ОБЛАЧНЫЙ КАНАЛ — ФАСАД ДЛЯ ДАШБОРДА
// ============================================================
// Единственная точка, через которую дашборд знает об MQTT. Транспорт
// (wind-cloud-mqtt.js) и буфер воспроизведения (wind-cloud-playback.js) о
// дашборде не знают вовсе, а дашборд не знает ни про пакеты, ни про топики.
//
// ⛔ import.meta.env.VITE_* читается ТОЛЬКО в файлах wind-cloud*. Vite
// подставляет эти значения ЛИТЕРАЛОМ в тот модуль, где они написаны, — одна
// такая строка в wind-dashboard.jsx увезла бы адрес брокера и логин зрителя
// в entry-чанк, то есть во флеш платы и в публичный репозиторий, при
// полностью исправном фильтре чанков. Это главный будущий регресс этой
// работы, и держится он ровно одним правилом: параметры сюда НЕ передаются
// снаружи, они берутся здесь.

import { openMqtt } from './wind-cloud-mqtt.js'
import { createPlayback } from './wind-cloud-playback.js'

const ENV = import.meta.env

const DEF_URL = ENV.VITE_MQTT_VIEWER_URL || ''
const DEF_USER = ENV.VITE_MQTT_VIEWER_USER || ''
const DEF_PASSWORD = ENV.VITE_MQTT_VIEWER_PASSWORD || ''
const DEF_STATION = ENV.VITE_MQTT_STATION_ID || ''

// Попала ли в сборку учётка зрителя. Дашборд по этому флагу решает, показывать
// ли вообще облачный источник: собранная без .env копия не должна предлагать
// кнопку, которая заведомо ничего не сделает.
export const CLOUD_CONFIGURED = Boolean(DEF_URL && DEF_USER && DEF_PASSWORD && DEF_STATION)

// ⛔ Таймаут — на СОЕДИНЕНИЕ С БРОКЕРОМ, а не на приход кадра. state и status
// у станции retained: если она хоть раз в жизни выходила на связь, они
// приезжают за доли секунды после SUBACK. А первый живой кадр может ждать
// 25–45 с холодного старта платы — таймаут на кадр объявил бы поломкой
// совершенно штатный запуск.
const CONNECT_TIMEOUT_MS = 10000

// Сколько молчания живого канала считать «протухло». Отсчитывается только
// ПОСЛЕ первого живого кадра: до него молчание означает «станция ещё не
// проснулась», а не «что-то сломалось».
const STALE_MS = 15000
const STALE_TICK_MS = 2000

function parse (text) {
  try {
    return JSON.parse(text)
  } catch {
    // Мусор в топике — не повод рушить дашборд. Станция пишет туда одна,
    // так что это либо обрезанный пакет, либо чей-то ручной эксперимент.
    return null
  }
}

// Подключается к брокеру и отдаёт наверх разобранные сообщения станции.
//
// Возвращает объект с сеттерами колбэков и close(). Сеттеры, а не колбэки в
// аргументах, — чтобы дашборд мог подписаться уже после вызова connect() и
// не городить порядок инициализации.
export function connect (opts = {}) {
  const url = opts.url || DEF_URL
  const user = opts.user || DEF_USER
  const password = opts.password || DEF_PASSWORD
  const stationId = opts.stationId || DEF_STATION
  const base = 'wind/' + stationId + '/'

  let cbState = () => {}
  let cbStatus = () => {}
  let cbLive = () => {}
  let cbPhase = () => {}

  let phase = ''
  let detail = ''
  let closed = false
  let subscribed = false
  let gotAnything = false
  let firstLiveAt = 0
  let lastLiveAt = 0
  let online = null

  function setPhase (p, d) {
    const text = d || ''
    if (p === phase && text === detail) return
    phase = p
    detail = text
    cbPhase(p, text)
  }

  const play = createPlayback({
    motionOff: Boolean(opts.motionOff),
    emit: (frame) => cbLive(frame),
  })

  // Таймаут соединения. Снимается по SUBACK — то есть по факту «брокер нас
  // принял И подписка принята», а не по открытию сокета: открытый сокет без
  // подписки не даёт ничего.
  let connTimer = setTimeout(() => {
    connTimer = null
    if (!subscribed) {
      setPhase('failed', 'брокер не ответил за ' + Math.round(CONNECT_TIMEOUT_MS / 1000) +
        ' с — попытки продолжаются')
    }
  }, CONNECT_TIMEOUT_MS)

  const staleTimer = setInterval(() => {
    if (!firstLiveAt || online === false || phase === 'failed') return
    if (Date.now() - lastLiveAt > STALE_MS) {
      setPhase('stale', 'станция молчит дольше ' + Math.round(STALE_MS / 1000) + ' с')
    }
  }, STALE_TICK_MS)

  setPhase('connecting', 'подключение к брокеру')

  const mqtt = openMqtt({
    url,
    user,
    password,
    // Три конкретных топика, а не wind/<id>/#. Маска притащила бы ещё cmd, ack
    // и hist — трафик, который оплачивается из десяти гигабайт мобильного
    // тарифа станции, и который зрителю не нужен ни в одном сценарии.
    topics: [base + 'live', base + 'state', base + 'status'],
    onUp: (codes) => {
      subscribed = true
      if (connTimer) {
        clearTimeout(connTimer)
        connTimer = null
      }
      const bad = codes.filter(c => c === 0x80).length
      if (bad) {
        // Частичный отказ: что-то мы всё же читаем, но сказать об этом надо —
        // молча работающий наполовину канал отлаживать не по чему.
        setPhase('connecting', 'брокер отклонил ' + bad + ' подписку из ' + codes.length +
          ' — проверьте фильтр в праве учётки зрителя')
        return
      }
      // Подписка принята, но кадров ещё нет — это именно 'connecting', и
      // отличать его от отказа обязательно: иначе поломку нечем диагностировать.
      if (!gotAnything) setPhase('connecting', 'подписка принята, ждём станцию')
    },
    onDown: (reason) => {
      play.hold()
      // Если канал уже работал — это 'stale' (данные на экране есть, просто
      // устаревают). Если не работал ни разу — мы всё ещё подключаемся.
      setPhase(gotAnything ? 'stale' : 'connecting', reason)
    },
    onFail: (reason) => setPhase('failed', reason),
    onMessage: (topic, text, retained) => {
      const json = parse(text)
      if (json === null) return
      gotAnything = true
      if (topic === base + 'live') {
        lastLiveAt = Date.now()
        if (!firstLiveAt) firstLiveAt = lastLiveAt
        play.live(json)
        if (online !== false) setPhase('live', '')
        return
      }
      if (topic === base + 'state') {
        play.state(json)
        cbState(json, { retained })
        if (online === null && !retained) setPhase('live', '')
        return
      }
      if (topic === base + 'status') {
        online = json.online === true
        play.status(json)
        cbStatus({ online }, { retained })
        if (!online) {
          // Станция офлайн, но канал жив и последний retained state на экране
          // остаётся: это последнее, что о ней достоверно известно.
          setPhase('offline', retained ? 'станция была офлайн ещё до подключения' : 'станция ушла офлайн')
        } else if (!firstLiveAt) {
          setPhase('connecting', 'станция на связи, ждём первый кадр')
        } else {
          setPhase('live', '')
        }
      }
    },
  })

  return {
    onState (fn) { cbState = fn || (() => {}) },
    onStatus (fn) { cbStatus = fn || (() => {}) },
    onLive (fn) { cbLive = fn || (() => {}) },
    onPhase (fn) {
      cbPhase = fn || (() => {})
      // Отдаём текущую фазу сразу: подписчик, пришедший после connect(),
      // иначе сидел бы с пустым экраном до первого изменения.
      if (phase) cbPhase(phase, detail)
    },
    stats () { return play.stats() },
    close () {
      if (closed) return
      closed = true
      if (connTimer) clearTimeout(connTimer)
      clearInterval(staleTimer)
      play.stop()
      mqtt.close()
    },
  }
}

// Разовая проверка канала — для кнопки «ПРОВЕРИТЬ ОБЛАКО». Подписывается
// только на status (он retained, поэтому ответ приходит сразу) и закрывается.
//
// ok говорит про КАНАЛ (брокер принял и подписку дал), online — про станцию.
// Разделение нужное: «брокер в порядке, станция мертва» и «до брокера не
// достучаться» лечатся совершенно по-разному.
export function probeStatus (opts = {}) {
  const url = opts.url || DEF_URL
  const user = opts.user || DEF_USER
  const password = opts.password || DEF_PASSWORD
  const stationId = opts.stationId || DEF_STATION
  const timeoutMs = opts.timeoutMs || CONNECT_TIMEOUT_MS
  const topic = 'wind/' + stationId + '/status'

  return new Promise((resolve) => {
    if (!url || !user || !password || !stationId) {
      resolve({ ok: false, online: null, error: 'учётка зрителя не попала в сборку' })
      return
    }
    let done = false
    let subscribed = false
    let mqtt = null
    const finish = (res) => {
      if (done) return
      done = true
      clearTimeout(timer)
      if (mqtt) mqtt.close()
      resolve(res)
    }
    const timer = setTimeout(() => {
      finish(subscribed
        // Подписка принята, retained-статуса нет — значит станция не выходила
        // на связь ни разу с момента создания топика. Канал при этом исправен.
        ? { ok: true, online: null, error: 'брокер отвечает, но статуса станции на нём нет' }
        : { ok: false, online: null, error: 'брокер не ответил за ' + Math.round(timeoutMs / 1000) + ' с' })
    }, timeoutMs)

    mqtt = openMqtt({
      url,
      user,
      password,
      topics: [topic],
      clientPrefix: 'wind-probe-',
      onUp: (codes) => {
        if (codes.every(c => c === 0x80)) {
          finish({ ok: false, online: null, error: 'брокер отклонил подписку на ' + topic })
          return
        }
        subscribed = true
      },
      onFail: (reason) => finish({ ok: false, online: null, error: reason }),
      onMessage: (t, text) => {
        const json = parse(text)
        if (t === topic && json) finish({ ok: true, online: json.online === true, error: '' })
      },
    })
  })
}
