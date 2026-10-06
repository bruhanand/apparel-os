import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  // AOS_ENVIRONMENT names the environment for the seed and the screen banner (RR-193). It is the one variable of the
  // build's environment the app may read; no other is exposed.
  envPrefix: 'AOS_ENVIRONMENT',
  server: {
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
