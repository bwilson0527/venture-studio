-- Play 1 (tax-season document chase): initial schema.
--
-- Access model
--   * Firm users sign in with Supabase Auth and reach rows only through the
--     membership checks below (row level security on every table).
--   * Tax clients never sign in. The portal runs server-side with the service
--     role after verifying the link token against clients.portal_token_hash,
--     so no policy here grants anything to the anon role.

create extension if not exists pgcrypto;

create type public.member_role as enum ('owner', 'preparer');
create type public.client_status as enum ('not_started', 'in_progress', 'complete', 'paused');
create type public.item_state as enum ('needed', 'uploaded', 'not_applicable');
create type public.reminder_channel as enum ('email', 'sms');
create type public.reminder_status as enum ('scheduled', 'sent', 'failed', 'cancelled');

create table public.orgs (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  stripe_customer_id text unique,
  plan text not null default 'free',
  client_limit integer not null default 10,
  time_zone text not null default 'America/New_York',
  created_at timestamptz not null default now()
);

create table public.members (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role public.member_role not null default 'preparer',
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index members_user_id_idx on public.members (user_id);

create table public.checklist_templates (
  id uuid primary key default gen_random_uuid(),
  -- null org_id = built-in template shipped with the product
  org_id uuid references public.orgs (id) on delete cascade,
  return_type text not null,
  name text not null,
  items jsonb not null default '[]'::jsonb,
  created_at timestamptz not null default now()
);
create index checklist_templates_org_id_idx on public.checklist_templates (org_id);

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  name text not null,
  email text,
  phone text,
  return_type text not null,
  tax_year integer not null,
  status public.client_status not null default 'not_started',
  portal_token_hash text not null unique,
  requested_at timestamptz,
  reminders_sent integer not null default 0,
  last_reminder_at timestamptz,
  email_opted_out boolean not null default false,
  created_at timestamptz not null default now()
);
create index clients_org_id_status_idx on public.clients (org_id, status);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  label text not null,
  help_text text,
  required boolean not null default true,
  state public.item_state not null default 'needed',
  position integer not null default 0,
  updated_at timestamptz not null default now()
);
create index checklist_items_client_id_idx on public.checklist_items (client_id);

create table public.documents (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  checklist_item_id uuid references public.checklist_items (id) on delete set null,
  storage_path text not null unique,
  filename text not null,
  content_type text,
  size_bytes bigint,
  uploaded_at timestamptz not null default now()
);
create index documents_client_id_idx on public.documents (client_id);

create table public.reminders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.orgs (id) on delete cascade,
  client_id uuid not null references public.clients (id) on delete cascade,
  channel public.reminder_channel not null default 'email',
  status public.reminder_status not null default 'scheduled',
  scheduled_for timestamptz not null,
  sent_at timestamptz,
  provider_message_id text,
  error text,
  created_at timestamptz not null default now()
);
create index reminders_due_idx on public.reminders (scheduled_for) where status = 'scheduled';

create table public.audit_events (
  id bigint generated always as identity primary key,
  org_id uuid not null references public.orgs (id) on delete cascade,
  -- 'member:<user id>', 'client:<client id>' or 'system'
  actor text not null,
  action text not null,
  target text,
  ip inet,
  created_at timestamptz not null default now()
);
create index audit_events_org_id_created_at_idx on public.audit_events (org_id, created_at desc);

-- Membership helpers. SECURITY DEFINER so policies on members itself do not
-- recurse; search_path pinned so the functions cannot be hijacked.
create function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = target_org and m.user_id = (select auth.uid())
  );
$$;

create function public.is_org_owner(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.members m
    where m.org_id = target_org
      and m.user_id = (select auth.uid())
      and m.role = 'owner'
  );
$$;

revoke all on function public.is_org_member(uuid) from public, anon;
revoke all on function public.is_org_owner(uuid) from public, anon;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_owner(uuid) to authenticated;

alter table public.orgs enable row level security;
alter table public.members enable row level security;
alter table public.checklist_templates enable row level security;
alter table public.clients enable row level security;
alter table public.checklist_items enable row level security;
alter table public.documents enable row level security;
alter table public.reminders enable row level security;
alter table public.audit_events enable row level security;

-- Orgs: members read; owners rename. Creation, plan and limits change only
-- server-side (signup flow and the Stripe webhook use the service role).
create policy orgs_select on public.orgs
  for select to authenticated using (public.is_org_member(id));
