const express = require("express");
const router = express.Router();
const reportController = require("../controllers/reportController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Admins and Event Coordinators can export reports
router.get("/registrations", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getRegistrationReport);
router.get("/attendance", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getAttendanceReport);
router.get("/schools", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getSchoolReport);
router.get("/projects", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getProjectReport);
router.get("/evaluations", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getEvaluationReport);
router.get("/winners", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), reportController.getWinnerReport);

module.exports = router;
