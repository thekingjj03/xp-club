-- XP Club live upgrade: four-player rotation, guest idea board and guest read access.
begin;

alter table public.players drop constraint if exists players_id_check;
alter table public.players add constraint players_id_check check (id in ('jordon','justin','raul','lyle'));
insert into public.players (id,name,nickname,initials,color) values ('lyle','Lyle','Pookers','LY','#d8c6f2')
on conflict (id) do update set name=excluded.name,nickname=excluded.nickname,initials=excluded.initials,color=excluded.color;
insert into public.player_accounts(player_id,auth_user_id)
select 'lyle',id from auth.users where email='LYLE_EMAIL'
on conflict (player_id) do update set auth_user_id=excluded.auth_user_id;

create table if not exists public.quest_ideas (
  id uuid primary key default gen_random_uuid(),
  category text not null check (category in ('players','guests')),
  submitted_by text not null check (char_length(submitted_by) between 1 and 40),
  submitter_auth_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 90),
  detail text not null default '' check (char_length(detail) <= 240),
  created_at timestamptz not null default now()
);
create index if not exists quest_ideas_created_at_idx on public.quest_ideas(created_at desc);
create index if not exists quest_ideas_submitter_idx on public.quest_ideas(submitter_auth_id,created_at desc);

alter table public.quest_ideas enable row level security;
drop policy if exists "signed in players can read quests" on public.quests;
drop policy if exists "players and guests can read allowed quests" on public.quests;
create policy "players and guests can read allowed quests" on public.quests for select to authenticated using (
  coalesce(auth.jwt()->>'is_anonymous','false') <> 'true'
  or quest_date between (now() at time zone 'America/Chicago')::date - 1 and (now() at time zone 'America/Chicago')::date + 1
);
drop policy if exists "signed in players can read reset vote" on public.reset_votes;
create policy "signed in players can read reset vote" on public.reset_votes for select to authenticated using (auth.jwt()->>'is_anonymous' is distinct from 'true');
drop policy if exists "signed in users can read quest ideas" on public.quest_ideas;
create policy "signed in users can read quest ideas" on public.quest_ideas for select to authenticated using (true);
revoke all on public.quest_ideas from anon;
revoke insert,update,delete on public.quest_ideas from authenticated;
grant select on public.quest_ideas to authenticated;

create or replace function public.xp_recipient(p_assigner text,p_date date) returns text
language sql immutable set search_path = '' as $$
  select (array['jordon','justin','raul','lyle']::text[])[((array_position(array['jordon','justin','raul','lyle']::text[],p_assigner)+((p_date-date '2025-01-06')%3+3)%3)%4)+1];
$$;

create or replace function public.attest_quest(p_quest_id uuid,p_bonus_done boolean[]) returns void
language plpgsql security definer set search_path = '' as $$
declare q public.quests; v_player text; v_bonuses jsonb; i integer; v_today date := (now() at time zone 'America/Chicago')::date;
begin
  v_player:=public.current_xp_player();
  select * into q from public.quests where id=p_quest_id for update;
  if not found or q.status<>'complete' or q.quest_date>v_today then raise exception 'This quest is not ready to attest.'; end if;
  if not exists(select 1 from public.players where id=v_player and id not in(q.assigner,q.assignee)) then raise exception 'Only an eligible witness can attest this quest.'; end if;
  if coalesce(array_length(p_bonus_done,1),0)<>jsonb_array_length(q.bonuses) then raise exception 'Bonus selections do not match this quest.'; end if;
  v_bonuses:='[]'::jsonb;
  if jsonb_array_length(q.bonuses)>0 then
    for i in 0..jsonb_array_length(q.bonuses)-1 loop
      v_bonuses:=v_bonuses||jsonb_build_array(jsonb_set(q.bonuses->i,'{done}',to_jsonb(coalesce(p_bonus_done[i+1],false))));
    end loop;
  end if;
  update public.quests set status='awarded',bonuses=v_bonuses where id=p_quest_id;
end; $$;

create or replace function public.approve_reset() returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_player text; v_approvals text[];
begin
  v_player:=public.current_xp_player();
  select approvals into v_approvals from public.reset_votes where id=true for update;
  if not found then raise exception 'There is no reset vote in progress.'; end if;
  if v_player=any(v_approvals) then raise exception 'This login has already approved.'; end if;
  v_approvals:=array_append(v_approvals,v_player);
  if cardinality(v_approvals)=(select count(*) from public.players) then
    delete from public.quests;
    delete from public.reset_votes where id=true;
    return true;
  end if;
  update public.reset_votes set approvals=v_approvals where id=true;
  return false;
end; $$;

create or replace function public.submit_quest_idea(p_title text,p_detail text default '',p_guest_name text default null)
returns public.quest_ideas language plpgsql security definer set search_path = '' as $$
declare v_category text; v_name text; v_player text; v_idea public.quest_ideas;
begin
  if auth.uid() is null then raise exception 'Sign in before submitting an idea.'; end if;
  if length(trim(coalesce(p_title,''))) not between 1 and 90 then raise exception 'Idea must be between 1 and 90 characters.'; end if;
  if char_length(coalesce(p_detail,''))>240 then raise exception 'Idea details must be 240 characters or fewer.'; end if;
  if coalesce(auth.jwt()->>'is_anonymous','false')='true' then
    v_category:='guests'; v_name:=trim(coalesce(p_guest_name,''));
    if char_length(v_name) not between 1 and 40 then raise exception 'Enter the name you want shown with your guest idea.'; end if;
    if (select count(*) from public.quest_ideas where category='guests' and created_at>now()-interval '1 day')>=20 then raise exception 'The guest idea board is full for today. Try again tomorrow.'; end if;
  else
    v_player:=public.current_xp_player();
    select name into v_name from public.players where id=v_player;
    v_category:='players';
  end if;
  if exists(select 1 from public.quest_ideas where submitter_auth_id=auth.uid() and created_at>now()-interval '15 seconds') then raise exception 'Please wait a few seconds before sending another idea.'; end if;
  insert into public.quest_ideas(category,submitted_by,submitter_auth_id,title,detail)
  values(v_category,v_name,auth.uid(),trim(p_title),left(coalesce(p_detail,''),240)) returning * into v_idea;
  return v_idea;
end; $$;

alter view public.leaderboard set (security_invoker=false);
grant select on public.leaderboard to authenticated;
revoke all on function public.xp_recipient(text,date) from public,anon;
revoke all on function public.attest_quest(uuid,boolean[]) from public,anon;
revoke all on function public.submit_quest_idea(text,text,text) from public,anon;
grant execute on function public.xp_recipient(text,date) to authenticated;
grant execute on function public.attest_quest(uuid,boolean[]) to authenticated;
grant execute on function public.submit_quest_idea(text,text,text) to authenticated;

do $$ begin
  if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='quest_ideas') then alter publication supabase_realtime add table public.quest_ideas; end if;
end $$;
commit;
