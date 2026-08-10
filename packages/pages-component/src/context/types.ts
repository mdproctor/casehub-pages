export interface RuntimeContext {
  readonly filter: Record<string, readonly string[]>;
  readonly datasets: Record<string, DataSetSnapshot>;
  readonly page: { readonly name: string; readonly path: string };
  readonly params: Record<string, string>;
  readonly row?: Record<string, unknown>;
  readonly selection: Readonly<Record<string, Record<string, unknown>>>;
}

export interface DataSetSnapshot {
  readonly rowCount: number;
  readonly columns: readonly string[];
  readonly first?: Record<string, string | number | null>;
}

export type EscapeMode = "html" | "markdown" | "url" | "none";

export const EMPTY_CONTEXT: RuntimeContext = {
  filter: {},
  datasets: {},
  page: { name: "", path: "" },
  params: {},
  selection: {},
};
