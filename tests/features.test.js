// Search, party list, deep links and the corrections page.
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


test('Parties tab: one row per party, each linking to its policies', async () => {
  await page.click('.subnav-item[data-tab="parties"]');
  assert.equal(await page.locator('.party-row').count(), await page.evaluate(() => PARTIES.length));
  await page.locator('.party-row[data-p="ACT"] .party-policies').click();
  await page.waitForTimeout(50);
  assert.ok(await page.locator('#tab-policies.active').isVisible());
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

test('seat calculator: 2023 defaults match the real list allocation, TOP at 8.5% wins seats', async () => {
  await page.click('.subnav-item[data-tab="coalitions"]');
  const seats = () => page.$$eval('#calcRows .calc-row', rs => Object.fromEntries(rs.map(r => [r.dataset.p, r.querySelector('.calc-seats').textContent])));
  const s = await seats();
  // 2023 actual: 49/34/15/11/8/6, i.e. 48 National + 1 by-election and TPM's 2 overhang seats on top.
  assert.deepEqual(s, { National: '48', Labour: '34', ACT: '11', Greens: '15', NZFirst: '8', TPM: '4', TOP: 'Under 5%' });

  await page.fill('#calcRows [data-p="TOP"] input[type=number]', '8.5');
  const t = await seats();
  assert.ok(Number(t.TOP) >= 9, `TOP got ${t.TOP}`);
  assert.equal(Object.values(t).filter(v => /^\d+$/.test(v)).reduce((a, v) => a + Number(v), 0), 120);

  await page.click('#calcPick [data-p="National"]');
  assert.match(await page.textContent('#calcTotal'), /short of the 61 needed/);
  await page.click('#calcPick [data-p="Labour"]');
  assert.match(await page.textContent('#calcTotal'), /a majority/);

  await page.fill('#calcRows [data-p="Labour"] input[type=number]', '90');
  assert.match(await page.textContent('#calcOther'), /more than 100%/);
  await page.click('#calcReset');
  assert.deepEqual(await seats(), s);
  assert.deepEqual(site.errors, []);
});
