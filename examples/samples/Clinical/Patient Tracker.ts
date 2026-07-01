import {
  page,
  tabs,
  columns,
  metric,
  barChart,
  pieChart,
  areaChart,
  lineChart,
  selector,
  table,
  panel,
  markdown,
  textInput,
  numberInput,
  dropdown,
  textarea,
  checkbox,
  datePicker,
  inlineDataset,
  lookup,
  groupBy,
  filterBy,
  col,
  sum,
  avg,
  count,
} from "@casehubio/ui";
import type { DataSetId, ColumnId } from "@casehubio/data";

// TypeScript companion to "Patient Tracker.dash.yaml"
// 3-page tabs dashboard with clinical patient and vitals data

const patients = "patients" as DataSetId;
const vitals = "vitals" as DataSetId;

const patientsDataset = inlineDataset(
  "patients",
  JSON.stringify([
    [1, "Emily Rodriguez", 34, "F", "ICU", "Pneumonia", "2026-06-20", "Critical", "Dr. Sarah Mitchell", "Patient requires close monitoring, high fever persists", "true"],
    [2, "Michael Chen", 67, "M", "General", "Post-Op", "2026-06-18", "Stable", "Dr. James Anderson", "Recovery progressing well", "false"],
    [3, "Sophia Patel", 5, "F", "Pediatrics", "Asthma", "2026-06-24", "Monitoring", "Dr. Lisa Thompson", "Nebulizer treatment 4x daily", "false"],
    [4, "James Wilson", 52, "M", "ICU", "Myocardial Infarction", "2026-06-19", "Critical", "Dr. Sarah Mitchell", "Cardiac enzyme levels elevated, ECG abnormal", "true"],
    [5, "Maria Santos", 28, "F", "Maternity", "Post-Delivery", "2026-06-25", "Stable", "Dr. Rachel Kim", "Normal vaginal delivery, mother and baby healthy", "false"],
    [6, "Robert Johnson", 45, "M", "General", "Fracture", "2026-06-23", "Stable", "Dr. James Anderson", "Right femur fracture, surgery scheduled tomorrow", "false"],
    [7, "Aisha Ibrahim", 72, "F", "General", "Diabetes", "2026-06-21", "Monitoring", "Dr. Michael Chang", "Blood sugar levels fluctuating", "true"],
    [8, "David Lee", 8, "M", "Pediatrics", "Appendicitis", "2026-06-24", "Monitoring", "Dr. Lisa Thompson", "Post-appendectomy day 1", "false"],
    [9, "Isabella Martinez", 82, "F", "ICU", "Stroke", "2026-06-20", "Critical", "Dr. Sarah Mitchell", "Left-sided weakness, speech impairment", "true"],
    [10, "Thomas Brown", 39, "M", "Outpatient", "Hypertension", "2026-06-26", "Stable", "Dr. Michael Chang", "Medication adjustment follow-up", "false"],
    [11, "Fatima Ahmed", 31, "F", "Maternity", "Labor", "2026-06-26", "Monitoring", "Dr. Rachel Kim", "First-time mother, 6cm dilated", "false"],
    [12, "Christopher White", 55, "M", "General", "Pneumonia", "2026-06-22", "Stable", "Dr. James Anderson", "Responding well to antibiotics", "false"],
    [13, "Yuki Tanaka", 12, "F", "Pediatrics", "Fracture", "2026-06-25", "Stable", "Dr. Lisa Thompson", "Left arm fracture, cast applied", "false"],
    [14, "Antonio Garcia", 63, "M", "ICU", "Sepsis", "2026-06-21", "Stable", "Dr. Sarah Mitchell", "Broad-spectrum antibiotics started, responding to treatment", "false"],
    [15, "Hannah Cohen", 26, "F", "Outpatient", "Migraine", "2026-06-26", "Stable", "Dr. Michael Chang", "Preventive medication prescribed", "false"],
    [16, "Mohammed Ali", 48, "M", "General", "Diabetes", "2026-06-23", "Monitoring", "Dr. James Anderson", "Insulin adjustment required", "false"],
    [17, "Olivia Smith", 2, "F", "Pediatrics", "Bronchiolitis", "2026-06-25", "Monitoring", "Dr. Lisa Thompson", "Oxygen saturation improving", "true"],
    [18, "Samuel Davis", 71, "M", "General", "Post-Op", "2026-06-19", "Stable", "Dr. James Anderson", "Hip replacement recovery day 7", "false"],
    [19, "Priya Sharma", 35, "F", "Maternity", "Post-Delivery", "2026-06-24", "Stable", "Dr. Rachel Kim", "C-section day 2, incision healing well", "false"],
    [20, "Lucas Anderson", 58, "M", "Outpatient", "Asthma", "2026-06-26", "Stable", "Dr. Michael Chang", "Inhaler technique reviewed", "false"],
    [21, "Grace Kim", 77, "F", "General", "Heart Failure", "2026-06-22", "Monitoring", "Dr. Michael Chang", "Diuretic dose increased", "true"],
    [22, "Ethan Taylor", 9, "M", "Pediatrics", "Gastroenteritis", "2026-06-25", "Stable", "Dr. Lisa Thompson", "Rehydration therapy ongoing", "false"],
    [23, "Amara Okafor", 42, "F", "ICU", "Respiratory Failure", "2026-06-21", "Stable", "Dr. Sarah Mitchell", "Extubated, breathing spontaneously", "false"],
    [24, "William Zhang", 60, "M", "General", "Cellulitis", "2026-06-24", "Stable", "Dr. James Anderson", "IV antibiotics showing improvement", "false"],
    [25, "Nina Petrova", 29, "F", "Outpatient", "Sprained Ankle", "2026-06-26", "Stable", "Dr. Michael Chang", "RICE protocol advised, follow-up in 2 weeks", "false"],
  ]),
  {
    columns: [
      { id: "id" as ColumnId, type: "NUMBER" },
      { id: "name" as ColumnId, type: "TEXT" },
      { id: "age" as ColumnId, type: "NUMBER" },
      { id: "gender" as ColumnId, type: "LABEL" },
      { id: "ward" as ColumnId, type: "LABEL" },
      { id: "diagnosis" as ColumnId, type: "LABEL" },
      { id: "admitDate" as ColumnId, type: "DATE" },
      { id: "status" as ColumnId, type: "LABEL" },
      { id: "doctor" as ColumnId, type: "TEXT" },
      { id: "notes" as ColumnId, type: "TEXT" },
      { id: "flagged" as ColumnId, type: "LABEL" },
    ],
  }
);

