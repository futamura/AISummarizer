import { expectArticleInjected, test } from './fixtures';
import { COMPOSERS } from './scenarios';

for (const composer of COMPOSERS) {
  test(`injects the article into ${composer.name}`, async ({ openPage, openPopupFor, serveFixture, waitForServicePage }) => {
    if (composer.fixture) await serveFixture(composer.host, composer.fixture);
    const article = await openPage('article');
    const popup = await openPopupFor(article);

    await popup.getByText(composer.label, { exact: true }).click();

    const service = await waitForServicePage(composer.host);
    await expectArticleInjected(service, composer.editor);
  });
}
