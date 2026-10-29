# XP Club

A Spanish-class side-quest game for Jordon, Justin, and Raul. Supabase provides shared data, individual logins, and database-enforced game rules.

## Set up the shared backend

Follow [`SETUP.md`](SETUP.md): create a Supabase project, run [`schema.sql`](schema.sql), create one email/password login for each player, and link each login to its player profile. Then put the project URL and **publishable key** in `supabase-config.js`. Never use a `service_role` key or database password in the website.

## Hosting

This public repository includes a GitHub Actions workflow in `.github/workflows/deploy.yml` that deploys the static site to GitHub Pages. Choose **GitHub Actions** as the Pages publishing source in repository Settings. The website source and player display names are public; game actions and data are protected by Supabase authentication and database rules.
