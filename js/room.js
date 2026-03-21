// ─── State ────────────────────────────────────────────────────────────────
const DESIGNER_PASSWORD = 'cabin2024';   // change this before sharing
let roomData = null;
let allRooms = null;
let editMode = false;

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');

  const res = await fetch('data/rooms.json');
  const data = await res.json();
  allRooms = data.rooms;

  roomData = allRooms.find(r => r.id === roomId);
  if (!roomData) {
    document.getElementById('room-title').textContent = 'Room not found';
    return;
  }

  document.title = roomData.name + ' — StyleMyShack';
  document.getElementById('room-title').textContent = roomData.name;
  document.getElementById('room-description').textContent = roomData.description;

  renderGallery('actual', roomData.photos.actual, '📷', 'No actual photos yet. Add photos to images/rooms/' + roomId + '/');
  renderGallery('model3d', roomData.photos.model3d, '🏗️', 'No 3D model photos yet.');
  renderGallery('floorPlan', roomData.photos.floorPlan, '📐', 'No floor plan uploaded yet.');

  renderRecommendations();
  setupTabs();
  setupEditToggle();
  setupPasswordModal();
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

// ─── Recommendations Render ───────────────────────────────────────────────
function renderRecommendations() {
  const rec = roomData.recommendations;
  const body = document.getElementById('rec-body');

  if (editMode) {
    body.innerHTML = buildEditForm(rec);
    body.querySelector('#save-recs-btn').addEventListener('click', saveRecommendations);
    // sync color pickers with text inputs
    ['primary', 'accent', 'trim'].forEach(field => {
      const colorPicker = body.querySelector(`#color-${field}`);
      const textInput   = body.querySelector(`#text-${field}`);
      if (colorPicker && textInput) {
        colorPicker.addEventListener('input', () => { textInput.value = colorPicker.value; });
        textInput.addEventListener('input', () => {
          if (/^#[0-9a-f]{6}$/i.test(textInput.value)) colorPicker.value = textInput.value;
        });
      }
    });
  } else {
    body.innerHTML = buildViewPanel(rec);
  }
}

function buildViewPanel(rec) {
  const paint = rec.paint || {};
  return `
    <div class="rec-section">
      <div class="rec-section-label">Paint &amp; Wall Color</div>
      <div class="paint-swatches">
        ${swatchItem('Primary', paint.primary)}
        ${swatchItem('Accent', paint.accent)}
        ${swatchItem('Trim', paint.trim)}
      </div>
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

function swatchItem(label, value) {
  const color = isHexColor(value) ? value : null;
  return `
    <div class="swatch-item">
      <label>${label}</label>
      <div class="swatch-display">
        <div class="swatch-dot" style="${color ? `background:${color};border-color:${color}` : ''}"></div>
        <span>${value ? escHtml(value) : '—'}</span>
      </div>
    </div>`;
}

function buildEditForm(rec) {
  const paint = rec.paint || {};
  return `
    <div class="rec-section">
      <div class="rec-section-label">Paint &amp; Wall Color</div>
      ${colorField('primary', 'Primary Color', paint.primary)}
      ${colorField('accent',  'Accent Color',  paint.accent)}
      ${colorField('trim',    'Trim Color',     paint.trim)}
      <label class="rec-section-label" style="margin-top:0.75rem">Paint Notes</label>
      <textarea class="edit-field" id="paint-notes" rows="3" placeholder="e.g. Use eggshell finish on walls...">${escHtml(paint.notes || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Flooring</div>
      <textarea class="edit-field" id="rec-flooring" rows="3" placeholder="e.g. Wide-plank white oak hardwood...">${escHtml(rec.flooring || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Lighting</div>
      <textarea class="edit-field" id="rec-lighting" rows="3" placeholder="e.g. Warm Edison bulbs, antler chandelier...">${escHtml(rec.lighting || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">Furniture &amp; Layout</div>
      <textarea class="edit-field" id="rec-furniture" rows="3" placeholder="e.g. Sectional sofa facing the fireplace...">${escHtml(rec.furniture || '')}</textarea>
    </div>

    <div class="rec-section">
      <div class="rec-section-label">General Notes</div>
      <textarea class="edit-field" id="rec-general" rows="4" placeholder="Any other recommendations...">${escHtml(rec.generalNotes || '')}</textarea>
    </div>

    <button class="save-btn" id="save-recs-btn">Save Recommendations</button>
  `;
}

function colorField(id, label, value) {
  const hex = isHexColor(value) ? value : '#c8b8a2';
  return `
    <div class="swatch-item" style="margin-bottom:0.6rem">
      <label>${label}</label>
      <div class="edit-color-row">
        <input type="color" id="color-${id}" value="${hex}" />
        <input type="text" class="edit-field" id="text-${id}" value="${escHtml(value || '')}"
               placeholder="#rrggbb or color name" style="flex:1;resize:none" />
      </div>
    </div>`;
}

// ─── Save ─────────────────────────────────────────────────────────────────
function saveRecommendations() {
  const body = document.getElementById('rec-body');

  roomData.recommendations = {
    paint: {
      primary:    body.querySelector('#text-primary')?.value || '',
      accent:     body.querySelector('#text-accent')?.value  || '',
      trim:       body.querySelector('#text-trim')?.value    || '',
      notes:      body.querySelector('#paint-notes')?.value  || ''
    },
    flooring:     body.querySelector('#rec-flooring')?.value  || '',
    lighting:     body.querySelector('#rec-lighting')?.value  || '',
    furniture:    body.querySelector('#rec-furniture')?.value || '',
    generalNotes: body.querySelector('#rec-general')?.value   || ''
  };

  // Build the full updated JSON
  const updated = { cabinName: document.title.split(' — ')[1] || 'My Cabin' };
  // We only have allRooms in memory; patch the current room
  allRooms = allRooms.map(r => r.id === roomData.id ? roomData : r);

  const json = JSON.stringify({ cabinName: getCabinName(), rooms: allRooms }, null, 2);

  // Download the updated JSON so the user can commit it
  const blob = new Blob([json], { type: 'application/json' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = 'rooms.json';
  a.click();
  URL.revokeObjectURL(url);

  showBanner('Recommendations downloaded! Replace data/rooms.json and push to redeploy.');
  renderRecommendations();
}

function getCabinName() {
  // Stored in document title during init
  return sessionStorage.getItem('cabinName') || 'My Cabin';
}

// ─── Edit Toggle & Password ───────────────────────────────────────────────
function setupEditToggle() {
  document.getElementById('edit-toggle').addEventListener('click', () => {
    if (editMode) {
      editMode = false;
      document.getElementById('edit-toggle').textContent = 'Edit';
      document.getElementById('edit-toggle').classList.remove('active');
      renderRecommendations();
    } else {
      document.getElementById('password-modal').classList.add('open');
      document.getElementById('password-input').value = '';
      document.getElementById('modal-error').style.display = 'none';
      setTimeout(() => document.getElementById('password-input').focus(), 50);
    }
  });
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
      editMode = true;
      document.getElementById('edit-toggle').textContent = 'Done';
      document.getElementById('edit-toggle').classList.add('active');
      renderRecommendations();
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
  setTimeout(() => banner.classList.remove('show'), 4000);
}

function isHexColor(v) { return v && /^#[0-9a-f]{3,6}$/i.test(v); }

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

init().then(() => {
  sessionStorage.setItem('cabinName', document.getElementById('room-title')
    ? (document.title.split(' — ')[0]) : 'My Cabin');
});
