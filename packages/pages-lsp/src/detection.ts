import { parseDocument } from 'yaml';
import type { DocumentInspector } from './types.js';

function createInspector(content: string): DocumentInspector {
  const doc = parseDocument(content, { prettyErrors: false });
  const root = doc.toJSON() as Record<string, unknown> | null;

  return {
    hasKey(path: string[]): boolean {
      let current: unknown = root;
      for (const key of path) {
        if (current == null || typeof current !== 'object') return false;
        if (!(key in (current as Record<string, unknown>))) return false;
        current = (current as Record<string, unknown>)[key];
      }
      return true;
    },
    getKeys(path?: string[]): string[] {
      let current: unknown = root;
      if (path) {
        for (const key of path) {
          if (current == null || typeof current !== 'object') return [];
          current = (current as Record<string, unknown>)[key];
        }
      }
      if (current == null || typeof current !== 'object') return [];
      return Object.keys(current as Record<string, unknown>);
    },
  };
}

const EXTENSION_MAP: Record<string, string> = {
  '.page.yaml': 'page',

  '.case.yaml': 'case-definition',
  '.swf.yaml': 'swf',
  '.htn.yaml': 'htn',
  '.org.yaml': 'org',
};

export function detectFormat(
  filename: string,
  content: string,
): string | undefined {
  for (const [ext, formatId] of Object.entries(EXTENSION_MAP)) {
    if (filename.endsWith(ext)) return formatId;
  }

  if (
    !filename.endsWith('.yaml') &&
    !filename.endsWith('.yml')
  ) {
    return undefined;
  }

  if (!content.trim()) return undefined;

  const inspector = createInspector(content);

  if (inspector.hasKey(['organization'])) return 'org';
  if (inspector.hasKey(['do'])) return 'swf';
  if (inspector.hasKey(['pages']) || inspector.hasKey(['datasets'])) return 'page';
  if (inspector.hasKey(['dsl']) && inspector.hasKey(['spec'])) {
    if (
      inspector.hasKey(['spec', 'bindings']) ||
      inspector.hasKey(['spec', 'workers']) ||
      inspector.hasKey(['spec', 'capabilities'])
    ) {
      return 'case-definition';
    }
    if (inspector.hasKey(['spec', 'decomposition'])) return 'htn';
  }

  return undefined;
}
