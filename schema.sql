-- XP Club shared game database. Run once in the Supabase SQL Editor.
create extension if not exists pgcrypto;

create table if not exists public.players (
  id text primary key check (id in ('jordon','justin','raul')),
  name text not null,
  nickname text not null,
  initials text not null,
  color text not null
);
insert into public.players (id,name,nickname,initials,color) values
  ('jordon','Jordon','Hota Hota','JO','#d9f268'),
  ('justin','Justin','Juan Pablo','JU','#c9def3'),
  ('raul','Raul','Ralph','RA','#ffd0b7')
on conflict (id) do update set name=excluded.name,nickname=excluded.nickname,initials=excluded.initials,color=excluded.color;

create table if not exists public.player_accounts (
  player_id text primary key references public.players(id) on delete cascade,
  auth_user_id uuid not null unique references auth.users(id) on delete cascade
);

create table if not exists public.quests (
  id uuid primary key default gen_random_uuid(),
  quest_date date not null,
  assigner text not null references public.players(id),
  assignee text not null references public.players(id),
  title text not null check (char_length(title) between 1 and 90),
  detail text not null default '' check (char_length(detail) <= 240),
  xp integer not null check (xp between 0 and 10000),
  bonuses jsonb not null default '[]'::jsonb check (jsonb_typeof(bonuses) = 'array'),
  status text not null default 'open' check (status in ('open','complete','awarded')),
  created_at timestamptz not null default now(),
  unique (quest_date, assigner),
  unique (quest_date, assignee),
  check (assigner <> assignee)
);

create table if not exists public.reset_votes (
  id boolean primary key default true check (id),
  approvals text[] not null,
  created_at timestamptz not null default now()
);

alter table public.players enable row level security;
alter table public.player_accounts enable row level security;
alter table public.quests enable row level security;
alter table public.reset_votes enable row level security;
drop policy if exists "signed in players can read roster" on public.players;
create policy "signed in players can read roster" on public.players for select to authenticated using (true);
drop policy if exists "signed in players can read quests" on public.quests;
create policy "signed in players can read quests" on public.quests for select to authenticated using (true);
drop policy if exists "signed in players can read reset vote" on public.reset_votes;
create policy "signed in players can read reset vote" on public.reset_votes for select to authenticated using (true);
revoke all on public.players, public.quests, public.reset_votes from anon;
revoke insert, update, delete on public.players, public.quests, public.reset_votes from authenticated;
grant select on public.players, public.quests, public.reset_votes to authenticated;
revoke all on public.player_accounts from anon, authenticated;

create or replace function public.current_xp_player() returns text
language plpgsql stable security definer set search_path = '' as $$
declare v_player text;
begin
  select player_id into v_player from public.player_accounts where auth_user_id = auth.uid();
  if v_player is null then raise exception 'This login is not linked to an XP Club player.'; end if;
  return v_player;
end; $$;

create or replace function public.xp_recipient(p_assigner text, p_date date) returns text
language sql immutable set search_path = '' as $$
  with rotation as (
    select array['jordon','justin','raul']::text[] as ids,
           ((p_date - date '2025-01-06') % 3 + 3) % 3 as shift
  )
  select ids[((array_position(ids,p_assigner)-1+1+shift) % 3)+1] from rotation;
$$;

create or replace function public.create_quest(p_date date, p_title text, p_detail text, p_xp integer, p_bonuses jsonb)
returns public.quests language plpgsql security definer set search_path = '' as $$
declare v_assigner text; v_assignee text; v_bonuses jsonb; v_bonus jsonb; v_quest public.quests; v_today date := (now() at time zone 'America/Chicago')::date;
begin
  v_assigner := public.current_xp_player();
  if p_date < v_today or p_date > v_today + 7 then raise exception 'Quests can be set for today through one week ahead.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 90 then raise exception 'Quest title must be between 1 and 90 characters.'; end if;
  if coalesce(p_xp,-1) not between 0 and 10000 then raise exception 'XP must be between 0 and 10000.'; end if;
  if jsonb_typeof(coalesce(p_bonuses,'[]'::jsonb)) <> 'array' or jsonb_array_length(coalesce(p_bonuses,'[]'::jsonb)) > 5 then raise exception 'Use up to five bonus objectives.'; end if;
  v_bonuses := '[]'::jsonb;
  for v_bonus in select value from jsonb_array_elements(coalesce(p_bonuses,'[]'::jsonb)) loop
    if length(trim(coalesce(v_bonus->>'title',''))) not between 1 and 70 or coalesce((v_bonus->>'xp')::integer,0) not between 1 and 2000 then raise exception 'Each bonus needs a title and 1 to 2000 XP.'; end if;
    v_bonuses := v_bonuses || jsonb_build_array(jsonb_build_object('title',trim(v_bonus->>'title'),'xp',(v_bonus->>'xp')::integer,'done',false));
  end loop;
  v_assignee := public.xp_recipient(v_assigner,p_date);
  insert into public.quests (quest_date,assigner,assignee,title,detail,xp,bonuses)
  values (p_date,v_assigner,v_assignee,trim(p_title),left(coalesce(p_detail,''),240),p_xp,v_bonuses)
  returning * into strict v_quest;
  return v_quest;
