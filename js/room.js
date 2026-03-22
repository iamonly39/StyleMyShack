// ─── State ────────────────────────────────────────────────────────────────
const DESIGNER_PASSWORD = 'cabin2024';   // change this before sharing
let roomData  = null;
let allRooms  = null;
let bmColors  = [];
let editMode  = false;

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

  // Ensure swatches array exists
  roomData.recommendations.swatches = roomData.recommendations.swatches || [];

  document.title = roomData.name + ' — StyleMyShack';
  document.getElementById('room-title').textContent       = roomData.name;
  document.getElementById('room-description').textContent = roomData.description;
  sessionStorage.setItem('cabinName', data.cabinName);

  renderGallery('actual',    roomData.photos.actual,    '📷', 'No actual photos yet. Add photos to images/rooms/' + roomId + '/');
  renderGallery('model3d',   roomData.photos.model3d,   '🏗️', 'No 3D model photos yet.');
  renderGallery('floorPlan', roomData.photos.floorPlan, '📐', 'No floor plan uploaded yet.');

  renderSwatches();
  renderRecommendations();
  setupTabs();
  setupEditToggle();
  setupPasswordModal();
  setupSwatchSearch();
}

// ─── Gallery ──────────────────────────────────────────────────────────────
function renderGallery(type, photos, icon, emptyMsg) {
  const container = document.getElementById('gallery-' + type);
  if (!photos || photos.length === 0) {
    container.innerHTML = `
      <div class="photo-placeholder">
        <span class="icon">${icon}</span>
        <p>${emptyMsg}</p>
      </div>`;
    return;
  }

  let activeIdx = 0;
  function buildGallery() {
    container.innerHTML = `
      <img class="photo-main" src="${photos[activeIdx]}" alt="Room photo ${activeIdx + 1}" />
      ${photos.length > 1 ? `
        <div class="photo-thumbs">
          ${photos.map((src, i) => `
            <img class="photo-thumb ${i === activeIdx ? 'active' : ''}"
                 src="${src}" alt="Thumbnail ${i + 1}"
                 data-idx="${i}" />
          `).join('')}
        </div>` : ''}
    `;
    container.querySelectorAll('.photo-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => {
        activeIdx = parseInt(thumb.dataset.idx);
        buildGallery();
      });
    });
  }
  buildGallery();
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
      .filter(c =>
        c.name.toLowerCase().includes(q) ||
        c.number.toLowerCase().includes(q)
      )
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
        input.value = '';
        results.classList.remove('open');
        results.innerHTML = '';
        renderSwatches();
      });
    });

    results.classList.add('open');
  });

  // Close results when clicking outside
  document.addEventListener('click', e => {
    if (!e.target.closest('.swatch-search-wrap')) {
      results.classList.remove('open');
    }
  });
}

// ─── Swatch Grid ──────────────────────────────────────────────────────────
function renderSwatches() {
  const grid     = document.getElementById('swatch-grid');
  const hint     = document.getElementById('swatch-hint');
  const swatches = roomData.recommendations.swatches || [];
  const count    = swatches.length;

  // Update hint
  if (editMode) {
    hint.textContent = count >= 4 ? 'Full — remove a swatch to add another' : `${count}/4 selected`;
  } else {
    hint.textContent = count === 0 ? 'No colors selected yet' : `${count} color${count !== 1 ? 's' : ''} selected`;
  }

  // Build 4 cells (filled or empty)
  let html = '';
  for (let i = 0; i < 4; i++) {
    if (i < count) {
      const c = swatches[i];
      const textColor = isLight(c.hex) ? 'rgba(0,0,0,0.55)' : null;
      const nameBg    = isLight(c.hex) ? 'rgba(0,0,0,0.18)' : 'rgba(0,0,0,0.45)';
      const numBg     = isLight(c.hex) ? 'rgba(0,0,0,0.12)' : 'rgba(0,0,0,0.30)';
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
      // Empty slot
      if (editMode && count < 4) {
        html += `<div class="swatch-cell-empty addable" title="Search above to add a color">+</div>`;
      } else {
        html += `<div class="swatch-cell-empty"></div>`;
      }
    }
  }

  grid.innerHTML = html;

  // Wire remove buttons
  grid.querySelectorAll('.swatch-remove-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.dataset.idx);
      roomData.recommendations.swatches.splice(idx, 1);
      renderSwatches();
    });
  });
}

// Returns true if a hex color is "light" (needs dark overlay text)
function isLight(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return (r * 299 + g * 587 + b * 114) / 1000 > 155;
}

// ─── Recommendations Render ───────────────────────────────────────────────
function renderRecommendations() {
  const rec  = roomData.recommendations;
  const body = document.getElementById('rec-body');

  if (editMode) {
    body.innerHTML = buildEditForm(rec);
    body.querySelector('#save-recs-btn').addEventListener('click', saveRecommendations);
  } else {
    body.innerHTML = buildViewPanel(rec);
  }
}

