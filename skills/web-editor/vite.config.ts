import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Career-Wiki-Skill Web Editor — Vite 配置
const apiPort = Number(process.env.CAREER_WIKI_API_PORT || '3001');
if (!Number.isInteger(apiPort) || apiPort < 1 || apiPort > 65535) {
  throw new Error('CAREER_WIKI_API_PORT must be a valid TCP port');
}
const apiUrl = `http://127.0.0.1:${apiPort}`;

export default defineConfig({
  plugins: [react()],
  define: { 'import.meta.env.VITE_API_URL': JSON.stringify('') },
  server: {
    host: '127.0.0.1',
    port: 5173,
    cors: false,
    proxy: {
      // 将 /api 请求代理到 resume-generator 的 API server
      // 开发时前端跑在 5173，API server 跑在 3001
      '/api': {
        target: apiUrl,
        // Preserve the editor's Host and Origin so the API can compare them.
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
