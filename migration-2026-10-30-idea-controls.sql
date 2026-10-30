-- Per-account quest idea moderation controls. Apply in the Supabase SQL Editor.
begin;

create table if not exists public.quest_idea_hides (
  hider_auth_id uuid not null references auth.users(id) on delete cascade,
  idea_id uuid not null references public.quest_ideas(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (hider_auth_id, idea_id)
);
alter table public.quest_idea_hides enable row level security;
drop policy if exists "users can read their own hidden ideas" on public.quest_idea_hides;
create policy "users can read their own hidden ideas" on public.quest_idea_hides
  for select to authenticated using (hider_auth_id = auth.uid());
revoke all on public.quest_idea_hides from anon, authenticated;
grant select on public.quest_idea_hides to authenticated;

create or replace function public.delete_quest_idea(p_idea_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before deleting an idea.'; end if;
  delete from public.quest_ideas where id=p_idea_id and submitter_auth_id=auth.uid();
  if not found then raise exception 'You can only delete an idea you submitted.'; end if;
end; $$;

create or replace function public.hide_quest_idea(p_idea_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before hiding an idea.'; end if;
  if not exists(select 1 from public.quest_ideas where id=p_idea_id and submitter_auth_id<>auth.uid()) then
    raise exception 'You can only hide someone else’s idea.';
  end if;
  insert into public.quest_idea_hides(hider_auth_id,idea_id) values(auth.uid(),p_idea_id)
  on conflict (hider_auth_id,idea_id) do nothing;
end; $$;

create or replace function public.unhide_quest_idea(p_idea_id uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if auth.uid() is null then raise exception 'Sign in before restoring an idea.'; end if;
  delete from public.quest_idea_hides where hider_auth_id=auth.uid() and idea_id=p_idea_id;
end; $$;

revoke all on function public.delete_quest_idea(uuid) from public, anon;
revoke all on function public.hide_quest_idea(uuid) from public, anon;
revoke all on function public.unhide_quest_idea(uuid) from public, anon;
grant execute on function public.delete_quest_idea(uuid) to authenticated;
grant execute on function public.hide_quest_idea(uuid) to authenticated;
grant execute on function public.unhide_quest_idea(uuid) to authenticated;
commit;
