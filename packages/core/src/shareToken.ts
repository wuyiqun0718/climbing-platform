/**
 * 分享链接里的 token（docs/mvp-plan.md 4、5.4）：小程序分享出去的路径只带 token，不带分享 id。
 * 拿到 token 就能领，所以必须猜不出来：后端用密码学安全的随机数生成 16 字节（128 位），编码成 base64url（22 个字符）。
 * 不能用自增 id、时间戳或 Math.random 拼。
 */
export const SHARE_TOKEN_BYTES = 16;

const ALPHABET = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const TOKEN_LENGTH = Math.ceil((SHARE_TOKEN_BYTES * 8) / 6);
const TOKEN_RE = new RegExp(`^[A-Za-z0-9_-]{${TOKEN_LENGTH}}$`);

/** randomBytes 要给密码学安全的随机数：后端用 node:crypto 的 randomBytes，浏览器用 crypto.getRandomValues */
export function newShareToken(randomBytes: (n: number) => Uint8Array): string {
  const bytes = randomBytes(SHARE_TOKEN_BYTES);
  if (bytes.length !== SHARE_TOKEN_BYTES) throw new Error(`分享 token 要 ${SHARE_TOKEN_BYTES} 字节随机数`);
  let bits = 0;
  let acc = 0;
  let out = '';
  for (const b of bytes) {
    acc = (acc << 8) | b;
    bits += 8;
    while (bits >= 6) {
      bits -= 6;
      out += ALPHABET[(acc >> bits) & 63];
    }
  }
  if (bits > 0) out += ALPHABET[(acc << (6 - bits)) & 63];
  return out;
}

/** 格式对不对：领取页拿到的 token 先过一遍，不对的不用去查 */
export const isShareToken = (t: unknown): t is string => typeof t === 'string' && TOKEN_RE.test(t);
