"use server";

import { hash, verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { clearFailures, isLocked, recordFailure } from "@/lib/auth/loginThrottle";
import { getSession, SESSION_TTL_SECONDS } from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export type LoginState = { error?: string };

// Hash señuelo: un email inexistente cuesta lo mismo que uno real y el tiempo no lo delata.
let decoyHash: Promise<string> | undefined;
const decoy = () => (decoyHash ??= hash("carnik-decoy-password"));

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const genericError = { error: "Email o contraseña incorrectos" };
  if (!parsed.success) return genericError;
  const { email, password } = parsed.data;
  if (isLocked(email)) return { error: "Demasiados intentos fallidos. Esperá 15 minutos y probá de nuevo." };

  const user = await db.user.findUnique({ where: { email } });
  const valid = await verify(user?.passwordHash ?? (await decoy()), password);
  if (!user || !valid) {
    recordFailure(email);
    return genericError;
  }
  clearFailures(email);

  const session = await getSession();
  session.userId = user.id;
  session.role = user.role;
  session.expiresAt = Date.now() + SESSION_TTL_SECONDS * 1000;
  await session.save();
  redirect("/admin/orders");
}

export async function logout() {
  const session = await getSession();
  session.destroy();
  redirect("/login");
}
