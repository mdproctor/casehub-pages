export interface FilterState {
  readonly selectedChips: readonly string[];
  readonly selectedEntity: string | null;
  readonly dateFrom: string;
  readonly dateTo: string;
}

export const EMPTY_FILTER_STATE: FilterState = Object.freeze({
  selectedChips: Object.freeze([] as string[]),
  selectedEntity: null,
  dateFrom: '',
  dateTo: '',
});
