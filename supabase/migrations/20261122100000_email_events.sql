-- Delivery news from the email provider. When a vendor's address bounces,
-- or the vendor marks a request as spam, stop emailing them and show the
-- firm, instead of sending reminders nobody will read.

create index payee_reminders_provider_message_id_idx
  on public.payee_reminders (provider_message_id)
  where provider_message_id is not null;

-- Record a bounce or a spam complaint for an email we sent.
--
-- Returns 'recorded' when the vendor was updated (or already had been),
-- 'ignored' when the vendor's address has changed since that email, and
-- 'unknown' when no email with that id was sent from here.
--
-- A bounce marks the address as failing, which takes the vendor out of the
-- hourly job until the firm corrects the address. A complaint turns the
-- vendor's reminders off, the same as if they had asked us to stop.
create function public.record_w9_email_event(
  p_provider_message_id text,
  p_event text,
  p_recipient text,
  p_detail text
)
returns text
language plpgsql
set search_path = ''
as $$
declare
  v_reminder public.payee_reminders%rowtype;
  v_email text;
  v_note text;
begin
  if p_event not in ('bounced', 'complained') then
    raise exception 'unknown_email_event' using errcode = 'P0001';
  end if;
  if coalesce(p_provider_message_id, '') = '' then
    return 'unknown';
  end if;

  select r.* into v_reminder
  from public.payee_reminders r
  where r.provider_message_id = p_provider_message_id
  order by r.created_at desc
  limit 1;
  if not found then
    return 'unknown';
  end if;

  -- The provider may deliver the same news again: it changes nothing more.
  v_note := p_event || coalesce(': ' || nullif(left(p_detail, 400), ''), '');
  if v_reminder.error is not null and v_reminder.error like p_event || '%' then
    return 'recorded';
  end if;

  select p.email into v_email
  from public.payees p
  where p.id = v_reminder.payee_id
  for update;

  -- The firm has since corrected the address: this news is about the old one.
  if v_email is null
     or (p_recipient is not null and lower(v_email) <> lower(p_recipient)) then
    return 'ignored';
  end if;

  if p_event = 'bounced' then
    update public.payees
    set email_failures = greatest(email_failures, 3), email_claimed_at = null
    where id = v_reminder.payee_id;
    update public.payee_reminders set status = 'failed', error = v_note where id = v_reminder.id;
  else
    update public.payees set email_opted_out = true where id = v_reminder.payee_id;
    update public.payee_reminders set error = v_note where id = v_reminder.id;
  end if;

  insert into public.audit_events (org_id, actor, action, target)
  values (v_reminder.org_id, 'system', 'w9.email_' || p_event, 'payee:' || v_reminder.payee_id);
  return 'recorded';
end;
$$;

revoke all on function public.record_w9_email_event(text, text, text, text)
  from public, anon, authenticated;
grant execute on function public.record_w9_email_event(text, text, text, text) to service_role;
