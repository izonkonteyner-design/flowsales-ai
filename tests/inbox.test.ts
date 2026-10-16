import assert from "node:assert/strict";
import test from "node:test";

import { receiveMessage, listMessages, updateMessage, linkMessageToLead, getInboxStats } from "@/server/services/inbox";
import type { CustomerMessageInput, MessageStatus } from "@/types/inbox";

class MockQueryBuilder {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private rows: any[] = [];
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private filters: Array<{ column: string; value: any; op: string }> = [];
  private orderBy: { column: string; ascending: boolean } | null = null;
  private offsetVal = 0;
  private limitVal: number | null = null;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private pendingUpdate: any = {};

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  constructor(initialRows: any[] = []) {
    this.rows = [...initialRows];
  }

  from() { return this; }

  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  select(_columns: string, _opts?: { count?: string }): MockQueryBuilder {
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  insert(data: any): MockQueryBuilder {
    this.rows.push({ ...data, id: data.id || "mock_" + Date.now() + "_" + Math.random().toString(36).slice(2) });
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  update(data: any): MockQueryBuilder {
    this.pendingUpdate = data;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  eq(column: string, value: any): MockQueryBuilder {
    this.filters.push({ column, value, op: "eq" });
    return this;
  }

  ilike(column: string, pattern: string): MockQueryBuilder {
    this.filters.push({ column, value: pattern, op: "ilike" });
    return this;
  }

  order(column: string, opts?: { ascending?: boolean }): MockQueryBuilder {
    this.orderBy = { column, ascending: opts?.ascending ?? true };
    return this;
  }

  range(offset: number, limit: number): MockQueryBuilder {
    this.offsetVal = offset;
    this.limitVal = limit - offset + 1;
    return this;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async maybeSingle(): Promise<{ data: any; error: any }> {
    const filtered = this.applyFilters();
    if (filtered.length === 0) return { data: null, error: null };
    return { data: filtered[0], error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async single(): Promise<{ data: any; error: any }> {
    const filtered = this.applyFilters();
    if (filtered.length === 0) return { data: null, error: { message: "not found" } };
    const row = { ...filtered[0] };
    if (this.pendingUpdate && Object.keys(this.pendingUpdate).length > 0) {
      Object.assign(row, this.pendingUpdate);
      this.pendingUpdate = {};
    }
    return { data: row, error: null };
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private applyFilters(): any[] {
    let result = [...this.rows];
    for (const f of this.filters) {
      if (f.op === "eq") {
        result = result.filter((r) => r[f.column] === f.value);
      } else if (f.op === "ilike") {
        const pattern = f.value.replace(/%/g, "").toLowerCase();
        result = result.filter((r) =>
          String(r[f.column] ?? "").toLowerCase().includes(pattern),
        );
      }
    }
    if (this.orderBy) {
      const orderBy = this.orderBy;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
      result.sort((a: any, b: any) => {
        const av = a[orderBy!.column];
        const bv = b[orderBy!.column];
        if (av < bv) return orderBy!.ascending ? -1 : 1;

test("inbox receiveMessage creates a new message", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  const result = await receiveMessage(input, client);

    if (!result.ok) throw new Error("receiveMessage failed");
  assert.equal(result.message.sender_name, "Test Musteri");
  assert.equal(result.message.channel, "whatsapp");
  assert.equal(result.message.direction, "inbound");
  assert.equal(result.message.status, "new");
  assert.equal(result.message.content, "Merhaba, konteyner fiyatÄ± Ã¶ÄŸrenmek istiyorum.");
  assert.equal(result.message.lead_id, null);
});

test("inbox receiveMessage rejects duplicate idempotency key", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  const first = await receiveMessage(input, client);
    if (!first.ok) throw new Error("first receiveMessage failed");

  const second = await receiveMessage(input, client);
    if (!second.ok) throw new Error("second receiveMessage failed");
  assert.equal(second.duplicate, true);
  assert.equal(second.message.id, first.message.id);
});

test("inbox listMessages returns messages", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  await receiveMessage(input, client);

  const result = await listMessages({}, client);
    if (!result.ok) throw new Error("listMessages failed");
  assert.ok(result.total >= 1);
  assert.ok(result.data.length >= 1);
  assert.ok(result.data.some((m) => m.sender_name === "Test Musteri"));
});

test("inbox listMessages filters by channel", async () => {
  const client = new MockSupabaseClient();
  const emailInput = makeInput({ channel: "email", idempotency_key: "idem_email_test_123" });
  await receiveMessage(emailInput, client);

  const result = await listMessages({ channel: "email" }, client);
    if (!result.ok) throw new Error("listMessages failed");
  assert.ok(result.data.every((m) => m.channel === "email"));
});

test("inbox listMessages filters by status", async () => {
  const client = new MockSupabaseClient();
  await receiveMessage(makeInput(), client);

  const result = await listMessages({ status: "new" }, client);
    if (!result.ok) throw new Error("listMessages failed");
  assert.ok(result.data.every((m) => m.status === "new"));
});

test("inbox updateMessage changes status to read", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  const received = await receiveMessage(input, client);
    if (!received.ok) throw new Error("receiveMessage failed");

  const updated = await updateMessage(received.message.id, { status: "read" }, client);
    if (!updated.ok) throw new Error("updateMessage failed");
  assert.equal(updated.message.status, "read");
});

test("inbox updateMessage assigns to team member", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  const received = await receiveMessage(input, client);
    if (!received.ok) throw new Error("receiveMessage failed");

  const updated = await updateMessage(received.message.id, { assigned_to: "user_123" }, client);
    if (!updated.ok) throw new Error("updateMessage failed");
  assert.equal(updated.message.assigned_to, "user_123");
});

test("inbox linkMessageToLead links message to lead", async () => {
  const client = new MockSupabaseClient();
  const input = makeInput();
  const received = await receiveMessage(input, client);
    if (!received.ok) throw new Error("receiveMessage failed");
  assert.equal(received.message.lead_id, null);

  const linked = await linkMessageToLead(received.message.id, "lead_001", 0.95, client);
    if (!linked.ok) throw new Error("linkMessageToLead failed");
  assert.equal(linked.message.lead_id, "lead_001");
  assert.equal(linked.message.lead_match_confidence, 0.95);
});

test("inbox getInboxStats returns stats", async () => {
  const client = new MockSupabaseClient();
  await receiveMessage(makeInput({ channel: "whatsapp" }), client);
  await receiveMessage(makeInput({ channel: "email", idempotency_key: "idem_email_stats" }), client);

  const result = await getInboxStats(client);
    if (!result.ok) throw new Error("getInboxStats failed");
  assert.ok(result.stats.totalMessages >= 2);
  assert.ok(Array.isArray(result.stats.byChannel));
  assert.ok(Array.isArray(result.stats.byStatus));
});

test("inbox message status values are valid", async () => {
  const validStatuses: MessageStatus[] = ["new", "read", "replied", "closed", "failed"];
  assert.ok(validStatuses.includes("new"));
  assert.ok(validStatuses.includes("read"));
  assert.ok(validStatuses.includes("replied"));
  assert.ok(validStatuses.includes("closed"));
  assert.ok(validStatuses.includes("failed"));
});
        if (av > bv) return orderBy!.ascending ? 1 : -1;
        return 0;
      });
    }
    if (this.offsetVal > 0) result = result.slice(this.offsetVal);
    if (this.limitVal !== null) result = result.slice(0, this.limitVal);
    return result;
  }
}

class MockSupabaseClient {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  private tables: Map<string, any[]> = new Map();

  from(table: string): MockQueryBuilder {
    if (!this.tables.has(table)) this.tables.set(table, []);
    return new MockQueryBuilder(this.tables.get(table)!);
  }
}

function makeInput(overrides: Partial<CustomerMessageInput> = {}): CustomerMessageInput {
  return {
    channel: "whatsapp",
    direction: "inbound",
    channel_message_id: "msg_" + Date.now() + "_" + Math.random().toString(36).slice(2),
    channel_conversation_id: "conv_" + Math.random().toString(36).slice(2),
    idempotency_key: "idem_" + Math.random().toString(36).slice(2),
    sender_name: "Test Musteri",
    sender_phone: "+90 532 000 0000",
    content: "Merhaba, konteyner fiyatÄ± Ã¶ÄŸrenmek istiyorum.",
    media_urls: [],
    ...overrides,
  };
}

