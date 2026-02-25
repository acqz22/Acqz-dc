import { FingerprintGenerator } from 'fingerprint-generator';
import { FingerprintInjector } from 'fingerprint-injector';
import { BrowserContext, Page } from 'playwright';

const generator = new FingerprintGenerator({
  browsers: [{ name: 'chrome', minVersion: 120 }],
  devices: ['desktop'],
  operatingSystems: ['windows', 'linux', 'macos'],
});

const injector = new FingerprintInjector();

export const getStealthHeaders = (): Record<string, string> => {
  const fingerprint = generator.getFingerprint();
  return {
    'accept-language': 'en-US,en;q=0.9',
    'sec-ch-ua': fingerprint.headers['sec-ch-ua'] ?? '"Chromium";v="120"',
    'sec-ch-ua-mobile': '?0',
    'sec-ch-ua-platform': fingerprint.headers['sec-ch-ua-platform'] ?? '"Windows"',
    'upgrade-insecure-requests': '1',
    'user-agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
  };
};

export const applyStealthToContext = async (context: BrowserContext): Promise<void> => {
  const fingerprint = generator.getFingerprint();
  await injector.attachFingerprintToPlaywright(context, fingerprint);
  await context.setExtraHTTPHeaders(getStealthHeaders());
  await context.route('**/*', (route) => {
    const type = route.request().resourceType();
    if (['image', 'font', 'stylesheet', 'media'].includes(type)) {
      return route.abort();
    }
    return route.continue();
  });
};

const preparedContexts = new WeakSet<BrowserContext>();

export const prepareStealthContext = async (context: BrowserContext): Promise<void> => {
  if (preparedContexts.has(context)) return;
  await applyStealthToContext(context);
  preparedContexts.add(context);
};

export const prepareStealthPage = async (page: Page): Promise<void> => {
  await prepareStealthContext(page.context());
};
