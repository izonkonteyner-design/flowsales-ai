alter table public.products
  add column if not exists sku text,
  add column if not exists unit_price numeric(14,2);

update public.products
set unit_price = coalesce(unit_price, base_price)
where unit_price is null;

alter table public.products
  alter column unit_price set default 0;

create index if not exists products_organization_sku_idx on public.products (organization_id, sku);
create index if not exists products_organization_created_idx on public.products (organization_id, created_at desc);
