export function StatusBadge({ status }: { status: "DRAFT" | "CONFIRMED" }) {
  return status === "DRAFT" ? (
    <span className="rounded bg-amber-100 px-2 py-0.5 text-amber-800">Borrador</span>
  ) : (
    <span className="rounded bg-green-100 px-2 py-0.5 text-green-800">Confirmado</span>
  );
}
