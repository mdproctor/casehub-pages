import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import './pages-schema-form.js';

describe('pages-schema-form', () => {
  let el: HTMLElement & { schema: unknown; data: unknown; mode: string };

  const schema = {
    type: 'object',
    properties: {
      title: { type: 'string' },
      count: { type: 'number' },
      active: { type: 'boolean' },
      status: { type: 'string', enum: ['open', 'closed'] },
    },
    required: ['title'],
  };

  const data = { title: 'Test Item', count: 42, active: true, status: 'open' };

  beforeEach(async () => {
    el = document.createElement('pages-schema-form') as any;
    el.schema = schema;
    el.data = data;
    el.mode = 'display';
    document.body.appendChild(el);
    await (el as any).updateComplete;
  });

  afterEach(() => el.remove());

  it('renders in display mode with labels and values', () => {
    const shadow = el.shadowRoot!;
    expect(shadow.textContent).toContain('title');
    expect(shadow.textContent).toContain('Test Item');
    expect(shadow.textContent).toContain('42');
  });

  it('renders boolean as Yes/No', () => {
    const shadow = el.shadowRoot!;
    expect(shadow.textContent).toContain('Yes');
  });

  it('shows dash for null values', async () => {
    el.data = { title: 'Test', count: null, active: false, status: null };
    await (el as any).updateComplete;
    expect(el.shadowRoot!.textContent).toContain('—');
  });

  describe('edit mode', () => {
    beforeEach(async () => {
      el.mode = 'edit';
      await (el as any).updateComplete;
    });

    it('renders text input for string fields', () => {
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="title"]');
      expect(input).toBeTruthy();
      expect(input!.type).toBe('text');
      expect(input!.value).toBe('Test Item');
    });

    it('renders number input for number fields', () => {
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="count"]');
      expect(input).toBeTruthy();
      expect(input!.type).toBe('number');
    });

    it('renders checkbox for boolean fields', () => {
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="checkbox"]');
      expect(input).toBeTruthy();
      expect(input!.checked).toBe(true);
    });

    it('renders select for enum fields', () => {
      const select = el.shadowRoot!.querySelector<HTMLSelectElement>('select[id="status"]');
      expect(select).toBeTruthy();
      expect(select!.value).toBe('open');
      const options = select!.querySelectorAll('option');
      expect(options.length).toBe(2);
    });

    it('emits pages-form-change on field edit', async () => {
      const handler = vi.fn();
      el.addEventListener('pages-form-change', handler);
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="title"]')!;
      input.value = 'Updated';
      input.dispatchEvent(new Event('input'));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0].detail.key).toBe('title');
      expect(handler.mock.calls[0]?.[0].detail.value).toBe('Updated');
    });

    it('submit() returns data and emits pages-form-submit', () => {
      const handler = vi.fn();
      el.addEventListener('pages-form-submit', handler);
      const result = (el as any).submit();
      expect(result).toBeTruthy();
      expect(result.title).toBe('Test Item');
      expect(handler).toHaveBeenCalledTimes(1);
    });

    it('submit() returns null for missing required fields', async () => {
      el.data = { count: 42, active: true, status: 'open' };
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeNull();
    });

    it('renders textarea for long strings', async () => {
      el.schema = {
        type: 'object',
        properties: { notes: { type: 'string', maxLength: 500 } },
      };
      el.data = { notes: 'Some long text' };
      await (el as any).updateComplete;
      expect(el.shadowRoot!.querySelector('textarea')).toBeTruthy();
    });
  });

  describe('nested objects', () => {
    const nestedSchema = {
      type: 'object',
      properties: {
        address: {
          type: 'object',
          properties: {
            street: { type: 'string' },
            city: { type: 'string' },
          },
        },
      },
    };

    it('renders nested fields in display mode', async () => {
      el.schema = nestedSchema;
      el.data = { address: { street: '123 Main St', city: 'Springfield' } };
      el.mode = 'display';
      await (el as any).updateComplete;
      const text = el.shadowRoot!.textContent!;
      expect(text).toContain('123 Main St');
      expect(text).toContain('Springfield');
    });

    it('renders nested inputs in edit mode', async () => {
      el.schema = nestedSchema;
      el.data = { address: { street: '123 Main St', city: 'Springfield' } };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const inputs = el.shadowRoot!.querySelectorAll<HTMLInputElement>('input[type="text"]');
      expect(inputs.length).toBe(2);
      expect(inputs[0]!.value).toBe('123 Main St');
      expect(inputs[1]!.value).toBe('Springfield');
    });

    it('emits change with merged nested value', async () => {
      el.schema = nestedSchema;
      el.data = { address: { street: '123 Main St', city: 'Springfield' } };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const handler = vi.fn();
      el.addEventListener('pages-form-change', handler);
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="city"]')!;
      input.value = 'Shelbyville';
      input.dispatchEvent(new Event('input'));
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0].detail.key).toBe('address');
      expect(handler.mock.calls[0]?.[0].detail.value).toEqual({ street: '123 Main St', city: 'Shelbyville' });
    });
  });

  describe('arrays', () => {
    const arraySchema = {
      type: 'object',
      properties: {
        tags: { type: 'array', items: { type: 'string' } },
      },
    };

    it('renders array items as comma-separated in display mode', async () => {
      el.schema = arraySchema;
      el.data = { tags: ['red', 'green', 'blue'] };
      el.mode = 'display';
      await (el as any).updateComplete;
      expect(el.shadowRoot!.textContent).toContain('red, green, blue');
    });

    it('renders editable inputs for each array item', async () => {
      el.schema = arraySchema;
      el.data = { tags: ['alpha', 'beta'] };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const inputs = el.shadowRoot!.querySelectorAll<HTMLInputElement>('.array-item-inline input');
      expect(inputs.length).toBe(2);
      expect(inputs[0]!.value).toBe('alpha');
      expect(inputs[1]!.value).toBe('beta');
    });

    it('adds an item when add button is clicked', async () => {
      el.schema = arraySchema;
      el.data = { tags: ['one'] };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const handler = vi.fn();
      el.addEventListener('pages-form-change', handler);
      const addBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('.array-add')!;
      addBtn.click();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0].detail.value).toEqual(['one', '']);
    });

    it('removes an item when remove button is clicked', async () => {
      el.schema = arraySchema;
      el.data = { tags: ['a', 'b', 'c'] };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const handler = vi.fn();
      el.addEventListener('pages-form-change', handler);
      const removeBtn = el.shadowRoot!.querySelector<HTMLButtonElement>('.array-remove')!;
      removeBtn.click();
      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0]?.[0].detail.value).toEqual(['b', 'c']);
    });

    it('renders object array items with nested fields', async () => {
      const objArraySchema = {
        type: 'object',
        properties: {
          contacts: {
            type: 'array',
            items: {
              type: 'object',
              properties: { name: { type: 'string' }, role: { type: 'string' } },
            },
          },
        },
      };
      el.schema = objArraySchema;
      el.data = { contacts: [{ name: 'Alice', role: 'Lead' }] };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const inputs = el.shadowRoot!.querySelectorAll<HTMLInputElement>('.array-item input[type="text"]');
      expect(inputs.length).toBe(2);
      expect(inputs[0]!.value).toBe('Alice');
      expect(inputs[1]!.value).toBe('Lead');
    });
  });

  describe('date fields', () => {
    const dateSchema = {
      type: 'object',
      properties: {
        born: { type: 'string', format: 'date' },
        created: { type: 'string', format: 'date-time' },
      },
    };

    it('renders formatted date in display mode', async () => {
      el.schema = dateSchema;
      el.data = { born: '2000-01-15', created: '2026-07-06T14:30:00Z' };
      el.mode = 'display';
      await (el as any).updateComplete;
      const text = el.shadowRoot!.textContent!;
      expect(text).toContain('2000');
      expect(text).toContain('2026');
    });

    it('renders date input in edit mode', async () => {
      el.schema = dateSchema;
      el.data = { born: '2000-01-15', created: '2026-07-06T14:30:00Z' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const dateInput = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="date"]');
      expect(dateInput).toBeTruthy();
      expect(dateInput!.value).toBe('2000-01-15');
    });

    it('renders datetime-local input in edit mode', async () => {
      el.schema = dateSchema;
      el.data = { born: '2000-01-15', created: '2026-07-06T14:30:00Z' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const dtInput = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="datetime-local"]');
      expect(dtInput).toBeTruthy();
    });
  });

  describe('field metadata — title, description, placeholder (#207)', () => {
    const metaSchema = {
      type: 'object',
      properties: {
        firstName: {
          type: 'string',
          title: 'First Name',
          description: 'Your legal first name',
          placeholder: 'Enter your first name',
        },
        age: {
          type: 'number',
          title: 'Your Age',
          description: 'Must be 18 or older',
          placeholder: '25',
        },
        role: {
          type: 'string',
          title: 'Job Role',
          description: 'Select your primary role',
          enum: ['engineer', 'designer', 'manager'],
        },
        bio: {
          type: 'string',
          title: 'Biography',
          description: 'Tell us about yourself',
          placeholder: 'Write a short bio...',
          maxLength: 500,
        },
        untitled: { type: 'string' },
      },
    };

    describe('display mode', () => {
      beforeEach(async () => {
        el.schema = metaSchema;
        el.data = { firstName: 'Alice', age: 30, role: 'engineer', bio: 'A developer', untitled: 'value' };
        el.mode = 'display';
        await (el as any).updateComplete;
      });

      it('uses title as label when present', () => {
        const labels = el.shadowRoot!.querySelectorAll('.label');
        const labelTexts = Array.from(labels).map(l => l.textContent?.trim());
        expect(labelTexts).toContain('First Name');
        expect(labelTexts).not.toContain('firstName');
      });

      it('falls back to key when title is absent', () => {
        const labels = el.shadowRoot!.querySelectorAll('.label');
        const labelTexts = Array.from(labels).map(l => l.textContent?.trim());
        expect(labelTexts).toContain('untitled');
      });

      it('renders description as help text', () => {
        const descriptions = el.shadowRoot!.querySelectorAll('.description');
        expect(descriptions.length).toBeGreaterThan(0);
        const descTexts = Array.from(descriptions).map(d => d.textContent?.trim());
        expect(descTexts).toContain('Your legal first name');
      });
    });

    describe('edit mode', () => {
      beforeEach(async () => {
        el.schema = metaSchema;
        el.data = { firstName: '', age: 0, role: 'engineer', bio: '', untitled: '' };
        el.mode = 'edit';
        await (el as any).updateComplete;
      });

      it('uses title as label when present', () => {
        const labels = el.shadowRoot!.querySelectorAll('label');
        const labelTexts = Array.from(labels).map(l => l.textContent?.trim());
        expect(labelTexts).toContain('First Name');
        expect(labelTexts).not.toContain('firstName');
      });

      it('falls back to key when title is absent', () => {
        const labels = el.shadowRoot!.querySelectorAll('label');
        const labelTexts = Array.from(labels).map(l => l.textContent?.trim());
        expect(labelTexts).toContain('untitled');
      });

      it('sets placeholder on text input', () => {
        const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="firstName"]');
        expect(input).toBeTruthy();
        expect(input!.placeholder).toBe('Enter your first name');
      });

      it('sets placeholder on number input', () => {
        const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="age"]');
        expect(input).toBeTruthy();
        expect(input!.placeholder).toBe('25');
      });

      it('sets placeholder on textarea', () => {
        const textarea = el.shadowRoot!.querySelector<HTMLTextAreaElement>('textarea[id="bio"]');
        expect(textarea).toBeTruthy();
        expect(textarea!.placeholder).toBe('Write a short bio...');
      });

      it('renders description as help text below fields', () => {
        const descriptions = el.shadowRoot!.querySelectorAll('.description');
        expect(descriptions.length).toBeGreaterThan(0);
        const descTexts = Array.from(descriptions).map(d => d.textContent?.trim());
        expect(descTexts).toContain('Your legal first name');
        expect(descTexts).toContain('Must be 18 or older');
      });

      it('does not render description when absent', () => {
        const fields = el.shadowRoot!.querySelectorAll('.field');
        const untitledField = Array.from(fields).find(f =>
          f.querySelector('label')?.textContent?.trim() === 'untitled'
        );
        expect(untitledField).toBeTruthy();
        expect(untitledField!.querySelector('.description')).toBeNull();
      });
    });
  });

  describe('validation and error display (#208)', () => {
    describe('validateField', () => {
      let validateField: typeof import('./validation.js').validateField;

      beforeEach(async () => {
        const mod = await import('./validation.js');
        validateField = mod.validateField;
      });

      it('returns null for valid values', () => {
        expect(validateField('x', { type: 'string' }, 'hello', false)).toBeNull();
      });

      it('validates required — empty string', () => {
        expect(validateField('name', { type: 'string' }, '', true)).toBe('Required');
      });

      it('validates required — null', () => {
        expect(validateField('name', { type: 'string' }, null, true)).toBe('Required');
      });

      it('validates required — undefined', () => {
        expect(validateField('name', { type: 'string' }, undefined, true)).toBe('Required');
      });

      it('skips required check when not required', () => {
        expect(validateField('name', { type: 'string' }, '', false)).toBeNull();
      });

      it('validates pattern', () => {
        expect(validateField('email', { type: 'string', pattern: '^[^@]+@[^@]+$' }, 'bad', false)).toBe('Invalid format');
      });

      it('passes valid pattern', () => {
        expect(validateField('email', { type: 'string', pattern: '^[^@]+@[^@]+$' }, 'a@b.c', false)).toBeNull();
      });

      it('validates minLength', () => {
        expect(validateField('name', { type: 'string', minLength: 3 }, 'ab', false)).toBe('Must be at least 3 characters');
      });

      it('validates maxLength', () => {
        expect(validateField('name', { type: 'string', maxLength: 5 }, 'abcdef', false)).toBe('Must be at most 5 characters');
      });

      it('validates minimum', () => {
        expect(validateField('age', { type: 'number', minimum: 18 }, 17, false)).toBe('Must be at least 18');
      });

      it('validates maximum', () => {
        expect(validateField('age', { type: 'number', maximum: 100 }, 101, false)).toBe('Must be at most 100');
      });

      it('passes valid number within range', () => {
        expect(validateField('age', { type: 'number', minimum: 0, maximum: 100 }, 50, false)).toBeNull();
      });

      it('returns first failing rule only', () => {
        const msg = validateField('x', { type: 'string', minLength: 5, pattern: '^[A-Z]+$' }, 'ab', false);
        expect(msg).toBeTruthy();
      });
    });

    describe('inline error rendering', () => {
      const validationSchema = {
        type: 'object',
        properties: {
          username: { type: 'string', minLength: 3 },
          age: { type: 'number', minimum: 18 },
          email: { type: 'string', pattern: '^[^@]+@[^@]+$' },
        },
        required: ['username'],
      };

      beforeEach(async () => {
        el.schema = validationSchema;
        el.data = { username: '', age: 10, email: 'bad' };
        el.mode = 'edit';
        await (el as any).updateComplete;
      });

      it('shows errors after submit with invalid data', async () => {
        const result = (el as any).submit();
        expect(result).toBeNull();
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('shows required error for empty required field', async () => {
        (el as any).submit();
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        const errorTexts = Array.from(errors).map(e => e.textContent?.trim());
        expect(errorTexts).toContain('Required');
      });

      it('shows minimum error for out-of-range number', async () => {
        (el as any).submit();
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        const errorTexts = Array.from(errors).map(e => e.textContent?.trim());
        expect(errorTexts).toContain('Must be at least 18');
      });

      it('shows pattern error for invalid format', async () => {
        (el as any).submit();
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        const errorTexts = Array.from(errors).map(e => e.textContent?.trim());
        expect(errorTexts).toContain('Invalid format');
      });

      it('clears errors when data becomes valid', async () => {
        (el as any).submit();
        await (el as any).updateComplete;
        expect(el.shadowRoot!.querySelectorAll('.error').length).toBeGreaterThan(0);

        const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="username"]')!;
        input.value = 'alice';
        input.dispatchEvent(new Event('input'));
        await (el as any).updateComplete;

        (el as any).submit();
        await (el as any).updateComplete;
        const usernameField = Array.from(el.shadowRoot!.querySelectorAll('.field')).find(f =>
          f.querySelector('label')?.textContent?.trim() === 'username'
        );
        expect(usernameField?.querySelector('.error')).toBeNull();
      });

      it('returns data when all fields are valid', async () => {
        el.data = { username: 'alice', age: 25, email: 'a@b.c' };
        await (el as any).updateComplete;
        const result = (el as any).submit();
        expect(result).toEqual({ username: 'alice', age: 25, email: 'a@b.c' });
      });
    });

    describe('blur validation', () => {
      beforeEach(async () => {
        el.schema = {
          type: 'object',
          properties: { name: { type: 'string', minLength: 3 } },
          required: ['name'],
        };
        el.data = { name: '' };
        el.mode = 'edit';
        (el as any).validateOnBlur = true;
        await (el as any).updateComplete;
      });

      it('shows error on blur when validateOnBlur is true', async () => {
        const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="name"]')!;
        input.dispatchEvent(new Event('blur'));
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        expect(errors.length).toBeGreaterThan(0);
      });

      it('does not show error on blur when validateOnBlur is false', async () => {
        (el as any).validateOnBlur = false;
        await (el as any).updateComplete;
        const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="name"]')!;
        input.dispatchEvent(new Event('blur'));
        await (el as any).updateComplete;
        const errors = el.shadowRoot!.querySelectorAll('.error');
        expect(errors.length).toBe(0);
      });
    });
  });

  describe('oneOf labeled enums', () => {
    const oneOfSchema = {
      type: 'object',
      properties: {
        severity: {
          type: 'string',
          title: 'Severity',
          oneOf: [
            { const: 'INFO', title: 'Information' },
            { const: 'WARNING', title: 'Warning' },
            { const: 'URGENT', title: 'Urgent' },
          ],
        },
      },
      required: ['severity'],
    };

    it('renders select with title labels and const values in edit mode', async () => {
      el.schema = oneOfSchema;
      el.data = { severity: 'WARNING' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const select = el.shadowRoot!.querySelector<HTMLSelectElement>('select[id="severity"]');
      expect(select).toBeTruthy();
      expect(select!.value).toBe('WARNING');
      const options = Array.from(select!.querySelectorAll('option:not([disabled])'));
      expect(options.map(o => o.textContent?.trim())).toEqual(['Information', 'Warning', 'Urgent']);
      expect(options.map(o => (o as HTMLOptionElement).value)).toEqual(['INFO', 'WARNING', 'URGENT']);
    });

    it('renders disabled placeholder when value is empty', async () => {
      el.schema = oneOfSchema;
      el.data = { severity: '' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const select = el.shadowRoot!.querySelector<HTMLSelectElement>('select[id="severity"]');
      const placeholder = select!.querySelector('option[disabled]');
      expect(placeholder).toBeTruthy();
      expect(placeholder!.textContent?.trim()).toContain('Select');
      expect(placeholder!.selected).toBe(true);
    });

    it('displays title instead of const in display mode', async () => {
      el.schema = oneOfSchema;
      el.data = { severity: 'URGENT' };
      el.mode = 'display';
      await (el as any).updateComplete;
      expect(el.shadowRoot!.textContent).toContain('Urgent');
      expect(el.shadowRoot!.textContent).not.toContain('URGENT');
    });

    it('takes priority over enum when both present', async () => {
      el.schema = {
        type: 'object',
        properties: {
          status: {
            type: 'string',
            enum: ['A', 'B'],
            oneOf: [
              { const: 'X', title: 'Option X' },
              { const: 'Y', title: 'Option Y' },
            ],
          },
        },
      };
      el.data = { status: 'X' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const options = el.shadowRoot!.querySelectorAll('select option:not([disabled])');
      expect(options.length).toBe(2);
      expect(options[0]!.textContent?.trim()).toBe('Option X');
    });

    it('validates required oneOf field rejects empty', async () => {
      el.schema = oneOfSchema;
      el.data = { severity: '' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeNull();
      await (el as any).updateComplete;
      const errors = el.shadowRoot!.querySelectorAll('.error');
      expect(errors.length).toBeGreaterThan(0);
    });
  });

  describe('format: time', () => {
    const timeSchema = {
      type: 'object',
      properties: {
        start: { type: 'string', format: 'time', title: 'Start Time' },
      },
    };

    it('renders time input in edit mode', async () => {
      el.schema = timeSchema;
      el.data = { start: '09:30' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const input = el.shadowRoot!.querySelector<HTMLInputElement>('input[type="time"]');
      expect(input).toBeTruthy();
      expect(input!.value).toBe('09:30');
    });

    it('displays time value in display mode', async () => {
      el.schema = timeSchema;
      el.data = { start: '14:00' };
      el.mode = 'display';
      await (el as any).updateComplete;
      expect(el.shadowRoot!.textContent).toContain('14:00');
    });
  });

  describe('readOnly', () => {
    const readOnlySchema = {
      type: 'object',
      properties: {
        id: { type: 'string', title: 'ID', readOnly: true },
        name: { type: 'string', title: 'Name' },
      },
      required: ['id', 'name'],
    };

    it('renders readonly attribute in edit mode', async () => {
      el.schema = readOnlySchema;
      el.data = { id: 'abc-123', name: 'Test' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const idInput = el.shadowRoot!.querySelector<HTMLInputElement>('input[id="id"]');
      expect(idInput!.readOnly).toBe(true);
    });

    it('skips readOnly fields during validation', async () => {
      el.schema = readOnlySchema;
      el.data = { id: '', name: 'Test' };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeTruthy();
    });
  });

  describe('recursive validation', () => {
    it('validates required fields in nested objects', async () => {
      el.schema = {
        type: 'object',
        properties: {
          template: {
            type: 'object',
            properties: {
              title: { type: 'string' },
              category: { type: 'string' },
            },
            required: ['title', 'category'],
          },
        },
      };
      el.data = { template: { title: '', category: '' } };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeNull();
      await (el as any).updateComplete;
      const errors = el.shadowRoot!.querySelectorAll('.error');
      expect(errors.length).toBeGreaterThanOrEqual(1);
    });

    it('validates required fields in array items', async () => {
      el.schema = {
        type: 'object',
        properties: {
          items: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                value: { type: 'string' },
              },
              required: ['name', 'value'],
            },
          },
        },
      };
      el.data = { items: [{ name: '', value: '' }] };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeNull();
    });

    it('passes when nested required fields are present', async () => {
      el.schema = {
        type: 'object',
        properties: {
          template: {
            type: 'object',
            properties: {
              title: { type: 'string' },
            },
            required: ['title'],
          },
        },
      };
      el.data = { template: { title: 'Hello' } };
      el.mode = 'edit';
      await (el as any).updateComplete;
      const result = (el as any).submit();
      expect(result).toBeTruthy();
    });
  });
});
