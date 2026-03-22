// ─── State ────────────────────────────────────────────────────────────────
let roomData = null;
let allRooms = null;
let bmColors = [];
let editMode = false;

// ─── IndexedDB (photos — no size limit, no base64 bloat) ──────────────────
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

async function loadPhotoBlobs(roomId, tab) {
  try {
    const db = await getDB();
    return await new Promise((resolve, reject) => {
      const req = db.transaction('photos', 'readonly')
                    .objectStore('photos')
                    .get(`${roomId}_${tab}`);
      req.onsuccess = () => resolve(req.result || []);
      req.onerror   = () => reject(req.error);
    });
  } catch { return []; }
}

async function savePhotoBlobs(roomId, tab, blobs) {
  try {
    const db = await getDB();
    await new Promise((resolve, reject) => {
      const req = db.transaction('photos', 'readwrite')
                    .objectStore('photos')
                    .put(blobs, `${roomId}_${tab}`);
      req.onsuccess = () => resolve();
      req.onerror   = () => reject(req.error);
    });
  } catch (e) {
    console.error('Photo save failed:', e);
    showBanner('Storage error — photo may not have saved.');
  }
}

// ─── localStorage (notes & swatches — small text only) ────────────────────
function recsKey(roomId) { return `recs_${roomId}`; }

function loadRecs(roomId, defaults) {
  const stored = localStorage.getItem(recsKey(roomId));
  return stored ? JSON.parse(stored) : defaults;
}

function persistRecs() {
  localStorage.setItem(recsKey(roomData.id), JSON.stringify(roomData.recommendations));
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');

  const [roomsRes, colorsRes] = await Promise.all([
    fetch('data/rooms.json'),
    fetch('data/bm-colors.json')
  ]);

  const data = await roomsRes.json();
  bmColors   = await colorsRes.json();
  allRooms   = data.rooms;

  roomData = allRooms.find(r => r.id === roomId);
  if (!roomData) {
    document.getElementById('room-title').textContent = 'Room not found';
    return;
  }

  // Notes/swatches from localStorage; photos from IndexedDB
  roomData.recommendations = loadRecs(roomId, roomData.recommendations);
  roomData.recommendations.swatches = roomData.recommendations.swatches || [];

  document.title = roomData.name + ' — StyleMyShack';
  document.getElementById('room-title').textContent       = roomData.name;
  document.getElementById('room-description').textContent = roomData.description;

  await Promise.all([
    renderGallery('actual'),
    renderGallery('model3d'),
    renderGallery('floorPlan')
  ]);

  renderSwatches();
  renderRecommendations();
  setupTabs();
  setupEditToggle();
  setupSwatchSearch();
  setupUploadListeners();
}

// ─── Gallery ──────────────────────────────────────────────────────────────
const GALLERY_ICONS = {
  actual:    { icon: '📷', empty: 'No actual photos yet.' },
  model3d:   { icon: '🏗️',  empty: 'No 3D model photos yet.' },
  floorPlan: { icon: '📐', empty: 'No floor plan uploaded yet.' }
};

async function renderGallery(tab) {
  const container = document.getElementById('gallery-' + tab);
  const meta      = GALLERY_ICONS[tab];
  const blobs     = await loadPhotoBlobs(roomData.id, tab);

  if (blobs.length === 0) {
    container.innerHTML = `
      <div class="photo-placeholder">
        <span class="icon">${meta.icon}</span>
        <p>${meta.empty}${editMode ? ' Use the button below to upload.' : ''}</p>
      </div>`;
    return;
  }

  // Create object URLs for display (revoked when replaced)
  let urls      = blobs.map(b => URL.createObjectURL(b));
  let activeIdx = 0;

  function build() {
    container.innerHTML = `
      <div class="photo-main-wrap">
        <img class="photo-main" src="${urls[activeIdx]}" alt="Photo ${activeIdx + 1}" />
        ${editMode ? `<button class="photo-main-delete" data-idx="${activeIdx}">Delete</button>` : ''}
      </div>
      ${urls.length > 1 ? `
        <div class="photo-thumbs">
          ${urls.map((u, i) => `
            <div class="photo-thumb-wrap">
              <img class="photo-thumb ${i === activeIdx ? 'active' : ''}"
                   src="${u}" alt="Thumbnail ${i + 1}" data-idx="${i}" />
              ${editMode ? `<button class="photo-delete-btn" data-idx="${i}" title="Delete">✕</button>` : ''}
            </div>`).join('')}
        </div>` : ''}
    `;

    container.querySelectorAll('.photo-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => { activeIdx = +thumb.dataset.idx; build(); });
    });

    container.querySelectorAll('.photo-delete-btn, .photo-main-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const idx = +btn.dataset.idx;
        URL.revokeObjectURL(urls[idx]);
        urls.splice(idx, 1);
        blobs.splice(idx, 1);
        await savePhotoBlobs(roomData.id, tab, blobs);
        if (blobs.length === 0) {
          renderGallery(tab);   // show empty state
        } else {
          activeIdx = Math.min(activeIdx, blobs.length - 1);
          build();
        }
      });
    });
  }

  build();
}