const vitalsDataset = inlineDataset(
  "vitals",
  JSON.stringify([
    [1, "2026-06-25T08:00", 112, 145, 92, 38.9, 91],
    [1, "2026-06-25T14:00", 118, 148, 94, 39.1, 90],
    [1, "2026-06-25T20:00", 115, 142, 90, 38.7, 92],
    [1, "2026-06-26T02:00", 120, 150, 95, 39.3, 89],
    [4, "2026-06-25T08:00", 105, 138, 88, 38.2, 92],
    [4, "2026-06-25T14:00", 108, 142, 90, 38.5, 91],
    [4, "2026-06-25T20:00", 102, 135, 85, 38.0, 93],
    [4, "2026-06-26T02:00", 110, 145, 92, 38.8, 90],
    [9, "2026-06-25T08:00", 98, 155, 98, 37.8, 88],
    [9, "2026-06-25T14:00", 102, 158, 100, 38.2, 87],
    [9, "2026-06-25T20:00", 95, 152, 96, 37.6, 89],
    [9, "2026-06-26T02:00", 100, 160, 102, 38.4, 86],
    [14, "2026-06-25T08:00", 78, 120, 78, 36.9, 97],
    [14, "2026-06-25T14:00", 76, 122, 80, 37.0, 98],
    [14, "2026-06-25T20:00", 80, 125, 82, 36.8, 98],
    [14, "2026-06-26T02:00", 75, 118, 76, 36.7, 99],
    [23, "2026-06-25T08:00", 82, 128, 84, 36.9, 97],
    [23, "2026-06-25T14:00", 80, 125, 82, 37.0, 98],
    [23, "2026-06-25T20:00", 78, 122, 80, 36.8, 98],
    [23, "2026-06-26T02:00", 84, 130, 85, 37.1, 97],
    [2, "2026-06-25T08:00", 72, 118, 76, 36.8, 97],
    [2, "2026-06-25T14:00", 75, 120, 78, 36.9, 97],
    [2, "2026-06-25T20:00", 70, 116, 74, 36.7, 98],
    [3, "2026-06-25T08:00", 88, 105, 68, 37.1, 94],
    [3, "2026-06-25T14:00", 85, 108, 70, 37.0, 95],
    [3, "2026-06-25T20:00", 90, 110, 72, 37.2, 93],
    [3, "2026-06-26T02:00", 92, 112, 74, 37.3, 92],
    [6, "2026-06-25T08:00", 78, 125, 82, 36.9, 98],
    [6, "2026-06-25T14:00", 80, 128, 84, 37.0, 98],
    [7, "2026-06-25T08:00", 82, 142, 88, 37.2, 96],
    [7, "2026-06-25T14:00", 85, 145, 90, 37.4, 96],
    [7, "2026-06-25T20:00", 88, 148, 92, 37.5, 95],
    [8, "2026-06-25T08:00", 95, 115, 75, 37.3, 97],
    [8, "2026-06-25T14:00", 92, 112, 72, 37.1, 98],
    [12, "2026-06-25T08:00", 80, 128, 84, 37.6, 96],
    [12, "2026-06-25T14:00", 78, 125, 82, 37.4, 97],
    [13, "2026-06-25T08:00", 90, 108, 70, 36.8, 99],
    [16, "2026-06-25T08:00", 85, 138, 88, 37.2, 97],
    [16, "2026-06-25T14:00", 88, 142, 90, 37.4, 96],
    [16, "2026-06-25T20:00", 82, 135, 85, 37.1, 98],
    [17, "2026-06-25T08:00", 105, 95, 62, 37.8, 91],
    [17, "2026-06-25T14:00", 100, 98, 65, 37.5, 93],
    [17, "2026-06-25T20:00", 98, 100, 68, 37.3, 94],
    [17, "2026-06-26T02:00", 95, 102, 70, 37.1, 95],
    [18, "2026-06-25T08:00", 75, 132, 86, 36.9, 98],
    [21, "2026-06-25T08:00", 88, 155, 95, 37.5, 95],
    [21, "2026-06-25T14:00", 90, 158, 98, 37.6, 94],
    [21, "2026-06-25T20:00", 92, 160, 100, 37.8, 93],
    [24, "2026-06-25T08:00", 76, 122, 80, 37.2, 98],
    [5, "2026-06-25T08:00", 68, 115, 74, 36.7, 99],
    [5, "2026-06-25T14:00", 70, 118, 76, 36.8, 99],
    [11, "2026-06-25T08:00", 95, 128, 82, 37.4, 97],
    [11, "2026-06-25T14:00", 98, 132, 85, 37.6, 96],
    [11, "2026-06-25T20:00", 102, 135, 88, 37.8, 95],
    [19, "2026-06-25T08:00", 72, 120, 78, 36.9, 98],
    [10, "2026-06-25T08:00", 80, 142, 90, 37.1, 98],
    [15, "2026-06-25T08:00", 75, 118, 76, 36.8, 99],
    [20, "2026-06-25T08:00", 78, 125, 82, 36.9, 98],
    [22, "2026-06-25T08:00", 92, 105, 68, 37.2, 97],
    [25, "2026-06-25T08:00", 74, 122, 80, 36.8, 99],
  ]),
  {
    columns: [
      { id: "patientId" as ColumnId, type: "NUMBER" },
      { id: "timestamp" as ColumnId, type: "DATE" },
      { id: "heartRate" as ColumnId, type: "NUMBER" },
      { id: "systolic" as ColumnId, type: "NUMBER" },
      { id: "diastolic" as ColumnId, type: "NUMBER" },
      { id: "temperature" as ColumnId, type: "NUMBER" },
      { id: "o2Saturation" as ColumnId, type: "NUMBER" },
    ],
  }
);

