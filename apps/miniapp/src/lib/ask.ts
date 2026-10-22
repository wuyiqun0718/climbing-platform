import { reactive } from 'vue';

/** 一次弹层的内容；文案和原来 uni.showModal 的 title / content 一样 */
export interface AskOptions {
  title: string;
  content?: string;
  amount?: string;
  confirmText?: string;
  cancelText?: string;
  showCancel?: boolean;
  /** 贴底弹出，支付用 */
  bottom?: boolean;
  /** 有值时是一组选项（替代 uni.showActionSheet），点哪项就关 */
  options?: string[];
  /** 有值时带一个输入框（替代 uni.showModal 的 editable） */
  placeholder?: string;
}

/** 关掉弹层时的结果：ok 是点了确认或某个选项；index 是选项序号，value 是输入的内容 */
interface AskResult { ok: boolean; index: number; value: string }

/** 当前开着的弹层；页面里放一个 AskSheet 来显示它（小程序里 App.vue 没有模板，只能每页放） */
export const askState = reactive<{ open: boolean; opts: AskOptions; value: string; resolve: ((r: AskResult) => void) | null }>({
  open: false,
  opts: { title: '' },
  value: '',
  resolve: null,
});

const CANCELLED: AskResult = { ok: false, index: -1, value: '' };

function show(opts: AskOptions): Promise<AskResult> {
  askState.resolve?.(CANCELLED);
  return new Promise(resolve => {
    askState.opts = opts;
    askState.value = '';
    askState.resolve = resolve;
    askState.open = true;
  });
}

/** 弹确认框，点确认得 true，取消或被下一个弹层顶掉得 false */
export const ask = (opts: AskOptions) => show(opts).then(r => r.ok);

/** 从底部弹一组选项，得到选中的序号；取消得 -1 */
export const choose = (title: string, options: string[]) =>
  show({ title, options, bottom: true, showCancel: true }).then(r => r.index);

/** 弹一个输入框，确认得到输入的内容（可以是空串），取消得 null */
export const prompt = (title: string, placeholder: string) =>
  show({ title, placeholder }).then(r => (r.ok ? r.value : null));

/** 关掉弹层：确认（index 是点的选项，没有选项为 -1）或取消 */
export function answer(ok: boolean, index = -1) {
  const r = askState.resolve;
  askState.resolve = null;
  askState.open = false;
  r?.(ok ? { ok, index, value: askState.value } : CANCELLED);
}
