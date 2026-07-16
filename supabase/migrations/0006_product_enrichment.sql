alter table public.products
  add column if not exists short_description text,
  add column if not exists brand text,
  add column if not exists model text,
  add column if not exists width numeric(14,2),
  add column if not exists length numeric(14,2),
  add column if not exists height numeric(14,2),
  add column if not exists area_m2 numeric(14,2),
  add column if not exists weight_kg numeric(14,2),
  add column if not exists material text,
  add column if not exists color text,
  add column if not exists stock_quantity integer not null default 0,
  add column if not exists minimum_order_quantity integer not null default 1,
  add column if not exists lead_time_days integer not null default 0,
  add column if not exists warranty_months integer not null default 0,
  add column if not exists internal_code text,
  add column if not exists barcode text,
  add column if not exists tags jsonb not null default '[]'::jsonb,
  add column if not exists features jsonb not null default '[]'::jsonb,
  add column if not exists gallery_urls jsonb not null default '[]'::jsonb,
  add column if not exists featured boolean not null default false,
  add column if not exists notes text;

update public.products
set
  short_description = coalesce(short_description, ''),
  brand = coalesce(brand, ''),
  model = coalesce(model, ''),
  width = coalesce(width, 0),
  length = coalesce(length, 0),
  height = coalesce(height, 0),
  area_m2 = coalesce(area_m2, 0),
  weight_kg = coalesce(weight_kg, 0),
  material = coalesce(material, ''),
  color = coalesce(color, ''),
  stock_quantity = coalesce(stock_quantity, 0),
  minimum_order_quantity = coalesce(minimum_order_quantity, 1),
  lead_time_days = coalesce(lead_time_days, 0),
  warranty_months = coalesce(warranty_months, 0),
  internal_code = coalesce(internal_code, ''),
  barcode = coalesce(barcode, ''),
  tags = coalesce(tags, '[]'::jsonb),
  features = coalesce(features, '[]'::jsonb),
  gallery_urls = coalesce(gallery_urls, '[]'::jsonb),
  featured = coalesce(featured, false),
  notes = coalesce(notes, '')
where true;

create unique index if not exists products_organization_sku_unique_idx
  on public.products (organization_id, sku);

create index if not exists products_organization_featured_idx
  on public.products (organization_id, featured, created_at desc);
