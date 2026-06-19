import {
  page, title, table, textInput, numberInput,
  dropdown, checkbox, datePicker, textarea, inlineDataset,
} from "@casehub/ui";
import { createLookup } from "@casehub/data";
import type { DataSetId } from "@casehub/data";

const contacts = "contacts" as DataSetId;

const dataset = inlineDataset("contacts",
  JSON.stringify([
    [1, "Alice Johnson", "alice@example.com", "+1-555-0101", "Work", "true", "2024-03-15", "Key client contact", 1],
    [2, "Bob Smith", "bob@example.com", "+1-555-0102", "Personal", "true", "2023-11-20", "", 2],
    [3, "Carol Davis", "carol@example.com", "+1-555-0103", "Work", "false", "2025-01-08", "On leave until March", 3],
  ]),
  {
    columns: [
      { id: "id", type: "NUMBER" },
      { id: "name", type: "TEXT" },
      { id: "email", type: "TEXT" },
      { id: "phone", type: "TEXT" },
      { id: "category", type: "LABEL" },
      { id: "active", type: "LABEL" },
      { id: "startDate", type: "DATE" },
      { id: "notes", type: "TEXT" },
      { id: "priority", type: "NUMBER" },
    ],
  },
);

export default page("Contact List",
  title("Contact Manager"),
  table({
    pageSize: 10,
    sortable: true,
    filter: { enabled: true, notification: true },
    lookup: createLookup(contacts, []),
  }),
  page("Contact Form",
    textInput({ field: "name", label: "Full Name", required: true }),
    textInput({ field: "email", label: "Email", required: true }),
    textInput({ field: "phone", label: "Phone" }),
    numberInput({ field: "priority", label: "Priority", min: 1, max: 5 }),
    dropdown({
      field: "category", label: "Category",
      options: { values: ["Work", "Personal", "Family", "Other"] },
    }),
    checkbox({ field: "active", label: "Active" }),
    datePicker({ field: "startDate", label: "Start Date" }),
    textarea({ field: "notes", label: "Notes", rows: 3 }),
    {
      dataScope: { dataset: contacts, idColumn: "id" },
      save: { trigger: "auto", delay: 2000, adapter: "local" },
    },
  ),
  { datasets: [dataset] },
);
