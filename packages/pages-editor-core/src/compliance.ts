import { describe, it, expect } from 'vitest';
import type { EditableText } from './types.js';
import { EditSessionActiveError } from './types.js';

export function editableTextComplianceTests(
  name: string,
  factory: () => EditableText,
): void {
  describe(`EditableText compliance: ${name}`, () => {
    it('getText returns a string', () => {
      const et = factory();
      expect(typeof et.getText()).toBe('string');
    });

    it('getLineCount returns a positive number', () => {
      const et = factory();
      expect(et.getLineCount()).toBeGreaterThan(0);
    });

    it('getLine returns a string for valid index', () => {
      const et = factory();
      expect(typeof et.getLine(0)).toBe('string');
    });

    it('findText returns an array of positions', () => {
      const et = factory();
      const text = et.getText();
      if (text.length > 0) {
        const results = et.findText(text.substring(0, 1));
        expect(Array.isArray(results)).toBe(true);
        for (const pos of results) {
          expect(typeof pos.line).toBe('number');
          expect(typeof pos.col).toBe('number');
        }
      }
    });

    it('getCursor returns a position', () => {
      const et = factory();
      const cursor = et.getCursor();
      expect(typeof cursor.line).toBe('number');
      expect(typeof cursor.col).toBe('number');
    });

    it('highlight returns unique string IDs', () => {
      const et = factory();
      const id1 = et.highlight({ line: 0, col: 0 }, { line: 0, col: 1 });
      const id2 = et.highlight({ line: 0, col: 0 }, { line: 0, col: 1 });
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
    });

    it('removeHighlight does not throw for valid ID', () => {
      const et = factory();
      const id = et.highlight({ line: 0, col: 0 }, { line: 0, col: 1 });
      expect(() => et.removeHighlight(id)).not.toThrow();
    });

    it('clearHighlights does not throw', () => {
      const et = factory();
      et.highlight({ line: 0, col: 0 }, { line: 0, col: 1 });
      expect(() => et.clearHighlights()).not.toThrow();
    });

    it('addAnnotation returns unique string IDs', () => {
      const et = factory();
      const id1 = et.addAnnotation({ line: 0, col: 0 }, { type: 'callout' });
      const id2 = et.addAnnotation({ line: 0, col: 0 }, { type: 'arrow' });
      expect(typeof id1).toBe('string');
      expect(typeof id2).toBe('string');
      expect(id1).not.toBe(id2);
    });

    it('removeAnnotation does not throw for valid ID', () => {
      const et = factory();
      const id = et.addAnnotation({ line: 0, col: 0 }, { type: 'marker' });
      expect(() => et.removeAnnotation(id)).not.toThrow();
    });

    it('clearAnnotations does not throw', () => {
      const et = factory();
      et.addAnnotation({ line: 0, col: 0 }, { type: 'callout' });
      expect(() => et.clearAnnotations()).not.toThrow();
    });

    it('beginEditSession returns session with owner', () => {
      const et = factory();
      const session = et.beginEditSession('test-compliance');
      expect(session.owner).toBe('test-compliance');
      expect(session.mode).toBe('exclusive');
      expect(typeof session.startedAt).toBe('string');
      et.endEditSession(session);
    });

    it('beginEditSession throws when session already active', () => {
      const et = factory();
      et.beginEditSession('holder');
      expect(() => et.beginEditSession('contender')).toThrow(EditSessionActiveError);
    });

    it('endEditSession releases lock', () => {
      const et = factory();
      const session = et.beginEditSession('holder');
      et.endEditSession(session);
      const session2 = et.beginEditSession('next');
      expect(session2.owner).toBe('next');
      et.endEditSession(session2);
    });
  });
}
