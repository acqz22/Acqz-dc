import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { createHttpClient } from '../utils/httpClient';
import { log } from '../utils/logger';
import { applyPostParseFilters, dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, toKeywords } from './common';

const buildEndpoint = (keyword: string, country = 'US'): string =>
  `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${encodeURIComponent(country)}&q=${encodeURIComponent(keyword)}`;

const parseMetaAds = (html: string, keywords: string[]): UnifiedLead[] => {
  const regex = /"page_name":"([^"]+)".*?"page_id":"([^"]+)".*?"page_profile_uri":"([^"]+)"/g;
  const leads: UnifiedLead[] = [];
  for (const match of html.matchAll(regex)) {
    const name = match[1];
    const profileUrl = match[3].replace(/\\u0025/g, '%').replace(/\\\//g, '/');
    leads.push({
      ...defaultLead('meta_ads_library', name, keywordMatches(name, keywords), profileUrl),
      confidence: 0.76,
    });
  }
  return leads;
};

export class MetaAdsLibraryAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const client = createHttpClient(input.proxy);
    const keywords = toKeywords(input.keywords);
    const collected: UnifiedLead[] = [];
    const filters = getPlatformFilters(input);
    log('INFO', '[meta_ads_library] active filters', filters || {});

    for (const kw of keywords) {
      if (collected.length >= input.leadsCount) break;
      try {
        const { data } = await client.get(buildEndpoint(kw, filters?.ads?.country || 'US'));
        collected.push(...parseMetaAds(String(data), keywords));
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
        if (!lead.profileUrl) return lead;
        const enriched = await crawlWebsite(lead.profileUrl, input.extractSocialLinks);
        return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };
      }));
    }
    return output;
  }
}
