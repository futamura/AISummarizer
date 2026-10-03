# Rolling Back a Store Release

How to take back a bad release on the Chrome Web Store and on Firefox Add-ons (AMO). Both stores roll back without a review, so a rollback is the fastest way to stop a broken version from spreading.

## When to roll back

- Roll back when the released version breaks a core flow (extraction, injection, settings) and the fix needs more than a quick patch.
- Release a fix instead when it is small and already verified: a fixed version reaches users the same way a rollback does, but goes through store review first.
- If the bad version is still in review and has not been published, cancel the review instead (see each store below).

## Chrome Web Store

Docs: [Roll back your extension](https://developer.chrome.com/docs/webstore/rollback), [Cancel a pending review](https://developer.chrome.com/docs/webstore/cancel-review)

1. Open the item in the [Developer Dashboard](https://chrome.google.com/webstore/devconsole/)
2. Click **⋮ View more menu options**, or go to **Build > Package**, and click **Roll back to previous version**
3. Enter the new version number (see [Choosing the version number](#choosing-the-version-number)) and the reason, then confirm

- The previously published package is republished under the new version number. No review; it is live in the store within a minute, and users get it through Chrome's normal update cycle
- Only the immediately previous published version can be restored. Rolling back again switches between the same two versions
- Any pending submission, in review or staged, is discarded
- There is no API for rollbacks; use the dashboard

**Still in review:** on the **Store listing** page, click **⋮ View more menu options** → **Cancel review**. The submission returns to a draft. This option only appears while the status is **Pending review**, and a publisher can cancel up to six reviews per day.

## Firefox Add-ons (AMO)

Docs: [Version rollback](https://extensionworkshop.com/documentation/publish/version-rollback/)

1. Open the add-on in the [Developer Hub](https://addons.mozilla.org/developers/addons) and go to **Status & Versions**
2. Click **Rollback to a previous version** (next to **Upload a New Version**)
3. Enter the new version number, edit the release notes, and click **Roll back**

- The previous approved version is re-signed under the new version number. No review; all authors get an email when it is signed and approved
- On the listed channel, only the approved version before the current one can be restored, and the add-on needs at least two approved versions
- The new version number must be higher than every version ever submitted, including disabled ones
- Rolling back cancels the pending reviews of unapproved versions in the same channel
- Users get the rolled-back version at their next update check, within 24 hours by default

**Stopping new installs:** a version can also be disabled from its page in **Status & Versions**. It is then no longer available to install, but users who already have it keep it until the rollback reaches them. A disabled version number can never be reused.

## Choosing the version number

Use the same number on both stores: the next patch version above the highest version ever submitted to either store. For example, if 0.5.1 is bad, roll back as 0.5.2 on both. Both stores reject a number that is not higher than the current one, and AMO also rejects any number submitted before.

## After a rollback

1. On `develop`, bump `package.json` and `manifest.json` to the rollback version number in a pull request. Otherwise the next `bundle exec fastlane release` offers a patch version that collides with it
2. Do not push a `v<version>` tag for the rollback version: a tag push runs `.github/workflows/release.yml`, which uploads the current code to both stores
3. Fix the bug and release as usual. The next version is higher than the rollback version
4. Check the listed versions:
   - Chrome Web Store: the **Version** field on the store listing
   - AMO: `curl -s https://addons.mozilla.org/api/v5/addons/addon/free-ai-summarizer/` → `current_version.version`

## Why releases still publish automatically

`release.yml` publishes to the Chrome Web Store as soon as the review passes (`publishType: DEFAULT_PUBLISH`) instead of staging the release. Reviewed as of October 2026:

- Partial (percentage) rollouts are only available for items with more than 10,000 seven-day active users. This extension is far below that
- A staged release has to be published by hand in the dashboard within 30 days of passing review, or it reverts to a draft and needs another review. Nothing can be verified between review and publishing that cannot be verified before the release tag is pushed
- Both stores roll back without a review, and the Chrome Web Store has the previous version live within a minute, which covers a bad release

Revisit this when the extension passes 10,000 seven-day active users.
