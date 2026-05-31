// ─── State ────────────────────────────────────────────────────────────────
let roomData = null;
let allRooms = null;
let bmColors = [];
let swColors = [];
let activeBrand = 'bm'; // 'bm' | 'sw'
let editMode = false;
let threadOpen = false;
let draftMessage = '';
let inlineEditItem = null;      // { cat, idx } | null
let editingGeneralNotes = false;
let editingSwatch = null;       // { si, swi } | null

// ─── Section Order (localStorage) ─────────────────────────────────────────
function getSectionOrder() {
  try {
    const stored = localStorage.getItem('section_order_' + (roomData?.id || ''));
    if (stored) {
      const keys = JSON.parse(stored);
      const sorted = [...REC_CATEGORIES].sort((a, b) => {
        const ai = keys.indexOf(a.key), bi = keys.indexOf(b.key);
        return (ai === -1 ? 99 : ai) - (bi === -1 ? 99 : bi);
      });
      return sorted;
    }
  } catch {}
  return [...REC_CATEGORIES];
}

function moveSectionOrder(key, dir) {
  const cats = getSectionOrder();
  const idx  = cats.findIndex(c => c.key === key);
  const next = idx + dir;
  if (next < 0 || next >= cats.length) return;
  [cats[idx], cats[next]] = [cats[next], cats[idx]];
  localStorage.setItem('section_order_' + roomData.id, JSON.stringify(cats.map(c => c.key)));
  renderRecommendations();
}

// ─── Color Preview Modal ───────────────────────────────────────────────────
function openColorPreview(color, role, label) {
  let cp = document.getElementById('color-preview');
  if (!cp) {
    cp = document.createElement('div');
    cp.id = 'color-preview';
    cp.innerHTML = `
      <div class="color-preview-backdrop"></div>
      <div class="color-preview-card">
        <div class="color-preview-swatch" id="cp-swatch"></div>
        <div class="color-preview-info">
          <div class="color-preview-role" id="cp-role"></div>
          <div class="color-preview-label" id="cp-label"></div>
        </div>
        <button class="lightbox-close" id="cp-close" title="Close">✕</button>
      </div>`;
    document.body.appendChild(cp);
    cp.querySelector('.color-preview-backdrop').addEventListener('click', closeColorPreview);
    cp.querySelector('#cp-close').addEventListener('click', closeColorPreview);
  }
  cp.querySelector('#cp-swatch').style.background = color;
  cp.querySelector('#cp-role').textContent = role || '';
  cp.querySelector('#cp-label').textContent = label || '';
  cp.classList.add('open');
}

function closeColorPreview() {
  document.getElementById('color-preview')?.classList.remove('open');
}

// ─── Constants ────────────────────────────────────────────────────────────
const REC_CATEGORIES = [
  { key: 'paint_items',     label: 'Paint',     ph: 'e.g. Benjamin Moore White Dove OC-17' },
  { key: 'flooring_items',  label: 'Flooring',  ph: 'e.g. Wide-plank white oak hardwood' },
  { key: 'lighting_items',  label: 'Lighting',  ph: 'e.g. Antler chandelier, 2700K bulbs' },
  { key: 'furniture_items', label: 'Furniture', ph: 'e.g. Oatmeal linen sectional' }
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
    paint_items:     data.paint_items     || [],
    flooring_items:  data.flooring_items  || [],
    lighting_items:  data.lighting_items  || [],
    furniture_items: data.furniture_items || [],
    general_notes:   data.general_notes   || '',
    owner_notes:     data.owner_notes     || '',
    swatch_sets:     data.swatch_sets     || [],
    client_swatches: data.client_swatches || [],
    reactions:       data.reactions       || {}
  };
}

