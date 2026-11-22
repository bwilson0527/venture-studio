-- Rate limits: counting attempts per key and window, server only.

set role authenticated;
select test.sign_in('00000000-0000-0000-0000-00000000000a');
select test.expect_error(
  $$select public.take_rate_limit('k', 5, 60)$$,
  'permission denied for function', 'a signed-in user spending a limit');
select test.expect_denied($$select * from public.rate_limits$$, 'a signed-in user reading the counters');
set role anon;
select test.expect_error(
  $$select public.take_rate_limit('k', 5, 60)$$,
  'permission denied for function', 'a visitor spending a limit');
select test.expect_denied($$delete from public.rate_limits$$, 'a visitor clearing the counters');
reset role;
select set_config('request.jwt.claim.sub', '', false);

set role service_role;
-- A long window, so the test cannot straddle two of them.
select test.expect(public.take_rate_limit('signin:a', 3, 86400), 'the first attempt is allowed');
select test.expect(public.take_rate_limit('signin:a', 3, 86400), 'the second attempt is allowed');
select test.expect(public.take_rate_limit('signin:a', 3, 86400), 'the attempt at the limit is allowed');
select test.expect(not public.take_rate_limit('signin:a', 3, 86400), 'the attempt past the limit is refused');
select test.expect(not public.take_rate_limit('signin:a', 3, 86400), 'and it stays refused');
select test.expect(public.take_rate_limit('signin:b', 3, 86400), 'another key has its own count');
select test.expect(
  (select hits = 5 from public.rate_limits where key = 'signin:a'),
  'every attempt is counted, refused ones too');

-- A new window starts a new count.
update public.rate_limits set window_start = window_start - interval '1 day' where key = 'signin:a';
select test.expect(public.take_rate_limit('signin:a', 3, 86400), 'a new window allows attempts again');

select test.expect_error(
  $$select public.take_rate_limit('', 3, 60)$$, 'invalid_rate_limit', 'an empty key');
select test.expect_error(
  $$select public.take_rate_limit('k', 0, 60)$$, 'invalid_rate_limit', 'a limit of zero');
select test.expect_error(
  $$select public.take_rate_limit('k', 3, 0)$$, 'invalid_rate_limit', 'a window of zero seconds');
reset role;
