// ─── Home Carousel State ───────────────────────────────────────────────────
let homeSlide = 0;
let homeTimer = null;
let sitePhotos = [];

// ─── Helpers ──────────────────────────────────────────────────────────────
async function loadRoomThumb(roomId) {
  const { data: pinned } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .eq('is_pinned', true)
    .maybeSingle();

  if (pinned) {
    return sb.storage.from('room-photos').getPublicUrl(pinned.storage_path).data.publicUrl;
  }

  const { data: first } = await sb.from('photos')
    .select('storage_path')
    .eq('room_id', roomId)
    .order('created_at')
    .limit(1)
    .maybeSingle();

  return first
    ? sb.storage.from('room-photos').getPublicUrl(first.storage_path).data.publicUrl
    : null;
}

function showBanner(msg) {
  const banner = document.getElementById('save-banner');
  if (!banner) return;
  banner.textContent = msg;
  banner.classList.add('show');
  setTimeout(() => banner.classList.remove('show'), 3000);
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const [{ data: rooms }, { data: settings }, { data: sitePhotoRows }] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order'),
    sb.from('settings').select('*'),
    sb.from('site_photos').select('*').order('sort_order')
  ]);

  const cabinName = settings?.find(s => s.key === 'cabin_name')?.value || 'My Cabin';
  document.getElementById('cabin-name').textContent = cabinName;
  document.title = cabinName + ' — StyleMyShack';

  const grid = document.getElementById('room-grid');

  (rooms || []).forEach(room => {
    const status = room.status || 'not-started';
    const statusLabel = status === 'complete' ? 'Complete'
                      : status === 'in-progress' ? 'In Progress'
                      : 'Not Started';

    const card = document.createElement('a');
    card.className = 'room-card';
    card.href = `room.html?id=${room.id}`;
    card.innerHTML = `
      <div class="room-card-photo placeholder" id="thumb-${room.id}">${room.emoji}</div>
      <div class="room-card-body">
        <h3>${room.name}</h3>
        <p>${room.description}</p>
        <span class="status-badge ${status}">${statusLabel}</span>
      </div>
    `;
    grid.appendChild(card);

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

  // Home carousel
  const photos = (sitePhotoRows || []).map(row => ({
    ...row,
    publicUrl: sb.storage.from('room-photos').getPublicUrl(row.storage_path).data.publicUrl
  }));
  initHomeCarousel(photos);
  setupSitePhotoUpload();
}

// ─── Home Carousel ─────────────────────────────────────────────────────────
function initHomeCarousel(photos) {
  sitePhotos = photos;
  homeSlide = 0;
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
          <p>Got photos of the cabin? Add them here so the designer can see the space.</p>
        </div>
      </div>`;
    dotsEl.innerHTML = '';
    counter.textContent = '';
    return;
  }

  wrap.innerHTML = sitePhotos.map((p, i) =>
    `<div class="home-carousel-slide${i === homeSlide ? ' active' : ''}">
       <img src="${p.publicUrl}" alt="Site photo ${i + 1}">
     </div>`
  ).join('');

  if (sitePhotos.length > 1) {
    dotsEl.innerHTML = sitePhotos.map((_, i) =>
      `<div class="home-carousel-dot${i === homeSlide ? ' active' : ''}" data-idx="${i}"></div>`
    ).join('');
    counter.textContent = `${homeSlide + 1} / ${sitePhotos.length}`;

    dotsEl.querySelectorAll('.home-carousel-dot').forEach(dot => {
      dot.addEventListener('click', () => goToSlide(+dot.dataset.idx));
    });
  } else {
    dotsEl.innerHTML = '';
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
      }
    }

    input.value = '';
    homeSlide = Math.max(0, sitePhotos.length - 1);
    renderHomeCarousel();
    startHomeTimer();
    showBanner('Uploaded!');
  });
}

init();
