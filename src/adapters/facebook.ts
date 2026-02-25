import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string, location?: string): string =>
  `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${keyword} ${location || ''}`.trim())}`;

const PARSER_META: ParserMeta = { platform: 'facebook', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const extractFanCount = (html: string, name: string): number | undefined => {
  const m = html.match(new RegExp(`${escapeRegExp(name)}[\\s\\S]*?"fan_count":(\\d+)`));
  return m?.[1] ? Number(m[1]) : undefined;
};

const parseFacebookFromJson = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const blob of extractEmbeddedJsonBlobs(html)) {
    visitObjects(blob, (node: any) => {
      const name = typeof node?.name === 'string' ? node.name : null;
      const url = typeof node?.url === 'string' && node.url.includes('facebook.com/') ? node.url : null;
      if (!name || !url) return;

      const fanCount = typeof node?.fan_count === 'number' ? node.fan_count : extractFanCount(html, name);

      leads.push(
        withParserMeta(
          {
            ...defaultLead('facebook', name, keywordMatches(name, [keyword]), url.replace(/\\\//g, '/')),
            rawData: fanCount !== undefined ? { likes: fanCount } : undefined,
            confidence: 0.72,
          },
          PARSER_META,
          'embedded-json',
        ),
      );
    });
  }
  return leads;
};

const parseFacebookFromDom = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const match of html.matchAll(/href="(https:\/\/www.facebook.com\/[^"?#]+)"[^>]*>([^<]{2,120})</g)) {
    const [, url, label] = match;
    const name = label.trim();
    const fanCount = extractFanCount(html, name);

    leads.push(
      withParserMeta(
        {
          ...defaultLead('facebook', name, keywordMatches(name, [keyword]), url),
          rawData: fanCount !== undefined ? { likes: fanCount } : undefined,
          confidence: 0.58,
        },
        PARSER_META,
        'dom-fallback',
      ),
    );
  }
  return leads;
};

export const parseFacebook = (html: string, keyword: string): UnifiedLead[] => {
  const fromJson = parseFacebookFromJson(html, keyword);
  if (fromJson.length > 0) return fromJson;
  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseFacebookFromDom(html, keyword);
  if (fromDom.length > 0) return fromDom;
  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"name":"([^"]{2,120})".*?"url":"(https:\/\/www.facebook.com\/[^"]{6,300})"/g)) {
    const name = m[1]?.trim();
    const url = m[2]?.replace(/\\\//g, '/');
    if (!name || !url.startsWith('https://www.facebook.com/')) continue;

    const fanCount = extractFanCount(html, name);

    leads.push(
      withParserMeta(
        {
          ...defaultLead('facebook', name, keywordMatches(name, [keyword]), url),
          rawData: fanCount !== undefined ? { likes: fanCount } : undefined,
          confidence: 0.52,
        },
        PARSER_META,
        'regex-fallback',
      ),
    );
  }
  return leads;
};

export class FacebookAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'facebook', buildUrl, parseFacebook);
  }
}
