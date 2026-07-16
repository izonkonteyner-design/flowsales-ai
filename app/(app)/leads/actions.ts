"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  addLeadNoteRecord,
  changeLeadStatusRecord,
  createLeadRecord,
  createLeadTaskRecord,
  deleteLeadRecord,
  scheduleLeadFollowUpRecord,
  updateLeadRecord,
} from "@/server/services/leads";
import { convertLeadToCustomerRecord } from "@/server/services/lead-conversion";
import {
  leadFormSchema,
  leadFollowUpSchema,
  leadNoteSchema,
  leadStatusChangeSchema,
  leadTaskSchema,
} from "@/lib/validations/lead";

function safeRedirectTarget(value: FormDataEntryValue | null, fallback: string) {
  const target = typeof value === "string" && value.startsWith("/") ? value : fallback;
  return target;
}

function redirectWithToast(target: string, message: string, tone: "success" | "danger" | "warning" = "success") {
  const url = new URL(target, "http://localhost");
  url.searchParams.set("toast", message);
  url.searchParams.set("tone", tone);
  return `${url.pathname}${url.search}`;
}

function getActionErrorMessage(error: unknown, fallback: string) {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return fallback;
}

function formDataToLeadInput(formData: FormData) {
  const parsed = leadFormSchema.parse({
    full_name: formData.get("full_name"),
    company: formData.get("company"),
    email: formData.get("email"),
    phone: formData.get("phone"),
    city: formData.get("city"),
    source: formData.get("source"),
    status: formData.get("status"),
    estimated_value: formData.get("estimated_value"),
    currency: formData.get("currency"),
    notes: formData.get("notes"),
    assigned_to: formData.get("assigned_to"),
    next_follow_up_at: formData.get("next_follow_up_at"),
  });

  return {
    full_name: parsed.full_name,
    company: parsed.company,
    email: parsed.email ?? "",
    phone: parsed.phone,
    city: parsed.city,
    source: parsed.source,
    status: parsed.status,
    estimated_value: parsed.estimated_value,
    currency: parsed.currency,
    notes: parsed.notes,
    assigned_to: parsed.assigned_to,
    next_follow_up_at: parsed.next_follow_up_at ? `${parsed.next_follow_up_at}T00:00:00.000Z` : null,
  };
}

export async function convertLeadToCustomerAction(formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "").trim();
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), `/leads/${leadId}`);

  try {
    const result = await convertLeadToCustomerRecord(leadId);
    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath("/customers");
    revalidatePath(`/leads/${result.lead.id}`);
    revalidatePath(`/customers/${result.customer.id}`);

    const message =
      result.state === "existing"
        ? "Lead was already converted. Opened the linked customer."
        : result.state === "linked"
          ? "Lead matched an existing customer."
          : "Lead converted to customer.";

    redirect(redirectWithToast(`/customers/${result.customer.id}`, message));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to convert lead."), "danger"));
  }
}

export async function createLeadAction(formData: FormData) {
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
  try {
    const input = formDataToLeadInput(formData);
    const result = await createLeadRecord(input);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${result.lead.id}`);

    redirect(redirectWithToast(redirectTo, "Lead created successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to create lead."), "danger"));
  }
}

export async function updateLeadAction(formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), `/leads/${leadId}`);
  try {
    const input = formDataToLeadInput(formData);
    const result = await updateLeadRecord(leadId, input);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${result.lead.id}`);

    redirect(redirectWithToast(redirectTo, "Lead updated successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to update lead."), "danger"));
  }
}

export async function deleteLeadAction(formData: FormData) {
  const leadId = String(formData.get("lead_id") ?? "");
  const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
  try {
    await deleteLeadRecord(leadId);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${leadId}`);

    redirect(redirectWithToast(redirectTo, "Lead deleted successfully."));
  } catch (error) {
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to delete lead."), "danger"));
  }
}

export async function changeLeadStatusAction(formData: FormData) {
  try {
    const parsed = leadStatusChangeSchema.parse({
      lead_id: formData.get("lead_id"),
      status: formData.get("status"),
      redirect_to: formData.get("redirect_to"),
    });

    const result = await changeLeadStatusRecord(parsed.lead_id, parsed.status);
    const redirectTo = safeRedirectTarget(parsed.redirect_to ?? null, `/leads/${result.lead.id}`);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${result.lead.id}`);

    redirect(redirectWithToast(redirectTo, "Lead status updated."));
  } catch (error) {
    const fallback = "Unable to update lead status.";
    const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, fallback), "danger"));
  }
}

export async function addLeadNoteAction(formData: FormData) {
  try {
    const parsed = leadNoteSchema.parse({
      lead_id: formData.get("lead_id"),
      note: formData.get("note"),
      redirect_to: formData.get("redirect_to"),
    });

    const result = await addLeadNoteRecord(parsed.lead_id, parsed.note);
    const redirectTo = safeRedirectTarget(parsed.redirect_to ?? null, `/leads/${result.lead.id}`);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${result.lead.id}`);

    redirect(redirectWithToast(redirectTo, "Note added."));
  } catch (error) {
    const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to add note."), "danger"));
  }
}

export async function scheduleLeadFollowUpAction(formData: FormData) {
  try {
    const parsed = leadFollowUpSchema.parse({
      lead_id: formData.get("lead_id"),
      next_follow_up_at: formData.get("next_follow_up_at"),
      redirect_to: formData.get("redirect_to"),
    });

    const result = await scheduleLeadFollowUpRecord(parsed.lead_id, `${parsed.next_follow_up_at}T00:00:00.000Z`);
    const redirectTo = safeRedirectTarget(parsed.redirect_to ?? null, `/leads/${result.lead.id}`);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${result.lead.id}`);

    redirect(redirectWithToast(redirectTo, "Follow-up scheduled."));
  } catch (error) {
    const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to schedule follow-up."), "danger"));
  }
}

export async function createLeadTaskAction(formData: FormData) {
  try {
    const parsed = leadTaskSchema.parse({
      lead_id: formData.get("lead_id"),
      title: formData.get("title"),
      due_at: formData.get("due_at"),
      priority: formData.get("priority"),
      assigned_to: formData.get("assigned_to"),
      redirect_to: formData.get("redirect_to"),
    });

    const result = await createLeadTaskRecord({
      leadId: parsed.lead_id,
      title: parsed.title,
      dueAt: `${parsed.due_at}T00:00:00.000Z`,
      priority: parsed.priority,
      assignedTo: parsed.assigned_to,
    });
    const redirectTo = safeRedirectTarget(parsed.redirect_to ?? null, `/leads/${parsed.lead_id}`);

    revalidatePath("/dashboard");
    revalidatePath("/leads");
    revalidatePath(`/leads/${parsed.lead_id}`);
    revalidatePath("/tasks");

    redirect(redirectWithToast(redirectTo, `Task created: ${result.task.title}.`));
  } catch (error) {
    const redirectTo = safeRedirectTarget(formData.get("redirect_to"), "/leads");
    redirect(redirectWithToast(redirectTo, getActionErrorMessage(error, "Unable to create task."), "danger"));
  }
}
