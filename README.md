# XP Club

A Spanish-class side-quest game for Jordon, Justin, and Raul. The UI is a static site; Supabase provides shared data, authentication, and database-enforced game rules.

## Set up Supabase

Follow [`supabase/SETUP.md`](supabase/SETUP.md): create a project, run [`supabase/schema.sql`](supabase/schema.sql), create three separate email/password accounts, and link each account to one player.

Set the project URL and **publishable** key in `supabase-config.js`. That file is served to browsers and can be public. Never use a `service_role` key, database password, or other secret there.

## Publish with GitHub Pages

Add the project files to a GitHub repository and push them to `main`. Then open **Settings → Pages** and select **GitHub Actions** as the publishing source. The included workflow deploys the static files on each push to `main`.

GitHub Free Pages requires a public repository. The site URL and browser code will be public. Supabase Row Level Security and server-side functions protect game data and player actions; the browser publishable key is not a secret.
