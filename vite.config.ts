import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  // Served from the root of asenameservice.xyz. Set BASE_PATH to host under a subpath instead.
  base: process.env.BASE_PATH || '/',
  plugins: [react()],
  server: {
    port: 5173,
  },
});
