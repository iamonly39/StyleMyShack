import { test, expect } from '@playwright/test';
import { setupMocks, MOCK_ROOMS, MOCK_SETTINGS } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await setupMocks(page);
  await page.goto('/');
});

test('shows cabin name from settings', async ({ page }) => {
  await expect(page.locator('#cabin-name')).toHaveText('Test Cabin');
});

test('page title includes cabin name', async ({ page }) => {
  await expect(page).toHaveTitle(/Test Cabin/);
});

test('renders a card for each room', async ({ page }) => {
  const cards = page.locator('.room-card');
  await expect(cards).toHaveCount(MOCK_ROOMS.length);
});

test('room cards link to the correct room page', async ({ page }) => {
  const firstCard = page.locator('.room-card').first();
  await expect(firstCard).toHaveAttribute('href', /room\.html\?id=living-room/);
});

test('room card shows name, description and status badge', async ({ page }) => {
  const firstCard = page.locator('.room-card').first();
  await expect(firstCard.locator('h3')).toHaveText('Living Room');
  await expect(firstCard.locator('p')).toHaveText('Main gathering space');
  await expect(firstCard.locator('.status-badge')).toHaveText('In Progress');
});

test('status badge shows correct text for each status', async ({ page }) => {
  const badges = page.locator('.status-badge');
  await expect(badges.nth(0)).toHaveText('In Progress');  // living-room
  await expect(badges.nth(1)).toHaveText('Complete');      // kitchen
  await expect(badges.nth(2)).toHaveText('Not Started');   // bedroom
});

test('shows owner\'s brief text from settings', async ({ page }) => {
  const brief = page.locator('#owner-notes-text');
  await expect(brief).toHaveText('Looking for a cozy rustic feel.');
});

test('carousel shows empty state when no site photos', async ({ page }) => {
  const empty = page.locator('.home-carousel-empty');
  await expect(empty).toBeVisible();
});

test('logo links to home page', async ({ page }) => {
  await expect(page.locator('a.logo')).toHaveAttribute('href', 'index.html');
});

test('cabin name becomes editable on click', async ({ page }) => {
  const nameEl = page.locator('#cabin-name');
  await nameEl.click();
  await expect(nameEl).toHaveAttribute('contenteditable', 'true');
});

test('pressing Escape while editing cabin name reverts to original', async ({ page }) => {
  const nameEl = page.locator('#cabin-name');
  await nameEl.click();
  await nameEl.fill('Changed Name');
  await nameEl.press('Escape');
  await expect(nameEl).toHaveText('Test Cabin');
});

test('owner brief shows placeholder class when empty', async ({ page, context }) => {
  // Override mock: owner_notes is empty
  await page.route('https://yoikyxyrkcnvszogsyut.supabase.co/rest/v1/settings*', route =>
    route.fulfill({ json: [{ key: 'cabin_name', value: 'Test Cabin' }] })
  );
  await page.reload();
  const brief = page.locator('#owner-notes-text');
  await expect(brief).toHaveClass(/is-placeholder/);
});

test('owner brief becomes editable on click', async ({ page }) => {
  const brief = page.locator('#owner-notes-text');
  await brief.click();
  await expect(brief).toHaveAttribute('contenteditable', 'true');
});
