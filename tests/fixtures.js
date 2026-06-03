/**
 * Shared Supabase mock data and route interceptors for Playwright tests.
 * Call setupMocks(page) before navigating to intercept all Supabase API calls.
 * Call setupColorMocks(page) to intercept the static BM/SW color JSON files.
 * Call setupOwnerAuth(page) / setupBuilderAuth(page) BEFORE goto() to simulate auth.
 */

const SUPABASE_URL = 'https://yoikyxyrkcnvszogsyut.supabase.co';

export const OWNER_EMAIL   = 'iamonly39@gmail.com';
export const BUILDER_EMAIL = 'builder@example.com';

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
  paint_items:     [{ id: 'p1', name: 'Benjamin Moore White Dove OC-17', note: '', link: '', photo_url: '' }],
  flooring_items:  [{ id: 'f1', name: 'Wide-plank white oak hardwood',   note: '', link: '', photo_url: '' }],
  lighting_items:  [],
  furniture_items: [{ id: 'fu1', name: 'Oatmeal linen sectional',        note: '', link: '', photo_url: '' }],
  general_notes:   'Focus on warm tones.',
  owner_notes:     'We love natural wood.',
  swatch_sets:     [],
  client_swatches: [],
  reactions:       {},
};

export const MOCK_RECS_WITH_SWATCHES = {
  ...MOCK_RECS,
  swatch_sets: [
    {
      name: 'Palette A',
      swatches: [{ role: 'Wall', color: '#CCCCCC', label: '' }],
    },
  ],
};

export const MOCK_BUILDER_UPDATES = [
  {
    id: 'update-1',
    room_id: 'living-room',
    message: 'Framing is complete on the east wall.',
    storage_path: null,
    photo_paths: [],
    caption: '',
    uploaded_by: BUILDER_EMAIL,
    promoted_to_gallery: false,
    replies: [],
    created_at: '2026-06-01T12:00:00Z',
  },
];

export const MOCK_USER_ROLES = [
  { id: 'role-1', email: BUILDER_EMAIL, role: 'builder', created_at: '2026-01-01T00:00:00Z' },
];

export const MOCK_BM_COLORS = [
  { number: 'OC-17',  name: 'White Dove',    hex: '#F3EFE4' },
  { number: 'HC-172', name: 'Revere Pewter', hex: '#C2B9A7' },
  { number: 'OC-65',  name: 'Chantilly Lace', hex: '#F5F1E9' },
];

export const MOCK_SW_COLORS = [
  { number: 'SW 7015', name: 'Repose Gray',  hex: '#C2BDB6' },
  { number: 'SW 7006', name: 'Extra White',  hex: '#F4F4EF' },
  { number: 'SW 6119', name: 'Antique White', hex: '#E8DCC6' },
];

/**
 * Simulate owner session via TEST_MODE localStorage.
 * Must be called before page.goto().
 */
export async function setupOwnerAuth(page) {
  await page.addInitScript(email => {
    localStorage.setItem('test_mode_email', email);
  }, OWNER_EMAIL);
}

/**
 * Simulate builder session via TEST_MODE localStorage.
 * Must be called before page.goto().
 */
export async function setupBuilderAuth(page) {
  await page.addInitScript(email => {
    localStorage.setItem('test_mode_email', email);
  }, BUILDER_EMAIL);
}

/**
 * Intercept the static BM/SW color JSON files with small test datasets.
 * @param {import('@playwright/test').Page} page
 */
export async function setupColorMocks(page) {
  await page.route('**/data/bm-colors.json', route =>
    route.fulfill({ json: MOCK_BM_COLORS })
  );
  await page.route('**/data/sw-colors.json', route =>
    route.fulfill({ json: MOCK_SW_COLORS })
  );
}

/**
 * Intercept all Supabase REST and Storage requests and return mock data.
 * @param {import('@playwright/test').Page} page
 */
export async function setupMocks(page) {
  const base    = `${SUPABASE_URL}/rest/v1`;
  const storage = `${SUPABASE_URL}/storage/v1`;

  // rooms
  await page.route(`${base}/rooms*`, route =>
    route.fulfill({ json: MOCK_ROOMS })
  );

  // settings
  await page.route(`${base}/settings*`, route => {
    if (route.request().method() === 'POST') {
      route.fulfill({ json: [{ key: 'owner_journal', value: '[]' }] });
    } else {
      route.fulfill({ json: MOCK_SETTINGS });
    }
  });

  // user_roles (used by auth.js resolveRole)
  await page.route(`${base}/user_roles*`, route =>
    route.fulfill({ json: MOCK_USER_ROLES })
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

  // builder_updates
  await page.route(`${base}/builder_updates*`, route =>
    route.fulfill({ json: MOCK_BUILDER_UPDATES })
  );

  // comments
  await page.route(`${base}/comments*`, route =>
    route.fulfill({ json: [] })
  );

  // messages (private thread)
  await page.route(`${base}/messages*`, route =>
    route.fulfill({ json: [] })
  );

  // storage public URLs (let them return empty — images not needed for logic tests)
  await page.route(`${storage}/**`, route =>
    route.fulfill({ status: 200, body: '' })
  );
}