async function persistRecs() {
  const rec = roomData.recommendations;
  const { error } = await sb.from('recommendations').upsert({
    room_id:         roomData.id,
    paint_items:     rec.paint_items     || [],
    flooring_items:  rec.flooring_items  || [],
    lighting_items:  rec.lighting_items  || [],
    furniture_items: rec.furniture_items || [],
    general_notes:   rec.general_notes   || '',
    owner_notes:     rec.owner_notes     || '',
    swatch_sets:     rec.swatch_sets     || [],
    client_swatches: rec.client_swatches || [],
    reactions:       rec.reactions       || {},
    updated_at:      new Date().toISOString()
  }, { onConflict: 'room_id' });
  if (error) {
    showBanner('Save failed: ' + error.message);
    throw error;
  }
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  await waitForAuth();

  const params = new URLSearchParams(window.location.search);
  const roomId = params.get('id');

  const isOwner = currentUser?.role === 'owner';
  const canSeeThread = currentUser?.role === 'owner' || currentUser?.role === 'builder';

  const [roomsRes, messagesRes] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order'),
    canSeeThread
      ? sb.from('messages').select('*').eq('room_id', roomId).order('created_at')
      : Promise.resolve({ data: [] })
  ]);

  const rooms    = roomsRes.data    || [];
  const messages = messagesRes.data || [];

  try {
    const colorsRes = await fetch('data/bm-colors.json');
    bmColors = await colorsRes.json();
  } catch (e) {
    bmColors = []; // BM search unavailable (e.g. file:// protocol)
  }
  try {
    const swRes = await fetch('data/sw-colors.json');
    swColors = await swRes.json();
  } catch (e) {
    swColors = []; // SW search unavailable
  }

  allRooms = rooms;
  roomData = allRooms.find(r => r.id === roomId);

  if (!roomData) {
    document.getElementById('room-title').textContent = 'Room not found';
    return;
  }

  roomData.recommendations = await loadRecs(roomId);
  roomData.messages = messages;

  document.title = roomData.name + ' — StyleMyShack';
  document.getElementById('room-title').textContent       = roomData.name;
  document.getElementById('room-description').textContent = roomData.description;

  await Promise.all([
    renderGallery('actual'),
    renderGallery('model3d'),
    renderGallery('floorPlan'),
    renderGallery('inspiration'),
    renderRoomNav()
  ]);

  // Gate edit toggle — owner only
  const editToggle = document.getElementById('edit-toggle');
  if (editToggle) editToggle.style.display = isOwner ? '' : 'none';

  // Gate upload wraps — owner only (they start hidden; only show for owner)
  if (isOwner) {
    // upload visibility is managed by enterEditMode/exitEditMode; nothing to do here
  } else {
    // Ensure upload wraps stay hidden for non-owners and disable the placeholder click-to-upload
    ['actual', 'model3d', 'floorPlan', 'inspiration'].forEach(tab => {
      const wrap = document.getElementById('upload-wrap-' + tab);
      if (wrap) wrap.remove();
    });
  }

  // Gate thread section — owner and builder only
  const threadSection = document.querySelector('.thread-section');
  if (threadSection) threadSection.style.display = canSeeThread ? '' : 'none';

  setupOwnerBrief();
  renderRecommendations();
  if (isOwner) {
    setupEditToggle();
  }
  setupUploadListeners();
  if (canSeeThread) {
    setupThread();
    renderThread();
  }

  // Update tab labels with photo counts
  updateTabCounts(roomId);
}

// ─── Tab Photo Counts ─────────────────────────────────────────────────────
const TAB_LABELS = {
  actual:      'Actual Photos',
  model3d:     '3D Model',
  floorPlan:   'Floor Plan',
  inspiration: 'Inspiration'
};

