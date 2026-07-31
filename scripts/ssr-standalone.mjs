import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PassThrough } from 'node:stream';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');

async function main() {
  const app = express();

  // 加载 SSR 模块
  const mod = await import(path.resolve(ROOT, 'dist-ssr/entry-server.js'));
  const render = mod.render;

  // 加载 HTML 模板
  const html = fs.readFileSync(path.resolve(ROOT, 'dist/index.html'), 'utf-8');
  const marker = '<!--ssr-outlet-->';
  const idx = html.indexOf(marker);
  const htmlHead = html.slice(0, idx);
  const htmlTail = html.slice(idx + marker.length);

  // 静态文件
  app.use('/assets', express.static(path.resolve(ROOT, 'dist/assets'), { maxAge: '1y' }));

  // SSR 路由
  app.get('*', async (req, res) => {
    if (req.path.startsWith('/api/')) return res.status(404).json({ error: 'API not available' });
    if (req.path.startsWith('/assets/')) return;

    try {
      const url = req.originalUrl || req.url;
      console.log('[ssr] rendering:', url);
      const stream = render(url);

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('X-Rendered-By', 'ssr');
      res.write(htmlHead);

      const pt = new PassThrough();
      pt.pipe(res, { end: false });
      pt.on('end', () => {
        console.log('[ssr] stream ended, writing tail');
        res.end(htmlTail);
      });
      pt.on('error', (e) => {
        console.log('[ssr] stream error:', e.message);
        if (!res.headersSent) {
          res.write(htmlHead);
          res.end(htmlTail);
        }
      });

      stream.pipe(pt);
    } catch (e) {
      console.log('[ssr] render error:', e.message);
      res.status(500).send('SSR Error: ' + e.message);
    }
  });

  app.listen(15002, () => console.log('SSR standalone server on :15002'));
}

main().catch(e => console.error('FATAL:', e));