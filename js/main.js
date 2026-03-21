async function init() {
  const res = await fetch('data/rooms.json');
  const data = await res.json();

  document.getElementById('cabin-name').textContent = data.cabinName;
  document.title = data.cabinName + ' — StyleMyShack';

  const grid = document.getElementById('room-grid');

  data.rooms.forEach(room => {
    const hasRecs = hasRecommendations(room.recommendations);
    const thumbSrc = getThumb(room);

    const card = document.createElement('a');
    card.className = 'room-card';
    card.href = `room.html?id=${room.id}`;
    card.innerHTML = `
      ${thumbSrc
        ? `<img class="room-card-photo" src="${thumbSrc}" alt="${room.name}" />`
        : `<div class="room-card-photo placeholder">${room.emoji}</div>`
      }
      <div class="room-card-body">
        <h3>${room.name}</h3>
        <p>${room.description}</p>
        <span class="room-status ${hasRecs ? 'has-recs' : 'pending'}">
          ${hasRecs ? '&#10003; Has recommendations' : '&#9679; Awaiting recommendations'}
        </span>
      </div>
    `;
    grid.appendChild(card);
  });
}

function getThumb(room) {
  const photos = room.photos;
  return (photos.actual && photos.actual[0])
    || (photos.model3d && photos.model3d[0])
    || (photos.floorPlan && photos.floorPlan[0])
    || null;
}

function hasRecommendations(recs) {
  if (!recs) return false;
  const { paint, flooring, lighting, furniture, generalNotes } = recs;
  return (paint.primary || paint.accent || paint.trim || paint.notes || flooring || lighting || furniture || generalNotes);
}

init();
