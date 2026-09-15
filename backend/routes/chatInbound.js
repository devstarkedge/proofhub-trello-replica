import express from 'express';
import { chatInboundVerifier } from '../middleware/chatInboundVerifier.js';
import {
  handleWorkspaceCreated,
  handleWorkspaceLinked,
  handleWorkspaceUpdated,
} from '../controllers/chatInboundController.js';

const router = express.Router();

// Server-to-server, HMAC-authenticated (chatInboundVerifier) — deliberately
// NOT behind `protect`, since the caller is ChatApp itself, not a
// FlowTask user session.
router.post('/workspace-created', chatInboundVerifier, handleWorkspaceCreated);
router.post('/workspace-linked', chatInboundVerifier, handleWorkspaceLinked);
router.post('/workspace-updated', chatInboundVerifier, handleWorkspaceUpdated);

export default router;
