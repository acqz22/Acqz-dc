import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string => `https://www.instagram.com/explore/search/keyword/?q=${encodeURIComponent(keyword)}`;

const parseInstagram = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"username":"([^"]+)".*?"full_name":"([^"]*)".*?"external_url":"([^"]*)"/g)) {
    const username = m[1];
    const name = m[2] || username;
    const website = m[3] || undefined;
    leads.push({
      ...defaultLead('instagram', name, keywordMatches(`${name} ${username}`, [keyword]), `https://www.instagram.com/${username}/`),
      website,
      confidence: 0.65,
    });
  }
  return leads;
};

export class InstagramAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'instagram', buildUrl, parseInstagram);
  }
}
