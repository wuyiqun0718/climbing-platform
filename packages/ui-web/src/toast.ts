/**
 * 成功/失败提示。页面里 `const toast = useToast(); toast.success('已开卡')`，
 * App 根部放一个 <ToastHost /> 负责显示。
 */
import { reactive } from 'vue';

export type ToastKind = 'success' | 'error' | 'info';

export interface ToastItem {
  id: number;
  kind: ToastKind;
  text: string;
}

/** 自动消失的时间（毫秒）；失败的留久一点让人看清。0 = 不自动消失 */
export const TOAST_DURATION: Record<ToastKind, number> = { success: 3000, info: 3000, error: 6000 };
/** 同时最多显示几条，多了挤掉最早的 */
export const TOAST_MAX = 4;

export function createToaster(duration = TOAST_DURATION) {
  const items = reactive<ToastItem[]>([]);
  const timers = new Map<number, ReturnType<typeof setTimeout>>();
  let seq = 0;

  function dismiss(id: number) {
    const t = timers.get(id);
    if (t) clearTimeout(t);
    timers.delete(id);
    const i = items.findIndex(x => x.id === id);
    if (i >= 0) items.splice(i, 1);
  }

  function show(kind: ToastKind, text: string): number {
    const id = ++seq;
    items.push({ id, kind, text });
    while (items.length > TOAST_MAX) dismiss(items[0].id);
    const ms = duration[kind];
    if (ms > 0) timers.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }

  return {
    items: items as readonly ToastItem[],
    show,
    dismiss,
    success: (text: string) => show('success', text),
    error: (text: string) => show('error', text),
    info: (text: string) => show('info', text),
    clear() {
      for (const it of [...items]) dismiss(it.id);
    },
  };
}

export type Toaster = ReturnType<typeof createToaster>;

const toaster = createToaster();

export function useToast(): Toaster {
  return toaster;
}
