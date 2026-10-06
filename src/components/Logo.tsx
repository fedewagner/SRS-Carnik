/** Marca de Carnik: monograma sobre bordó + nombre en la tipografía de títulos. */
export function Logo({ size = "md" }: { size?: "md" | "lg" }) {
  const box = size === "lg" ? "h-10 w-10 text-xl" : "h-8 w-8 text-base";
  const text = size === "lg" ? "text-3xl" : "text-xl";
  return (
    <span className="inline-flex items-center gap-2.5">
      <span aria-hidden className={`grid place-items-center rounded-lg bg-brand-700 font-display font-bold text-white shadow-sm ${box}`}>
        C
      </span>
      <span className={`font-display font-semibold tracking-tight text-brand-800 ${text}`}>Carnik</span>
    </span>
  );
}
