# Create the shared XP Club backend

This project needs a Supabase project before its logins and game data can sync.

1. Create a Supabase project and open its **SQL Editor**.
2. For a new database, run [`schema.sql`](schema.sql). For the existing XP Club database, run [`migration-2026-10-29.sql`](migration-2026-10-29.sql) once instead.
3. In **Authentication → Users**, create one email/password login for Jordon, Justin, Raul, and Lyle. Keep emails and passwords private; each person should have their own login.
4. Keep ordinary email/password sign-ups disabled; the four player accounts are created by an administrator. Guest mode uses Supabase's separate **Allow anonymous sign-ins** setting, which must be enabled for the guest button to work.
5. Link the accounts to the player names. Replace the four email placeholders, then run:

```sql
insert into public.player_accounts (player_id, auth_user_id)
select 'jordon', id from auth.users where email = 'JORDON_EMAIL'
on conflict (player_id) do update set auth_user_id = excluded.auth_user_id;

insert into public.player_accounts (player_id, auth_user_id)
select 'justin', id from auth.users where email = 'JUSTIN_EMAIL'
on conflict (player_id) do update set auth_user_id = excluded.auth_user_id;

insert into public.player_accounts (player_id, auth_user_id)
select 'raul', id from auth.users where email = 'RAUL_EMAIL'
on conflict (player_id) do update set auth_user_id = excluded.auth_user_id;

insert into public.player_accounts (player_id, auth_user_id)
select 'lyle', id from auth.users where email = 'LYLE_EMAIL'
on conflict (player_id) do update set auth_user_id = excluded.auth_user_id;
```

6. Set the project URL and publishable key from the Supabase dashboard in `supabase-config.js`. The publishable key is designed for browser use; **never** use the `service_role` key in the website.

The database enforces a rotating no-self-assignment cycle, one giver and recipient per player each day, completion by the assigned player, attestation by either eligible witness, and unanimous reset approval. Guest sessions can read the aggregate leaderboard and quests dated yesterday through tomorrow, and can submit named ideas into the Guests category. They cannot create or change quests, attest, vote on resets, or change player accounts.
