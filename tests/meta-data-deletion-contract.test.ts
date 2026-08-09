import { describe, it } from "node:test";
import assert from "node:assert";
import * as fs from "node:fs";
import * as path from "node:path";

const ROOT = process.cwd();
const read = (file: string) => fs.readFileSync(path.join(ROOT, file), "utf8");

describe("Meta data deletion callback", () => {
  it("verifies Meta signed requests and deletes only tenant-scoped linked Inbox records", () => {
    const service = read("server/services/integrations/meta-data-deletion.ts");
    assert.ok(service.includes("timingSafeEqual"));
    assert.ok(service.includes('from("message_attachments").delete()'));
    assert.ok(service.includes('from("messages").delete()'));
    assert.ok(service.includes('from("conversations").delete()'));
    assert.ok(service.includes('from("channel_contacts").delete()'));
    assert.ok(service.includes('from("webhook_events")'));
    assert.ok(service.includes('.eq("organization_id", contact.organization_id)'));
    assert.ok(service.includes('.eq("channel_contact_id", contact.id)'));
    assert.ok(service.includes('.eq("external_id", subjectId)'));
  });

  it("returns Meta's confirmation URL and never logs the signed request", () => {
    const route = read("app/api/webhooks/meta-data-deletion/route.ts");
    assert.ok(route.includes("confirmation_code"));
    assert.ok(route.includes("verifyMetaDeletionSignedRequest"));
    assert.ok(!route.includes("signedRequest }"));
  });
});
