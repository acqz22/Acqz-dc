import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { runCheerioCrawler } from '../utils/httpClient';
import { log } from '../utils/logger';
import { abortCrawler, applyPostParseFilters, dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, reachedLimit, toKeywords } from './common';

const buildSearchUrl = (keyword: string, location?: string, category?: string): string =>
  `https://www.justdial.com/${encodeURIComponent(location || 'India')}/${encodeURIComponent(`${keyword} ${category || ''}`.trim())}`;

const parseJustdial = ($: any, keywords: string[]): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  $('.resultbox, .cntanr').each((_, card) => {
    const name = $(card).find('.lng_cont_name, .resultbox_title_anchor').first().text().trim();
    const phone = $(card).find('[aria-label*="Call"], .callcontent').first().text().trim();
    const location = $(card).find('.cont_fl_addr, .locatcity').first().text().trim();
    const website = $(card).find('a[href*="http"]').attr('href');
    const ratingText = $(card).find('.green-box, [aria-label*="rating"]').first().text();
    const ratingMatch = ratingText.match(/(\d\.\d)/);
    if (!name) return;
    leads.push({
      ...defaultLead('justdial', name, keywordMatches(name, keywords)),
      phone,
      location,
      website,
      rawData: { rating: ratingMatch ? Number(ratingMatch[1]) : undefined },
      confidence: 0.82,
    });
  });
  return leads;
};

export class JustdialAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const leads: UnifiedLead[] = [];
    const filters = getPlatformFilters(input);
    const location = filters?.directory?.location || input.location;
    log('INFO', '[justdial] active filters', filters || {});

    await runCheerioCrawler({
      urls: keywords.map((k) => buildSearchUrl(k, location, filters?.directory?.category)),
      maxConcurrency: input.maxConcurrency || 3,
      proxy: input.proxy,
      onPage: async ({ $, crawler }) => {
        leads.push(...parseJustdial($, keywords));
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
