import { getRegisteredStyles } from '../registry/stencil-registry.js';
import reactFlowCSS from '@xyflow/react/dist/style.css?raw';

export const DIAGRAM_ROOT_CLASS = 'diagram-root';

export function getIsolationCSS(): string {
  const pluginStyles = getRegisteredStyles();

  return `
.${DIAGRAM_ROOT_CLASS} {
  all: initial;
  display: block;
  position: relative;
  width: 100%;
  height: 100%;
  box-sizing: border-box;
}

${reactFlowCSS}

${pluginStyles}

.react-flow__controls {
  background: var(--pages-neutral-1, #fafafa);
  border: 1px solid var(--pages-neutral-4, #ccc);
  border-radius: var(--pages-radius-md, 8px);
}
.react-flow__controls-button {
  background: var(--pages-neutral-1, #fafafa);
  border-bottom: 1px solid var(--pages-neutral-3, #ddd);
  color: var(--pages-text-primary, #111);
  fill: var(--pages-text-primary, #111);
}
.react-flow__controls-button:hover {
  background: var(--pages-neutral-2, #f0f0f0);
}
.react-flow__handle {
  opacity: 0;
  width: 1px;
  height: 1px;
  border: none;
  background: transparent;
  pointer-events: all;
}
.stencil-source-handle {
  cursor: crosshair;
  pointer-events: all;
}
.graph-connecting .stencil-source-handle {
  pointer-events: none !important;
  cursor: default;
}
.graph-connecting .react-flow__connectionline,
.graph-connecting .react-flow__connection,
.graph-connecting .react-flow__edges,
.graph-connecting .react-flow__edge-interaction {
  pointer-events: none !important;
}
.graph-connecting .react-flow__node:hover .stencil-decoration-wrapper {
  outline: 2px solid var(--pages-success-9, #16a34a);
  outline-offset: 2px;
  box-shadow: 0 0 12px 4px rgba(22, 163, 106, 0.25), inset 0 0 8px rgba(22, 163, 106, 0.1);
}
.graph-connecting .react-flow__node.connecting .stencil-decoration-wrapper {
  outline: 2px solid var(--pages-accent-9, #5470c6);
  outline-offset: 2px;
}
.stencil-decoration-wrapper {
  position: relative;
  z-index: 1;
  transition: box-shadow 0.15s;
  border-radius: 8px;
}
.react-flow__node.selected .stencil-decoration-wrapper {
  outline: 3px solid var(--pages-accent-9, #5470c6);
  outline-offset: 2px;
}
.react-flow__node.connecting .stencil-decoration-wrapper {
  box-shadow: 0 0 0 2px var(--pages-accent-9, #5470c6);
  border-radius: 8px;
}
.react-flow__handle-valid ~ .stencil-decoration-wrapper,
.react-flow__node:has(.react-flow__handle-valid) .stencil-decoration-wrapper {
  box-shadow: 0 0 8px 2px var(--pages-success-9, #16a34a);
  border-radius: 8px;
}
.node-move-active .react-flow__connectionline {
  display: none !important;
}
.node-move-active .react-flow__edge-interaction {
  stroke-width: 30px !important;
  pointer-events: stroke !important;
}
.node-move-ghost .stencil-decoration-wrapper {
  opacity: 0.3;
  pointer-events: none;
  transition: opacity 120ms ease-out;
}
.edge-splice-valid .react-flow__edge-path {
  stroke: var(--pages-success-9, #16a34a) !important;
  stroke-width: 4px !important;
  filter: drop-shadow(0 0 8px var(--pages-success-9, #16a34a)) drop-shadow(0 0 16px var(--pages-success-9, #16a34a));
  transition: stroke-width 100ms, filter 100ms;
}
`.trim();
}

interface StyleEntry {
  count: number;
  style: HTMLStyleElement;
}

const styleRoots = new WeakMap<Document | ShadowRoot, StyleEntry>();

function getStyleRoot(host?: HTMLElement): Document | ShadowRoot {
  if (host) {
    const root = host.getRootNode();
    if (root instanceof ShadowRoot) return root;
  }
  return document;
}

export function injectIsolationStyles(host?: HTMLElement): HTMLStyleElement {
  const root = getStyleRoot(host);
  const target = root instanceof ShadowRoot ? root : document.head;
  const entry = styleRoots.get(root);

  if (entry) {
    entry.count++;
    entry.style.textContent = getIsolationCSS();
    return entry.style;
  }

  const style = document.createElement('style');
  style.setAttribute('data-graph-isolation', 'true');
  style.textContent = getIsolationCSS();
  target.appendChild(style);
  styleRoots.set(root, { count: 1, style });
  return style;
}

export function releaseIsolationStyles(host?: HTMLElement): void {
  const root = getStyleRoot(host);
  const entry = styleRoots.get(root);
  if (!entry) return;
  entry.count--;
  if (entry.count === 0) {
    entry.style.remove();
    styleRoots.delete(root);
  }
}

export function resetIsolationState(): void {
  const docEntry = styleRoots.get(document);
  if (docEntry) {
    docEntry.style.remove();
    styleRoots.delete(document);
  }
}
