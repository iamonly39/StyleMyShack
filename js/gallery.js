// ─── State ────────────────────────────────────────────────────────────────
let allPhotos  = [];   // unified array: { id, roomId, roomName, url, caption, source }
let activeFilters = new Set();

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  await waitForAuth();

  const [roomsRes, photosRes, updatesRes] = await Promise.all([
    sb.from('rooms').select('id, name, emoji').order('sort_order'),
    sb.from('photos').select('*').eq('in_gallery', true).order('sort_order'),
    sb.from('builder_updates').select('*').eq('promoted_to_gallery', true).order('created_at')
  ]);

  if (roomsRes.error || photosRes.error || updatesRes.error) {
    showBanner('Failed to load gallery — try again.');
    return;
  }

  const rooms   = roomsRes.data   || [];
  const photos  = photosRes.data  || [];
  const updates = updatesRes.data || [];

  // Build a room lookup: id → { name, emoji }
  const roomMap = {};
  rooms.forEach(r => { roomMap[r.id] = r; });

  // Merge owner photos
  photos.forEach(p => {
    const room = roomMap[p.room_id];
    allPhotos.push({
      id:       p.id,
      roomId:   p.room_id,
      roomName: room ? room.name : p.room_id,
      url:      sb.storage.from('room-photos').getPublicUrl(p.storage_path).data.publicUrl,
      caption:  null,
      source:   'photo'
    });
  });

  // Merge promoted builder updates
  updates.forEach(u => {
    const room = roomMap[u.room_id];
    allPhotos.push({
      id:       u.id,
      roomId:   u.room_id,
      roomName: room ? room.name : u.room_id,
      url:      sb.storage.from('room-photos').getPublicUrl(u.storage_path).data.publicUrl,
      caption:  u.caption || null,
      source:   'builder_update'
    });
  });

  renderFilterStrip(rooms);
  renderGrid();
}

// ─── Filter Strip ─────────────────────────────────────────────────────────
function renderFilterStrip(rooms) {
  const strip = document.getElementById('gallery-filter-strip');
  if (!strip) return;

  // Only include rooms that actually have photos in the gallery
  const roomsWithPhotos = rooms.filter(r => allPhotos.some(p => p.roomId === r.id));

  let html = '';
  roomsWithPhotos.forEach(r => {
    const active = activeFilters.has(r.id) ? ' gallery-filter-active' : '';
    html += `<button class="gallery-filter-btn${active}" data-filter="${escHtml(r.id)}">${escHtml(r.emoji ? r.emoji + ' ' : '')}${escHtml(r.name)}</button>`;
  });

  strip.innerHTML = html;

  strip.querySelectorAll('.gallery-filter-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const id = btn.dataset.filter;
      if (activeFilters.has(id)) {
        activeFilters.delete(id);
        btn.classList.remove('gallery-filter-active');
      } else {
        activeFilters.add(id);
        btn.classList.add('gallery-filter-active');
      }
      renderGrid();
    });
  });
}

// ─── Grid ─────────────────────────────────────────────────────────────────
function renderGrid() {
  const grid    = document.getElementById('gallery-grid');
  const isOwner = currentUser?.role === 'owner';

  const filtered = activeFilters.size === 0
    ? allPhotos
    : allPhotos.filter(p => activeFilters.has(p.roomId));

  if (!filtered.length) {
    grid.innerHTML = '<p class="gallery-empty">No gallery photos yet.</p>';
    return;
  }

  grid.innerHTML = filtered.map(photo => {
    const captionHtml = photo.caption
      ? `<div class="gallery-card-caption">${escHtml(photo.caption)}</div>`
      : '';

    let ownerControls = '';
    if (isOwner && photo.source === 'photo') {
      ownerControls = `<button class="gallery-remove-btn" data-photo-id="${escHtml(String(photo.id))}">Remove from gallery</button>`;
    } else if (isOwner && photo.source === 'builder_update') {
      ownerControls = `<span class="builder-in-gallery">In gallery ✓</span>`;
    }

    return `<div class="gallery-photo-card" data-room-id="${escHtml(photo.roomId)}">
      <img src="${escHtml(photo.url)}" alt="${escHtml(photo.roomName)}" data-url="${escHtml(photo.url)}" />
      <div class="gallery-card-body">
        <div class="gallery-card-room">${escHtml(photo.roomName)}</div>
        ${captionHtml}
        ${ownerControls}
      </div>
    </div>`;
  }).join('');

  // Lightbox listeners
  grid.querySelectorAll('img').forEach(img => {
    img.addEventListener('click', () => openLightbox(img.dataset.url));
  });

  // Remove-from-gallery listeners (owner, photos table only)
  if (isOwner) {
    grid.querySelectorAll('.gallery-remove-btn').forEach(btn => {
      btn.addEventListener('click', async () => {
        const photoId = btn.dataset.photoId;
        const { error } = await sb.from('photos').update({ in_gallery: false }).eq('id', photoId);
        if (error) {
          showBanner('Failed to remove — try again.');
          return;
        }
        // Remove from local state and re-render
        allPhotos = allPhotos.filter(p => String(p.id) !== photoId);
        renderGrid();
        showBanner('Removed from gallery.');
      });
    });
  }
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
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 3000);
}

function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ─── Bootstrap ────────────────────────────────────────────────────────────
init();
