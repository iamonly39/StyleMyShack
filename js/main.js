// ─── Home Carousel State ───────────────────────────────────────────────────
let homeSlide = 0;
let homeTimer = null;
let sitePhotos = [];

// ─── Helpers ──────────────────────────────────────────────────────────────
function showBanner(msg) {
  const banner = document.getElementById('save-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 3000);
}

function fmtStatus(s) {
  return s === 'complete'    ? 'Complete'
       : s === 'in-progress' ? 'In Progress'
       : 'Not Started';
}

async function loadRoomThumb(roomId) {
  const { data: pinned } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .eq('is_pinned', true)
    .maybeSingle();

  if (pinned) return sb.storage.from('room-photos').getPublicUrl(pinned.storage_path).data.publicUrl;

  const { data: first } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return first ? sb.storage.from('room-photos').getPublicUrl(first.storage_path).data.publicUrl : null;
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const user = await waitForAuth();

  const [roomsRes, settingsRes, sitePhotosRes] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order'),
    sb.from('settings').select('*'),
    sb.from('site_photos').select('*').order('sort_order')
  ]);

  // Hide upload and delete controls for non-owners
  if (user?.role !== 'owner') {
    const uploadLabel = document.querySelector('.home-carousel-upload');
    if (uploadLabel) uploadLabel.style.display = 'none';
  }

  // Cabin name
  const cabinName = settingsRes.data?.find(s => s.key === 'cabin_name')?.value || 'My Cabin';
  const nameEl = document.getElementById('cabin-name');
  nameEl.textContent = cabinName;
  document.title = cabinName + ' — StyleMyShack';

  let savedName = cabinName;
  nameEl.addEventListener('click', () => {
    if (user?.role !== 'owner') return;
    if (nameEl.contentEditable === 'true') return;
    nameEl.contentEditable = 'true';
    nameEl.classList.add('title-editing');
    nameEl.focus();
    const range = document.createRange();
    range.selectNodeContents(nameEl);
    const sel = window.getSelection();
    sel.removeAllRanges();
    sel.addRange(range);
  });
  nameEl.addEventListener('keydown', e => {
    if (e.key === 'Enter') { e.preventDefault(); nameEl.blur(); }
    if (e.key === 'Escape') { nameEl.textContent = savedName; nameEl.blur(); }
  });
  nameEl.addEventListener('blur', async () => {
    nameEl.contentEditable = 'false';
    nameEl.classList.remove('title-editing');
    const newName = nameEl.textContent.trim() || savedName;
    nameEl.textContent = newName;
    if (newName !== savedName) {
      savedName = newName;
      document.title = newName + ' — StyleMyShack';
      await sb.from('settings').upsert({ key: 'cabin_name', value: newName }, { onConflict: 'key' });
      showBanner('Saved!');
    }
  });

  // Project Summary (home-level)
  const ownerNotesEl = document.getElementById('owner-notes-text');
  if (ownerNotesEl) {
    const ownerNotesVal = settingsRes.data?.find(s => s.key === 'owner_notes')?.value || '';
    renderOwnerBrief(ownerNotesEl, ownerNotesVal, user);
  }

  // Room cards
  const rooms = roomsRes.data || [];
  const grid  = document.getElementById('room-grid');
  const empty = document.getElementById('rooms-empty');

  if (rooms.length === 0) {
    empty.style.display = '';
  } else {
    rooms.forEach(room => {
      const status = room.status || 'not-started';
      const card = document.createElement('a');
      card.className = 'room-card';
      card.href = `room.html?id=${room.id}`;
      card.innerHTML = `
        <div class="room-card-photo placeholder" id="thumb-${room.id}">${room.emoji || '🏠'}</div>
        <div class="room-card-body">
          <h3>${room.name}</h3>
          <p>${room.description || ''}</p>
          <span class="status-badge ${status}">${fmtStatus(status)}</span>
        </div>
      `;
      grid.appendChild(card);

      // Load thumbnail async — swap in when ready
      loadRoomThumb(room.id).then(url => {
        if (!url) return;
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

  // Manage team button (owner only)
  if (user?.role === 'owner') {
    const h2 = document.querySelector('.rooms-section h2');
    if (h2) {
      const headerRow = document.createElement('div');
      headerRow.className = 'rooms-section-header';
      h2.parentElement.insertBefore(headerRow, h2);
      headerRow.appendChild(h2);

      const manageBtn = document.createElement('button');
      manageBtn.id = 'manage-team-btn';
      manageBtn.className = 'manage-team-btn';
      manageBtn.textContent = 'Manage team';
      manageBtn.addEventListener('click', openManageTeamModal);
      headerRow.appendChild(manageBtn);

      const addRoomBtn = document.createElement('button');
      addRoomBtn.className = 'manage-team-btn';
      addRoomBtn.textContent = '+ Add Room';
      addRoomBtn.addEventListener('click', openAddRoomModal);
      headerRow.appendChild(addRoomBtn);
    }
  }

  // Home carousel
  const photos = (sitePhotosRes.data || []).map(row => ({
    ...row,
    publicUrl: sb.storage.from('room-photos').getPublicUrl(row.storage_path).data.publicUrl
  }));
  initHomeCarousel(photos);
  setupSitePhotoUpload();

  if (user?.role === 'owner' || user?.role === 'builder') {
    loadHomeBuilderUpdates(roomsRes.data || [], user);
  }

  loadHomeComments(user);
  loadWhatsNew();
}

// ─── Project Summary ────────────────────────────────────────────────────────
function renderOwnerBrief(el, value, user) {
  const placeholder = el.dataset.placeholder || 'Add a project overview…';
  if (value) {
    el.textContent = value;
    el.classList.remove('is-placeholder');
  } else {
    el.textContent = placeholder;
    el.classList.add('is-placeholder');
  }

  let savedValue = value;

  el.addEventListener('click', function startEdit() {
    if (user?.role !== 'owner') return;
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
    if (e.key === 'Escape') { el.textContent = savedValue || placeholder; el.blur(); }
  });

  el.addEventListener('blur', async () => {
    el.contentEditable = 'false';
    el.classList.remove('owner-brief-editing');
    const newValue = el.textContent.trim();
    if (newValue !== savedValue) {
      savedValue = newValue;
      await sb.from('settings').upsert({ key: 'owner_notes', value: newValue }, { onConflict: 'key' });
      showBanner('Saved!');
    }
    if (!savedValue) {
      el.textContent = 'Add a project overview…';
      el.classList.add('is-placeholder');
    } else {
      el.textContent = savedValue;
      el.classList.remove('is-placeholder');
    }
  });
}

// ─── Home Carousel ─────────────────────────────────────────────────────────
function initHomeCarousel(photos) {
  sitePhotos = photos;
  homeSlide  = 0;
  renderHomeCarousel();
  startHomeTimer();
}

function renderHomeCarousel() {
  const wrap    = document.getElementById('home-carousel-wrap');
  const dotsEl  = document.getElementById('home-carousel-dots');
  const counter = document.getElementById('home-carousel-counter');
  if (!wrap) return;

  if (sitePhotos.length === 0) {
    wrap.innerHTML = `
      <div class="home-carousel-slide active">
        <div class="home-carousel-empty">
          <div class="home-carousel-empty-icon">📷</div>
          <p>Got photos of the cabin? Add them here to showcase the space.</p>
        </div>
      </div>`;
    dotsEl.innerHTML  = '';
    counter.textContent = '';
    return;
  }

  const isOwner = currentUser?.role === 'owner';
  wrap.innerHTML = sitePhotos.map((p, i) =>
    `<div class="home-carousel-slide${i === homeSlide ? ' active' : ''}">
       <img src="${p.publicUrl}" alt="Site photo ${i + 1}" class="carousel-clickable">
       ${isOwner ? `<button class="carousel-delete-btn" data-id="${p.id}" data-path="${p.storage_path}" title="Delete photo">✕</button>` : ''}
     </div>`
  ).join('');

  wrap.querySelectorAll('.carousel-clickable').forEach((img, i) => {
    img.addEventListener('click', () => openLightbox(sitePhotos[i].publicUrl));
  });

  wrap.querySelectorAll('.carousel-delete-btn').forEach(btn => {
    btn.addEventListener('click', async e => {
      e.stopPropagation();
      const id   = btn.dataset.id;
      const path = btn.dataset.path;
      await sb.storage.from('room-photos').remove([path]);
      await sb.from('site_photos').delete().eq('id', id);
      sitePhotos = sitePhotos.filter(p => p.id != id);
      homeSlide  = Math.min(homeSlide, Math.max(0, sitePhotos.length - 1));
      renderHomeCarousel();
      startHomeTimer();
      showBanner('Photo deleted.');
    });
  });

  if (sitePhotos.length > 1) {
    dotsEl.innerHTML = sitePhotos.map((_, i) =>
      `<div class="home-carousel-dot${i === homeSlide ? ' active' : ''}" data-idx="${i}"></div>`
    ).join('');
    counter.textContent = `${homeSlide + 1} / ${sitePhotos.length}`;
    dotsEl.querySelectorAll('.home-carousel-dot').forEach(dot => {
      dot.addEventListener('click', () => goToSlide(+dot.dataset.idx));
    });
  } else {
    dotsEl.innerHTML    = '';
    counter.textContent = '1 photo';
  }
}

function goToSlide(i) {
  homeSlide = i;
  document.querySelectorAll('.home-carousel-slide').forEach((s, idx) =>
    s.classList.toggle('active', idx === i));
  document.querySelectorAll('.home-carousel-dot').forEach((d, idx) =>
    d.classList.toggle('active', idx === i));
  const counter = document.getElementById('home-carousel-counter');
  if (counter && sitePhotos.length > 1) counter.textContent = `${i + 1} / ${sitePhotos.length}`;
  startHomeTimer();
}

function startHomeTimer() {
  clearInterval(homeTimer);
  if (sitePhotos.length > 1) {
    homeTimer = setInterval(() => {
      homeSlide = (homeSlide + 1) % sitePhotos.length;
      document.querySelectorAll('.home-carousel-slide').forEach((s, i) =>
        s.classList.toggle('active', i === homeSlide));
      document.querySelectorAll('.home-carousel-dot').forEach((d, i) =>
        d.classList.toggle('active', i === homeSlide));
      const counter = document.getElementById('home-carousel-counter');
      if (counter) counter.textContent = `${homeSlide + 1} / ${sitePhotos.length}`;
    }, 4000);
  }
}

// ─── Site Photo Upload ─────────────────────────────────────────────────────
function setupSitePhotoUpload() {
  const input = document.getElementById('site-photo-upload');
  if (!input) return;

  input.addEventListener('change', async () => {
    const files = Array.from(input.files);
    if (!files.length) return;

    showBanner('Uploading…');
    for (const file of files) {
      const path = `site/${Date.now()}-${file.name}`;
      const { error } = await sb.storage.from('room-photos').upload(path, file);
      if (!error) {
        const { data: row } = await sb.from('site_photos').insert({
          storage_path: path,
          sort_order:   Date.now()
        }).select().single();
        if (row) {
          sitePhotos.push({
            ...row,
            publicUrl: sb.storage.from('room-photos').getPublicUrl(path).data.publicUrl
          });
        }
      } else {
        console.error('Upload error:', error);
        showBanner('Upload failed — try again.');
        return;
      }
    }

    input.value = '';
    homeSlide = sitePhotos.length - 1;
    renderHomeCarousel();
    startHomeTimer();
    showBanner('Uploaded!');
  });
}

// ─── Manage Team Modal ────────────────────────────────────────────────────
function openManageTeamModal() {
  let modal = document.getElementById('manage-team-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'manage-team-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal manage-team-modal-card">
        <h3>Team Access</h3>
        <p class="modal-hint">Builders can upload progress photos and participate in room threads.</p>
        <div id="builder-list" class="builder-list"></div>
        <div class="manage-team-add-row">
          <input type="email" id="builder-email-input" placeholder="builder@email.com" />
          <button id="builder-add-btn" class="btn-primary-small">Add</button>
        </div>
        <div id="builder-error" class="modal-error"></div>
        <div class="manage-team-close-row">
          <button id="manage-team-close" class="auth-btn-secondary">Close</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', e => { if (e.target === modal) closeManageTeamModal(); });
    modal.querySelector('#manage-team-close').addEventListener('click', closeManageTeamModal);

    modal.querySelector('#builder-add-btn').addEventListener('click', addBuilder);
    modal.querySelector('#builder-email-input').addEventListener('keydown', e => {
      if (e.key === 'Enter') addBuilder();
    });
  }

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  loadBuilderList();
}

function closeManageTeamModal() {
  const modal = document.getElementById('manage-team-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

// ─── Add Room Modal ──────────────────────────────────────────────────────────
function openAddRoomModal() {
  let modal = document.getElementById('add-room-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'add-room-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal">
        <h3>Add a Room</h3>
        <div class="manage-team-add-row" style="flex-direction:column;gap:0.6rem;">
          <input type="text" id="add-room-name" placeholder="Room name" style="width:100%" />
          <input type="text" id="add-room-description" placeholder="Description (optional)" style="width:100%" />
          <input type="text" id="add-room-emoji" placeholder="🏠 Emoji (optional)" style="width:100%" />
          <input type="number" id="add-room-sort" placeholder="Sort order (e.g. 5)" style="width:100%" />
        </div>
        <div id="add-room-error" class="modal-error"></div>
        <div class="manage-team-close-row" style="justify-content:flex-end;gap:0.5rem;">
          <button id="add-room-cancel" class="auth-btn-secondary">Cancel</button>
          <button id="add-room-submit" class="btn-primary-small">Add Room</button>
        </div>
      </div>`;
    document.body.appendChild(modal);

    modal.addEventListener('click', e => { if (e.target === modal) closeAddRoomModal(); });
    modal.querySelector('#add-room-cancel').addEventListener('click', closeAddRoomModal);
    modal.querySelector('#add-room-submit').addEventListener('click', submitAddRoom);
  }

  // Reset form on each open
  modal.querySelector('#add-room-name').value = '';
  modal.querySelector('#add-room-description').value = '';
  modal.querySelector('#add-room-emoji').value = '';
  modal.querySelector('#add-room-sort').value = '';
  const errEl = modal.querySelector('#add-room-error');
  errEl.textContent = '';
  errEl.style.display = 'none';
  modal.querySelector('#add-room-submit').disabled = false;

  modal.classList.add('open');
  document.body.style.overflow = 'hidden';
  modal.querySelector('#add-room-name').focus();
}

function closeAddRoomModal() {
  const modal = document.getElementById('add-room-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

async function submitAddRoom() {
  const nameInput = document.getElementById('add-room-name');
  const descInput = document.getElementById('add-room-description');
  const emojiInput = document.getElementById('add-room-emoji');
  const sortInput = document.getElementById('add-room-sort');
  const errorEl = document.getElementById('add-room-error');
  const submitBtn = document.getElementById('add-room-submit');

  const name = nameInput.value.trim();
  const description = descInput.value.trim();
  const emoji = emojiInput.value.trim();
  const sortOrder = sortInput.value.trim();

  errorEl.textContent = '';

  if (!name) {
    errorEl.textContent = 'Room name is required.';
    errorEl.style.display = 'block';
    nameInput.focus();
    return;
  }

  const id = name.toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '');

  submitBtn.disabled = true;

  const { error: roomError } = await sb.from('rooms').insert({
    id,
    name,
    description: description || null,
    emoji: emoji || null,
    sort_order: parseInt(sortOrder) || 99,
    status: 'not-started'
  });

  if (roomError) {
    errorEl.textContent = roomError.code === '23505' ? 'A room with that name already exists.' : roomError.message;
    errorEl.style.display = 'block';
    submitBtn.disabled = false;
    return;
  }

  const { error: recError } = await sb.from('recommendations').insert({ room_id: id });

  if (recError) {
    // Room was created; recommendations insert failed — non-fatal, proceed
    console.warn('recommendations insert failed:', recError.message);
  }

  closeAddRoomModal();
  showBanner('Room added!');
  window.location.reload();
}

async function loadBuilderList() {
  const listEl = document.getElementById('builder-list');
  if (!listEl) return;

  listEl.innerHTML = '<p style="font-family:system-ui;font-size:0.85rem;color:var(--text-muted)">Loading…</p>';

  const { data, error } = await sb.from('user_roles')
    .select('*')
    .eq('role', 'builder')
    .order('created_at');

  if (error) {
    listEl.innerHTML = '<p style="font-family:system-ui;font-size:0.85rem;color:#c0392b">Could not load builders.</p>';
    return;
  }

  if (!data || data.length === 0) {
    listEl.innerHTML = '<p class="rec-empty">No builders added yet.</p>';
    return;
  }

  listEl.innerHTML = data.map(row => `
    <div class="builder-row">
      <span class="builder-email">${escapeHtml(row.email)}</span>
      <button class="btn-danger-tiny" data-remove-builder="${escapeHtml(row.email)}" title="Remove">✕</button>
    </div>`).join('');

  listEl.querySelectorAll('[data-remove-builder]').forEach(btn => {
    btn.addEventListener('click', () => removeBuilder(btn.dataset.removeBuilder));
  });
}

async function addBuilder() {
  const input = document.getElementById('builder-email-input');
  const errorEl = document.getElementById('builder-error');
  if (!input || !errorEl) return;

  const email = input.value.trim().toLowerCase();
  errorEl.style.display = 'none';
  errorEl.textContent = '';

  if (!email) return;

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    errorEl.textContent = 'Please enter a valid email address.';
    errorEl.style.display = '';
    return;
  }

  const btn = document.getElementById('builder-add-btn');
  if (btn) btn.disabled = true;

  const { error } = await sb.from('user_roles').insert({ email, role: 'builder' });

  if (btn) btn.disabled = false;

  if (error) {
    if (error.code === '23505') {
      errorEl.textContent = 'That email is already a builder.';
    } else {
      errorEl.textContent = 'Failed to add builder — try again.';
    }
    errorEl.style.display = '';
    return;
  }

  input.value = '';
  loadBuilderList();
}

async function removeBuilder(email) {
  const errorEl = document.getElementById('builder-error');
  if (errorEl) { errorEl.style.display = 'none'; errorEl.textContent = ''; }

  const { error } = await sb.from('user_roles').delete().eq('email', email).eq('role', 'builder');
  if (error) {
    if (errorEl) {
      errorEl.textContent = 'Failed to remove builder — try again.';
      errorEl.style.display = '';
    }
    return;
  }

  loadBuilderList();
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
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

// ─── Home Builder Updates ─────────────────────────────────────────────────
let homeBuilderUpdates = [];

async function loadHomeBuilderUpdates(rooms, user) {
  const { data, error } = await sb.from('builder_updates')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) return;

  homeBuilderUpdates = data || [];

  const section = document.getElementById('home-builder-updates-section');
  const uploadArea = document.getElementById('home-builder-updates-upload');
  if (section) section.style.display = '';
  if (uploadArea) uploadArea.style.display = '';

  renderHomeBuilderUpdates(rooms, user);
  setupHomeBuilderUpdateUpload(rooms, user);
}

function renderHomeBuilderUpdates(rooms, user) {
  const grid = document.getElementById('home-builder-updates-grid');
  if (!grid) return;

  const roomMap = {};
  rooms.forEach(r => { roomMap[r.id] = r.name; });

  if (!homeBuilderUpdates.length) {
    grid.innerHTML = '<p class="builder-updates-placeholder">No updates yet.</p>';
    return;
  }

  grid.innerHTML = homeBuilderUpdates.map(item => {
    const url = sb.storage.from('room-photos').getPublicUrl(item.storage_path).data.publicUrl;
    const roomLabel = item.room_id ? escHtml(roomMap[item.room_id] || item.room_id) : 'Project';
    const caption = item.caption ? `<div class="builder-update-caption">${escHtml(item.caption)}</div>` : '';
    const promote = (user?.role === 'owner' && !item.promoted_to_gallery)
      ? `<button class="builder-promote-btn" data-update-id="${escHtml(item.id)}">Promote to gallery</button>`
      : item.promoted_to_gallery ? `<span class="builder-in-gallery">In gallery ✓</span>` : '';
    return `<div class="builder-update-card">
      <img class="builder-update-img" src="${escHtml(url)}" alt="${escHtml(item.caption || '')}" data-url="${escHtml(url)}" />
      ${caption}
      <div class="builder-update-body">
        <div class="builder-update-meta">${roomLabel} · ${escHtml(item.uploaded_by)} · ${formatDate(item.created_at)}</div>
        ${promote}
      </div>
    </div>`;
  }).join('');

  grid.querySelectorAll('.builder-update-img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.dataset.url));
  });

  grid.querySelectorAll('.builder-promote-btn').forEach(btn => {
    btn.addEventListener('click', async () => {
      const id = btn.dataset.updateId;
      const { error } = await sb.from('builder_updates').update({ promoted_to_gallery: true }).eq('id', id);
      if (error) { showBanner('Failed — try again.'); return; }
      const item = homeBuilderUpdates.find(u => u.id === id);
      if (item) item.promoted_to_gallery = true;
      renderHomeBuilderUpdates(rooms, user);
      showBanner('Added to gallery!');
    });
  });
}

function setupHomeBuilderUpdateUpload(rooms, user) {
  const fileInput = document.getElementById('home-builder-update-file');
  if (!fileInput || fileInput.dataset.listenerAttached) return;
  fileInput.dataset.listenerAttached = 'true';

  fileInput.addEventListener('change', async () => {
    const files = Array.from(fileInput.files);
    if (!files.length) return;

    const caption = document.getElementById('home-builder-update-caption')?.value.trim() || '';
    fileInput.disabled = true;
    showBanner('Uploading…');

    for (const file of files) {
      const path = `project/builder-updates/${Date.now()}-${file.name}`;
      const { error: upErr } = await sb.storage.from('room-photos').upload(path, file);
      if (upErr) { showBanner('Upload failed — try again.'); continue; }

      const { error: dbErr } = await sb.from('builder_updates').insert({
        room_id: null,
        storage_path: path,
        caption,
        uploaded_by: currentUser.email
      });
      if (dbErr) { showBanner('Save failed — try again.'); continue; }
    }

    fileInput.disabled = false;
    fileInput.value = '';
    const captionInput = document.getElementById('home-builder-update-caption');
    if (captionInput) captionInput.value = '';
    showBanner('Update posted!');
    loadHomeBuilderUpdates(rooms, user);
  });
}

function formatDate(isoString) {
  if (!isoString) return '';
  return new Date(isoString).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Home Comments ────────────────────────────────────────────────────────
async function loadHomeComments(user) {
  const { data } = await sb.from('comments')
    .select('*')
    .is('room_id', null)
    .order('created_at', { ascending: true });
  renderHomeComments(data || [], user);
}

function renderHomeComments(comments, user) {
  const listEl    = document.getElementById('home-comments-list');
  const composeEl = document.getElementById('home-comments-compose');
  if (!listEl || !composeEl) return;

  const isOwner = user?.role === 'owner';

  // Render comment list
  if (comments.length === 0) {
    listEl.innerHTML = '<div class="comments-empty">No comments yet. Be the first!</div>';
  } else {
    listEl.innerHTML = comments.map(c => `
      <div class="comment-item">
        <div class="comment-body">
          <div class="comment-meta">${escHtml(c.display_name || c.user_email)} &middot; ${formatDate(c.created_at)}</div>
          <div class="comment-text">${escHtml(c.text)}</div>
        </div>
        ${isOwner ? `<button class="comment-delete-btn" data-comment-id="${escHtml(c.id)}" title="Delete">✕</button>` : ''}
      </div>`).join('');

    if (isOwner) {
      listEl.querySelectorAll('.comment-delete-btn').forEach(btn => {
        btn.addEventListener('click', async () => {
          const id = btn.dataset.commentId;
          await sb.from('comments').delete().eq('id', id);
          const idx = comments.findIndex(c => c.id === id);
          if (idx !== -1) comments.splice(idx, 1);
          renderHomeComments(comments, user);
        });
      });
    }
  }

  // Render compose area
  if (user) {
    composeEl.innerHTML = `
      <input type="text" class="comment-name-input" id="home-comment-name" placeholder="Your name (optional)" />
      <textarea class="comment-text-input" id="home-comment-text" placeholder="Leave a comment…"></textarea>
      <button class="btn-primary-small comment-submit-btn" id="home-comment-submit">Post</button>`;

    document.getElementById('home-comment-submit').addEventListener('click', async () => {
      const nameInput = document.getElementById('home-comment-name');
      const textInput = document.getElementById('home-comment-text');
      const text = textInput.value.trim();
      if (!text) return;

      const { data: newComment } = await sb.from('comments').insert({
        room_id:      null,
        user_email:   user.email,
        display_name: nameInput.value.trim(),
        text
      }).select().single();

      nameInput.value = '';
      textInput.value = '';

      const updated = [...comments];
      if (newComment) updated.push(newComment);
      renderHomeComments(updated, user);
    });
  } else {
    composeEl.innerHTML = `<div class="comments-signin-prompt">
      <a class="comments-signin-link" id="home-comment-signin">Sign in</a> to leave a comment.
    </div>`;
    document.getElementById('home-comment-signin')?.addEventListener('click', () => openSignInModal());
  }
}

// ─── What's New ───────────────────────────────────────────────────────────
async function loadWhatsNew() {
  const el = document.getElementById('whats-new-list');
  if (!el) return;

  try {
    const [roomsRes, updatesRes] = await Promise.all([
      sb.from('rooms').select('id, name, emoji'),
      sb.from('builder_updates').select('*').eq('promoted_to_gallery', true).order('created_at', { ascending: false }).limit(10)
    ]);

    const roomMap = {};
    (roomsRes.data || []).forEach(r => { roomMap[r.id] = r; });

    const updates = updatesRes.data || [];

    if (!updates.length) {
      el.innerHTML = '<p class="whats-new-empty">Nothing new yet — check back soon.</p>';
      return;
    }

    el.innerHTML = updates.map(item => {
      const url = sb.storage.from('room-photos').getPublicUrl(item.storage_path).data.publicUrl;
      const room = item.room_id ? roomMap[item.room_id] : null;
      const roomLabel = room ? escHtml(room.emoji + ' ' + room.name) : 'Project';
      const caption = item.caption ? `<div class="whats-new-caption">${escHtml(item.caption)}</div>` : '';
      return `<div class="whats-new-item">
        <img class="whats-new-thumb" src="${escHtml(url)}" alt="${escHtml(item.caption || '')}" data-url="${escHtml(url)}" />
        <div class="whats-new-body">
          <div class="whats-new-room">${roomLabel}</div>
          ${caption}
          <div class="whats-new-meta">${escHtml(item.uploaded_by)} &middot; ${formatDate(item.created_at)}</div>
        </div>
      </div>`;
    }).join('');

    el.querySelectorAll('.whats-new-thumb').forEach(img => {
      img.addEventListener('click', () => openLightbox(img.dataset.url));
    });
  } catch (e) {
    // silently do nothing
  }
}

init();
