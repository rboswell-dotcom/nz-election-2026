// Search, party cards, deep links and the corrections page.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSite } from './helpers.js';

let site, page, base;
before(async () => { site = await openSite(); page = site.page; base = page.url().split('#')[0]; });
after(() => site.close());

const cards = () => page.locator('#polOut .pcard').count();
const go = async hash => { await page.evaluate(h => { location.hash = h; }, hash); await page.waitForTimeout(50); };

test('home shows the hero; inner tabs hide it', async () => {
  assert.ok(await page.locator('.hero').isVisible());
  await page.click('.subnav-item[data-tab="parties"]');
  assert.ok(!(await page.locator('.hero').isVisible()));
  await page.click('.nav-brand');
  assert.ok(await page.locator('.hero').isVisible());
});

test('search narrows policies, ignores case and macrons, and reports no match', async () => {
  await page.click('.subnav-item[data-tab="policies"]');
  const total = await cards();
  await page.fill('#polSearch', 'KIWISAVER');
  const n = await cards();
  assert.ok(n > 0 && n < total, `kiwisaver matched ${n} of ${total}`);
  for (const t of await page.locator('#polOut .pcard').allInnerTexts()) assert.match(t, /kiwisaver/i);
  await page.fill('#polSearch', 'takatapui');
  assert.ok(await cards() > 0, 'macron-insensitive search failed');
  await page.fill('#polSearch', 'zzqxnotapolicy');
  assert.equal(await cards(), 0);
  assert.match(await page.textContent('#polOut'), /No policies match/);
  await page.fill('#polSearch', '');
  assert.equal(await cards(), total);
  assert.deepEqual(site.errors, []);
});


test('deep links open the right tab, topic and filters', async () => {
  await go('issue/housing');
  assert.ok(await page.locator('#tab-issue.active').isVisible());
  assert.equal(await page.getAttribute('#issueTopicBar .tbtn[data-t="housing"]', 'aria-pressed'), 'true');

  await go('policies/ACT,Labour?q=tax');
  assert.ok(await page.locator('#tab-policies.active').isVisible());
  assert.equal(await page.inputValue('#polSearch'), 'tax');
  assert.equal(await page.locator('#polOut .pbadge:not(.b-ACT):not(.b-Labour)').count(), 0);
  assert.ok(await cards() > 0);

  // A fresh load of a deep link works too.
  await page.goto(base + '#coalitions');
  assert.ok(await page.locator('#tab-coalitions.active').isVisible());
  assert.deepEqual(site.errors, []);
});

test('clicking a tab updates the URL, and Back returns', async () => {
  await page.click('.subnav-item[data-tab="parliament"]');
  assert.match(page.url(), /#parliament$/);
  await page.click('.subnav-item[data-tab="after"]');
  await page.goBack();
  await page.waitForTimeout(50);
  assert.ok(await page.locator('#tab-parliament.active').isVisible());
});

test('party cards: one per party, arrows step through every policy and wrap', async () => {
  await page.click('.subnav-item[data-tab="parties"]');
  const parties = await page.evaluate(() => PARTIES.map(p => [p.key, POLICIES.filter(x => x.p === p.key).length]));
  assert.equal(await page.locator('.pcar').count(), parties.length);
  for (const [key, n] of parties) {
    const card = page.locator(`.pcar[data-p="${key}"]`);
    assert.equal(await card.getAttribute('data-i'), '0');
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      seen.add(await card.locator('.pcar-title').textContent());
      await card.locator('.pcar-btn[data-dir="1"]').click();
    }
    assert.equal(seen.size, n, `${key}: arrows didn't reach every policy`);
    assert.equal(await card.getAttribute('data-i'), '0', `${key}: didn't wrap`);
    await card.locator('.pcar-btn[data-dir="-1"]').click();
    assert.equal(await card.getAttribute('data-i'), String(n - 1));
  }
  assert.deepEqual(site.errors, []);
});

test('a party card title links to that policy, and "See all" filters to the party', async () => {
  const card = page.locator('.pcar[data-p="Labour"]');
  const title = await card.locator('.pcar-title').textContent();
  await card.locator('.pcar-title a').click();
  await page.waitForTimeout(50);
  const focused = await page.evaluate(() => document.activeElement.querySelector('.ptitle')?.textContent);
  assert.equal(focused, title);

  await page.click('.subnav-item[data-tab="parties"]');
  await page.locator('.pcar[data-p="ACT"] .pcar-all').click();
  await page.waitForTimeout(50);
  assert.equal(await page.locator('#polOut .pbadge:not(.b-ACT)').count(), 0);
  assert.ok(await page.locator('#polOut .pcard').count() > 0);
  assert.deepEqual(site.errors, []);
});

test('corrections page opens from the footer and lists entries', async () => {
  await page.click('footer [data-tab="corrections"]');
  assert.ok(await page.locator('#tab-corrections.active').isVisible());
  assert.ok(await page.locator('#corrList .corr').count() > 0);
  assert.match(page.url(), /#corrections$/);
});
