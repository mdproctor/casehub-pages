import { describe, it, expect } from "vitest";
import type { ConfigurablePanel, DataReceiver } from "./hosting.js";
import type { HostPanelProps } from "./component-props.js";
import type { TypedDataSet } from "@casehubio/pages-data";
import { ColumnType, columnId } from "@casehubio/pages-data";
import { toTypedDataSet } from "@casehubio/pages-data";

const STUB_DS: TypedDataSet = toTypedDataSet({
  columns: [{ id: columnId("x"), name: "x", type: ColumnType.TEXT }],
  data: [["a"]],
});

describe("ConfigurablePanel", () => {
  it("accepts a default Record<string, unknown> implementation", () => {
    const panel: ConfigurablePanel = {
      configure(props: Record<string, unknown>) {
        void props;
      },
    };
    panel.configure({ endpoint: "/api" });
    expect(panel).toBeDefined();
  });

  it("accepts a typed generic implementation", () => {
    interface MyProps extends Record<string, unknown> {
      endpoint: string;
      mode?: string;
    }
    const panel: ConfigurablePanel<MyProps> = {
      configure(props: MyProps) {
        void props.endpoint;
      },
    };
    panel.configure({ endpoint: "/api" });
    expect(panel).toBeDefined();
  });
});

describe("DataReceiver", () => {
  it("accepts an implementation with the mutual-clearing invariant", () => {
    let _data: TypedDataSet | undefined;
    let _error = "";
    let _loading = false;
    const receiver: DataReceiver = {
      get dataSet() { return _data; },
      set dataSet(v: TypedDataSet | undefined) { _data = v; _error = ""; _loading = false; },
      get error() { return _error; },
      set error(v: string) { _error = v; _data = undefined; _loading = false; },
      get loading() { return _loading; },
      set loading(v: boolean) { _loading = v; if (v) _error = ""; },
    };
    receiver.dataSet = STUB_DS;
    expect(receiver.error).toBe("");
    expect(receiver.loading).toBe(false);
    receiver.error = "fail";
    expect(receiver.dataSet).toBeUndefined();
    expect(receiver.loading).toBe(false);
  });

  it("loading = true clears error but preserves stale dataSet", () => {
    let _data: TypedDataSet | undefined;
    let _error = "";
    let _loading = false;
    const receiver: DataReceiver = {
      get dataSet() { return _data; },
      set dataSet(v: TypedDataSet | undefined) { _data = v; _error = ""; _loading = false; },
      get error() { return _error; },
      set error(v: string) { _error = v; _data = undefined; _loading = false; },
      get loading() { return _loading; },
      set loading(v: boolean) { _loading = v; if (v) _error = ""; },
    };
    receiver.dataSet = STUB_DS;
    receiver.loading = true;
    expect(receiver.loading).toBe(true);
    expect(receiver.error).toBe("");
    expect(receiver.dataSet).toBe(STUB_DS);
  });

  it("setting dataSet clears loading", () => {
    let _data: TypedDataSet | undefined;
    let _error = "";
    let _loading = true;
    const receiver: DataReceiver = {
      get dataSet() { return _data; },
      set dataSet(v: TypedDataSet | undefined) { _data = v; _error = ""; _loading = false; },
      get error() { return _error; },
      set error(v: string) { _error = v; _data = undefined; _loading = false; },
      get loading() { return _loading; },
      set loading(v: boolean) { _loading = v; if (v) _error = ""; },
    };
    receiver.dataSet = STUB_DS;
    expect(receiver.loading).toBe(false);
  });
});

describe("HostPanelProps", () => {
  it("accepts lookup for dataset binding", () => {
    const props: HostPanelProps = {
      typeName: "my-panel",
      panelProps: { mode: "dark" },
      lookup: { dataSetId: "workitems" as any, operations: [] },
    };
    expect(props.lookup?.dataSetId).toBe("workitems");
  });

  it("lookup is optional — existing usage without it compiles", () => {
    const props: HostPanelProps = {
      typeName: "my-panel",
    };
    expect(props.lookup).toBeUndefined();
  });
});
