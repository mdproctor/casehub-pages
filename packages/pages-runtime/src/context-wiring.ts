import type {
  RuntimeContext,
  DataSetSnapshot,
  EscapeMode,
} from "@casehubio/pages-component";
import {
  EMPTY_CONTEXT,
  resolveTemplate,
  evaluateExpression,
} from "@casehubio/pages-component";
import type {
  TypedDataSet,
  DataSetId,
} from "@casehubio/pages-data";

export interface ContextConsumer {
  element: Element;
  templates: Map<
    string,
    {
      template: string;
      escapeMode: EscapeMode;
      lastResolved: string;
      apply: (value: string) => void;
    }
  >;
  visibleWhen?: {
    expression: string;
    lastResult: boolean;
    onSuspend: () => void;
    onResume: () => void;
  };
  suspended: boolean;
}

const MAX_CASCADE_DEPTH = 10;

export class ContextManager {
  #context: RuntimeContext = EMPTY_CONTEXT;
  #consumers: Set<ContextConsumer> = new Set();
  #cascadeDepth = 0;

  getContext(): RuntimeContext {
    return this.#context;
  }

  updateFilter(filter: Record<string, readonly string[]>): void {
    this.#context = { ...this.#context, filter };
    this.evaluateAll();
  }

  updateDataset(id: DataSetId, dataset: TypedDataSet): void {
    const snapshot = buildSnapshot(dataset);
    this.#context = {
      ...this.#context,
      datasets: { ...this.#context.datasets, [id as string]: snapshot },
    };
    this.evaluateAll();
  }

  updatePage(name: string, path: string): void {
    this.#context = { ...this.#context, page: { name, path } };
    this.evaluateAll();
  }

  updateParams(params: Record<string, string>): void {
    this.#context = { ...this.#context, params };
    this.evaluateAll();
  }

  updateSelection(datasetId: string, row: Record<string, unknown> | null): void {
    const { [datasetId]: _, ...rest } = this.#context.selection;
    this.#context = {
      ...this.#context,
      selection: row ? { ...rest, [datasetId]: row } : rest,
    };
    this.evaluateAll();
  }

  clearAllSelections(): void {
    if (Object.keys(this.#context.selection).length === 0) return;
    this.#context = { ...this.#context, selection: {} };
    this.evaluateAll();
  }

  registerConsumer(consumer: ContextConsumer): void {
    this.#consumers.add(consumer);
    // Evaluate immediately to set initial state
    this.#evaluateConsumer(consumer);
  }

  deregisterConsumer(element: Element): void {
    for (const consumer of this.#consumers) {
      if (consumer.element === element) {
        this.#consumers.delete(consumer);
        break;
      }
    }
  }

  evaluateAll(): void {
    // Check depth BEFORE incrementing
    if (this.#cascadeDepth >= MAX_CASCADE_DEPTH) {
      console.warn(
        `ContextManager: cascade depth limit (${MAX_CASCADE_DEPTH}) reached — halting evaluation to prevent infinite loop`,
      );
      return;
    }

    this.#cascadeDepth++;
    try {
      const staleConsumers: ContextConsumer[] = [];

      for (const consumer of this.#consumers) {
        // Prune stale consumers with disconnected elements
        if (!consumer.element.isConnected) {
          staleConsumers.push(consumer);
          continue;
        }

        this.#evaluateConsumer(consumer);
      }

      // Delete stale consumers after iteration to avoid iterator issues
      for (const consumer of staleConsumers) {
        this.#consumers.delete(consumer);
      }
    } finally {
      this.#cascadeDepth--;
    }
  }

  #evaluateConsumer(consumer: ContextConsumer): void {
    // Handle visibleWhen suspension
    if (consumer.visibleWhen) {
      const currentResult = evaluateExpression(
        consumer.visibleWhen.expression,
        this.#context,
      );

      if (currentResult !== consumer.visibleWhen.lastResult) {
        consumer.visibleWhen.lastResult = currentResult;

        if (currentResult) {
          // Transition to visible
          consumer.suspended = false;
          consumer.visibleWhen.onResume();
        } else {
          // Transition to hidden
          consumer.suspended = true;
          consumer.visibleWhen.onSuspend();
        }
      }
    }

    // Skip template evaluation if suspended
    if (consumer.suspended) {
      return;
    }

    // Evaluate all templates
    for (const [, entry] of consumer.templates) {
      const resolved = resolveTemplate(
        entry.template,
        this.#context,
        entry.escapeMode,
      );

      if (resolved !== entry.lastResolved) {
        entry.lastResolved = resolved;
        entry.apply(resolved);
      }
    }
  }
}

function buildSnapshot(dataset: TypedDataSet): DataSetSnapshot {
  const rowCount = dataset.rows.length;
  const columns = dataset.columns.map((col) => col.id as string);

  if (rowCount === 0) {
    return { rowCount, columns };
  }

  const firstRow = dataset.rows[0];
  if (!firstRow) {
    return { rowCount, columns };
  }

  const first: Record<string, string | number | null> = {};

  for (let i = 0; i < dataset.columns.length; i++) {
    const column = dataset.columns[i];
    if (!column) continue;

    const columnId = column.id;
    const cell = firstRow.cells[i];
    if (!cell) continue;

    let value: string | number | null;

    if (cell.type === "NULL") {
      value = null;
    } else if (cell.type === "DATE") {
      value = cell.value.toISOString();
    } else {
      value = cell.value;
    }

    first[columnId as string] = value;
  }

  return { rowCount, columns, first };
}
