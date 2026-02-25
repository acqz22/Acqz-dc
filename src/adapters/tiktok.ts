import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string => `https://www.tiktok.com/search/user?q=${encodeURIComponent(keyword)}`;

const parseTikTok = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"uniqueId":"([^"]+)".*?"nickname":"([^"]+)".*?"bioLink":"([^"]*)"/g)) {
    const likesMatch = html.match(new RegExp(`"uniqueId":"${m[1]}"[\\s\\S]*?"heart":(\\d+)`));
    const followersMatch = html.match(new RegExp(`"uniqueId":"${m[1]}"[\\s\\S]*?"followerCount":(\\d+)`));
    leads.push({
      ...defaultLead('tiktok', m[2], keywordMatches(`${m[2]} ${m[1]}`, [keyword]), `https://www.tiktok.com/@${m[1]}`),
      website: m[3] || undefined,
      rawData: {
        likes: Number(likesMatch?.[1] || 0),
        followers: Number(followersMatch?.[1] || 0),
      },
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
