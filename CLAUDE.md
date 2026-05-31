# StyleMyShack — Project Context

## What It Is

An interior design recommendation tool for a cabin. A designer browses rooms, uploads photos, and fills in recommendations (paint, flooring, lighting, furniture, color swatches). The homeowner views the result as a clean read-only site.

Single-user tool — no auth, no multi-tenancy. RLS policies allow anonymous full access to recommendations/photos and public read access to rooms/settings.

---

## Stack

| Layer | Choice | Reason |
|-------|--------|--------|
| Frontend | Vanilla HTML/CSS/JS | No build step, fast to iterate, no framework overhead |
| Database | Supabase (PostgreSQL) | Real-time persistence, file storage, free tier |
| Hosting | Vercel | Auto-deploys on push to master, zero config for static sites |

### Evolution Note
The project started as a static-file prototype (see `PLAN.md`) with `data/rooms.json` as the data source and GitHub Pages as the host. It was later migrated to Supabase + Vercel for persistent storage and photo upload support. `PLAN.md` reflects the original prototype design — the current architecture is described here.

---

## Key Files

| File | Purpose |
|------|---------|
| `schema.sql` | Full Supabase schema — tables, seed data, RLS policies, storage bucket |
| `js/supabase.js` | Supabase client init (anon key, project URL) |
| `index.html` | Home page — room cards with cover photos and status indicators |
| `room.html` | Room detail — photo gallery tabs + editable recommendations panel |
| `js/main.js` | Home page logic |
| `js/room.js` | Room page logic (parses `?id=` param) |
| `css/styles.css` | All styles — warm cabin palette, CSS custom properties |
| `vercel.json` | Vercel config (static output, no build command) |

---

## Database Schema

Four tables:

- **settings** — key/value store (e.g. `cabin_name`)
- **rooms** — room definitions (`id`, `name`, `description`, `emoji`, `sort_order`)
- **recommendations** — one row per room (`paint_notes`, `flooring`, `lighting`, `furniture`, `general_notes`, `swatches` JSONB)
- **photos** — uploaded photos per room, tab (`actual` | `model3d` | `floorPlan`), with `is_pinned` and `sort_order`

Storage bucket: `room-photos` (public)

### Adding a Room

```sql
INSERT INTO rooms (id, name, description, emoji, sort_order)
VALUES ('my-room', 'My Room', 'Description', '🪑', 5);

INSERT INTO recommendations (room_id) VALUES ('my-room');
```

---

## Decisions Made

### schema.sql is idempotent
**Problem:** Running `schema.sql` twice failed with `ERROR: 42710: policy "public read settings" already exists` because `CREATE POLICY` has no `IF NOT EXISTS`.

**Fix:** Added `DROP POLICY IF EXISTS` for every policy before the `CREATE POLICY` statements. Tables and seed data already used `IF NOT EXISTS` / `ON CONFLICT DO NOTHING`.

**Result:** The schema can now be safely re-run in the Supabase SQL Editor any number of times.

---

## Open Items

- **Vercel URL** — not yet confirmed. Check the Vercel dashboard under the `StyleMyShack` project. Likely `https://style-my-shack.vercel.app` but verify.
- **Supabase credentials** — stored in `js/supabase.js`. If starting fresh, replace with the project URL and anon key from the Supabase dashboard (Settings → API).

---

## Dev Branch

All Claude Code work goes to: `claude/interior-design-recommendations-viekf`

Push command: `git push -u origin claude/interior-design-recommendations-viekf`

---

## Running Locally

No build step. Open `index.html` directly in a browser, or use any static server:

```bash
npx serve .
```

Supabase credentials must be set in `js/supabase.js` for data to load.
