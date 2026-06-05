// ─── Gallery Picker ────────────────────────────────────────────────────────
// Usage: openGalleryPicker(callback)
// callback receives an array of { storage_path, publicUrl } objects.
// Include this script on any page that needs the picker.

let gpCallback = null;
let gpSelected = new Set(); // storage_paths currently checked
let gpPhotos   = [];        // { storage_path, publicUrl, label }

async function openGalleryPicker(callback) {
  gpCallback = callback;
  gpSelected.clear();
  gpPhotos = [];

  let modal = document.getElementById('gp-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'gp-modal';
    modal.className = 'modal-overlay';
    modal.innerHTML = `
      <div class="modal gp-modal-card">
        <div class="gp-header">
          <h3>Pick from gallery</h3>
          <button class="lightbox-close" id="gp-x" title="Close">✕</button>
        </div>
        <div class="gp-grid" id="gp-grid"><p class="gp-empty">Loading…</p></div>
        <div class="gp-footer">
          <button id="gp-cancel" class="auth-btn-secondary">Cancel</button>
          <button id="gp-use" class="btn-primary-small" disabled>Select a photo</button>
        </div>
      </div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', e => { if (e.target === modal) gpClose(); });
    document.getElementById('gp-x').addEventListener('click', gpClose);
    document.getElementById('gp-cancel').addEventListener('click', gpClose);
    document.getElementById('gp-use').addEventListener('click', gpConfirm);
  }

  // Reset UI
  const useBtn = document.getElementById('gp-use');
  useBtn.disabled = true;
  useBtn.textContent = 'Select a photo';
  document.getElementById('gp-grid').innerHTML = '<p class="gp-empty">Loading…</p>';
  modal.classList.add('open');
  document.body.style.overflow = 'hidden';

  await gpLoad();
}

async function gpLoad() {
  const [roomsRes, photosRes, siteRes, updatesRes] = await Promise.all([
    sb.from('rooms').select('id, name, emoji').order('sort_order'),
    sb.from('photos').select('storage_path, room_id').order('sort_order'),
    sb.from('site_photos').select('storage_path').order('sort_order'),
    sb.from('builder_updates').select('storage_path, photo_paths, room_id'),
  ]);

  const roomMap = {};
  (roomsRes.data || []).forEach(r => { roomMap[r.id] = r; });

  const seen = new Set();

  function add(path, label) {
    if (!path || seen.has(path)) return;
    seen.add(path);
    gpPhotos.push({
      storage_path: path,
      publicUrl: sb.storage.from('room-photos').getPublicUrl(path).data.publicUrl,
      label,
    });
  }

  (photosRes.data || []).forEach(p => {
    const r = roomMap[p.room_id];
    add(p.storage_path, r ? (r.emoji ? r.emoji + ' ' : '') + r.name : 'Room');
  });

  (siteRes.data || []).forEach(p => add(p.storage_path, 'Project'));

  (updatesRes.data || []).forEach(u => {
    const r = roomMap[u.room_id];
    const label = (r ? r.name : 'Project') + ' · Update';
    const paths = u.photo_paths?.length ? u.photo_paths : (u.storage_path ? [u.storage_path] : []);
    paths.forEach(path => add(path, label));
  });

  gpRender();
}

function gpRender() {
  const grid = document.getElementById('gp-grid');
  if (!gpPhotos.length) {
    grid.innerHTML = '<p class="gp-empty">No photos uploaded yet.</p>';
    return;
  }
  grid.innerHTML = gpPhotos.map((p, i) => `
    <div class="gp-thumb${gpSelected.has(p.storage_path) ? ' gp-selected' : ''}" data-idx="${i}" title="${gpEsc(p.label)}">
      <img src="${gpEsc(p.publicUrl)}" alt="" loading="lazy" />
      <div class="gp-check">✓</div>
      <div class="gp-label">${gpEsc(p.label)}</div>
    </div>`).join('');

  grid.querySelectorAll('.gp-thumb').forEach(thumb => {
    thumb.addEventListener('click', () => {
      const path = gpPhotos[+thumb.dataset.idx].storage_path;
      if (gpSelected.has(path)) {
        gpSelected.delete(path);
        thumb.classList.remove('gp-selected');
      } else {
        gpSelected.add(path);
        thumb.classList.add('gp-selected');
      }
      const n = gpSelected.size;
      const btn = document.getElementById('gp-use');
      btn.disabled = n === 0;
      btn.textContent = n === 0 ? 'Select a photo' : n === 1 ? 'Use 1 photo' : `Use ${n} photos`;
    });
  });
}

function gpConfirm() {
  if (!gpSelected.size || !gpCallback) return;
  const selected = gpPhotos.filter(p => gpSelected.has(p.storage_path));
  gpClose();
  gpCallback(selected);
}

function gpClose() {
  const modal = document.getElementById('gp-modal');
  if (modal) modal.classList.remove('open');
  document.body.style.overflow = '';
}

function gpEsc(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}
