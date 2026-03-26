// ─── State ────────────────────────────────────────────────────────────────
let roomData = null;
let allRooms = null;
let bmColors = [];
let editMode = false;
let threadOpen = false;
let draftMessage = '';

// ─── Constants ────────────────────────────────────────────────────────────
const REC_FIELDS = [
  { key: 'paint_notes',   label: 'Paint',        ph: 'e.g. Eggshell on walls, semi-gloss on trim…' },
  { key: 'flooring',      label: 'Flooring',      ph: 'e.g. Wide-plank white oak hardwood…' },
  { key: 'lighting',      label: 'Lighting',      ph: 'e.g. Warm Edison bulbs, antler chandelier…' },
  { key: 'furniture',     label: 'Furniture',     ph: 'e.g. Sectional sofa facing the fireplace…' },
  { key: 'general_notes', label: 'General Notes', ph: 'Any other recommendations…' }
];
const REACTION_TYPES = [
  { key: 'love',    emoji: '♥',  label: 'Love it',       cls: 'selected-love' },
  { key: 'discuss', emoji: '💬', label: "Let's discuss",  cls: 'selected-discuss' },
  { key: 'unsure',  emoji: '?',  label: 'Not sure',      cls: 'selected-unsure' }
];
const DEFAULT_ROLES = {
  kitchen:  ['Wall', 'Trim', 'Cabinet'],
  _default: ['Wall', 'Trim', 'Accent']
};

// ─── Supabase Photo Helpers ────────────────────────────────────────────────
async function loadPhotos(roomId, tab) {
  const { data } = await sb.from('photos')
    .select('*')
    .eq('room_id', roomId)
    .eq('tab', tab)
    .order('sort_order');
  return data || [];
}

function getPhotoUrl(storagePath) {
  return sb.storage.from('room-photos').getPublicUrl(storagePath).data.publicUrl;
}

async function loadRoomThumb(roomId) {
  const { data: pinned } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .eq('is_pinned', true)
    .maybeSingle();

  if (pinned) return getPhotoUrl(pinned.storage_path);

  const { data: first } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return first ? getPhotoUrl(first.storage_path) : null;
}

// ─── Recommendations Helpers ───────────────────────────────────────────────
async function loadRecs(roomId) {
  const { data } = await sb.from('recommendations')
    .select('*')
    .eq('room_id', roomId)
    .maybeSingle();

  if (!data) return {
    paint_notes: '', flooring: '', lighting: '', furniture: '', general_notes: '',
    swatch_sets: [], client_swatches: [], reactions: {}
  };

  return {
    paint_notes:     data.paint_notes || '',
    flooring:        data.flooring || '',
    lighting:        data.lighting || '',
    furniture:       data.furniture || '',
    general_notes:   data.general_notes || '',
    swatch_sets:     data.swatch_sets || [],
    client_swatches: data.client_swatches || [],
    reactions:       data.reactions || {}
  };
}

async function persistRecs() {
  const rec = roomData.recommendations;
  await sb.from('recommendations').upsert({
    room_id:         roomData.id,
    paint_notes:     rec.paint_notes || '',
    flooring:        rec.flooring || '',
    lighting:        rec.lighting || '',
    furniture:       rec.furniture || '',
    general_notes:   rec.general_notes || '',
    swatch_sets:     rec.swatch_sets || [],
    client_swatches: rec.client_swatches || [],
    reactions:       rec.reactions || {},
    updated_at:      new Date().toISOString()
  }, { onConflict: 'room_id' });
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');

  const [{ data: rooms }, { data: messages }, colorsRes] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order'),
    sb.from('messages').select('*').eq('room_id', roomId).order('created_at'),
    fetch('data/bm-colors.json')
  ]);

  bmColors = await colorsRes.json();

  allRooms = rooms || [];
  roomData = allRooms.find(r => r.id === roomId);

  if (!roomData) {
    document.getElementById('room-title').textContent = 'Room not found';
    return;
  }

  roomData.recommendations = await loadRecs(roomId);
  roomData.messages = messages || [];

  document.title = roomData.name + ' — StyleMyShack';
  document.getElementById('room-title').textContent       = roomData.name;
  document.getElementById('room-description').textContent = roomData.description;

  await Promise.all([
    renderGallery('actual'),
    renderGallery('model3d'),
    renderGallery('floorPlan'),
    renderRoomNav()
  ]);

  renderRecommendations();
  setupTabs();
  setupEditToggle();
  setupUploadListeners();
  setupThread();
  renderThread();
}

