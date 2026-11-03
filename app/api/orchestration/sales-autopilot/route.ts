import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/server-admin";
import { getWorkspaceContext } from "@/server/services/workspace-context";
import { SalesAutopilotService, type AutopilotLeadInput } from "@/server/services/orchestration/sales-autopilot";
import { demoProducts } from "@/server/services/crm-data";
import { trustedProductSchema, type TrustedProduct } from "@/server/services/sales-tools/product-catalog-domain";

export const dynamic = "force-dynamic";

function getCatalogForWorkspace(workspaceId: string, rows: Record<string, unknown>[]): TrustedProduct[] {
  if (rows.length > 0) {
    return rows.map((r) =>
      trustedProductSchema.parse({
        id: r.id,
        workspaceId: r.organization_id || workspaceId,
        sku: r.sku ?? null,
        name: r.name,
        category: r.category ?? null,
        description: r.description ?? null,
        model: r.model ?? null,
        areaM2: r.area_m2 ? Number(r.area_m2) : null,
        unitPrice: r.unit_price ? Number(r.unit_price) : null,
        basePrice: r.base_price ? Number(r.base_price) : null,
        currency: r.currency ?? "TRY",
        features: Array.isArray(r.features) ? r.features : [],
        specifications: Array.isArray(r.specifications) ? r.specifications : [],
        active: r.active === true,
        updatedAt: (r.updated_at as string) || new Date().toISOString(),
      })
    );
  }

  // Demo / Fallback katalogu
  return demoProducts.map((p) =>
    trustedProductSchema.parse({
      id: p.id,
      workspaceId,
      sku: p.sku ?? null,
      name: p.name,
      category: p.category ?? "Konteyner",
      description: p.description ?? null,
      model: p.name,
      areaM2: 21,
      unitPrice: p.unit_price ?? p.base_price ?? 75000,
      basePrice: p.base_price ?? 75000,
      currency: "TRY",
      features: p.features || [],
      specifications: [],
      active: p.active === true,
      updatedAt: new Date().toISOString(),
    })
  );
}

export async function GET() {
  try {
    const context = await getWorkspaceContext();
    if (!context || !context.userId || !context.organization?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const orgId = context.organization.id;
    const admin = createSupabaseAdminClient();

    // 1. Son Müşteri Adayları (Leads)
    const { data: leads } = await admin
      .from("leads")
      .select("id, full_name, company, phone, email, status, city, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10);

    // 2. Hazırlanan Teklif Taslakları (Quotes)
    const { data: quotes } = await admin
      .from("quotes")
      .select("id, lead_id, total_amount, currency, status, created_at, metadata")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(10);

    // 3. Bekleyen Takip Görevleri (Tasks)
    const { data: tasks } = await admin
      .from("tasks")
      .select("id, lead_id, title, due_at, priority, status, created_at")
      .eq("organization_id", orgId)
      .order("due_at", { ascending: true })
      .limit(10);

    // 4. Maestro Plan ve Görev Metrikleri
    const { data: plans } = await admin
      .from("orchestration_plans")
      .select("id, status, plan_summary, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false })
      .limit(5);

    return NextResponse.json({
      success: true,
      data: {
        organizationId: orgId,
        mode: context.mode,
        role: context.role,
        recentLeads: leads || [],
        recentQuotes: quotes || [],
        pendingTasks: tasks || [],
        recentPlans: plans || [],
      },
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Failed to load autopilot overview";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    const context = await getWorkspaceContext();
    if (!context || !context.userId || !context.organization?.id) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    if (context.role === "viewer") {
      return NextResponse.json(
        { error: "Viewer rolündeki kullanıcılar satış otopilotu çalıştıramaz." },
        { status: 403 }
      );
    }

    const orgId = context.organization.id;
    const body = await request.json();

    const leadInput: AutopilotLeadInput = {
      fullName: String(body.fullName || "").trim(),
      company: body.company ? String(body.company).trim() : undefined,
      phone: body.phone ? String(body.phone).trim() : undefined,
      email: body.email ? String(body.email).trim() : undefined,
      city: body.city ? String(body.city).trim() : "İzmir",
      source: body.source ? String(body.source).trim() : "ai_sales_autopilot",
      inboundMessage: body.inboundMessage ? String(body.inboundMessage).trim() : undefined,
      budgetTRY: body.budgetTRY ? Number(body.budgetTRY) : undefined,
      requestedM2: body.requestedM2 ? Number(body.requestedM2) : undefined,
      roomCount: body.roomCount ? String(body.roomCount).trim() : undefined,
      containerType: body.containerType || "ofis",
      segment: body.segment || "Gold",
      urgency: body.urgency || "normal",
    };

    if (!leadInput.fullName) {
      return NextResponse.json(
        { error: "Müşteri adı soyadı zorunludur." },
        { status: 400 }
      );
    }

    const admin = createSupabaseAdminClient();
    const { data: rawProducts } = await admin
      .from("products")
      .select("*")
      .eq("organization_id", orgId)
      .eq("active", true)
      .limit(50);

    const catalog = getCatalogForWorkspace(orgId, (rawProducts as Record<string, unknown>[]) || []);

    const service = new SalesAutopilotService(admin);
    const report = await service.executeFullSalesAutopilot({
      organizationId: orgId,
      userId: context.userId,
      input: leadInput,
      catalog,
      customQuantity: body.quantity ? Number(body.quantity) : 1,
      customDiscountPercent: body.discountPercent ? Number(body.discountPercent) : 0,
      shippingTRY:
        body.shippingTRY !== undefined && body.shippingTRY !== null && body.shippingTRY !== ""
          ? Number(body.shippingTRY)
          : undefined,
      assemblyTRY:
        body.assemblyTRY !== undefined && body.assemblyTRY !== null && body.assemblyTRY !== ""
          ? Number(body.assemblyTRY)
          : undefined,
      userRole: context.role,
    });

    return NextResponse.json({
      success: true,
      report,
    });
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : "Sales autopilot execution failed";
    return NextResponse.json({ success: false, error: errorMessage }, { status: 500 });
  }
}
