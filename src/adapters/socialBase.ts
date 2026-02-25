import { PlaywrightCrawler, RequestQueue } from 'crawlee';
import { BrowserContext } from 'playwright';
import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { getBrowserLaunchOptions } from '../utils/browserPool';
import { log } from '../utils/logger';
import { prepareStealthPage } from '../utils/stealth';
import { dedupeLeads } from './common';

interface SocialRequestData {
  keyword: string;
  location?: string;
}

const SCROLL_ROUNDS = 8;
const SCROLL_DISTANCE = 2000;
const SCROLL_WAIT_MS = 500;

export const runSocialScrape = async (
  input: UnifiedLeadRequest,
  platform: string,
  buildUrl: (keyword: string, location?: string) => string,
  parser: (html: string, keyword: string) => UnifiedLead[],
): Promise<UnifiedLead[]> => {
  const keywords = Array.isArray(input.keywords) ? input.keywords : [input.keywords];
  const maxConcurrency = input.maxConcurrency ?? 3;
  const requestTimeoutSecs = maxConcurrency * 10;
  const requestQueue = await RequestQueue.open(`${platform}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`);
  const collected: UnifiedLead[] = [];

  const locationVariants = input.location ? [input.location, undefined] : [undefined];
  const uniqueVariants = [...new Set(locationVariants.map((value) => value ?? '__none__'))].map((value) => (value === '__none__' ? undefined : value));

  for (const keyword of keywords) {
    for (const location of uniqueVariants) {
      await requestQueue.addRequest({
        url: buildUrl(keyword, location),
        uniqueKey: `${keyword}::${location ?? 'none'}`,
        userData: { keyword, location } satisfies SocialRequestData,
      });
    }
  }

  const crawler = new PlaywrightCrawler({
    maxConcurrency,
    requestHandlerTimeoutSecs: requestTimeoutSecs,
    navigationTimeoutSecs: requestTimeoutSecs,
    requestQueue,
    launchContext: {
      launchOptions: getBrowserLaunchOptions(),
      proxyUrl: input.proxy,
    },
    preNavigationHooks: [
      async ({ page }, gotoOptions) => {
        await prepareStealthPage(page);
        gotoOptions.waitUntil = 'domcontentloaded';
        gotoOptions.timeout = requestTimeoutSecs * 1000;
      },
    ],
    requestHandler: async ({ page, request, crawler: activeCrawler }) => {
      if (collected.length >= input.leadsCount) {
        await activeCrawler.autoscaledPool?.abort();
        return;
      }

      for (let i = 0; i < SCROLL_ROUNDS; i += 1) {
        await page.mouse.wheel(0, SCROLL_DISTANCE);
        await page.waitForTimeout(SCROLL_WAIT_MS);
      }

      const html = await page.content();
      const { keyword } = (request.userData ?? {}) as SocialRequestData;
      if (!keyword) return;

      collected.push(...parser(html, keyword));

      if (collected.length >= input.leadsCount) {
        await requestQueue.drop();
        await activeCrawler.autoscaledPool?.abort();
      }
    },
    failedRequestHandler: async ({ request, error }) => {
      log('WARN', `${platform} request failed`, `${request.url}: ${(error as Error).message}`);
    },
  });

  try {
    await crawler.run();
  } catch (error) {
    log('WARN', `${platform} scrape failed`, (error as Error).message);
  } finally {
    await crawler.teardown();
  }

  let output = dedupeLeads(collected).slice(0, input.leadsCount);
  if (input.extractDetails) {
    output = await Promise.all(output.map(async (lead) => {
      if (!lead.website) return lead;
      const enriched = await crawlWebsite(lead.website, input.extractSocialLinks);
      return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };
    }));
  }
  return output;
};

export const closeTag = (context: BrowserContext): Promise<void> => context.close();
