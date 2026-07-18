import type { PagesSchemaForm } from '@casehubio/pages-form';

// The same AML transaction rendered by pages-schema-form from a JSON Schema.
// No manual field wiring — pass schema + data, get a complete form.

const schema = {
  type: 'object',
  properties: {
    transactionId: { type: 'string' },
    amount: { type: 'number' },
    currency: { type: 'string', enum: ['USD', 'EUR', 'GBP'] },
    flagged: { type: 'boolean' },
    reportDate: { type: 'string', format: 'date' },
    detectedAt: { type: 'string', format: 'date-time' },
    notes: { type: 'string', maxLength: 500 },
    parties: {
      type: 'object',
      properties: {
        sender: { type: 'string' },
        receiver: { type: 'string' },
      },
    },
  },
  required: ['transactionId', 'amount'],
};

const data = {
  transactionId: 'TXN-2026-04521',
  amount: 125000,
  currency: 'USD',
  flagged: true,
  reportDate: '2026-07-06',
  detectedAt: '2026-07-06T14:30:00Z',
  notes: 'Multiple rapid transfers to newly opened accounts in high-risk jurisdictions.',
  parties: { sender: 'Acme Holdings Ltd', receiver: 'Shell Corp 42 LLC' },
};

// Display mode — read-only view of the data
const displayForm = document.createElement('pages-schema-form') as PagesSchemaForm;
displayForm.schema = schema;
displayForm.data = data;
displayForm.mode = 'display';

// Edit mode — interactive form with change events
const editForm = document.createElement('pages-schema-form') as PagesSchemaForm;
editForm.schema = schema;
editForm.data = data;
editForm.mode = 'edit';

editForm.addEventListener('pages-form-change', (e: Event) => {
  const { key, value } = (e as CustomEvent).detail;
  console.log(`Field "${key}" changed to:`, value);
});

editForm.addEventListener('pages-form-submit', (e: Event) => {
  const { data } = (e as CustomEvent).detail;
  console.log('Form submitted:', data);
});

// Programmatic submit with validation
const result = editForm.submit();
if (result === null) {
  console.log('Validation failed — required fields missing');
}
