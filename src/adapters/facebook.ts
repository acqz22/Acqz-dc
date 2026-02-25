import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string, location?: string): string =>
  `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${keyword} ${location || ''}`.trim())}`;

const parseFacebook = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"name":"([^"]+)".*?"url":"(https:\/\/www.facebook.com\/[^"]+)"/g)) {
    const decodedUrl = m[2].replace(/\\\//g, '/');
    const likesMatch = html.match(new RegExp(`${m[1].replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}[\\s\\S]*?"fan_count":(\\d+)`));
    leads.push({
      ...defaultLead('facebook', m[1], keywordMatches(m[1], [keyword]), decodedUrl),
      rawData: { likes: Number(likesMatch?.[1] || 0) },
      confidence: 0.6,
    });
  }
  return leads;
};

export class FacebookAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'facebook', buildUrl, parseFacebook);
  }
}
