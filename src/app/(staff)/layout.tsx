import Link from "next/link";
import { logout } from "@/app/login/actions";
import { Logo } from "@/components/Logo";
import { NavLink } from "@/components/NavLink";
import { PendingBadge } from "@/components/PendingBadge";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

/** Redirección de comodidad. El control real se repite en cada handler y acción (D5). */
export default async function StaffLayout({ children }: { children: React.ReactNode }) {
  const user = await requireRoleOrRedirect(STAFF);
  const simulator = process.env.SIMULATOR_ENABLED === "true";
  return (
    <div className="min-h-screen">
      <header className="sticky top-0 z-10 border-b border-line bg-white/85 backdrop-blur">
        <nav className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-2 gap-y-2 px-4 py-2.5 sm:px-6">
          <Link href="/admin/orders" aria-label="Inicio" className="mr-4">
            <Logo />
          </Link>
          <NavLink href="/admin/orders">Pedidos</NavLink>
          <PendingBadge />
          <NavLink href="/dashboard">Cola de armado</NavLink>
          <NavLink href="/admin/products">Catálogo</NavLink>
          {simulator && <NavLink href="/simulator">Simulador WhatsApp</NavLink>}
          <div className="ml-auto flex items-center gap-3">
            <span className="hidden rounded-full bg-stone-100 px-2.5 py-0.5 text-xs font-medium text-stone-600 md:inline">
              {user.role === "ADMIN" ? "Administración" : "Mostrador"}
            </span>
            <form action={logout}>
              <button className="rounded-lg px-3 py-1.5 text-sm text-stone-500 transition-colors hover:bg-stone-100 hover:text-stone-900">
                Salir
              </button>
            </form>
          </div>
        </nav>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6">{children}</main>
    </div>
  );
}
