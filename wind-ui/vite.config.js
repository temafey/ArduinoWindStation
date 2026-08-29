import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Дев-сервер слушает все интерфейсы — дашборд можно открыть с телефона/планшета
  // по IP ноутбука (vite печатает адрес «Network» при старте).
  server: { host: true },
  // Две сборки из одного кода, и разница ровно в одном.
  //
  // Обычная (для платы) режет бандл на части: тяжёлые вкладки приезжают
  // отдельными запросами, и первый экран открывается вдвое быстрее — на
  // слабом радиоканале это решает всё.
  //
  // Сборка WIND_SINGLE=1 склеивает всё обратно в один файл: публичная копия
  // живёт вшитой в одну страницу и подгружать соседние файлы не может в
  // принципе. Без этого её вкладки просто не открывались бы.
  build: process.env.WIND_SINGLE
    ? { outDir: 'dist-single', rollupOptions: { output: { inlineDynamicImports: true } } }
    : {},
  resolve: {
    // wind-dashboard.jsx лежит уровнем выше корня wind-ui; начиная с vite 8.2
    // rolldown резолвит его импорты от самого файла и не находит react в корне
    // репозитория. dedupe принудительно берёт эти пакеты из node_modules wind-ui.
    dedupe: ['react', 'react-dom'],
  },
})
