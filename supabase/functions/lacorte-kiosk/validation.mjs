export function currentBrazilDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/Sao_Paulo",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(now);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isValidBirthDate(value, today = currentBrazilDate()) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const [year, month, day] = value.split("-").map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  if (
    !Number.isFinite(parsed.getTime()) ||
    parsed.getUTCFullYear() !== year ||
    parsed.getUTCMonth() + 1 !== month ||
    parsed.getUTCDate() !== day
  ) return false;
  return value <= today;
}

export function normalizeEmail(value) {
  if (typeof value !== "string") return "";
  const email = value.trim().toLowerCase();
  return email.length <= 254 ? email : "";
}

export function isValidEmail(value) {
  const email = normalizeEmail(value);
  return Boolean(email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && !email.includes(".."));
}

export function normalizeBrazilPhone(value) {
  let digits = String(value ?? "").replace(/\D/g, "");
  if (digits.startsWith("55") && digits.length >= 12) digits = digits.slice(2);
  return [10, 11].includes(digits.length) ? "+55" + digits : "";
}

export function normalizePersonName(value) {
  return String(value ?? "").trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
}

function base64urlEncode(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64urlDecode(value) {
  if (typeof value !== "string" || !/^[A-Za-z0-9_-]+$/.test(value)) return null;
  const base = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base + "=".repeat((4 - base.length % 4) % 4);
  try {
    const binary = atob(padded);
    return Uint8Array.from(binary, (char) => char.charCodeAt(0));
  } catch {
    return null;
  }
}

export async function signCustomerClaim(userId, email, expires, secret) {
  if (!/^[0-9a-f-]{36}$/i.test(String(userId)) || !isValidEmail(email) ||
      !Number.isSafeInteger(expires) || typeof secret !== "string" || !secret) {
    throw new Error("Dados de confirmação inválidos.");
  }
  const payload = base64urlEncode(new TextEncoder().encode(JSON.stringify({
    userId: String(userId),
    email: normalizeEmail(email),
    expires,
  })));
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(payload),
  );
  return payload + "." + base64urlEncode(new Uint8Array(signature));
}

export async function verifyCustomerClaim(token, secret, now = Date.now()) {
  try {
    if (typeof token !== "string" || token.length > 1024 || typeof secret !== "string" || !secret) return null;
    const parts = token.split(".");
    if (parts.length !== 2) return null;
    const [payload, signatureText] = parts;
    const payloadBytes = base64urlDecode(payload);
    const signature = base64urlDecode(signatureText);
    if (!payloadBytes || !signature) return null;
    const key = await crypto.subtle.importKey(
      "raw",
      new TextEncoder().encode(secret),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["verify"],
    );
    const valid = await crypto.subtle.verify(
      "HMAC",
      key,
      signature,
      new TextEncoder().encode(payload),
    );
    if (!valid) return null;
    const value = JSON.parse(new TextDecoder().decode(payloadBytes));
    if (!/^[0-9a-f-]{36}$/i.test(String(value.userId || "")) ||
        !isValidEmail(value.email) ||
        !Number.isSafeInteger(value.expires) ||
        value.expires < now ||
        value.expires > now + 6 * 60 * 1000) return null;
    return { userId: String(value.userId), email: normalizeEmail(value.email) };
  } catch {
    return null;
  }
}
