import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string): string =>
  `https://x.com/search?q=${encodeURIComponent(keyword)}%20-filter%3Areplies&src=typed_query&f=user`;

const parseX = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  const profileRegex = /"screen_name":"([^"]+)".*?"name":"([^"]+)".*?"url":"([^"]*)"/g;
  for (const m of html.matchAll(profileRegex)) {
    const username = m[1];
    const followerMatch = html.match(new RegExp(`"screen_name":"${username}"[\\s\\S]*?"followers_count":(\\d+)`));
    leads.push({
      ...defaultLead('x', m[2], keywordMatches(`${m[2]} ${username}`, [keyword]), `https://x.com/${username}`),
      website: m[3] || undefined,
      rawData: { followers: Number(followerMatch?.[1] || 0) },
      confidence: 0.7,
    });
  }
  return leads;
};

export class XAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'x', buildUrl, parseX);
  }
}
