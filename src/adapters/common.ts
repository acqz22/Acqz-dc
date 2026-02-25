import crypto from 'crypto';
import { PlatformFilterConfig } from '../core/filterNormalizer';
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

export const getPlatformFilters = (input: UnifiedLeadRequest): PlatformFilterConfig | undefined =>
  (input as UnifiedLeadRequest & { normalizedFilters?: PlatformFilterConfig }).normalizedFilters;

const includesLocation = (lead: UnifiedLead, location?: string): boolean => {
  if (!location) return true;
  const leadLocation = lead.location?.toLowerCase() || '';
  return leadLocation.includes(location.toLowerCase());
};

export const applyPostParseFilters = (
  leads: UnifiedLead[],
  options: {
    hasWebsite?: boolean;
    minRating?: number;
    minFollowers?: number;
    minLikes?: number;
    minConnections?: number;
    location?: string;
  },
): UnifiedLead[] => leads.filter((lead) => {
  if (options.hasWebsite === true && !lead.website) return false;

  const metrics = (lead.rawData || {}) as Record<string, number>;
  if (options.minRating !== undefined && Number(metrics.rating || 0) < options.minRating) return false;
  if (options.minFollowers !== undefined && Number(metrics.followers || 0) < options.minFollowers) return false;
  if (options.minLikes !== undefined && Number(metrics.likes || 0) < options.minLikes) return false;
  if (options.minConnections !== undefined && Number(metrics.connections || 0) < options.minConnections) return false;

  return includesLocation(lead, options.location);
});

export const abortCrawler = async (crawler: any): Promise<void> => {
  try {
    if (typeof crawler?.abort === 'function') {
      await crawler.abort();
      return;
    }
    if (crawler?.autoscaledPool && typeof crawler.autoscaledPool.abort === 'function') {
      await crawler.autoscaledPool.abort();
      return;
    }
    if (typeof crawler?.teardown === 'function') {
      await crawler.teardown();
    }
  } catch {
    // no-op
  }
};
