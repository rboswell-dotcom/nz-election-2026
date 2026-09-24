// Loads the page and clicks through every tab and filter, failing on any
// JS error or console error, or on filters that render nothing.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSite } from './helpers.js';

let site, page;
before(async () => { site = await openSite(); page = site.page; });
after(() => site.close());

test('page loads without errors', async () => {
  assert.ok(await page.locator('#hubGrid .hub-card').count() > 0, 'home hub is empty');
  assert.deepEqual(site.errors, []);
});

test('every tab opens', async () => {
  const tabs = await page.$$eval('.subnav-item', els => els.map(e => e.dataset.tab));
  for (const t of tabs) {
    await page.click(`.subnav-item[data-tab="${t}"]`);
    assert.ok(await page.locator(`#tab-${t}.active`).isVisible(), `tab ${t} did not open`);
  }
  assert.deepEqual(site.errors, []);
});

test('By Issue: every topic renders a section for every party', async () => {
  await page.click('.subnav-item[data-tab="issue"]');
  const partyCount = await page.evaluate(() => PARTIES.length);
  const topics = await page.$$eval('#issueTopicBar .tbtn', els => els.map(e => e.dataset.t));
  assert.ok(topics.length > 0);
  for (const t of topics) {
    await page.click(`#issueTopicBar .tbtn[data-t="${t}"]`);
    assert.equal(await page.getAttribute(`#issueTopicBar .tbtn[data-t="${t}"]`, 'aria-pressed'), 'true');
    assert.equal(await page.locator('#issueOut .policy-section-hd').count(), partyCount, `topic ${t}`);
  }
  assert.deepEqual(site.errors, []);
});

test('All Policies: each party filter shows exactly that party', async () => {
  await page.click('.subnav-item[data-tab="policies"]');
  const total = await page.evaluate(() => POLICIES.length);
  assert.equal(await page.locator('#polOut .pcard').count(), total, 'unfiltered view is missing cards');

  const parties = await page.$$eval('#partyBar .pchip', els => els.map(e => e.dataset.p));
  for (const only of parties) {
    // Turn `only` on first, then everything else off (the site won't let
    // you turn off the last active chip).
    for (const p of [only, ...parties.filter(x => x !== only)]) {
      const chip = page.locator(`#partyBar .pchip[data-p="${p}"]`);
      const on = (await chip.getAttribute('aria-pressed')) === 'true';
      if ((p === only) !== on) await chip.click();
    }
    const expected = await page.evaluate(k => POLICIES.filter(p => p.p === k).length, only);
    assert.equal(await page.locator('#polOut .pcard').count(), expected, `filter ${only}`);
    assert.equal(await page.locator(`#polOut .pbadge:not(.b-${only})`).count(), 0, `filter ${only} leaks other parties`);
  }
  assert.deepEqual(site.errors, []);
});

test('Plain English toggle opens and closes', async () => {
  const btn = page.locator('#polOut .toggle-btn').first();
  const box = page.locator(`#${await btn.getAttribute('aria-controls')}`);
  await btn.click();
  assert.ok(await box.isVisible());
  assert.equal(await btn.getAttribute('aria-expanded'), 'true');
  await btn.click();
  assert.ok(!(await box.isVisible()));
  assert.deepEqual(site.errors, []);
});

test('theme toggle flips the theme', async () => {
  const before = await page.getAttribute('html', 'data-theme');
  await page.click('#themeToggle');
  assert.notEqual(await page.getAttribute('html', 'data-theme'), before);
  assert.deepEqual(site.errors, []);
});
