# Create the shared XP Club backend

This project needs a Supabase project before its logins and game data can sync.

1. Create a Supabase project and open its **SQL Editor**.
2. Run [`schema.sql`](schema.sql).
3. In **Authentication → Users**, create one email/password login for each player. Keep the email and password private and give each person their own login.
4. After adding the three accounts, disable **Allow new users to sign up** in the Auth settings. Existing accounts can still sign in; uninvited visitors cannot register themselves.
5. Link the accounts to the player names. Replace the three email placeholders, then run:

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
```

6. Set the project URL and publishable key from the Supabase dashboard in `supabase-config.js`. The publishable key is designed for browser use; **never** use the `service_role` key in the website.

The database enforces the daily rotation, unique giver and recipient per day, completion by the assigned player, attestation by the third player, and unanimous reset approval. Browser code cannot award XP or reset the game without the matching authenticated account.