async function updateTabCounts(roomId) {
  try {
    const tabs = ['actual', 'model3d', 'floorPlan', 'inspiration'];
    await Promise.all(tabs.map(async tab => {
      const { count } = await sb.from('photos')
        .select('id', { count: 'exact', head: true })
        .eq('room_id', roomId)
        .eq('tab', tab);
      const btn = document.querySelector(`.photo-tab[data-tab="${tab}"]`);
      if (!btn) return;
      const n = count || 0;
      if (n > 0) {
        btn.textContent = `${TAB_LABELS[tab]} · ${n}`;
        btn.classList.remove('tab-empty');
      } else {
        btn.textContent = TAB_LABELS[tab];
        btn.classList.add('tab-empty');
      }
    }));
  } catch {
    // silent degradation — tab labels stay as default
  }
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

// ─── Owner's Brief ─────────────────────────────────────────────────────────
function setupOwnerBrief() {
  const el = document.getElementById('owner-notes-text');
  if (!el) return;

  const placeholder = el.dataset.placeholder || 'Click to add notes…';
  let savedValue = roomData.recommendations.owner_notes || '';

  function render() {
    if (savedValue) {
      el.textContent = savedValue;
      el.classList.remove('is-placeholder');
    } else {
      el.textContent = placeholder;
      el.classList.add('is-placeholder');
    }
  }
  render();

  el.addEventListener('click', () => {
    if (el.contentEditable === 'true') return;
    el.classList.remove('is-placeholder');
    el.contentEditable = 'true';
    el.classList.add('owner-brief-editing');
    el.textContent = savedValue;
    el.focus();
    const range = document.createRange();
    range.selectNodeContents(el);
    window.getSelection().removeAllRanges();
    window.getSelection().addRange(range);
  });

  el.addEventListener('keydown', e => {
    if (e.key === 'Escape') { el.contentEditable = 'false'; el.classList.remove('owner-brief-editing'); render(); }
  });

  el.addEventListener('blur', async () => {
    el.contentEditable = 'false';
    el.classList.remove('owner-brief-editing');
    const newValue = el.textContent.trim();
    if (newValue !== savedValue) {
      savedValue = newValue;
      roomData.recommendations.owner_notes = newValue;
      await persistRecs();
      showBanner('Saved!');
    }
    render();
  });
}

// ─── Gallery ──────────────────────────────────────────────────────────────
const GALLERY_ICONS = {
  actual:      { icon: '📷', empty: 'No actual photos yet.' },
  model3d:     { icon: '🏗️',  empty: 'No 3D model photos yet.' },
  floorPlan:   { icon: '📐', empty: 'No floor plan uploaded yet.' },
  inspiration: { icon: '✨', empty: 'No inspiration photos yet. Add reference images for the vibe you\'re going for.' }
};

async function renderGallery(tab) {
  const container = document.getElementById('gallery-' + tab);
  const meta      = GALLERY_ICONS[tab];
  const photos    = await loadPhotos(roomData.id, tab);

  if (photos.length === 0) {
    if (currentUser?.role === 'owner') {
      container.innerHTML = `
        <div class="photo-placeholder photo-placeholder-upload">
          <span class="icon">${meta.icon}</span>
          <p>${meta.empty}</p>
          <span class="placeholder-upload-hint">Click to add photos</span>
        </div>`;
      container.querySelector('.photo-placeholder-upload').addEventListener('click', () => {
        document.getElementById('upload-' + tab).click();
      });
    } else {
      container.innerHTML = `
        <div class="photo-placeholder">
          <span class="icon">${meta.icon}</span>
          <p>${meta.empty}</p>
        </div>`;
    }
    return;
  }

  const urls    = photos.map(p => getPhotoUrl(p.storage_path));
  let activeIdx = 0;

  function build() {
    const isPinnedActive = photos[activeIdx]?.is_pinned;

    container.innerHTML = `
      <div class="photo-main-wrap">
        <img class="photo-main" src="${urls[activeIdx]}" alt="Photo ${activeIdx + 1}" />
        ${currentUser?.role === 'owner' ? `<button class="photo-pin-btn${isPinnedActive ? ' is-pinned' : ''}" data-idx="${activeIdx}"
                title="${isPinnedActive ? 'Cover photo' : 'Set as cover photo'}">📌</button>` : ''}
        ${currentUser?.role === 'owner' && editMode ? `<button class="photo-main-delete" data-idx="${activeIdx}">Delete</button>` : ''}
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
                ${currentUser?.role === 'owner' && editMode ? `<button class="photo-delete-btn" data-idx="${i}" title="Delete">✕</button>` : ''}
              </div>`;
          }).join('')}
        </div>` : ''}
    `;

    container.querySelectorAll('.photo-thumb').forEach(thumb => {
      thumb.addEventListener('click', () => { activeIdx = +thumb.dataset.idx; build(); });
    });

    container.querySelector('.photo-main').addEventListener('click', () => {
      openLightbox(urls[activeIdx]);
    });

    container.querySelector('.photo-pin-btn')?.addEventListener('click', async e => {
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
  ['actual', 'model3d', 'floorPlan', 'inspiration'].forEach(tab => {
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
    setupItemListeners();
    setupSwatchSetListeners();
    setupClientSwatchListeners();
  } else {
    body.innerHTML = buildViewPanel(roomData.recommendations);
    setupReactionListeners();
    setupInlineEditListeners();
    setupSwatchSetListeners();
    setupClientSwatchListeners();
  }
}

function setupItemListeners() {
  const body = document.getElementById('rec-body');

  body.querySelectorAll('[data-add-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherItemEdits();
      gatherSwatchEdits();
      const cat = btn.dataset.addCategory;
      if (!roomData.recommendations[cat]) roomData.recommendations[cat] = [];
      roomData.recommendations[cat].push({ id: makeId(), name: '', note: '', link: '', photo_url: '' });
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-remove-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherItemEdits();
      gatherSwatchEdits();
      const cat = btn.dataset.removeCat;
      const idx = +btn.dataset.removeIdx;
      roomData.recommendations[cat].splice(idx, 1);
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-move-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      gatherItemEdits();
      gatherSwatchEdits();
      moveSectionOrder(btn.dataset.moveSection, +btn.dataset.dir);
    });
  });
}

