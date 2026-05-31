# StyleMyShack

An interior design recommendation tool for your cabin — organized room by room.

## Live Site

Deployed via Vercel. Connect your GitHub repo at [vercel.com](https://vercel.com) — it auto-detects the static site with no build configuration needed.

## Stack

- Vanilla HTML/CSS/JS — no framework, no build step
- [Supabase](https://supabase.com) — PostgreSQL database + file storage
- [Vercel](https://vercel.com) — static site hosting

## First-Time Setup

### 1. Run the database schema

In your Supabase dashboard go to **SQL Editor → New query**, paste the contents of `schema.sql`, and run it. This creates all tables, seeds the four rooms, and sets up the `room-photos` storage bucket.

### 2. Deploy to Vercel

Import the GitHub repo in Vercel. No build settings are required — Vercel serves the static files directly. Every push to `master` redeploys automatically.

## How It Works

- **Home page** (`index.html`) — shows all rooms as cards with status indicators and cover photos
- **Room page** (`room.html?id=<room-id>`) — shows the photo gallery and designer recommendations for that room
- Room definitions and cabin name live in Supabase (`rooms` and `settings` tables)
- Recommendations (paint, flooring, lighting, furniture, notes, color palettes) are stored in the `recommendations` table
- Photos are uploaded directly to Supabase Storage (`room-photos` bucket)

## Color Palettes

Each room supports multiple named color palettes. Within the inline swatch editor, a **Benjamin Moore / Sherwin Williams** toggle switches the color search between two catalogs:

| Brand | Colors | Number format |
|-------|--------|---------------|
| Benjamin Moore | 4,118 | `OC-17`, `HC-172`, `2167-50`, etc. |
| Sherwin Williams | 1,526 | `SW 7015`, `SW 6119`, etc. |

Search by color name or number — clicking a result fills the swatch color and auto-formats the label. The color picker also accepts any arbitrary hex color independent of the catalog search.

## Designer Workflow

1. Open the live site and navigate to a room
2. Click **Edit**
3. Upload photos, fill in recommendations, and build color palettes using the Benjamin Moore or Sherwin Williams color search
4. Click **Save** — changes persist immediately to Supabase
5. Click **Done** to exit edit mode

## Adding Rooms

Insert a new row into the `rooms` table in Supabase (set `id`, `name`, `description`, `emoji`, and `sort_order`), then insert a matching row into `recommendations` with that `room_id`.

## Rooms

| Room | ID |
|------|----|
| Living Room | `living-room` |
| Kitchen | `kitchen` |
| Bedroom | `bedroom` |
| Bathroom | `bathroom` |

## Testing

End-to-end tests use [Playwright](https://playwright.dev). All Supabase calls are intercepted with mock data so no live credentials are needed.

```bash
npx playwright test          # run all tests
npx playwright test --ui     # open interactive UI
```

Test files live in `tests/`. Shared fixtures and Supabase mock helpers are in `tests/fixtures.js`.

## Configuration

Supabase credentials live in `js/supabase.js`. The anon key is safe to expose in frontend code — Supabase Row Level Security controls data access.
