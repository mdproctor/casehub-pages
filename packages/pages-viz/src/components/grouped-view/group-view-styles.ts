export const GROUPED_VIEW_CSS = `
:host {
  display: block;
  font-family: var(--pages-font-family, system-ui, sans-serif);
  font-size: var(--pages-font-size-base, 14px);
  color: var(--pages-neutral-12, #333);
}

.pages-grouped-view table {
  width: 100%;
  border-collapse: collapse;
}

.pages-grouped-view th {
  text-align: left;
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  border-bottom: 2px solid var(--pages-neutral-5, #ddd);
  white-space: nowrap;
}

.pages-grouped-view td {
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  border-bottom: 1px solid var(--pages-neutral-3, #eee);
}

.pages-grouped-view tr:nth-child(even) td {
  background: var(--pages-neutral-2, #fafafa);
}

.group-header td {
  background: var(--pages-neutral-3, #f5f5f5) !important;
  font-weight: var(--pages-font-weight-semibold, 600);
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  border-bottom: 1px solid var(--pages-neutral-5, #ddd);
}

.group-toggle {
  background: none;
  border: none;
  cursor: pointer;
  font: inherit;
  font-weight: var(--pages-font-weight-semibold, 600);
  color: var(--pages-neutral-12, #333);
  padding: 0;
  display: flex;
  align-items: center;
  gap: var(--pages-space-2, 8px);
}

.column-header-bar {
  display: grid;
  border-bottom: 2px solid var(--pages-neutral-5, #ddd);
}

.column-header-table {
  width: 100%;
  border-collapse: collapse;
}

.column-header-table th {
  text-align: left;
  padding: 0;
  border-bottom: 2px solid var(--pages-neutral-5, #ddd);
}

.col-header {
  background: none;
  border: none;
  cursor: pointer;
  text-align: left;
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  white-space: nowrap;
  width: 100%;
}

.col-label {
  text-align: left;
  padding: var(--pages-space-2, 8px) var(--pages-space-3, 12px);
  font-weight: var(--pages-font-weight-semibold, 600);
  font-size: var(--pages-font-size-sm, 12px);
  color: var(--pages-neutral-9, #666);
  white-space: nowrap;
}

.section-toggle {
  font-size: var(--pages-font-size-lg, 18px);
  font-weight: var(--pages-font-weight-semibold, 600);
  color: var(--pages-neutral-12, #333);
  background: none;
  border: none;
  padding: var(--pages-space-3, 12px) 0 var(--pages-space-2, 8px);
  cursor: pointer;
  display: flex;
  align-items: center;
  gap: var(--pages-space-2, 8px);
  width: 100%;
}

.section-chevron {
  font-size: var(--pages-font-size-sm, 12px);
  transition: transform var(--pages-duration-fast, 150ms) var(--pages-ease-default, ease);
  display: inline-block;
}

.section-chevron.expanded {
  transform: rotate(90deg);
}

.section-summary {
  font-size: var(--pages-font-size-sm, 12px);
  font-weight: var(--pages-font-weight-normal, 400);
  color: var(--pages-neutral-8, #888);
  margin-left: var(--pages-space-2, 8px);
}

.section-content {
  overflow: hidden;
  transition: max-height var(--pages-duration-normal, 250ms) var(--pages-ease-default, ease),
              opacity var(--pages-duration-fast, 150ms) var(--pages-ease-default, ease);
}

.section-content.collapsing {
  max-height: 0 !important;
  opacity: 0;
}

.aligned-list {
  display: grid;
  row-gap: 0;
  padding: 0 var(--pages-space-3, 12px);
}

.list-item {
  display: contents;
}

.list-item dd {
  margin: 0;
  padding: var(--pages-space-1, 4px) var(--pages-space-2, 8px);
  color: var(--pages-neutral-11, #444);
}

.list-item + .list-item dd {
  border-top: 1px solid var(--pages-neutral-3, #eee);
}

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}

@media (prefers-reduced-motion: reduce) {
  .section-content,
  .section-chevron {
    transition: none !important;
  }
}
`;
