import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { v2 as cloudinary } from 'cloudinary';
import Attachment from '../models/Attachment.js';
import { authorizeProjectResource } from '../services/projectAuthorization.js';
import asyncHandler from '../middleware/asyncHandler.js';
import { ErrorResponse } from '../middleware/errorHandler.js';

export const attachmentContent = asyncHandler(async (req, res) => {
  const attachment = await Attachment.findOne({ _id: req.params.id, isDeleted: false }).lean();
  if (!attachment) throw new ErrorResponse('Attachment not found', 404);
  await authorizeProjectResource(req, 'attachment', attachment._id, 'task.view');
  const source = cloudinary.utils.private_download_url(attachment.publicId, attachment.resourceType === 'raw' ? '' : attachment.format || '', {
    type: attachment.deliveryType || 'upload', resource_type: attachment.resourceType === 'auto' ? 'raw' : attachment.resourceType,
    expires_at: Math.floor(Date.now() / 1000) + 60, attachment: false
  });
  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), 45000);
  const close = () => abort.abort();
  res.once('close', close);
  try {
    const response = await fetch(source, { signal: abort.signal, redirect: 'error' });
    if (!response.ok || !response.body) throw new ErrorResponse('File is temporarily unavailable', 502);
    res.set('Cache-Control', 'private, no-store');
    res.set('Referrer-Policy', 'no-referrer');
    res.set('X-Content-Type-Options', 'nosniff');
    res.set('Content-Security-Policy', "default-src 'none'; sandbox");
    const safeInline = /^(image\/(jpeg|png|gif|webp)|video\/|audio\/|application\/pdf$)/.test(attachment.mimeType);
    res.type(attachment.mimeType || 'application/octet-stream');
    res.set('Content-Disposition', `${safeInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.originalName || 'attachment')}`);
    await pipeline(Readable.fromWeb(response.body), res);
  } finally { clearTimeout(timer); res.off('close', close); }
});
