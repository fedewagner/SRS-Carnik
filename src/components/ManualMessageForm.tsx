"use client";

import { useActionState, useState, startTransition } from "react";
import { sendManualMessageAction, type MessageActionState } from "@/app/(staff)/admin/orders/[id]/actions";
import { MANUAL_MESSAGE_MAX } from "@/lib/validation/messaging";

/**
 * Mensaje libre al cliente desde el detalle (US-12). El texto sólo se borra si se entregó,
 * para no perderlo ante un rechazo o un fallo del canal. El límite real lo aplica el servidor.
 */
export function ManualMessageForm({ orderId }: { orderId: string }) {
  const [text, setText] = useState("");
  const [state, action, pending] = useActionState<MessageActionState, FormData>(async (prev, formData) => {
    const result = await sendManualMessageAction(prev, formData);
    if (result.sent) setText("");
    return result;
  }, {});

  return (
    <form
      // Sin el reseteo automático de <form action>: el texto se conserva si el envío falla.
      onSubmit={(e) => {
        e.preventDefault();
        const formData = new FormData(e.currentTarget);
        startTransition(() => action(formData));
      }}
      className="mt-4 space-y-2 border-t border-stone-200 pt-3 text-sm"
    >
      <input type="hidden" name="orderId" value={orderId} />
      <label htmlFor="manual-message" className="font-medium">Escribir al cliente</label>
      <textarea
        id="manual-message"
        name="body"
        rows={3}
        maxLength={MANUAL_MESSAGE_MAX}
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="Por ejemplo: del entrecot me quedan 1,5 kg, ¿te sirve?"
        className="w-full rounded border border-stone-300 px-2 py-1"
      />
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={pending} className="rounded bg-red-800 px-3 py-1 text-white disabled:opacity-50">
          {pending ? "Enviando…" : "Enviar al cliente"}
        </button>
        <span className="text-xs text-stone-500">{text.length}/{MANUAL_MESSAGE_MAX}</span>
        {state.error && <span role="status" className="text-red-700">{state.error}</span>}
      </div>
    </form>
  );
}
