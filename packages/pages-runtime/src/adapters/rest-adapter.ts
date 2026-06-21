import type { SaveAdapter, SaveResult } from "../save-adapter.js";
import type { DataSetId } from "@casehub/pages-data/dist/dataset/types.js";

export interface RestAdapterConfig {
  readonly method?: "PUT" | "PATCH" | "POST";
  readonly headers?: Readonly<Record<string, string>>;
}

export function createRestAdapter(
  config: RestAdapterConfig | undefined,
  datasetUrl: string,
  fetchFn: typeof globalThis.fetch,
): SaveAdapter {
  const method = config?.method ?? "PATCH";

  return {
    async save(dataSetId, record, changedFields, idColumn, idValue): Promise<SaveResult> {
      const url = `${datasetUrl}/${String(idValue)}`;
      const body: Record<string, unknown> = {};
      for (const field of changedFields) {
        body[field] = record[field];
      }

      try {
        const response = await fetchFn(url, {
          method,
          headers: {
            "Content-Type": "application/json",
            ...config?.headers,
          },
          body: JSON.stringify(body),
        });

        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }

        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const updatedRecord = await response.json();
          return { success: true, updatedRecord };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async create(_dataSetId, record): Promise<SaveResult> {
      try {
        const response = await fetchFn(datasetUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...config?.headers,
          },
          body: JSON.stringify(record),
        });
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
        const contentType = response.headers.get("content-type");
        if (contentType?.includes("application/json")) {
          const updatedRecord = await response.json();
          return { success: true, updatedRecord };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },

    async delete(_dataSetId, _idColumn, idValue): Promise<SaveResult> {
      const url = `${datasetUrl}/${String(idValue)}`;
      try {
        const response = await fetchFn(url, {
          method: "DELETE",
          headers: config?.headers ?? {},
        });
        if (!response.ok) {
          return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
        }
        return { success: true };
      } catch (err) {
        return { success: false, error: err instanceof Error ? err.message : String(err) };
      }
    },
  };
}
