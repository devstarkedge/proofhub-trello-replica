import jwt from 'jsonwebtoken';
import config from '../config/index.js';

export const attachmentPath = id => `/api/attachments/${id}/content`;
const mediaPath = /(?:https?:\/\/[^\s"'<>]+)?(\/api\/attachments\/([a-f\d]{24})\/content)(?:\?grant=[A-Za-z\d_.%-]+)?/gi;

// Persist stable references, never expiring grants embedded by the editor.
export function stripMediaGrants(value) {
  if (typeof value === 'string') return value.replace(mediaPath, '$1');
  if (Array.isArray(value)) return value.map(stripMediaGrants);
  if (value && typeof value === 'object') for (const key of Object.keys(value)) value[key] = stripMediaGrants(value[key]);
  return value;
}

export function protectAttachmentMetadata(value) {
  if (value?.publicId && value?._id && (value.fileName || value.secureUrl)) {
    for (const key of ['url', 'secureUrl', 'thumbnailUrl', 'previewUrl']) value[key] = attachmentPath(value._id);
  }
  return value;
}

export function mediaResponse(req, res, next) {
  req.body = stripMediaGrants(req.body);
  const original = res.json.bind(res);
  res.json = body => {
    const origin = (process.env.API_PUBLIC_URL || `${req.protocol}://${req.get('host')}`).replace(/\/$/, '');
    return original(signMediaPayload(body, req.user, req.workspaceId, origin));
  };
  next();
}

export function signMediaPayload(body, user, workspaceId, origin = '') {
    const grants = new Map();
    const rewrite = value => {
      if (typeof value === 'string') return value.replace(mediaPath, (_all, path, id) => {
        if (!grants.has(id)) grants.set(id, jwt.sign({ type: 'media', attachmentId: id, id: String(user._id || user.id), workspaceId: String(workspaceId), tokenVersion: user.tokenVersion || 0 }, config.jwt.secret, { expiresIn: '15m', audience: 'attachment-content' }));
        return `${origin}${path}?grant=${grants.get(id)}`;
      });
      if (Array.isArray(value)) return value.map(rewrite);
      if (value && typeof value === 'object') {
        protectAttachmentMetadata(value);
        for (const key of Object.keys(value)) value[key] = rewrite(value[key]);
      }
      return value;
    };
    return rewrite(JSON.parse(JSON.stringify(body)));
}

// A URL grant only authenticates this one file route. protect still reloads
// the account, token version, active membership and workspace on every read.
export function authenticateMediaGrant(req, res, next) {
  if (req.headers.authorization) return next();
  try {
    const grant = jwt.verify(req.query.grant, config.jwt.secret, { audience: 'attachment-content' });
    if (grant.type !== 'media' || grant.attachmentId !== req.params.id) throw new Error('Invalid grant');
    req.headers.authorization = `Bearer ${jwt.sign({ id: grant.id, tokenVersion: grant.tokenVersion, type: 'access' }, config.jwt.secret, { expiresIn: Math.max(1, grant.exp - Math.floor(Date.now() / 1000)) })}`;
    req.headers['x-workspace-id'] = grant.workspaceId;
    next();
  } catch { res.status(401).json({ success: false, message: 'File access expired; reopen the attachment.' }); }
}
