const STYLES = {
  DRAFT: { label: "Borrador", pill: "bg-amber-50 text-amber-800 ring-amber-200", dot: "bg-amber-500" },
  CONFIRMED: { label: "Confirmado", pill: "bg-emerald-50 text-emerald-800 ring-emerald-200", dot: "bg-emerald-500" },
};

export function StatusBadge({ status }: { status: "DRAFT" | "CONFIRMED" }) {
  const s = STYLES[status];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 ring-inset ${s.pill}`}>
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${s.dot}`} />
      {s.label}
    </span>
  );
}
