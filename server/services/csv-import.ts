import { z } from "zod";

const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 5000;

export const leadImportRowSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  source: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.string().trim().max(50).optional().or(z.literal("")),
});

export type LeadImportRow = z.infer<typeof leadImportRowSchema>;

function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      if (quoted && line[index + 1] === '"') {
        value += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += char;
    }
  }
  if (quoted) throw new Error("CSV contains an unterminated quoted value.");
  cells.push(value);
  return cells;
}

export type CsvImportResult<T> = {
  accepted: T[];
  rejected: Array<{ row: number; errors: string[] }>;
};

export function parseLeadCsv(input: string): CsvImportResult<LeadImportRow> {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { accepted: [], rejected: [] };
  const lines = normalized.split("\n");
  if (lines.length - 1 > MAX_ROWS) throw new Error(`CSV exceeds ${MAX_ROWS} data rows.`);
  const headers = parseCsvLine(lines[0]!).map((value) => value.trim().toLowerCase());
  if (!headers.includes("full_name")) throw new Error("CSV must contain a full_name column.");
  if (new Set(headers).size !== headers.length) throw new Error("CSV contains duplicate headers.");

  const accepted: LeadImportRow[] = [];
  const rejected: Array<{ row: number; errors: string[] }> = [];
  lines.slice(1).forEach((line, offset) => {
    if (!line.trim()) return;
    const cells = parseCsvLine(line);
    if (cells.some((cell) => cell.length > MAX_CELL_LENGTH)) {
      rejected.push({ row: offset + 2, errors: ["A cell exceeds the maximum length."] });
      return;
    }
    const record = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
    const parsed = leadImportRowSchema.safeParse(record);
    if (!parsed.success) {
      rejected.push({ row: offset + 2, errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`) });
      return;
    }
    accepted.push(parsed.data);
  });
  return { accepted, rejected };
}
