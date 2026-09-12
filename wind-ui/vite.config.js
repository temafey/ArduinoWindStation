import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { fileURLToPath } from 'node:url'

// Сборка для артефакта claude.ai: один файл, без облака (см. ниже).
const single = Boolean(process.env.WIND_SINGLE)

// Заглушка облачного канала — абсолютным путём, потому что алиас подменяет
// импорт, написанный в файле уровнем выше корня wind-ui.
const cloudStub = fileURLToPath(new URL('../wind-cloud-stub.js', import.meta.url))

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Дев-сервер слушает все интерфейсы — дашборд можно открыть с телефона/планшета
  // по IP ноутбука (vite печатает адрес «Network» при старте).
  server: { host: true },
  // Есть ли в этой сборке облачный канал. Дашборд закрывает им динамический
  // import(): при false ветка становится мёртвым кодом и чанк не рождается
  // вовсе. Это второй, независимый от алиаса замок — см. wind-cloud-stub.js.
  define: { __WIND_CLOUD__: single ? 'false' : 'true' },
  // Две сборки из одного кода, и разница ровно в двух вещах.
  //
  // Обычная (для платы и для публичной копии) режет бандл на части: тяжёлые
  // вкладки приезжают отдельными запросами, и первый экран открывается вдвое
  // быстрее — на слабом радиоканале это решает всё. Облачный канал здесь
  // сведён в отдельный чанк с ФИКСИРОВАННЫМ именем wind-cloud: имя чанка
  // иначе было бы свойством текущего графа модулей, а не гарантией, а на это
  // имя опирается фильтр в gen_web_header.py, который не пускает учётку
  // зрителя во флеш платы.
  //
  // Сборка WIND_SINGLE=1 склеивает всё обратно в один файл: публичная копия
  // живёт вшитой в одну страницу и подгружать соседние файлы не может в
  // принципе. Без этого её вкладки просто не открывались бы. Облако из неё
  // выброшено целиком — inlineDynamicImports втянул бы его в entry вместе
  // с паролем зрителя.
  build: single
    ? { outDir: 'dist-single', rollupOptions: { output: { inlineDynamicImports: true } } }
    : {
        rollupOptions: {
          output: {
            // Именно codeSplitting, а не advancedChunks: в rolldown 1.2 второе
            // ещё работает, но печатает при каждой сборке «option is
            // deprecated». Предупреждение, которое видно всегда, перестают
            // читать — а следующее может оказаться не про стиль.
            codeSplitting: {
              groups: [
                { name: 'wind-cloud', test: /wind-cloud/, priority: 10 },
              ],
            },
          },
        },
      },
  resolve: {
    // wind-dashboard.jsx лежит уровнем выше корня wind-ui; начиная с vite 8.2
    // rolldown резолвит его импорты от самого файла и не находит react в корне
    // репозитория. dedupe принудительно берёт эти пакеты из node_modules wind-ui.
    dedupe: ['react', 'react-dom'],
    // В сборке одним файлом настоящий облачный модуль до бандлера не доходит.
    alias: single ? [{ find: './wind-cloud.jsx', replacement: cloudStub }] : [],
  },
})
