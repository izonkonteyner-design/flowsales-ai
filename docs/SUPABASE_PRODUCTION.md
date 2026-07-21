# Supabase Production Checklist

Before launching FlowSales AI in production, ensure your Supabase project is fully configured and secure.

## 1. Migrations

- Run all migrations located in `supabase/migrations/` sequentially using the Supabase SQL Editor.
- Alternatively, use the Supabase CLI: `supabase db push`.
- Ensure `0017_demo_mode.sql` is run if you want the "Try Demo" functionality to be available.

## 2. Authentication Settings

Navigate to **Authentication > Configuration** in your Supabase dashboard:

- **Site URL**: Set to your production URL (e.g., `https://flowsales.ai`).
- **Redirect URLs**: Add your production domain as an allowed redirect URL.
- **Email Confirmations**: Ensure email confirmations are enabled for new signups.
- **Secure Passwords**: Enforce strong passwords (minimum 8 characters).

## 3. Email Templates

Navigate to **Authentication > Email Templates**:

- Customize the **Confirmation**, **Magic Link**, and **Reset Password** templates.
- Update the generic Supabase URLs and branding to match FlowSales AI.
- Ensure links use `{{ .ConfirmationURL }}` appropriately.

## 4. SMTP Setup (Important)

Supabase has a strict limit on the number of emails you can send using their built-in SMTP server.

- Navigate to **Project Settings > Email**.
- Configure a custom SMTP provider (e.g., Resend, SendGrid, AWS SES) for production reliability.

## 5. Security & Network

- **Row Level Security (RLS)**: Verify that RLS is enabled for all tables. Migrations handle this, but it's good to double-check in the dashboard under **Database > Tables**.
- **Network Restrictions**: Consider restricting database connections to only known Vercel IPs or allowing connection pooling via Supavisor.
- **API Keys**: Only the `anon` key should be exposed to the client. Keep the `service_role` key highly secure and do not commit it to your source code.

## 6. Storage (If applicable)

- If utilizing Supabase Storage for product images or avatars, ensure the buckets are created and their RLS policies are applied correctly (handled in migrations).
- Check **Storage > Buckets** to verify.

## 7. Backups

- Navigate to **Database > Backups**.
- Ensure PITR (Point-In-Time Recovery) or daily backups are enabled on your Supabase pricing plan to prevent data loss.
