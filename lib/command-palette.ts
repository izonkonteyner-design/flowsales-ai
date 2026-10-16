import { z } from "zod";

export const commandSearchSchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(10),
  types: z.array(z.enum(["leads", "contacts", "quotes", "tasks"])).optional(),
});

export type CommandSearchParams = z.infer<typeof commandSearchSchema>;

export interface CommandSearchResult {
  id: string;
  type: "lead" | "contact" | "quote" | "task";
  title: string;
  subtitle: string;
  href: string;
  metadata?: Record<string, string>;
}

export interface CommandAction {
  id: string;
  label: string;
  description: string;
  icon: string;
  href?: string;
  action?: () => void;
}