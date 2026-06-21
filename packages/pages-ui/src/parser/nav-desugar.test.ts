import { describe, it, expect } from "vitest";
import type { Component } from "../model/types.js";
import { resolveNavigation, collectNavTreePageNames } from "./nav-desugar.js";

describe("resolveNavigation", () => {
  it("resolves navGroupId + targetDivId into tabs slots", () => {
    const pages: Component[] = [
      {
        type: "page",
        props: { name: "CPU Usage" },
        slots: { content: [{ type: "html", props: { content: "cpu" } }] },
      },
      {
        type: "page",
        props: { name: "Memory" },
        slots: { content: [{ type: "html", props: { content: "mem" } }] },
      },
    ];

    const components: Component[] = [
      { type: "tabs", props: { navGroupId: "Metrics", targetDivId: "Metrics_Div" } },
      { type: "slot-target", props: { id: "Metrics_Div" } },
    ];

    const navTree = {
      root_items: [
        {
          type: "GROUP",
          id: "Metrics",
          children: [{ page: "CPU Usage" }, { page: "Memory" }],
        },
      ],
    };

    const result = resolveNavigation(components, pages, navTree);

    // Nav component (tabs) has no slots — content is at the target
    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("tabs");
    expect(result[0]!.slots).toBeUndefined();
    // Slot-target replaced with tabs containing the page slots
    expect(result[1]!.type).toBe("tabs");
    expect(result[1]!.slots!["CPU Usage"]).toBeDefined();
    expect(result[1]!.slots!["Memory"]).toBeDefined();
  });

  it("removes slot-target placeholders", () => {
    const result = resolveNavigation(
      [
        { type: "tabs", props: { navGroupId: "G", targetDivId: "D" } },
        { type: "slot-target", props: { id: "D" } },
      ],
      [{ type: "page", props: { name: "P1" }, slots: { content: [] } }],
      { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] },
    );
    expect(result.every((c) => c.type !== "slot-target")).toBe(true);
  });

  it("resolves page-ref to inline page content", () => {
    const pages: Component[] = [
      {
        type: "page",
        props: { name: "Layout" },
        slots: { content: [{ type: "html", props: { content: "layout content" } }] },
      },
    ];
    const components: Component[] = [{ type: "page-ref", props: { name: "Layout" } }];
    const result = resolveNavigation(components, pages, undefined);
    expect(result[0]!.type).toBe("page");
    expect(result[0]!.props!["name"]).toBe("Layout");
  });

  it("throws on unresolvable page-ref", () => {
    expect(() =>
      resolveNavigation([{ type: "page-ref", props: { name: "NonExistent" } }], [], undefined),
    ).toThrow();
  });

  it("falls back to pages when navTree missing", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "PageA" }, slots: { content: [] } },
      { type: "page", props: { name: "PageB" }, slots: { content: [] } },
    ];
    const components: Component[] = [{ type: "tabs", props: { navGroupId: "SomeGroup" } }];
    const result = resolveNavigation(components, pages, undefined);
    expect(result[0]!.type).toBe("tabs");
    expect(Object.keys(result[0]!.slots!).length).toBe(2);
  });

  it("cleans navGroupId and targetDivId from resolved component props", () => {
    const result = resolveNavigation(
      [
        { type: "tabs", props: { navGroupId: "G", targetDivId: "D", width: "100%" } },
        { type: "slot-target", props: { id: "D" } },
      ],
      [{ type: "page", props: { name: "P1" }, slots: { content: [] } }],
      { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] },
    );
    expect(result[0]!.props!["navGroupId"]).toBeUndefined();
    expect(result[0]!.props!["targetDivId"]).toBeUndefined();
    expect(result[0]!.props!["width"]).toBe("100%");
  });

  it("preserves non-nav components unchanged", () => {
    const components: Component[] = [
      { type: "html", props: { content: "hello" } },
      { type: "bar-chart", props: { title: "test" } },
    ];
    const result = resolveNavigation(components, [], undefined);
    expect(result.length).toBe(2);
    expect(result[0]!.type).toBe("html");
    expect(result[1]!.type).toBe("bar-chart");
  });

  it("handles nested groups in navTree", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "Page1" }, slots: { content: [] } },
      { type: "page", props: { name: "Page2" }, slots: { content: [] } },
    ];

    const components: Component[] = [{ type: "tabs", props: { navGroupId: "Inner" } }];

    const navTree = {
      root_items: [
        {
          type: "GROUP",
          id: "Outer",
          children: [
            {
              type: "GROUP",
              id: "Inner",
              children: [{ page: "Page1" }, { page: "Page2" }],
            },
          ],
        },
      ],
    };

    const result = resolveNavigation(components, pages, navTree);
    expect(result[0]!.type).toBe("tabs");
    expect(Object.keys(result[0]!.slots!).length).toBe(2);
    expect(result[0]!.slots!["Page1"]).toBeDefined();
    expect(result[0]!.slots!["Page2"]).toBeDefined();
  });

  it("handles group with no children", () => {
    const components: Component[] = [{ type: "tabs", props: { navGroupId: "Empty" } }];

    const navTree = {
      root_items: [
        {
          type: "GROUP",
          id: "Empty",
          children: [],
        },
      ],
    };

    const result = resolveNavigation(components, [], navTree);
    expect(result[0]!.type).toBe("tabs");
    expect(Object.keys(result[0]!.slots!).length).toBe(0);
  });

  it("handles missing page in group gracefully", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "ExistingPage" }, slots: { content: [] } },
    ];

    const components: Component[] = [{ type: "tabs", props: { navGroupId: "Group" } }];

    const navTree = {
      root_items: [
        {
          type: "GROUP",
          id: "Group",
          children: [{ page: "ExistingPage" }, { page: "MissingPage" }],
        },
      ],
    };

    const result = resolveNavigation(components, pages, navTree);
    expect(result[0]!.type).toBe("tabs");
    expect(Object.keys(result[0]!.slots!).length).toBe(1);
    expect(result[0]!.slots!["ExistingPage"]).toBeDefined();
    expect(result[0]!.slots!["MissingPage"]).toBeUndefined();
  });

  it("handles multiple nav components in same component list", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "P1" }, slots: { content: [] } },
      { type: "page", props: { name: "P2" }, slots: { content: [] } },
    ];

    const components: Component[] = [
      { type: "tabs", props: { navGroupId: "Group1" } },
      { type: "html", props: { content: "divider" } },
      { type: "tabs", props: { navGroupId: "Group2" } },
    ];

    const navTree = {
      root_items: [
        { type: "GROUP", id: "Group1", children: [{ page: "P1" }] },
        { type: "GROUP", id: "Group2", children: [{ page: "P2" }] },
      ],
    };

    const result = resolveNavigation(components, pages, navTree);
    expect(result.length).toBe(3);
    expect(result[0]!.type).toBe("tabs");
    expect(result[0]!.slots!["P1"]).toBeDefined();
    expect(result[1]!.type).toBe("html");
    expect(result[2]!.type).toBe("tabs");
    expect(result[2]!.slots!["P2"]).toBeDefined();
  });
});

