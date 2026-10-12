/// <reference types="vite/client" />

declare module '*.vue' {
  import type { DefineComponent } from 'vue';
  const component: DefineComponent<object, object, unknown>;
  export default component;
}

/** 当前打包的岩馆配置，由 vite.config.ts 根据 GYM 指向 gyms/<GYM> */
declare module '@gym' {
  import type { GymConfig } from '@climb/core';
  const gym: GymConfig;
  export default gym;
}

interface ImportMetaEnv {
  readonly VITE_API_BASE?: string;
}
