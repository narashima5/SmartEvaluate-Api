const express = require("express");
const router = express.Router();
const dashboardController = require("../controllers/dashboardController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Admins and Event Coordinators can view dashboard data
router.get("/analytics", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), dashboardController.getAnalytics);

module.exports = router;
