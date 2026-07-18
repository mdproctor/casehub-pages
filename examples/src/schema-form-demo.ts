import '@casehubio/pages-form';

const SCHEMA = {
  type: 'object',
  properties: {
    transactionId: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] },
    flagged: { type: 'boolean' },
    reportDate: { type: 'string', format: 'date' },
    notes: { type: 'string', maxLength: 500 },
    sender: { type: 'string' },
    receiver: { type: 'string' },
  },
  required: ['transactionId', 'amount'],
};

const DATA = {
  transactionId: 'TXN-2026-04521',
  amount: 125000,
  currency: 'USD',
  flagged: true,
  reportDate: '2026-07-06',
  notes: 'Multiple rapid transfers to high-risk jurisdictions.',
  sender: 'Acme Holdings Ltd',
  receiver: 'Shell Corp 42 LLC',
};

const CSS = `
  :host { display: block; }
  .controls { display: flex; gap: 8px; margin-bottom: 16px; align-items: center; }
  .mode-btn { padding: 6px 14px; border: 1px solid var(--pages-neutral-6, #ccc); border-radius: 4px; background: var(--pages-neutral-1, #fff); color: var(--pages-neutral-11, #555); cursor: pointer; font-size: 13px; }
  .mode-btn.active { background: var(--pages-accent-9, #2563eb); color: white; border-color: var(--pages-accent-9, #2563eb); }
  .submit-btn { padding: 6px 14px; border: 1px solid var(--pages-accent-6, #93c5fd); border-radius: 4px; background: var(--pages-neutral-1, #fff); color: var(--pages-accent-9, #2563eb); cursor: pointer; font-size: 13px; }
  .status { font-size: 12px; }
  pages-schema-form { display: block; border: 1px solid var(--pages-neutral-5, #e0e0e0); border-radius: 6px; padding: 16px; background: var(--pages-neutral-1, #fff); }
`;

class SchemaFormDemo extends HTMLElement {
  private _mode: 'display' | 'edit' = 'edit';

  connectedCallback() {
    const shadow = this.attachShadow({ mode: 'open' });
    this._render(shadow);
  }

  private _render(shadow: ShadowRoot) {
    const isEdit = this._mode === 'edit';

    shadow.innerHTML = '';
    const style = document.createElement('style');
    style.textContent = CSS;
    shadow.appendChild(style);

    const controls = document.createElement('div');
    controls.className = 'controls';

    const displayBtn = document.createElement('button');
    displayBtn.className = `mode-btn${!isEdit ? ' active' : ''}`;
    displayBtn.textContent = 'Display';
    displayBtn.addEventListener('click', () => { this._mode = 'display'; this._render(shadow); });

    const editBtn = document.createElement('button');
    editBtn.className = `mode-btn${isEdit ? ' active' : ''}`;
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => { this._mode = 'edit'; this._render(shadow); });

    controls.appendChild(displayBtn);
    controls.appendChild(editBtn);

    const statusEl = document.createElement('span');
    statusEl.className = 'status';

    if (isEdit) {
      const submitBtn = document.createElement('button');
      submitBtn.className = 'submit-btn';
      submitBtn.textContent = 'Submit';
      submitBtn.addEventListener('click', () => {
        const result = (form as any).submit();
        if (result === null) {
          statusEl.textContent = 'Validation failed — required fields missing';
          statusEl.style.color = 'var(--pages-danger-9, #dc2626)';
        } else {
          statusEl.textContent = `Submitted ${Object.keys(result).length} fields`;
          statusEl.style.color = 'var(--pages-accent-9, #2563eb)';
        }
      });
      controls.appendChild(submitBtn);
    }

    controls.appendChild(statusEl);
    shadow.appendChild(controls);

    const form = document.createElement('pages-schema-form');
    (form as any).schema = SCHEMA;
    (form as any).data = DATA;
    (form as any).mode = this._mode;
    form.addEventListener('pages-form-change', (e: Event) => {
      const detail = (e as CustomEvent).detail;
      statusEl.textContent = `Changed: ${detail.key}`;
      statusEl.style.color = 'var(--pages-neutral-9, #888)';
    });
    shadow.appendChild(form);
  }
}

customElements.define('schema-form-demo', SchemaFormDemo);
