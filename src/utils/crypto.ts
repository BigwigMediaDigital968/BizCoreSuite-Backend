import crypto from "crypto";

/**
 * AES-256-GCM for secrets stored in the database (integration API tokens).
 * The key comes from INTEGRATION_ENCRYPTION_KEY (32 bytes, base64). Generate:
 *   node -e "console.log(require('crypto').randomBytes(32).toString('base64'))"
 *
 * Without it, a key is derived from JWT_SECRET so development works out of
 * the box; rotating JWT_SECRET would then make stored tokens unreadable, so
 * set a dedicated key in production.
 */
let cachedKey: Buffer | null = null;

const getKey = (): Buffer => {
  if (cachedKey) return cachedKey;

  const configured = process.env.INTEGRATION_ENCRYPTION_KEY;
  if (configured) {
    const key = Buffer.from(configured, "base64");
    if (key.length !== 32) {
      throw new Error("INTEGRATION_ENCRYPTION_KEY must be 32 bytes, base64-encoded");
    }
    cachedKey = key;
    return key;
  }

  console.warn(
    "[crypto] INTEGRATION_ENCRYPTION_KEY is not set; deriving a key from JWT_SECRET. Set a dedicated key in production.",
  );
  cachedKey = crypto
    .createHash("sha256")
    .update(`integration:${process.env.JWT_SECRET ?? ""}`)
    .digest();
  return cachedKey;
};

/** Returns "iv.tag.ciphertext", all base64. */
export const encryptSecret = (plain: string): string => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return [iv, tag, encrypted].map((b) => b.toString("base64")).join(".");
};

export const decryptSecret = (payload: string): string => {
  const [iv, tag, data] = payload.split(".").map((p) => Buffer.from(p, "base64"));
  if (!iv || !tag || !data) throw new Error("Malformed encrypted secret");
  const decipher = crypto.createDecipheriv("aes-256-gcm", getKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
};

export const randomToken = (bytes = 32) => crypto.randomBytes(bytes).toString("hex");

/** Constant-time string comparison (for webhook secrets). */
export const safeEqual = (a: string, b: string) => {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && crypto.timingSafeEqual(left, right);
};