function buildViewPanel(rec) {
  let html = '';
  const isOwner = currentUser?.role === 'owner';

  const gn = rec.general_notes || '';
  // Non-owners: skip General Notes if empty
  if (isOwner || gn.trim() !== '') {
    html += `<div class="rec-section"><div class="rec-section-label">General Notes</div>`;
    if (editingGeneralNotes) {
      html += `<textarea class="edit-field" id="field-general_notes" rows="3"
        placeholder="Any other notes…">${escHtml(gn)}</textarea>
        <div class="inline-edit-actions">
          <button class="inline-save-btn" id="save-gn-btn">✓ Save</button>
          <button class="inline-cancel-btn" id="cancel-gn-btn">Cancel</button>
        </div>`;
    } else {
      html += gn
        ? `<div id="general-notes-text" class="rec-text${isOwner ? ' rec-text-editable' : ''}" ${isOwner ? 'data-edit-gn' : ''}>${escHtml(gn)}</div>`
        : `<span id="general-notes-text" class="rec-empty rec-text-editable" data-edit-gn>No general notes yet — click to add.</span>`;
    }
    html += '</div>';
  }

  const orderedCats = getSectionOrder();
  orderedCats.forEach((cat, ci) => {
    const items  = rec[cat.key] || [];
    // Non-owners: skip sections with no items
    if (!isOwner && items.length === 0) return;

    const upDis  = ci === 0 ? 'disabled' : '';
    const downDis = ci === orderedCats.length - 1 ? 'disabled' : '';
    html += `<div class="rec-section">
      <div class="rec-section-header">
        <div class="rec-section-label">${cat.label}</div>
        ${isOwner ? `<div class="section-arrows">
          <button class="section-arrow" data-move-section="${cat.key}" data-dir="-1" ${upDis} title="Move up">↑</button>
          <button class="section-arrow" data-move-section="${cat.key}" data-dir="1" ${downDis} title="Move down">↓</button>
        </div>` : ''}
      </div>`;
    if (items.length === 0 && !inlineEditItem) {
      html += `<span class="rec-empty">No ${cat.label.toLowerCase()} items yet.</span>`;
    } else {
      html += '<div class="items-list">';
      items.forEach((item, idx) => {
        if (inlineEditItem && inlineEditItem.cat === cat.key && inlineEditItem.idx === idx) {
          html += renderItemInlineEdit(item, cat.key, idx, cat.ph);
        } else {
          html += renderItemCard(item, rec.reactions, cat.key, idx);
        }
      });
      html += '</div>';
    }
    if (isOwner) {
      html += `<button class="add-item-btn" data-add-category="${cat.key}">+ Add ${cat.label}</button>`;
    }
    html += '</div>';
  });

  const swatch_sets     = rec.swatch_sets     || [];
  const client_swatches = rec.client_swatches || [];
  // Non-owners: skip Color Palettes if no content
  if (isOwner || swatch_sets.length > 0 || client_swatches.length > 0) {
    html += `<div class="rec-section"><div class="rec-section-label">Color Palettes</div>
      ${renderSwatchSets(swatch_sets)}
    </div>`;
    html += renderClientSwatches(client_swatches);
  }

  return html;
}

function buildEditForm(rec) {
  let html = '';

  html += `<div class="rec-section"><div class="rec-section-label">General Notes</div>
    <textarea class="edit-field" id="field-general_notes" rows="3"
      placeholder="Any other notes…">${escHtml(rec.general_notes || '')}</textarea>
  </div>`;

  getSectionOrder().forEach((cat, ci, arr) => {
    const items   = rec[cat.key] || [];
    const upDis   = ci === 0 ? 'disabled' : '';
    const downDis = ci === arr.length - 1 ? 'disabled' : '';
    html += `<div class="rec-section">
      <div class="rec-section-header">
        <div class="rec-section-label">${cat.label}</div>
        <div class="section-arrows">
          <button class="section-arrow" data-move-section="${cat.key}" data-dir="-1" ${upDis} title="Move up">↑</button>
          <button class="section-arrow" data-move-section="${cat.key}" data-dir="1" ${downDis} title="Move down">↓</button>
        </div>
      </div>
      <div class="items-edit-list">`;
    items.forEach((item, idx) => {
      html += renderItemEditRow(item, cat.key, idx, cat.ph);
    });
    html += `</div>
      <button class="add-item-btn" data-add-category="${cat.key}">+ Add ${cat.label} item</button>
    </div>`;
  });

  html += `<div class="rec-section"><div class="rec-section-label">Color Palettes</div>
    ${renderSwatchSets(rec.swatch_sets || [])}
  </div>`;

  html += renderClientSwatches(rec.client_swatches || []);
  html += `<button class="save-btn" id="save-recs-btn">Save</button>`;
  return html;
}

