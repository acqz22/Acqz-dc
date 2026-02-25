import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string => `https://www.tiktok.com/search/user?q=${encodeURIComponent(keyword)}`;

const PARSER_META: ParserMeta = { platform: 'tiktok', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const parseTikTokFromJson = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const blob of extractEmbeddedJsonBlobs(html)) {
    visitObjects(blob, (node) => {
      const username = typeof node.uniqueId === 'string' ? node.uniqueId : null;
      const nickname = typeof node.nickname === 'string' ? node.nickname : username;
      if (!username || !nickname) return;
      const website = typeof node.bioLink === 'string' && node.bioLink.length > 0 ? node.bioLink : undefined;
      leads.push(withParserMeta({
        ...defaultLead('tiktok', nickname, keywordMatches(`${nickname} ${username}`, [keyword]), `https://www.tiktok.com/@${username}`),
        website,
        confidence: 0.72,
      }, PARSER_META, 'embedded-json'));
    });
  }
  return leads;
};

const parseTikTokFromDom = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/href="\/@([\w.]{2,40})"[^>]*>([^<]{2,120})</g)) {
    const username = m[1];
    const nickname = m[2].trim();
    leads.push(withParserMeta({
      ...defaultLead('tiktok', nickname, keywordMatches(`${nickname} ${username}`, [keyword]), `https://www.tiktok.com/@${username}`),
      confidence: 0.58,
    }, PARSER_META, 'dom-fallback'));
  }
  return leads;
};

export const parseTikTok = (html: string, keyword: string): UnifiedLead[] => {
  const fromJson = parseTikTokFromJson(html, keyword);
  if (fromJson.length > 0) return fromJson;
  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseTikTokFromDom(html, keyword);
  if (fromDom.length > 0) return fromDom;
  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"uniqueId":"([\w.]{2,40})".*?"nickname":"([^"]{2,120})".*?"bioLink":"([^"]*)"/g)) {
    const username = m[1];
    const nickname = m[2];
    const website = m[3] || undefined;
    leads.push(withParserMeta({
      ...defaultLead('tiktok', nickname, keywordMatches(`${nickname} ${username}`, [keyword]), `https://www.tiktok.com/@${username}`),
      website,
      confidence: 0.54,
    }, PARSER_META, 'regex-fallback'));
  }
  return leads;
};

export class TikTokAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'tiktok', buildUrl, parseTikTok);
  }
}
