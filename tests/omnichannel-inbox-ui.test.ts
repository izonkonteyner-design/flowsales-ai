import { describe, it } from "node:test";
import assert from "node:assert/strict";
import * as fs from "node:fs";
import * as path from "node:path";
import { maskPhoneNumber } from "../lib/utils/phone-mask";

const WORKTREE = process.cwd();

describe("Omnichannel Inbox UI & Security Tests", () => {
  it("phone masking helper masks international and local phone numbers correctly", () => {
    assert.equal(maskPhoneNumber("+905321234567"), "+90 532 *** ** 67");
    assert.equal(maskPhoneNumber("5321234567"), "+90 532 *** ** 67");
    assert.equal(maskPhoneNumber("+14155552671"), "+1 415 *** ** 71");
    assert.equal(maskPhoneNumber("123"), "***");
    assert.equal(maskPhoneNumber(""), "");
    assert.equal(maskPhoneNumber(null), "");
  });

  it("omnichannel-inbox repository implements fail-closed organization isolation and demo exclusion", () => {
    const repoPath = path.join(WORKTREE, "server/repositories/supabase/omnichannel-inbox.ts");
    const code = fs.readFileSync(repoPath, "utf-8");

    assert.ok(code.includes("eq(\"organization_id\", organizationId)"), "Must filter all queries by organization_id");
    assert.ok(code.includes("DEMO_ORGANIZATION_ID"), "Must check demo organization exclusion");
    assert.ok(code.includes("maskPhoneNumber"), "Must apply phone masking to contact numbers");
    assert.ok(code.includes("userRole === \"viewer\""), "Must block viewer role from status/assignee mutations");
    assert.ok(code.includes("order(\"sent_at\", { ascending: true })"), "Must order messages deterministically by sent_at asc");
  });

  it("omnichannel-inbox service enforces workspace context and role authorization", () => {
    const servicePath = path.join(WORKTREE, "server/services/omnichannel-inbox.ts");
    const code = fs.readFileSync(servicePath, "utf-8");

    assert.ok(code.includes("loadWorkspaceContext()"), "Must resolve workspace context");
    assert.ok(code.includes("resolveContext()"), "Must resolve context before operations");
    assert.ok(code.includes("markAsRead"), "Must mark conversation as read when detail is fetched");
  });

  it("inbox UI components implement masked phone, filter tabs, media placeholders, and disconnected state", () => {
    const shellPath = path.join(WORKTREE, "components/inbox/inbox-shell.tsx");
    const listPath = path.join(WORKTREE, "components/inbox/conversation-list.tsx");
    const itemPath = path.join(WORKTREE, "components/inbox/conversation-item.tsx");
    const viewPath = path.join(WORKTREE, "components/inbox/conversation-view.tsx");
    const timelinePath = path.join(WORKTREE, "components/inbox/message-timeline.tsx");

    const shellCode = fs.readFileSync(shellPath, "utf-8");
    const listCode = fs.readFileSync(listPath, "utf-8");
    const itemCode = fs.readFileSync(itemPath, "utf-8");
    const viewCode = fs.readFileSync(viewPath, "utf-8");
    const timelineCode = fs.readFileSync(timelinePath, "utf-8");

    assert.ok(shellCode.includes("fetchInboxDataAction"), "Shell must call fetchInboxDataAction");
    assert.ok(listCode.includes("Search contact, snippet, ID..."), "List must contain search input");
    assert.ok(itemCode.includes("contactMaskedPhone"), "Item must render contactMaskedPhone");
    assert.ok(viewCode.includes("isDisconnected"), "View must render disconnected channel banner");
    assert.ok(viewCode.includes("isReadOnly"), "View must enforce read-only composer for viewers and demo");
    assert.ok(timelineCode.includes("Unsupported message type"), "Timeline must render unsupported message type placeholder");
  });

  it("inbox page routes /inbox and /inbox/[conversationId] exist and export metadata", () => {
    const pagePath = path.join(WORKTREE, "app/(app)/inbox/page.tsx");
    const detailPagePath = path.join(WORKTREE, "app/(app)/inbox/[conversationId]/page.tsx");

    assert.ok(fs.existsSync(pagePath), "/inbox/page.tsx must exist");
    assert.ok(fs.existsSync(detailPagePath), "/inbox/[conversationId]/page.tsx must exist");

    const pageCode = fs.readFileSync(pagePath, "utf-8");
    const detailCode = fs.readFileSync(detailPagePath, "utf-8");

    assert.ok(pageCode.includes("Omnichannel Inbox | FlowSales AI"), "Page route must define metadata title");
    assert.ok(detailCode.includes("initialConversationId={conversationId}"), "Detail page must pass conversationId to InboxShell");
  });

  it("navigation includes Inbox link with inbox icon", () => {
    const navPath = path.join(WORKTREE, "lib/constants/index.ts");
    const shellPath = path.join(WORKTREE, "components/layout/app-shell.tsx");

    const navCode = fs.readFileSync(navPath, "utf-8");
    const shellCode = fs.readFileSync(shellPath, "utf-8");

    assert.ok(navCode.includes("label: \"Inbox\", href: \"/inbox\""), "Navigation must include Inbox link");
    assert.ok(shellCode.includes("/inbox"), "App shell must match /inbox route");
  });
});
