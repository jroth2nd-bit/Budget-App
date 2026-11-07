import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const cloud = process.env.TEST_TRACKER_CLOUD === '1';

export default defineConfig({
  plugins: [react()],
  envPrefix: 'TEST_ONLY_',
  define: cloud ? {
    'import.meta.env.VITE_SUPABASE_URL': JSON.stringify('http://127.0.0.1:5190'),
    'import.meta.env.VITE_SUPABASE_KEY': JSON.stringify('test-public-key'),
  } : {},
});
