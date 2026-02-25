import { UnifiedLead, UnifiedLeadRequest } from '../core/types';

import { defaultLead, keywordMatches } from './common';

import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';

import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string =>

  `https://x.com/search?q=${encodeURIComponent(keyword)}%20-filter%3Areplies&src=typed_query&f=user`;

const PARSER_META: ParserMeta = { platform: 'x', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const parseXFromJson = (html: string, keyword: string): UnifiedLead[] => {

  const leads: UnifiedLead[] = [];

  for (const blob of extractEmbeddedJsonBlobs(html)) {

    visitObjects(blob, (node: any) => {

      const username = typeof node?.screen_name === 'string' ? node.screen_name : null;

      const name = typeof node?.name === 'string' ? node.name : username;

      if (!username || !name) return;

      const website = typeof node?.url === 'string' && node.url.length > 0 ? node.url : undefined;

      const followers =

        typeof node?.followers_count === 'number'

          ? node.followers_count

          : typeof node?.followersCount === 'number'

            ? node.followersCount

            : undefined;

      leads.push(

        withParserMeta(

          {

            ...defaultLead('x', name, keywordMatches(`${name} ${username}`, [keyword]), `https://x.com/${username}`),

            website,

            rawData: followers !== undefined ? { followers } : undefined,

            confidence: 0.76,

          },

          PARSER_META,

          'embedded-json',

        ),

      );

    });

  }

  return leads;

};

const parseXFromDom = (html: string, keyword: string): UnifiedLead[] => {

  const leads: UnifiedLead[] = [];

  for (const m of html.matchAll(/href="\/(\w{1,30})"[^>]*>([^<]{1,80})</g)) {

    const username = m[1];

    if (['home', 'explore', 'notifications', 'messages', 'search'].includes(username.toLowerCase())) continue;

    const name = m[2].trim() || username;

    leads.push(

      withParserMeta(

        {

          ...defaultLead('x', name, keywordMatches(`${name} ${username}`, [keyword]), `https://x.com/${username}`),

          confidence: 0.62,

        },

        PARSER_META,

        'dom-fallback',

      ),

    );

  }

  return leads;

};

export const parseX = (html: string, keyword: string): UnifiedLead[] => {

  const fromJson = parseXFromJson(html, keyword);

  if (fromJson.length > 0) return fromJson;

  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseXFromDom(html, keyword);

  if (fromDom.length > 0) return fromDom;

  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const leads: UnifiedLead[] = [];

  for (const m of html.matchAll(/"screen_name":"([A-Za-z0-9_]{1,30})".*?"name":"([^"]{1,120})".*?"url":"([^"]*)"/g)) {

    const username = m[1];

    const name = m[2];

    const website = m[3] || undefined;

    leads.push(

      withParserMeta(

        {

          ...defaultLead('x', name, keywordMatches(`${name} ${username}`, [keyword]), `https://x.com/${username}`),

          website,

          confidence: 0.56,

        },

        PARSER_META,

        'regex-fallback',

      ),

    );

  }

  return leads;

};

export class XAdapter {

  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {

    return runSocialScrape(input, 'x', buildUrl, parseX);

  }

}