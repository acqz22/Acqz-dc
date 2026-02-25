import 'dotenv/config';
import express, { Request, Response } from 'express';
import { getAdapter } from './core/adapterFactory';
import { UnifiedLeadRequest } from './core/types';
import { browserPool } from './utils/browserPool';
import { log } from './utils/logger';

const app = express();
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_, res) => res.json({ ok: true, service: 'acqz' }));

app.post('/leads/:platform', async (req: Request, res: Response) => {
  if (req.header('x-api-key') !== process.env.API_KEY) return res.status(401).json({ error: 'Unauthorized' });

  const started = Date.now();
  const timeoutMs = Number(process.env.REQUEST_TIMEOUT_MS || 120000);

  try {
    const platform = req.params.platform;
    const input = req.body as UnifiedLeadRequest;
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
