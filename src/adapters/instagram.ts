import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { extractEmbeddedJsonBlobs, logFallback, ParserMeta, visitObjects, withParserMeta } from './parserSupport';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`;

const PARSER_META: ParserMeta = { platform: 'instagram', parserVersion: '2.0.0', lastUpdated: '2026-02-25' };

const parseInstagramFromJson = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const blob of extractEmbeddedJsonBlobs(html)) {
    visitObjects(blob, (node) => {
      const username = typeof node.username === 'string' ? node.username : null;
      if (!username) return;
      const name = typeof node.full_name === 'string' && node.full_name.length > 0 ? node.full_name : username;
      const website = typeof node.external_url === 'string' && node.external_url.length > 0 ? node.external_url : undefined;
      leads.push(withParserMeta({
      ...defaultLead('instagram', name, keywordMatches(`${name} ${username}`, [keyword]), `https://www.instagram.com/${username}/`),
      website,
      confidence: 0.74,
      }, PARSER_META, 'embedded-json'));
    });
  }
  return leads;
};

const parseInstagramFromDom = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/href="\/(\w[\w.]{1,29})\/"[^>]*>([^<]{1,80})</g)) {
    const username = m[1];
    const label = m[2].trim() || username;
    leads.push(withParserMeta({
      ...defaultLead('instagram', label, keywordMatches(`${label} ${username}`, [keyword]), `https://www.instagram.com/${username}/`),
      confidence: 0.6,
    }, PARSER_META, 'dom-fallback'));
  }
  return leads;
};

export const parseInstagram = (html: string, keyword: string): UnifiedLead[] => {
  const fromJson = parseInstagramFromJson(html, keyword);
  if (fromJson.length > 0) return fromJson;
  logFallback(PARSER_META, 'embedded-json produced 0 leads; trying DOM selectors');

  const fromDom = parseInstagramFromDom(html, keyword);
  if (fromDom.length > 0) return fromDom;
  logFallback(PARSER_META, 'DOM fallback produced 0 leads; trying guarded regex fallback');

  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"username":"([\w.]{2,30})".*?"full_name":"([^"]{0,120})".*?"external_url":"([^"]*)"/g)) {
    const username = m[1];
    const name = m[2] || username;
    const website = m[3] || undefined;
    leads.push(withParserMeta({
      ...defaultLead('instagram', name, keywordMatches(`${name} ${username}`, [keyword]), `https://www.instagram.com/${username}/`),
      website,
      confidence: 0.55,
    }, PARSER_META, 'regex-fallback'));
  }
  return leads;
};

export class InstagramAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'instagram', buildUrl, parseInstagram);
  }
}
