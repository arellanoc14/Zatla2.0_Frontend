import path from 'path'
import react from '@vitejs/plugin-react'
import { defineConfig } from 'vite'

// https://vite.dev/config/
//
// "@/" points at src/ — every import in the app relies on it. jsconfig.json
// declares the same alias for the editor; this is the build-time counterpart.
//
// The dev server runs on http://localhost:5174 (5173 is often taken by another
// Vite project on the same machine). If 5174 is busy too, Vite picks the next
// free port and prints it.
export default defineConfig(({ command }) => ({
  logLevel: command === 'build' ? 'error' : 'info', // quiet builds, but show the dev server's address
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
  },
  preview: {
    port: 4173,
  },
}));
