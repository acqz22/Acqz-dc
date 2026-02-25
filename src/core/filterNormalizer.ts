import { SupportedPlatform } from './types';

const SUPPORTED_FILTER_KEYS = new Set([
  'minFollowers',
  'minRating',
  'hasWebsite',
  'radiusKm',
  'country',
  'minLikes',
  'minConnections',
  'category',
  'location',
  'industry',
]);

export interface UniversalFilters {
  minFollowers?: number;
  minRating?: number;
  hasWebsite?: boolean;
  radiusKm?: number;
  country?: string;
  minLikes?: number;
  minConnections?: number;
  category?: string;
  location?: string;
  industry?: string;
}

export interface SocialFilters {
  minFollowers?: number;
  minLikes?: number;
  hasWebsite?: boolean;
  location?: string;
}

export interface DirectoryFilters {
  minRating?: number;
  hasWebsite?: boolean;
  radiusKm?: number;
  category?: string;
  location?: string;
}

export interface AdsFilters {
  country: string;
  hasWebsite?: boolean;
}

export interface LinkedInFilters {
  minConnections?: number;
  hasWebsite?: boolean;
  location?: string;
  industry?: string;
}

export interface PlatformFilterConfig {
  platform: SupportedPlatform;
  universal: UniversalFilters;
  social?: SocialFilters;
  directory?: DirectoryFilters;
  ads?: AdsFilters;
  linkedin?: LinkedInFilters;
}

export class FilterValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'FilterValidationError';
  }
}

const validatePositiveNumber = (value: unknown, key: string): number | undefined => {
  if (value === undefined) return undefined;
  if (!Number.isFinite(value) || Number(value) < 0) {
    throw new FilterValidationError(`filters.${key} must be a non-negative number`);
  }
  return Number(value);
};

const validateString = (value: unknown, key: string): string | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'string' || !value.trim()) {
    throw new FilterValidationError(`filters.${key} must be a non-empty string`);
  }
  return value.trim();
};

const validateBoolean = (value: unknown, key: string): boolean | undefined => {
  if (value === undefined) return undefined;
  if (typeof value !== 'boolean') {
    throw new FilterValidationError(`filters.${key} must be a boolean`);
  }
  return value;
};

export const normalizeFilters = (
  platform: SupportedPlatform,
  rawFilters: unknown,
  fallbackLocation?: string,
): PlatformFilterConfig => {
  if (rawFilters === undefined) {
    const universal: UniversalFilters = fallbackLocation ? { location: fallbackLocation } : {};
    return {
      platform,
      universal,
      ads: platform === 'google_ads_transparency' || platform === 'meta_ads_library' ? { country: 'US' } : undefined,
    };
  }

  if (!rawFilters || typeof rawFilters !== 'object' || Array.isArray(rawFilters)) {
    throw new FilterValidationError('filters must be a JSON object');
  }

  const entries = Object.entries(rawFilters as Record<string, unknown>);
  for (const [key] of entries) {
    if (!SUPPORTED_FILTER_KEYS.has(key)) {
      throw new FilterValidationError(`filters.${key} is not supported`);
    }
  }

  const universal: UniversalFilters = {
    minFollowers: validatePositiveNumber((rawFilters as any).minFollowers, 'minFollowers'),
    minRating: validatePositiveNumber((rawFilters as any).minRating, 'minRating'),
    hasWebsite: validateBoolean((rawFilters as any).hasWebsite, 'hasWebsite'),
    radiusKm: validatePositiveNumber((rawFilters as any).radiusKm, 'radiusKm'),
    country: validateString((rawFilters as any).country, 'country'),
    minLikes: validatePositiveNumber((rawFilters as any).minLikes, 'minLikes'),
    minConnections: validatePositiveNumber((rawFilters as any).minConnections, 'minConnections'),
    category: validateString((rawFilters as any).category, 'category'),
    location: validateString((rawFilters as any).location, 'location') || fallbackLocation,
    industry: validateString((rawFilters as any).industry, 'industry'),
  };

  if (universal.minRating !== undefined && universal.minRating > 5) {
    throw new FilterValidationError('filters.minRating must be <= 5');
  }

  const base: PlatformFilterConfig = { platform, universal };

  if (platform === 'instagram' || platform === 'facebook' || platform === 'x' || platform === 'tiktok') {
    base.social = {
      minFollowers: universal.minFollowers,
      minLikes: universal.minLikes,
      hasWebsite: universal.hasWebsite,
      location: universal.location,
    };
  }

  if (platform === 'google_maps' || platform === 'yellowpages' || platform === 'justdial') {
    base.directory = {
      minRating: universal.minRating,
      hasWebsite: universal.hasWebsite,
      radiusKm: universal.radiusKm,
      category: universal.category,
      location: universal.location,
    };
  }

  if (platform === 'google_ads_transparency' || platform === 'meta_ads_library') {
    base.ads = {
      country: universal.country || 'US',
      hasWebsite: universal.hasWebsite,
    };
  }

  if (platform === 'linkedin') {
    base.linkedin = {
      minConnections: universal.minConnections,
      hasWebsite: universal.hasWebsite,
      location: universal.location,
      industry: universal.industry,
    };
  }

  return base;
};
