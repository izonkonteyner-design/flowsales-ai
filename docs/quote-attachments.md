# Quote attachments

Quote attachments are represented by `public.quote_attachments` and must use a Storage object path scoped to the organization and quote:

`organizations/{organization_id}/quotes/{quote_id}/attachments/{uuid}-{safe-file-name}`

Allowed attachment kinds:
- image
- document
- catalog
- technical
- other

The database enforces a maximum metadata-referenced file size of 10 MiB. Upload handlers must validate MIME type, extension, authenticated organization membership, quote ownership/scope, and the same 10 MiB limit before writing the Storage object.

The metadata table uses organization-scoped RLS. Internal user UUIDs remain audit data and are not rendered in customer-facing quote documents.

The Storage bucket/policies must be provisioned in the deployment environment before enabling the upload UI. Do not expose the bucket publicly; customer-facing access should use authenticated/signed URLs appropriate to the quote-sharing flow.
