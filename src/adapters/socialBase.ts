import { BrowserContext } from 'playwright';
import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { browserPool } from '../utils/browserPool';
import { log } from '../utils/logger';
import { applyStealthToContext } from '../utils/stealth';
import { applyPostParseFilters, dedupeLeads, getPlatformFilters } from './common';

export const runSocialScrape = async (
  input: UnifiedLeadRequest,
  platform: string,
  buildUrl: (keyword: string, location?: string) => string,
  parser: (html: string, keyword: string) => UnifiedLead[],
): Promise<UnifiedLead[]> => {
  const keywords = Array.isArray(input.keywords) ? input.keywords : [input.keywords];
  const normalized = getPlatformFilters(input);
  const location = normalized?.social?.location || normalized?.linkedin?.location || input.location;
  const browser = await browserPool.getBrowser();
  const context = await browser.newContext({ proxy: input.proxy ? { server: input.proxy } : undefined });
  await applyStealthToContext(context);
  log('INFO', `[${platform}] active filters`, normalized || {});

  const page = await context.newPage();
  const collected: UnifiedLead[] = [];
  try {
    for (const kw of keywords) {
      if (collected.length >= input.leadsCount) break;
      await page.goto(buildUrl(kw, location), { waitUntil: 'domcontentloaded', timeout: 30000 });
      for (let i = 0; i < 8; i += 1) {
        await page.mouse.wheel(0, 2000);
        await page.waitForTimeout(500);
      }
      const html = await page.content();
      collected.push(...parser(html, kw));
      if (collected.length >= input.leadsCount) break;
    }
  } catch (error) {
    log('WARN', `${platform} scrape failed`, (error as Error).message);
  } finally {
    await context.close();
  }

  const filtered = applyPostParseFilters(dedupeLeads(collected), {
    minFollowers: normalized?.social?.minFollowers,
    minLikes: normalized?.social?.minLikes,
    minConnections: normalized?.linkedin?.minConnections,
    hasWebsite: normalized?.social?.hasWebsite ?? normalized?.linkedin?.hasWebsite,
    location,
  });

  let output = filtered.slice(0, input.leadsCount);
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
