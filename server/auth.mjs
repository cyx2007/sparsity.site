import { createHmac, randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const derive = promisify(scrypt);
const lifetime = 12 * 60 * 60;
const hashOptions = { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
export async function hashPassword(password) {
  if (password.length < 16 || password.length > 256)
    throw new Error('Password must contain 16–256 characters.');
  const salt = randomBytes(16).toString('hex');
  const key = await derive(password, salt, 64, hashOptions);
  return `scrypt:${salt}:${key.toString('hex')}`;
}
export async function verifyPassword(password, hash) {
  if (typeof password !== 'string' || password.length > 256) return false;
  const [, salt, expected] = hash.split(':');
  const actual = await derive(password, salt, 64, hashOptions);
  return timingSafeEqual(actual, Buffer.from(expected, 'hex'));
}
const cookieName = (config) =>
  config.secure ? '__Host-sparsity_session' : 'sparsity_session';
function signature(payload, config) {
  return createHmac('sha256', config.sessionSecret)
    .update(`${config.username}\0${config.passwordHash}\0${payload}`)
    .digest('hex');
}
export function sessionCookie(config, now = Date.now()) {
  const payload = `${Math.floor(now / 1000) + lifetime}.${randomBytes(16).toString('hex')}`;
  return `${cookieName(config)}=${payload}.${signature(payload, config)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${lifetime}${config.secure ? '; Secure' : ''}`;
}
export function clearSessionCookie(config) {
  return `${cookieName(config)}=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0${config.secure ? '; Secure' : ''}`;
}
export function sessionIdentity(headers, config, now = Date.now()) {
  const cookies = (headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim());
  const values = cookies.filter((part) =>
    part.startsWith(`${cookieName(config)}=`),
  );
  if (values.length !== 1) return null;
  const token = values[0].slice(cookieName(config).length + 1);
  if (!/^\d{10}\.[a-f0-9]{32}\.[a-f0-9]{64}$/.test(token)) return null;
  const [expiry, nonce, mac] = token.split('.');
  const seconds = Math.floor(now / 1000);
  if (Number(expiry) <= seconds || Number(expiry) > seconds + lifetime)
    return null;
  const expected = signature(`${expiry}.${nonce}`, config);
  return timingSafeEqual(Buffer.from(mac, 'hex'), Buffer.from(expected, 'hex'))
    ? `local:${config.username}`
    : null;
}
export function safeReturnTo(value) {
  return /^\/admin(?:\/|\?|$)/.test(value || '') && !/[\\\r\n]/.test(value)
    ? value
    : '/admin';
}

export function loginPage(returnTo, failed = false) {
  const target = safeReturnTo(returnTo)
    .replaceAll('&', '&amp;')
    .replaceAll('"', '&quot;')
    .replaceAll('<', '&lt;');
  return `<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>登录 · 稀疏札记</title><style>body{font:16px/1.7 system-ui;margin:0;background:#f8f7f4;color:#272521}main{max-width:360px;margin:12vh auto;padding:24px}h1{font-size:26px}label{display:block;margin-top:18px}input,button{box-sizing:border-box;width:100%;padding:12px;font:inherit;border:1px solid #777;border-radius:4px}button{margin-top:24px;background:#272521;color:white;cursor:pointer}a{color:inherit}.error{color:#a22}</style><main><h1>稀疏札记</h1><p>使用管理员账号登录。</p>${failed ? '<p class="error" role="alert">账号或密码错误，请重试。</p>' : ''}<form method="post" action="/auth/login"><input type="hidden" name="return_to" value="${target}"><label for="username">账号</label><input id="username" name="username" autocomplete="username" required maxlength="64"><label for="password">密码</label><input id="password" name="password" type="password" autocomplete="current-password" required maxlength="256"><button type="submit">登录</button></form><p><a href="/">返回网站</a></p></main></html>`;
}

export function createLoginLimiter(now = Date.now) {
  // Single-owner, single-process deployment: bound global work before expensive
  // password hashing. Client-supplied forwarding/IP headers cannot bypass it.
  let attempts = 0;
  let resetAt = 0;
  return () => {
    if (now() >= resetAt) {
      attempts = 0;
      resetAt = now() + 5 * 60_000;
    }
    return ++attempts <= 10;
  };
}
