import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parseFacebook } from '../facebook';
import { parseInstagram } from '../instagram';
import { parseLinkedIn } from '../linkedin';
import { parseMetaAds } from '../meta_ads_library';
import { parseTikTok } from '../tiktok';
import { parseX } from '../x';

const fixture = (name: string): string => readFileSync(join(process.cwd(), 'src', 'adapters', '__fixtures__', name), 'utf8');

test('parses facebook lead from embedded JSON with parser metadata', () => {
  const leads = parseFacebook(fixture('facebook.snapshot.html'), 'plumbing');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, 'Acme Plumbing');
  assert.equal((leads[0].rawData as any).parser.stage, 'embedded-json');
});

test('parses instagram lead from embedded JSON with parser metadata', () => {
  const leads = parseInstagram(fixture('instagram.snapshot.html'), 'design');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].profileUrl, 'https://www.instagram.com/acme.design/');
  assert.equal((leads[0].rawData as any).parser.parserVersion, '2.0.0');
});

test('parses linkedin lead from embedded JSON', () => {
  const leads = parseLinkedIn(fixture('linkedin.snapshot.html'), 'logistics');
  assert.equal(leads.length, 1);
  assert.match(leads[0].profileUrl || '', /linkedin.com\/company/);
});

test('parses tiktok lead from embedded JSON', () => {
  const leads = parseTikTok(fixture('tiktok.snapshot.html'), 'shop');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].website, 'https://acme.shop');
});

test('parses x lead from hydration JSON', () => {
  const leads = parseX(fixture('x.snapshot.html'), 'acme');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].profileUrl, 'https://x.com/acmeinc');
});

test('parses meta ads lead from embedded JSON', () => {
  const leads = parseMetaAds(fixture('meta_ads.snapshot.html'), ['fitness']);
  assert.equal(leads.length, 1);
  assert.equal(leads[0].name, 'Acme Fitness');
});


test('x parser falls through to regex when dom matches only broad routes', () => {
  const html = '<html><body><a href="/tos">Terms</a><script>{"screen_name":"acmeregex","name":"Acme Regex","url":"https://acme.example"}</script></body></html>';
  const leads = parseX(html, 'acme');
  assert.equal(leads.length, 1);
  assert.equal(leads[0].profileUrl, 'https://x.com/acmeregex');
  assert.equal((leads[0].rawData as any).parser.stage, 'regex-fallback');
});
test('x parser falls back to dom when json is unavailable', () => {
  const html = '<html><body><a href="/acmedom">Acme DOM</a></body></html>';
  const leads = parseX(html, 'acme');
  assert.equal(leads.length, 1);
  assert.equal((leads[0].rawData as any).parser.stage, 'dom-fallback');
});