// ─── Room Nav Strip ────────────────────────────────────────────────────────
async function renderRoomNav() {
  const nav = document.getElementById('room-nav');
  if (!nav) return;

  const items = await Promise.all(allRooms.map(async room => {
    const url = await loadRoomThumb(room.id);
    return { room, url };
  }));

  nav.innerHTML = items.map(({ room, url }) => `
    <a class="room-nav-item${room.id === roomData.id ? ' active' : ''}"
       href="room.html?id=${room.id}">
      <div class="room-nav-thumb">
        ${url
          ? `<img src="${url}" alt="${escHtml(room.name)}" />`
          : room.emoji
        }
      </div>
      <div class="room-nav-label">${escHtml(room.name)}</div>
    </a>
  `).join('');
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
  const photos    = await loadPhotos(roomData.id, tab);

  if (photos.length === 0) {
    container.innerHTML = `
      <div class="photo-placeholder">
        <span class="icon">${meta.icon}</span>
        <p>${meta.empty}${editMode ? ' Use the button below to upload.' : ''}</p>
      </div>`;
    return;
  }

  const urls    = photos.map(p => getPhotoUrl(p.storage_path));
  let activeIdx = 0;

  function build() {
    const isPinnedActive = photos[activeIdx]?.is_pinned;

    container.innerHTML = `
      <div class="photo-main-wrap">
        <img class="photo-main" src="${urls[activeIdx]}" alt="Photo ${activeIdx + 1}" />
        <button class="photo-pin-btn${isPinnedActive ? ' is-pinned' : ''}" data-idx="${activeIdx}"
                title="${isPinnedActive ? 'Cover photo' : 'Set as cover photo'}">📌</button>
        ${editMode ? `<button class="photo-main-delete" data-idx="${activeIdx}">Delete</button>` : ''}
      </div>
      ${urls.length > 1 ? `
        <div class="photo-thumbs">
          ${urls.map((u, i) => {
            const isThisPinned = photos[i]?.is_pinned;
            return `
              <div class="photo-thumb-wrap">
                <img class="photo-thumb ${i === activeIdx ? 'active' : ''}"
                     src="${u}" alt="Thumbnail ${i + 1}" data-idx="${i}" />
                ${isThisPinned ? '<span class="thumb-pin-badge">📌</span>' : ''}
                ${editMode ? `<button class="photo-delete-btn" data-idx="${i}" title="Delete">✕</button>` : ''}
              </div>`;
          }).join('')}
        </div>` : ''}
    `;

    container.querySelectorAll('.photo-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => { activeIdx = +thumb.dataset.idx; build(); });
    });

    container.querySelector('.photo-pin-btn').addEventListener('click', async e => {
      e.stopPropagation();
      const idx = +e.currentTarget.dataset.idx;
      await sb.from('photos').update({ is_pinned: false }).eq('room_id', roomData.id);
      await sb.from('photos').update({ is_pinned: true }).eq('id', photos[idx].id);
      photos.forEach(p => p.is_pinned = false);
      photos[idx].is_pinned = true;
      showBanner('Cover photo updated!');
      build();
      renderRoomNav();
    });

    container.querySelectorAll('.photo-delete-btn, .photo-main-delete').forEach(btn => {
      btn.addEventListener('click', async e => {
        e.stopPropagation();
        const idx   = +btn.dataset.idx;
        const photo = photos[idx];
        await sb.storage.from('room-photos').remove([photo.storage_path]);
        await sb.from('photos').delete().eq('id', photo.id);
        photos.splice(idx, 1);
        urls.splice(idx, 1);
        if (photos.length === 0) {
          renderGallery(tab);
        } else {
          activeIdx = Math.min(activeIdx, photos.length - 1);
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

      showBanner('Uploading…');
      for (const file of files) {
        const path = `${roomData.id}/${tab}/${Date.now()}-${file.name}`;
        const { error } = await sb.storage.from('room-photos').upload(path, file);
        if (!error) {
          await sb.from('photos').insert({
            room_id:      roomData.id,
            tab,
            storage_path: path,
            is_pinned:    false,
            sort_order:   Date.now()
          });
        } else {
          console.error('Upload error:', error);
          showBanner('Upload failed — try again.');
        }
      }

      input.value = '';
      showBanner('Uploaded!');
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

// ─── Recommendations ──────────────────────────────────────────────────────
function renderRecommendations() {
  const body = document.getElementById('rec-body');
  if (editMode) {
    body.innerHTML = buildEditForm(roomData.recommendations);
    body.querySelector('#save-recs-btn').addEventListener('click', saveRecommendations);
    setupSwatchSetListeners();
    setupClientSwatchListeners();
  } else {
    body.innerHTML = buildViewPanel(roomData.recommendations);
    setupReactionListeners();
    setupClientSwatchListeners();
  }
}

function buildViewPanel(rec) {
  let html = '';
  REC_FIELDS.forEach(f => {
    const val = rec[f.key] || '';
    html += `<div class="rec-section"><div class="rec-section-label">${f.label}</div>`;
    if (val) {
      html += `<div class="rec-text">${escHtml(val)}</div>`;
      html += renderReactionStrip(f.key, rec.reactions);
    } else {
      html += `<span class="rec-empty">No ${f.label.toLowerCase()} notes yet.</span>`;
    }
    html += '</div>';
  });

  html += `<div class="rec-section"><div class="rec-section-label">Color Palettes</div>
    ${renderSwatchSets(rec.swatch_sets || [], false)}
  </div>`;

  html += renderClientSwatches(rec.client_swatches || []);
  return html;
}

function buildEditForm(rec) {
  let html = '';
  REC_FIELDS.forEach(f => {
    const val = rec[f.key] || '';
    html += `<div class="rec-section"><div class="rec-section-label">${f.label}</div>
      <textarea class="edit-field" id="field-${f.key}" rows="3"
        placeholder="${escHtml(f.ph)}">${escHtml(val)}</textarea>
    </div>`;
  });

  html += `<div class="rec-section"><div class="rec-section-label">Color Palettes</div>
    ${renderSwatchSets(rec.swatch_sets || [], true)}
  </div>`;

  html += renderClientSwatches(rec.client_swatches || []);
  html += `<button class="save-btn" id="save-recs-btn">Save</button>`;
  return html;
}

function renderReactionStrip(fieldKey, reactions) {
  const cur = (reactions || {})[fieldKey];
  let html = '<div class="reaction-strip">';
  REACTION_TYPES.forEach(rt => {
    const sel = cur === rt.key ? rt.cls : '';
    html += `<button class="reaction-btn ${sel}" data-field="${fieldKey}" data-reaction="${rt.key}">${rt.emoji} ${rt.label}</button>`;
  });
  return html + '</div>';
}

function renderSwatchSets(sets, inEdit) {
  let html = '<div class="swatch-sets-area">';

  if (!sets.length && !inEdit) {
    html += '<span class="rec-empty">No palettes yet.</span>';
  }

  sets.forEach((set, si) => {
    html += `<div class="swatch-set"><div class="swatch-set-header">`;
    if (inEdit) {
      html += `<input class="swatch-set-name-input" data-set-name="${si}" value="${escHtml(set.name || '')}">`;
      html += `<button class="btn-danger-small" data-remove-set="${si}">Remove set</button>`;
    } else {
      html += `<span class="swatch-set-name">${escHtml(set.name || 'Palette')}</span>`;
    }
    html += '</div>';

    (set.swatches || []).forEach((sw, swi) => {
      html += '<div class="swatch-slot">';
      if (inEdit) {
        html += `<input type="color" class="swatch-circle-input" data-set="${si}" data-sw="${swi}" value="${sw.color || '#CCCCCC'}">`;
        html += `<div class="swatch-slot-fields">
          <div class="bm-search-wrap">
            <input type="text" class="bm-swatch-search" data-search-set="${si}" data-search-sw="${swi}"
              placeholder="Search Benjamin Moore…" autocomplete="off">
            <div class="bm-swatch-results" id="bm-res-${si}-${swi}"></div>
          </div>
          <div class="swatch-slot-row2">
            <input class="swatch-role-input" data-set-role="${si}-${swi}" value="${escHtml(sw.role || '')}" placeholder="Role">
            <input class="swatch-color-label-input" data-set-label="${si}-${swi}" value="${escHtml(sw.label || '')}" placeholder="Color name">
          </div>
        </div>`;
        html += `<button class="swatch-slot-remove" data-remove-swatch="${si}-${swi}">✕</button>`;
      } else {
        html += `<div class="swatch-circle" style="background:${sw.color || '#CCCCCC'}"></div>`;
        html += `<span class="swatch-role">${escHtml(sw.role || '')}</span>`;
        if (sw.label) html += `<span class="swatch-color-label">— ${escHtml(sw.label)}</span>`;
      }
      html += '</div>';
    });

    if (inEdit) {
      html += `<div class="swatch-set-actions"><button class="btn-sm-secondary" data-add-swatch="${si}">+ Add swatch</button></div>`;
    }
    html += '</div>';
  });

  if (inEdit) {
    html += '<button class="add-set-btn" id="add-palette-set">+ Add palette set</button>';
  }

  html += '</div>';
  return html;
}

function renderClientSwatches(clientSwatches) {
  let html = `<div class="client-swatches-section">
    <div class="section-sub-label">My Swatches — Colors I'm Considering</div>
    <div class="swatches-row">`;
  (clientSwatches || []).forEach((s, i) => {
    html += `<div class="swatch-flat" style="background:${s.color}" data-remove-client-swatch="${i}" title="Click to remove">
      <span class="swatch-label">${escHtml(s.label)} ✕</span>
    </div>`;
  });
  html += `<button class="add-client-swatch-btn" id="add-client-swatch-btn">+</button>
    </div>
    <div class="swatch-picker-popover" id="swatch-picker-popover">
      <div class="swatch-picker-row">
        <input type="color" id="client-swatch-color" value="#C8B89A">
        <input type="text" id="client-swatch-label" placeholder="Label (e.g. Warm Sand)">
        <button class="btn-primary-small" id="client-swatch-add">Add</button>
      </div>
    </div>
  </div>`;
  return html;
}

// ─── Reaction Listeners ────────────────────────────────────────────────────
function setupReactionListeners() {
  document.querySelectorAll('.reaction-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const fk = btn.dataset.field;
      const rk = btn.dataset.reaction;
      const reactions = roomData.recommendations.reactions;

      if (reactions[fk] === rk) {
        delete reactions[fk];
      } else {
        reactions[fk] = rk;
        if (rk === 'discuss') {
          const fieldLabel = REC_FIELDS.find(f => f.key === fk)?.label || fk;
          draftMessage = `Re: ${fieldLabel} — `;
          threadOpen = true;
          renderThread();
          setTimeout(() => {
            const ta = document.getElementById('compose-area');
            if (ta) { ta.focus(); ta.setSelectionRange(ta.value.length, ta.value.length); }
          }, 50);
        }
      }

      await persistRecs();
      renderRecommendations();
    });
  });
}

// ─── Swatch Set Listeners ──────────────────────────────────────────────────
function setupSwatchSetListeners() {
  const body = document.getElementById('rec-body');

  body.querySelectorAll('[data-remove-set]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherSwatchEdits();
      roomData.recommendations.swatch_sets.splice(+btn.dataset.removeSet, 1);
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-add-swatch]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherSwatchEdits();
      const si    = +btn.dataset.addSwatch;
      const roles = DEFAULT_ROLES[roomData.id] || DEFAULT_ROLES._default;
      const count = roomData.recommendations.swatch_sets[si].swatches.length;
      roomData.recommendations.swatch_sets[si].swatches.push({
        role: roles[count] || 'New', color: '#CCCCCC', label: ''
      });
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-remove-swatch]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherSwatchEdits();
      const [si, swi] = btn.dataset.removeSwatch.split('-').map(Number);
      roomData.recommendations.swatch_sets[si].swatches.splice(swi, 1);
      renderRecommendations();
    });
  });

  const addSetBtn = body.querySelector('#add-palette-set');
  if (addSetBtn) {
    addSetBtn.addEventListener('click', () => {
      gatherSwatchEdits();
      const sets  = roomData.recommendations.swatch_sets;
      const roles = DEFAULT_ROLES[roomData.id] || DEFAULT_ROLES._default;
      sets.push({
        name:     'Palette ' + String.fromCharCode(65 + sets.length),
        swatches: roles.map(r => ({ role: r, color: '#CCCCCC', label: '' }))
      });
      renderRecommendations();
    });
  }

  // BM color search per swatch slot
  body.querySelectorAll('.bm-swatch-search').forEach(input => {
    const si       = +input.dataset.searchSet;
    const swi      = +input.dataset.searchSw;
    const resultsEl = document.getElementById(`bm-res-${si}-${swi}`);

    input.addEventListener('input', () => {
      const q = input.value.trim().toLowerCase();
      if (!q || q.length < 2) { resultsEl.innerHTML = ''; resultsEl.classList.remove('open'); return; }

      const matches = bmColors
        .filter(c => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q))
        .slice(0, 12);

      if (!matches.length) { resultsEl.innerHTML = '<div class="bm-result-empty">No colors found</div>'; resultsEl.classList.add('open'); return; }

      resultsEl.innerHTML = matches.map(c => `
        <div class="bm-result-item" data-hex="${c.hex}" data-name="${escHtml(c.name)}" data-number="${escHtml(c.number)}">
          <div class="bm-result-dot" style="background:${c.hex}"></div>
          <span class="bm-result-name">${escHtml(c.name)}</span>
          <span class="bm-result-num">${escHtml(c.number)}</span>
        </div>`).join('');

      resultsEl.querySelectorAll('.bm-result-item').forEach(item => {
        item.addEventListener('click', () => {
          const colorInput = body.querySelector(`[data-set="${si}"][data-sw="${swi}"]`);
          if (colorInput) colorInput.value = item.dataset.hex;
          const labelInput = body.querySelector(`[data-set-label="${si}-${swi}"]`);
          if (labelInput) labelInput.value = `${item.dataset.name} ${item.dataset.number}`;
          input.value = '';
          resultsEl.innerHTML = '';
          resultsEl.classList.remove('open');
        });
      });

      resultsEl.classList.add('open');
    });
  });

  // Close BM dropdowns on outside click
  document.addEventListener('click', e => {
    if (!e.target.closest('.bm-search-wrap')) {
      document.querySelectorAll('.bm-swatch-results').forEach(el => {
        el.innerHTML = '';
        el.classList.remove('open');
      });
    }
  });
}

