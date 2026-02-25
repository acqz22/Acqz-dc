import crypto from 'crypto';
import { UnifiedLead, UnifiedLeadRequest } from '../core/types';

export const toKeywords = (keywords: string | string[]): string[] => (Array.isArray(keywords) ? keywords : [keywords]);

export const keywordMatches = (text: string, keywords: string[]): string[] => {
  const normalized = text.toLowerCase();
  return keywords.filter((k) => normalized.includes(k.toLowerCase()));
};

export const dedupeLeads = (leads: UnifiedLead[]): UnifiedLead[] => {
  const seen = new Set<string>();
  return leads.filter((lead) => {
    const key = lead.profileUrl || lead.website || `${lead.platform}:${lead.name}:${lead.location || ''}`;
    const hash = crypto.createHash('md5').update(key).digest('hex');
    if (seen.has(hash)) return false;
    seen.add(hash);
    lead.id = lead.id || hash;
    return true;
  });
};

export const reachedLimit = (leads: UnifiedLead[], input: UnifiedLeadRequest): boolean => leads.length >= input.leadsCount;

export const defaultLead = (platform: string, name: string, keywords: string[], profileUrl?: string): UnifiedLead => ({
  id: crypto.createHash('sha1').update(`${platform}:${name}:${profileUrl || ''}`).digest('hex'),
  platform,
  name,
  profileUrl,
  socialLinks: {},
  matchedKeywords: keywords,
  confidence: 0.7,
  timestamp: new Date().toISOString(),
});
