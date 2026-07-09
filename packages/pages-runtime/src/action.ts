import type {ActionCallbacks, ActionRequest, ActionResult} from "@casehubio/pages-component/dist/model/action-types.js";
import type {RuntimeContext} from "@casehubio/pages-component/dist/context/types.js";
import {resolveTemplate} from "@casehubio/pages-component/dist/context/template-parser.js";

export interface PagesActionCompleteDetail {
  readonly refresh: readonly string[];
}

export class ActionExecutor {
  constructor(
    private readonly fetchFn: typeof fetch,
    private readonly baseUrl: string
  ) {}

  async execute(
    request: ActionRequest,
    callbacks: ActionCallbacks,
    context: RuntimeContext
  ): Promise<ActionResult> {
    try {
      // Resolve templates in URL
      const resolvedUrl = resolveTemplate(request.url, context, "none");

      // Build absolute URL
      const fullUrl = this.buildUrl(resolvedUrl);

      // Resolve templates in headers
      const resolvedHeaders: Record<string, string> = {};
      if (request.headers) {
        for (const [key, value] of Object.entries(request.headers)) {
          resolvedHeaders[key] = resolveTemplate(value, context, "none");
        }
      }

      // Add Content-Type for JSON body
      if (request.body) {
        resolvedHeaders["Content-Type"] = "application/json";
      }

      // Resolve templates in body (recursively)
      const resolvedBody = request.body
        ? this.resolveBodyTemplates(request.body, context)
        : undefined;

      // Execute fetch
      const method = request.method ?? "POST";
      const response = await this.fetchFn(fullUrl, {
        method,
        headers: resolvedHeaders,
        ...(resolvedBody ? { body: JSON.stringify(resolvedBody) } : {}),
      });

      // Check success
      if (response.ok) {
        return { success: true, status: response.status };
      } else {
        return {
          success: false,
          status: response.status,
          error: response.statusText,
        };
      }
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        success: false,
        error: message,
      };
    }
  }

  private buildUrl(url: string): string {
    // If already absolute, return as-is
    if (url.startsWith("http://") || url.startsWith("https://")) {
      return url;
    }

    // Prepend baseUrl
    const base = this.baseUrl.endsWith("/")
      ? this.baseUrl.slice(0, -1)
      : this.baseUrl;
    const path = url.startsWith("/") ? url : `/${url}`;
    return `${base}${path}`;
  }

  private resolveBodyTemplates(
    body: Record<string, unknown>,
    context: RuntimeContext
  ): Record<string, unknown> {
    const resolved: Record<string, unknown> = {};

    for (const [key, value] of Object.entries(body)) {
      if (typeof value === "string") {
        resolved[key] = resolveTemplate(value, context, "none");
      } else if (value !== null && typeof value === "object" && !Array.isArray(value)) {
        // Recursively resolve nested objects
        resolved[key] = this.resolveBodyTemplates(
          value as Record<string, unknown>,
          context
        );
      } else {
        // Pass through primitives, arrays, null
        resolved[key] = value;
      }
    }

    return resolved;
  }
}
