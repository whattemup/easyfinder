import { createHmac } from "crypto";

const SECRET = process.env.HMAC_SECRET ?? "dev-secret";

export function signToken(payload: string): string {
  return createHmac("sha256", SECRET).update(payload).digest("hex");
}

export function verifyToken(payload: string, token: string): boolean {
  const expected = signToken(payload);
  // Constant-time compare
  if (expected.length !== token.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) {
    mismatch |= expected.charCodeAt(i) ^ token.charCodeAt(i);
  }
  return mismatch === 0;
}

// CLI smoke test: node verifyHmac.ts <payload> <token>
if (process.argv[2] && process.argv[3]) {
  const ok = verifyToken(process.argv[2], process.argv[3]);
  console.log(ok ? "✅ VALID" : "❌ INVALID");
}
