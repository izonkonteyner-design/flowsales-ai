export function isCustomerOptedOut(tags?: string[] | null, notes?: string | null): boolean {
  if (Array.isArray(tags)) {
    const hasOptOutTag = tags.some((t) => /opt[-_]?out|iptal|stop|do[-_]?not[-_]?contact/i.test(t));
    if (hasOptOutTag) return true;
  }
  if (notes && /iletişim\s+istemiyor|opt[-_]?out|do\s+not\s+contact/i.test(notes)) {
    return true;
  }
  return false;
}
