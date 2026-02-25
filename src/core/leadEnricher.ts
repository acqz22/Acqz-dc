import * as cheerio from 'cheerio';
import { createHttpClient } from '../utils/httpClient';
import { UnifiedLead } from './types';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;
const PRIORITY_PATH_KEYWORDS = ['contact', 'about', 'team', 'impressum', 'support'];

const MAX_CRAWL_DEPTH = 2;
const MAX_PAGES = 8;
const MAX_QUEUE_SIZE = 32;
const CRAWL_TIMEOUT_MS = 8_000;

interface CrawlTask {
  url: string;
  depth: number;
}

interface Candidate<T> {
  value: T;
  score: number;
}

const normalizeUrl = (rawUrl: string, base?: string): string | null => {
  try {
    const resolved = base ? new URL(rawUrl, base) : new URL(rawUrl);
    resolved.hash = '';
    resolved.search = '';
    if (resolved.pathname.endsWith('/') && resolved.pathname !== '/') {
      resolved.pathname = resolved.pathname.slice(0, -1);
    }
    return resolved.toString();
  } catch {
    return null;
  }
};

const getHostname = (url: string): string | null => {
  try {
    return new URL(url).hostname.replace(/^www\./i, '').toLowerCase();
  } catch {
    return null;
  }
};

const pathPriorityScore = (url: string): number => {
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    for (let i = 0; i < PRIORITY_PATH_KEYWORDS.length; i += 1) {
      if (pathname.includes(PRIORITY_PATH_KEYWORDS[i])) return PRIORITY_PATH_KEYWORDS.length - i;
    }
  } catch {
    return 0;
  }
  return 0;
};

const extractSameHostLinks = ($: cheerio.CheerioAPI, pageUrl: string, baseHost: string): string[] => {
  const links = new Set<string>();

  $('a[href]').each((_, el) => {
    const href = ($(el).attr('href') || '').trim();
    if (!href || href.startsWith('mailto:') || href.startsWith('tel:') || href.startsWith('javascript:')) return;

    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;

    const host = getHostname(normalized);
    if (host !== baseHost) return;

    links.add(normalized);
  });

  return [...links];
};

const emailScore = (email: string, host: string | null): number => {
  const lowered = email.toLowerCase();
  let score = 1;
  if (host && lowered.endsWith(`@${host}`)) score += 3;
  if (/\b(info|contact|hello|support|sales)@/i.test(lowered)) score += 2;
  if (/\b(no-?reply|donotreply|noreply)@/i.test(lowered)) score -= 2;
  return score;
};

const phoneScore = (phone: string): number => {
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 8) return 0;
  let score = Math.min(digits.length, 15);
  if (phone.trim().startsWith('+')) score += 2;
  return score;
};

const upsertCandidate = <T>(map: Map<string, Candidate<T>>, key: string, value: T, score: number): void => {
  const existing = map.get(key);
  if (!existing || score > existing.score) {
    map.set(key, { value, score });
  }
};

const extractSocialLinks = ($: cheerio.CheerioAPI, pageUrl: string): Record<string, string> => {
  const socialLinks: Record<string, string> = {};

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const normalized = normalizeUrl(href, pageUrl);
    if (!normalized) return;

    if (normalized.includes('instagram.com')) socialLinks.instagram = normalized;
    if (normalized.includes('facebook.com')) socialLinks.facebook = normalized;
    if (normalized.includes('linkedin.com')) socialLinks.linkedin = normalized;
    if (normalized.includes('x.com') || normalized.includes('twitter.com')) socialLinks.x = normalized;
    if (normalized.includes('tiktok.com')) socialLinks.tiktok = normalized;
  });

  return socialLinks;
};

const pickBest = <T>(map: Map<string, Candidate<T>>): T | undefined => {
  let best: Candidate<T> | undefined;
  for (const candidate of map.values()) {
    if (!best || candidate.score > best.score) best = candidate;
  }
  return best?.value;
};

export const crawlWebsite = async (website: string, includeSocial = true): Promise<Partial<UnifiedLead>> => {
  const startUrl = normalizeUrl(website);
  if (!startUrl) return {};

  const baseHost = getHostname(startUrl);
  if (!baseHost) return {};

  const client = createHttpClient(undefined, CRAWL_TIMEOUT_MS);
  const startedAt = Date.now();

  const visited = new Set<string>();
  const queued = new Set<string>([startUrl]);
  const queue: CrawlTask[] = [{ url: startUrl, depth: 0 }];

  const emails = new Map<string, Candidate<string>>();
  const phones = new Map<string, Candidate<string>>();
  const socialCandidates = new Map<string, Candidate<string>>();

  while (queue.length > 0 && visited.size < MAX_PAGES && Date.now() - startedAt < CRAWL_TIMEOUT_MS) {
    queue.sort((a, b) => {
      const priorityDiff = pathPriorityScore(b.url) - pathPriorityScore(a.url);
      if (priorityDiff !== 0) return priorityDiff;
      return a.depth - b.depth;
    });

    const next = queue.shift();
    if (!next || visited.has(next.url)) continue;

    visited.add(next.url);

    try {
      const { data } = await client.get(next.url);
      const $ = cheerio.load(String(data));
      const text = $('body').text();

      const matchedEmails = text.match(EMAIL_REGEX) || [];
      for (const email of matchedEmails) {
        const normalizedEmail = email.toLowerCase();
        upsertCandidate(emails, normalizedEmail, normalizedEmail, emailScore(normalizedEmail, baseHost) + pathPriorityScore(next.url));
      }

      const matchedPhones = text.match(PHONE_REGEX) || [];
      for (const phone of matchedPhones) {
        const normalizedPhone = phone.replace(/\s+/g, ' ').trim();
        const phoneKey = normalizedPhone.replace(/\D/g, '');
        upsertCandidate(phones, phoneKey, normalizedPhone, phoneScore(normalizedPhone) + pathPriorityScore(next.url));
      }

      if (includeSocial) {
        const socials = extractSocialLinks($, next.url);
        for (const [platform, link] of Object.entries(socials)) {
          upsertCandidate(socialCandidates, platform, link, pathPriorityScore(next.url));
        }
      }

      if (next.depth < MAX_CRAWL_DEPTH && queue.length < MAX_QUEUE_SIZE) {
        const links = extractSameHostLinks($, next.url, baseHost);
        for (const link of links) {
          if (queued.has(link) || visited.has(link) || queue.length >= MAX_QUEUE_SIZE) continue;
          queued.add(link);
          queue.push({ url: link, depth: next.depth + 1 });
        }
      }
    } catch {
      // Skip individual page failures and continue crawling within limits.
    }
  }

  const email = pickBest(emails);
  const phone = pickBest(phones);
  const socialLinks = includeSocial
    ? Array.from(socialCandidates.entries()).reduce<Record<string, string>>((acc, [platform, candidate]) => {
      acc[platform] = candidate.value;
      return acc;
    }, {})
    : {};

  return {
    email,
    phone,
    socialLinks,
    website: startUrl,
  };
};
