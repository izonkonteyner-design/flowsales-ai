/** No implicit exchange conversion: legacy empty currencies are TRY. */
export function amountForCurrency(value: unknown, sourceCurrency: string | null | undefined, targetCurrency = "TRY") {
  const amount = Number(value);
  return (sourceCurrency || "TRY").toUpperCase() === targetCurrency.toUpperCase() && Number.isFinite(amount) ? amount : 0;
}
