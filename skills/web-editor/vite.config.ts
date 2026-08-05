import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Career-Wiki-Skill Web Editor — Vite 配置
const apiUrl = process.env.VITE_API_URL || 'http://localhost:3001';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    fs: {
      // 允许访问共享规则模块（skills/resume-generator/scripts/resume-rules.mjs）
      allow: ['..'],
    },
    proxy: {
      // 将 /api 请求代理到 resume-generator 的 API server
      // 开发时前端跑在 5173，API server 跑在 3001
      '/api': {
        target: apiUrl,
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: 'dist',
    sourcemap: true,
  },
});
