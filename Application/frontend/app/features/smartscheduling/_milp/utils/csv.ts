import { validateAppliance } from "./appliances";
import { type Appliance } from "../types";

export const CSV_COLUMNS = [
  "id",
  "name",
  "power_kw",
  "duration_minutes",
  "earliest_start",
  "latest_finish",
  "preferred_start",
  "priority",
  "recurrence",
  "weekdays",
  "run_date",
  "enabled",
];

// Supports quoted commas, escaped quotes, CRLF, and quoted multiline fields.
function parse(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;
  for (let index = 0; index < text.length; index++) {
    const char = text[index];
    if (char === '"') {
      if (quoted && text[index + 1] === '"') {
        cell += '"';
        index++;
      } else quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && text[index + 1] === "\n") index++;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else cell += char;
  }
  if (quoted) throw new Error("CSV contains an unclosed quoted field.");
  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

export function importAppliances(text: string): Appliance[] {
  if (text.length > 100_000)
    throw new Error("CSV is too large. Maximum 100 KB.");
  const rows = parse(text.replace(/^\uFEFF/, ""));
  const headers = rows.shift()?.map((value) => value.trim());
  if (
    !headers ||
    CSV_COLUMNS.some((name) => !headers.includes(name)) ||
    new Set(headers).size !== headers.length
  )
    throw new Error(`Use the template columns: ${CSV_COLUMNS.join(", ")}.`);
  if (!rows.length || rows.length > 30)
    throw new Error("Import between 1 and 30 appliance rows.");
  const appliances = rows.map((row, index) => {
    if (row.length !== headers.length)
      throw new Error(`Row ${index + 2}: incorrect number of columns.`);
    const item = Object.fromEntries(
      headers.map((name, column) => [name, row[column].trim()]),
    );
    for (const name of ["power_kw", "duration_minutes", "priority"])
      if (!item[name])
        throw new Error(`Row ${index + 2}: ${name} is required.`);
    if (!["true", "false"].includes(item.enabled.toLowerCase()))
      throw new Error(`Row ${index + 2}: enabled must be true or false.`);
    const appliance: Appliance = {
      id: item.id,
      name: item.name,
      power_kw: Number(item.power_kw),
      duration_minutes: Number(item.duration_minutes),
      earliest_start: item.earliest_start,
      latest_finish: item.latest_finish,
      preferred_start: item.preferred_start,
      priority: Number(item.priority),
      recurrence: item.recurrence as Appliance["recurrence"],
      weekdays: item.weekdays ? item.weekdays.split(";").map(Number) : [],
      run_date: item.run_date || null,
      enabled: item.enabled.toLowerCase() === "true",
    };
    const error = validateAppliance(appliance);
    if (error) throw new Error(`Row ${index + 2}: ${error}`);
    return appliance;
  });
  if (new Set(appliances.map((item) => item.id)).size !== appliances.length)
    throw new Error("CSV IDs must be unique.");
  return appliances;
}

export function downloadCsv(
  filename: string,
  rows: (string | number | boolean | null)[][],
) {
  const escape = (value: string | number | boolean | null) => {
    let text = value === null ? "" : String(value);
    if (typeof value === "string" && /^[=+@-]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  };
  const url = URL.createObjectURL(
    new Blob([rows.map((row) => row.map(escape).join(",")).join("\r\n")], {
      type: "text/csv;charset=utf-8;",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
