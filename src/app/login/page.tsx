"use client";

import { useActionState } from "react";
import { Logo } from "@/components/Logo";
import { login, type LoginState } from "./actions";

const STEPS = [
  ["1", "El cliente escribe por WhatsApp como siempre."],
  ["2", "Carnik interpreta el mensaje y redacta el pedido."],
  ["3", "Una persona lo revisa y lo confirma."],
] as const;

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <main className="grid min-h-screen lg:grid-cols-[1.1fr_1fr]">
      <section className="relative hidden overflow-hidden bg-brand-800 p-12 text-brand-50 lg:flex lg:flex-col lg:justify-between">
        <div aria-hidden className="absolute -top-32 -right-32 h-96 w-96 rounded-full bg-brand-700/60 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-brand-900/70 blur-3xl" />
        <span className="relative font-display text-2xl font-semibold text-white">Carnik</span>
        <div className="relative max-w-md">
          <h2 className="font-display text-4xl leading-tight font-semibold text-white">
            Los pedidos de WhatsApp, listos para el mostrador.
          </h2>
          <ol className="mt-8 space-y-4">
            {STEPS.map(([n, text]) => (
              <li key={n} className="flex items-start gap-3 text-brand-100">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-white/15 text-xs font-semibold text-white">{n}</span>
                {text}
              </li>
            ))}
          </ol>
        </div>
        <p className="relative text-xs text-brand-200">Redactado por AI · confirmado por una persona</p>
      </section>

      <section className="flex items-center justify-center px-4 py-12">
        <form action={action} className="w-full max-w-sm space-y-5">
          <div className="space-y-3">
            <Logo size="lg" />
            <p className="text-sm text-stone-500">Ingresá al backoffice de pedidos.</p>
          </div>
          <label className="block space-y-1.5">
            <span className="field-label">Email</span>
            <input name="email" type="email" required autoComplete="username" className="input w-full py-2" />
          </label>
          <label className="block space-y-1.5">
            <span className="field-label">Contraseña</span>
            <input name="password" type="password" required autoComplete="current-password" className="input w-full py-2" />
          </label>
          {state.error && <p role="alert" className="alert-error">{state.error}</p>}
          <button disabled={pending} className="btn-primary btn-lg w-full">
            {pending ? "Entrando…" : "Entrar"}
          </button>
        </form>
      </section>
    </main>
  );
}
