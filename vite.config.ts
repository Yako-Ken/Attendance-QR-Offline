import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * Production code is fully bundled: no CDN scripts, no CDN stylesheets, no remote fonts,
 * no remote images, no runtime network calls. The service worker precaches the whole
 * build output so the app shell and every route works with the network disabled.
 */
export default defineConfig({
  base: './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: null,
      includeAssets: ['favicon.svg', 'apple-touch-icon.png', 'mask-icon.svg'],
      manifest: {
        id: '/',
        name: 'Attendance QR — تسجيل الحضور',
        short_name: 'Attendance QR',
        description:
          'Offline-first QR attendance for universities. Students carry a QR pass; teaching assistants record attendance by scanning it. All data stays on this device.',
        lang: 'en',
        dir: 'ltr',
        start_url: './index.html',
        scope: './',
        display: 'standalone',
        orientation: 'any',
        background_color: '#0f1115',
        theme_color: '#0f1115',
        categories: ['education', 'productivity', 'utilities'],
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: 'icons/maskable-192.png', sizes: '192x192', type: 'image/png', purpose: 'maskable' },
          { src: 'icons/maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        globPatterns: ['**/*.{js,css,html,svg,png,ico,webmanifest,woff2}'],
        // Everything needed for the attendance workflow must be available offline.
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
        clientsClaim: true,
        skipWaiting: true,
        maximumFileSizeToCacheInBytes: 4 * 1024 * 1024,
        // Camera frames and QR payloads are never cached: they are runtime-only data.
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ request }) => request.destination === 'font',
            handler: 'CacheFirst',
            options: {
              cacheName: 'app-fonts',
              expiration: { maxEntries: 8, maxAgeSeconds: 60 * 60 * 24 * 365 },
            },
          },
        ],
      },
      devOptions: {
        enabled: false,
      },
    }),
  ],
  build: {
    target: 'es2022',
    cssTarget: 'chrome111',
    sourcemap: false,
    reportCompressedSize: true,
    /**
     * Every rebuild must start from an empty folder. Vite's hashed file names mean
     * a leftover asset is never referenced again, yet the service worker
     * precaches whatever it finds in the output, so stale files would be shipped
     * to every user and cached forever.
     */
    emptyOutDir: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined
          if (id.includes('jsqr')) return 'decoder'
          if (id.includes('react')) return 'react'
          return 'vendor'
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: false,
  },
})