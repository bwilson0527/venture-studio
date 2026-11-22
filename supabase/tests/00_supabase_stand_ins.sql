-- Minimal stand-ins for the parts of Supabase the migrations rely on, so they
-- can be applied to and tested on a plain Postgres. Not used in production.

do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin bypassrls;
  end if;
end
$$;

create schema auth;
create table auth.users (id uuid primary key);
create function auth.uid() returns uuid
language sql stable
as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;

create schema storage;
create table storage.buckets (
  id text primary key,
  name text not null,
  public boolean not null default false,
  file_size_limit bigint,
  allowed_mime_types text[]
);
create table storage.objects (
  id uuid primary key default gen_random_uuid(),
  bucket_id text references storage.buckets (id),
  name text not null
);
alter table storage.objects enable row level security;
create function storage.foldername(name text) returns text[]
language sql immutable
as $$
  select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1]
$$;

-- Supabase grants table privileges to the API roles and leaves protection to
-- row level security. Mirror that, so the tests exercise the policies.
grant usage on schema public, auth, storage to anon, authenticated, service_role;
grant select on storage.objects to anon, authenticated;
alter default privileges in schema public
  grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public
  grant all on sequences to anon, authenticated, service_role;

-- Test helpers.
create schema test;
grant usage on schema test to anon, authenticated;

create function test.expect(condition boolean, description text) returns void
language plpgsql
as $$
begin
  if condition is not true then
    raise exception 'FAILED: %', description;
  end if;
end
$$;

-- Runs a statement that must be refused (by a policy or a missing privilege).
create function test.expect_denied(statement text, description text) returns void
language plpgsql
as $$
declare
  affected bigint;
begin
  begin
    execute statement;
    get diagnostics affected = row_count;
  exception
    when insufficient_privilege or check_violation then
      return;
  end;
  if affected > 0 then
    raise exception 'FAILED (was allowed): %', description;
  end if;
end
$$;

-- Runs a statement that must fail with an error whose message contains
-- `expected_message` (for example a plan-limit trigger).
create function test.expect_error(statement text, expected_message text, description text)
returns void
language plpgsql
as $$
begin
  begin
    execute statement;
  exception
    when others then
      if position(expected_message in sqlerrm) > 0 then
        return;
      end if;
      raise exception 'FAILED (wrong error "%"): %', sqlerrm, description;
  end;
  raise exception 'FAILED (no error): %', description;
end
$$;

create function test.sign_in(user_id uuid) returns void
language sql
as $$ select set_config('request.jwt.claim.sub', user_id::text, false) $$;

grant execute on all functions in schema test to anon, authenticated;
