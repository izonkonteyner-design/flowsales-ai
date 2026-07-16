import { z } from "zod";

const optionalText = z.string().trim().max(200).optional().default("");
const normalizeArrayInput = (value: unknown) => (Array.isArray(value) ? value : []);
const urlField = z.preprocess(
  (value) => {
    if (typeof value !== "string") {
      return "";
    }

    return value.trim();
  },
  z
    .string()
    .trim()
    .url("Enter a valid image URL.")
    .or(z.literal(""))
    .transform((value) => (value === "" ? "" : value)),
);

export const productSpecificationSchema = z.object({
  key: z.string().trim().min(1, "Specification key is required.").max(80, "Specification key is too long."),
  value: z.string().trim().min(1, "Specification value is required.").max(160, "Specification value is too long."),
});

function normalizeSpecificationInputs(value: unknown) {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") {
        return { key: "", value: "" };
      }

      const candidate = entry as { key?: unknown; value?: unknown };
      return {
        key: typeof candidate.key === "string" ? candidate.key.trim() : "",
        value: typeof candidate.value === "string" ? candidate.value.trim() : "",
      };
    })
    .filter((entry) => entry.key || entry.value);
}

function normalizeList(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeImages(values: string[]) {
  return Array.from(
    new Set(
      values
        .map((entry) => entry.trim())
        .filter(Boolean),
    ),
  );
}

function normalizeSpecifications(values: Array<{ key: string; value: string }>) {
  const seen = new Set<string>();
  return values.map((item) => {
    const key = item.key.trim();
    const normalizedKey = key.toLowerCase();
    if (seen.has(normalizedKey)) {
      throw new Error("Specification keys must be unique.");
    }
    seen.add(normalizedKey);
    return {
      key,
      value: item.value.trim(),
    };
  });
}

export const productFormSchema = z.object({
  sku: z.string().trim().min(2, "SKU is required."),
  name: z.string().trim().min(2),
  category: z.string().trim().min(2),
  description: z.string().trim().min(10),
  short_description: optionalText,
  brand: optionalText,
  model: optionalText,
  unit_price: z.coerce.number().nonnegative("Unit price cannot be negative."),
  currency: z.string().trim().length(3),
  tax_rate: z.coerce.number().min(0).max(100),
  unit: z.string().trim().min(1),
  width: z.coerce.number().min(0).default(0),
  length: z.coerce.number().min(0).default(0),
  height: z.coerce.number().min(0).default(0),
  area_m2: z.coerce.number().min(0).default(0),
  weight_kg: z.coerce.number().min(0).default(0),
  material: optionalText,
  color: optionalText,
  stock_quantity: z.coerce.number().int().min(0).default(0),
  minimum_order_quantity: z.coerce.number().int().min(1).default(1),
  lead_time_days: z.coerce.number().int().min(0).default(0),
  warranty_months: z.coerce.number().int().min(0).default(0),
  internal_code: optionalText,
  barcode: optionalText,
  tags: z.preprocess(normalizeArrayInput, z.array(z.string().trim().min(1, "Tag cannot be empty.")).default([]).transform(normalizeList)),
  features: z.preprocess(normalizeArrayInput, z.array(z.string().trim().min(1, "Feature cannot be empty.")).default([]).transform(normalizeList)),
  specifications: z.preprocess(normalizeSpecificationInputs, z.array(productSpecificationSchema).default([]).transform(normalizeSpecifications)),
  image_url: urlField,
  gallery_urls: z.array(urlField).default([]).transform(normalizeImages),
  featured: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(false),
  active: z.preprocess((value) => value === "true" || value === true, z.boolean()).default(true),
  notes: z.string().trim().max(1000, "Notes are too long.").optional().default(""),
});

export const productSearchSchema = z.object({
  query: z.string().trim().optional().default(""),
  active: z.enum(["all", "active", "inactive"]).optional().default("all"),
  sort: z.enum(["name", "price", "newest"]).optional().default("name"),
});
