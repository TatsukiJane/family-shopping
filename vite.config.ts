import { fileURLToPath, URL } from 'node:url'
import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { VitePWA } from 'vite-plugin-pwa'

// На GitHub Pages сайт живёт по пути /<repo>/. BASE_PATH задаётся в workflow
// деплоя, чтобы имя репозитория не было зашито в код.
//
// База одна для dev, preview и сборки: если в preview отдавать с корня,
// собранная страница ищет ассеты по /<repo>/ и получает SPA-фолбэк вместо
// sw.js и манифеста — PWA молча перестаёт устанавливаться. Локально запускать
// с корня можно через BASE_PATH=/.
const basePath = process.env.BASE_PATH ?? '/family-shopping/'

export default defineConfig(() => ({
  base: basePath,
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['favicon.svg', 'apple-touch-icon.png'],
      manifest: {
        name: 'Семейный список покупок',
        short_name: 'Список',
        description: 'Общий список покупок для семьи',
        lang: 'ru',
        dir: 'ltr',
        display: 'standalone',
        orientation: 'portrait',
        background_color: '#ffffff',
        theme_color: '#0f172a',
        icons: [
          { src: 'pwa-192x192.png', sizes: '192x192', type: 'image/png' },
          { src: 'pwa-512x512.png', sizes: '512x512', type: 'image/png' },
          {
            src: 'maskable-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'maskable',
          },
        ],
      },
      workbox: {
        // Кэшируется только оболочка приложения. Данные идут через IndexedDB
        // и Contents API — runtimeCaching намеренно пуст, иначе Service Worker
        // начнёт отдавать протухший sha и каждый PUT будет ловить 409.
        globPatterns: ['**/*.{js,css,html,svg,png,ico,woff2}'],
        navigateFallback: 'index.html',
        runtimeCaching: [],
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  test: {
    environment: 'jsdom',
    globals: true,
    // Вне src: setup тянет node:crypto, а типы приложения — браузерные.
    setupFiles: ['./test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
}))
