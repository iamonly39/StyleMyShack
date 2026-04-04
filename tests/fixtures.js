/**
 * Shared Supabase mock data and route interceptors for Playwright tests.
 * Call setupMocks(page) before navigating to intercept all Supabase API calls.
 */

const SUPABASE_URL = 'https://yoikyxyrkcnvszogsyut.supabase.co';

export const MOCK_ROOMS = [
  { id: 'living-room', name: 'Living Room', description: 'Main gathering space', emoji: '🛋️', sort_order: 1, status: 'in-progress' },
  { id: 'kitchen',     name: 'Kitchen',     description: 'Cooking and dining',   emoji: '🍳', sort_order: 2, status: 'complete' },
  { id: 'bedroom',     name: 'Bedroom',     description: 'Master suite',          emoji: '🛏️', sort_order: 3, status: 'not-started' },
];

export const MOCK_SETTINGS = [
  { key: 'cabin_name',   value: 'Test Cabin' },
  { key: 'owner_notes',  value: 'Looking for a cozy rustic feel.' },
];

export const MOCK_RECS = {
  room_id:         'living-room',
  paint_items:     [{ name: 'Benjamin Moore White Dove OC-17' }],
  flooring_items:  [{ value: 'Wide-plank white oak hardwood' }],
  lighting_items:  [],
  furniture_items: [{ value: 'Oatmeal linen sectional' }],
  general_notes:   'Focus on warm tones.',
  owner_notes:     'We love natural wood.',
  swatch_sets:     [],
  client_swatches: [],
  reactions:       {},
};

/**
 * Intercept all Supabase REST and Storage requests and return mock data.
 * @param {import('@playwright/test').Page} page
 */
export async function setupMocks(page) {
  const base = `${SUPABASE_URL}/rest/v1`;
  const storage = `${SUPABASE_URL}/storage/v1`;

  // rooms
  await page.route(`${base}/rooms*`, route =>
    route.fulfill({ json: MOCK_ROOMS })
  );

  // settings
  await page.route(`${base}/settings*`, route =>
    route.fulfill({ json: MOCK_SETTINGS })
  );

  // site_photos (home carousel)
  await page.route(`${base}/site_photos*`, route =>
    route.fulfill({ json: [] })
  );

  // photos (room thumbnails + room gallery)
  await page.route(`${base}/photos*`, route =>
    route.fulfill({ json: [] })
  );

  // recommendations
  await page.route(`${base}/recommendations*`, route => {
    const url = route.request().url();
    if (url.includes('room_id=eq.living-room')) {
      route.fulfill({ json: [MOCK_RECS] });
    } else {
      route.fulfill({ json: [] });
    }
  });

  // storage public URLs (just let them 404 — images aren't needed for logic tests)
  await page.route(`${storage}/**`, route =>
    route.fulfill({ status: 200, body: '' })
  );
}
