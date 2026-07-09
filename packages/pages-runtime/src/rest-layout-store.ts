import type {LayoutState} from "@casehubio/pages-component/dist/model/types.js";
import type {LayoutStore} from "./layout-store.js";

export function createRestLayoutStore(
  baseUrl: string,
  tokenFn: () => string | null,
): LayoutStore {
  return {
    async load(key: string): Promise<LayoutState | null> {
      try {
        const headers: Record<string, string> = {};
        const token = tokenFn();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${baseUrl}/api/layouts/${encodeURIComponent(key)}`,
          { headers }
        );

        if (response.status === 401) {
          document.dispatchEvent(new CustomEvent("pages-auth-expired"));
          return null;
        }

        if (!response.ok) {
          return null;
        }

        const text = await response.text();
        if (!text) {
          return null;
        }

        return JSON.parse(text) as LayoutState;
      } catch {
        return null;
      }
    },

    async save(key: string, state: LayoutState): Promise<void> {
      try {
        const headers: Record<string, string> = {
          "Content-Type": "text/plain",
        };
        const token = tokenFn();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${baseUrl}/api/layouts/${encodeURIComponent(key)}`,
          {
            method: "PUT",
            headers,
            body: JSON.stringify(state),
          }
        );

        if (response.status === 401) {
          document.dispatchEvent(new CustomEvent("pages-auth-expired"));
          return;
        }

        if (!response.ok) {
          console.warn(`[pages] Failed to save layout "${key}": HTTP ${String(response.status)}`);
        }
      } catch (err) {
        console.warn(`[pages] Failed to save layout "${key}":`, err);
      }
    },

    async delete(key: string): Promise<void> {
      try {
        const headers: Record<string, string> = {};
        const token = tokenFn();
        if (token) {
          headers["Authorization"] = `Bearer ${token}`;
        }

        const response = await fetch(
          `${baseUrl}/api/layouts/${encodeURIComponent(key)}`,
          {
            method: "DELETE",
            headers,
          }
        );

        if (response.status === 401) {
          document.dispatchEvent(new CustomEvent("pages-auth-expired"));
          return;
        }

        if (!response.ok) {
          console.warn(`[pages] Failed to delete layout "${key}": HTTP ${String(response.status)}`);
        }
      } catch (err) {
        console.warn(`[pages] Failed to delete layout "${key}":`, err);
      }
    },
  };
}
