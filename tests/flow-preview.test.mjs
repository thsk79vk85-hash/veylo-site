import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');

test('feed-first concept cannot be mistaken for the released beta', () => {
  assert.match(html, /name="robots" content="noindex,nofollow,noarchive"/);
  assert.match(html, /Design concept — not the live beta/);
  assert.match(html, /30-minute, university-only feed is proposed/);
  assert.match(html, /Feature concept:/);
  assert.match(html, /University-only visibility and 30-minute expiry are proposed improvements/);
});

test('native scrolling remains free and no product section pins the user', () => {
  assert.match(html, /html,body\{width:100%;min-height:100%;height:auto;overflow-x:hidden;overflow-y:auto\}/);
  assert.match(html, /\.scroller\{width:100%;min-height:100vh;height:auto;overflow:visible;scroll-behavior:smooth\}/);
  assert.doesNotMatch(html, /scroll-snap-type|scroll-snap-align|scroll-behavior:\s*instant/);
  assert.doesNotMatch(html, /\.feed\{[^}]*position:sticky|\.presence\{[^}]*position:sticky/);
  assert.match(html, /window\.addEventListener\('scroll',schedule,\{passive:true\}\)/);
});

test('sample composer is interactive but never publishes', () => {
  for (const value of ['cards', 'coffee', 'study', 'lunch']) {
    assert.match(html, new RegExp('data-example="' + value + '"'));
  }
  assert.match(html, /id="draft-body"/);
  assert.match(html, /id="preview-post"/);
  assert.match(html, /No post was published|Nothing was published/);
  assert.doesNotMatch(html, /\/api\/(?:signup|waitlist|feed)|supabase\.from\(['"]feed_posts/);
});

test('beta and waitlist choices reach the actual Veylo site', () => {
  assert.match(html, /href="https:\/\/joinveylo\.com\/#beta"/);
  assert.match(html, /href="https:\/\/joinveylo\.com\/#waitlist"/);
  assert.match(html, /target="_blank" rel="noopener noreferrer"/);
});

test('HTML retains accessible images and reduced motion support', () => {
  const images = html.match(/<img\b[^>]*>/g) || [];
  assert.ok(images.length > 0);
  for (const tag of images) assert.match(tag, /\balt=/, 'missing alt attribute: ' + tag);
  assert.match(html, /prefers-reduced-motion:reduce/);
  assert.match(html, /aria-pressed/);
  assert.match(html, /role="status"/);
});

test('client-side preview script parses without external libraries', () => {
  const match = html.match(/<script>([\s\S]*?)<\/script>/);
  assert.ok(match, 'missing preview script');
  assert.doesNotThrow(() => new Function(match[1]));
});
