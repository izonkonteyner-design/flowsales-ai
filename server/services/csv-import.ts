import { z } from "zod";

const MAX_ROWS = 5000;
const MAX_CELL_LENGTH = 5000;

export const leadImportFields = ["full_name", "email", "phone", "company", "source", "status"] as const;
export type LeadImportField = (typeof leadImportFields)[number];
export type LeadColumnMapping = Partial<Record<LeadImportField, string>>;

const aliases: Record<LeadImportField, string[]> = {
  full_name: ["full_name", "full name", "name", "ad soyad", "ad_soyad", "isim", "müşteri", "musteri"],
  email: ["email", "e-mail", "mail", "eposta", "e-posta"],
  phone: ["phone", "telephone", "tel", "telefon", "gsm", "mobile"],
  company: ["company", "company name", "firma", "şirket", "sirket", "kurum"],
  source: ["source", "lead source", "kaynak", "kanal"],
  status: ["status", "lead status", "durum", "aşama", "asama"],
};

export const leadImportRowSchema = z.object({
  full_name: z.string().trim().min(1).max(200),
  email: z.string().trim().email().max(320).optional().or(z.literal("")),
  phone: z.string().trim().max(50).optional().or(z.literal("")),
  company: z.string().trim().max(200).optional().or(z.literal("")),
  source: z.string().trim().max(100).optional().or(z.literal("")),
  status: z.string().trim().max(50).optional().or(z.literal("")),
});

export type LeadImportRow = z.infer<typeof leadImportRowSchema>;

function normalizeHeader(value: string) {
  return value.trim().toLocaleLowerCase("tr-TR");
}

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

export function getLeadCsvHeaders(input: string): string[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return [];
  const headers = parseCsvLine(normalized.split("\n")[0]!).map((value) => value.trim());
  if (headers.some((header) => !header)) throw new Error("CSV contains an empty header.");
  if (new Set(headers.map(normalizeHeader)).size !== headers.length) throw new Error("CSV contains duplicate headers.");
  return headers;
}

export function suggestLeadColumnMapping(headers: string[]): LeadColumnMapping {
  const normalized = headers.map((header) => ({ original: header, normalized: normalizeHeader(header) }));
  return Object.fromEntries(
    leadImportFields.flatMap((field) => {
      const match = normalized.find((header) => aliases[field].includes(header.normalized));
      return match ? [[field, match.original]] : [];
    }),
  );
}

export type CsvImportRejection = {
  row: number;
  errors: string[];
  values: Record<string, string>;
};

export type CsvImportResult<T> = {
  accepted: T[];
  rejected: CsvImportRejection[];
  headers: string[];
  mapping: LeadColumnMapping;
};

export function parseLeadCsv(input: string, requestedMapping?: LeadColumnMapping): CsvImportResult<LeadImportRow> {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n/g, "\n").trim();
  if (!normalized) return { accepted: [], rejected: [], headers: [], mapping: {} };
  const lines = normalized.split("\n");
  if (lines.length - 1 > MAX_ROWS) throw new Error(`CSV exceeds ${MAX_ROWS} data rows.`);
  const headers = getLeadCsvHeaders(normalized);
  const mapping = requestedMapping ?? suggestLeadColumnMapping(headers);
  const selectedHeaders = Object.values(mapping).filter((value): value is string => Boolean(value));
  if (new Set(selectedHeaders.map(normalizeHeader)).size !== selectedHeaders.length) {
    throw new Error("A CSV column cannot be mapped to more than one field.");
  }
  if (!mapping.full_name || !headers.some((header) => normalizeHeader(header) === normalizeHeader(mapping.full_name!))) {
    throw new Error("Map one CSV column to Full name.");
  }
  for (const header of selectedHeaders) {
    if (!headers.some((candidate) => normalizeHeader(candidate) === normalizeHeader(header))) {
      throw new Error(`Mapped column does not exist: ${header}`);
    }
  }

  const accepted: LeadImportRow[] = [];
  const rejected: CsvImportRejection[] = [];
  lines.slice(1).forEach((line, offset) => {
    if (!line.trim()) return;
    const cells = parseCsvLine(line);
    const original = Object.fromEntries(headers.map((header, index) => [header, cells[index]?.trim() ?? ""]));
    if (cells.some((cell) => cell.length > MAX_CELL_LENGTH)) {
      rejected.push({ row: offset + 2, errors: ["A cell exceeds the maximum length."], values: original });
      return;
    }
    const record = Object.fromEntries(
      leadImportFields.map((field) => {
        const sourceHeader = mapping[field];
        return [field, sourceHeader ? original[sourceHeader] ?? "" : ""];
      }),
    );
    const parsed = leadImportRowSchema.safeParse(record);
    if (!parsed.success) {
      rejected.push({
        row: offset + 2,
        errors: parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`),
        values: original,
      });
      return;
    }
    accepted.push(parsed.data);
  });
  return { accepted, rejected, headers, mapping };
}
