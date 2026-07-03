import type { DataSetLookup } from "../../lookup.js";
import type { Column, DataSet, TypedDataSet } from "../../types.js";
import { ColumnType } from "../../types.js";
import { toTypedDataSet } from "../../conversion.js";
import { DataSetError } from "../../errors.js";

interface ServerQueryResponse {
  readonly columns: readonly { readonly id: string; readonly name: string; readonly type: string }[];
  readonly rows: readonly (readonly (string | null)[])[];
}

function mapColumnType(type: string): ColumnType {
  switch (type) {
    case "NUMBER": return ColumnType.NUMBER;
    case "DATE": return ColumnType.DATE;
    case "TEXT": return ColumnType.TEXT;
    default: return ColumnType.LABEL;
  }
}

function toDataSet(response: ServerQueryResponse): DataSet {
  const columns: Column[] = response.columns.map(c => ({
    id: c.id as Column["id"],
    name: c.name,
    type: mapColumnType(c.type),
  }));
  return { columns, data: response.rows };
}

export class ServerQueryClient {
  constructor(
    private readonly endpoint: string,
    private readonly fetchFn: typeof globalThis.fetch,
    private readonly tokenFn?: () => string | null,
  ) {}

  async query(lookup: DataSetLookup): Promise<TypedDataSet> {
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    const token = this.tokenFn?.();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }

    let response: Response;
    try {
      response = await this.fetchFn(this.endpoint, {
        method: "POST",
        headers,
        body: JSON.stringify(lookup),
      });
    } catch (e) {
      throw new DataSetError(
        "FETCH_FAILED",
        `Server query failed for "${String(lookup.dataSetId)}": ${e instanceof Error ? e.message : String(e)}`,
        e,
      );
    }

    if (response.status === 401) {
      if (typeof document !== "undefined") {
        document.dispatchEvent(new CustomEvent("pages-auth-expired"));
      }
      throw new DataSetError("FETCH_FAILED", "Authentication expired");
    }

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      throw new DataSetError(
        "FETCH_FAILED",
        `Server query failed for "${String(lookup.dataSetId)}": HTTP ${String(response.status)} ${text}`,
      );
    }

    const body = await response.json() as ServerQueryResponse;
    return toTypedDataSet(toDataSet(body));
  }
}
