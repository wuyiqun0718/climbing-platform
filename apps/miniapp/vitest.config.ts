import { defineConfig } from 'vitest/config';

// 单独的配置，不加载 vite.config.ts 里的 uni 插件；测试只覆盖不依赖 uni 的代码（比如 src/mock）
export default defineConfig({
  test: { include: ['src/**/*.test.ts'] },
});
