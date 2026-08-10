create extension if not exists pgcrypto;

create table if not exists public.waitlist (
  id uuid primary key default gen_random_uuid(),
  email text not null unique,
  created_at timestamptz not null default now(),
  constraint waitlist_email_is_normalized check (email = lower(trim(email)))
);

alter table public.waitlist enable row level security;

-- Intentionally no public policies. The public browser cannot read or write this table.
-- The Vercel function inserts through a server-only service-role key.