describe("resolveNavigation — slot-target preserves nav type", () => {
  it("TREE nav type propagates to slot-target replacement", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "P1" }, slots: { content: [{ type: "html" }] } },
    ];
    const components: Component[] = [
      { type: "tree", props: { navGroupId: "G", targetDivId: "t" } },
      { type: "slot-target", props: { id: "t" } },
    ];
    const navTree = { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] };
    const result = resolveNavigation(components, pages, navTree);
    const content = result.find((c) => c.slots);
    expect(content).toBeDefined();
    expect(content!.type).toBe("tree");
  });

  it("MENU nav type propagates to slot-target replacement", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "P1" }, slots: { content: [{ type: "html" }] } },
    ];
    const components: Component[] = [
      { type: "menu", props: { navGroupId: "G", targetDivId: "t" } },
      { type: "slot-target", props: { id: "t" } },
    ];
    const navTree = { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] };
    const result = resolveNavigation(components, pages, navTree);
    const content = result.find((c) => c.slots);
    expect(content!.type).toBe("menu");
  });

  it("TILES nav type propagates to slot-target replacement", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "P1" }, slots: { content: [{ type: "html" }] } },
    ];
    const components: Component[] = [
      { type: "tiles", props: { navGroupId: "G", targetDivId: "t" } },
      { type: "slot-target", props: { id: "t" } },
    ];
    const navTree = { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] };
    const result = resolveNavigation(components, pages, navTree);
    const content = result.find((c) => c.slots);
    expect(content!.type).toBe("tiles");
  });

  it("TABS nav type still works (existing behavior)", () => {
    const pages: Component[] = [
      { type: "page", props: { name: "P1" }, slots: { content: [{ type: "html" }] } },
    ];
    const components: Component[] = [
      { type: "tabs", props: { navGroupId: "G", targetDivId: "t" } },
      { type: "slot-target", props: { id: "t" } },
    ];
    const navTree = { root_items: [{ type: "GROUP", id: "G", children: [{ page: "P1" }] }] };
    const result = resolveNavigation(components, pages, navTree);
    const content = result.find((c) => c.slots);
    expect(content!.type).toBe("tabs");
  });
});

