import axios, { AxiosInstance } from 'axios';
import { CheerioCrawler, ProxyConfiguration } from 'crawlee';
import { log } from './logger';

export const createHttpClient = (proxy?: string, timeoutMs = 25000): AxiosInstance => {
  const instance = axios.create({ timeout: timeoutMs, headers: { 'accept-language': 'en-US,en;q=0.9' } });
  if (proxy) {
    const p = new URL(proxy);
    instance.defaults.proxy = {
      protocol: p.protocol.replace(':', ''),
      host: p.hostname,
      port: Number(p.port || 80),
    };
  }
  return instance;
};

interface CheerioRunArgs {
  urls: string[];
  maxConcurrency?: number;
  timeoutMs?: number;
  proxy?: string;
  onPage: any;
}

export const runCheerioCrawler = async ({ urls, maxConcurrency = 3, timeoutMs = 20000, proxy, onPage }: CheerioRunArgs): Promise<void> => {
  const proxyConfiguration = proxy
    ? new ProxyConfiguration({ proxyUrls: [proxy] })
    : process.env.PROXY_URL
      ? new ProxyConfiguration({ proxyUrls: [process.env.PROXY_URL] })
      : undefined;

  const crawler = new CheerioCrawler({
    maxConcurrency,
    requestHandlerTimeoutSecs: Math.ceil(timeoutMs / 1000),
    proxyConfiguration,
    maxRequestRetries: 2,
    requestHandler: onPage,
    failedRequestHandler: ({ request, error }) => {
      log('WARN', `Cheerio request failed ${request.url}`, (error as any)?.message);
    },
  });

  await crawler.run(urls);
};
