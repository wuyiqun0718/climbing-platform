import path from 'node:path';
import uni from '@dcloudio/vite-plugin-uni';
import { defineConfig } from 'vite';

// GYM 决定打包哪个岩馆：代码里 import gym from '@gym' 拿到的就是 gyms/<GYM> 的配置
const gym = process.env.GYM || 'benchmark';

export default defineConfig({
  plugins: [uni()],
  resolve: {
    alias: {
      '@gym': path.resolve(__dirname, `../../gyms/${gym}/src/index.ts`),
    },
  },
});
