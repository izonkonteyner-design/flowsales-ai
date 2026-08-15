# Professional Quote Builder Specification

Issue: #105

## Customer-facing quote must not expose

- Internal creation source metadata
- Raw created/updated timestamps when they are implementation metadata rather than quote dates
- `created_by` UUIDs
- Organization/user/internal IDs

Internal audit fields remain stored and available to authorized staff/admin views.

## Quote branding

The quote editor should support:

- Company logo
- Company name
- Phone
- Email
- Website
- Address
- Tax information
- Brand/accent color

Branding should render consistently in the quote preview and generated PDF.

## Quote attachments

Support attaching quote-related assets such as:

- Product images
- PDFs
- Technical specifications
- Catalogs
- Other supporting documents

Attachments should remain associated with the quote and be available in the customer-facing/share/PDF flow where the format supports them.

## Display model

Use human-readable values in customer-facing output. Internal UUIDs and implementation metadata must never be rendered as customer-facing labels.

## Acceptance criteria

1. Existing quotes render without technical metadata.
2. `created_by` UUID is not visible in customer-facing quote output.
3. Company logo and branding can be configured and rendered.
4. Quote attachments can be added and associated with a quote.
5. PDF output preserves the supported branding and attachment references.
6. Internal audit data remains available to authorized internal users.
7. Regression tests cover metadata suppression and branding/attachment rendering.
