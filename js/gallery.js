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

  // Build a room lookup: id → { name, emoji, order }
  const roomMap = {};
  rooms.forEach((r, i) => { roomMap[r.id] = { ...r, order: i }; });

  // Merge owner photos
  photos.forEach(p => {
    const room = roomMap[p.room_id];
    allPhotos.push({
      id:        p.id,
      roomId:    p.room_id,
      roomName:  room ? room.name : p.room_id,
      roomOrder: room ? room.order : 9999,
      url:       sb.storage.from('room-photos').getPublicUrl(p.storage_path).data.publicUrl,
      caption:   null,
      source:    'photo'
    });
  });

  // Merge promoted builder updates — support both old single path and new photo_paths array
  updates.forEach(u => {
    const room = roomMap[u.room_id];
    const caption = u.message || u.caption || null;
    const paths = u.photo_paths?.length ? u.photo_paths : (u.storage_path ? [u.storage_path] : []);
    if (!paths.length) return; // text-only updates have no gallery photos
    paths.forEach((path, i) => {
      allPhotos.push({
        id:        `${u.id}-${i}`,
        roomId:    u.room_id,
        roomName:  room ? room.name : u.room_id,
        roomOrder: room ? room.order : 9999,
        url:       sb.storage.from('room-photos').getPublicUrl(path).data.publicUrl,
        caption:   caption,
        source:    'builder_update'
      });
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
    ? [...allPhotos].sort((a, b) => a.roomOrder - b.roomOrder)
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

  // Lightbox listeners — pass full filtered list + index for navigation
  grid.querySelectorAll('img').forEach((img, i) => {
    img.addEventListener('click', () => openGalleryLightbox(filtered, i));
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

// ─── Gallery Lightbox (navigable) ─────────────────────────────────────────
let lbPhotos = [];
let lbIndex  = 0;

function openGalleryLightbox(photos, index) {
  lbPhotos = photos;
  lbIndex  = index;

  let lb = document.getElementById('photo-lightbox');
  if (!lb) {
    lb = document.createElement('div');
    lb.id = 'photo-lightbox';
    lb.innerHTML = `
      <div class="lightbox-backdrop"></div>
      <div class="lightbox-frame">
        <button class="lightbox-close" title="Close">✕</button>
        <button class="lightbox-prev" title="Previous">&#8592;</button>
        <button class="lightbox-next" title="Next">&#8594;</button>
        <img class="lightbox-img" src="" alt="Full-size photo" />
        <div class="lightbox-caption"></div>
      </div>`;
    document.body.appendChild(lb);
    lb.querySelector('.lightbox-backdrop').addEventListener('click', closeLightbox);
    lb.querySelector('.lightbox-close').addEventListener('click', closeLightbox);
    lb.querySelector('.lightbox-prev').addEventListener('click', e => { e.stopPropagation(); navigateLightbox(-1); });
    lb.querySelector('.lightbox-next').addEventListener('click', e => { e.stopPropagation(); navigateLightbox(1); });
    document.addEventListener('keydown', lbKeyHandler);
  }

  renderLightboxFrame(lb);
  lb.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function renderLightboxFrame(lb) {
  const photo = lbPhotos[lbIndex];
  lb.querySelector('.lightbox-img').src = photo.url;
  lb.querySelector('.lightbox-caption').textContent = photo.caption || photo.roomName || '';
  lb.querySelector('.lightbox-prev').style.display = lbPhotos.length > 1 ? '' : 'none';
  lb.querySelector('.lightbox-next').style.display = lbPhotos.length > 1 ? '' : 'none';
}

function navigateLightbox(dir) {
  lbIndex = (lbIndex + dir + lbPhotos.length) % lbPhotos.length;
  const lb = document.getElementById('photo-lightbox');
  if (lb) renderLightboxFrame(lb);
}

function lbKeyHandler(e) {
  if (e.key === 'Escape')      closeLightbox();
  if (e.key === 'ArrowLeft')   navigateLightbox(-1);
  if (e.key === 'ArrowRight')  navigateLightbox(1);
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
