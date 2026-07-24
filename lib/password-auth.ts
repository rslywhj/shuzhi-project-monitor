import { env } from "cloudflare:workers";

// Cloudflare Workers Web Crypto currently caps PBKDF2 at 100,000 iterations.
const PASSWORD_ITERATIONS = 100_000;
const SESSION_COOKIE = "shuzhi_session";
const SESSION_LIFETIME_SECONDS = 8 * 60 * 60;

type SessionPayload = {
  v: 1;
  email: string;
  exp: number;
};

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function textBytes(value: string) {
  return new TextEncoder().encode(value);
}

function sessionSecret() {
  const secret = String(
    (env as unknown as Record<string, unknown>).APP_SESSION_SECRET ?? "",
  );
  if (secret.length < 32) {
    throw new Error("APP_SESSION_SECRET must contain at least 32 characters.");
  }
  return secret;
}

async function derivePassword(
  password: string,
  salt: Uint8Array,
  iterations: number,
) {
  const key = await crypto.subtle.importKey(
    "raw",
    textBytes(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: new Uint8Array(salt).buffer,
      iterations,
    },
    key,
    256,
  );
  return new Uint8Array(bits);
}

export function validatePassword(password: string) {
  if (password.length < 12 || password.length > 128) {
    return "密码长度必须为12–128个字符。";
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    return "密码必须同时包含字母和数字。";
  }
  return null;
}

export async function hashPassword(password: string) {
  const validationError = validatePassword(password);
  if (validationError) throw new Error(validationError);
  const salt = crypto.getRandomValues(new Uint8Array(16));
  const hash = await derivePassword(password, salt, PASSWORD_ITERATIONS);
  return {
    passwordHash: bytesToBase64Url(hash),
    passwordSalt: bytesToBase64Url(salt),
    passwordIterations: PASSWORD_ITERATIONS,
    passwordChangedAt: new Date().toISOString(),
  };
}

export async function verifyPassword(
  password: string,
  storedHash: string,
  storedSalt: string,
  iterations: number,
) {
  const actual = await derivePassword(
    password,
    base64UrlToBytes(storedSalt),
    iterations,
  );
  const expected = base64UrlToBytes(storedHash);
  if (actual.length !== expected.length) return false;
  let difference = 0;
  for (let index = 0; index < actual.length; index += 1) {
    difference |= actual[index] ^ expected[index];
  }
  return difference === 0;
}

async function signingKey() {
  return crypto.subtle.importKey(
    "raw",
    textBytes(sessionSecret()),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );
}

export async function createSessionToken(email: string) {
  const payload: SessionPayload = {
    v: 1,
    email: email.trim().toLowerCase(),
    exp: Math.floor(Date.now() / 1000) + SESSION_LIFETIME_SECONDS,
  };
  const encodedPayload = bytesToBase64Url(
    textBytes(JSON.stringify(payload)),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await signingKey(),
    textBytes(encodedPayload),
  );
  return `${encodedPayload}.${bytesToBase64Url(new Uint8Array(signature))}`;
}

export async function verifySessionToken(token: string) {
  const [encodedPayload, encodedSignature, extra] = token.split(".");
  if (!encodedPayload || !encodedSignature || extra) return null;
  const valid = await crypto.subtle.verify(
    "HMAC",
    await signingKey(),
    base64UrlToBytes(encodedSignature),
    textBytes(encodedPayload),
  );
  if (!valid) return null;
  try {
    const payload = JSON.parse(
      new TextDecoder().decode(base64UrlToBytes(encodedPayload)),
    ) as SessionPayload;
    if (
      payload.v !== 1 ||
      typeof payload.email !== "string" ||
      payload.exp <= Math.floor(Date.now() / 1000)
    ) {
      return null;
    }
    return payload;
  } catch {
    return null;
  }
}

function cookieValue(request: Request, name: string) {
  const cookie = request.headers.get("cookie") ?? "";
  for (const part of cookie.split(";")) {
    const [key, ...value] = part.trim().split("=");
    if (key === name) return value.join("=");
  }
  return "";
}

export async function sessionEmail(request: Request) {
  const token = cookieValue(request, SESSION_COOKIE);
  if (!token) return "";
  try {
    return (await verifySessionToken(token))?.email ?? "";
  } catch {
    return "";
  }
}

export function sessionCookie(token: string) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${SESSION_LIFETIME_SECONDS}`;
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}
