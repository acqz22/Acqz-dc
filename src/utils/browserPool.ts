import { Browser, BrowserContextOptions, LaunchOptions, chromium } from 'playwright';

const SHARED_LAUNCH_OPTIONS: LaunchOptions = {
  headless: true,
  args: ['--disable-dev-shm-usage', '--no-sandbox', '--disable-gpu'],
};

export const getBrowserLaunchOptions = (): LaunchOptions => ({ ...SHARED_LAUNCH_OPTIONS });

export const getBrowserContextOptions = (proxy?: string): BrowserContextOptions => ({
  proxy: proxy ? { server: proxy } : undefined,
});

class SharedBrowserPool {
  private browser: Browser | null = null;

  async getBrowser(): Promise<Browser> {
    if (!this.browser) {
      this.browser = await chromium.launch(getBrowserLaunchOptions());
    }
    return this.browser;
  }

  async close(): Promise<void> {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

export const browserPool = new SharedBrowserPool();
