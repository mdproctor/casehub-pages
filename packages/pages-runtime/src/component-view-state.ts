import type { SortColumn } from "@casehubio/pages-data/dist/dataset/sort.js";

export interface ComponentState {
  readonly sort?: SortColumn;
  readonly page?: number;
}

export type ComponentViewState = Map<string, ComponentState>;

export function createComponentViewState(): ComponentViewState {
  return new Map();
}

export function updateSort(
  state: ComponentViewState,
  componentId: string,
  sort: SortColumn | undefined,
): void {
  const existing = state.get(componentId);
  if (sort === undefined) {
    if (existing?.page !== undefined) {
      state.set(componentId, { page: existing.page });
    } else {
      state.delete(componentId);
    }
  } else {
    state.set(componentId, { ...existing, sort });
  }
}

export function updatePage(
  state: ComponentViewState,
  componentId: string,
  page: number | undefined,
): void {
  const existing = state.get(componentId);
  if (page === undefined) {
    if (existing?.sort !== undefined) {
      state.set(componentId, { sort: existing.sort });
    } else {
      state.delete(componentId);
    }
  } else {
    state.set(componentId, { ...existing, page });
  }
}

export function getComponentState(
  state: ComponentViewState,
  componentId: string,
): ComponentState | undefined {
  return state.get(componentId);
}
