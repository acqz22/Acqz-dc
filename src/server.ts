import 'dotenv/config';
import express, { Request, Response } from 'express';
import { getAdapter, isSupportedPlatform } from './core/adapterFactory';
import { FilterValidationError, normalizeFilters } from './core/filterNormalizer';
import { UnifiedLeadRequest } from './core/types';
import { browserPool } from './utils/browserPool';
import { log } from './utils/logger';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_, res) => res.json({ ok: true, service: 'acqz' }));

const isValidRequest = (input: UnifiedLeadRequest): string | null => {
  if (!input || typeof input !== 'object') return 'Body must be a JSON object';
  if (!Number.isFinite(input.leadsCount) || input.leadsCount <= 0) return 'leadsCount must be a positive number';
  if (typeof input.keywords !== 'string' && !Array.isArray(input.keywords)) return 'keywords must be a string or string[]';
  if (Array.isArray(input.keywords) && input.keywords.length === 0) return 'keywords array cannot be empty';
  if (typeof input.extractDetails !== 'boolean') return 'extractDetails must be boolean';
  if (typeof input.extractSocialLinks !== 'boolean') return 'extractSocialLinks must be boolean';
  return null;
};

app.post('/leads/:platform', async (req: Request, res: Response) => {
  if (req.header('x-api-key') !== process.env.API_KEY) return res.status(401).json({ error: 'Unauthorized' });

  const started = Date.now();
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

  try {
    const platform = req.params.platform.toLowerCase();
    const input = req.body as UnifiedLeadRequest;
    const validationError = isValidRequest(input);
    if (validationError) return res.status(400).json({ success: false, error: validationError });
    if (!isSupportedPlatform(platform)) return res.status(400).json({ success: false, error: `Unsupported platform: ${platform}` });

    const normalizedFilters = normalizeFilters(platform, input.filters, input.location);
    (input as UnifiedLeadRequest & { normalizedFilters: unknown }).normalizedFilters = normalizedFilters;

    input.maxConcurrency = input.maxConcurrency || 3;
    if (!input.proxy && process.env.PROXY_URL) input.proxy = process.env.PROXY_URL;

    const adapter = getAdapter(platform);
    const timeoutPromise = new Promise<never>((_, reject) => setTimeout(() => reject(new Error('Request timeout')), timeoutMs));
    const leads = await Promise.race([adapter.searchLeads(input), timeoutPromise]);

    return res.json({
      success: true,
      leadsFound: leads.length,
      leads,
      runtimeSeconds: Number(((Date.now() - started) / 1000).toFixed(2)),
    });
  } catch (error) {
    if (error instanceof FilterValidationError) {
      return res.status(400).json({ success: false, error: error.message });
    }
    log('ERROR', 'lead scraping request failed', (error as Error).message);
    return res.status(500).json({ success: false, error: (error as Error).message });
  }
});

const port = Number(process.env.PORT || 3000);
const server = app.listen(port, () => log('INFO', `acqz listening on ${port}`));

const shutdown = async () => {
  await browserPool.close();
  server.close(() => process.exit(0));
};

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
