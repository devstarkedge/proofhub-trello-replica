import express from 'express';
import { protect } from '../../middleware/authMiddleware.js';
import { getModuleSettings } from './workspaceModules.js';
const router = express.Router();
router.get('/', protect, async (req, res) => {
  try { res.setHeader('Cache-Control', 'no-store'); res.json({ success: true, data: await getModuleSettings(req.workspaceId) }); }
  catch { res.status(503).json({ success: false, message: 'Module availability is temporarily unavailable.' }); }
});
export default router;
