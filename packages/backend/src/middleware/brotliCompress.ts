import { type Request, type Response, type NextFunction } from 'express';
import zlib from 'node:zlib';
import path from 'node:path';
import fs from 'node:fs';

export function brotliCompress(req: Request, res: Response, next: NextFunction): void {
  const accept = req.headers['accept-encoding'] as string | undefined;
  if (!accept || req.headers['x-no-compression']) return next();

  const acceptBrotli = accept.includes('br');
  const acceptGzip = accept.includes('gzip');

  if (!acceptBrotli && !acceptGzip) return next();

  const originalWrite = res.write.bind(res);
  const originalEnd = res.end.bind(res);
  let body = Buffer.alloc(0);

  res.write = function (chunk: any, ..._args: any[]) {
    if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);
    return true;
  } as any;

  res.end = function (chunk?: any, ..._args: any[]) {
    if (chunk) body = Buffer.concat([body, Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)]);

    if (body.length < 1024 || res.statusCode === 204 || res.statusCode === 304) {
      res.setHeader('Content-Length', String(body.length));
      originalWrite(body);
      originalEnd();
      return;
    }

    if (acceptBrotli) {
      zlib.brotliCompress(body, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 6 } }, (err, compressed) => {
        if (err) {
          originalWrite(body);
          originalEnd();
          return;
        }
        res.removeHeader('Content-Length');
        res.setHeader('Content-Encoding', 'br');
        res.setHeader('Vary', 'Accept-Encoding');
        originalWrite(compressed);
        originalEnd();
      });
    } else if (acceptGzip) {
      zlib.gzip(body, { level: 6 }, (err, compressed) => {
        if (err) {
          originalWrite(body);
          originalEnd();
          return;
        }
        res.removeHeader('Content-Length');
        res.setHeader('Content-Encoding', 'gzip');
        res.setHeader('Vary', 'Accept-Encoding');
        originalWrite(compressed);
        originalEnd();
      });
    } else {
      originalWrite(body);
      originalEnd();
    }
  } as any;
  next();
}

const PROJECT_ROOT = path.resolve(import.meta.dirname, '..', '..', '..');
const FRONTEND_DIST = path.resolve(PROJECT_ROOT, 'dist', 'assets');

let hintsLinks: string[] | null = null;
function getHintsLinks(): string[] {
  if (hintsLinks) return hintsLinks;
  try {
    const files = fs.readdirSync(FRONTEND_DIST);
    const indexJs = files.find(f => f.startsWith('index-') && f.endsWith('.js'));
    const styleCss = files.find(f => f.startsWith('style-') && f.endsWith('.css'));
    hintsLinks = [
      ...(indexJs ? [`</assets/${indexJs}>; rel=modulepreload; as=script`] : []),
      ...(styleCss ? [`</assets/${styleCss}>; rel=preload; as=style`] : []),
    ];
  } catch { hintsLinks = []; }
  return hintsLinks;
}

export function createEarlyHintsMiddleware(): (req: Request, res: Response, next: NextFunction) => void {
  const links = getHintsLinks();
  return (req: Request, res: Response, next: NextFunction): void => {
    if (req.path.startsWith('/api/') || links.length === 0) { next(); return; }
    if (res.writeEarlyHints) {
      res.writeEarlyHints({ link: links });
    }
    next();
  };
}