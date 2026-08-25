import { createContainer } from "./container.js";
import type { Container, Entry, Layout, ContentFactory } from "./types.js";

export interface TreeLevel {
  layout: Layout;
  entryCount: number;
  nestedAt?: number;
}

export interface TreeSpec {
  levels: TreeLevel[];
}

export function simpleTestFactory(): ContentFactory {
  return (entry: Entry) => {
    if (entry.childContainer) {
      const el = document.createElement("div");
      el.dataset.childHost = entry.key;
      entry.childContainer.mount(el);
      return { element: el, dispose: () => entry.childContainer?.unmount() };
    }
    const el = document.createElement("div");
    el.textContent = `Leaf: ${entry.key}`;
    el.dataset.testLeaf = entry.key;
    return { element: el };
  };
}

export function buildContainerTree(spec: TreeSpec): {
  root: Container;
  containers: Map<string, Container>;
} {
  const containers = new Map<string, Container>();
  let keyCounter = 0;
  const nextKey = () => `e${keyCounter++}`;

  function buildLevel(levelIdx: number, depth: number): Container {
    const level = spec.levels[levelIdx]!;
    const entries: Entry[] = [];

    for (let i = 0; i < level.entryCount; i++) {
      const key = nextKey();
      const entry: Entry = {
        key,
        label: `${level.layout}[${i}]@d${depth}`,
        component: { type: "html", props: { content: key } },
      };

      if (i === (level.nestedAt ?? -1) && levelIdx + 1 < spec.levels.length) {
        const child = buildLevel(levelIdx + 1, depth + 1);
        entry.childContainer = child;
        entry.component = undefined;
      }

      entries.push(entry);
    }

    const container = createContainer({
      entries,
      layout: level.layout,
      contentFactory: simpleTestFactory(),
      depth,
      policy: { allowedLayouts: ["tabbed", "accordion", "free", "splith", "splitv"], maxDepth: 10 },
    });
    containers.set(`L${levelIdx}`, container);
    return container;
  }

  const root = buildLevel(0, 1);
  return { root, containers };
}
