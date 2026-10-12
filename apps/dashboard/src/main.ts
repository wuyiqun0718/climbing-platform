import { toCssVars } from '@climb/theme';
import gym from '@gym';
import { createApp } from 'vue';
import App from './App.vue';
import { router } from './router';
import './styles.css';

// 当前岩馆的主题挂到 :root，所有组件通过 CSS 变量取色
for (const [k, v] of Object.entries(toCssVars(gym.theme))) document.documentElement.style.setProperty(k, v);
document.title = `${gym.shortName} 门店后台`;

createApp(App).use(router).mount('#app');
