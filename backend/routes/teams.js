import express from "express";
import {
  getTeams,
  getTeam,
  createTeam,
  updateTeam,
  addMember,
  deleteTeam,
  inviteUser,
  joinTeam,
  removeMember,
} from "../controllers/teamController.js";
import { protect, authorize } from "../middleware/authMiddleware.js";
import { teamValidation } from "../middleware/validation.js";

const router = express.Router();

// Get all teams for current user
router.get("/", protect, getTeams);

// Get single team
router.get("/:id", protect, getTeam);

// Create team (Admin/Manager only)
router.post(
  "/",
  protect,
  authorize("admin", "manager"),
  teamValidation.create,
  createTeam
);

// Update team (Admin/Manager only)
router.put("/:id", protect, authorize("admin", "manager"), updateTeam);

// Add member to team (Admin/Manager only)
router.post("/:id/members", protect, authorize("admin", "manager"), addMember);

// Delete team (Admin/Manager only)
router.delete("/:id", protect, authorize("admin", "manager"), deleteTeam);

// Legacy routes for compatibility
router.post("/:teamId/invite", protect, inviteUser);
router.post("/join/:token", protect, joinTeam);
router.delete("/:teamId/members/:userId", protect, removeMember);

export default router;
