// ─── IndexedDB helpers ────────────────────────────────────────────────────
let _db = null;

async function getDB() {
  if (_db) return _db;
  return new Promise((resolve, reject) => {
    const req = indexedDB.open('StyleMyShack', 1);
    req.onupgradeneeded = e => e.target.result.createObjectStore('photos');
    req.onsuccess = e => { _db = e.target.result; resolve(_db); };
    req.onerror   = () => reject(req.error);
  });
}

async function idbGet(key) {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('photos', 'readonly').objectStore('photos').get(key);
      req.onsuccess = () => resolve(req.result ?? null);
      req.onerror   = () => reject(req.error);
    });
  } catch { return null; }
}

async function loadRoomThumbBlob(roomId) {
  const pinned = await idbGet(`${roomId}_pinned`);
  if (pinned) return pinned;
  for (const tab of ['actual', 'model3d', 'floorPlan']) {
    const blobs = await idbGet(`${roomId}_${tab}`);
    if (blobs && blobs.length) return blobs[0];
  }
  return null;
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const res = await fetch('data/rooms.json');
  const data = await res.json();

  document.getElementById('cabin-name').textContent = data.cabinName;
  document.title = data.cabinName + ' — StyleMyShack';

  const grid = document.getElementById('room-grid');

  data.rooms.forEach(room => {
    const hasRecs = hasRecommendations(room.recommendations);

    const card = document.createElement('a');
    card.className = 'room-card';
    card.href = `room.html?id=${room.id}`;
    card.innerHTML = `
      <div class="room-card-photo placeholder" id="thumb-${room.id}">${room.emoji}</div>
      <div class="room-card-body">
        <h3>${room.name}</h3>
        <p>${room.description}</p>
        <span class="room-status ${hasRecs ? 'has-recs' : 'pending'}">
          ${hasRecs ? '&#10003; Has recommendations' : '&#9679; Awaiting recommendations'}
        </span>
      </div>
    `;
    grid.appendChild(card);

    // Async-load thumbnail from IndexedDB (pinned photo or first available)
    loadRoomThumbBlob(room.id).then(blob => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const el = document.getElementById('thumb-' + room.id);
      if (!el) return;
      const img = document.createElement('img');
      img.className = 'room-card-photo';
      img.src = url;
      img.alt = room.name;
      el.replaceWith(img);
    });
  });
}

function hasRecommendations(recs) {
  if (!recs) return false;
  const { paint, flooring, lighting, furniture, generalNotes } = recs;
  return (paint.primary || paint.accent || paint.trim || paint.notes || flooring || lighting || furniture || generalNotes);
}

init();
