import { AssemblyQueue } from "@/components/AssemblyQueue";
import { getAssemblyQueue } from "@/core/orders/assemblyQueue";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

export const dynamic = "force-dynamic";

/** Pantalla del obrador: pedidos confirmados hoy, sin acciones ni datos de contacto (US-13). */
export default async function DashboardPage() {
  await requireRoleOrRedirect(STAFF);
  const queue = await getAssemblyQueue();
  return (
    <section>
      <h1 className="page-title">Cola de armado</h1>
      <p className="page-subtitle mb-6">Pedidos confirmados hoy, del más antiguo al más reciente.</p>
      <AssemblyQueue initial={queue} />
    </section>
  );
}
