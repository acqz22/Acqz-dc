import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string => `https://www.tiktok.com/search/user?q=${encodeURIComponent(keyword)}`;

const parseTikTok = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"uniqueId":"([^"]+)".*?"nickname":"([^"]+)".*?"bioLink":"([^"]*)"/g)) {
    leads.push({
      ...defaultLead('tiktok', m[2], keywordMatches(`${m[2]} ${m[1]}`, [keyword]), `https://www.tiktok.com/@${m[1]}`),
      website: m[3] || undefined,
      confidence: 0.65,
    });
  }
  return leads;
};

export class TikTokAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'tiktok', buildUrl, parseTikTok);
  }
}
