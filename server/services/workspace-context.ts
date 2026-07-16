import { createSupabaseServerClient } from "@/lib/supabase/server";
import { hasSupabaseConfig } from "@/lib/supabase/env";
import { demoOrganization } from "@/server/services/crm-data";
import { demoTeam } from "@/server/services/workspace-data";
import type { Organization } from "@/types/crm";

export type WorkspaceRole = Organization["role"];

export type WorkspaceMemberOption = {
  user_id: string;
  full_name: string;
  role: WorkspaceRole;
};

export type WorkspaceContext = {
  mode: "demo" | "live";
  organization: Organization;
  role: WorkspaceRole;
  userId: string | null;
  members: WorkspaceMemberOption[];
};

function createDemoMembers(): WorkspaceMemberOption[] {
  return demoTeam.map((member) => ({
    user_id: member.id,
    full_name: member.name,
    role: member.role,
  }));
}

export function createDemoWorkspaceContext(): WorkspaceContext {
  return {
    mode: "demo",
    organization: demoOrganization,
    role: demoOrganization.role,
    userId: null,
    members: createDemoMembers(),
  };
}

export async function loadWorkspaceContext(): Promise<WorkspaceContext | null> {
  if (!hasSupabaseConfig()) {
    return null;
  }

  const client = await createSupabaseServerClient();
  if (!client) {
    return null;
  }

  const {
    data: { user },
  } = await client.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership, error: membershipError } = await client
    .from("organization_members")
    .select("organization_id, role")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (membershipError || !membership) {
    return null;
  }

  const { data: organization, error: orgError } = await client
    .from("organizations")
    .select("id, name, slug, currency")
    .eq("id", membership.organization_id)
    .maybeSingle();

  if (orgError || !organization) {
    return null;
  }

  let members: WorkspaceMemberOption[] = [];
  try {
    const { data } = await client.rpc("get_org_member_options", {
      target_org: organization.id,
    });

    members = (data ?? []).map((member: { user_id: string; full_name: string; role: WorkspaceRole }) => ({
      user_id: member.user_id,
      full_name: member.full_name,
      role: member.role,
    }));
  } catch {
    members = [];
  }

  return {
    mode: "live",
    organization: organization as Organization,
    role: membership.role as WorkspaceRole,
    userId: user.id,
    members,
  };
}

export async function getWorkspaceContext() {
  return (await loadWorkspaceContext()) ?? createDemoWorkspaceContext();
}
