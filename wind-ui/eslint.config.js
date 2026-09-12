import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist', 'dist-single']),
  {
    files: ['**/*.{js,jsx}'],
    extends: [
      js.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: {
        ...globals.browser,
        // Подставляется бандлером (define в vite.config.js): есть ли в этой
        // сборке облачный канал. Без объявления линтер считает его опечаткой
        // и ругается на каждый файл, который его читает.
        __WIND_CLOUD__: 'readonly',
      },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
  },
  {
    // Конфиги самого сборщика исполняет node, а не браузер: там есть process,
    // а window и document как раз нет. Без этого блока `eslint .` спотыкался
    // на process.env.WIND_SINGLE в vite.config.js — одна вечная ошибка, из-за
    // которой линтер переставали запускать вовсе.
    files: ['*.config.js'],
    languageOptions: { globals: globals.node },
  },
])
