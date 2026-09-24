// Integrity checks on the hand-maintained data in index.html. These catch
// the mistakes a manual rescrape can introduce: a typo'd party or topic
// key, a missing field, a broken source link, a duplicate, a bad date.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { openSite } from './helpers.js';

let site, data;
before(async () => {
  site = await openSite();
  // Top-level consts in a classic <script> live in the global lexical scope.
  data = await site.page.evaluate(() => ({ PARTIES, POLICIES, TOPICS, SEATS, PC }));
});
after(() => site.close());

const REQUIRED = ['p', 't', 'title', 'detail', 'src', 'url', 'analogy'];
const STATUSES = [undefined, 'bottom-line', 'delivered'];
const label = (p, i) => `POLICIES[${i}] "${p.title}"`;

function checkDate(iso, where) {
  assert.match(iso, /^\d{4}-\d{2}-\d{2}$/, `${where}: "${iso}" is not YYYY-MM-DD`);
  const d = new Date(iso + 'T00:00:00Z');
  assert.ok(!isNaN(d), `${where}: "${iso}" is not a real date`);
  assert.equal(d.toISOString().slice(0, 10), iso, `${where}: "${iso}" rolls over (e.g. 31 Sep)`);
}

test('every policy has all required fields, non-empty', () => {
  data.POLICIES.forEach((p, i) => {
    for (const k of REQUIRED) {
      assert.equal(typeof p[k], 'string', `${label(p, i)}: missing "${k}"`);
      assert.ok(p[k].trim(), `${label(p, i)}: empty "${k}"`);
    }
  });
});

test('every policy belongs to a known party and topic', () => {
  const parties = new Set(data.PARTIES.map(x => x.key));
  const topics = new Set(Object.keys(data.TOPICS).filter(k => k !== 'all'));
  data.POLICIES.forEach((p, i) => {
    assert.ok(parties.has(p.p), `${label(p, i)}: unknown party "${p.p}"`);
    assert.ok(topics.has(p.t), `${label(p, i)}: unknown topic "${p.t}"`);
    assert.ok(STATUSES.includes(p.status), `${label(p, i)}: unknown status "${p.status}"`);
  });
});

test('every policy links to https on the domain it cites', () => {
  data.POLICIES.forEach((p, i) => {
    const u = new URL(p.url);
    assert.equal(u.protocol, 'https:', `${label(p, i)}: ${p.url} is not https`);
    const host = u.hostname.replace(/^www\./, '');
    assert.ok(host === p.src || host.endsWith('.' + p.src),
      `${label(p, i)}: src "${p.src}" doesn't match link host "${host}"`);
  });
});

test('no duplicate policy titles within a party', () => {
  const seen = new Set();
  data.POLICIES.forEach((p, i) => {
    const key = `${p.p}|${p.title.trim().toLowerCase()}`;
    assert.ok(!seen.has(key), `${label(p, i)}: duplicate title for ${p.p}`);
    seen.add(key);
  });
});

test('every party is complete: colour, https links, valid verified date', () => {
  for (const party of data.PARTIES) {
    assert.ok(data.PC[party.key], `${party.key}: no colour in PC`);
    for (const k of ['url', 'aboutUrl']) {
      if (party[k]) assert.equal(new URL(party[k]).protocol, 'https:', `${party.key}.${k} is not https`);
    }
    if (party.verified) checkDate(party.verified, `${party.key}.verified`);
    assert.ok(data.POLICIES.some(p => p.p === party.key), `${party.key}: has no policies`);
  }
});

test('2023 seat table adds up to the 123-seat Parliament', () => {
  const total = data.SEATS.reduce((s, r) => s + r.seats, 0);
  assert.equal(total, 123);
  const parties = new Set(data.PARTIES.map(x => x.key));
  for (const s of data.SEATS) assert.ok(parties.has(s.p), `SEATS: unknown party "${s.p}"`);
});