function gatherSwatchEdits() {
  const sets = roomData.recommendations.swatch_sets || [];
  sets.forEach((set, si) => {
    const nameInput = document.querySelector(`[data-set-name="${si}"]`);
    if (nameInput) set.name = nameInput.value;
    set.swatches.forEach((sw, swi) => {
      const ci = document.querySelector(`[data-set="${si}"][data-sw="${swi}"]`);
      if (ci) sw.color = ci.value;
      const ri = document.querySelector(`[data-set-role="${si}-${swi}"]`);
      if (ri) sw.role = ri.value;
      const li = document.querySelector(`[data-set-label="${si}-${swi}"]`);
      if (li) sw.label = li.value;
    });
  });
}

// ─── Client Swatch Listeners ───────────────────────────────────────────────
function setupClientSwatchListeners() {
  const body = document.getElementById('rec-body');

  body.querySelectorAll('[data-remove-client-swatch]').forEach(el => {
    el.addEventListener('click', async () => {
      roomData.recommendations.client_swatches.splice(+el.dataset.removeClientSwatch, 1);
      await persistRecs();
      renderRecommendations();
    });
  });

  const addBtn = body.querySelector('#add-client-swatch-btn');
  if (addBtn) {
    addBtn.addEventListener('click', () => {
      const picker = body.querySelector('#swatch-picker-popover');
      if (picker) picker.classList.toggle('open');
    });
  }

  const addSwatchBtn = body.querySelector('#client-swatch-add');
  if (addSwatchBtn) {
    addSwatchBtn.addEventListener('click', async () => {
      const color = body.querySelector('#client-swatch-color').value;
      const label = body.querySelector('#client-swatch-label').value.trim() || color;
      roomData.recommendations.client_swatches.push({ color, label });
      await persistRecs();
      renderRecommendations();
    });
  }
}

