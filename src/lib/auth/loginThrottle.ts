/**
 * Freno a la fuerza bruta del login: tras MAX_FAILURES fallos para un mismo email, se rechaza
 * cualquier intento hasta que pase la ventana. Vive en memoria: Railway corre una instancia,
 * y un reinicio sólo concede unos intentos más. Quien conozca un email puede bloquearlo
 * temporalmente; se acepta a cambio de no depender de la IP, que el proxy puede falsear.
 */
export const MAX_FAILURES = 5;
export const WINDOW_MS = 15 * 60 * 1000;

type Entry = { failures: number; resetAt: number };
const attempts = new Map<string, Entry>();

export function isLocked(email: string, now = Date.now()): boolean {
  const entry = attempts.get(email);
  if (!entry) return false;
  if (entry.resetAt <= now) {
    attempts.delete(email);
    return false;
  }
  return entry.failures >= MAX_FAILURES;
}

export function recordFailure(email: string, now = Date.now()): void {
  const entry = attempts.get(email);
  if (!entry || entry.resetAt <= now) attempts.set(email, { failures: 1, resetAt: now + WINDOW_MS });
  else entry.failures += 1;
}

export function clearFailures(email: string): void {
  attempts.delete(email);
}
