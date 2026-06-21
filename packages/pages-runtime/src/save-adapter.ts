import type { DataSetId } from "@casehub/pages-data/dist/dataset/types.js";

export interface SaveAdapter {
  save(
    dataSetId: DataSetId,
    record: Readonly<Record<string, unknown>>,
    changedFields: readonly string[],
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;

  delete?(
    dataSetId: DataSetId,
    idColumn: string,
    idValue: unknown,
  ): Promise<SaveResult>;

  create?(
    dataSetId: DataSetId,
    record: Readonly<Record<string, unknown>>,
  ): Promise<SaveResult>;
}

export interface SaveResult {
  readonly success: boolean;
  readonly error?: string;
  readonly updatedRecord?: Readonly<Record<string, unknown>>;
}
