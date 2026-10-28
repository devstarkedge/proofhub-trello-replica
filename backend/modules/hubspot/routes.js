import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { rateLimiter } from '../../middleware/rateLimiter.js';
import { requireConfigAdmin, publicConnection, approveChange, validateConnection, saveConnection, toggleConnection } from './configService.js';
import { HubSpotConnection, HubSpotAudit } from './models.js';
import { SyncError } from './domain.js';
import { getModuleSettings, updateModuleSettings } from './workspaceModules.js';

const router = express.Router();
const wrap = fn => async (req, res) => {
  try { await fn(req, res); }
  catch (error) {
    // No raw errors reach the global handler/logger (database values can
    // contain secret ciphertext or client PII).
    const safe = error instanceof SyncError;
    res.status(safe ? error.status || 400 : 503).json({ success: false, code: safe ? error.code : 'CONFIG_UNAVAILABLE', message: safe ? error.message : 'Workspace configuration is temporarily unavailable.' });
  }
};
router.use(protect);
router.use(async (req, res, next) => {
  try { await requireConfigAdmin(req.workspaceId, req.user.id || req.user._id); next(); }
  catch (error) { res.status(error.status || 503).json({ success: false, message: error instanceof SyncError ? error.message : 'Configuration authorization is unavailable.' }); }
});
const sensitiveLimit = rateLimiter({ windowMs: 15 * 60_000, maxRequests: 5, keyFn: req => req.user.id || req.user._id, message: 'Too many verification attempts. Try again later.' });
const writeLimit = rateLimiter({ windowMs: 60_000, maxRequests: 12, keyFn: req => req.user.id || req.user._id });
const inputFor = req => ({ ...req.body, workspaceId: req.workspaceId, userId: req.user.id || req.user._id, sessionToken: req.headers.authorization });
const strictBody = keys => (req, res, next) => {
  if (!req.body || Array.isArray(req.body) || Object.keys(req.body).some(key => !keys.includes(key))) return res.status(400).json({ success: false, message: 'Invalid configuration fields.' });
  next();
};
router.get('/', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: {
    hubspot: publicConnection(await HubSpotConnection.findOne({ workspaceId: req.workspaceId }).lean()),
    modules: await getModuleSettings(req.workspaceId),
  } });
}));
router.post('/hubspot/reauth', sensitiveLimit, strictBody(['password', 'action', 'version']), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await approveChange(inputFor(req)) });
}));
router.post('/hubspot/validate', writeLimit, strictBody(['serviceKey', 'version', 'contactOwnerId']), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await validateConnection(inputFor(req)) });
}));
router.put('/hubspot', writeLimit, strictBody(['serviceKey', 'name', 'contactOwnerId', 'reconnect', 'version', 'approval']), wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await saveConnection(inputFor(req)) });
}));
router.patch('/hubspot/enabled', writeLimit, strictBody(['enabled', 'confirmed', 'version', 'approval']), wrap(async (req, res) => {
  res.json({ success: true, data: await toggleConnection(inputFor(req)) });
}));
router.get('/hubspot/audit', wrap(async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  res.json({ success: true, data: await HubSpotAudit.find({ workspaceId: req.workspaceId }).sort({ _id: -1 }).limit(50).lean() });
}));
router.patch('/modules', writeLimit, strictBody(['leave', 'attendance', 'sales', 'finance']), wrap(async (req, res) => {
  res.json({ success: true, data: await updateModuleSettings(req.workspaceId, req.user.id || req.user._id, req.body) });
}));
export default router;
