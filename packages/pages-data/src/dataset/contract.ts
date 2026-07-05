export interface DatasetContract<T = unknown> {
  readonly name: string;
  readonly description: string;
  readonly shape: T;
}
