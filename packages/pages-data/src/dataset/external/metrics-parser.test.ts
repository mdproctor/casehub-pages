import { describe, it, expect } from "vitest";
import { parseMetrics } from "./metrics-parser.js";

describe("parseMetrics", () => {
  it("parses simple metric line — extracts label values", () => {
    const result = parseMetrics('up{instance="localhost:9090"} 1');
    expect(result).toEqual([["up", "localhost:9090", "1"]]);
  });

  it("parses metric without labels", () => {
    const result = parseMetrics("process_cpu_seconds_total 42.5");
    expect(result).toEqual([["process_cpu_seconds_total", "", "42.5"]]);
  });

  it("skips comment lines", () => {
    const result = parseMetrics(
      '# HELP up Whether the target is up\n# TYPE up gauge\nup{instance="a"} 1',
    );
    expect(result).toHaveLength(1);
    expect(result[0]![0]).toBe("up");
  });

  it("replaces NaN values with -1", () => {
    const result = parseMetrics("some_metric{} NaN");
    expect(result[0]![2]).toBe("-1");
  });

  it("handles multiple metrics", () => {
    const result = parseMetrics(
      'node_cpu{cpu="0"} 100\nnode_cpu{cpu="1"} 200',
    );
    expect(result).toHaveLength(2);
    expect(result[0]![2]).toBe("100");
    expect(result[1]![2]).toBe("200");
  });

  it("skips empty lines", () => {
    const result = parseMetrics("up 1\n\ndown 0\n");
    expect(result).toHaveLength(2);
  });

  it("extracts values from multiple labels", () => {
    const result = parseMetrics('http_requests{method="GET",code="200"} 42');
    expect(result[0]![1]).toBe("GET, 200");
  });

  it("extracts Micrometer-style labels with spaces", () => {
    const result = parseMetrics('jvm_memory_used_bytes{area="heap",id="G1 Eden Space",} 52428800');
    expect(result[0]![1]).toBe("heap, G1 Eden Space");
  });

  it("handles curly braces inside label values (URI path params)", () => {
    const result = parseMetrics('http_server_requests_seconds_count{method="GET",uri="/api/users/{id}",status="200",} 8934');
    expect(result[0]![0]).toBe("http_server_requests_seconds_count");
    expect(result[0]![1]).toBe("GET, /api/users/{id}, 200");
    expect(result[0]![2]).toBe("8934");
  });
});
