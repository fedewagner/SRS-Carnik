"use client";

import Link from "next/link";
import { useState } from "react";

type DraftItem = {
  id: string;
  product: { name: string; unit: "WEIGHT_KG" | "PIECE" } | null;
  rawText: string;
  quantity: string;
  lineTotalCents: number;
  hasStockWarning: boolean;
};
type Response = {
  order: { id: string; reference: string; draftedBy: string; totalCents: number; items: DraftItem[] } | null;
  appendedToOrderId?: string;
  reply?: string;
  message?: string;
};

const chf = (cents: number) => `CHF ${(cents / 100).toFixed(2)}`;

export function SimulatorForm() {
  const [phone, setPhone] = useState("+41791234567");
  const [name, setName] = useState("Anna Muster");
  const [text, setText] = useState("Para el sábado quiero 2 kg de entrecot y 6 salchichas");
  const [pending, setPending] = useState(false);
  const [result, setResult] = useState<Response | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setPending(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/simulator/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phoneE164: phone, profileName: name || undefined, text }),
      });
      const body = await res.json();
      if (!res.ok) setError(body.message ?? "Error al enviar");
      else setResult(body);
    } catch {
      setError("Sin conexión");
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="space-y-4">
      <form onSubmit={send} className="card space-y-4 p-5">
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="field-label">
            Teléfono (E.164)
            <input value={phone} onChange={(e) => setPhone(e.target.value)} name="phoneE164"
              className="input mt-1.5 w-full py-2" />
          </label>
          <label className="field-label">
            Nombre de perfil
            <input value={name} onChange={(e) => setName(e.target.value)} name="profileName"
              className="input mt-1.5 w-full py-2" />
          </label>
        </div>
        <label className="field-label block">
          Mensaje
          <textarea value={text} onChange={(e) => setText(e.target.value)} name="text" rows={3}
            className="input mt-1.5 w-full py-2" />
        </label>
        <button disabled={pending} className="btn bg-emerald-700 px-5 py-2 text-white shadow-sm hover:bg-emerald-800">
          {pending ? "Interpretando…" : "Enviar mensaje"}
        </button>
      </form>

      {error && <p role="alert" className="alert-error">{error}</p>}

      {result?.reply && (
        <div data-testid="auto-reply" className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm">
          <p className="mb-1 font-semibold">Sin pedido. Respuesta automática enviada:</p>
          <p className="whitespace-pre-line">{result.reply}</p>
        </div>
      )}

      {result?.appendedToOrderId && (
        <p className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm">
          Este cliente ya tiene un pedido en borrador: el mensaje se sumó a su conversación.{" "}
          <Link href={`/admin/orders/${result.appendedToOrderId}`} className="font-medium text-brand-700 underline">Ver pedido</Link>
        </p>
      )}

      {result?.order && (
        <div data-testid="draft-result" className="card p-5">
          <p className="mb-2 font-semibold">
            Borrador <span className="font-mono">{result.order.reference}</span>{" "}
            <span className="text-sm font-normal text-stone-500">
              ({result.order.draftedBy === "AI" ? "AI" : "reglas"})
            </span>
          </p>
          <ul className="divide-y divide-stone-100 text-sm tabular-nums">
            {result.order.items.map((i) => (
              <li key={i.id} className="py-1.5">
                {Number(i.quantity)} {i.product?.unit === "PIECE" ? "u." : i.product ? "kg" : ""}{" "}
                {i.product?.name ?? <em className="text-amber-700">sin reconocer: “{i.rawText}”</em>} —{" "}
                {chf(i.lineTotalCents)}
                {i.hasStockWarning && <span className="ml-2 text-red-700">supera lo disponible</span>}
              </li>
            ))}
          </ul>
          <p className="mt-3 border-t border-line pt-3 text-right font-bold">Total: {chf(result.order.totalCents)}</p>
          <Link href={`/admin/orders/${result.order.id}`} className="btn-primary mt-4">
            Abrir en el backoffice →
          </Link>
        </div>
      )}
    </div>
  );
}
