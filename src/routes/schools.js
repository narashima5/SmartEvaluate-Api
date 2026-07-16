const express = require("express");
const router = express.Router();
const schoolController = require("../controllers/schoolController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Coordinator registering profile or fetching details
router.post("/", authenticateToken, authorizeRoles("school_coordinator", "super_admin"), schoolController.registerSchool);
router.get("/me", authenticateToken, authorizeRoles("school_coordinator"), schoolController.getCoordinatorSchool);

// Admin / Coordinator updating profile
router.put("/:id", authenticateToken, authorizeRoles("school_coordinator", "super_admin"), schoolController.updateSchool);

// Listings (Admins/Event Coordinators/Jury can list schools)
router.get("/", authenticateToken, authorizeRoles("super_admin", "event_coordinator", "jury"), schoolController.getSchools);
router.get("/:id", authenticateToken, authorizeRoles("super_admin", "event_coordinator", "jury", "school_coordinator"), schoolController.getSchoolById);
router.delete("/:id", authenticateToken, authorizeRoles("super_admin"), schoolController.deleteSchool);

module.exports = router;
