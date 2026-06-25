import type { DeepLink } from "@casehubio/pages-ui/dist/model/page-types.js";

function encodePagePath(page: string): string {
  return page
    .split("/")
    .filter(Boolean)
    .map(encodeURIComponent)
    .join("/");
}

function decodePagePath(encoded: string): string {
  return encoded
    .split("/")
    .filter(Boolean)
    .map(decodeURIComponent)
    .join("/");
}

export function serializeToUrl(link: DeepLink): string {
  let url = `#/page/${encodePagePath(link.page)}`;
  const params: string[] = [];

  if (link.filters) {
    const entries = Object.entries(link.filters).filter(([, v]) => v.length > 0);
    if (entries.length > 0) {
      const filterStr = entries
        .map(([col, values]) => `${encodeURIComponent(col)}:${values.map(encodeURIComponent).join("|")}`)
        .join(",");
      params.push(`filter=${filterStr}`);
    }
  }

  if (link.sort) {
    const entries = Object.entries(link.sort);
    if (entries.length > 0) {
      const sortStr = entries
        .map(([id, s]) => `${encodeURIComponent(id)}:${encodeURIComponent(s.columnId)}:${s.order}`)
        .join(",");
      params.push(`sort=${sortStr}`);
    }
  }

  if (link.pagination) {
    const entries = Object.entries(link.pagination).filter(([, p]) => p > 0);
    if (entries.length > 0) {
      const pageStr = entries
        .map(([id, p]) => `${encodeURIComponent(id)}:${String(p)}`)
        .join(",");
      params.push(`page=${pageStr}`);
    }
  }

  if (link.textFilter) {
    const entries = Object.entries(link.textFilter).filter(([, t]) => t.length > 0);
    if (entries.length > 0) {
      const tfStr = entries
        .map(([id, t]) => `${encodeURIComponent(id)}:${encodeURIComponent(t)}`)
        .join(",");
      params.push(`tf=${tfStr}`);
    }
  }

  if (params.length > 0) {
    url += `?${params.join("&")}`;
  }
  return url;
}

export function parseFromUrl(hash: string): DeepLink {
  if (!hash || !hash.startsWith("#/page/")) {
    return { page: "" };
  }

  const withoutPrefix = hash.substring("#/page/".length);
  const qIndex = withoutPrefix.indexOf("?");
  const rawPage = qIndex === -1 ? withoutPrefix : withoutPrefix.substring(0, qIndex);
  const page = decodePagePath(rawPage);

  let filters: Record<string, readonly string[]> | undefined;
  let sort: Record<string, { readonly columnId: string; readonly order: "ASCENDING" | "DESCENDING" }> | undefined;
  let pagination: Record<string, number> | undefined;
  let textFilter: Record<string, string> | undefined;

  if (qIndex !== -1) {
    const queryStr = withoutPrefix.substring(qIndex + 1);
    const params = new URLSearchParams(queryStr);

    const filterStr = params.get("filter");
    if (filterStr) {
      filters = {};
      for (const entry of filterStr.split(",")) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) continue;
        const col = decodeURIComponent(entry.substring(0, colonIdx));
        const values = entry.substring(colonIdx + 1).split("|").map(decodeURIComponent);
        filters[col] = values;
      }
    }

    const sortStr = params.get("sort");
    if (sortStr) {
      sort = {};
      for (const entry of sortStr.split(",")) {
        const parts = entry.split(":");
        if (parts.length < 3) continue;
        const id = decodeURIComponent(parts[0]!);
        const columnId = decodeURIComponent(parts[1]!);
        const order = parts[2] as "ASCENDING" | "DESCENDING";
        if (order !== "ASCENDING" && order !== "DESCENDING") continue;
        sort[id] = { columnId, order };
      }
    }

    const pageStr = params.get("page");
    if (pageStr) {
      pagination = {};
      for (const entry of pageStr.split(",")) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) continue;
        const id = decodeURIComponent(entry.substring(0, colonIdx));
        const num = parseInt(entry.substring(colonIdx + 1), 10);
        if (!isNaN(num)) {
          pagination[id] = num;
        }
      }
    }

    const tfStr = params.get("tf");
    if (tfStr) {
      textFilter = {};
      for (const entry of tfStr.split(",")) {
        const colonIdx = entry.indexOf(":");
        if (colonIdx === -1) continue;
        const id = decodeURIComponent(entry.substring(0, colonIdx));
        const text = decodeURIComponent(entry.substring(colonIdx + 1));
        if (text) {
          textFilter[id] = text;
        }
      }
    }
  }

  return {
    page,
    ...(filters ? { filters } : {}),
    ...(sort ? { sort } : {}),
    ...(pagination ? { pagination } : {}),
    ...(textFilter ? { textFilter } : {}),
  };
}