// ─── Upload ───────────────────────────────────────────────────────────────
function setupUploadListeners() {
  document.querySelectorAll('.photo-file-input').forEach(input => {
    input.addEventListener('change', async () => {
      const tab   = input.dataset.tab;
      const files = Array.from(input.files);
      if (!files.length) return;

      const existing = await loadPhotoBlobs(roomData.id, tab);
      await savePhotoBlobs(roomData.id, tab, existing.concat(files));
      input.value = '';
      renderGallery(tab);
    });
  });
}

function setUploadVisibility(visible) {
  ['actual', 'model3d', 'floorPlan'].forEach(tab => {
    const wrap = document.getElementById('upload-wrap-' + tab);
    if (wrap) wrap.style.display = visible ? '' : 'none';
  });
}

// ─── Tabs ─────────────────────────────────────────────────────────────────
function setupTabs() {
  document.querySelectorAll('.photo-tab').forEach(tab => {
    tab.addEventListener('click', () => {
      document.querySelectorAll('.photo-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.photo-content').forEach(c => c.classList.remove('active'));
      tab.classList.add('active');
      document.getElementById('tab-' + tab.dataset.tab).classList.add('active');
    });
  });
}

// ─── BM Color Search ──────────────────────────────────────────────────────
function setupSwatchSearch() {
  const input   = document.getElementById('swatch-search');
  const results = document.getElementById('swatch-results');

  input.addEventListener('input', () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.classList.remove('open'); results.innerHTML = ''; return; }

    const matches = bmColors
      .filter(c => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q))
      .slice(0, 40);

    if (matches.length === 0) {
      results.innerHTML = `<div class="swatch-result-item" style="color:var(--stone);cursor:default">No colors found</div>`;
      results.classList.add('open');
      return;
    }

    const swatches = roomData.recommendations.swatches;
    results.innerHTML = matches.map(c => {
      const already = swatches.some(s => s.number === c.number);
      const full    = swatches.length >= 4 && !already;
      return `
        <div class="swatch-result-item ${already || full ? 'disabled' : ''}"
             data-number="${escHtml(c.number)}">
          <div class="swatch-result-dot" style="background:${c.hex}"></div>
          <span class="swatch-result-name">${escHtml(c.name)}</span>
          <span class="swatch-result-num">${escHtml(c.number)}</span>
        </div>`;
    }).join('');

    results.querySelectorAll('.swatch-result-item:not(.disabled)').forEach(item => {
      item.addEventListener('click', () => {
        const color = bmColors.find(c => c.number === item.dataset.number);
        if (!color) return;
        roomData.recommendations.swatches.push(color);
        persistRecs();
        input.value = '';
        results.classList.remove('open');
        results.innerHTML = '';
        renderSwatches();
      });
    });

    results.classList.add('open');
  });

  document.addEventListener('click', e => {
    if (!e.target.closest('.swatch-search-wrap')) results.classList.remove('open');
  });
}

// ─── Swatch Grid ──────────────────────────────────────────────────────────
function renderSwatches() {
  const grid     = document.getElementById('swatch-grid');
  const hint     = document.getElementById('swatch-hint');
  const swatches = roomData.recommendations.swatches || [];
  const count    = swatches.length;

  hint.textContent = editMode
    ? (count >= 4 ? 'Full — remove a swatch to add another' : `${count}/4 selected`)
    : (count === 0 ? 'No colors selected yet' : `${count} color${count !== 1 ? 's' : ''} selected`);

  let html = '';
  for (let i = 0; i < 4; i++) {
    if (i < count) {
      const c      = swatches[i];
      const light  = isLight(c.hex);
      const nameBg = light ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.45)';
      const numBg  = light ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.30)';
      html += `
        <div class="swatch-cell">
          <div class="swatch-cell-color" style="background:${c.hex}"></div>
          ${editMode ? `<button class="swatch-remove-btn" data-idx="${i}" title="Remove">✕</button>` : ''}
          <div class="swatch-cell-info">
            <span class="swatch-cell-name" style="background:${nameBg}">${escHtml(c.name)}</span>
            <span class="swatch-cell-num"  style="background:${numBg}">${escHtml(c.number)}</span>
          </div>
        </div>`;
    } else {
      html += editMode && count < 4
        ? `<div class="swatch-cell-empty addable" title="Search above to add a color">+</div>`
        : `<div class="swatch-cell-empty"></div>`;
    }
  }

  grid.innerHTML = html;

  grid.querySelectorAll('.swatch-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      roomData.recommendations.swatches.splice(+btn.dataset.idx, 1);
      persistRecs();
      renderSwatches();
    });
  });
}

