import crypto from 'crypto';
import * as cheerio from 'cheerio';
import { PlaywrightCrawler, ProxyConfiguration } from 'crawlee';
import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { log } from '../utils/logger';
import { applyStealthToContext } from '../utils/stealth';
import { abortCrawler, dedupeLeads, defaultLead, keywordMatches, toKeywords } from './common';

const RESULTS_PER_PAGE = 20;

const buildSeedUrls = (input: UnifiedLeadRequest): string[] => {
  const kws = toKeywords(input.keywords);
  return kws.map((kw) => {
    const query = `${kw} ${input.location || ''}`.trim();
    return `https://www.google.com/search?tbm=lcl&q=${encodeURIComponent(query)}&hl=en&gl=us&start=0`;
  });
};

const normalizeQueueUrl = (url: string): string => {
  const parsed = new URL(url);
  const canonical = new URL(`${parsed.origin}${parsed.pathname}`);
  const allowedParams = ['tbm', 'q', 'start', 'hl', 'gl'];
  for (const key of allowedParams) {
    const value = parsed.searchParams.get(key);
    if (value) canonical.searchParams.set(key, value);
  }
  canonical.searchParams.set('tbm', 'lcl');
  return canonical.toString();
};

const hashUrl = (url: string): string => crypto.createHash('sha1').update(url).digest('hex');

const parseMapCards = (html: string, keywords: string[]): UnifiedLead[] => {
  const $ = cheerio.load(html);
  const results: UnifiedLead[] = [];

  $('a[href*="/maps/place/"]').each((_, el) => {
    const name = $(el).attr('aria-label') || $(el).text().trim();
    const href = $(el).attr('href');
    if (!name || !href) return;
    const profileUrl = href.startsWith('http') ? href : `https://www.google.com${href}`;
    results.push(defaultLead('google_maps', name, keywordMatches(name, keywords), profileUrl));
  });

  return results;
};

export class GoogleMapsAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const leads: UnifiedLead[] = [];
    const seenRequests = new Set<string>();

    const seedUrls = buildSeedUrls(input).map((url) => normalizeQueueUrl(url));
    seedUrls.forEach((url) => seenRequests.add(hashUrl(url)));

    const proxyConfiguration = input.proxy
      ? new ProxyConfiguration({ proxyUrls: [input.proxy] })
      : process.env.PROXY_URL
        ? new ProxyConfiguration({ proxyUrls: [process.env.PROXY_URL] })
        : undefined;

    const crawler = new PlaywrightCrawler({
      maxConcurrency: input.maxConcurrency || 2,
      proxyConfiguration,
      maxRequestRetries: 2,
      preNavigationHooks: [
        async ({ page }) => {
          await applyStealthToContext(page.context());
        },
      ],
      requestHandler: async ({ page, request, crawler: activeCrawler }) => {
        const html = await page.content();
        leads.push(...parseMapCards(html, keywords));

        if (leads.length >= input.leadsCount) {
          log('INFO', 'Google Maps lead target reached. Aborting crawler early.');
          await abortCrawler(activeCrawler);
          return;
        }

        const currentUrl = new URL(request.loadedUrl || request.url);
        const start = Number(currentUrl.searchParams.get('start') || '0');

        const nextCandidates = new Set<string>();
        const domNext = await page.locator('a#pnnext, a[aria-label="Next"], a[aria-label="Next page"]').first().getAttribute('href');
        if (domNext) {
          nextCandidates.add(new URL(domNext, request.loadedUrl || request.url).toString());
        }

        const nextByChunk = new URL(currentUrl.toString());
        nextByChunk.searchParams.set('start', String(start + RESULTS_PER_PAGE));
        nextCandidates.add(nextByChunk.toString());

        const queue: { url: string; uniqueKey: string }[] = [];
        for (const candidate of nextCandidates) {
          const normalized = normalizeQueueUrl(candidate);
          const hash = hashUrl(normalized);
          if (seenRequests.has(hash)) continue;
          seenRequests.add(hash);
          queue.push({ url: normalized, uniqueKey: hash });
        }

        if (queue.length > 0) {
          await activeCrawler.addRequests(queue);
        }
      },
      failedRequestHandler: ({ request, error }) => {
        log('WARN', `Google Maps request failed ${request.url}`, (error as any)?.message);
      },
    });

    await crawler.run(seedUrls);

    let output = dedupeLeads(leads).slice(0, input.leadsCount);
    if (input.extractDetails) {
      output = await Promise.all(output.map(async (lead) => {
        if (!lead.website && lead.profileUrl) return lead;
        const enriched = lead.website ? await crawlWebsite(lead.website, input.extractSocialLinks) : {};
        return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };
      }));
    }

    return output;
  }
}
