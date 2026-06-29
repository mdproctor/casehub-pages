import type { TypedDataSet } from "../types.js";
import type { ExternalColumnDef } from "./types.js";
import type { PresetRegistry } from "./types.js";
import { extractDataSet } from "./extraction.js";

/**
 * Evaluate a JSONata expression as a row generator (no input data).
 *
 * This is used for content + expression + accumulate datasets with refreshTime,
 * where the expression generates new rows on each timer interval.
 *
 * @param expression - JSONata expression to evaluate
 * @param columns - Optional explicit column definitions
 * @param presetRegistry - Registry for preset expressions
 * @returns Promise resolving to a TypedDataSet with the generated rows
 */
export async function evaluateGenerator(
  expression: string,
  columns: readonly ExternalColumnDef[] | undefined,
  presetRegistry: PresetRegistry,
): Promise<TypedDataSet> {
  const def: import("./types.js").ExternalDataSetDef = {
    uuid: "" as never, // Not used in extraction
    expression,
    ...(columns !== undefined && { columns }),
  };
  const result = await extractDataSet(
    {
      data: null,
    },
    def,
    presetRegistry,
  );
  return result.dataset;
}
