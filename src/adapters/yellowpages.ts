import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { runCheerioCrawler } from '../utils/httpClient';
import { log } from '../utils/logger';
import { abortCrawler, applyPostParseFilters, dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, reachedLimit, toKeywords } from './common';

const buildSearchUrl = (keyword: string, location?: string, category?: string): string =>
  `https://www.yellowpages.com/search?search_terms=${encodeURIComponent(`${keyword} ${category || ''}`.trim())}&geo_location_terms=${encodeURIComponent(location || '')}`;

const parseYellowPages = ($: any, keywords: string[]): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  $('.result').each((_, card) => {
    const name = $(card).find('.business-name span').text().trim();
    const profileUrl = $(card).find('.business-name').attr('href');
    const phone = $(card).find('.phones').text().trim();
    const website = $(card).find('a.track-visit-website').attr('href');
    const location = $(card).find('.locality').text().trim();
    const ratingText = $(card).find('.ratings .count, .ratings').first().text();
    const ratingMatch = ratingText.match(/(\d\.\d)/);
    if (!name) return;
    leads.push({
      ...defaultLead('yellowpages', name, keywordMatches(name, keywords), profileUrl?.startsWith('http') ? profileUrl : `https://www.yellowpages.com${profileUrl || ''}`),
      phone,
      website,
      location,
      rawData: { rating: ratingMatch ? Number(ratingMatch[1]) : undefined },
      confidence: 0.88,
    });
  });
  return leads;
};

export class YellowPagesAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const leads: UnifiedLead[] = [];
    const filters = getPlatformFilters(input);
    const location = filters?.directory?.location || input.location;
    log('INFO', '[yellowpages] active filters', filters || {});

    await runCheerioCrawler({
      urls: keywords.map((k) => buildSearchUrl(k, location, filters?.directory?.category)),
      maxConcurrency: input.maxConcurrency || 3,
      proxy: input.proxy,
      onPage: async ({ $, crawler }) => {
        leads.push(...parseYellowPages($, keywords));
        if (reachedLimit(leads, input)) await abortCrawler(crawler);
      },
    });

    const gated = applyPostParseFilters(dedupeLeads(leads), {
      hasWebsite: filters?.directory?.hasWebsite,
      minRating: filters?.directory?.minRating,
      location,
    });

    let output = gated.slice(0, input.leadsCount);
    if (input.extractDetails) {
      output = await Promise.all(output.map(async (lead) => {
        if (!lead.website) return lead;
        const enriched = await crawlWebsite(lead.website, input.extractSocialLinks);
        return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };
      }));
    }
    return output;
  }
}
