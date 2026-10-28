import { randomUUID } from 'node:crypto';
import { mkdir, unlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import multer from 'multer';
import { rateLimiter } from './rateLimiter.js';
import config from '../config/index.js';

export const MAX_UPLOAD_BYTES = Math.min(Math.max(Number(process.env.MAX_FILE_SIZE) || 10 * 1024 * 1024, 1), 25 * 1024 * 1024);
const directory = path.resolve(tmpdir(), 'flowtask-attachment-uploads');
export const attachmentStorage = multer.diskStorage({
  destination(_req, _file, done) { mkdir(directory, { recursive: true }).then(() => done(null, directory), done); },
  filename(req, _file, done) { const name = randomUUID(); (req.uploadPaths ||= []).push(path.join(directory, name)); done(null, name); }
});
const users = new Map(); let total = 0;
export const uploadRateLimit = rateLimiter({ ...config.rateLimit.upload, keyFn: req => String(req.user._id || req.user.id) });
export function uploadBudget(req, res, next) {
  const key = `${req.workspaceId}:${req.user.id || req.user._id}`;
  if (total >= 8 || (users.get(key) || 0) >= 2) {
    res.setHeader('Retry-After', '5'); return res.status(429).json({ success: false, message: 'Uploads are busy. Retry shortly.' });
  }
  total += 1; users.set(key, (users.get(key) || 0) + 1);
  let released = false;
  const release = () => {
    if (released) return; released = true;
    total -= 1; const remaining = users.get(key) - 1;
    if (remaining) users.set(key, remaining); else users.delete(key);
    for (const file of [...[req.file, ...(Array.isArray(req.files) ? req.files : [])].filter(Boolean), ...(req.uploadPaths || []).map(filePath => ({ path: filePath }))]) {
      // Only remove individual server-generated files from this upload directory.
      if (file.path && path.dirname(path.resolve(file.path)) === directory) unlink(file.path).catch(() => {});
    }
  };
  res.once('finish', release);
  res.once('close', () => {
    if (res.writableFinished) return release();
    // Keep the slot while an abandoned provider request reaches its bounded
    // timeout; rapid disconnects must not evade the global concurrency budget.
    setTimeout(release, 60000).unref();
  });
  next();
}
