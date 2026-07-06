import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    target: 'esnext', // مطلوب لمكتبة إزالة الخلفية (تستخدم WASM/top-level await)
  },
  optimizeDeps: {
    exclude: ['@imgly/background-removal'],
  },
})
