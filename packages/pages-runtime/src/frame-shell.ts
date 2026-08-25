export interface PositionedState {
  position: { x: number; y: number };
  size: { width: number; height: number };
}

export function createFrameShell(
  key: string,
  pos: { x: number; y: number },
  size: { width: number; height: number },
): HTMLElement {
  const frame = document.createElement("div");
  frame.setAttribute("data-frame-key", key);
  frame.style.cssText =
    `position:absolute;pointer-events:auto;` +
    `left:${pos.x}px;top:${pos.y}px;` +
    `width:${size.width}px;height:${size.height}px;` +
    `display:flex;flex-direction:column;` +
    `background:var(--pages-neutral-2,#1e1e1e);` +
    `border:1px solid var(--pages-neutral-4,#333);` +
    `border-radius:6px;overflow:hidden;`;
  return frame;
}

export function createFrameTitlebar(): HTMLElement {
  const titlebar = document.createElement("div");
  titlebar.setAttribute("data-frame-titlebar", "");
  titlebar.style.cssText =
    "display:flex;align-items:center;padding:4px 8px;" +
    "background:var(--pages-surface-2,#2a2a2a);cursor:grab;" +
    "user-select:none;border-bottom:1px solid var(--pages-border-1,#333);";
  return titlebar;
}

export function createFrameResizeHandles(
  frameEl: HTMLElement,
  state: PositionedState,
  onResize?: (key: string, width: number, height: number) => void,
  key?: string,
): void {
  const MIN_WIDTH = 100;
  const MIN_HEIGHT = 80;
  const handles = ["n", "s", "e", "w", "ne", "nw", "se", "sw"];
  const cursors: Record<string, string> = {
    n: "ns-resize", s: "ns-resize", e: "ew-resize", w: "ew-resize",
    ne: "nesw-resize", nw: "nwse-resize", se: "nwse-resize", sw: "nesw-resize",
  };

  for (const dir of handles) {
    const handle = document.createElement("div");
    handle.setAttribute("data-resize-handle", dir);
    handle.style.cssText = `position:absolute;z-index:10;cursor:${cursors[dir]};`;

    const sz = "8px";
    const offset = "-3px";
    if (dir.includes("n")) { handle.style.top = offset; handle.style.height = sz; }
    if (dir.includes("s")) { handle.style.bottom = offset; handle.style.height = sz; }
    if (dir.includes("e")) { handle.style.right = offset; handle.style.width = sz; }
    if (dir.includes("w")) { handle.style.left = offset; handle.style.width = sz; }
    if (dir === "n" || dir === "s") { handle.style.left = sz; handle.style.right = sz; }
    if (dir === "e" || dir === "w") { handle.style.top = sz; handle.style.bottom = sz; }
    if (dir.length === 2) { handle.style.width = sz; handle.style.height = sz; }

    handle.addEventListener("pointerdown", (startEvt) => {
      startEvt.stopPropagation();
      startEvt.preventDefault();
      document.body.style.userSelect = "none";
      const startX = startEvt.clientX;
      const startY = startEvt.clientY;
      const startW = state.size.width;
      const startH = state.size.height;
      const startLeft = state.position.x;
      const startTop = state.position.y;

      const onMove = (e: PointerEvent) => {
        const dx = e.clientX - startX;
        const dy = e.clientY - startY;
        let newW = startW, newH = startH, newX = startLeft, newY = startTop;

        if (dir.includes("e")) newW = Math.max(MIN_WIDTH, startW + dx);
        if (dir.includes("w")) { newW = Math.max(MIN_WIDTH, startW - dx); newX = startLeft + startW - newW; }
        if (dir.includes("s")) newH = Math.max(MIN_HEIGHT, startH + dy);
        if (dir.includes("n")) { newH = Math.max(MIN_HEIGHT, startH - dy); newY = startTop + startH - newH; }

        state.size = { width: newW, height: newH };
        state.position = { x: newX, y: newY };
        frameEl.style.width = `${newW}px`;
        frameEl.style.height = `${newH}px`;
        frameEl.style.left = `${newX}px`;
        frameEl.style.top = `${newY}px`;
      };

      const onUp = () => {
        document.body.style.userSelect = "";
        document.removeEventListener("pointermove", onMove);
        document.removeEventListener("pointerup", onUp);
        if (onResize && key) onResize(key, state.size.width, state.size.height);
      };

      document.addEventListener("pointermove", onMove);
      document.addEventListener("pointerup", onUp);
    });

    frameEl.appendChild(handle);
  }
}

export function wireTitlebarDrag(
  titlebar: HTMLElement,
  frameEl: HTMLElement,
  state: PositionedState,
  onMove?: (key: string, x: number, y: number) => void,
  key?: string,
): void {
  titlebar.addEventListener("pointerdown", (startEvt) => {
    if ((startEvt.target as HTMLElement).closest(
      ".frame-close-dot, .frame-pin-btn, .frame-extra-btn, .frame-detach-dot"
    )) return;
    startEvt.preventDefault();
    const startX = startEvt.clientX;
    const startY = startEvt.clientY;
    const startLeft = state.position.x;
    const startTop = state.position.y;

    const onPointerMove = (e: PointerEvent) => {
      state.position = { x: startLeft + e.clientX - startX, y: startTop + e.clientY - startY };
      frameEl.style.left = `${state.position.x}px`;
      frameEl.style.top = `${state.position.y}px`;
    };
    const onUp = () => {
      document.removeEventListener("pointermove", onPointerMove);
      document.removeEventListener("pointerup", onUp);
      if (onMove && key) onMove(key, state.position.x, state.position.y);
    };
    document.addEventListener("pointermove", onPointerMove);
    document.addEventListener("pointerup", onUp);
  });
}
