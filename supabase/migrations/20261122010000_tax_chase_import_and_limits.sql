-- Play 1: rotating portal links, plan limits, atomic client import, and
-- upload limits on the document bucket.

-- Portal links are derived from a server secret plus this version, so a link
-- can be shown again without being stored, and rotated by bumping the version.
alter table public.clients
  add column portal_token_version integer not null default 1;

-- Plan limit: an org cannot hold more clients than orgs.client_limit. The
-- org row lock makes concurrent imports queue instead of racing past it.
create function public.enforce_client_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  allowed integer;
  current_count integer;
begin
  select o.client_limit into allowed
  from public.orgs o where o.id = new.org_id for update;

  select count(*) into current_count
  from public.clients c where c.org_id = new.org_id;

  if current_count >= allowed then
    raise exception 'client_limit_reached'
      using errcode = 'P0001',
            detail = format('This plan allows %s clients.', allowed);
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_client_limit() from public, anon, authenticated;

create trigger clients_enforce_limit
  before insert on public.clients
  for each row execute function public.enforce_client_limit();

-- Import clients and their checklists in one transaction. Runs with the
-- caller's rights, so row level security still applies to every insert.
-- An org's own template for a return type wins over the built-in one.
create function public.import_clients(target_org uuid, target_tax_year integer, client_rows jsonb)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  r jsonb;
  template_items jsonb;
  imported integer := 0;
begin
  if not public.is_org_member(target_org) then
    raise exception 'not_a_member' using errcode = '42501';
  end if;

  for r in select value from jsonb_array_elements(client_rows) loop
    insert into public.clients
      (id, org_id, name, email, phone, return_type, tax_year, portal_token_hash)
    values
      ((r->>'id')::uuid, target_org, r->>'name', r->>'email', r->>'phone',
       r->>'return_type', target_tax_year, r->>'portal_token_hash');

    select t.items into template_items
    from public.checklist_templates t
    where t.return_type = r->>'return_type'
      and (t.org_id = target_org or t.org_id is null)
    order by (t.org_id is null), t.created_at desc
    limit 1;

    insert into public.checklist_items (org_id, client_id, label, required, position)
    select target_org, (r->>'id')::uuid, e.value->>'label',
           coalesce((e.value->>'required')::boolean, true), e.ordinality::integer
    from jsonb_array_elements(coalesce(template_items, '[]'::jsonb)) with ordinality as e;

    imported := imported + 1;
  end loop;

  return imported;
end;
$$;

revoke all on function public.import_clients(uuid, integer, jsonb) from public, anon;
grant execute on function public.import_clients(uuid, integer, jsonb) to authenticated;

-- Uploads: 25 MB per file, common document and photo formats only.
update storage.buckets
set file_size_limit = 26214400,
    allowed_mime_types = array[
      'application/pdf',
      'image/jpeg',
      'image/png',
      'image/heic',
      'image/heif',
      'image/webp',
      'text/csv',
      'application/vnd.ms-excel',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    ]
where id = 'client-documents';
