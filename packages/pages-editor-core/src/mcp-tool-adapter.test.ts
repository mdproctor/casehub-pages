import { describe, it, expect, vi } from 'vitest';
import type { EditableText, Position, EditSession } from './types.js';
import { EditSessionActiveError } from './types.js';
import { McpToolAdapter } from './mcp-tool-adapter.js';

function createMockEditableText(content = 'hello world'): EditableText & Record<string, any> {
  let text = content;
  let cursor: Position = { line: 0, col: 0 };
  let session: EditSession | null = null;

  return {
    getText: vi.fn(() => text),
    getLine: vi.fn((line: number) => text.split('\n')[line] ?? ''),
    getLineCount: vi.fn(() => text.split('\n').length),
    setContent: vi.fn((t: string) => { text = t; }),
    findText: vi.fn((query: string) => {
      const results: Position[] = [];
      const lines = text.split('\n');
      for (let i = 0; i < lines.length; i++) {
        let idx = 0;
        while ((idx = lines[i]!.indexOf(query, idx)) !== -1) {
          results.push({ line: i, col: idx });
          idx += query.length;
        }
      }
      return results;
    }),
    insertText: vi.fn((t: string) => { text += t; }),
    replaceRange: vi.fn(),
    deleteRange: vi.fn(),
    setCursor: vi.fn((line: number, col: number) => { cursor = { line, col }; }),
    getCursor: vi.fn(() => cursor),
    highlight: vi.fn(() => 'hl-1'),
    removeHighlight: vi.fn(),
    clearHighlights: vi.fn(),
    addAnnotation: vi.fn(() => 'ann-1'),
    removeAnnotation: vi.fn(),
    clearAnnotations: vi.fn(),
    beginEditSession: vi.fn((owner: string) => {
      if (session) throw new EditSessionActiveError(session.owner, session.startedAt);
      session = { owner, mode: 'exclusive', startedAt: new Date().toISOString(), cancel: () => { session = null; } };
      return session;
    }),
    endEditSession: vi.fn((s: EditSession) => { if (session === s) session = null; }),
  };
}

describe('McpToolAdapter', () => {
  describe('content tools', () => {
    it('editor_get_content calls getText()', async () => {
      const mock = createMockEditableText('hello world');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_get_content', {});
      expect(result).toEqual({ content: 'hello world' });
      expect(mock.getText).toHaveBeenCalled();
    });

    it('editor_set_content calls setContent()', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_set_content', { text: 'new content' });
      expect(mock.setContent).toHaveBeenCalledWith('new content');
    });

    it('editor_get_line returns line text', async () => {
      const mock = createMockEditableText('line one\nline two\nline three');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_get_line', { line: 1 });
      expect(result).toEqual({ text: 'line two' });
    });

    it('editor_get_line returns error for out-of-range', async () => {
      const mock = createMockEditableText('hello');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_get_line', { line: 5 });
      expect(result.error).toBe('out_of_range');
    });
  });

  describe('search tools', () => {
    it('editor_find_text returns positions', async () => {
      const mock = createMockEditableText('hello hello');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_find_text', { query: 'hello' });
      expect(result.matches).toHaveLength(2);
      expect(result.matches[0]).toEqual({ line: 0, col: 0 });
    });

    it('editor_find_heading finds markdown heading', async () => {
      const mock = createMockEditableText('# Introduction\n\nSome text\n\n## Methods\n\nMore text');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_find_heading', { heading: 'Methods' });
      expect(result.position).toEqual({ line: 4, col: 0 });
    });

    it('editor_find_heading reports no match', async () => {
      const mock = createMockEditableText('# Introduction\n\nSome text');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_find_heading', { heading: 'Missing' });
      expect(result.error).toBe('no_match');
    });

    it('editor_find_heading reports multiple matches', async () => {
      const mock = createMockEditableText('## Dup\n\nText\n\n## Dup\n\nMore');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_find_heading', { heading: 'Dup' });
      expect(result.error).toBe('multiple_matches');
      expect(result.positions).toHaveLength(2);
    });
  });

  describe('editing tools', () => {
    it('editor_replace_range calls replaceRange()', async () => {
      const mock = createMockEditableText('hello world');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_replace_range', {
        from: { line: 0, col: 0 },
        to: { line: 0, col: 5 },
        text: 'goodbye',
      });
      expect(mock.replaceRange).toHaveBeenCalledWith(
        { line: 0, col: 0 },
        { line: 0, col: 5 },
        'goodbye',
      );
    });

    it('editor_insert_text calls insertText()', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_insert_text', { text: 'inserted' });
      expect(mock.insertText).toHaveBeenCalledWith('inserted');
    });
  });

  describe('cursor tools', () => {
    it('editor_get_cursor returns position', async () => {
      const mock = createMockEditableText('hello');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_get_cursor', {});
      expect(result).toEqual({ line: 0, col: 0 });
    });

    it('editor_set_cursor calls setCursor()', async () => {
      const mock = createMockEditableText('hello\nworld');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_set_cursor', { line: 1, col: 3 });
      expect(mock.setCursor).toHaveBeenCalledWith(1, 3);
    });
  });

  describe('decoration tools', () => {
    it('editor_highlight calls highlight()', async () => {
      const mock = createMockEditableText('hello world');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_highlight', {
        from: { line: 0, col: 0 },
        to: { line: 0, col: 5 },
        style: 'underline',
      });
      expect(result).toEqual({ id: 'hl-1' });
      expect(mock.highlight).toHaveBeenCalledWith(
        { line: 0, col: 0 },
        { line: 0, col: 5 },
        'underline',
      );
    });

    it('editor_remove_highlight calls removeHighlight()', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_remove_highlight', { id: 'hl-1' });
      expect(mock.removeHighlight).toHaveBeenCalledWith('hl-1');
    });

    it('editor_annotate calls addAnnotation()', async () => {
      const mock = createMockEditableText('hello');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_annotate', {
        anchor: { line: 0, col: 0 },
        type: 'callout',
        text: 'Note here',
      });
      expect(result).toEqual({ id: 'ann-1' });
    });

    it('editor_remove_annotation calls removeAnnotation()', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_remove_annotation', { id: 'ann-1' });
      expect(mock.removeAnnotation).toHaveBeenCalledWith('ann-1');
    });

    it('editor_clear_overlays clears both highlights and annotations', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_clear_overlays', {});
      expect(mock.clearHighlights).toHaveBeenCalled();
      expect(mock.clearAnnotations).toHaveBeenCalled();
    });
  });

  describe('session tools', () => {
    it('editor_begin_session returns session info', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_begin_session', { owner: 'claude' });
      expect(result.owner).toBe('claude');
      expect(result.mode).toBe('exclusive');
      expect(result.startedAt).toBeTruthy();
    });

    it('editor_begin_session returns error on contention', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_begin_session', { owner: 'claude' });
      const result = await adapter.handleToolCall('editor_begin_session', { owner: 'gpt' });
      expect(result.error).toBe('session_active');
      expect(result.owner).toBe('claude');
    });

    it('editor_end_session ends active session', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      await adapter.handleToolCall('editor_begin_session', { owner: 'claude' });
      const result = await adapter.handleToolCall('editor_end_session', {});
      expect(result).toEqual({ success: true });
    });
  });

  describe('unknown tool', () => {
    it('returns error for unknown tool name', async () => {
      const mock = createMockEditableText('');
      const adapter = new McpToolAdapter(mock);
      const result = await adapter.handleToolCall('editor_nonexistent', {});
      expect(result.error).toBe('unknown_tool');
    });
  });
});
