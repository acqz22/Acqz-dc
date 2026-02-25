import { FacebookAdapter } from '../adapters/facebook';
import { GoogleAdsTransparencyAdapter } from '../adapters/google_ads_transparency';
import { GoogleMapsAdapter } from '../adapters/google_maps';
import { InstagramAdapter } from '../adapters/instagram';
import { JustdialAdapter } from '../adapters/justdial';
import { LinkedInAdapter } from '../adapters/linkedin';
import { MetaAdsLibraryAdapter } from '../adapters/meta_ads_library';
import { TikTokAdapter } from '../adapters/tiktok';
import { XAdapter } from '../adapters/x';
import { YellowPagesAdapter } from '../adapters/yellowpages';
import { SupportedPlatform, UnifiedLead, UnifiedLeadRequest } from './types';

export interface LeadAdapter { searchLeads(input: UnifiedLeadRequest): Promise<UnifiedLead[]>; }

const adapters: Record<SupportedPlatform, LeadAdapter> = {
  instagram: new InstagramAdapter(),
  facebook: new FacebookAdapter(),
  linkedin: new LinkedInAdapter(),
  google_maps: new GoogleMapsAdapter(),
  google_ads_transparency: new GoogleAdsTransparencyAdapter(),
  meta_ads_library: new MetaAdsLibraryAdapter(),
  x: new XAdapter(),
  tiktok: new TikTokAdapter(),
  yellowpages: new YellowPagesAdapter(),
  justdial: new JustdialAdapter(),
};

export const isSupportedPlatform = (platform: string): platform is SupportedPlatform =>
  Object.prototype.hasOwnProperty.call(adapters, platform.toLowerCase());

export const getAdapter = (platform: string): LeadAdapter => {
  const normalizedPlatform = platform.toLowerCase();
  if (!isSupportedPlatform(normalizedPlatform)) {
    throw new Error(`Unsupported platform: ${platform}`);
  }
  return adapters[normalizedPlatform];
};