function renderItemCard(item, reactions, cat, idx) {
  const hasPhoto  = item.photo_url && item.photo_url.trim();
  const hasLink   = item.link && item.link.trim();
  const hasNote   = item.note && item.note.trim();
  return `<div class="item-card item-card-clickable" data-edit-cat="${cat}" data-edit-idx="${idx}">
    <div class="item-photo${hasPhoto ? '' : ' item-photo-empty'} ${hasPhoto ? 'item-photo-previewable' : ''}">
      ${hasPhoto ? `<img src="${escHtml(item.photo_url)}" alt="${escHtml(item.name)}">` : '📷'}
    </div>
    <div class="item-content">
      <div class="item-name">${escHtml(item.name || '—')}</div>
      ${hasNote ? `<div class="item-note">${escHtml(item.note)}</div>` : ''}
      ${hasLink ? `<a class="item-link-btn" href="${escHtml(item.link)}" target="_blank" rel="noopener">View →</a>` : ''}
      ${renderReactionStrip(item.id, reactions)}
    </div>
  </div>`;
}

function renderItemInlineEdit(item, cat, idx, ph) {
  return `<div class="item-card item-card-editing" data-inline-form>
    <div class="item-edit-fields">
      <input class="item-input item-name-input" data-field="name"
             value="${escHtml(item.name || '')}" placeholder="${escHtml(ph || 'Name')}">
      <input class="item-input item-note-input" data-field="note"
             value="${escHtml(item.note || '')}" placeholder="Note (optional)">
      <input class="item-input item-link-input" data-field="link"
             value="${escHtml(item.link || '')}" placeholder="Link URL (optional)">
      <input class="item-input item-photo-input" data-field="photo_url"
             value="${escHtml(item.photo_url || '')}" placeholder="Photo URL (optional)">
    </div>
    <div class="inline-edit-actions">
      <button class="inline-save-btn" data-save-cat="${cat}" data-save-idx="${idx}">✓ Save</button>
      <button class="inline-cancel-btn" data-cancel-cat="${cat}" data-cancel-idx="${idx}">Cancel</button>
      <button class="inline-delete-btn" data-delete-cat="${cat}" data-delete-idx="${idx}">Delete</button>
    </div>
  </div>`;
}

function renderItemEditRow(item, categoryKey, idx, placeholder) {
  return `<div class="item-edit-row">
    <div class="item-edit-fields">
      <input class="item-input item-name-input"
        data-cat="${categoryKey}" data-idx="${idx}" data-field="name"
        value="${escHtml(item.name || '')}" placeholder="${escHtml(placeholder)}">
      <input class="item-input item-note-input"
        data-cat="${categoryKey}" data-idx="${idx}" data-field="note"
        value="${escHtml(item.note || '')}" placeholder="Note (optional)">
      <input class="item-input item-link-input"
        data-cat="${categoryKey}" data-idx="${idx}" data-field="link"
        value="${escHtml(item.link || '')}" placeholder="Link URL (optional)">
      <input class="item-input item-photo-input"
        data-cat="${categoryKey}" data-idx="${idx}" data-field="photo_url"
        value="${escHtml(item.photo_url || '')}" placeholder="Photo URL (optional)">
    </div>
    <button class="item-remove-btn" data-remove-cat="${categoryKey}" data-remove-idx="${idx}">✕</button>
  </div>`;
}

function makeId() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2);
}

