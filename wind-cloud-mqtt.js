// ============================================================
// ТРАНСПОРТ ОБЛАКА: MQTT 3.1.1 ПОВЕРХ WEBSOCKET
// ============================================================
// Свой клиент вместо готовой библиотеки — решение владельца проекта, и оно
// дешевле, чем кажется. Зритель здесь ТОЛЬКО читает: подписка идёт QoS 0,
// а QoS 0 понижает доставку всего, включая retained-сообщения, которые
// станция публикует с QoS 1. Значит ни PUBACK, ни PUBREC/PUBREL, ни аллокатор
// исходящих id пакетов не нужны вовсе — от протокола остаётся CONNECT,
// SUBSCRIBE, входящий PUBLISH и пинг. Это меньше трёхсот строк против
// нескольких десятков килобайт бандла, которые уехали бы в публичную копию.
//
// Чего здесь сознательно НЕТ: публикации, QoS 1/2, сессий с сохранением
// состояния, will-сообщений. Если однажды понадобится отправлять команды —
// это отдельный код и отдельная учётка (операторская), а не расширение этого
// файла: у зрителя на брокере нет права писать, и оно не должно появиться
// по недосмотру.

const TXT = new TextEncoder()
const DEC = new TextDecoder()

// Потолок накопительного буфера. Живой кадр станции — около шестидесяти байт,
// retained state — пара килобайт; мегабайт здесь означает, что поток
// рассинхронизировался и мы разбираем мусор как длину пакета.
const MAX_ACC = 1 << 20

// Пинг раз в 30 с при keepalive 60: брокер вправе выгнать молчащего клиента
// через полтора keepalive, и один потерянный пинг не должен этого стоить.
const PING_MS = 30000

// Полуоткрытое TCP-соединение браузер не замечает: onclose не вызывается
// часами, сокет выглядит живым, кадры просто не идут. Единственный способ
// отличить «станция молчит» от «канал умер» — считать собственные PINGRESP.
const PONG_DEAD_MS = 90000

// Пауза перед переподключением. Растёт, пока попытки проваливаются подряд.
const BACKOFF = [1000, 2000, 4000, 8000, 15000, 30000]

// Сброс паузы — НЕ по CONNACK, а после десяти секунд непрерывной жизни
// соединения. Разница принципиальная: если брокер принимает подключение и
// сразу выгоняет (кончилась квота, дубль clientId, снятые права), сброс по
// CONNACK превратил бы экспоненту в ровный долбёж раз в секунду.
const STEADY_MS = 10000

// Коды возврата CONNACK, о которых имеет смысл говорить человеку.
const CONNACK_TEXT = {
  1: 'брокер не понимает MQTT 3.1.1',
  2: 'брокер отверг clientId',
  3: 'брокер недоступен',
  4: 'неверный логин или пароль зрителя',
  5: 'учётка зрителя не авторизована',
}

// Длина в MQTT — varint по 7 бит на байт. Пятый байт продолжения невозможен
// по спецификации: это уже не длина, а битый поток.
function encLen (n) {
  const out = []
  do {
    let b = n % 128
    n = Math.floor(n / 128)
    if (n > 0) b |= 0x80
    out.push(b)
  } while (n > 0)
  return Uint8Array.from(out)
}

// ⚠️ Длина строки в MQTT — В БАЙТАХ, а не в символах. Пароль с любым неascii
// символом при подсчёте по length сдвинул бы весь остаток пакета, и брокер
// оборвал бы соединение без единого слова диагностики — отлаживать такое
// снаружи нечем. Отсюда TextEncoder, а не s.length.
function encStr (s) {
  const b = TXT.encode(s)
  const out = new Uint8Array(2 + b.length)
  out[0] = (b.length >> 8) & 0xff
  out[1] = b.length & 0xff
  out.set(b, 2)
  return out
}

function join (...parts) {
  let n = 0
  for (const p of parts) n += p.length
  const out = new Uint8Array(n)
  let o = 0
  for (const p of parts) {
    out.set(p, o)
    o += p.length
  }
  return out
}

function packet (head, body) {
  return join(Uint8Array.of(head), encLen(body.length), body)
}

// Случайный хвост clientId. Без него две открытые вкладки выбивают друг друга
// по кругу: брокер обязан разорвать старое соединение с тем же clientId, то
// есть каждая вкладка убивает соседнюю и тут же переподключается. Снаружи это
// читается как плавающая сеть, а не как ошибка в коде.
function randomTail () {
  const a = new Uint8Array(4)
  crypto.getRandomValues(a)
  return Array.from(a, b => b.toString(16).padStart(2, '0')).join('')
}

