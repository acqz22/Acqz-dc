import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string, location?: string): string =>
  `https://www.facebook.com/search/pages/?q=${encodeURIComponent(`${keyword} ${location || ''}`)}`;

const parseFacebook = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"name":"([^"]+)".*?"url":"(https:\/\/www.facebook.com\/[^"]+)"/g)) {
    leads.push({
      ...defaultLead('facebook', m[1], keywordMatches(m[1], [keyword]), m[2].replace(/\\\//g, '/')),
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
