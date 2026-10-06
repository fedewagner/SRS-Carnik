import { notFound } from "next/navigation";
import { SimulatorForm } from "@/components/SimulatorForm";
import { requireRoleOrRedirect, STAFF } from "@/lib/auth/guard";

export default async function SimulatorPage() {
  if (process.env.SIMULATOR_ENABLED !== "true") notFound();
  await requireRoleOrRedirect(STAFF);
  return (
    <section className="max-w-2xl space-y-6">
      <div>
        <h1 className="page-title">Simulador de WhatsApp</h1>
        <p className="page-subtitle">
          Escribí como lo haría un cliente. El mensaje entra por la misma función que el webhook de WhatsApp (Twilio).
        </p>
      </div>
      <SimulatorForm />
    </section>
  );
}
