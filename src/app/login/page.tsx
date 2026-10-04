"use client";

import { useActionState } from "react";
import { login, type LoginState } from "./actions";

export default function LoginPage() {
  const [state, action, pending] = useActionState<LoginState, FormData>(login, {});
  return (
    <main className="flex min-h-screen items-center justify-center px-4">
      <form action={action} className="w-full max-w-sm space-y-4 rounded-xl bg-white p-6 shadow">
        <div>
          <h1 className="text-2xl font-bold">Carnik</h1>
          <p className="text-sm text-stone-500">Backoffice de pedidos</p>
        </div>
        <label className="block text-sm">
          Email
          <input name="email" type="email" required autoComplete="username"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </label>
        <label className="block text-sm">
          Contraseña
          <input name="password" type="password" required autoComplete="current-password"
            className="mt-1 w-full rounded border border-stone-300 px-3 py-2" />
        </label>
        {state.error && <p role="alert" className="text-sm text-red-700">{state.error}</p>}
        <button disabled={pending}
          className="w-full rounded bg-red-800 px-4 py-2 font-medium text-white disabled:opacity-60">
          {pending ? "Entrando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
