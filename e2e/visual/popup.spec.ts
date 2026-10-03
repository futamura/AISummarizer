import { COLOR_SCHEMES, expect, preparePage, test } from './fixtures';

for (const colorScheme of COLOR_SCHEMES) {
  test(`popup, ${colorScheme}`, async ({ openPage, openPopupFor }) => {
    const article = await openPage('article');
    const popup = await openPopupFor(article);
    await preparePage(popup, colorScheme);
    await expect(popup.locator('#root')).toHaveScreenshot(`popup-${colorScheme}.png`, { animations: 'disabled' });
  });
}
