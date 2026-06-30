import { test, expect } from '@playwright/test';

const MOCK_SEARCH_RESULTS = [
  {
    id: 'queen-bohemian',
    name: 'Bohemian Rhapsody',
    artist: 'Queen',
    artists: 'Queen',
    album: 'A Night at the Opera',
    image: 'https://i.scdn.co/image/ab67616d00001e02dummy',
    cover: 'https://i.scdn.co/image/ab67616d00001e02dummy',
    uri: 'spotify:track:bohemian123',
    spotify_uri: 'spotify:track:bohemian123',
  },
  {
    id: 'queen-dont-stop',
    name: "Don't Stop Me Now",
    artist: 'Queen',
    artists: 'Queen',
    album: 'Jazz',
    image: '',
    cover: '',
    uri: 'spotify:track:dontstop123',
    spotify_uri: 'spotify:track:dontstop123',
  },
];

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.clear());
});

test('P8.1 — Spotify search: risultati visibili e cliccabili con cover e senza cover', async ({ page }) => {
  // Mock /api/search per evitare dipendenza dal serverless Vercel in locale
  await page.route('**/api/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESULTS),
    });
  });

  // 1. Apri la pagina request con table=4
  await page.goto('/request?table=4');

  // Verifica che la pagina sia caricata (non abbia rediretto a /entry)
  await expect(page).toHaveURL(/\/request/);
  await expect(page.getByText('THE WALBOX')).toBeVisible();

  // 2. Cerca "queen"
  const searchInput = page.locator('.walbox-search-input');
  await expect(searchInput).toBeVisible();
  await searchInput.fill('queen');

  // Attende il debounce (400ms) + rendering
  await page.waitForTimeout(600);

  // 3. Verifica che "Bohemian Rhapsody" sia visibile
  const bohemianCard = page.locator('.walbox-song-card').filter({ hasText: 'BOHEMIAN RHAPSODY' });
  await expect(bohemianCard).toBeVisible();

  // Verifica che il titolo abbia altezza > 10px (non schiacciato)
  const bohemianTitle = bohemianCard.locator('h4').first();
  await expect(bohemianTitle).toBeVisible();
  const bohemianTitleBox = await bohemianTitle.boundingBox();
  expect(bohemianTitleBox).not.toBeNull();
  expect(bohemianTitleBox.height).toBeGreaterThan(10);

  // 4. Verifica che "Queen" sia visibile come artista nella prima card
  const queenArtist = bohemianCard.locator('p').first();
  await expect(queenArtist).toBeVisible();
  await expect(queenArtist).toContainText('Queen');

  // 5. Verifica "Don't Stop Me Now" visibile anche senza cover
  const dontStopCard = page.locator('.walbox-song-card').filter({ hasText: "DON'T STOP ME NOW" });
  await expect(dontStopCard).toBeVisible();

  // La card senza cover deve mostrare il fallback emoji 🎵
  const coverFallback = dontStopCard.locator('div').filter({ hasText: '🎵' }).first();
  await expect(coverFallback).toBeVisible();

  // 6. Verifica che almeno 2 risultati siano cliccabili (boundingBox non zero)
  const allCards = page.locator('.walbox-song-card');
  await expect(allCards).toHaveCount(2);

  for (let i = 0; i < 2; i++) {
    const card = allCards.nth(i);
    await expect(card).toBeVisible();
    const box = await card.boundingBox();
    expect(box).not.toBeNull();
    expect(box.width).toBeGreaterThan(0);
    expect(box.height).toBeGreaterThan(50);
  }

  // Dismissare il look-up-overlay se appare (canzone "playing" nei mock data iniziali)
  const lookUpOverlay = page.locator('.look-up-overlay');
  if (await lookUpOverlay.isVisible()) {
    // Il close button è "Torna al Jukebox ✕" — il click sulla content ha stopPropagation
    const closeBtn = page.locator('.look-up-close-btn');
    await closeBtn.click();
    await expect(lookUpOverlay).not.toBeVisible();
  }

  // 7. Clicca "Bohemian Rhapsody"
  await bohemianCard.click();

  // 8. Dopo il click, la card scompare e appare il form con la canzone selezionata
  // Il selected track info card mostra il titolo uppercase in h4
  const selectedTitleInForm = page.locator('h4').filter({ hasText: 'BOHEMIAN RHAPSODY' });
  await expect(selectedTitleInForm).toBeVisible();

  // Clicca "RICONTROLLA" per aprire la preview/modale
  const ricntrollaBtn = page.getByRole('button', { name: /RICONTROLLA/i });
  await expect(ricntrollaBtn).toBeVisible();
  await ricntrollaBtn.click();

  // 9. Verifica che si apra la preview modal con il titolo selezionato
  await expect(page.getByText('PREVIEW RICHIESTA')).toBeVisible();

  // Il titolo nella preview è mostrato as-is (non toUpperCase) in h4
  const previewTitle = page.locator('[style*="zIndex: 9990"] h4, [style*="z-index: 9990"] h4').first();
  // Fallback: cerca il testo Bohemian nella modale
  const previewModal = page.locator('text=PREVIEW RICHIESTA').locator('..');
  await expect(page.getByText('Bohemian Rhapsody').last()).toBeVisible();
});

