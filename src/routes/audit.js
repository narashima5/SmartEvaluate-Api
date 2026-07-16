const express = require("express");
const router = express.Router();
const auditController = require("../controllers/auditController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Super Admin only can retrieve system audit logs
router.get("/", authenticateToken, authorizeRoles("super_admin"), auditController.getAuditLogs);

module.exports = router;
