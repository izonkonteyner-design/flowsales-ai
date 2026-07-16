-- Quote catalog foundation and backward-compatible commercial fields

alter table public.quotes
  alter column lead_id drop not null;

alter table public.quotes
  add column if not exists customer_id uuid references public.contacts(id) on delete set null;

alter table public.quotes
  add column if not exists valid_until date;

alter table public.quotes
  add column if not exists line_discount_total numeric(14,2) not null default 0,
  add column if not exists order_discount_type text not null default 'percentage',
  add column if not exists order_discount_value numeric(14,2) not null default 0,
  add column if not exists order_discount_total numeric(14,2) not null default 0,
  add column if not exists taxable_subtotal numeric(14,2) not null default 0,
  add column if not exists shipping_total numeric(14,2) not null default 0,
  add column if not exists grand_total numeric(14,2) not null default 0;

update public.quotes
set
  valid_until = coalesce(valid_until, expiry_date),
  line_discount_total = coalesce(line_discount_total, discount_total, 0),
  order_discount_total = coalesce(order_discount_total, 0),
  order_discount_type = coalesce(order_discount_type, 'percentage'),
  order_discount_value = coalesce(order_discount_value, 0),
  taxable_subtotal = coalesce(taxable_subtotal, subtotal - coalesce(discount_total, 0), subtotal),
  shipping_total = coalesce(shipping_total, 0),
  grand_total = coalesce(grand_total, total, subtotal),
  total = coalesce(total, subtotal - coalesce(discount_total, 0) + coalesce(tax_total, 0) + coalesce(shipping_total, 0));

update public.quotes
set valid_until = coalesce(valid_until, issue_date)
where valid_until is null;

alter table public.quotes
  alter column valid_until set not null;

alter table public.quotes drop constraint if exists quotes_status_check;
alter table public.quotes
  add constraint quotes_status_check
  check (status in ('draft', 'sent', 'viewed', 'accepted', 'rejected', 'expired', 'cancelled'));

alter table public.quote_items
  add column if not exists name text,
  add column if not exists sku text,
  add column if not exists unit text not null default 'unit',
  add column if not exists currency char(3) not null default 'TRY',
  add column if not exists discount_type text not null default 'percentage',
  add column if not exists discount_value numeric(14,2) not null default 0,
  add column if not exists line_subtotal numeric(14,2) not null default 0,
  add column if not exists line_discount numeric(14,2) not null default 0,
  add column if not exists taxable_subtotal numeric(14,2) not null default 0,
  add column if not exists line_tax numeric(14,2) not null default 0,
  add column if not exists sort_order integer not null default 0;

update public.quote_items qi
set
  name = coalesce(nullif(name, ''), description),
  sku = coalesce(sku, ''),
  unit = coalesce(nullif(unit, ''), 'unit'),
  currency = coalesce(currency, q.currency),
  discount_type = coalesce(discount_type, 'percentage'),
  discount_value = coalesce(discount_value, discount),
  line_subtotal = coalesce(line_subtotal, quantity * unit_price),
  line_discount = coalesce(line_discount, quantity * unit_price * coalesce(discount, 0) / 100),
  taxable_subtotal = coalesce(taxable_subtotal, (quantity * unit_price) - (quantity * unit_price * coalesce(discount, 0) / 100)),
  line_tax = coalesce(line_tax, line_total - ((quantity * unit_price) - (quantity * unit_price * coalesce(discount, 0) / 100))),
  sort_order = coalesce(sort_order, 0)
from public.quotes q
where q.id = qi.quote_id;

update public.quote_items
set name = coalesce(name, description)
where name is null;

alter table public.quote_items
  alter column name set not null;

alter table public.quote_items
  drop constraint if exists quote_items_discount_type_check;

alter table public.quote_items
  add constraint quote_items_discount_type_check
  check (discount_type in ('percentage', 'fixed'));

create index if not exists quotes_organization_valid_until_idx
  on public.quotes (organization_id, valid_until);

create index if not exists quotes_organization_customer_idx
  on public.quotes (organization_id, customer_id);

create index if not exists quote_items_quote_sort_idx
  on public.quote_items (quote_id, sort_order, created_at);

create or replace function public.sync_quote_expiry_dates()
returns trigger
language plpgsql
as $$
begin
  if new.valid_until is null and new.expiry_date is not null then
    new.valid_until = new.expiry_date;
  end if;

  if new.expiry_date is null and new.valid_until is not null then
    new.expiry_date = new.valid_until;
  end if;

  return new;
end;
$$;

drop trigger if exists sync_quote_expiry_dates on public.quotes;
create trigger sync_quote_expiry_dates
before insert or update on public.quotes
for each row execute function public.sync_quote_expiry_dates();
