import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))


// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@awesome.me/kit-KIT_CODE/icons': path.resolve(
        __dirname,
        'src/icons/fa-kit.js'
      )
    }
  },
})
