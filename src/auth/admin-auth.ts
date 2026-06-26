import { createMiddleware } from "hono/factory";

type AppBindings = {
  Bindings: Env;
};

export const adminAuth = createMiddleware<AppBindings>(async (c, next) => {
  const expected = c.env.ADMIN_API_TOKEN;
  if (!expected) {
    return c.json({ error: "ADMIN_API_TOKEN is not configured" }, 500);
  }

  const actual = extractBearerToken(c.req.header("authorization"));
  if (!actual || !timingSafeEqual(actual, expected)) {
    return c.json({ error: "Unauthorized" }, 401);
  }

  await next();
});

function extractBearerToken(header: string | undefined): string | null {
  if (!header) return null;
  const match = /^Bearer\s+(.+)$/i.exec(header.trim());
  return match?.[1] ?? null;
}

function timingSafeEqual(left: string, right: string): boolean {
  const encoder = new TextEncoder();
  const leftBytes = encoder.encode(left);
  const rightBytes = encoder.encode(right);
  const length = Math.max(leftBytes.length, rightBytes.length);
  let diff = leftBytes.length ^ rightBytes.length;

  for (let i = 0; i < length; i += 1) {
    diff |= (leftBytes[i] ?? 0) ^ (rightBytes[i] ?? 0);
  }

  return diff === 0;
}

