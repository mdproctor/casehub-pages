import { LitElement, css, html, type TemplateResult } from 'lit';
import { property } from 'lit/decorators.js';
import type { Editor } from '@milkdown/kit/core';
import { callCommand } from '@milkdown/kit/utils';
import './toolbar-button.js';

export interface ToolbarItem {
  id: string;
  icon: string;
  tooltip: string;
  shortcut: string;
  commandKey: string;
  payload?: unknown;
}

export const TOOLBAR_ITEMS: ToolbarItem[] = [
  { id: 'bold', icon: 'B', tooltip: 'Bold', shortcut: 'Mod+B', commandKey: 'ToggleStrong' },
  { id: 'italic', icon: 'I', tooltip: 'Italic', shortcut: 'Mod+I', commandKey: 'ToggleEmphasis' },
  { id: 'strikethrough', icon: 'S', tooltip: 'Strikethrough', shortcut: 'Mod+Shift+X', commandKey: 'ToggleStrikeThrough' },
  { id: 'inline-code', icon: '<>', tooltip: 'Inline Code', shortcut: 'Mod+E', commandKey: 'ToggleInlineCode' },
  { id: 'heading', icon: 'H', tooltip: 'Heading', shortcut: '', commandKey: 'WrapInHeading', payload: 2 },
  { id: 'bullet-list', icon: '•', tooltip: 'Bullet List', shortcut: 'Mod+Shift+8', commandKey: 'WrapInBulletList' },
  { id: 'ordered-list', icon: '1.', tooltip: 'Ordered List', shortcut: 'Mod+Shift+7', commandKey: 'WrapInOrderedList' },
  { id: 'blockquote', icon: '“', tooltip: 'Blockquote', shortcut: '', commandKey: 'WrapInBlockquote' },
  { id: 'code-block', icon: '{}', tooltip: 'Code Block', shortcut: '', commandKey: 'CreateCodeBlock' },
  { id: 'hr', icon: '―', tooltip: 'Horizontal Rule', shortcut: '', commandKey: 'InsertHr' },
  { id: 'link', icon: '🔗', tooltip: 'Link', shortcut: 'Mod+K', commandKey: 'ToggleLink' },
  { id: 'table', icon: '⊞', tooltip: 'Table', shortcut: '', commandKey: 'InsertTable' },
];

export class EditorToolbar extends LitElement {
  @property({ attribute: false }) editor: Editor | null = null;

  static override styles = css`
    :host {
      display: flex;
      gap: 2px;
      padding: 4px 8px;
      flex-wrap: wrap;
      align-items: center;
    }
    .separator {
      width: 1px;
      height: 20px;
      background: var(--pages-neutral-5, #d4d4d4);
      margin: 0 4px;
    }
  `;

  override render(): TemplateResult {
    return html`
      ${TOOLBAR_ITEMS.map((item, i) => {
        const sep = (i === 4 || i === 9) ? html`<span class="separator"></span>` : '';
        return html`
          ${sep}
          <toolbar-button
            .icon=${item.icon}
            .tooltip=${item.tooltip}
            .shortcut=${item.shortcut}
            @command=${() => this._dispatchCommand(item)}
          ></toolbar-button>
        `;
      })}
    `;
  }

  private _dispatchCommand(item: ToolbarItem): void {
    if (!this.editor) return;
    this.editor.action(callCommand(item.commandKey as any, item.payload));
  }
}

if (!customElements.get('editor-toolbar')) {
  customElements.define('editor-toolbar', EditorToolbar);
}
