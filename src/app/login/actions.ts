"use server";

import { verify } from "@node-rs/argon2";
import { redirect } from "next/navigation";
import { z } from "zod";
import { db } from "@/lib/db";
import { getSession, SESSION_TTL_SECONDS } from "@/lib/auth/session";

const LoginSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(256),
});

export type LoginState = { error?: string };

export async function login(_prev: LoginState, formData: FormData): Promise<LoginState> {
  const parsed = LoginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  const genericError = { error: "Email o contraseña incorrectos" };
  if (!parsed.success) return genericError;

  const user = await db.user.findUnique({ where: { email: parsed.data.email } });
  if (!user || !(await verify(user.passwordHash, parsed.data.password))) return genericError;

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
