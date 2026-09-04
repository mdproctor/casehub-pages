import { test, expect } from '@playwright/test';

test.describe('PagesCodeEditor', () => {
  test('renders CodeMirror inside shadow DOM', async ({ page }) => {
    await page.goto('/diagram-export-tool.html');
    const editor = page.locator('diagram-export-tool')
      .locator('pages-code-editor');
    await expect(editor).toBeVisible();

    const cmEditor = editor.locator('.cm-editor');
    await expect(cmEditor).toBeVisible();

    const cmContent = editor.locator('.cm-content');
    await expect(cmContent).toHaveAttribute('contenteditable', 'true');
  });

  test('displays YAML with syntax highlighting', async ({ page }) => {
    await page.goto('/diagram-export-tool.html');
    const editor = page.locator('diagram-export-tool')
      .locator('pages-code-editor');
    await expect(editor).toBeVisible();

    const content = editor.locator('.cm-content');
    await expect(content).toContainText('nodes');
  });

  test('readonly mode prevents editing', async ({ page }) => {
    await page.goto('/diagram-export-tool.html');

    await page.evaluate(() => {
      const tool = document.querySelector('diagram-export-tool');
      const editor = tool?.shadowRoot?.querySelector('pages-code-editor');
      if (editor) (editor as any).readonly = true;
    });

    const editor = page.locator('diagram-export-tool')
      .locator('pages-code-editor');
    const cmContent = editor.locator('.cm-content');
    await expect(cmContent).toHaveAttribute('contenteditable', 'false');
  });
});

test.describe('Diagram Export Tool', () => {
  test('page loads with editor and canvas', async ({ page }) => {
    await page.goto('/diagram-export-tool.html');
    await expect(page.locator('diagram-export-tool')).toBeVisible();

    const editor = page.locator('diagram-export-tool')
      .locator('pages-code-editor');
    await expect(editor).toBeVisible();
  });

  test('shows error banner for invalid YAML', async ({ page }) => {
    await page.goto('/diagram-export-tool.html');

    const editor = page.locator('diagram-export-tool')
      .locator('pages-code-editor');
    await editor.locator('.cm-content').click();
    await page.keyboard.press('Control+A');
    await page.keyboard.type('invalid: yaml: : :');

    const errorBanner = page.locator('diagram-export-tool')
      .locator('.error-banner');
    await expect(errorBanner).toBeVisible({ timeout: 5000 });
  });
});
