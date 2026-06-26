// 生成 APP_MASTER_KEY_BASE64（32 字节随机密钥的 base64）。
// 用法： node scripts/gen-master-key.mjs
import { randomBytes } from "node:crypto";

const key = randomBytes(32).toString("base64");
console.log(key);