function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

// ─── Recommendations ──────────────────────────────────────────────────────
function renderRecommendations() {
  const body = document.getElementById('rec-body');
  if (editMode) {
    body.innerHTML = buildEditForm(roomData.recommendations);
    body.querySelector('#save-recs-btn').addEventListener('click', saveRecommendations);
  } else {
    body.innerHTML = buildViewPanel(roomData.recommendations);
  }
}

function buildViewPanel(rec) {
  const paint = rec.paint || {};
  const field = (label, val) => `
    <div class="rec-section">
      <div class="rec-section-label">${label}</div>
      ${val ? `<div class="rec-text">${escHtml(val)}</div>`
            : `<span class="rec-empty">No ${label.toLowerCase()} yet.</span>`}
    </div>`;
  return field('Paint Notes', paint.notes)
       + field('Flooring', rec.flooring)
       + field('Lighting', rec.lighting)
       + field('Furniture &amp; Layout', rec.furniture)
       + field('General Notes', rec.generalNotes);
}

function buildEditForm(rec) {
  const paint = rec.paint || {};
  const area  = (id, label, val, ph, rows = 3) => `
    <div class="rec-section">
      <div class="rec-section-label">${label}</div>
      <textarea class="edit-field" id="${id}" rows="${rows}"
        placeholder="${ph}">${escHtml(val || '')}</textarea>
    </div>`;
  return area('paint-notes',  'Paint Notes',         paint.notes,    'e.g. Eggshell on walls, semi-gloss on trim…')
       + area('rec-flooring', 'Flooring',             rec.flooring,   'e.g. Wide-plank white oak hardwood…')
       + area('rec-lighting', 'Lighting',             rec.lighting,   'e.g. Warm Edison bulbs, antler chandelier…')
       + area('rec-furniture','Furniture &amp; Layout',rec.furniture,  'e.g. Sectional sofa facing the fireplace…')
       + area('rec-general',  'General Notes',        rec.generalNotes,'Any other recommendations…', 4)
       + `<button class="save-btn" id="save-recs-btn">Save</button>`;
}

// ─── Save ─────────────────────────────────────────────────────────────────
function saveRecommendations() {
  const body = document.getElementById('rec-body');
  roomData.recommendations = {
    swatches:     roomData.recommendations.swatches || [],
    paint:        { notes: body.querySelector('#paint-notes')?.value  || '' },
    flooring:     body.querySelector('#rec-flooring')?.value  || '',
    lighting:     body.querySelector('#rec-lighting')?.value  || '',
    furniture:    body.querySelector('#rec-furniture')?.value || '',
    generalNotes: body.querySelector('#rec-general')?.value   || ''
  };
  persistRecs();
  showBanner('Saved!');
  renderRecommendations();
}

// ─── Edit Toggle ──────────────────────────────────────────────────────────
function setupEditToggle() {
  document.getElementById('edit-toggle').addEventListener('click', () => {
    if (editMode) exitEditMode(); else enterEditMode();
  });
}

function enterEditMode() {
  editMode = true;
  document.getElementById('edit-toggle').textContent = 'Done';
  document.getElementById('edit-toggle').classList.add('active');
  document.getElementById('swatch-search-wrap').style.display = '';
  setUploadVisibility(true);
  renderGallery('actual');
  renderGallery('model3d');
  renderGallery('floorPlan');
  renderSwatches();
  renderRecommendations();
}

function exitEditMode() {
  editMode = false;
  document.getElementById('edit-toggle').textContent = 'Edit';
  document.getElementById('edit-toggle').classList.remove('active');
  document.getElementById('swatch-search-wrap').style.display = 'none';
  document.getElementById('swatch-search').value = '';
  document.getElementById('swatch-results').classList.remove('open');
  setUploadVisibility(false);
  renderGallery('actual');
  renderGallery('model3d');
  renderGallery('floorPlan');
  renderSwatches();
  renderRecommendations();
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function showBanner(msg) {
  const banner = document.getElementById('save-banner');
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
