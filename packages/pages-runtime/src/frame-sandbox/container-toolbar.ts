import type { Layout } from "./types.js";

export interface ContainerToolbarCallbacks {
  onAdd: () => void;
  onLayoutChange: (type: Layout) => void;
  onArrange?: (preset: string) => void;
}

export interface ContainerToolbar {
  readonly element: HTMLElement;
  setActive(type: Layout): void;
  dispose(): void;
}

export function createContainerToolbar(
  allowedOrganisers: readonly Layout[],
  activeOrganiser: Layout,
  callbacks: ContainerToolbarCallbacks,
): ContainerToolbar {
  const bar = document.createElement("div");
  bar.setAttribute("data-container-toolbar", "");
  bar.style.cssText =
    "display:flex;align-items:center;padding:2px 4px;" +
    "gap:2px;user-select:none;" +
    "position:absolute;bottom:4px;right:4px;z-index:5;";

  const spacer = document.createElement("span");
  spacer.style.cssText = "flex:1;";
  bar.appendChild(spacer);

  const containerModes: Layout[] = allowedOrganisers.filter(o => o !== "content");
  let currentMode = activeOrganiser;
  let arrangeEl: HTMLElement | null = null;

  if (callbacks.onArrange) {
    const arrangeCb = callbacks.onArrange;
    const arrangeBtn = document.createElement("span");
    arrangeBtn.setAttribute("data-toolbar-arrange", "");
    arrangeBtn.textContent = "⊞";
    arrangeBtn.title = "Arrange frames";
    arrangeBtn.style.cssText =
      "cursor:pointer;padding:2px 6px;font-size:12px;opacity:0.5;position:relative;";
    arrangeBtn.addEventListener("mouseenter", () => { arrangeBtn.style.opacity = "1"; });
    arrangeBtn.addEventListener("mouseleave", () => { arrangeBtn.style.opacity = "0.5"; });

    const PRESETS: ReadonlyArray<{ key: string; icon: string; title: string }> = [
      { key: "side-by-side", icon: "⬜⬜", title: "Side by side" },
      { key: "stacked", icon: "☰", title: "Stacked" },
      { key: "grid", icon: "⊞", title: "Grid" },
      { key: "main-sidebar", icon: "⬜▫", title: "Main + Sidebar" },
      { key: "focus", icon: "◻", title: "Focus" },
    ];

    const dropdown = document.createElement("div");
    dropdown.className = "arrange-dropdown";
    dropdown.style.cssText =
      "display:none;position:absolute;bottom:100%;right:0;z-index:99999;" +
      "background:var(--pages-neutral-2,#222);border:1px solid var(--pages-neutral-4,#444);" +
      "border-radius:var(--pages-radius-sm,4px);padding:4px 0;min-width:140px;" +
      "box-shadow:0 4px 12px rgba(0,0,0,0.3);";

    for (const preset of PRESETS) {
      const item = document.createElement("div");
      item.dataset.preset = preset.key;
      item.style.cssText = "padding:4px 12px;cursor:pointer;font-size:12px;white-space:nowrap;display:flex;align-items:center;gap:6px;";
      item.innerHTML = `<span style="font-size:10px;width:20px;text-align:center;">${preset.icon}</span><span>${preset.title}</span>`;
      item.addEventListener("mouseenter", () => { item.style.background = "var(--pages-neutral-4,#444)"; });
      item.addEventListener("mouseleave", () => { item.style.background = ""; });
      item.addEventListener("click", (ev) => {
        ev.stopPropagation();
        arrangeCb(preset.key);
        dropdown.style.display = "none";
      });
      dropdown.appendChild(item);
    }

    arrangeBtn.appendChild(dropdown);
    arrangeBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      dropdown.style.display = dropdown.style.display === "none" ? "block" : "none";
    });
    const closeDropdown = () => { dropdown.style.display = "none"; };
    document.addEventListener("click", closeDropdown);

    arrangeEl = arrangeBtn;
    bar.appendChild(arrangeBtn);
  }

  const modeBtn = document.createElement("span");
  modeBtn.setAttribute("data-toolbar-mode", "");
  modeBtn.textContent = "☰";
  modeBtn.title = "Cycle view mode";
  modeBtn.style.cssText =
    "cursor:pointer;padding:2px 6px;font-size:12px;border-radius:3px;opacity:0.5;";

  if (containerModes.length <= 1) {
    modeBtn.style.display = "none";
  }

  modeBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const idx = containerModes.indexOf(currentMode);
    const next = containerModes[(idx + 1) % containerModes.length]!;
    currentMode = next;
    callbacks.onLayoutChange(next);
  });
  bar.appendChild(modeBtn);

  const addBtn = document.createElement("span");
  addBtn.setAttribute("data-toolbar-add", "");
  addBtn.textContent = "+";
  addBtn.title = "Add frame";
  addBtn.style.cssText =
    "cursor:pointer;padding:2px 6px;font-size:14px;font-weight:bold;opacity:0.5;";
  addBtn.addEventListener("mouseenter", () => { addBtn.style.opacity = "1"; });
  addBtn.addEventListener("mouseleave", () => { addBtn.style.opacity = "0.5"; });
  addBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    callbacks.onAdd();
  });
  bar.appendChild(addBtn);

  function applyMode(type: Layout): void {
    currentMode = type;
    if (type === "content") {
      bar.style.display = "none";
    } else {
      bar.style.display = "flex";
      if (arrangeEl) {
        arrangeEl.style.display = type === "free" ? "" : "none";
      }
    }
  }

  applyMode(activeOrganiser);

  return {
    element: bar,
    setActive: applyMode,
    dispose() {
      bar.remove();
    },
  };
}
