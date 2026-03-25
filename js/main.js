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

function hasRecommendations(rec) {
  if (!rec) return false;
  return rec.paint_notes || rec.flooring || rec.lighting || rec.furniture || rec.general_notes
    || (rec.swatches && rec.swatches.length > 0);
}

// ─── Init ─────────────────────────────────────────────────────────────────
async function init() {
  const [{ data: rooms }, { data: settings }, { data: recs }] = await Promise.all([
    sb.from('rooms').select('*').order('sort_order'),
    sb.from('settings').select('*'),
    sb.from('recommendations').select('room_id, paint_notes, flooring, lighting, furniture, general_notes, swatches')
  ]);

  const cabinName = settings?.find(s => s.key === 'cabin_name')?.value || 'My Cabin';
  document.getElementById('cabin-name').textContent = cabinName;
  document.title = cabinName + ' — StyleMyShack';

  const grid = document.getElementById('room-grid');

  (rooms || []).forEach(room => {
    const rec     = recs?.find(r => r.room_id === room.id);
    const hasRecs = hasRecommendations(rec);

    const card = document.createElement('a');
    card.className = 'room-card';
    card.href = `room.html?id=${room.id}`;
    card.innerHTML = `
      <div class="room-card-photo placeholder" id="thumb-${room.id}">${room.emoji}</div>
      <div class="room-card-body">
        <h3>${room.name}</h3>
        <p>${room.description}</p>
        <span class="room-status ${hasRecs ? 'has-recs' : 'pending'}">
          ${hasRecs ? '&#10003; Has recommendations' : '&#9679; Awaiting recommendations'}
        </span>
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
}

init();
