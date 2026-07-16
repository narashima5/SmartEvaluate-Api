const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Admins, Event Coordinators, and School Coordinators can view dashboard data
router.get("/analytics", authenticateToken, authorizeRoles("super_admin", "event_coordinator", "school_coordinator"), dashboardController.getAnalytics);

module.exports = router;
