import { test, expect } from '@playwright/test';

const PAGE_URL = '/#client/Custom%20Components/Custom%20Components%2FMarkdown%20Editor.page.yaml';

function waitForBridge(page) {
  return page.waitForFunction(() => {
    const el = document.getElementById('md-editor');
    if (!el) return false;
    const sym = Symbol.for('editable-text');
    return !!el[sym];
  }, { timeout: 10000 });
}

function bridgeEval(page, fn: string) {
  return page.evaluate(`(() => {
    const el = document.getElementById('md-editor');
    const sym = Symbol.for('editable-text');
    const bridge = el[sym];
    if (!bridge) return null;
    ${fn}
  })()`);
}

test.describe('Markdown Editor — Rich Highlight API', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(PAGE_URL);
    await waitForBridge(page);
    await page.waitForTimeout(800);
  });

  test('editor loads with sample content', async ({ page }) => {
    const lines = await bridgeEval(page, 'return bridge.getLineCount();');
    expect(lines).toBeGreaterThan(10);
    const status = await page.locator('#status-output').textContent();
    expect(status).toContain('Lines:');
  });

  test('highlight line creates a highlight', async ({ page }) => {
    await page.click('#btn-highlight-line');
    const count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(1);
  });

  test('highlight line works at every text block in the document', async ({ page }) => {
    const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var doc = bridge.view.state.doc;
      var blocks = [];
      doc.descendants(function(node, pos) {
        if (node.isTextblock && node.textContent.length > 0) {
          blocks.push({ pos: pos + 1, text: node.textContent.substring(0, 40) });
        }
        return true;
      });
      var problems = [];
      for (var b of blocks) {
        bridge.clearHighlights();
        var tr = bridge.view.state.tr;
        var TextSel = bridge.view.state.selection.constructor;
        try {
          bridge.view.dispatch(tr.setSelection(TextSel.create(tr.doc, b.pos)));
        } catch(e) { continue; }
        var id = bridge.highlightLine(0, 1, 'pulse');
        var text = bridge.getHighlightText(id);
        if (!text || text.length === 0) {
          problems.push({ block: b.text, issue: 'empty highlight' });
        } else if (text.length > 100) {
          problems.push({ block: b.text, issue: 'too long: ' + text.length + ' chars', text: text.substring(0, 60) });
        }
      }
      bridge.clearHighlights();
      return { blockCount: blocks.length, problems: problems };
    })()`);
    expect(result.blockCount).toBeGreaterThan(10);
    expect(result.problems).toEqual([]);
  });

  for (const vw of [900, 1024, 1100, 1280, 1440]) {
    test(`highlight line works at every block at ${vw}px`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: 768 });
      await page.reload();
      await waitForBridge(page);
      await page.waitForTimeout(800);
      const result = await page.evaluate(`(() => {
        var el = document.getElementById('md-editor');
        var sym = Symbol.for('editable-text');
        var bridge = el[sym];
        var doc = bridge.view.state.doc;
        var blocks = [];
        doc.descendants(function(node, pos) {
          if (node.isTextblock && node.textContent.length > 0) {
            blocks.push({ pos: pos + 1, text: node.textContent.substring(0, 40) });
          }
          return true;
        });
        var problems = [];
        for (var b of blocks) {
          bridge.clearHighlights();
          var tr = bridge.view.state.tr;
          var TextSel = bridge.view.state.selection.constructor;
          try {
            bridge.view.dispatch(tr.setSelection(TextSel.create(tr.doc, b.pos)));
          } catch(e) { continue; }
          var id = bridge.highlightLine(0, 1, 'pulse');
          var text = bridge.getHighlightText(id);
          if (!text || text.length === 0) {
            problems.push({ block: b.text, issue: 'empty' });
          }
        }
        bridge.clearHighlights();
        return { blocks: blocks.length, problems: problems };
      })()`);
      expect(result.blocks).toBeGreaterThan(10);
      expect(result.problems).toEqual([]);
    });

    test(`reader Next Line walks without getting stuck at ${vw}px`, async ({ page }) => {
      await page.setViewportSize({ width: vw, height: 768 });
      await page.reload();
      await waitForBridge(page);
      await page.waitForTimeout(800);
      const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var reader = bridge.createReader();
      var texts = [];
      var lastFrom = -1, lastTo = -1;
      var stuck = false;
      for (var i = 0; i < 60; i++) {
        var h = bridge.listHighlights();
        if (h.length === 0) break;
        var deco = null;
        for (var entry of bridge._decorations.entries()) { deco = entry[1]; }
        if (deco && deco.from === lastFrom && deco.to === lastTo) { stuck = true; break; }
        if (deco) { lastFrom = deco.from; lastTo = deco.to; }
        texts.push(h[0].text.substring(0, 60));
        reader.advanceLine();
      }
      reader.dispose();
      return { stuck: stuck, count: texts.length, texts: texts };
    })()`);
    expect(result.stuck).toBe(false);
    expect(result.count).toBeGreaterThan(10);
    for (const t of result.texts) {
      expect(t.length).toBeLessThan(120);
    }
    });
  }

  test('highlight sentence creates a highlight', async ({ page }) => {
    await page.click('#btn-highlight-sentence');
    const count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(1);
  });

  test('highlight sentence stops at the period, not trailing space', async ({ page }) => {
    await bridgeEval(page, 'bridge.setContent("first sentence here. second sentence there. third one.");');
    await page.waitForTimeout(300);
    await bridgeEval(page, 'bridge.setCursor(0, 0);');
    const result = await bridgeEval(page, 'var id = bridge.highlightSentence(); return bridge.getHighlightText(id);');
    expect(result).toBe('first sentence here.');
  });

  test('highlight sentence on second sentence excludes first', async ({ page }) => {
    await bridgeEval(page, 'bridge.setContent("first sentence here. second sentence there. third one.");');
    await page.waitForTimeout(300);
    await bridgeEval(page, 'bridge.setCursor(0, 25);');
    const result = await bridgeEval(page, 'var id = bridge.highlightSentence(); return bridge.getHighlightText(id);');
    expect(result).toBe('second sentence there.');
  });

  test('highlight sentence works with lowercase after period', async ({ page }) => {
    await bridgeEval(page, 'bridge.setContent("the cat sat. the dog ran. the bird flew.");');
    await page.waitForTimeout(300);
    await bridgeEval(page, 'bridge.setCursor(0, 0);');
    const result = await bridgeEval(page, 'var id = bridge.highlightSentence(); return bridge.getHighlightText(id);');
    expect(result).toBe('the cat sat.');
  });

  test('highlight block creates a highlight', async ({ page }) => {
    await page.click('#btn-highlight-block');
    const count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(1);
  });

  test('find and highlight text marks all occurrences', async ({ page }) => {
    await page.fill('#highlight-text-input', 'bridge');
    await page.click('#btn-highlight-text');
    const result = await bridgeEval(page, 'var h = bridge.listHighlights(); return { count: h.length, groups: h.map(function(x){ return x.group; }), texts: h.map(function(x){ return x.text; }) };');
    expect(result.count).toBeGreaterThanOrEqual(2);
    for (const g of result.groups) expect(g).toBe('find');
    for (const t of result.texts) expect(t.toLowerCase()).toContain('bridge');
  });

  test('custom style applies HighlightOptions with group', async ({ page }) => {
    await page.click('#btn-custom-style');
    const result = await bridgeEval(page, 'var h = bridge.listHighlights(); return { count: h.length, group: h[0] && h[0].group };');
    expect(result.count).toBe(1);
    expect(result.group).toBe('suggestions');
  });

  test('highlight buttons are mutually exclusive toggles', async ({ page }) => {
    await page.click('#btn-highlight-line');
    let count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(1);
    await page.click('#btn-highlight-sentence');
    count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(1);
    await page.click('#btn-highlight-sentence');
    count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(0);
  });

  test('clear all removes toggle and find highlights', async ({ page }) => {
    await page.click('#btn-highlight-line');
    await page.fill('#highlight-text-input', 'bridge');
    await page.click('#btn-highlight-text');
    let count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBeGreaterThan(1);
    await page.click('#btn-clear-hl');
    count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(0);
  });

  test('list highlights shows output', async ({ page }) => {
    await page.click('#btn-highlight-line');
    await page.click('#btn-list-highlights');
    const output = await page.locator('#readback-output').textContent();
    expect(output).toContain('hl-');
  });

  test('get text reads content under highlight', async ({ page }) => {
    await page.click('#btn-highlight-line');
    await page.click('#btn-get-text');
    const output = await page.locator('#readback-output').textContent();
    expect(output).toContain('hl-');
    expect(output!.length).toBeGreaterThan(5);
  });

  test('reader starts at beginning of document', async ({ page }) => {
    await page.click('#btn-reader-start');
    const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var h = bridge.listHighlights();
      return { count: h.length, text: h.length > 0 ? h[0].text : null };
    })()`);
    expect(result.count).toBe(1);
    expect(result.text).toBe('Project Status Report');
  });

  test('reader advance moves to next sentence, not whole doc', async ({ page }) => {
    await page.click('#btn-reader-start');
    await page.click('#btn-reader-advance');
    const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var h = bridge.listHighlights();
      return { count: h.length, text: h.length > 0 ? h[0].text : null, textLen: h.length > 0 ? h[0].text.length : 0 };
    })()`);
    expect(result.count).toBe(1);
    expect(result.textLen).toBeLessThan(100);
    expect(result.text).not.toContain('Project Status Report');
  });

  test('reader advances sentence by sentence without skipping', async ({ page }) => {
    await bridgeEval(page, 'bridge.setContent("First sentence here. Second sentence there. Third one done.");');
    await page.waitForTimeout(300);
    await bridgeEval(page, 'bridge.setCursor(0, 0);');
    const results = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var reader = bridge.createReader();
      var texts = [];
      var h = bridge.listHighlights();
      if (h.length > 0) texts.push(bridge.getHighlightText(h[0].id));
      reader.advance();
      h = bridge.listHighlights();
      if (h.length > 0) texts.push(bridge.getHighlightText(h[0].id));
      reader.advance();
      h = bridge.listHighlights();
      if (h.length > 0) texts.push(bridge.getHighlightText(h[0].id));
      reader.dispose();
      return texts;
    })()`);
    expect(results[0]).toBe('First sentence here.');
    expect(results[1]).toBe('Second sentence there.');
    expect(results[2]).toBe('Third one done.');
  });

  test('reader does not highlight entire document on advance past end', async ({ page }) => {
    await bridgeEval(page, 'bridge.setContent("One sentence. Two sentence.");');
    await page.waitForTimeout(300);
    await bridgeEval(page, 'bridge.setCursor(0, 0);');
    const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var reader = bridge.createReader();
      reader.advance();
      reader.advance();
      reader.advance();
      var h = bridge.listHighlights();
      var text = h.length > 0 ? bridge.getHighlightText(h[0].id) : null;
      reader.dispose();
      return { highlights: h.length, textLength: text ? text.length : 0 };
    })()`);
    expect(result.highlights).toBeLessThanOrEqual(1);
    expect(result.textLength).toBeLessThan(30);
  });

  test('reader advanceLine advances within wrapping paragraph, not just between blocks', async ({ page }) => {
    var longPara = 'The quick brown fox jumped over the lazy dog near the riverbank. The sun was setting behind the mountains casting long shadows across the valley floor. Birds were singing their evening songs.';
    await bridgeEval(page, 'bridge.clearHighlights(); bridge.setContent("# Heading\\n\\n' + longPara + '\\n\\nShort end.");');
    await page.waitForTimeout(500);
    const result = await page.evaluate(`(() => {
      var el = document.getElementById('md-editor');
      var sym = Symbol.for('editable-text');
      var bridge = el[sym];
      var reader = bridge.createReader();
      var texts = [];
      for (var i = 0; i < 6; i++) {
        var h = bridge.listHighlights();
        texts.push(h.length > 0 ? h[0].text : '(none)');
        reader.advanceLine();
      }
      reader.dispose();
      return texts;
    })()`);
    expect(result[0]).toBe('Heading');
    for (var i = 1; i < result.length; i++) {
      if (result[i] === '(none)') break;
      expect(result[i].length).toBeLessThan(190);
    }
    var allText = result.filter(function(t) { return t !== '(none)'; }).join('');
    expect(allText).toContain('riverbank');
    expect(allText).toContain('evening songs');
    expect(allText).toContain('Short end.');
    expect(result.indexOf('Short end.')).toBeGreaterThanOrEqual(3);
  });

  test('reader stop removes highlight', async ({ page }) => {
    await page.click('#btn-reader-start');
    await page.click('#btn-reader-stop');
    const count = await bridgeEval(page, 'return bridge.listHighlights().length;');
    expect(count).toBe(0);
    const status = await page.locator('#status-output').textContent();
    expect(status).toContain('Reader: none');
  });
});