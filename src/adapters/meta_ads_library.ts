import { crawlWebsite } from '../core/leadEnricher';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { createHttpClient } from '../utils/httpClient';
import { log } from '../utils/logger';
import { dedupeLeads, defaultLead, getPlatformFilters, keywordMatches, toKeywords } from './common';
import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';

const buildEndpoint = (keyword: string, country = 'US'): string =>
  `https://www.facebook.com/ads/library/?active_status=all&ad_type=all&country=${encodeURIComponent(country)}&q=${encodeURIComponent(keyword)}`;

const PARSER_META: ParserMeta = { platform: 'meta_ads_library', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const BAD_HOSTS = /(^|\.)facebook\.com$|(^|\.)fb\.com$|(^|\.)google\./i;

const normalizeWebsite = (candidate?: unknown): string | undefined => {
  if (typeof candidate !== 'string' || candidate.length < 8) return undefined;
  try {
    const u = new URL(candidate);
    if (!/^https?:$/i.test(u.protocol)) return undefined;
    if (BAD_HOSTS.test(u.hostname)) return undefined;
    return u.toString();
  } catch {
    return undefined;
  }
};

const parseMetaAdsFromJson = (html: string, keywords: string[]): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const blob of extractEmbeddedJsonBlobs(html)) {
    visitObjects(blob, (node: any) => {
      const name = typeof node?.page_name === 'string' ? node.page_name : null;
      const profileUrlRaw = typeof node?.page_profile_uri === 'string' ? node.page_profile_uri : null;
      if (!name || !profileUrlRaw || !profileUrlRaw.includes('facebook.com/')) return;

      const profileUrl = profileUrlRaw.replace(/\\u0025/g, '%').replace(/\\\//g, '/');

      const website =
        normalizeWebsite(node?.link_url) ||
        normalizeWebsite(node?.linkUrl) ||
        normalizeWebsite(node?.website_url) ||
        normalizeWebsite(node?.websiteUrl) ||
        normalizeWebsite(node?.destination_url) ||
        normalizeWebsite(node?.destinationUrl);

      leads.push(
        withParserMeta(
          {
            ...defaultLead('meta_ads_library', name, keywordMatches(name, keywords), profileUrl),
            website,
            confidence: 0.8,
          },
          PARSER_META,
          'embedded-json',
        ),
      );
    });
  }
  return leads;
};

const parseMetaAdsFromDom = (html: string, keywords: string[]): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/href="(https:\/\/www.facebook.com\/[^"?#]+)"[^>]*>([^<]{2,120})</g)) {
    const [, profileUrl, name] = m;
    leads.push(
      withParserMeta(
        {
          ...defaultLead('meta_ads_library', name.trim(), keywordMatches(name, keywords), profileUrl),
          confidence: 0.6,
        },
        PARSER_META,
        'dom-fallback',
      ),
    );
  }
  return leads;
};

export const parseMetaAds = (html: string, keywords: string[]): UnifiedLead[] => {
  const fromJson = parseMetaAdsFromJson(html, keywords);
  if (fromJson.length > 0) return fromJson;
  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseMetaAdsFromDom(html, keywords);
  if (fromDom.length > 0) return fromDom;
  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const regex = /"page_name":"([^"]{2,120})".*?"page_id":"([^"]{2,120})".*?"page_profile_uri":"([^"]{6,300})"/g;
  const leads: UnifiedLead[] = [];
  for (const match of html.matchAll(regex)) {
    const name = match[1];
    const profileUrl = match[3].replace(/\\u0025/g, '%').replace(/\\\//g, '/');
    if (!profileUrl.startsWith('https://www.facebook.com/')) continue;
    leads.push(
      withParserMeta(
        {
          ...defaultLead('meta_ads_library', name, keywordMatches(name, keywords), profileUrl),
          confidence: 0.54,
        },
        PARSER_META,
        'regex-fallback',
      ),
    );
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

    let output = dedupeLeads(collected).slice(0, input.leadsCount);

    if (input.extractDetails) {
      output = await Promise.all(
        output.map(async (lead) => {
          const target = lead.website || lead.profileUrl;
          if (!target) return lead;
          const enriched = await crawlWebsite(target, input.extractSocialLinks);
          return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };
        }),
      );

      // enforce hasWebsite only after enrichment (otherwise you drop everything when website isn't parsed)
      if (filters?.ads?.hasWebsite === true) output = output.filter((l) => !!l.website);
    }

    return output.slice(0, input.leadsCount);
  }
    }
