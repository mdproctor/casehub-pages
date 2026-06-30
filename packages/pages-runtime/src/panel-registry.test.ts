import { registerPanel, lookupPanel, clearPanelRegistry } from "./panel-registry.js";

describe("panel-registry", () => {
  afterEach(() => { clearPanelRegistry(); });

  it("registers and looks up a panel type", () => {
    registerPanel("diff-viewer", "drafthouse-diff");
    expect(lookupPanel("diff-viewer")).toBe("drafthouse-diff");
  });

  it("returns undefined for unregistered type", () => {
    expect(lookupPanel("unknown")).toBeUndefined();
  });

  it("overwrites on duplicate registration", () => {
    registerPanel("diff-viewer", "old-tag");
    registerPanel("diff-viewer", "new-tag");
    expect(lookupPanel("diff-viewer")).toBe("new-tag");
  });
});
