import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { runCheerioCrawler } from '../utils/httpClient';
import { log } from '../utils/logger';
import { dedupeLeads, defaultLead, keywordMatches, reachedLimit, toKeywords } from './common';

const buildSearchUrls = (input: UnifiedLeadRequest): string[] => {
  const kws = toKeywords(input.keywords);
  return kws.map((kw) => `https://www.google.com/maps/search/${encodeURIComponent(`${kw} ${input.location || ''}`)}`);
};

const parseMapCards = ($: any, keywords: string[]): UnifiedLead[] => {
  const results: UnifiedLead[] = [];
  $('a[href*="/maps/place/"]').each((_, el) => {
    const name = $(el).attr('aria-label') || $(el).text().trim();
    const profileUrl = `https://www.google.com${$(el).attr('href') || ''}`;
    if (!name) return;
    results.push(defaultLead('google_maps', name, keywordMatches(name, keywords), profileUrl));
  });
  return results;
};

export class GoogleMapsAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const leads: UnifiedLead[] = [];

    await runCheerioCrawler({
      urls: buildSearchUrls(input),
      proxy: input.proxy,
      maxConcurrency: input.maxConcurrency || 3,
      onPage: async ({ $, crawler }) => {
        leads.push(...parseMapCards($, keywords));
        if (reachedLimit(leads, input)) {
          log('INFO', 'Google Maps lead target reached. Aborting crawler early.');
          await crawler.teardown();
        }
      },
    });

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
