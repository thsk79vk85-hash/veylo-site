import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../support.html', import.meta.url), 'utf8');
const contacts = [...html.matchAll(/<a\b[^>]*\bhref=["'](mailto:[^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)]
  .map(([, href, content]) => ({
    url: new URL(href),
    text: content.replace(/<[^>]*>/g, ' ').trim(),
  }));

test('both support email links open a message to the approved inbox', () => {
  assert.equal(contacts.length, 2, 'removing either existing email link would prevent contacting support');
  for (const { url } of contacts) {
    assert.equal(url.pathname, 'support@joinveylo.com', 'a stale or wrong recipient would send support requests to the wrong inbox');
  }
});

test('each support email link displays the approved recipient', () => {
  for (const { text } of contacts) {
    assert.equal(text.match(/[^\s<>@]+@[^\s<>@]+/)?.[0], 'support@joinveylo.com', 'stale displayed contact text would give visitors the wrong address to copy');
  }
});

test('support email links retain the existing encoded message subject', () => {
  for (const { url } of contacts) {
    assert.equal(url.search, '?subject=Veylo%20Support', 'changing the mailto query would lose or alter the existing support subject');
  }
});

test('the support page no longer advertises the stale support address', () => {
  assert.doesNotMatch(html, /support@veylo\.app/i, 'a remaining stale support address would misdirect visitors elsewhere on the page');
});
