import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'path'
import fs from 'node:fs'

// TEMPLAR SOC front-end — TWO standalone builds from one repo:
//   npm run build →  player-dist/  (deploy to soc.templar.as)
//                    admin-dist/   (deploy to admin.templar.as)
// Each output is a self-contained static site: index.html + assets/.
// The target is selected by --mode (see package.json):
//   vite build --mode player   /   vite build --mode admin
//
// `base: './'` keeps asset paths relative so either folder can be served
// from any host / sub-path / reverse proxy.
export default defineConfig(({ mode }) => {
  const isAdmin = mode === 'admin'
  const outDir = isAdmin ? 'admin-dist' : 'player-dist'
  const entry = isAdmin ? 'admin.html' : 'index.html'

  return {
    base: './',
    plugins: [
      react(),
      // The admin entry file is admin.html; emit it as index.html so the
      // folder is a drop-in static-site root just like the player build.
      isAdmin && {
        name: 'emit-admin-index',
        closeBundle() {
          const from = resolve(__dirname, outDir, 'admin.html')
          const to = resolve(__dirname, outDir, 'index.html')
          if (fs.existsSync(from)) fs.renameSync(from, to)
        },
      },
    ].filter(Boolean),
    server: {
      port: 5173,
      host: true,
    },
    build: {
      outDir,
      emptyOutDir: true,
      sourcemap: false,
      rollupOptions: {
        input: resolve(__dirname, entry),
      },
    },
  }
})
