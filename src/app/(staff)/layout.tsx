import Link from "next/link";
import { logout } from "@/app/login/actions";
import { PendingBadge } from "@/components/PendingBadge";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

/** Redirección de comodidad. El control real se repite en cada handler y acción (D5). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  await requireRoleOrRedirect(STAFF);
  const simulator = process.env.SIMULATOR_ENABLED === "true";
  return (
    <div className="min-h-screen">
      <header className="border-b border-stone-200 bg-white">
        <nav className="mx-auto flex max-w-5xl items-center gap-6 px-4 py-3">
          <span className="font-bold text-red-800">Carnik</span>
          <Link href="/admin/orders" className="text-sm hover:underline">Pedidos</Link>
          <PendingBadge />
          <Link href="/dashboard" className="text-sm hover:underline">Cola de armado</Link>
          <Link href="/admin/products" className="text-sm hover:underline">Catálogo</Link>
          {simulator && <Link href="/simulator" className="text-sm hover:underline">Simulador WhatsApp</Link>}
          <form action={logout} className="ml-auto">
            <button className="text-sm text-stone-500 hover:underline">Salir</button>
          </form>
        </nav>
      </header>
      <main className="mx-auto max-w-5xl px-4 py-6">{children}</main>
    </div>
  );
}
