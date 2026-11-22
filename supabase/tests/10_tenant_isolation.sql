-- Two firms; nothing may cross between them, and nothing is open to anon.

insert into auth.users (id) values
  ('00000000-0000-0000-0000-00000000000a'),
  ('00000000-0000-0000-0000-00000000000b'),
  ('00000000-0000-0000-0000-00000000000c');

insert into public.orgs (id, name) values
  ('10000000-0000-0000-0000-000000000001', 'Firm A'),
  ('10000000-0000-0000-0000-000000000002', 'Firm B');

insert into public.members (org_id, user_id, role) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000a', 'owner'),
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000c', 'preparer'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000b', 'owner');

insert into public.clients (id, org_id, name, return_type, tax_year, portal_token_hash) values
  ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'A client', '1040_w2', 2026, 'hash-a'),
  ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'B client', '1040_w2', 2026, 'hash-b');

insert into public.documents (org_id, client_id, storage_path, filename) values
  ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'a/doc.pdf', 'doc.pdf'),
  ('10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', 'b/doc.pdf', 'doc.pdf');

insert into public.audit_events (org_id, actor, action) values
  ('10000000-0000-0000-0000-000000000001', 'system', 'seed'),
  ('10000000-0000-0000-0000-000000000002', 'system', 'seed');

insert into storage.objects (bucket_id, name) values
  ('client-documents', '10000000-0000-0000-0000-000000000001/c/doc.pdf'),
  ('client-documents', '10000000-0000-0000-0000-000000000002/c/doc.pdf');

-- Owner of firm A.
set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000a');

select test.expect((select count(*) from public.orgs) = 1, 'owner sees only their org');
select test.expect((select count(*) from public.clients) = 1, 'owner sees only their clients');
select test.expect((select count(*) from public.documents) = 1, 'owner sees only their documents');
select test.expect((select count(*) from public.members) = 2, 'owner sees only their org''s members');
select test.expect((select count(*) from public.audit_events) = 1, 'owner sees only their audit log');
select test.expect((select count(*) from storage.objects) = 1, 'owner sees only their org''s files');
select test.expect((select count(*) from public.checklist_templates) = 5, 'built-in templates are readable');

select test.expect_denied(
  $$update public.clients set name = 'x' where org_id = '10000000-0000-0000-0000-000000000002'$$,
  'updating another firm''s client');
select test.expect_denied(
  $$delete from public.clients where org_id = '10000000-0000-0000-0000-000000000002'$$,
  'deleting another firm''s client');
select test.expect_denied(
  $$insert into public.clients (org_id, name, return_type, tax_year, portal_token_hash)
    values ('10000000-0000-0000-0000-000000000002', 'x', '1040_w2', 2026, 'hash-x')$$,
  'inserting a client into another firm');
select test.expect_denied(
  $$insert into public.members (org_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-00000000000a', 'owner')$$,
  'joining another firm');
select test.expect_denied(
  $$update public.orgs set plan = 'firm', client_limit = 100000$$,
  'changing your own plan or client limit');
select test.expect_denied(
  $$insert into public.orgs (name) values ('Free org')$$,
  'creating an org directly');
select test.expect_denied(
  $$insert into public.reminders (org_id, client_id, scheduled_for)
    values ('10000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', now())$$,
  'writing reminders from the client');
select test.expect_denied(
  $$insert into public.audit_events (org_id, actor, action)
    values ('10000000-0000-0000-0000-000000000001', 'member', 'forged')$$,
  'forging audit events');
select test.expect_denied(
  $$delete from public.audit_events$$,
  'deleting audit events');
select test.expect_denied(
  $$update public.checklist_templates set name = 'x' where org_id is null$$,
  'editing built-in templates');

-- Owners may rename their own org.
update public.orgs set name = 'Firm A renamed';
select test.expect((select name from public.orgs) = 'Firm A renamed', 'owner can rename their org');

-- A preparer in firm A.
select test.sign_in('00000000-0000-0000-0000-00000000000c');
select test.expect((select count(*) from public.clients) = 1, 'preparer sees their firm''s clients');
select test.expect((select count(*) from public.audit_events) = 0, 'preparer cannot read the audit log');
select test.expect_denied(
  $$update public.orgs set name = 'x'$$,
  'preparer renaming the org');
select test.expect_denied(
  $$insert into public.members (org_id, user_id, role)
    values ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-00000000000b', 'owner')$$,
  'preparer adding members');
select test.expect_denied(
  $$delete from public.members$$,
  'preparer removing members');

-- Signed out.
reset role;
set role anon;
select test.sign_in(null);
select test.expect((select count(*) from public.orgs) = 0, 'anon sees no orgs');
select test.expect((select count(*) from public.clients) = 0, 'anon sees no clients');
select test.expect((select count(*) from public.documents) = 0, 'anon sees no documents');
select test.expect((select count(*) from public.checklist_templates) = 0, 'anon sees no templates');
select test.expect((select count(*) from storage.objects) = 0, 'anon sees no files');
select test.expect_denied(
  $$insert into public.clients (org_id, name, return_type, tax_year, portal_token_hash)
    values ('10000000-0000-0000-0000-000000000001', 'x', '1040_w2', 2026, 'hash-y')$$,
  'anon inserting a client');
reset role;