function gatherItemEdits() {
  REC_CATEGORIES.forEach(cat => {
    (roomData.recommendations[cat.key] || []).forEach((item, idx) => {
      ['name', 'note', 'link', 'photo_url'].forEach(field => {
        const el = document.querySelector(`.item-input[data-cat="${cat.key}"][data-idx="${idx}"][data-field="${field}"]`);
        if (el) item[field] = el.value;
      });
    });
  });
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

function renderSwatchSets(sets) {
  let html = '<div class="swatch-sets-area">';

  if (!sets.length) {
    html += '<span class="rec-empty">No palettes yet.</span>';
  }

  sets.forEach((set, si) => {
    html += `<div class="swatch-set">
      <div class="swatch-set-header">
        <input class="swatch-set-name-input" data-set-name="${si}" value="${escHtml(set.name || '')}" placeholder="Palette name">
        <button class="btn-danger-tiny" data-remove-set="${si}">Remove</button>
      </div>
      <div class="swatches-compact-row">`;

    (set.swatches || []).forEach((sw, swi) => {
      const active = editingSwatch && editingSwatch.si === si && editingSwatch.swi === swi;
      html += `<div class="swatch-chip">
        <button class="swatch-circle-btn${active ? ' swatch-circle-active' : ''}" data-open-swatch="${si}-${swi}"
                style="background:${sw.color || '#CCCCCC'}"
                title="${escHtml(sw.role || '')}"></button>
        ${sw.role ? `<span class="swatch-circle-role">${escHtml(sw.role)}</span>` : ''}
        ${sw.label ? `<span class="swatch-circle-label">${escHtml(sw.label)}</span>` : ''}
      </div>`;
    });

    html += `<button class="swatch-add-circle-btn" data-add-swatch="${si}" title="Add swatch">+</button>
      </div>`;

    // Inline edit panel for whichever swatch is active in this palette
    if (editingSwatch && editingSwatch.si === si) {
      const swi = editingSwatch.swi;
      const sw  = set.swatches[swi] || {};
      const bmActive = activeBrand === 'bm';
      html += `<div class="swatch-inline-edit">
        <div class="sie-preview" id="sie-preview" style="background:${sw.color || '#CCCCCC'}"></div>
        <div class="sie-brand-toggle">
          <button class="sie-brand-btn${bmActive ? ' active' : ''}" data-brand="bm">Benjamin Moore</button>
          <button class="sie-brand-btn${!bmActive ? ' active' : ''}" data-brand="sw">Sherwin Williams</button>
        </div>
        <div class="bm-search-wrap">
          <input type="text" class="sep-bm-search" id="sie-bm-search"
                 placeholder="Search ${bmActive ? 'Benjamin Moore' : 'Sherwin Williams'}…" autocomplete="off">
          <div class="bm-swatch-results" id="sie-bm-results"></div>
        </div>
        <div class="sie-row">
          <input type="color" id="sie-color" value="${sw.color || '#CCCCCC'}" title="Pick any color">
          <input type="text" id="sie-label" placeholder="Color name (e.g. White Dove OC-17)" value="${escHtml(sw.label || '')}">
        </div>
        <input type="text" id="sie-role" placeholder="Role (e.g. Wall, Trim, Accent)" value="${escHtml(sw.role || '')}">
        <div class="sie-actions">
          <button class="btn-primary-small" id="sie-done">Done</button>
          <button class="btn-danger-tiny" id="sie-remove">Remove swatch</button>
        </div>
      </div>`;
    }

    html += '</div>'; // swatch-set
  });

  html += '<button class="add-set-btn" id="add-palette-set">+ Add palette</button>';
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
          const fieldLabel = REC_CATEGORIES.find(f => f.key === fk)?.label || fk;
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

  // Palette name auto-save on blur
  body.querySelectorAll('[data-set-name]').forEach(input => {
    input.addEventListener('blur', async () => {
      const si = +input.dataset.setName;
      if (roomData.recommendations.swatch_sets[si]) {
        roomData.recommendations.swatch_sets[si].name = input.value;
        await persistRecs();
      }
    });
  });

  // Remove palette
  body.querySelectorAll('[data-remove-set]').forEach(btn => {
    btn.addEventListener('click', async () => {
      if (editingSwatch && editingSwatch.si === +btn.dataset.removeSet) editingSwatch = null;
      roomData.recommendations.swatch_sets.splice(+btn.dataset.removeSet, 1);
      await persistRecs();
      renderRecommendations();
    });
  });

  // Add swatch — open inline edit on the new slot
  body.querySelectorAll('[data-add-swatch]').forEach(btn => {
    btn.addEventListener('click', () => {
      const si    = +btn.dataset.addSwatch;
      const roles = DEFAULT_ROLES[roomData.id] || DEFAULT_ROLES._default;
      const count = roomData.recommendations.swatch_sets[si].swatches.length;
      roomData.recommendations.swatch_sets[si].swatches.push({
        role: roles[count] || 'New', color: '#CCCCCC', label: ''
      });
      editingSwatch = { si, swi: roomData.recommendations.swatch_sets[si].swatches.length - 1 };
      renderRecommendations();
      setTimeout(() => document.getElementById('sie-bm-search')?.focus(), 0);
    });
  });

  // Swatch chip tap — preview in view mode, inline editor in edit mode
  body.querySelectorAll('[data-open-swatch]').forEach(btn => {
    btn.addEventListener('click', () => {
      const [si, swi] = btn.dataset.openSwatch.split('-').map(Number);
      if (!editMode) {
        const sw = roomData.recommendations.swatch_sets[si]?.swatches[swi];
        if (sw) openColorPreview(sw.color || '#ccc', sw.role || '', sw.label || '');
        return;
      }
      if (editingSwatch && editingSwatch.si === si && editingSwatch.swi === swi) {
        editingSwatch = null;
      } else {
        editingSwatch = { si, swi };
      }
      renderRecommendations();
      if (editingSwatch) setTimeout(() => document.getElementById('sie-bm-search')?.focus(), 0);
    });
  });

  // Add new palette
  const addSetBtn = body.querySelector('#add-palette-set');
  if (addSetBtn) {
    addSetBtn.addEventListener('click', async () => {
      const sets  = roomData.recommendations.swatch_sets;
      const roles = DEFAULT_ROLES[roomData.id] || DEFAULT_ROLES._default;
      sets.push({
        name:     'Palette ' + String.fromCharCode(65 + sets.length),
        swatches: roles.map(r => ({ role: r, color: '#CCCCCC', label: '' }))
      });
      await persistRecs();
      renderRecommendations();
    });
  }

  // Inline swatch edit panel listeners
  setupSwatchInlineEditListeners();
}

function setupSwatchInlineEditListeners() {
  const body      = document.getElementById('rec-body');
  const colorInput = body.querySelector('#sie-color');
  const preview    = body.querySelector('#sie-preview');
  const bmSearch   = body.querySelector('#sie-bm-search');
  const bmResults  = body.querySelector('#sie-bm-results');
  const doneBtn    = body.querySelector('#sie-done');
  const removeBtn  = body.querySelector('#sie-remove');

  if (!colorInput) return; // no inline edit panel currently rendered

  colorInput.addEventListener('input', () => {
    preview.style.background = colorInput.value;
  });

  body.querySelectorAll('.sie-brand-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      activeBrand = btn.dataset.brand;
      btn.closest('.swatch-inline-edit').querySelectorAll('.sie-brand-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      bmSearch.placeholder = activeBrand === 'bm' ? 'Search Benjamin Moore…' : 'Search Sherwin Williams…';
      bmSearch.value = '';
      bmResults.innerHTML = '';
      bmResults.classList.remove('open');
    });
  });

  bmSearch.addEventListener('input', () => {
    const q = bmSearch.value.trim().toLowerCase();
    if (!q || q.length < 2) { bmResults.innerHTML = ''; bmResults.classList.remove('open'); return; }

    const catalog = activeBrand === 'bm' ? bmColors : swColors;
    const matches = catalog
      .filter(c => c.name.toLowerCase().includes(q) || c.number.toLowerCase().includes(q))
      .slice(0, 12);

    if (!matches.length) {
      bmResults.innerHTML = '<div class="bm-result-empty">No colors found</div>';
      bmResults.classList.add('open');
      return;
    }

    bmResults.innerHTML = matches.map(c => `
      <div class="bm-result-item" data-hex="${c.hex}" data-name="${escHtml(c.name)}" data-number="${escHtml(c.number)}">
        <div class="bm-result-dot" style="background:${c.hex}"></div>
        <span class="bm-result-name">${escHtml(c.name)}</span>
        <span class="bm-result-num">${escHtml(c.number)}</span>
      </div>`).join('');

    bmResults.querySelectorAll('.bm-result-item').forEach(item => {
      item.addEventListener('click', () => {
        colorInput.value = item.dataset.hex;
        preview.style.background = item.dataset.hex;
        body.querySelector('#sie-label').value = `${item.dataset.name} ${item.dataset.number}`;
        bmSearch.value = '';
        bmResults.innerHTML = '';
        bmResults.classList.remove('open');
        bmSearch.focus();
      });
    });

    bmResults.classList.add('open');
  });

  doneBtn.addEventListener('click', async () => {
    const { si, swi } = editingSwatch;
    const sw = roomData.recommendations.swatch_sets[si].swatches[swi];
    sw.color = colorInput.value;
    sw.role  = body.querySelector('#sie-role').value;
    sw.label = body.querySelector('#sie-label').value;
    editingSwatch = null;
    await persistRecs();
    renderRecommendations();
  });

  removeBtn.addEventListener('click', async () => {
    const { si, swi } = editingSwatch;
    roomData.recommendations.swatch_sets[si].swatches.splice(swi, 1);
    editingSwatch = null;
    await persistRecs();
    renderRecommendations();
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
  gatherItemEdits();
  const body = document.getElementById('rec-body');
  const gnField = body.querySelector('#field-general_notes');
  if (gnField) roomData.recommendations.general_notes = gnField.value;
  await persistRecs();
  showBanner('Saved!');
  exitEditMode();
}

// ─── Edit Toggle ──────────────────────────────────────────────────────────
function setupEditToggle() {
  document.getElementById('edit-toggle').addEventListener('click', () => {
    if (editMode) saveRecommendations(); else enterEditMode();
  });
}

function setupInlineEditListeners() {
  const body = document.getElementById('rec-body');

  body.querySelectorAll('.item-card-clickable').forEach(card => {
    card.addEventListener('click', e => {
      if (e.target.closest('.reaction-strip, .item-link-btn')) return;
      if (e.target.closest('.item-photo-previewable')) {
        const img = card.querySelector('.item-photo img');
        if (img) openLightbox(img.src);
        return;
      }
      inlineEditItem = { cat: card.dataset.editCat, idx: +card.dataset.editIdx };
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-add-category]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat = btn.dataset.addCategory;
      if (!roomData.recommendations[cat]) roomData.recommendations[cat] = [];
      const newIdx = roomData.recommendations[cat].length;
      roomData.recommendations[cat].push({ id: makeId(), name: '', note: '', link: '', photo_url: '' });
      inlineEditItem = { cat, idx: newIdx };
      renderRecommendations();
      setTimeout(() => {
        const nameInput = document.querySelector('.item-card-editing .item-name-input');
        if (nameInput) nameInput.focus();
      }, 0);
    });
  });

  body.querySelectorAll('[data-save-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat  = btn.dataset.saveCat;
      const idx  = +btn.dataset.saveIdx;
      const form = btn.closest('[data-inline-form]');
      const item = roomData.recommendations[cat][idx];
      ['name', 'note', 'link', 'photo_url'].forEach(field => {
        const el = form.querySelector(`[data-field="${field}"]`);
        if (el) item[field] = el.value;
      });
      inlineEditItem = null;
      await persistRecs();
      showBanner('Saved!');
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-cancel-cat]').forEach(btn => {
    btn.addEventListener('click', () => {
      const cat  = btn.dataset.cancelCat;
      const idx  = +btn.dataset.cancelIdx;
      const item = roomData.recommendations[cat][idx];
      if (!item.name && !item.note && !item.link && !item.photo_url) {
        roomData.recommendations[cat].splice(idx, 1);
      }
      inlineEditItem = null;
      renderRecommendations();
    });
  });

  body.querySelectorAll('[data-delete-cat]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const cat = btn.dataset.deleteCat;
      const idx = +btn.dataset.deleteIdx;
      roomData.recommendations[cat].splice(idx, 1);
      inlineEditItem = null;
      await persistRecs();
      showBanner('Deleted.');
      renderRecommendations();
    });
  });

  const gnEl = body.querySelector('[data-edit-gn]');
  if (gnEl) {
    gnEl.addEventListener('click', () => {
      editingGeneralNotes = true;
      renderRecommendations();
      setTimeout(() => {
        const ta = document.getElementById('field-general_notes');
        if (ta) { ta.focus(); ta.selectionStart = ta.value.length; }
      }, 0);
    });
  }

  const saveGnBtn = body.querySelector('#save-gn-btn');
  if (saveGnBtn) {
    saveGnBtn.addEventListener('click', async () => {
      const ta = body.querySelector('#field-general_notes');
      if (ta) roomData.recommendations.general_notes = ta.value;
      editingGeneralNotes = false;
      await persistRecs();
      showBanner('Saved!');
      renderRecommendations();
    });
  }

  const cancelGnBtn = body.querySelector('#cancel-gn-btn');
  if (cancelGnBtn) {
    cancelGnBtn.addEventListener('click', () => {
      editingGeneralNotes = false;
      renderRecommendations();
    });
  }

  body.querySelectorAll('[data-move-section]').forEach(btn => {
    btn.addEventListener('click', () => {
      moveSectionOrder(btn.dataset.moveSection, +btn.dataset.dir);
    });
  });
}

