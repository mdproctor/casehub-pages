import { describe, it, expect } from "vitest";
import { extractDataSet } from "./extraction.js";
import { createPresetRegistry } from "./presets/registry.js";
import type { ExternalDataSetDef, ExtractionDef, FetchResult, PresetRegistry} from "./types.js";
import type { CellValue } from "../types.js";
import { ColumnType, dataSetId, columnId} from "../types.js";
import { DataSetError } from "../errors.js";

function def(overrides: Partial<ExternalDataSetDef> = {}): ExternalDataSetDef {
  return { uuid: dataSetId("test-ds"), ...overrides };
}

function fetchResult(data: unknown, contentType?: string): FetchResult {
  return contentType !== undefined ? { data, contentType } : { data };
}

function val(cell: CellValue): string | number | Date {
  if (cell.type === "NULL") throw new Error("Unexpected NULL cell");
  return cell.value;
}

describe("extractDataSet", () => {
  let registry: PresetRegistry;

  beforeAll(() => {
    registry = createPresetRegistry();
  });

  // --- Shape B: array of objects ---

  it("extracts Shape B (array of objects) with explicit columns", async () => {
    const data = [
      { name: "Alice", age: 30 },
      { name: "Bob", age: 25 },
    ];
    const result = await extractDataSet(
      fetchResult(data),
      def({
        columns: [
          { id: columnId("name"), type: ColumnType.LABEL },
          { id: columnId("age"), type: ColumnType.NUMBER },
        ],
      }),
      registry,
    );

    expect(result.inferredColumns).toBe(false);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("name");
    expect(result.dataset.columns[0]!.type).toBe(ColumnType.LABEL);
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(result.dataset.rows[0]!.number(columnId("age"))).toBe(30);
  });

  it("extracts Shape B with inferred columns (numbers, strings, dates)", async () => {
    const data = [
      { region: "US", revenue: 100, timestamp: "2024-06-15T10:30:00.000Z" },
      { region: "EU", revenue: 250.5, timestamp: "2024-07-01T00:00:00.000Z" },
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(3);

    const colMap = new Map(result.dataset.columns.map((c) => [c.id, c]));
    expect(colMap.get(columnId("region"))!.type).toBe(ColumnType.LABEL);
    expect(colMap.get(columnId("revenue"))!.type).toBe(ColumnType.NUMBER);
    expect(colMap.get(columnId("timestamp"))!.type).toBe(ColumnType.DATE);

    expect(result.dataset.rows[0]!.text(columnId("region"))).toBe("US");
    expect(result.dataset.rows[0]!.number(columnId("revenue"))).toBe(100);
  });

  // --- Shape C: array of arrays ---

  it("extracts Shape C (array of arrays) with auto-generated column names", async () => {
    const data = [
      ["Alice", "30"],
      ["Bob", "25"],
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("Column 0");
    expect(result.dataset.columns[1]!.id).toBe("Column 1");
  });

  // --- Shape A: columns + values ---

  it("extracts Shape A (columns + values object)", async () => {
    const data = {
      columns: [
        { id: "city", type: "label" },
        { id: "pop", type: "number" },
      ],
      values: [
        ["London", "9000000"],
        ["Paris", "2100000"],
      ],
    };
    const result = await extractDataSet(fetchResult(data), def(), registry);

    expect(result.inferredColumns).toBe(true);
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.columns[0]!.id).toBe("city");
    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- dataPath navigation ---

  it("navigates nested data via dataPath", async () => {
    const data = {
      data: {
        items: [
          { x: 1, y: 2 },
          { x: 3, y: 4 },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ dataPath: "data.items" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.number(columnId("x"))).toBe(1);
  });

  it("throws EXTRACTION_ERROR for nonexistent dataPath", async () => {
    const data = { a: { b: 1 } };
    await expect(
      extractDataSet(fetchResult(data), def({ dataPath: "a.missing.path" }), registry),
    ).rejects.toThrow(DataSetError);
    await expect(
      extractDataSet(fetchResult(data), def({ dataPath: "a.missing.path" }), registry),
    ).rejects.toThrow("EXTRACTION_ERROR");
  });

  // --- type preset ---

  it("applies type preset (prometheus) to vector response", async () => {
    const data = {
      data: {
        resultType: "vector",
        result: [
          {
            metric: { __name__: "up", instance: "localhost:9090" },
            value: [1625000000, "1"],
          },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ type: "prometheus" }),
      registry,
    );

    expect(result.dataset.columns.length).toBeGreaterThanOrEqual(2);
    expect(result.dataset.rows).toHaveLength(1);
    // timestamp should be multiplied by 1000
    expect(result.dataset.rows[0]!.number(columnId("timestamp"))).toBe(1625000000000);
  });

  // --- expression ---

  it("applies custom JSONata expression", async () => {
    const data = {
      results: [
        { name: "A", val: 10 },
        { name: "B", val: 20 },
      ],
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({ expression: "results.{ \"label\": name, \"value\": val }" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- Pipeline composition: dataPath + type + expression ---

  it("composes dataPath + type + expression in sequence", async () => {
    // dataPath navigates to the prometheus-shaped data,
    // type applies the prometheus preset,
    // expression further filters values where second element (value) = "1"
    const data = {
      wrapper: {
        data: {
          resultType: "vector",
          result: [
            { metric: { __name__: "up", job: "api" }, value: [1625000000, "1"] },
            { metric: { __name__: "up", job: "web" }, value: [1625000001, "0"] },
          ],
        },
      },
    };
    const result = await extractDataSet(
      fetchResult(data),
      def({
        dataPath: "wrapper",
        type: "prometheus",
        expression: '{ "columns": columns, "values": values[$[1] = "1"] }',
      }),
      registry,
    );

    // The prometheus preset returns { columns, values } (Shape A).
    // The expression filters to rows where value="1" (the "api" row).
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.rows[0]!.number(columnId("timestamp"))).toBe(1625000000000);
  });

  // --- CSV content type ---

  it("parses string input with CSV content type", async () => {
    const csv = "name,score\nAlice,95\nBob,88";
    const result = await extractDataSet(
      fetchResult(csv, "text/csv"),
      def(),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- CSV fallback ---

  it("falls back to CSV when string is not valid JSON", async () => {
    const csv = "a,b\n1,2\n3,4";
    const result = await extractDataSet(
      fetchResult(csv),
      def(),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
  });

  // --- Metrics content ---

  it("parses metrics format when URL ends in 'metrics'", async () => {
    const metricsText = [
      "# HELP up Whether the target is up",
      "# TYPE up gauge",
      "up{instance=\"localhost:9090\"} 1",
      "up{instance=\"localhost:9100\"} 0",
    ].join("\n");
    const result = await extractDataSet(
      fetchResult(metricsText),
      def({ url: "http://example.com/metrics" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns).toHaveLength(3);
  });

  // --- Explicit columns with type mismatch ---

  it("throws SCHEMA_MISMATCH when explicit column type does not match data", async () => {
    const data = [{ name: "Alice" }];
    await expect(
      extractDataSet(
        fetchResult(data),
        def({
          columns: [{ id: columnId("name"), type: ColumnType.NUMBER }],
        }),
        registry,
      ),
    ).rejects.toThrow("SCHEMA_MISMATCH");
  });

  // --- Empty result ---

  it("returns empty dataset for empty array", async () => {
    const result = await extractDataSet(fetchResult([]), def(), registry);
    expect(result.dataset.rows).toHaveLength(0);
    expect(result.dataset.columns).toHaveLength(0);
  });

  // --- Invalid JSON string that is also not CSV ---

  it("throws PARSE_FAILED for unparseable string", async () => {
    // A single value that isn't JSON, isn't CSV-like either — but parseCsv can
    // handle almost anything. Force PARSE_FAILED by using an empty string.
    await expect(
      extractDataSet(fetchResult(""), def(), registry),
    ).rejects.toThrow(/PARSE_FAILED|EMPTY_RESULT/);
  });

  // --- UNKNOWN_PRESET ---

  it("throws UNKNOWN_PRESET for unregistered type", async () => {
    const data = [{ x: 1 }];
    await expect(
      extractDataSet(fetchResult(data), def({ type: "nonexistent-type" }), registry),
    ).rejects.toThrow("UNKNOWN_PRESET");
  });

  // --- URL file extension detection (#9 finding 1) ---

  it("parses as CSV when URL ends with .csv", async () => {
    const csv = "name,age\nAlice,30\nBob,25";
    const result = await extractDataSet(
      fetchResult(csv),
      def({ url: "http://example.com/data.csv" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
  });

  it("parses as CSV when URL has .csv with query string", async () => {
    const csv = "x,y\n1,2";
    const result = await extractDataSet(
      fetchResult(csv),
      def({ url: "http://example.com/data.csv?token=abc" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.columns[0]!.id).toBe("x");
  });

  it("parses as CSV when URL ends with .tsv (tab-delimited)", async () => {
    const tsv = "name\tage\nAlice\t30";
    const result = await extractDataSet(
      fetchResult(tsv),
      def({ url: "http://example.com/data.tsv" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
  });

  it("explicit content type takes precedence over URL extension", async () => {
    // JSON data served from a .csv URL with application/json content type
    const json = JSON.stringify([{ a: 1 }]);
    const result = await extractDataSet(
      fetchResult(json, "application/json"),
      def({ url: "http://example.com/data.csv" }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.columns[0]!.id).toBe("a");
  });

  // --- Prometheus dual detection (#9 finding 2) ---

  it("detects Prometheus format from text/plain content with metric lines", async () => {
    const metricsText = [
      "# HELP up Whether target is up",
      "up{instance=\"localhost:9090\"} 1",
      "up{instance=\"localhost:9100\"} 0",
    ].join("\n");
    const result = await extractDataSet(
      fetchResult(metricsText, "text/plain"),
      def({ content: metricsText }),
      registry,
    );

    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns).toHaveLength(3);
  });

  it("does not misdetect plain text as Prometheus when it has no metric lines", async () => {
    const plainText = "Hello world\nThis is just text\nNot metrics";
    // Should fall through to CSV fallback, not Prometheus
    const result = await extractDataSet(
      fetchResult(plainText, "text/plain"),
      def({ content: plainText }),
      registry,
    );

    // CSV fallback will parse each line as a single-column row
    expect(result.dataset.rows.length).toBeGreaterThan(0);
    // Should NOT have 3 columns (which metrics parser would produce)
    expect(result.dataset.columns.length).not.toBe(3);
  });

  // --- Column type inference majority voting (#9 finding 3) ---

  it("infers LABEL when column has mixed types (numbers then non-numeric)", async () => {
    const data = [
      { id: "42" },
      { id: "43" },
      { id: "N/A" },
      { id: "unknown" },
      { id: "44" },
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    // Mixed: 3 numbers, 2 labels → no clear majority, fallback to LABEL
    const col = result.dataset.columns.find((c) => c.id === "id");
    expect(col!.type).toBe(ColumnType.LABEL);
  });

  it("infers NUMBER when strong majority are numeric", async () => {
    const data = [
      { val: "10" },
      { val: "20" },
      { val: "30" },
      { val: "40" },
      { val: null },
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    const col = result.dataset.columns.find((c) => c.id === "val");
    expect(col!.type).toBe(ColumnType.NUMBER);
  });

  it("infers DATE when strong majority are ISO dates", async () => {
    const data = [
      { ts: "2024-01-01T00:00:00Z" },
      { ts: "2024-02-01T00:00:00Z" },
      { ts: "2024-03-01T00:00:00Z" },
      { ts: null },
    ];
    const result = await extractDataSet(fetchResult(data), def(), registry);

    const col = result.dataset.columns.find((c) => c.id === "ts");
    expect(col!.type).toBe(ColumnType.DATE);
  });

  // --- Trailing comma stripping ---

  it("parses JSON with trailing commas in arrays", async () => {
    const result = await extractDataSet(
      fetchResult('[["Hello", 20],["World", 10],]'),
      def(),
      registry,
    );
    expect(result.dataset.rows).toHaveLength(2);
    expect(result.dataset.columns).toHaveLength(2);
  });

  it("parses JSON with trailing commas in nested arrays", async () => {
    const result = await extractDataSet(
      fetchResult('[["A", 1, 2],["B", 3, 4],]'),
      def(),
      registry,
    );
    expect(result.dataset.columns[0]!.id).toBe("Column 0");
    expect(result.dataset.columns[1]!.id).toBe("Column 1");
  });

  // --- Prometheus API response (type: prometheus) ---

  it("extracts Prometheus API vector response via type preset", async () => {
    const apiResponse = {
      status: "success",
      data: {
        resultType: "vector",
        result: [
          {
            metric: { __name__: "http_requests_total", handler: "/api/v1/query", code: "200" },
            value: [1718546000, "1027"],
          },
          {
            metric: { __name__: "http_requests_total", handler: "/metrics", code: "200" },
            value: [1718546000, "8934"],
          },
          {
            metric: { __name__: "http_requests_total", handler: "/api/v1/query", code: "400" },
            value: [1718546000, "12"],
          },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(apiResponse, "application/json"),
      def({ type: "prometheus", url: "http://localhost:9090/api/v1/query?query=prometheus_http_requests_total" }),
      registry,
    );

    expect(result.dataset.columns.map(c => c.id)).toEqual(["timestamp", "value", "__name__", "handler", "code"]);
    expect(result.dataset.rows).toHaveLength(3);
    const row0 = result.dataset.rows[0]!;
    expect(val(row0.cell(columnId("handler")))).toBe("/api/v1/query");
    expect(val(row0.cell(columnId("code")))).toBe("200");
    expect(val(row0.cell(columnId("__name__")))).toBe("http_requests_total");
  });

  it("extracts Prometheus API matrix response via type preset", async () => {
    const apiResponse = {
      status: "success",
      data: {
        resultType: "matrix",
        result: [
          {
            metric: { __name__: "go_gc_heap_live_bytes", instance: "localhost:9090" },
            values: [
              [1718546000, "4194304"],
              [1718546060, "4456448"],
            ],
          },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(apiResponse),
      def({ type: "prometheus" }),
      registry,
    );

    expect(result.dataset.columns.map(c => c.id)).toEqual(["timestamp", "value", "__name__", "instance"]);
    expect(result.dataset.rows).toHaveLength(2);
    const row0 = result.dataset.rows[0]!;
    expect(val(row0.cell(columnId("__name__")))).toBe("go_gc_heap_live_bytes");
    expect(val(row0.cell(columnId("instance")))).toBe("localhost:9090");
  });

  it("auto-detects Prometheus API format when type is not specified", async () => {
    const apiResponse = {
      status: "success",
      data: {
        resultType: "vector",
        result: [
          { metric: { handler: "/query", code: "200" }, value: [1718546000, "100"] },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(apiResponse),
      def(),
      registry,
    );

    expect(result.dataset.columns.map(c => c.id)).toContain("handler");
    expect(result.dataset.columns.map(c => c.id)).toContain("code");
    expect(result.dataset.rows).toHaveLength(1);
  });

  it("Prometheus vector response supports filtering by label column", async () => {
    const apiResponse = {
      status: "success",
      data: {
        resultType: "vector",
        result: [
          { metric: { handler: "/query", code: "200" }, value: [1718546000, "100"] },
          { metric: { handler: "/query", code: "400" }, value: [1718546000, "5"] },
          { metric: { handler: "/metrics", code: "200" }, value: [1718546000, "900"] },
        ],
      },
    };
    const result = await extractDataSet(
      fetchResult(apiResponse),
      def({ type: "prometheus" }),
      registry,
    );

    const codeCol = result.dataset.columns.find(c => c.id === "code");
    expect(codeCol).toBeDefined();
    const row200 = result.dataset.rows.filter(r => val(r.cell(columnId("code"))) === "200");
    expect(row200).toHaveLength(2);
  });

  // --- ExtractionDef (no uuid) ---

  it("accepts ExtractionDef without uuid", async () => {
    const result = await extractDataSet(
      fetchResult([{ name: "Alice", score: 42 }]),
      {
        columns: [
          { id: columnId("name"), type: ColumnType.TEXT },
          { id: columnId("score"), type: ColumnType.NUMBER },
        ],
      } satisfies ExtractionDef,
      registry,
    );
    expect(result.dataset.columns).toHaveLength(2);
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.rows[0]!.text(columnId("name"))).toBe("Alice");
    expect(result.dataset.rows[0]!.number(columnId("score"))).toBe(42);
  });

  it("accepts ExtractionDef with dataPath", async () => {
    const result = await extractDataSet(
      fetchResult({ items: [{ x: "hello" }], total: 50 }),
      { dataPath: "items", columns: [{ id: columnId("x"), type: ColumnType.TEXT }] } satisfies ExtractionDef,
      registry,
    );
    expect(result.dataset.rows).toHaveLength(1);
    expect(result.dataset.rows[0]!.text(columnId("x"))).toBe("hello");
  });
});
