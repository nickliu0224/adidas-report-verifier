import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  build: {
    rollupOptions: {
      external: [
        'react',
        'react/jsx-runtime',
        'react-dom',
        'react-dom/client',
        'firebase/app',
        'firebase/auth',
        'firebase/firestore',
        'firebase/analytics'
      ]
    }
  }
});