export interface PlaybookFrontMatter {
  version: string;
  schema: string;
  name?: string;
  metadata: Record<string, unknown>;
}

export interface PlaybookDocument {
  frontMatter: PlaybookFrontMatter | null;
  content: Record<string, unknown>;
}

export const PLAYBOOK_SCHEMAS = {
  CLIENT: 'client',
  SERVER: 'server',
} as const;

export function isBuiltInSchema(schema: string): boolean {
  return schema === PLAYBOOK_SCHEMAS.CLIENT || schema === PLAYBOOK_SCHEMAS.SERVER;
}

export function isDomainSchema(schema: string | null | undefined): boolean {
  return schema != null && schema.includes('-') && !isBuiltInSchema(schema);
}

const PLAYBOOK_KEY = 'playbook';
const SCHEMA_KEY = 'schema';
const NAME_KEY = 'name';
const RESERVED_KEYS = new Set([PLAYBOOK_KEY, SCHEMA_KEY, NAME_KEY]);

export function parsePlaybookFrontMatter(
  firstDoc: Record<string, unknown>,
): PlaybookFrontMatter | null {
  if (!(PLAYBOOK_KEY in firstDoc)) return null;

  const version = String(firstDoc[PLAYBOOK_KEY]);
  const schema = firstDoc[SCHEMA_KEY];
  if (typeof schema !== 'string') {
    throw new Error("Playbook front matter requires a 'schema' field");
  }
  const name = typeof firstDoc[NAME_KEY] === 'string' ? firstDoc[NAME_KEY] : undefined;

  const metadata: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(firstDoc)) {
    if (!RESERVED_KEYS.has(key)) {
      metadata[key] = value;
    }
  }

  return { version, schema, name, metadata };
}
