import crypto from 'crypto';

import { crawlWebsite } from '../core/leadEnricher';

import { UnifiedLead, UnifiedLeadRequest } from '../core/types';

import { runCheerioCrawler } from '../utils/httpClient';

import { log } from '../utils/logger';

import {

  abortCrawler,

  applyPostParseFilters,

  dedupeLeads,

  defaultLead,

  getPlatformFilters,

  keywordMatches,

  reachedLimit,

  toKeywords,

} from './common';

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

const normalizeQueueUrl = (url: string): string => {

  const parsed = new URL(url);

  const canonical = new URL(`${parsed.origin}${parsed.pathname}`);

  const allowedParams = ['page', 'city', 'q'];

  for (const key of allowedParams) {

    const value = parsed.searchParams.get(key);

    if (value) canonical.searchParams.set(key, value);

  }

  return canonical.toString();

};

const urlHash = (url: string): string => crypto.createHash('sha1').update(url).digest('hex');

export class JustdialAdapter {

  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {

    const keywords = toKeywords(input.keywords);

    const leads: UnifiedLead[] = [];

    const filters = getPlatformFilters(input);

    const location = filters?.directory?.location || input.location;

    log('INFO', '[justdial] active filters', filters || {});

    const seenPagination = new Set<string>();

    const seedUrls = keywords.map((k) => normalizeQueueUrl(buildSearchUrl(k, location, filters?.directory?.category)));

    seedUrls.forEach((url) => seenPagination.add(urlHash(url)));

    await runCheerioCrawler({

      urls: seedUrls,

      maxConcurrency: input.maxConcurrency || 3,

      proxy: input.proxy,

      onPage: async ({ $, crawler, request }) => {

        leads.push(...parseJustdial($, keywords));

        if (leads.length >= input.leadsCount) {

          await abortCrawler(crawler);

          return;

        }

        const nextCandidates = [

          $('a[rel="next"]').first().attr('href'),

          $('a.next, a.pagination-next').first().attr('href'),

          $('link[rel="next"]').attr('href'),

        ].filter(Boolean) as string[];

        const queue: { url: string; uniqueKey: string }[] = [];

        for (const nextHref of nextCandidates) {

          const absolute = new URL(nextHref, request.loadedUrl || request.url).toString();

          const normalized = normalizeQueueUrl(absolute);

          const hash = urlHash(normalized);

          if (seenPagination.has(hash)) continue;

          seenPagination.add(hash);

          queue.push({ url: normalized, uniqueKey: hash });

        }

        if (queue.length > 0 && !reachedLimit(leads, input)) {

          await crawler.addRequests(queue);

        }

      },

    });

    const gated = applyPostParseFilters(dedupeLeads(leads), {

      hasWebsite: filters?.directory?.hasWebsite,

      minRating: filters?.directory?.minRating,

      location,

    });

    let output = gated.slice(0, input.leadsCount);

    if (input.extractDetails) {

      output = await Promise.all(

        output.map(async (lead) => {

          if (!lead.website) return lead;

          const enriched = await crawlWebsite(lead.website, input.extractSocialLinks);

          return { ...lead, ...enriched, socialLinks: { ...lead.socialLinks, ...(enriched.socialLinks || {}) } };

        }),

      );

    }

    return output;

  }

}