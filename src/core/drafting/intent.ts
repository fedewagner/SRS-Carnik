import type { Intent } from "./schema";

function normalize(text: string): string {
  return text
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const REPEAT_EXPLICIT =
  /\b(lo de siempre|lo mismo|lo de la ultima vez|como la ultima vez|igual que la (ultima|vez pasada)|repet\w* (el|mi)? ?(ultimo|pedido))\b/;
const AFFIRMATIVE = /^(si|dale|ok|okey|okay|de una|perfecto|claro|bueno|va|si,? (por favor|porfa|dale|gracias))[\s!.]*$/;
const QUESTION_START = /^(que|cuando|donde|cuanto|cuantos|como|a que hora|abren|tienen|tenes|hay|hacen|venden)\b/;

/** Intención derivada sin red, para el intérprete por reglas (C1). */
export function intentByRules(text: string, lineCount: number): Intent {
  const t = normalize(text);
  if (REPEAT_EXPLICIT.test(t)) return "REPEAT_LAST";
  if (lineCount > 0) return "ORDER";
  if (t.includes("?") || QUESTION_START.test(t.replace(/^[¿¡]/, ""))) return "QUESTION";
  return "GREETING";
}

/** Respuesta afirmativa breve; sólo cuenta como repetición tras la sugerencia (C4). */
export function isShortAffirmative(text: string): boolean {
  return AFFIRMATIVE.test(normalize(text).replace(/^[¡]/, ""));
}
