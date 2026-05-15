import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  build: {
    chunkSizeWarningLimit: 600,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/web-ifc')) return 'vendor-ifc';
          if (id.includes('node_modules/three')) return 'vendor-three';
          if (id.includes('node_modules/@react-three')) return 'vendor-r3f';
          if (id.includes('node_modules/react-dom') || id.includes('node_modules/react/')) return 'vendor-react';
        },
      },
    },
  },
})
