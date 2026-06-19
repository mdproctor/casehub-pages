export type EditState = Map<string, Map<string, unknown>>;

export function createEditState(): EditState {
  return new Map();
}

export function updateEditState(
  state: EditState,
  pagePath: string,
  field: string,
  value: unknown,
): void {
  let pageState = state.get(pagePath);
  if (!pageState) {
    pageState = new Map();
    state.set(pagePath, pageState);
  }
  pageState.set(field, value);
}

export function clearEditState(state: EditState, pagePath: string): void {
  state.delete(pagePath);
}

export function getEditState(state: EditState, pagePath: string): ReadonlyMap<string, unknown> | undefined {
  return state.get(pagePath);
}

export function isDirty(state: EditState, pagePath: string): boolean {
  const ps = state.get(pagePath);
  return ps !== undefined && ps.size > 0;
}
