import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const html = await readFile(new URL('../index.html', import.meta.url), 'utf8');

test('uses the approved Veylo hero headline', () => {
  assert.match(html, /Veylo turns [“\"]where are you\?[”\"] into actually meeting up\./);
});

test('describes real app features without precise proximity claims', () => {
  assert.match(html, /Campus/);
  assert.match(html, /Feed/);
  assert.match(html, /Friends/);
  assert.match(html, /Chats/);
  assert.match(html, /exact location is never shown/i);
  assert.doesNotMatch(html, /\b\d+\s*(min|minutes?) away\b/i);
});

test('includes an accessible beta waitlist form', () => {
  assert.match(html, /<form[^>]+id="waitlist-form"/);
  assert.match(html, /<label[^>]+for="waitlist-email"/);
  assert.match(html, /<input[^>]+id="waitlist-email"[^>]+type="email"/);
  assert.match(html, /aria-live="polite"/);
});
