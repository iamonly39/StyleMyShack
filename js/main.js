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
    }
  }

  // Home carousel
  const photos = (sitePhotosRes.data || []).map(row => ({
    ...row,
    publicUrl: sb.storage.from('room-photos').getPublicUrl(row.storage_path).data.publicUrl
  }));
  initHomeCarousel(photos);
  setupSitePhotoUpload();
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
      <div class="modal-backdrop" id="manage-team-backdrop"></div>
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

    modal.querySelector('#manage-team-backdrop').addEventListener('click', closeManageTeamModal);
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

  const { error } = await sb.from('user_roles').insert({ email, role: 'builder' });
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

init();
