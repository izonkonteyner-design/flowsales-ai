alter table public.products
  add column if not exists sku text,
  add column if not exists unit_price numeric(14,2);

update public.products
set unit_price = coalesce(unit_price, base_price)
where unit_price is null;

alter table public.products
  alter column unit_price set default 0;

alter table public.quotes
  alter column lead_id drop not null,
  add column if not exists customer_name text,
  add column if not exists customer_company text,
  add column if not exists customer_email text,
  add column if not exists customer_phone text,
  add column if not exists discount_type text not null default 'fixed',
  add column if not exists discount_value numeric(14,2) not null default 0,
  add column if not exists shipping_total numeric(14,2) not null default 0,
  add column if not exists grand_total numeric(14,2) not null default 0;

alter table public.quotes
  drop constraint if exists quotes_status_check;

alter table public.quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'));

alter table public.quote_items
  add column if not exists name text,
  add column if not exists unit text not null default 'unit',
  add column if not exists discount_type text not null default 'fixed',
  add column if not exists discount_value numeric(14,2) not null default 0,
  add column if not exists sort_order integer not null default 0;

update public.quote_items
set name = coalesce(name, description),
    unit = coalesce(unit, 'unit'),
    discount_type = case when discount > 0 then 'percentage' else 'fixed' end,
    discount_value = coalesce(discount_value, discount),
    sort_order = coalesce(sort_order, 0)
where name is null
   or discount_value is null;

create index if not exists products_organization_sku_idx on public.products (organization_id, sku);
create index if not exists products_organization_created_idx on public.products (organization_id, created_at desc);
create index if not exists quotes_organization_created_idx on public.quotes (organization_id, created_at desc);
create index if not exists quote_items_quote_sort_idx on public.quote_items (quote_id, sort_order, created_at);
