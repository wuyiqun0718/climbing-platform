import { reactive } from 'vue';

/** 一次确认框的内容；文案和原来 uni.showModal 的 title / content 一样 */
export interface AskOptions {
  title: string;
  content?: string;
  amount?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  /** 贴底弹出，支付用 */
  bottom?: boolean;
}

/** 当前开着的确认框；页面里放一个 AskSheet 来显示它（小程序里 App.vue 没有模板，只能每页放） */
export const askState = reactive<{ open: boolean; opts: AskOptions; resolve: ((ok: boolean) => void) | null }>({
  open: false,
  opts: { title: '' },
  resolve: null,
});

/** 弹确认框，点确认得 true，取消或被下一个确认框顶掉得 false */
export function ask(opts: AskOptions): Promise<boolean> {
  askState.resolve?.(false);
  return new Promise(resolve => {
    askState.opts = opts;
    askState.resolve = resolve;
    askState.open = true;
  });
}

export function answer(ok: boolean) {
  const r = askState.resolve;
  askState.resolve = null;
  askState.open = false;
  r?.(ok);
}
