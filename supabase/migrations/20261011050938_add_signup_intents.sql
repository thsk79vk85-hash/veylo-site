-- Additive website-only contract. Existing waitlist and app clients remain unchanged.
create table if not exists public.signup_requests (
 id uuid primary key default gen_random_uuid(),
 email text not null check(email=lower(trim(email)) and length(email)<=254),
 intent text not null check(intent in ('beta','launch')),
 platform text not null check(platform in ('ios','android','unspecified')),
 source text not null,
 consent_version text not null default '2026-10-11-v1',
 created_at timestamptz not null default now(),
 delivery_state text not null default 'pending' check(delivery_state in ('pending','sending','sent','failed','disabled','review')),
 delivery_attempted_at timestamptz,
 delivery_first_attempt_at timestamptz,
 delivery_token uuid,
 provider_id text,
 check(intent='launch' or platform in ('ios','android'))
);
create unique index if not exists signup_beta_identity on public.signup_requests(email,platform) where intent='beta';
create unique index if not exists signup_launch_identity on public.signup_requests(email) where intent='launch';
create table if not exists public.signup_rate_events (
 id bigint generated always as identity primary key,
 ip_hash text not null,
 created_at timestamptz not null default now()
);
create index if not exists signup_rate_time on public.signup_rate_events(created_at);
alter table public.signup_requests enable row level security;
alter table public.signup_rate_events enable row level security;
revoke all on public.signup_requests,public.signup_rate_events from public,anon,authenticated;
grant select,insert,update,delete on public.signup_requests,public.signup_rate_events to service_role;
grant usage,select on sequence public.signup_rate_events_id_seq to service_role;

create or replace function public.claim_signup_v1(p_email text,p_intent text,p_platform text,p_source text,p_ip_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.signup_requests; token uuid;
begin
 if p_email is null or p_email<>lower(trim(p_email)) or length(p_email)>254 or p_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' or p_intent not in ('beta','launch') or p_platform not in ('ios','android','unspecified') or (p_intent='beta' and p_platform='unspecified') or p_source not in ('direct','instagram','qut-club','campus-poster','friend-invite') or p_ip_hash is null or length(p_ip_hash)<>64 then
  raise exception 'invalid signup' using errcode='22023';
 end if;
 -- Transaction-scoped locks serialize per-IP rate checks and per-email claims.
 perform pg_advisory_xact_lock(hashtextextended('signup-ip:'||p_ip_hash,0));
 delete from public.signup_rate_events where created_at<now()-interval '1 day';
 if (select count(*) from public.signup_rate_events where ip_hash=p_ip_hash and created_at>now()-interval '10 minutes')>=10 then
  return jsonb_build_object('limited',true);
 end if;
 insert into public.signup_rate_events(ip_hash) values(p_ip_hash);
 perform pg_advisory_xact_lock(hashtextextended('signup-email:'||p_email,0));
 select * into r from public.signup_requests where email=p_email and intent=p_intent and (p_intent='launch' or platform=p_platform) for update;
 if not found then
  insert into public.signup_requests(email,intent,platform,source) values(p_email,p_intent,p_platform,p_source) returning * into r;
 end if;
 if p_intent='launch' then
  insert into public.waitlist(email) values(p_email) on conflict(email) do nothing;
 end if;
 if r.delivery_state='sent' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','sent');
 end if;
 if r.delivery_state in ('sending','pending') and r.delivery_attempted_at>now()-interval '5 minutes' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','pending');
 end if;
 -- Resend retains idempotency for 24h. Never automatically retry an uncertain old send.
 if r.delivery_state='review' or (r.delivery_first_attempt_at is not null and r.delivery_first_attempt_at<now()-interval '23 hours' and r.delivery_state in ('sending','pending')) then
  update public.signup_requests set delivery_state='review' where id=r.id;
  return jsonb_build_object('id',r.id,'send',false,'delivery','review');
 end if;
 if r.delivery_state='failed' and r.delivery_attempted_at>now()-interval '5 minutes' then
  return jsonb_build_object('id',r.id,'send',false,'delivery','failed');
 end if;
 token:=gen_random_uuid();
 update public.signup_requests set delivery_state='sending',delivery_token=token,delivery_attempted_at=now(),delivery_first_attempt_at=case when delivery_state='disabled' then now() else coalesce(delivery_first_attempt_at,now()) end where id=r.id;
 return jsonb_build_object('id',r.id,'token',token,'send',true,'delivery','pending');
end $$;
create or replace function public.finish_signup_delivery_v1(p_id uuid,p_token uuid,p_state text,p_provider_id text default null)
returns boolean language plpgsql security invoker set search_path=public,pg_temp as $$
begin
 if p_state not in ('sent','failed','pending','disabled') then raise exception 'invalid delivery state'; end if;
 update public.signup_requests set delivery_state=p_state,provider_id=p_provider_id where id=p_id and delivery_token=p_token and delivery_state='sending';
 return found;
end $$;
revoke all on function public.claim_signup_v1(text,text,text,text,text) from public,anon,authenticated;
revoke all on function public.finish_signup_delivery_v1(uuid,uuid,text,text) from public,anon,authenticated;
grant execute on function public.claim_signup_v1(text,text,text,text,text) to service_role;
grant execute on function public.finish_signup_delivery_v1(uuid,uuid,text,text) to service_role;
