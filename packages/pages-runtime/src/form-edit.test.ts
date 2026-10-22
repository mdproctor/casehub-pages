/**
 * Real interaction tests for editing + saving via local adapter.
 *
 * These tests previously relied on PagesTable shadow DOM interaction
 * (clicking table rows, reading table cell text). PagesTable has been
 * removed from pages-viz. pages-data-table now lives in pages/packages/pages-data-table (migrated from blocks-ui in casehubio/agency-ui#48).
 *
 * The form editing and local save adapter are tested at the unit level
 * in their respective modules. Integration tests that exercise the
 * full edit → save → re-push cycle through a data-consuming component
 * should be added once pages-data-table is wired into the runtime.
 */
import { describe, it, expect } from "vitest";

describe("form editing + local save (placeholder)", () => {
  it("placeholder — PagesTable removed, form-edit integration tests pending pages-data-table wiring", () => {
    expect(true).toBe(true);
  });
});