function buildViewPanel(rec) {
  const paint = rec.paint || {};
  return `
    <div class="rec-section">
      <div class="rec-section-label">Paint Notes</div>
      ${paint.notes
        ? `<div class="rec-text">${escHtml(paint.notes)}</div>`
        : `<span class="rec-empty">No paint notes yet.</span>`}
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Flooring</div>
      ${rec.flooring
        ? `<div class="rec-text">${escHtml(rec.flooring)}</div>`
        : `<span class="rec-empty">No flooring recommendation yet.</span>`}
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Lighting</div>
      ${rec.lighting
        ? `<div class="rec-text">${escHtml(rec.lighting)}</div>`
        : `<span class="rec-empty">No lighting recommendation yet.</span>`}
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Furniture &amp; Layout</div>
      ${rec.furniture
        ? `<div class="rec-text">${escHtml(rec.furniture)}</div>`
        : `<span class="rec-empty">No furniture recommendation yet.</span>`}
    </div>

    <div class="rec-section">
      <div class="rec-section-label">General Notes</div>
      ${rec.generalNotes
        ? `<div class="rec-text">${escHtml(rec.generalNotes)}</div>`
        : `<span class="rec-empty">No general notes yet.</span>`}
    </div>
  `;
}

function buildEditForm(rec) {
  const paint = rec.paint || {};
  return `
    <div class="rec-section">
      <div class="rec-section-label">Paint Notes</div>
      <textarea class="edit-field" id="paint-notes" rows="3"
        placeholder="e.g. Use eggshell finish on walls, semi-gloss on trim…">${escHtml(paint.notes || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Flooring</div>
      <textarea class="edit-field" id="rec-flooring" rows="3"
        placeholder="e.g. Wide-plank white oak hardwood…">${escHtml(rec.flooring || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Lighting</div>
      <textarea class="edit-field" id="rec-lighting" rows="3"
        placeholder="e.g. Warm Edison bulbs, antler chandelier…">${escHtml(rec.lighting || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Furniture &amp; Layout</div>
      <textarea class="edit-field" id="rec-furniture" rows="3"
        placeholder="e.g. Sectional sofa facing the fireplace…">${escHtml(rec.furniture || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">General Notes</div>
      <textarea class="edit-field" id="rec-general" rows="4"
        placeholder="Any other recommendations…">${escHtml(rec.generalNotes || '')}</textarea>
    </div>

    <button class="save-btn" id="save-recs-btn">Save &amp; Download rooms.json</button>
  `;
}

// ─── Save ─────────────────────────────────────────────────────────────────
function saveRecommendations() {
  const body = document.getElementById('rec-body');

  roomData.recommendations = {
    swatches:     roomData.recommendations.swatches || [],
    paint:        { notes: body.querySelector('#paint-notes')?.value || '' },
    flooring:     body.querySelector('#rec-flooring')?.value  || '',
    lighting:     body.querySelector('#rec-lighting')?.value  || '',
    furniture:    body.querySelector('#rec-furniture')?.value || '',
    generalNotes: body.querySelector('#rec-general')?.value   || ''
  };

  allRooms = allRooms.map(r => r.id === roomData.id ? roomData : r);

  const json = JSON.stringify({
    cabinName: sessionStorage.getItem('cabinName') || 'My Cabin',
    rooms: allRooms
  }, null, 2);

  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'rooms.json';
  a.click();
  URL.revokeObjectURL(url);

  showBanner('Downloaded! Replace data/rooms.json and push to redeploy.');
  renderRecommendations();
}

// ─── Edit Toggle & Password ───────────────────────────────────────────────
function setupEditToggle() {
  document.getElementById('edit-toggle').addEventListener('click', () => {
    if (editMode) {
      exitEditMode();
    } else {
      document.getElementById('password-modal').classList.add('open');
      document.getElementById('password-input').value = '';
      document.getElementById('modal-error').style.display = 'none';
      setTimeout(() => document.getElementById('password-input').focus(), 50);
    }
  });
}

function enterEditMode() {
  editMode = true;
  document.getElementById('edit-toggle').textContent = 'Done';
  document.getElementById('edit-toggle').classList.add('active');
  document.getElementById('swatch-search-wrap').style.display = '';
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
  renderSwatches();
  renderRecommendations();
}

function setupPasswordModal() {
  const modal   = document.getElementById('password-modal');
  const input   = document.getElementById('password-input');
  const error   = document.getElementById('modal-error');
  const confirm = document.getElementById('modal-confirm');
  const cancel  = document.getElementById('modal-cancel');

  function attemptUnlock() {
    if (input.value === DESIGNER_PASSWORD) {
      modal.classList.remove('open');
      enterEditMode();
    } else {
      error.style.display = 'block';
      input.value = '';
      input.focus();
    }
  }

  confirm.addEventListener('click', attemptUnlock);
  cancel.addEventListener('click',  () => modal.classList.remove('open'));
  input.addEventListener('keydown', e => { if (e.key === 'Enter') attemptUnlock(); });
  modal.addEventListener('click',   e => { if (e.target === modal) modal.classList.remove('open'); });
}

// ─── Helpers ──────────────────────────────────────────────────────────────
function showBanner(msg) {
  const banner = document.getElementById('save-banner');
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 4500);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init();
