import express from 'express';
import { chatInboundVerifier } from '../middleware/chatInboundVerifier.js';
import { handleWorkspaceCreated } from '../controllers/chatInboundController.js';

const router = express.Router();

// Server-to-server, HMAC-authenticated (chatInboundVerifier) — deliberately
// NOT behind `protect`, since the caller is ChatApp itself, not a
// FlowTask user session.
router.post('/workspace-created', chatInboundVerifier, handleWorkspaceCreated);

export default router;