describe("collectNavTreePageNames", () => {
  it("collects all page names from all groups", () => {
    const navTree = {
      root_items: [
        {
          type: "GROUP", id: "Main",
          children: [{ page: "Dashboard" }, { page: "Settings" }],
        },
        {
          type: "GROUP", id: "Charts",
          children: [{ page: "Bar" }, { page: "Pie" }],
        },
      ],
    };
    const names = collectNavTreePageNames(navTree);
    expect(names).toEqual(new Set(["Dashboard", "Settings", "Bar", "Pie"]));
  });

  it("collects from nested groups", () => {
    const navTree = {
      root_items: [{
        type: "GROUP", id: "Root",
        children: [
          { page: "Top" },
          {
            type: "GROUP", id: "Sub",
            children: [{ page: "Nested" }],
          },
        ],
      }],
    };
    const names = collectNavTreePageNames(navTree);
    expect(names).toEqual(new Set(["Top", "Nested"]));
  });

  it("returns empty set for undefined navTree", () => {
    expect(collectNavTreePageNames(undefined)).toEqual(new Set());
  });

  it("returns empty set for navTree without root_items", () => {
    expect(collectNavTreePageNames({})).toEqual(new Set());
  });
});

describe("resolveNavigation — tree hierarchical slot names", () => {
  function makePage(name: string): Component {
    return { type: "page", props: { name } };
  }

  const pages = [
    makePage("Dashboard"),
    makePage("Profile"),
    makePage("Security"),
    makePage("Logging"),
    makePage("Reports"),
  ];

  const navTree = {
    root_items: [{
      type: "GROUP",
      id: "MainNav",
      children: [
        { page: "Dashboard" },
        {
          type: "GROUP",
          id: "Settings",
          children: [
            { page: "Profile" },
            { page: "Security" },
            {
              type: "GROUP",
              id: "Advanced",
              children: [{ page: "Logging" }],
            },
          ],
        },
        { page: "Reports" },
      ],
    }],
  };

  it("tree type produces hierarchical slot keys from nested GROUPs", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;
    const slotKeys = Object.keys(treeComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard",
      "Settings/Profile",
      "Settings/Security",
      "Settings/Advanced/Logging",
      "Reports",
    ]);
  });

  it("tree slot keys map to correct pages (flat page name lookup)", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;
    const profileSlot = treeComp.slots!["Settings/Profile"]!;

    expect(profileSlot).toHaveLength(1);
    expect(profileSlot[0]!.props?.["name"]).toBe("Profile");
  });

  it("non-tree type produces flat slot keys (no hierarchy)", () => {
    const components: Component[] = [{
      type: "tabs",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const tabsComp = resolved[0]!;
    const slotKeys = Object.keys(tabsComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard", "Profile", "Security", "Logging", "Reports",
    ]);
  });

  it("deep nesting (3+ levels) produces full-path slot keys", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "MainNav" },
    }];

    const resolved = resolveNavigation(components, pages, navTree);
    const treeComp = resolved[0]!;

    expect(treeComp.slots!["Settings/Advanced/Logging"]).toBeDefined();
    expect(treeComp.slots!["Settings/Advanced/Logging"]![0]!.props?.["name"]).toBe("Logging");
  });

  it("same page under multiple groups produces distinct slots", () => {
    const multiNavTree = {
      root_items: [{
        type: "GROUP",
        id: "Multi",
        children: [
          { type: "GROUP", id: "A", children: [{ page: "Profile" }] },
          { type: "GROUP", id: "B", children: [{ page: "Profile" }] },
        ],
      }],
    };

    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "Multi" },
    }];

    const resolved = resolveNavigation(components, pages, multiNavTree);
    const treeComp = resolved[0]!;

    expect(treeComp.slots!["A/Profile"]).toBeDefined();
    expect(treeComp.slots!["B/Profile"]).toBeDefined();
  });

  it("tree without navTree falls back to flat slot names", () => {
    const components: Component[] = [{
      type: "tree",
      props: { navGroupId: "Missing" },
    }];

    const resolved = resolveNavigation(components, pages, undefined);
    const treeComp = resolved[0]!;
    const slotKeys = Object.keys(treeComp.slots!);

    expect(slotKeys).toEqual([
      "Dashboard", "Profile", "Security", "Logging", "Reports",
    ]);
  });

  it("tree ignores targetDivId (self-contained)", () => {
    const components: Component[] = [
      {
        type: "tree",
        props: { navGroupId: "MainNav", targetDivId: "some_div" },
      },
      {
        type: "slot-target",
        props: { id: "some_div" },
      },
    ];

    const resolved = resolveNavigation(components, pages, navTree);

    // Tree keeps its slots (targetDivId ignored)
    const treeComp = resolved.find(c => c.type === "tree")!;
    expect(treeComp.slots).toBeDefined();
    expect(Object.keys(treeComp.slots!).length).toBeGreaterThan(0);

    // slot-target is filtered out
    expect(resolved.find(c => c.type === "slot-target")).toBeUndefined();
  });
});
