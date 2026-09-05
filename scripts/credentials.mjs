import { randomBytes } from 'node:crypto';
import { hashPassword } from '../server/auth.mjs';
const password = randomBytes(24).toString('base64url');
const hash = await hashPassword(password);
// Redirect stdout to the protected env file; plaintext is displayed only once
// on stderr and is not included in that file or the container image.
console.error(`管理员：admin\n初始密码（请存入密码管理器）：${password}`);
console.log(
  `SITE_ORIGIN=https://notes.example.com\nSITE_ACCESS=private\nADMIN_USERNAME=admin\nADMIN_PASSWORD_HASH=${hash}\nSESSION_SECRET=${randomBytes(32).toString('hex')}`,
);
