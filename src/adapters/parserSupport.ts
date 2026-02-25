import { load } from 'cheerio';
import { UnifiedLead } from '../core/types';
import { log } from '../utils/logger';

export type ParserMeta = {
  platform: string;
  parserVersion: string;
  lastUpdated: string;
};

export const parseJsonCandidate = (candidate: string): unknown | null => {
  const trimmed = candidate.trim();
  if (!trimmed || (!trimmed.startsWith('{') && !trimmed.startsWith('['))) return null;
  try {
    return JSON.parse(trimmed);
  } catch {
    return null;
  }
};

export const extractEmbeddedJsonBlobs = (html: string): unknown[] => {
  const $ = load(html);
  const blobs: unknown[] = [];
  $('script[type="application/json"], script#__NEXT_DATA__, script#__NUXT_DATA__').each((_, el) => {
    const parsed = parseJsonCandidate($(el).text());
    if (parsed !== null) blobs.push(parsed);
  });

  const hydrationRegexes = [
    /window\.__INITIAL_STATE__\s*=\s*({[\s\S]*?});/g,
    /window\.__APOLLO_STATE__\s*=\s*({[\s\S]*?});/g,
    /window\.__PRELOADED_STATE__\s*=\s*({[\s\S]*?});/g,
    /window\.__HYDRATION_STATE__\s*=\s*({[\s\S]*?});/g,
    /window\.__STATE__\s*=\s*({[\s\S]*?});/g,
  ];

  for (const regex of hydrationRegexes) {
    for (const match of html.matchAll(regex)) {
      const parsed = parseJsonCandidate(match[1]);
      if (parsed !== null) blobs.push(parsed);
    }
  }

  return blobs;
};

export const visitObjects = (value: unknown, visitor: (node: Record<string, unknown>) => void): void => {
  const seen = new Set<unknown>();
  const walk = (node: unknown): void => {
    if (!node || typeof node !== 'object' || seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }

    visitor(node as Record<string, unknown>);
    for (const child of Object.values(node as Record<string, unknown>)) {
      walk(child);
    }
  };

  walk(value);
};

export const withParserMeta = (lead: UnifiedLead, meta: ParserMeta, stage: string, rawData?: unknown): UnifiedLead => ({
  ...lead,
  rawData: {
    ...(lead.rawData && typeof lead.rawData === 'object' ? lead.rawData : {}),
    parser: {
      platform: meta.platform,
      parserVersion: meta.parserVersion,
      lastUpdated: meta.lastUpdated,
      stage,
    },
    ...(rawData !== undefined ? { parserSource: rawData } : {}),
  },
});

export const logFallback = (meta: ParserMeta, message: string): void => {
  log('WARN', `[${meta.platform}] parser fallback`, {
    parserVersion: meta.parserVersion,
    lastUpdated: meta.lastUpdated,
    message,
  });
};
