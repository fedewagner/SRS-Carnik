import { getIronSession, type SessionOptions } from "iron-session";
import { cookies } from "next/headers";
import type { UserRole } from "@prisma/client";

export type SessionData = {
  userId?: string;
  role?: UserRole;
  /** Expiración absoluta fijada al login; la actividad no la extiende (D4). */
  expiresAt?: number;
};

export const SESSION_TTL_SECONDS = 8 * 60 * 60;

function sessionOptions(): SessionOptions {
  const password = process.env.SESSION_SECRET;
  if (!password || password.length < 32) {
    throw new Error("SESSION_SECRET debe tener al menos 32 caracteres");
  }
  return {
    password,
    cookieName: "carnik_session",
    ttl: SESSION_TTL_SECONDS,
    cookieOptions: {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
    },
  };
}

export async function getSession() {
  return getIronSession<SessionData>(await cookies(), sessionOptions());
}
