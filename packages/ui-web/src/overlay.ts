/** 弹窗和提示的纯逻辑，组件用，单独拿出来好测 */

/**
 * 打开的弹窗按顺序入栈，Esc 只关最上面那个（比如详情弹窗里再点「撤销」）。
 * 模块级单例，所有 Modal 共用。
 */
export function createModalStack() {
  const ids: number[] = [];
  let seq = 0;
  return {
    open(): number {
      const id = ++seq;
      ids.push(id);
      return id;
    },
    close(id: number) {
      const i = ids.indexOf(id);
      if (i >= 0) ids.splice(i, 1);
    },
    isTop(id: number): boolean {
      return ids.length > 0 && ids[ids.length - 1] === id;
    },
    get size() {
      return ids.length;
    },
  };
}

export const modalStack = createModalStack();

/** Tab 在弹窗里循环：返回下一个要聚焦的下标；current = -1 表示焦点不在弹窗里 */
export function nextFocusIndex(current: number, count: number, shift: boolean): number {
  if (count <= 0) return -1;
  if (current < 0) return shift ? count - 1 : 0;
  return shift ? (current - 1 + count) % count : (current + 1) % count;
}

export const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

/** 填原因的校验。上限是占位值，等馆方/后端定 */
export const REASON_MAX_LENGTH = 200;

export function reasonError(reason: string, required = true): string {
  const r = reason.trim();
  if (required && !r) return '请填写原因';
  if (r.length > REASON_MAX_LENGTH) return `原因最多 ${REASON_MAX_LENGTH} 个字`;
  return '';
}

/**
 * 接口报错转成给人看的文字：先用后端返回的 data.message（ApiError 带的），
 * 再用 Error.message，都没有给个兜底。这里不引 @climb/api，按形状判断。
 */
export function errorText(e: unknown, fallback = '操作失败，请重试'): string {
  const data = (e as { data?: { message?: unknown } } | null)?.data;
  if (typeof data?.message === 'string' && data.message) return data.message;
  if (e instanceof Error && e.message) return e.message;
  if (typeof e === 'string' && e) return e;
  return fallback;
}
