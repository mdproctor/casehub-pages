import { toSvg, toPng } from 'html-to-image';

export interface ExportBounds {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

export interface ExportViewport {
  readonly x: number;
  readonly y: number;
  readonly zoom: number;
}

interface NodeLike {
  readonly position: { readonly x: number; readonly y: number };
  readonly measured?: { readonly width?: number; readonly height?: number };
  readonly width?: number;
  readonly height?: number;
}

const DEFAULT_NODE_WIDTH = 150;
const DEFAULT_NODE_HEIGHT = 40;
const DEFAULT_PADDING = 20;
const MIN_ZOOM = 0.5;
const EXPORT_WIDTH = 1920;
const EXPORT_HEIGHT = 1080;

export function computeNodeBounds(nodes: ReadonlyArray<NodeLike>): ExportBounds {
  if (nodes.length === 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  for (const node of nodes) {
    const x = node.position.x;
    const y = node.position.y;
    const w = node.measured?.width ?? node.width ?? DEFAULT_NODE_WIDTH;
    const h = node.measured?.height ?? node.height ?? DEFAULT_NODE_HEIGHT;

    if (x < minX) minX = x;
    if (y < minY) minY = y;
    if (x + w > maxX) maxX = x + w;
    if (y + h > maxY) maxY = y + h;
  }

  return { x: minX, y: minY, width: maxX - minX, height: maxY - minY };
}

export function computeExportViewport(
  bounds: ExportBounds,
  targetWidth: number,
  targetHeight: number,
  padding = DEFAULT_PADDING,
): ExportViewport {
  if (bounds.width === 0 || bounds.height === 0) {
    return { x: 0, y: 0, zoom: 1 };
  }

  const paddedWidth = bounds.width + padding * 2;
  const paddedHeight = bounds.height + padding * 2;

  const zoom = Math.min(
    targetWidth / paddedWidth,
    targetHeight / paddedHeight,
  );
  const clampedZoom = Math.max(MIN_ZOOM, zoom);

  const x = (targetWidth - paddedWidth * clampedZoom) / 2 - (bounds.x - padding) * clampedZoom;
  const y = (targetHeight - paddedHeight * clampedZoom) / 2 - (bounds.y - padding) * clampedZoom;

  return { x, y, zoom: clampedZoom };
}

const EXCLUDED_CLASSES = ['react-flow__minimap', 'react-flow__controls'];

function exportFilter(el: HTMLElement): boolean {
  if (!el.classList) return true;
  return !EXCLUDED_CLASSES.some(cls => el.classList.contains(cls));
}

const KEPT_STYLE_PROPS = new Set([
  'color', 'opacity', 'visibility', 'cursor',
  'background', 'background-color', 'background-image', 'background-size',
  'background-position', 'background-repeat',
  'border', 'border-top', 'border-right', 'border-bottom', 'border-left',
  'border-color', 'border-style', 'border-width', 'border-radius',
  'outline', 'outline-color', 'outline-style', 'outline-width',
  'box-shadow',
  'font', 'font-family', 'font-size', 'font-weight', 'font-style',
  'line-height', 'letter-spacing', 'text-align', 'text-decoration',
  'text-transform', 'text-overflow', 'white-space', 'word-break',
  'overflow', 'overflow-x', 'overflow-y',
  'display', 'position', 'top', 'right', 'bottom', 'left',
  'width', 'height', 'min-width', 'min-height', 'max-width', 'max-height',
  'margin', 'margin-top', 'margin-right', 'margin-bottom', 'margin-left',
  'padding', 'padding-top', 'padding-right', 'padding-bottom', 'padding-left',
  'flex', 'flex-direction', 'flex-wrap', 'flex-grow', 'flex-shrink', 'flex-basis',
  'justify-content', 'align-items', 'align-self', 'gap', 'row-gap', 'column-gap',
  'grid-template-columns', 'grid-template-rows', 'grid-column', 'grid-row',
  'transform', 'transform-origin', 'z-index', 'box-sizing',
  'fill', 'stroke', 'stroke-width', 'stroke-dasharray', 'stroke-linecap',
  'stroke-linejoin', 'stroke-opacity', 'fill-opacity',
]);

function stripBloatedStyles(svgDataUrl: string): string {
  return svgDataUrl.replace(/style="([^"]*)"/g, (_match, styleStr: string) => {
    const kept: string[] = [];
    for (const decl of styleStr.split(';')) {
      const colon = decl.indexOf(':');
      if (colon < 0) continue;
      const prop = decl.substring(0, colon).trim();
      if (KEPT_STYLE_PROPS.has(prop)) kept.push(decl.trim());
    }
    return kept.length > 0 ? `style="${kept.join('; ')}"` : '';
  });
}

export type ExportFormat = 'svg' | 'png';

export async function exportDiagram(
  canvasElement: HTMLElement,
  nodes: ReadonlyArray<NodeLike>,
  format: ExportFormat,
  filename?: string,
  pixelRatio = 2,
): Promise<void> {
  const viewport = canvasElement.querySelector<HTMLElement>('.react-flow__viewport');
  if (!viewport) {
    throw new Error('Cannot export: React Flow viewport not found');
  }

  const bounds = computeNodeBounds(nodes);
  const vp = computeExportViewport(bounds, EXPORT_WIDTH, EXPORT_HEIGHT);

  const exportFn = format === 'svg' ? toSvg : toPng;
  const ext = format === 'svg' ? '.svg' : '.png';
  const name = (filename ?? 'diagram') + ext;

  const opts: Record<string, unknown> = {
    width: EXPORT_WIDTH,
    height: EXPORT_HEIGHT,
    style: {
      width: `${EXPORT_WIDTH}px`,
      height: `${EXPORT_HEIGHT}px`,
      transform: `translate(${vp.x}px, ${vp.y}px) scale(${vp.zoom})`,
    },
    filter: exportFilter,
    skipFonts: true,
  };
  if (format === 'png') {
    opts.pixelRatio = pixelRatio;
  }

  let dataUrl = await exportFn(viewport, opts);

  if (format === 'svg') {
    const decoded = decodeURIComponent(dataUrl.split(',')[1] ?? '');
    const stripped = stripBloatedStyles(decoded);
    dataUrl = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(stripped);
  }

  const response = await fetch(dataUrl);
  const blob = await response.blob();
  const blobUrl = URL.createObjectURL(blob);

  const link = document.createElement('a');
  link.download = name;
  link.href = blobUrl;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(blobUrl);
}
