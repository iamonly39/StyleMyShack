# StyleMyShack

An interior design recommendation tool for your cabin — organized room by room.

## Live Site

Deployed via GitHub Pages. Enable Pages in your repo settings (Settings → Pages → Source: GitHub Actions).

## How It Works

- **Home page** (`index.html`) — shows all rooms as cards with status indicators
- **Room page** (`room.html?id=<room-id>`) — shows photos and designer recommendations per room
- All data lives in `data/rooms.json` — edit this file to update rooms and recommendations
- Photos are stored in `images/rooms/<room-id>/`

## Adding Photos

Drop photos into the appropriate room folder, then reference them in `data/rooms.json`:

```json
"photos": {
  "floorPlan": ["images/rooms/living-room/floor-plan.jpg"],
  "model3d":   ["images/rooms/living-room/3d-01.jpg", "images/rooms/living-room/3d-02.jpg"],
  "actual":    ["images/rooms/living-room/actual-01.jpg"]
}
```

Push to `main` and the site redeploys automatically.

## Designer Workflow

1. Open the live site and navigate to a room
2. Click **Edit** and enter the designer password
3. Fill in recommendations (paint colors, flooring, lighting, furniture, notes)
4. Click **Save Recommendations** — this downloads an updated `rooms.json`
5. Replace `data/rooms.json` in the repo with the downloaded file and push

> The designer password is set in `js/room.js` (`DESIGNER_PASSWORD`). Change it before sharing the site.

## Adding Rooms

Add a new entry to the `rooms` array in `data/rooms.json` with a unique `id`, then create the matching folder in `images/rooms/`.

## Rooms

| Room | ID |
|------|----|
| Living Room | `living-room` |
| Kitchen | `kitchen` |
| Bedroom | `bedroom` |
| Bathroom | `bathroom` |
