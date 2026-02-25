import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { createHttpClient } from '../utils/httpClient';
import { log } from '../utils/logger';
import { applyPostParseFilters, dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, toKeywords } from './common';

const buildEndpoint = (keyword: string, country = 'US'): string =>
  `https://adstransparency.google.com/api/v1/ads?query=${encodeURIComponent(keyword)}&regionCode=${country}`;

const PARSER_VERSION = '2.0.0';
const PARSER_LAST_UPDATED = '2026-02-25';

const parseAds = (payload: any, keywords: string[]): UnifiedLead[] => {
  const rows = Array.isArray(payload?.results) ? payload.results : [];
  return rows.map((row: any) => ({
    ...defaultLead('google_ads_transparency', row.advertiserName || 'Unknown Advertiser', keywordMatches(`${row.advertiserName} ${row.landingPage}`, keywords), row.advertiserPageUrl),
    website: row.landingPage,
    rawData: {
      parser: {
        platform: 'google_ads_transparency',
        parserVersion: PARSER_VERSION,
        lastUpdated: PARSER_LAST_UPDATED,
        stage: 'api-json',
      },
      parserSource: row,
    },
    confidence: 0.8,
  }));
};

export class GoogleAdsTransparencyAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const client = createHttpClient(input.proxy);
    const filters = getPlatformFilters(input);
    const country = filters?.ads?.country || 'US';
    const collected: UnifiedLead[] = [];
    log('INFO', '[google_ads_transparency] active filters', filters || {});

    for (const keyword of keywords) {
      if (collected.length >= input.leadsCount) break;
      try {
        const { data } = await client.get(buildEndpoint(keyword, country));
        collected.push(...parseAds(data, keywords));
      } catch {
        continue;
      }
    }

    const gated = applyPostParseFilters(dedupeLeads(collected), {
      hasWebsite: filters?.ads?.hasWebsite,
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