export default page(
  { displayer: { chart: { resizable: true } } },
  [patientsDataset, vitalsDataset],
  [
    // Index page: Tabs navigation
    tabs({ navGroupId: "ClinicalNav", width: "100%" }),

    // === Page 1: Ward Overview ===
    page(
      "Ward Overview",
      columns(
        { span: 3 },
        metric({
          title: "Total Patients",
          lookup: lookup(patients, [], [groupBy([], [count("id", "id", "#")])]),
        }),
        { span: 3 },
        metric({
          title: "Critical Count",
          lookup: lookup(
            patients,
            [filterBy("status", "EQUALS_TO", "Critical")],
            [groupBy([], [count("id", "id", "#")])]
          ),
        }),
        { span: 3 },
        metric({
          title: "Avg Age",
          lookup: lookup(patients, [], [groupBy([], [avg("age", "age", "#.#")])]),
        }),
        { span: 3 },
        metric({
          title: "Flagged",
          lookup: lookup(
            patients,
            [filterBy("flagged", "EQUALS_TO", "true")],
            [groupBy([], [count("id", "id", "#")])]
          ),
        })
      ),
      selector({
        subtype: "dropdown",
        selfApply: true,
        notification: true,
        lookup: lookup(patients, [], [groupBy(["ward"], [col("ward")])]),
      }),
      columns(
        { span: 4 },
        pieChart({
          title: "Patients by Diagnosis",
          listening: true,
          lookup: lookup(patients, [], [groupBy(["diagnosis"], [col("diagnosis"), count("id")])]),
        }),
        { span: 4 },
        barChart({
          title: "Patients by Ward",
          listening: true,
          lookup: lookup(patients, [], [groupBy(["ward"], [col("ward"), count("id")])]),
        }),
        { span: 4 },
        pieChart({
          subtype: "donut",
          title: "Patients by Status",
          listening: true,
          lookup: lookup(patients, [], [groupBy(["status"], [col("status"), count("id")])]),
        })
      ),
      markdown(`## Ward Protocol Notes

**ICU Protocols:**
- Vitals monitoring every 2 hours
- Critical patients require attending physician approval for transfers
- Family visitation restricted to 15 minutes per hour

**General Ward:**
- Standard vitals monitoring every 4 hours
- Discharge planning begins at admission
- Medication reconciliation required within 24 hours

**Pediatrics:**
- Parent/guardian must remain with patient under 12
- Specialized dosing protocols for all medications
- Play therapy available 9 AM - 5 PM

**Maternity:**
- Rooming-in encouraged for all mothers
- Lactation consultant available on request
- Newborn screening completed before discharge`)
    ),

    // === Page 2: Vitals Monitor ===
    page(
      "Vitals Monitor",
      areaChart({
        title: "Heart Rate by Patient",
        listening: true,
        lookup: lookup(
          vitals,
          [],
          [groupBy(["patientId"], [col("patientId"), avg("heartRate")])]
        ),
      }),
      columns(
        { span: 6 },
        lineChart({
          title: "Blood Pressure",
          listening: true,
          lookup: lookup(
            vitals,
            [],
            [groupBy(["timestamp"], [col("timestamp"), avg("systolic"), avg("diastolic")])]
          ),
        }),
        { span: 6 },
        lineChart({
          title: "Oxygen Saturation",
          listening: true,
          lookup: lookup(
            vitals,
            [],
            [groupBy(["timestamp"], [col("timestamp"), avg("o2Saturation")])]
          ),
        })
      ),
      table({
        pageSize: 10,
        sortable: true,
        columns: [
          {
            id: "temperature" as ColumnId,
            expression: 'value > 38.5 ? "⚠️ " + value : value',
          },
        ],
        lookup: lookup(vitals, [], []),
      })
    ),

    // === Page 3: Patient Detail ===
    page(
      "Patient Detail",
      panel(
        "Patient Records",
        table({
          sortable: true,
          listening: true,
          notification: true,
          lookup: lookup(patients, [], []),
        })
      ),
      panel(
        "Edit Patient",
        textInput({ field: "name", label: "Patient Name", readonly: true }),
        numberInput({ field: "age", label: "Age", readonly: true }),
        dropdown({
          field: "ward",
          label: "Ward",
          options: { values: ["ICU", "General", "Pediatrics", "Maternity", "Outpatient"] },
        }),
        dropdown({
          field: "status",
          label: "Status",
          options: { values: ["Stable", "Monitoring", "Critical"] },
        }),
        textInput({ field: "doctor", label: "Doctor" }),
        textarea({ field: "notes", label: "Notes", rows: 4 }),
        datePicker({ field: "admitDate", label: "Admit Date", readonly: true }),
        checkbox({ field: "flagged", label: "Flagged for Review" })
      ),
      {
        dataScope: { dataset: patients, idColumn: "id" as ColumnId },
        save: { trigger: "auto", delay: 2000, adapter: "local" },
      }
    ),
  ]
);
