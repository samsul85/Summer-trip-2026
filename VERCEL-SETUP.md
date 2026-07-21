# Deploying the live app on Vercel

This branch (`vercel-app`) turns the calendar into a **live, editable app**: click a day, add an event, and it saves to a database so the whole family sees it on refresh. Reading is open to everyone; **adding/deleting requires a family passcode.**

## What's here
- `index.html` — the interactive page (fetches events, add/delete via the API).
- `api/events.js` — serverless function: `GET` list, `POST` add, `DELETE` remove.
- `package.json` — declares the `@vercel/postgres` dependency.

## One-time setup (your part)

1. **Create a Vercel account** at [vercel.com](https://vercel.com) and sign in with GitHub.
2. **Import the repo:** New Project → import `samsul85/Summer-trip-2026`.
   - Set the **Production Branch** to `vercel-app` (Settings → Git), or merge this branch into `main` first and deploy `main`.
   - Framework preset: **Other**. No build command needed.
3. **Add a database:** in the project, go to **Storage → Create → Postgres** (Neon). Accept the defaults and connect it to the project. Vercel injects the `POSTGRES_URL` env var automatically — no copying keys.
4. **Set the edit passcode:** Project → **Settings → Environment Variables** → add
   - Name: `EDIT_PASSCODE`
   - Value: a passcode you share only with family (e.g. a short phrase)
   - Apply to **Production** (and Preview if you want).
5. **Redeploy** (Deployments → ⋯ → Redeploy) so the env var takes effect.

That's it. Your app will be live at `https://<project>.vercel.app`. Share the URL; family enters the passcode once (it's remembered in their browser) to add events.

## Notes
- The `events` table is created automatically on first API call — nothing to run by hand.
- The passcode is a light gate to keep random visitors from editing a public page. It's not high-security; don't reuse a sensitive password.
- To use a custom domain later: Vercel → Settings → Domains.
- The original static GitHub Pages site on `main` is unaffected by this branch.
