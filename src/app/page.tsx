import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth/session";

export default async function Home() {
  const session = await getSession();
  const active = session.userId && session.expiresAt && session.expiresAt > Date.now();
  redirect(active ? "/admin/orders" : "/login");
}
