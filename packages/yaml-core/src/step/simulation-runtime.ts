export type DataRealism =
  | 'GARBAGE' | 'PLACEHOLDER' | 'STRUCTURALLY_VALID'
  | 'DOMAIN_PLAUSIBLE' | 'RECORDED_REAL';

export interface JournalEntry {
  readonly qualifiedName: string;
  readonly tenancyId: string;
  readonly input: unknown;
  readonly output: unknown;
  readonly timestamp: number;
  readonly dataRealism: DataRealism;
}

export type CorpusEntry =
  | { file: string }
  | { inline: Record<string, Array<{ input: unknown; output: unknown }>> };

export interface SimulationConfig {
  strategies: Record<string, string>;
  corpus: CorpusEntry[];
  capture: string[];
  fallthroughRealism?: Record<string, DataRealism>;
}

export class InvocationJournal {
  private readonly _entries: JournalEntry[] = [];

  record(qualifiedName: string, tenancyId: string, input: unknown,
         output: unknown, dataRealism: DataRealism): void {
    this._entries.push({
      qualifiedName, tenancyId, input, output,
      timestamp: Date.now(), dataRealism,
    });
  }

  entries(): readonly JournalEntry[] { return this._entries; }

  entriesFor(qualifiedName: string): readonly JournalEntry[] {
    return this._entries.filter(e => e.qualifiedName === qualifiedName);
  }

  countFor(qualifiedName: string): number {
    return this._entries.filter(e => e.qualifiedName === qualifiedName).length;
  }
}

export class SimulationOverlay {
  readonly journal = new InvocationJournal();
  constructor(readonly config: SimulationConfig) {}
}

export class SimulationRuntime {
  private readonly overlayStack: SimulationOverlay[] = [];

  pushOverlay(config: SimulationConfig): SimulationOverlay {
    const overlay = new SimulationOverlay(config);
    this.overlayStack.push(overlay);
    return overlay;
  }

  popOverlay(overlay: SimulationOverlay): void {
    const idx = this.overlayStack.indexOf(overlay);
    if (idx >= 0) this.overlayStack.splice(idx, 1);
  }

  popAll(): void { this.overlayStack.length = 0; }

  hasActiveOverlay(): boolean { return this.overlayStack.length > 0; }

  strategyFor(qualifiedName: string): string | undefined {
    for (let i = this.overlayStack.length - 1; i >= 0; i--) {
      const s = this.overlayStack[i]!.config.strategies[qualifiedName];
      if (s !== undefined) return s;
    }
    return undefined;
  }

  activeJournal(): InvocationJournal | undefined {
    return this.overlayStack.length > 0
      ? this.overlayStack[this.overlayStack.length - 1]!.journal
      : undefined;
  }

  recordJournal(qualifiedName: string, tenancyId: string, input: unknown,
                output: unknown, dataRealism: DataRealism): void {
    const journal = this.activeJournal();
    if (journal) journal.record(qualifiedName, tenancyId, input, output, dataRealism);
  }

  fallthroughRealism(qualifiedName: string): DataRealism {
    for (let i = this.overlayStack.length - 1; i >= 0; i--) {
      const fr = this.overlayStack[i]!.config.fallthroughRealism;
      if (fr && fr[qualifiedName] !== undefined) return fr[qualifiedName]!;
    }
    return 'RECORDED_REAL';
  }
}
