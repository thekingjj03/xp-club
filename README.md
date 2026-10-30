# XP Club

A Spanish-class side-quest game for Jordon, Justin, Raul, and Lyle. Supabase provides shared quests, individual logins, XP, and database-enforced game rules.

## Set up Supabase

Follow [SETUP.md](SETUP.md). For a new database, run [schema.sql](schema.sql); for the existing XP Club database, run [migration-2026-10-29.sql](migration-2026-10-29.sql). Set the Supabase project URL and publishable key in supabase-config.js. Never put a service-role key or database password in the public site.

## Hosting

The GitHub Actions workflow in .github/workflows/deploy.yml publishes the static site to GitHub Pages. The site and player display names are public. Supabase authentication and database rules restrict quest actions. Guest sessions can view the all-time leaderboard and recent quests, and can submit named ideas.