// Поднимает и держит одно подключение к брокеру, подписанное на переданные
// топики. Возвращает { close }.
//
// onMessage(topic, text, retained) — входящий PUBLISH. Флаг retained отдаётся
//   наружу намеренно: он отличает снимок, пролежавший на брокере до нашего
//   подключения, от свежего кадра, и от этого зависит вся логика меток
//   времени в дашборде.
// onUp(codes)    — SUBACK принят, codes — коды по каждому фильтру.
// onDown(reason) — соединение потеряно, переподключение запланировано.
// onFail(reason) — дальше пробовать бессмысленно, попытки прекращены.
export function openMqtt (opts) {
  const url = opts.url
  const topics = opts.topics
  const onMessage = opts.onMessage || (() => {})
  const onUp = opts.onUp || (() => {})
  const onDown = opts.onDown || (() => {})
  const onFail = opts.onFail || (() => {})
  const clientId = (opts.clientPrefix || 'wind-ui-') + randomTail()

  let ws = null
  let acc = new Uint8Array(0)
  let attempt = 0
  let retryTimer = null
  let steadyTimer = null
  let pingTimer = null
  let lastPongAt = 0
  let stopped = false

  function send (u8) {
    if (ws && ws.readyState === 1) ws.send(u8)
  }

  function teardown () {
    if (steadyTimer) clearTimeout(steadyTimer)
    if (pingTimer) clearInterval(pingTimer)
    if (retryTimer) clearTimeout(retryTimer)
    steadyTimer = pingTimer = retryTimer = null
    if (ws) {
      // Снимаем обработчики ДО close(): иначе наш же close прилетит обратно
      // как onclose и запустит второе переподключение поверх первого.
      ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null
      try {
        ws.close()
      } catch {
        // сокет уже мёртв — закрывать нечего
      }
      ws = null
    }
    acc = new Uint8Array(0)
  }

  function fail (reason) {
    if (stopped) return
    stopped = true
    teardown()
    onFail(reason)
  }

  function drop (reason) {
    if (stopped) return
    teardown()
    const base = BACKOFF[Math.min(attempt, BACKOFF.length - 1)]
    attempt++
    // Джиттер ±20 %: несколько вкладок, потерявших сеть одновременно, иначе
    // вернулись бы к брокеру одной толпой.
    const wait = Math.round(base * (0.8 + Math.random() * 0.4))
    onDown(reason)
    if (stopped) return
    retryTimer = setTimeout(open, wait)
  }

  function handle (head, body) {
    const type = head >> 4
    if (type === 2) {
      // CONNACK
      const rc = body.length > 1 ? body[1] : 0xff
      if (rc === 0) {
        lastPongAt = Date.now()
        steadyTimer = setTimeout(() => { attempt = 0 }, STEADY_MS)
        pingTimer = setInterval(tick, PING_MS)
        subscribe()
        return
      }
      const text = CONNACK_TEXT[rc] || ('код ' + rc)
      // 4 и 5 — это логин и права. Переподключение их не чинит, а учётка
      // зрителя уезжает в бандл: молотить брокер её паролем бессмысленно.
      if (rc === 4 || rc === 5) fail('брокер отказал: ' + text)
      else drop('брокер отказал: ' + text)
    } else if (type === 9) {
      // SUBACK. Разбираем явно, потому что отказ здесь ТИХИЙ: брокер отвечает
      // кодом 0x80 по конкретному фильтру, соединение остаётся живым, и
      // готовые библиотеки такое молча глотают. Снаружи это выглядит как
      // «станция просто молчит» — самая дорогая для отладки поломка из всех.
      const codes = Array.from(body.subarray(2))
      if (codes.length && codes.every(c => c === 0x80)) {
        fail(
          'брокер отклонил ВСЕ подписки (SUBACK 0x80). Имена топиков тут почти ' +
          'ни при чём: скорее всего строка фильтра в праве учётки зрителя на ' +
          'брокере не совпадает с wind/<id>/… — например, в неё буквально уехал ' +
          'плейсхолдер в угловых скобках вместо идентификатора станции.'
        )
        return
      }
      onUp(codes)
    } else if (type === 3) {
      // PUBLISH
      if (body.length < 2) return
      const tlen = (body[0] << 8) | body[1]
      let off = 2 + tlen
      // Подписка идёт QoS 0, поэтому сюда всё приходит нулевым QoS и id пакета
      // в теле нет. Разбор оставлен на случай, если брокер однажды отдаст
      // сообщение выше нулём: пропустить два байта дешевле, чем отдать наверх
      // payload со сдвигом. Подтверждать такое сообщение мы всё равно не
      // станем — клиента-читателя это не касается.
      if (((head >> 1) & 3) > 0) off += 2
      if (off > body.length) return
      onMessage(
        DEC.decode(body.subarray(2, 2 + tlen)),
        DEC.decode(body.subarray(off)),
        (head & 1) === 1
      )
    } else if (type === 13) {
      // PINGRESP
      lastPongAt = Date.now()
    }
  }

  // ⛔ Границы WebSocket-сообщений и границы MQTT-пакетов не связаны никак:
  // одно onmessage может принести половину пакета, ровно один пакет или пять
  // подряд. Отсюда накопительный буфер и этот цикл — разбирать каждое
  // onmessage как отдельный пакет значит работать ровно до первой нагрузки.
  function drain () {
    const sock = ws
    let off = 0
    while (off < acc.length) {
      let i = off + 1
      let mult = 1
      let rem = 0
      let more = true
      let n = 0
      while (more) {
        if (i >= acc.length) {
          i = -1
          break
        }
        const d = acc[i++]
        rem += (d & 127) * mult
        mult *= 128
        more = (d & 0x80) !== 0
        if (++n > 4) {
          fail('битый поток: длина пакета длиннее четырёх байт')
          return
        }
      }
      if (i < 0) break                      // varint ещё не дочитан
      if (acc.length - i < rem) break        // тело ещё не дочитано
      handle(acc[off], acc.subarray(i, i + rem))
      // handle мог порвать соединение (фатальный SUBACK, отказ CONNACK) —
      // тогда acc уже чужой, и резать его по старым смещениям нельзя.
      if (stopped || ws !== sock) return
      off = i + rem
    }
    // subarray, а не slice: хвост режется без копирования, а оставшийся кусок
    // всё равно доживёт лишь до следующего onmessage.
    if (off) acc = acc.subarray(off)
  }

  function subscribe () {
    // id пакета фиксированный: за одно соединение уходит ровно один SUBSCRIBE,
    // а публикаций у зрителя нет вовсе — аллокатор id здесь был бы кодом ради
    // кода.
    const parts = [Uint8Array.of(0, 1)]
    for (const t of topics) parts.push(encStr(t), Uint8Array.of(0))
    // ⚠️ Младшие четыре бита фиксированного заголовка SUBSCRIBE обязаны быть
    // 0x02. Это не «зарезервировано», а требование протокола: при любом другом
    // значении брокер обязан закрыть соединение — молча и сразу.
    send(packet(0x82, join(...parts)))
  }

  function tick () {
    if (Date.now() - lastPongAt > PONG_DEAD_MS) {
      drop('брокер не ответил на пинг за ' + Math.round(PONG_DEAD_MS / 1000) + ' с')
      return
    }
    send(Uint8Array.of(0xc0, 0x00))
  }

  function open () {
    retryTimer = null
    if (stopped) return
    acc = new Uint8Array(0)
    let sock
    try {
      // Подпротокол 'mqtt' обязателен: без него брокер завершает рукопожатие
      // WebSocket и тут же закрывает соединение, не сказав почему.
      sock = new WebSocket(url, 'mqtt')
    } catch (e) {
      drop('не удалось открыть WebSocket: ' + e.message)
      return
    }
    ws = sock
    // ⚠️ binaryType выставляется ДО назначения onmessage. По умолчанию он
    // 'blob', и тогда ev.data — объект Blob, из которого new Uint8Array(...)
    // делает пустой массив. Классический вид отказа: «подключились, ничего
    // не приходит», при полностью исправном канале.
    sock.binaryType = 'arraybuffer'
    sock.onmessage = (ev) => {
      if (ws !== sock) return
      const chunk = new Uint8Array(ev.data)
      if (acc.length + chunk.length > MAX_ACC) {
        drop('накопитель перерос мегабайт — поток рассинхронизирован')
        return
      }
      acc = acc.length ? join(acc, chunk) : chunk
      drain()
    }
    sock.onopen = () => {
      if (ws !== sock) return
      // Флаги 0xC2 = имя пользователя + пароль + чистая сессия. Чистая
      // намеренно: зритель не хочет, чтобы брокер копил для него очередь,
      // пока вкладка закрыта — накопленные кадры ветра всё равно протухли.
      const vh = join(encStr('MQTT'), Uint8Array.of(0x04, 0xc2, 0x00, 0x3c))
      const pl = join(encStr(clientId), encStr(opts.user), encStr(opts.password))
      send(packet(0x10, join(vh, pl)))
    }
    sock.onclose = () => {
      if (ws !== sock) return
      drop('соединение с брокером закрыто')
    }
    sock.onerror = () => {
      // onerror в браузере не несёт ни кода, ни текста — за ним всегда придёт
      // onclose, там и переподключимся.
    }
  }

  // Обе подсказки — про мобильные браузеры, где фоновой вкладке таймеры
  // замораживают: вернувшийся пользователь должен увидеть данные сразу, а не
  // через оставшиеся полминуты паузы.
  function kick () {
    if (stopped || !retryTimer) return
    clearTimeout(retryTimer)
    retryTimer = null
    open()
  }
  const onVisible = () => {
    if (document.visibilityState === 'visible') kick()
  }
  document.addEventListener('visibilitychange', onVisible)
  window.addEventListener('online', kick)

  open()

  return {
    close () {
      if (!stopped && ws && ws.readyState === 1) {
        // Штатный DISCONNECT: брокер тогда не считает обрыв аварией и не
        // держит сессию. Отправляем ДО teardown, иначе сокет уже закрыт.
        try {
          ws.send(Uint8Array.of(0xe0, 0x00))
        } catch {
          // сокет уже мёртв — прощаться не с кем
        }
      }
      stopped = true
      teardown()
      document.removeEventListener('visibilitychange', onVisible)
      window.removeEventListener('online', kick)
    },
  }
}