test('P8.1 — Spotify search: card non sono width/height 0', async ({ page }) => {
  await page.route('**/api/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESULTS),
    });
  });

  await page.goto('/request?table=4');

  const searchInput = page.locator('.walbox-search-input');
  await searchInput.fill('queen');
  await page.waitForTimeout(600);

  const cards = page.locator('.walbox-song-card');
  await expect(cards).toHaveCount(2);

  // Anti-falso positivo: verifica bounding box reale di ogni card
  for (let i = 0; i < 2; i++) {
    const card = cards.nth(i);
    const box = await card.boundingBox();
    expect(box, `Card ${i} non deve avere boundingBox null`).not.toBeNull();
    expect(box.width, `Card ${i} width deve essere > 0`).toBeGreaterThan(0);
    expect(box.height, `Card ${i} height deve essere > 50px`).toBeGreaterThan(50);

    // Titolo nella card
    const title = card.locator('h4').first();
    await expect(title).toBeVisible();
    const titleBox = await title.boundingBox();
    expect(titleBox, `Titolo card ${i} non deve avere boundingBox null`).not.toBeNull();
    expect(titleBox.height, `Titolo card ${i} height deve essere > 10px`).toBeGreaterThan(10);
    expect(titleBox.width, `Titolo card ${i} width deve essere > 0`).toBeGreaterThan(0);
  }
});

test('P8.2 — Mobile Layout per risultati Spotify Search', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  
  await page.route('**/api/search*', async (route) => {
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(MOCK_SEARCH_RESULTS),
    });
  });

  await page.goto('/request?table=4');

  const searchInput = page.locator('.walbox-search-input');
  await searchInput.fill('queen');
  await page.waitForTimeout(600);

  const bohemianCard = page.locator('.walbox-song-card').filter({ hasText: 'BOHEMIAN RHAPSODY' });
  await expect(bohemianCard).toBeVisible();

  const dontStopCard = page.locator('.walbox-song-card').filter({ hasText: "DON'T STOP ME NOW" });
  await expect(dontStopCard).toBeVisible();

  const queenArtist = bohemianCard.locator('p').first();
  await expect(queenArtist).toBeVisible();
  await expect(queenArtist).toContainText('Queen');

  const cardBox = await bohemianCard.boundingBox();
  expect(cardBox).not.toBeNull();
  expect(cardBox.height).toBeGreaterThanOrEqual(100);

  const artistBox = await queenArtist.boundingBox();
  expect(artistBox).not.toBeNull();
  expect(artistBox.y).toBeGreaterThanOrEqual(cardBox.y);
  expect(artistBox.y + artistBox.height).toBeLessThanOrEqual(cardBox.y + cardBox.height);

  const durationText = bohemianCard.locator('span').filter({ hasText: ':' }).first();
  await expect(durationText).toBeVisible();

  const lookUpOverlay = page.locator('.look-up-overlay');
  if (await lookUpOverlay.isVisible()) {
    const closeBtn = page.locator('.look-up-close-btn');
    await closeBtn.click();
    await expect(lookUpOverlay).not.toBeVisible();
  }

  await bohemianCard.click();

  const ricontrollaBtn = page.getByRole('button', { name: /RICONTROLLA/i });
  await expect(ricontrollaBtn).toBeVisible();
  await ricontrollaBtn.click();

  await expect(page.getByText('PREVIEW RICHIESTA')).toBeVisible();
  await expect(page.getByText('Bohemian Rhapsody').last()).toBeVisible();
});
