import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  build: {
    chunkSizeWarningLimit: 5000,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('plotly.js-dist-min')) return 'vendor-plotly'
          if (id.includes('vis-network')) return 'vendor-vis-network'
          if (id.includes('/node_modules/d3')) return 'vendor-d3'
          if (id.includes('/node_modules/vue') || id.includes('/node_modules/pinia')) return 'vendor-vue'
        },
      },
    },
  },
})
