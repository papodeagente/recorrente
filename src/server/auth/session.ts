import { cookies } from "next/headers";
import { jwtVerify, SignJWT } from "jose";
import { env } from "@/lib/env";

const SESSION_TTL_DAYS = 14;
const SESSION_TTL_SECONDS = SESSION_TTL_DAYS * 24 * 60 * 60;
const encoder = new TextEncoder();
const secretKey = encoder.encode(env.AUTH_SECRET);

export type SessionPayload = {
  userId: string;
  tenantId: string | null;
};

export async function signSessionToken(payload: SessionPayload): Promise<string> {
  return new SignJWT({ ...payload })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime(`${SESSION_TTL_DAYS}d`)
    .sign(secretKey);
}

export async function verifySessionToken(token: string): Promise<SessionPayload | null> {
  try {
    const { payload } = await jwtVerify(token, secretKey);
    if (typeof payload.userId !== "string") return null;
    return {
      userId: payload.userId,
      tenantId: typeof payload.tenantId === "string" ? payload.tenantId : null,
    };
  } catch {
    return null;
  }
}

/**
 * Constrói o header Set-Cookie. Use com `resHeaders.append('Set-Cookie', ...)`
 * dentro de procedures tRPC — o `cookies().set()` do next/headers só
 * funciona em Server Components / Server Actions, não em handlers que
 * retornam Response nativo (o caso do fetchRequestHandler do tRPC).
 */
export function buildSessionCookie(token: string): string {
  // Secure só quando APP_URL é HTTPS. Browser/curl rejeitam cookie Secure
  // em conexão HTTP, então fixar por APP_URL é mais robusto que por NODE_ENV
  // (dev local: http, staging sslip.io: http, prod com domínio real: https).
  const secure = env.APP_URL.startsWith("https://") ? "; Secure" : "";
  return `${env.SESSION_COOKIE_NAME}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${SESSION_TTL_SECONDS}${secure}`;
}

export function buildClearSessionCookie(): string {
  return `${env.SESSION_COOKIE_NAME}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0`;
}

/** Leitura do cookie via next/headers — funciona em layouts/pages/RSC. */
export async function getSessionFromCookies(): Promise<SessionPayload | null> {
  const token = cookies().get(env.SESSION_COOKIE_NAME)?.value;
  if (!token) return null;
  return verifySessionToken(token);
}
