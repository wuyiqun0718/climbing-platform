import { fileURLToPath } from 'node:url';
import vue from '@vitejs/plugin-vue';
import { defineConfig } from 'vite';

// GYM 决定打包哪个岩馆：代码里 import gym from '@gym' 拿到的就是 gyms/<GYM> 的配置
const gym = process.env.GYM || 'benchmark';

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@gym': fileURLToPath(new URL(`../../gyms/${gym}/src/index.ts`, import.meta.url)),
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: { port: 5174 },
  build: { outDir: `dist/${gym}`, emptyOutDir: true },
});
