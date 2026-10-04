import type { UserRole } from "@prisma/client";
import { redirect } from "next/navigation";
import { getSession } from "./session";

export type AuthenticatedUser = { userId: string; role: UserRole };

export class UnauthorizedError extends Error {}

/**
 * Comprobación de rol. Se invoca como primera línea de cada route handler, server action
 * y layout protegido; nunca se delega en middleware (D5).
 */
export async function requireRole(roles: UserRole[]): Promise<AuthenticatedUser> {
  const session = await getSession();
  const valid =
    session.userId && session.role && session.expiresAt && session.expiresAt > Date.now();
  if (!valid || !roles.includes(session.role!)) throw new UnauthorizedError();
  return { userId: session.userId!, role: session.role! };
}

/** Variante para páginas: redirige al login en vez de lanzar. */
export async function requireRoleOrRedirect(roles: UserRole[]): Promise<AuthenticatedUser> {
  try {
    return await requireRole(roles);
  } catch (error) {
    if (error instanceof UnauthorizedError) redirect("/login");
    throw error;
  }
}

export const STAFF: UserRole[] = ["EMPLOYEE", "ADMIN"];