create policy orgs_update on public.orgs
  for update to authenticated
  using (public.is_org_owner(id)) with check (public.is_org_owner(id));
revoke update on public.orgs from authenticated;
grant update (name, time_zone) on public.orgs to authenticated;

-- Members: visible to the org; managed by owners.
create policy members_select on public.members
  for select to authenticated using (public.is_org_member(org_id));
create policy members_insert on public.members
  for insert to authenticated with check (public.is_org_owner(org_id));
create policy members_delete on public.members
  for delete to authenticated using (public.is_org_owner(org_id));

-- Templates: built-ins readable by everyone signed in; org templates by members.
create policy templates_select on public.checklist_templates
  for select to authenticated
  using (org_id is null or public.is_org_member(org_id));
create policy templates_write on public.checklist_templates
  for all to authenticated
  using (org_id is not null and public.is_org_member(org_id))
  with check (org_id is not null and public.is_org_member(org_id));

create policy clients_all on public.clients
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

create policy checklist_items_all on public.checklist_items
  for all to authenticated
  using (public.is_org_member(org_id)) with check (public.is_org_member(org_id));

-- Documents and reminders are written by the server; members only read,
-- and may delete a document uploaded by mistake.
create policy documents_select on public.documents
  for select to authenticated using (public.is_org_member(org_id));
create policy documents_delete on public.documents
  for delete to authenticated using (public.is_org_member(org_id));

create policy reminders_select on public.reminders
  for select to authenticated using (public.is_org_member(org_id));

-- The audit log is append-only from the server and readable by owners.
create policy audit_events_select on public.audit_events
  for select to authenticated using (public.is_org_owner(org_id));

-- Private bucket for client documents. Objects live at
-- <org id>/<client id>/<document id>-<filename>; members read their own org's
-- files through short-lived signed URLs, uploads go through the server.
insert into storage.buckets (id, name, public)
values ('client-documents', 'client-documents', false)
on conflict (id) do nothing;

create policy client_documents_read on storage.objects
  for select to authenticated
  using (
    bucket_id = 'client-documents'
    and public.is_org_member(((storage.foldername(name))[1])::uuid)
  );

-- Built-in checklist templates.
insert into public.checklist_templates (org_id, return_type, name, items) values
  (null, '1040_w2', 'Individual, W-2 income', '[
    {"label": "W-2 from each employer", "required": true},
    {"label": "1099-INT / 1099-DIV (bank and investment income)", "required": false},
    {"label": "1098 mortgage interest statement", "required": false},
    {"label": "1095-A health marketplace statement", "required": false},
    {"label": "Childcare provider name, address and tax ID", "required": false},
    {"label": "Last year''s tax return (new clients only)", "required": false}
  ]'::jsonb),
  (null, '1040_sched_c', 'Individual, self-employed', '[
    {"label": "1099-NEC / 1099-K forms received", "required": true},
    {"label": "Profit and loss summary or bookkeeping export", "required": true},
    {"label": "Business mileage log", "required": false},
    {"label": "Home office square footage and expenses", "required": false},
    {"label": "Estimated tax payments made (dates and amounts)", "required": true},
    {"label": "Health insurance premiums paid", "required": false}
  ]'::jsonb),
  (null, '1040_rental', 'Individual, rental property', '[
    {"label": "Rent received per property", "required": true},
    {"label": "Expense summary per property", "required": true},
    {"label": "1098 mortgage interest statement per property", "required": false},
    {"label": "Property tax bills", "required": true},
    {"label": "Closing statement for any property bought or sold", "required": false}
  ]'::jsonb),
  (null, '1065', 'Partnership', '[
    {"label": "Year-end balance sheet and profit and loss", "required": true},
    {"label": "Bank statements for December", "required": true},
    {"label": "Partner ownership changes during the year", "required": true},
    {"label": "Fixed assets bought or sold", "required": false},
    {"label": "1099s issued to contractors", "required": false}
  ]'::jsonb),
  (null, '1120s', 'S corporation', '[
    {"label": "Year-end balance sheet and profit and loss", "required": true},
    {"label": "Payroll reports (W-3, 941s)", "required": true},
    {"label": "Shareholder distributions and loans", "required": true},
    {"label": "Fixed assets bought or sold", "required": false},
    {"label": "Health insurance paid for shareholders", "required": false}
  ]'::jsonb);
