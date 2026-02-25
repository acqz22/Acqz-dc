import { UnifiedLead, UnifiedLeadRequest } from '../core/types';

import { defaultLead, keywordMatches } from './common';

import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';

import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string, location?: string): string =>

  `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER&geoUrn=${encodeURIComponent(location || '')}`;

const PARSER_META: ParserMeta = { platform: 'linkedin', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const parseLinkedInFromJson = (html: string, keyword: string): UnifiedLead[] => {

  const leads: UnifiedLead[] = [];

  for (const blob of extractEmbeddedJsonBlobs(html)) {

    visitObjects(blob, (node: any) => {

      const name = typeof node?.title === 'string' ? node.title : null;

      const navigationUrl = typeof node?.navigationUrl === 'string' ? node.navigationUrl : null;

      if (!name || !navigationUrl || !navigationUrl.includes('/company/')) return;

      const followers =

        typeof node?.followerCount === 'number'

          ? node.followerCount

          : typeof node?.follower_count === 'number'

            ? node.follower_count

            : undefined;

      leads.push(

        withParserMeta(

          {

            ...defaultLead('linkedin', name, keywordMatches(name, [keyword]), navigationUrl.replace(/\\\//g, '/')),

            rawData: followers !== undefined ? { connections: followers } : undefined,

            confidence: 0.68,

          },

          PARSER_META,

          'embedded-json',

        ),

      );

    });

  }

  return leads;

};

const parseLinkedInFromDom = (html: string, keyword: string): UnifiedLead[] => {

  const leads: UnifiedLead[] = [];

  for (const m of html.matchAll(/href="(https:\/\/www.linkedin.com\/company\/[^"?#]+)"[^>]*>([^<]{2,120})</g)) {

    const [, profileUrl, title] = m;

    leads.push(

      withParserMeta(

        {

          ...defaultLead('linkedin', title.trim(), keywordMatches(title, [keyword]), profileUrl),

          confidence: 0.54,

        },

        PARSER_META,

        'dom-fallback',

      ),

    );

  }

  return leads;

};

export const parseLinkedIn = (html: string, keyword: string): UnifiedLead[] => {

  const fromJson = parseLinkedInFromJson(html, keyword);

  if (fromJson.length > 0) return fromJson;

  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseLinkedInFromDom(html, keyword);

  if (fromDom.length > 0) return fromDom;

  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const leads: UnifiedLead[] = [];

  for (const m of html.matchAll(/"title":"([^"]{2,120})".*?"navigationUrl":"(https:\/\/www.linkedin.com\/company\/[^"]{6,300})"/g)) {

    const name = m[1]?.trim();

    const url = m[2]?.replace(/\\\//g, '/');

    if (!name || !url.startsWith('https://www.linkedin.com/company/')) continue;

    leads.push(

      withParserMeta(

        {

          ...defaultLead('linkedin', name, keywordMatches(name, [keyword]), url),

          confidence: 0.5,

        },

        PARSER_META,

        'regex-fallback',

      ),

    );

  }

  return leads;

};

export class LinkedInAdapter {

  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {

    return runSocialScrape(input, 'linkedin', buildUrl, parseLinkedIn);

  }

}