export function maskPhoneNumber(phone?: string | null): string {
  if (!phone) return "";
  const cleaned = phone.trim();
  if (cleaned.length < 5) return "***";

  const digits = cleaned.replace(/\D/g, "");
  if (digits.length >= 10) {
    const country = digits.length > 10 ? `+${digits.slice(0, digits.length - 10)} ` : "+90 ";
    const area = digits.slice(digits.length - 10, digits.length - 7);
    const last = digits.slice(digits.length - 2);
    return `${country}${area} *** ** ${last}`;
  }

  return `${cleaned.slice(0, 3)}***${cleaned.slice(-2)}`;
}
