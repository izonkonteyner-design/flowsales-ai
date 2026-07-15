import { supabase } from "./client";

export type Lead = {
  id: string;
  name: string;
  company: string | null;
  source: string | null;
  status: string | null;
  value: string | null;
  created_at: string;
};

export async function getLeads() {
  const { data, error } = await supabase
    .from("leads")
    .select("*")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(error.message);
  }

  return data as Lead[];
}
