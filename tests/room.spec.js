import { test, expect } from '@playwright/test';
import { setupMocks, MOCK_ROOMS, MOCK_RECS } from './fixtures.js';

test.beforeEach(async ({ page }) => {
  await setupMocks(page);
  await page.goto('/room.html?id=living-room');
});

test('shows room title and description', async ({ page }) => {
  await expect(page.locator('#room-title')).toHaveText('Living Room');
  await expect(page.locator('#room-description')).toHaveText('Main gathering space');
});

test('page title includes room name', async ({ page }) => {
  await expect(page).toHaveTitle(/Living Room/);
});

test('back link navigates to home', async ({ page }) => {
  await expect(page.locator('a.header-back')).toHaveAttribute('href', 'index.html');
});

test('logo links to home page', async ({ page }) => {
  await expect(page.locator('a.logo')).toHaveAttribute('href', 'index.html');
});

test('renders room nav strip with all rooms', async ({ page }) => {
  const navLinks = page.locator('#room-nav a');
  await expect(navLinks).toHaveCount(MOCK_ROOMS.length);
});

test('current room is highlighted in nav strip', async ({ page }) => {
  const activeLink = page.locator('#room-nav a.active, #room-nav .room-nav-item.active');
  await expect(activeLink).toBeVisible();
});

test('photo tabs are visible', async ({ page }) => {
  const tabs = page.locator('.photo-tab');
  await expect(tabs).toHaveCount(4);
});

test('Actual Photos tab is active by default', async ({ page }) => {
  const activeTab = page.locator('.photo-tab.active');
  await expect(activeTab).toHaveText('Actual Photos');
});

test('switching photo tabs changes active tab', async ({ page }) => {
  await page.locator('.photo-tab[data-tab="model3d"]').click();
  await expect(page.locator('.photo-tab.active')).toHaveText('3D Model');
});

test('recommendations panel shows paint section', async ({ page }) => {
  // Wait for recs to load
  await expect(page.locator('.rec-section')).not.toHaveCount(0);
  const paintSection = page.locator('.rec-section').filter({ hasText: 'Paint' });
  await expect(paintSection).toBeVisible();
});

test('recommendations panel shows all 4 categories', async ({ page }) => {
  const sections = page.locator('.rec-section');
  await expect(sections).toHaveCount(6);
});

test('paint recommendation item is visible', async ({ page }) => {
  const paintItem = page.locator('.item-name').filter({ hasText: 'Benjamin Moore' });
  await expect(paintItem).toBeVisible();
});

test('owner\'s brief shows room-specific notes', async ({ page }) => {
  const brief = page.locator('#owner-notes-text');
  await expect(brief).toHaveText('We love natural wood.');
});

test('general notes are displayed', async ({ page }) => {
  const notes = page.locator('#general-notes-text, .general-notes-value');
  await expect(notes.first()).toContainText('warm tones');
});
