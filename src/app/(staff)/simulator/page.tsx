import { notFound } from "next/navigation";
import { SimulatorForm } from "@/components/SimulatorForm";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

export default async function SimulatorPage() {
  if (process.env.SIMULATOR_ENABLED !== "true") notFound();
  await requireRoleOrRedirect(STAFF);
  return (
    <section className="max-w-2xl space-y-4">
      <div>
        <h1 className="text-xl font-bold">Simulador de WhatsApp</h1>
        <p className="text-sm text-stone-500">
          Escribí como lo haría un cliente. El mensaje entra por la misma función que usará el webhook de Meta.
        </p>
      </div>
      <SimulatorForm />
    </section>
  );
}
