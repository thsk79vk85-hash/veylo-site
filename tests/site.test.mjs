import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('explains the social outcome in the hero', () => {
  assert.match(html, /where are you\?/);
  assert.match(html, /see you there/);
});

test('describes real app features without precise proximity claims', () => {
  assert.match(html, /Campus/);
  assert.match(html, /Feed/);
  assert.match(html, /Friends/);
  assert.match(html, /Chats/);
  assert.match(html, /not a live pin of your exact location/i);
  assert.match(html, /App preview · Sample profiles/);
  assert.doesNotMatch(html, /\b\d+\s*(min|minutes?) away\b/i);
});

test('includes an accessible launch waitlist form', () => {
  assert.match(html, /<form[^>]+id="waitlist-form"/);
  assert.match(html, /<label[^>]+for="waitlist-email"/);
  assert.match(html, /<input[^>]+id="waitlist-email"[^>]+type="email"/);
  assert.match(html, /aria-live="polite"/);
});

test('explains planned launch scope without promising immediate access', () => {
  assert.match(html, /email you when Veylo launches/);
  assert.match(html, /QUT, UQ and Griffith/);
  assert.match(html, /Coming to iPhone and Android/);
  assert.doesNotMatch(html, /Join the beta|BE PART OF THE BETA/);
});
