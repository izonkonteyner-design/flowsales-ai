-- Demo seed data for local development
insert into public.organizations (id, name, slug, currency)
values
  ('00000000-0000-0000-0000-000000000001', 'FlowSales Demo Workspace', 'flowsales-demo', 'TRY')
on conflict (id) do update
set name = excluded.name,
    slug = excluded.slug,
    currency = excluded.currency;

insert into public.ai_agent_settings (organization_id, system_prompt, temperature, enable_streaming, require_human_approval, usage_limit)
values
  ('00000000-0000-0000-0000-000000000001', 'Be accurate. Never invent product prices. Ask for missing information before drafting quotes.', 0.30, true, true, 500)
on conflict (organization_id) do nothing;

insert into public.subscriptions (organization_id, plan, status, seat_limit, ai_message_limit)
values
  ('00000000-0000-0000-0000-000000000001', 'starter', 'active', 3, 100)
on conflict (organization_id) do nothing;

insert into public.profiles (id, full_name, timezone, language)
values
  ('11111111-1111-1111-1111-111111111111', 'Selin Kaya', 'Europe/Istanbul', 'en'),
  ('22222222-2222-2222-2222-222222222222', 'Mert Arslan', 'Europe/Istanbul', 'en')
on conflict (id) do nothing;

insert into public.organization_members (organization_id, user_id, role)
values
  ('00000000-0000-0000-0000-000000000001', '11111111-1111-1111-1111-111111111111', 'owner'),
  ('00000000-0000-0000-0000-000000000001', '22222222-2222-2222-2222-222222222222', 'sales')
on conflict (organization_id, user_id) do nothing;

insert into public.products (organization_id, name, category, description, base_price, currency, tax_rate, unit, active, specifications, created_by)
values
  ('00000000-0000-0000-0000-000000000001', 'Container Office', 'Container', 'Insulated modular office unit for field operations.', 420000, 'TRY', 20, 'unit', true, '["Steel frame","Thermal insulation","Plug-and-play electrical pack"]'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', 'Tiny House', 'Residential', 'Compact premium home with a modern living layout.', 1350000, 'TRY', 20, 'unit', true, '["Open plan","Kitchen module","Solar-ready roof"]'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', 'Site Cabin', 'Construction', 'Durable cabin for site management and security teams.', 265000, 'TRY', 20, 'unit', true, '["Portable","Weather resistant","Optional restroom package"]'::jsonb, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', 'Prefabricated Office', 'Commercial', 'Scalable prefabricated workspace for teams and showrooms.', 980000, 'TRY', 20, 'unit', false, '["Premium facade","HVAC ready","Custom branding panel"]'::jsonb, '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.leads (organization_id, full_name, company, email, phone, city, source, status, estimated_value, currency, notes, assigned_to, next_follow_up_at, created_by)
values
  ('00000000-0000-0000-0000-000000000001', 'Ahmet Yilmaz', 'Yilmaz Yapi', 'ahmet@yilmazyapi.com', '+90 532 000 0001', 'Istanbul', 'Website', 'qualified', 1850000, 'TRY', 'Interested in 56m² container office and installation in Q3.', '11111111-1111-1111-1111-111111111111', '2026-07-18 10:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', 'Mehmet Demir', 'Demir Solar', 'mehmet@demirsolar.com', '+90 530 111 2200', 'Izmir', 'WhatsApp', 'quote_sent', 920000, 'TRY', 'Requested quote with energy-efficient prefab package.', '22222222-2222-2222-2222-222222222222', '2026-07-16 14:30:00+00', '22222222-2222-2222-2222-222222222222'),
  ('00000000-0000-0000-0000-000000000001', 'Ece Aydin', 'Aydin Group', 'ece@aydingroup.com', '+90 533 222 3000', 'Ankara', 'Referral', 'negotiation', 2450000, 'TRY', 'Large office campus expansion; waiting for board review.', '11111111-1111-1111-1111-111111111111', '2026-07-17 09:00:00+00', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', 'Burak Cinar', 'Cinar Hospitality', 'burak@cinarhospitality.com', '+90 535 444 5500', 'Bodrum', 'Instagram', 'new', 640000, 'TRY', 'Looking for a site cabin and guest service module.', '11111111-1111-1111-1111-111111111111', '2026-07-19 13:15:00+00', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.contacts (organization_id, full_name, company, email, phone, city, notes, created_by)
values
  ('00000000-0000-0000-0000-000000000001', 'Ahmet Yilmaz', 'Yilmaz Yapi', 'ahmet@yilmazyapi.com', '+90 532 000 0001', 'Istanbul', 'Primary decision maker', '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.quotes (organization_id, lead_id, quote_number, issue_date, expiry_date, status, currency, notes, payment_terms, delivery_terms, subtotal, discount_total, tax_total, total, created_by)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Ahmet Yilmaz' limit 1), 'FSA-2026-0142', '2026-07-12', '2026-08-11', 'sent', 'TRY', 'Includes installation and warranty coverage for 12 months.', '50% advance, 50% on delivery', 'Delivery within 30 business days', 1685000, 84500, 329900, 1930400, '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Mehmet Demir' limit 1), 'FSA-2026-0143', '2026-07-13', '2026-08-12', 'viewed', 'TRY', 'Energy-efficient layout with optional solar bundle.', 'Net 15', 'Delivery within 21 business days', 265000, 0, 53000, 318000, '22222222-2222-2222-2222-222222222222'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Ece Aydin' limit 1), 'FSA-2026-0144', '2026-07-10', '2026-08-09', 'draft', 'TRY', 'Awaiting final approval from procurement.', '50% advance, 50% before shipment', 'Custom delivery planning required', 1350000, 135000, 270000, 1485000, '11111111-1111-1111-1111-111111111111')
on conflict do nothing;

insert into public.quote_items (quote_id, product_id, description, quantity, unit_price, discount, tax_rate, line_total)
select q.id, p.id, 'Container Office - turnkey installation', 2, 420000, 5, 20, 1596000
from public.quotes q
join public.products p on p.name = 'Container Office'
where q.quote_number = 'FSA-2026-0142'
on conflict do nothing;

insert into public.tasks (organization_id, lead_id, title, due_at, priority, assigned_to, status, created_by)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Ahmet Yilmaz' limit 1), 'Call Ahmet about installation timeline', '2026-07-15 15:00:00+00', 'high', '11111111-1111-1111-1111-111111111111', 'open', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Mehmet Demir' limit 1), 'Send revised quote PDF', '2026-07-15 17:00:00+00', 'medium', '22222222-2222-2222-2222-222222222222', 'open', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

insert into public.activities (organization_id, lead_id, quote_id, type, title, detail, created_by)
values
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Ahmet Yilmaz' limit 1), (select id from public.quotes where quote_number = 'FSA-2026-0142' limit 1), 'quote_sent', 'Quote sent', 'FSA-2026-0142 shared with Ahmet Yilmaz.', '11111111-1111-1111-1111-111111111111'),
  ('00000000-0000-0000-0000-000000000001', (select id from public.leads where full_name = 'Mehmet Demir' limit 1), (select id from public.quotes where quote_number = 'FSA-2026-0143' limit 1), 'quote_viewed', 'Quote viewed', 'Lead opened the quote twice in the last 24 hours.', '22222222-2222-2222-2222-222222222222')
on conflict do nothing;

