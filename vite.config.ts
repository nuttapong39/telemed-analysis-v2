/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { ViteMcp } from 'vite-plugin-mcp'
import path from 'path'

export default defineConfig({
  plugins: [react(), tailwindcss(), ViteMcp()],
  define: {
    'import.meta.env.BMS_SESSION_ID': JSON.stringify(process.env.BMS_SESSION_ID || ''),
  },
  server: {
    host: '0.0.0.0',
  },
  // `vite preview` ignores `server.host`, so bind it explicitly too — otherwise
  // it listens on loopback only and is unreachable from outside the container.
  preview: {
    host: '0.0.0.0',
    port: 4173,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  build: {
    rolldownOptions: {
      output: {
        // Keep the chart and table libraries out of the dashboard chunk: they
        // change rarely, so they cache across deploys, and the dashboard chunk
        // stays under the 500 kB warning limit. React gets its own, higher-
        // priority group; otherwise it is captured as a recharts dependency and
        // the login screen would preload the whole chart library.
        codeSplitting: {
          groups: [
            {
              name: 'vendor-react',
              test: /node_modules[\\/](react|react-dom|scheduler|clsx)[\\/]/,
              priority: 20,
            },
            {
              name: 'vendor-charts',
              test: /node_modules[\\/](recharts|d3-[^\\/]+|victory-vendor)[\\/]/,
              priority: 10,
            },
            { name: 'vendor-table', test: /node_modules[\\/]@tanstack[\\/]/, priority: 10 },
          ],
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./tests/setup.ts'],
    include: [
      'tests/unit/**/*.test.{ts,tsx}',
      'tests/component/**/*.test.{ts,tsx}',
      'tests/integration/**/*.test.{ts,tsx}',
      'tests/api/**/*.test.{ts,tsx}',
    ],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      include: ['src/**/*.{ts,tsx}'],
      exclude: ['src/main.tsx', 'src/vite-env.d.ts', 'src/components/ui/**'],
      thresholds: {
        statements: 80,
        branches: 80,
        functions: 80,
        lines: 80,
      },
    },
  },
})
