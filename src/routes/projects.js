const express = require("express");
const router = express.Router();
const projectController = require("../controllers/projectController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Any logged in user can get projects (filtered based on roles inside controller)
router.get("/", authenticateToken, projectController.getProjects);
router.get("/:id", authenticateToken, projectController.getProjectById);

// Editing project details (coordinators and admins)
router.put("/:id", authenticateToken, authorizeRoles("school_coordinator", "super_admin"), projectController.updateProjectDetails);

// Admin / Event Coordinator operations (stalls and statuses)
router.post("/auto-allocate", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), projectController.autoAllocateStalls);
router.post("/:id/stall", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), projectController.assignStall);
router.put("/:id/status", authenticateToken, authorizeRoles("super_admin", "event_coordinator", "jury"), projectController.updateProjectStatus);

module.exports = router;
