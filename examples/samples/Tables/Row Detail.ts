import { html } from 'lit';
import type { TypedRow, ColumnId } from '@casehubio/pages-data';
import type { PagesTable } from '@casehubio/pages-table';

// Column IDs matching the dataset
const idCol = 'id' as ColumnId;
const nameCol = 'name' as ColumnId;
const deptCol = 'department' as ColumnId;
const roleCol = 'role' as ColumnId;
const joinedCol = 'joined' as ColumnId;
const salaryCol = 'salary' as ColumnId;
const skillsCol = 'skills' as ColumnId;
const notesCol = 'notes' as ColumnId;

// Get a reference to the table element
const table = document.querySelector('pages-table') as PagesTable;

// Required: getRowKey identifies each row for expand state tracking
table.getRowKey = (row: TypedRow) => row.text(idCol);

// Multi mode: multiple detail panels can be open at once
table.detailMode = 'multi';

// getRowDetail returns a TemplateResult for each row's detail panel.
// Return undefined to hide the expand button for rows without detail.
table.getRowDetail = (row: TypedRow) => {
  const skills = row.text(skillsCol);
  const notes = row.text(notesCol);
  const joined = row.text(joinedCol);
  const salary = row.text(salaryCol);

  return html`
    <div style="display: grid; grid-template-columns: auto 1fr; gap: 4px 16px; padding: 12px 0;">
      <span style="font-weight: 600; font-size: 12px; color: var(--pages-neutral-9);">Joined</span>
      <span>${joined}</span>

      <span style="font-weight: 600; font-size: 12px; color: var(--pages-neutral-9);">Salary</span>
      <span>$${Number(salary).toLocaleString()}</span>

      <span style="font-weight: 600; font-size: 12px; color: var(--pages-neutral-9);">Skills</span>
      <span>${skills}</span>

      <span style="font-weight: 600; font-size: 12px; color: var(--pages-neutral-9);">Notes</span>
      <span>${notes}</span>
    </div>
  `;
};

// Listen for expand/collapse events
table.addEventListener('detail-change', (e: Event) => {
  const { key, expanded } = (e as CustomEvent).detail;
  console.log(`Row ${key} ${expanded ? 'expanded' : 'collapsed'}`);
});

// Controlled mode (optional): drive expansion state externally
// table.expandedDetailKeys = ['EMP-001', 'EMP-003'];