function enterEditMode() {
  inlineEditItem = null;
  editingGeneralNotes = false;
  editMode = true;
  document.getElementById('edit-toggle').textContent = 'Done';
  document.getElementById('edit-toggle').classList.add('active');
  setUploadVisibility(true);
  renderGallery('actual');
  renderGallery('model3d');
  renderGallery('floorPlan');
  renderGallery('inspiration');
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
  renderGallery('inspiration');
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

  function roleDisplayName(fromRole) {
    if (fromRole === 'designer') return 'Builder';
    if (fromRole === 'client')   return 'Owner';
    if (fromRole === 'owner')    return 'Owner';
    if (fromRole === 'builder')  return 'Builder';
    return fromRole;
  }

  messagesList.innerHTML = messages.length
    ? messages.map(m => `
        <div class="message ${m.from_role}">
          <div class="msg-meta">${roleDisplayName(m.from_role)} · ${formatDate(m.created_at)}</div>
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
        from_role: currentUser?.role || 'owner',
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

// ─── Lightbox ─────────────────────────────────────────────────────────────
function openLightbox(url) {
  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-frame">
        <button class="lightbox-close" title="Close">✕</button>
        <img class="lightbox-img" src="" alt="Full-size photo" />
      </div>`;
    document.body.appendChild(lb);
    lb.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeLightbox(); });
  }
  lb.querySelector('.lightbox-img').src = url;
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeLightbox() {
  const lb = document.getElementById('photo-lightbox');
  if (lb) lb.classList.remove('open');
  document.body.style.overflow = '';
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

setupTabs();
init();
