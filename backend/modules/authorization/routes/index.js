import express from 'express';
import { getMyCapabilities } from '../controllers/capabilityController.js';
import { simulateAccess } from '../controllers/simulationController.js';
import { protect } from '../../../middleware/authMiddleware.js';

const router = express.Router();

// Apply global authentication to these routes
router.use(protect);

// User discovering their own capabilities for the UI
router.get('/my-capabilities', getMyCapabilities);

// Admin simulating permissions mapping
router.post('/simulate', simulateAccess);

export default router;
