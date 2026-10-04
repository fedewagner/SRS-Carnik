import { LlmOrderDrafter } from "./llm";
import { RuleBasedOrderDrafter } from "./rules";
import type { CatalogEntry, DraftResult, OrderDrafter } from "./types";

const rules = new RuleBasedOrderDrafter();

/** Selector por ORDER_DRAFTER con caída al determinista ante error, timeout o salida inválida. */
export function getOrderDrafter(): OrderDrafter {
  if (process.env.ORDER_DRAFTER !== "llm") return rules;
  const llm = new LlmOrderDrafter();
  return {
    async draft(text: string, catalog: CatalogEntry[]): Promise<DraftResult> {
      try {
        return await llm.draft(text, catalog);
      } catch (error) {
        console.warn("LlmOrderDrafter falló; se usa el determinista:", (error as Error).message);
        return rules.draft(text, catalog);
      }
    },
  };
}
