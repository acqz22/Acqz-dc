import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { runCheerioCrawler } from '../utils/httpClient';
import { log } from '../utils/logger';
import { abortCrawler, applyPostParseFilters, dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, reachedLimit, toKeywords } from './common';

const buildSearchUrls = (input: UnifiedLeadRequest): string[] => {
  const kws = toKeywords(input.keywords);
  const filters = getPlatformFilters(input)?.directory;
  const location = filters?.location || input.location || '';
  const radiusHint = filters?.radiusKm ? ` within ${filters.radiusKm} km` : '';
  const categoryHint = filters?.category ? ` ${filters.category}` : '';
  return kws.map((kw) => `https://www.google.com/maps/search/${encodeURIComponent(`${kw}${categoryHint} ${location}${radiusHint}`.trim())}`);
};

const GOOGLE_HOST_PATTERN = /(^|\.)google\./i;

const normalizeCandidateWebsite = (candidate?: string): string | undefined => {
  if (!candidate) return undefined;
  try {
    const parsed = new URL(candidate);
    if (!/^https?:$/i.test(parsed.protocol)) return undefined;
    if (GOOGLE_HOST_PATTERN.test(parsed.hostname)) return undefined;
    return parsed.toString();
  } catch {
    return undefined;
  }
};

const extractBusinessWebsite = ($: any, card: any): string | undefined => {
  const websiteAnchor = $(card)
    .find('a[data-value="Website"], a[aria-label*="Website" i], a[href*="/url?"], a[href*="?q=http"]')
    .toArray()
    .map((el: any) => $(el).attr('href'))
    .find(Boolean);

  if (!websiteAnchor) return undefined;

  try {
    const resolved = new URL(websiteAnchor, 'https://www.google.com');
    const wrappedUrl = resolved.searchParams.get('q') || resolved.searchParams.get('url');
    return normalizeCandidateWebsite(wrappedUrl || resolved.toString());
  } catch {
    return normalizeCandidateWebsite(websiteAnchor);
  }
};

const parseMapCards = ($: any, keywords: string[]): UnifiedLead[] => {
  const results: UnifiedLead[] = [];
  $('a[href*="/maps/place/"]').each((_, el) => {
    const name = $(el).attr('aria-label') || $(el).text().trim();
    const profileUrl = `https://www.google.com${$(el).attr('href') || ''}`;
    const card = $(el).closest('div').parent();
    const parentText = card.text();
    const ratingMatch = parentText.match(/(\d\.\d)\s*\(/);
    const website = extractBusinessWebsite($, card);
    if (!name) return;
    results.push({
      ...defaultLead('google_maps', name, keywordMatches(name, keywords), profileUrl),
      website,
      rawData: {
        rating: ratingMatch ? Number(ratingMatch[1]) : undefined,
      },
    });
  });
  return results;
};

export class GoogleMapsAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    const keywords = toKeywords(input.keywords);
    const leads: UnifiedLead[] = [];
    const filters = getPlatformFilters(input);
    log('INFO', '[google_maps] active filters', filters || {});

    await runCheerioCrawler({
      urls: buildSearchUrls(input),
      proxy: input.proxy,
      maxConcurrency: input.maxConcurrency || 3,
      onPage: async ({ $, crawler }) => {
        leads.push(...parseMapCards($, keywords));
        if (reachedLimit(leads, input)) {
          log('INFO', 'Google Maps lead target reached. Aborting crawler early.');
          await abortCrawler(crawler);
        }
      },
    });

    const gated = applyPostParseFilters(dedupeLeads(leads), {
      hasWebsite: filters?.directory?.hasWebsite,
      minRating: filters?.directory?.minRating,
    });

    let output = gated.slice(0, input.leadsCount);
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
