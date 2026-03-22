# StyleMyShack — HTML Prototype Plan

## Goal
A static HTML/CSS/JS website deployed via GitHub Pages that allows an interior designer to browse cabin rooms and add design recommendations. Since GitHub Pages is static (no server), recommendations will be managed differently than a dynamic app.

---

## Architecture Decision: Static-First Prototype

Since GitHub Pages serves only static files, there is **no backend**. Recommendations are managed via:
- **Editable JSON data file** (`data/rooms.json`) checked into the repo
- Designer clones the repo (or uses GitHub's web editor) to update the JSON, then pushes — Pages auto-deploys
- Alternatively, a future phase can add a small backend (Netlify Functions, Supabase, etc.)

This is the right approach for a prototype — fast to build, free to host, zero infrastructure.

---

## File Structure

```
StyleMyShack/
├── .github/
│   └── workflows/
│       └── pages.yml          # GitHub Actions: deploy to Pages on push to main
├── index.html                 # Home page — room gallery
├── room.html                  # Room detail page (reused for all rooms via ?id=)
├── css/
│   └── styles.css             # All styles
├── js/
│   ├── main.js                # Home page logic (render room cards from JSON)
│   └── room.js                # Room detail page logic
├── data/
│   └── rooms.json             # Room data + recommendations (source of truth)
├── images/
│   └── rooms/
│       ├── living-room/       # Photos for each room (committed to repo)
│       ├── kitchen/
│       ├── bedroom/
│       └── bathroom/
└── README.md
```

---

## Data Model (`data/rooms.json`)

```json
{
  "rooms": [
    {
      "id": "living-room",
      "name": "Living Room",
      "description": "Main gathering space",
      "photos": {
        "floorPlan": "images/rooms/living-room/floor-plan.jpg",
        "model3d": ["images/rooms/living-room/3d-01.jpg"],
        "actual": ["images/rooms/living-room/actual-01.jpg"]
      },
      "recommendations": {
        "paint": {
          "primary": "",
          "accent": "",
          "trim": "",
          "notes": ""
        },
        "flooring": "",
        "lighting": "",
        "furniture": "",
        "generalNotes": ""
      }
    }
  ]
}
```

---

## Pages

### `index.html` — Room Gallery
- Header with cabin name and tagline
- Grid of room cards (pulled from `rooms.json`)
- Each card: room photo thumbnail, room name, status indicator (has recommendations / pending)
- Clicking a card → `room.html?id=living-room`

### `room.html` — Room Detail
- Back navigation
- Room name + description
- **Photo Gallery** with tabs:
  - "Floor Plan" tab
  - "3D Model" tab (multiple photos, carousel)
  - "Actual Photos" tab (multiple photos, carousel)
- **Recommendations Panel** below photos:
  - Paint section: Primary color, Accent color, Trim color, Notes
  - Each other element (flooring, lighting, furniture) as a text block
  - General notes textarea
  - All fields are **read-only display** in the prototype (populated from JSON)

---

## GitHub Actions Workflow (`.github/workflows/pages.yml`)

```yaml
name: Deploy to GitHub Pages
on:
  push:
    branches: [main]
permissions:
  contents: read
  pages: write
  id-token: write
jobs:
  deploy:
    environment:
      name: github-pages
      url: ${{ steps.deployment.outputs.page_url }}
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/configure-pages@v5
      - uses: actions/upload-pages-artifact@v3
        with:
          path: '.'
      - uses: actions/deploy-pages@v4
        id: deployment
```

---

## Styling Approach
- CSS custom properties for a warm cabin color palette (creams, warm grays, wood tones)
- CSS Grid for the room card layout
- Simple tab UI for the photo gallery (pure CSS + minimal JS)
- Mobile-responsive
- No external CSS framework (keeps it lightweight and dependency-free)

---

## Implementation Steps

1. Create `.github/workflows/pages.yml` — GitHub Actions deploy workflow
2. Create `data/rooms.json` — with 4 rooms, placeholder photos, empty recommendations
3. Create `css/styles.css` — full styling with cabin aesthetic
4. Create `index.html` — room gallery home page
5. Create `js/main.js` — fetch rooms.json, render room cards
6. Create `room.html` — room detail template
7. Create `js/room.js` — parse ?id= param, render room data + recommendations
8. Create placeholder `images/` directory structure with `.gitkeep` files
9. Update `README.md` with setup instructions
10. Commit and push to `claude/interior-design-recommendations-viekf`

---

## Future Phases (Post-Prototype)
- Add a CMS layer (Netlify CMS, Decap CMS) so designer can edit via UI without touching code
- Or migrate to Next.js + Supabase for a full dynamic app
- Add photo upload capability
- Add color swatch previews (pull from color APIs like The Color API)