end; $$;

create or replace function public.complete_quest(p_quest_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_today date := (now() at time zone 'America/Chicago')::date;
begin
  update public.quests set status='complete'
  where id=p_quest_id and assignee=public.current_xp_player() and status='open' and quest_date<=v_today;
  if not found then raise exception 'This quest cannot be marked complete by this login.'; end if;
end; $$;

create or replace function public.attest_quest(p_quest_id uuid, p_bonus_done boolean[]) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quests; v_player text; v_witness text; v_bonuses jsonb; i integer; v_today date := (now() at time zone 'America/Chicago')::date;
begin
  v_player := public.current_xp_player();
  select * into q from public.quests where id=p_quest_id for update;
  if not found or q.status <> 'complete' or q.quest_date > v_today then raise exception 'This quest is not ready to attest.'; end if;
  select id into v_witness from public.players where id not in (q.assigner,q.assignee);
  if v_player <> v_witness then raise exception 'Only the third player can attest this quest.'; end if;
  if coalesce(array_length(p_bonus_done,1),0) <> jsonb_array_length(q.bonuses) then raise exception 'Bonus selections do not match this quest.'; end if;
  v_bonuses := '[]'::jsonb;
  if jsonb_array_length(q.bonuses)>0 then
    for i in 0..jsonb_array_length(q.bonuses)-1 loop
      v_bonuses := v_bonuses || jsonb_build_array(jsonb_set(q.bonuses->i,'{done}',to_jsonb(coalesce(p_bonus_done[i+1],false))));
    end loop;
  end if;
  update public.quests set status='awarded', bonuses=v_bonuses where id=p_quest_id;
end; $$;

create or replace function public.propose_reset() returns void
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.reset_votes(id,approvals) values(true,array[public.current_xp_player()]);
end; $$;

create or replace function public.approve_reset() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_player text; v_approvals text[];
begin
  v_player := public.current_xp_player();
  select approvals into v_approvals from public.reset_votes where id=true for update;
  if not found then raise exception 'There is no reset vote in progress.'; end if;
  if v_player = any(v_approvals) then raise exception 'This login has already approved.'; end if;
  v_approvals := array_append(v_approvals,v_player);
  if cardinality(v_approvals)=3 then
    delete from public.quests;
    delete from public.reset_votes where id=true;
    return true;
  end if;
  update public.reset_votes set approvals=v_approvals where id=true;
  return false;
end; $$;

create or replace function public.cancel_reset() returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform public.current_xp_player();
  delete from public.reset_votes where id=true;
end; $$;

create or replace view public.leaderboard with (security_invoker=true) as
select p.id,
       coalesce(sum(q.xp + coalesce((select sum((elem.value->>'xp')::integer) from jsonb_array_elements(q.bonuses) as elem(value) where elem.value->>'done'='true'),0)),0)::bigint as xp
from public.players p left join public.quests q on q.assignee=p.id and q.status='awarded'
group by p.id;
grant select on public.leaderboard to authenticated;

do $$ begin
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='quests') then
    alter publication supabase_realtime add table public.quests;
  end if;
  if not exists (select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='reset_votes') then
    alter publication supabase_realtime add table public.reset_votes;
  end if;
end $$;

revoke all on function public.current_xp_player() from public, anon;
revoke all on function public.xp_recipient(text,date) from public, anon;
revoke all on function public.create_quest(date,text,text,integer,jsonb) from public, anon;
revoke all on function public.complete_quest(uuid) from public, anon;
revoke all on function public.attest_quest(uuid,boolean[]) from public, anon;
revoke all on function public.propose_reset() from public, anon;
revoke all on function public.approve_reset() from public, anon;
revoke all on function public.cancel_reset() from public, anon;
grant execute on function public.current_xp_player() to authenticated;
grant execute on function public.create_quest(date,text,text,integer,jsonb) to authenticated;
grant execute on function public.complete_quest(uuid) to authenticated;
grant execute on function public.attest_quest(uuid,boolean[]) to authenticated;
grant execute on function public.propose_reset() to authenticated;
grant execute on function public.approve_reset() to authenticated;
grant execute on function public.cancel_reset() to authenticated;
