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
  assert.match(html, /rather than a live GPS pin/i);
  assert.match(html, /Illustrative preview, sample content/);
  assert.doesNotMatch(html, /\b\d+\s*(min|minutes?) away\b/i);
});

test('includes an accessible beta waitlist form', () => {
  assert.match(html, /<form[^>]+id="waitlist-form"/);
  assert.match(html, /<label[^>]+for="waitlist-email"/);
  assert.match(html, /<input[^>]+id="waitlist-email"[^>]+type="email"/);
  assert.match(html, /aria-live="polite"/);
});

test('explains beta availability without promising immediate access', () => {
  assert.match(html, /Veylo is in beta\./);
  assert.match(html, /help shape what comes next/);
  assert.match(html, /doesn’t create an app account or guarantee immediate access/);
});
