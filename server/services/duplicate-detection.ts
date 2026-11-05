import type { WorkspaceRole } from "@/lib/workspace-roles";

/**
 * Duplicate detection for already-existing leads/contacts rows (e.g. entered
 * manually twice, or imported twice). This is intentionally independent from
 * `normalizeCustomerDuplicateKey` in `server/services/crm-integration.ts`,
 * which is used at lead-conversion time to avoid creating a *new* duplicate
 * customer row. That function's behavior must not change, so this module
 * defines its own normalization instead of importing it.
 */

export type DuplicateMatchReason = "email" | "phone" | "name_company";

export type DuplicateCandidate = {
  id: string;
  full_name: string;
  company?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type DuplicateGroup<T> = {
  key: string;
  reasons: DuplicateMatchReason[];
  records: T[];
};

export function normalizeDuplicateEmail(value: string | null | undefined): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

export function normalizeDuplicatePhone(value: string | null | undefined): string {
  if (typeof value !== "string") return "";
  let digits = value.replace(/[^\d]/g, "");
  if (digits.length > 10 && digits.startsWith("90")) digits = digits.slice(2);
  if (digits.length > 10 && digits.startsWith("0")) digits = digits.slice(1);
  return digits.length >= 7 ? digits : "";
}

export function normalizeDuplicateNameCompanyKey(
  name: string | null | undefined,
  company: string | null | undefined,
): string {
  const normalizedName = typeof name === "string" ? name.trim().toLowerCase().replace(/\s+/g, " ") : "";
  const normalizedCompany = typeof company === "string" ? company.trim().toLowerCase().replace(/\s+/g, " ") : "";
  if (!normalizedName || !normalizedCompany) return "";
  return `${normalizedName}::${normalizedCompany}`;
}

/**
 * Groups candidate records (leads or contacts) that are likely duplicates of
 * each other, using a union-find over three signals: normalized email,
 * normalized phone, and normalized full_name+company. Records are grouped
 * transitively, so A<->B (by email) and B<->C (by phone) land in one group.
 * Pure function — no I/O — so it is unit testable without a database.
 */
export function findDuplicateGroups<T extends DuplicateCandidate>(records: readonly T[]): DuplicateGroup<T>[] {
  const parent = new Map<string, string>();

  function find(x: string): string {
    if (!parent.has(x)) parent.set(x, x);
    let root = x;
    while (parent.get(root) !== root) root = parent.get(root) as string;
    let cur = x;
    while (parent.get(cur) !== root) {
      const next = parent.get(cur) as string;
      parent.set(cur, root);
      cur = next;
    }
    return root;
  }

  function union(a: string, b: string) {
    const rootA = find(a);
    const rootB = find(b);
    if (rootA !== rootB) parent.set(rootA, rootB);
  }

  const byEmail = new Map<string, string[]>();
  const byPhone = new Map<string, string[]>();
  const byNameCompany = new Map<string, string[]>();

  for (const record of records) {
    find(record.id);
    const email = normalizeDuplicateEmail(record.email);
    const phone = normalizeDuplicatePhone(record.phone);
    const nameCompany = normalizeDuplicateNameCompanyKey(record.full_name, record.company);
    if (email) byEmail.set(email, [...(byEmail.get(email) ?? []), record.id]);
    if (phone) byPhone.set(phone, [...(byPhone.get(phone) ?? []), record.id]);
    if (nameCompany) byNameCompany.set(nameCompany, [...(byNameCompany.get(nameCompany) ?? []), record.id]);
  }

  for (const bucket of [byEmail, byPhone, byNameCompany]) {
    for (const ids of bucket.values()) {
      for (let i = 1; i < ids.length; i += 1) union(ids[0], ids[i]);
    }
  }

  const componentIds = new Map<string, string[]>();
  for (const record of records) {
    const root = find(record.id);
    componentIds.set(root, [...(componentIds.get(root) ?? []), record.id]);
  }

  const byId = new Map(records.map((record) => [record.id, record]));
  const groups: DuplicateGroup<T>[] = [];

  for (const ids of componentIds.values()) {
    const uniqueIds = Array.from(new Set(ids));
    if (uniqueIds.length < 2) continue;

    const groupRecords = uniqueIds
      .map((id) => byId.get(id))
      .filter((record): record is T => Boolean(record))
      .sort((a, b) => a.id.localeCompare(b.id));

    const reasons = new Set<DuplicateMatchReason>();
    for (let i = 0; i < groupRecords.length; i += 1) {
      for (let j = i + 1; j < groupRecords.length; j += 1) {
        const a = groupRecords[i];
        const b = groupRecords[j];
        const emailA = normalizeDuplicateEmail(a.email);
        const emailB = normalizeDuplicateEmail(b.email);
        if (emailA && emailA === emailB) reasons.add("email");
        const phoneA = normalizeDuplicatePhone(a.phone);
        const phoneB = normalizeDuplicatePhone(b.phone);
        if (phoneA && phoneA === phoneB) reasons.add("phone");
        const nameCompanyA = normalizeDuplicateNameCompanyKey(a.full_name, a.company);
        const nameCompanyB = normalizeDuplicateNameCompanyKey(b.full_name, b.company);
        if (nameCompanyA && nameCompanyA === nameCompanyB) reasons.add("name_company");
      }
    }

    groups.push({
      key: groupRecords.map((record) => record.id).join("|"),
      reasons: Array.from(reasons),
      records: groupRecords,
    });
  }

  return groups.sort((a, b) => b.records.length - a.records.length);
}

/** Only owner/admin/manager may merge duplicate leads or contacts — the same
 * bar the codebase uses for other destructive, cross-cutting operations
 * (see `has_org_permission`'s 'manage_pipeline' bucket). Sales reps, sales,
 * and viewers cannot merge. */
export function canMergeDuplicateRecords(role: WorkspaceRole | null | undefined): boolean {
  return role === "owner" || role === "admin" || role === "manager";
}
