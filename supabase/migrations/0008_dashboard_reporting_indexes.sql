create index if not exists leads_organization_created_idx
  on public.leads (organization_id, created_at desc);

create index if not exists leads_organization_updated_idx
  on public.leads (organization_id, updated_at desc);

create index if not exists quotes_organization_issue_date_idx
  on public.quotes (organization_id, issue_date desc);

create index if not exists quotes_organization_status_issue_date_idx
  on public.quotes (organization_id, status, issue_date desc);

create index if not exists quotes_organization_currency_issue_date_idx
  on public.quotes (organization_id, currency, issue_date desc);

create index if not exists quotes_organization_updated_idx
  on public.quotes (organization_id, updated_at desc);

create index if not exists quote_items_quote_product_idx
  on public.quote_items (quote_id, product_id);

