export interface UnifiedLeadRequest {
  leadsCount: number; // target 3000-5000, stop early
  keywords: string | string[]; // niche e.g. "plumber" or ["cafe","restaurant"]
  location?: string; // "Bengaluru, Karnataka" or "New York, NY"
  filters?: Record<string, any>; // { minFollowers?: number, radiusKm?: 50, hasWebsite?: true, ... }
  extractDetails: boolean; // deep crawl bios/websites
  extractSocialLinks: boolean;
  maxConcurrency?: number; // override default 3
  proxy?: string; // optional
}

export interface UnifiedLead {
  id: string; // hash or platform-id
  platform: string;
  name: string;
  profileUrl?: string;
  location?: string;
  phone?: string;
  email?: string;
  website?: string;
  socialLinks: Record<string, string>; // { instagram: "...", ... }
  rawData?: any; // for debugging
  matchedKeywords: string[];
  confidence: number; // 0-1
  timestamp: string;
}
