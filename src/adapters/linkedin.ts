import { UnifiedLead, UnifiedLeadRequest } from '../core/types';
import { defaultLead, keywordMatches } from './common';
import { runSocialScrape } from './socialBase';

const buildUrl = (keyword: string, location?: string): string =>
  `https://www.linkedin.com/search/results/companies/?keywords=${encodeURIComponent(keyword)}&origin=GLOBAL_SEARCH_HEADER&geoUrn=${encodeURIComponent(location || '')}`;

const parseLinkedIn = (html: string, keyword: string): UnifiedLead[] => {
  const leads: UnifiedLead[] = [];
  for (const m of html.matchAll(/"title":"([^"]+)".*?"navigationUrl":"(https:\/\/www.linkedin.com\/company\/[^"]+)"/g)) {
    leads.push({
      ...defaultLead('linkedin', m[1], keywordMatches(m[1], [keyword]), m[2].replace(/\\\//g, '/')),
      confidence: 0.5,
    });
  }
  return leads;
};

export class LinkedInAdapter {
  async searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]> {
    return runSocialScrape(input, 'linkedin', buildUrl, parseLinkedIn);
  }
}
