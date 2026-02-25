import crypto from 'crypto';
import * as cheerio from 'cheerio';
import { createHttpClient } from '../utils/httpClient';
import { UnifiedLead } from './types';

const EMAIL_REGEX = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;

const extractSocialLinks = ($: cheerio.CheerioAPI): Record<string, string> => {
  const socialLinks: Record<string, string> = {};
  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    if (href.includes('instagram.com')) socialLinks.instagram = href;
    if (href.includes('facebook.com')) socialLinks.facebook = href;
    if (href.includes('linkedin.com')) socialLinks.linkedin = href;
    if (href.includes('x.com') || href.includes('twitter.com')) socialLinks.x = href;
    if (href.includes('tiktok.com')) socialLinks.tiktok = href;
  });
  return socialLinks;
};

export const crawlWebsite = async (website: string, includeSocial = true): Promise<Partial<UnifiedLead>> => {
  try {
    const client = createHttpClient();
    const { data } = await client.get(website);
    const $ = cheerio.load(String(data));
    const text = $('body').text();
    const email = text.match(EMAIL_REGEX)?.[0];
    const phone = text.match(PHONE_REGEX)?.[0];
    return {
      email,
      phone,
      socialLinks: includeSocial ? extractSocialLinks($) : {},
      id: crypto.createHash('sha1').update(website).digest('hex'),
    };
  } catch {
    return {};
  }
};
