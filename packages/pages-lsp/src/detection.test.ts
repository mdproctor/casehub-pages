import { describe, it, expect } from 'vitest';
import { detectFormat } from './detection.js';

describe('detectFormat', () => {
  it('detects Page by .page.yaml extension', () => {
    expect(detectFormat('app.page.yaml', '')).toBe('page');
  });

  it('detects Page by .page.yaml extension (transition)', () => {
    expect(detectFormat('old.page.yaml', '')).toBe('page');
  });

  it('detects Page by content (pages key)', () => {
    expect(detectFormat('config.yaml', 'pages:\n  - name: Home\n')).toBe('page');
  });

  it('detects Page by content (datasets key)', () => {
    expect(detectFormat('data.yaml', 'datasets:\n  - uuid: abc\n')).toBe('page');
  });

  it('detects CaseDefinition by content', () => {
    const yaml = 'dsl: "1.0"\nspec:\n  bindings:\n    - name: b1\n';
    expect(detectFormat('flow.yaml', yaml)).toBe('case-definition');
  });

  it('detects SWF by content', () => {
    const yaml = 'do:\n  - greet:\n      call: http\n';
    expect(detectFormat('workflow.yaml', yaml)).toBe('swf');
  });

  it('detects Org by content', () => {
    const yaml = 'organization:\n  units:\n    - unitId: eng\n';
    expect(detectFormat('org.yaml', yaml)).toBe('org');
  });

  it('returns undefined for unrecognised YAML', () => {
    expect(detectFormat('random.yaml', 'foo: bar\n')).toBeUndefined();
  });
});
