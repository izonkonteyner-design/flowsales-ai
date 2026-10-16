import { NextRequest, NextResponse } from "next/server";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { commandSearchSchema, type CommandSearchResult } from "@/lib/command-palette";

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const parsed = commandSearchSchema.safeParse({
      q: searchParams.get("q"),
      limit: searchParams.get("limit"),
      types: searchParams.get("types")?.split(",") || undefined,
    });

    if (!parsed.success) {
      return NextResponse.json({ error: "Invalid search parameters" }, { status: 400 });
    }

    const { q, limit, types = ["leads", "contacts", "quotes", "tasks"] } = parsed.data;
    const context = await getWorkspaceContext();

    if (context.mode === "demo") {
      return NextResponse.json({ results: [] });
    }

    if (!hasSupabaseConfig()) {
      return NextResponse.json({ results: [] });
    }

    const client = await createSupabaseServerClient();
    if (!client) {
      return NextResponse.json({ results: [] });
    }

    const orgId = context.organization.id;
    const searchTerm = `%${q}%`;
    const results: CommandSearchResult[] = [];

    // Search leads
    if (types.includes("leads")) {
      const { data: leads } = await client
        .from("leads")
        .select("id, full_name, company, email, status, estimated_value, currency, assigned_to, created_at")
        .eq("organization_id", orgId)
        .or(`full_name.ilike.${searchTerm},company.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (leads) {
        results.push(...leads.map((lead) => ({
          id: lead.id,
          type: "lead" as const,
          title: lead.full_name,
          subtitle: `${lead.company || "No company"} • ${lead.status}`,
          href: `/leads/${lead.id}`,
          metadata: {
            email: lead.email || "",
            value: lead.estimated_value ? `${lead.currency} ${lead.estimated_value.toLocaleString()}` : "",
          },
        })));
      }
    }

    // Search contacts/customers
    if (types.includes("contacts")) {
      const { data: contacts } = await client
        .from("contacts")
        .select("id, full_name, company, email, phone, city, created_at")
        .eq("organization_id", orgId)
        .or(`full_name.ilike.${searchTerm},company.ilike.${searchTerm},email.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (contacts) {
        results.push(...contacts.map((contact) => ({
          id: contact.id,
          type: "contact" as const,
          title: contact.full_name,
          subtitle: `${contact.company || "No company"} • ${contact.city || "No city"}`,
          href: `/customers/${contact.id}`,
          metadata: {
            email: contact.email || "",
            phone: contact.phone || "",
          },
        })));
      }
    }

    // Search quotes
    if (types.includes("quotes")) {
      const { data: quotes } = await client
        .from("quotes")
        .select("id, quote_number, status, issue_date, currency, grand_total, total, lead_id, customer_id, created_at")
        .eq("organization_id", orgId)
        .or(`quote_number.ilike.${searchTerm}`)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (quotes) {
        results.push(...quotes.map((quote) => ({
          id: quote.id,
          type: "quote" as const,
          title: quote.quote_number,
          subtitle: `${quote.status} • ${quote.currency} ${(quote.grand_total ?? quote.total ?? 0).toLocaleString()}`,
          href: `/quotes/${quote.id}`,
          metadata: {
            status: quote.status,
            date: quote.issue_date ? new Date(quote.issue_date).toLocaleDateString() : "",
          },
        })));
      }
    }

    // Search tasks
    if (types.includes("tasks")) {
      const { data: tasks } = await client
        .from("tasks")
        .select("id, title, due_at, priority, status, lead_id, assigned_to, created_at")
        .eq("organization_id", orgId)
        .ilike("title", searchTerm)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (tasks) {
        results.push(...tasks.map((task) => ({
          id: task.id,
          type: "task" as const,
          title: task.title,
          subtitle: `${task.priority} priority • ${task.status} • Due: ${task.due_at ? new Date(task.due_at).toLocaleDateString() : "No due date"}`,
          href: task.lead_id ? `/leads/${task.lead_id}` : `/tasks`,
          metadata: {
            priority: task.priority,
            status: task.status,
          },
        })));
      }
    }

    // Sort by relevance (exact matches first, then by type priority)
    const typePriority = { lead: 0, contact: 1, quote: 2, task: 3 };
    results.sort((a, b) => {
      const aExact = a.title.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
      const bExact = b.title.toLowerCase().includes(q.toLowerCase()) ? 0 : 1;
      if (aExact !== bExact) return aExact - bExact;
      return typePriority[a.type] - typePriority[b.type];
    });

    return NextResponse.json({ results: results.slice(0, limit) });
  } catch (error) {
    console.error("[command-palette] Search error:", error);
    return NextResponse.json({ error: "Search failed" }, { status: 500 });
  }
}