// ─── Save ─────────────────────────────────────────────────────────────────
async function saveRecommendations() {
  gatherSwatchEdits();
  const body = document.getElementById('rec-body');
  REC_FIELDS.forEach(f => {
    const ta = body.querySelector(`#field-${f.key}`);
    if (ta) roomData.recommendations[f.key] = ta.value;
  });
  await persistRecs();
  showBanner('Saved!');
  exitEditMode();
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
  setUploadVisibility(true);
  renderGallery('actual');
  renderGallery('model3d');
  renderGallery('floorPlan');
  renderRecommendations();
}

function exitEditMode() {
  editMode = false;
  document.getElementById('edit-toggle').textContent = 'Edit';
  document.getElementById('edit-toggle').classList.remove('active');
  setUploadVisibility(false);
  renderGallery('actual');
  renderGallery('model3d');
  renderGallery('floorPlan');
  renderRecommendations();
}

// ─── Thread ───────────────────────────────────────────────────────────────
function renderThread() {
  const messages      = roomData.messages || [];
  const count         = messages.length;
  const toggleBtn     = document.getElementById('thread-toggle');
  const arrow         = document.getElementById('thread-arrow');
  const threadBody    = document.getElementById('thread-body');
  const threadCount   = document.getElementById('thread-count');
  const messagesList  = document.getElementById('messages-list');
  const draftIndicator = document.getElementById('draft-indicator');
  const composeArea   = document.getElementById('compose-area');

  if (!toggleBtn) return;

  threadCount.textContent = `${count} message${count !== 1 ? 's' : ''}`;
  arrow.className    = 'thread-arrow' + (threadOpen ? ' open' : '');
  threadBody.className = 'thread-body' + (threadOpen ? ' open' : '');

  messagesList.innerHTML = messages.length
    ? messages.map(m => `
        <div class="message ${m.from_role}">
          <div class="msg-meta">${m.from_role === 'designer' ? 'Designer' : 'You'} · ${formatDate(m.created_at)}</div>
          <div class="msg-text">${escHtml(m.text)}</div>
        </div>`).join('')
    : '<div style="color:var(--stone);font-size:0.85rem;font-style:italic;padding:8px 0;">No messages yet.</div>';

  if (draftMessage) {
    draftIndicator.style.display = '';
    draftIndicator.textContent = 'Draft from your reaction — edit before sending';
    if (composeArea && !composeArea.value) composeArea.value = draftMessage;
  } else {
    draftIndicator.style.display = 'none';
  }
}

function setupThread() {
  const toggleBtn = document.getElementById('thread-toggle');
  const sendBtn   = document.getElementById('send-btn');

  if (toggleBtn) {
    toggleBtn.addEventListener('click', () => {
      threadOpen = !threadOpen;
      renderThread();
    });
  }

  if (sendBtn) {
    sendBtn.addEventListener('click', async () => {
      const ta = document.getElementById('compose-area');
      const text = ta.value.trim();
      if (!text) return;

      const { data: msg } = await sb.from('messages').insert({
        room_id:   roomData.id,
        from_role: 'client',
        text
      }).select().single();

      if (msg) roomData.messages.push(msg);
      draftMessage = '';
      threadOpen = true;
      ta.value = '';
      renderThread();
      showBanner('Message sent');
    });
  }
}

function formatDate(isoString) {
  if (!isoString) return 'Just now';
  const d = new Date(isoString);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
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
