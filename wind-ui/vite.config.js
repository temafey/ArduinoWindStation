import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // Дев-сервер слушает все интерфейсы — дашборд можно открыть с телефона/планшета
  // по IP ноутбука (vite печатает адрес «Network» при старте).
  server: { host: true },
  resolve: {
    // wind-dashboard.jsx лежит уровнем выше корня wind-ui; начиная с vite 8.2
    // rolldown резолвит его импорты от самого файла и не находит react в корне
    // репозитория. dedupe принудительно берёт эти пакеты из node_modules wind-ui.
    dedupe: ['react', 'react-dom'],
  },
})
