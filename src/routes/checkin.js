const express = require("express");
const router = express.Router();
const checkinController = require("../controllers/checkinController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Coordinator/Admin/Volunteer signs ticket tokens
router.get("/sign/:studentId", authenticateToken, authorizeRoles("school_coordinator", "super_admin", "volunteer"), checkinController.getSignedTicketToken);

// Volunteer/Admin processes scans
router.post("/verify", authenticateToken, authorizeRoles("volunteer", "super_admin"), checkinController.verifyAndCheckin);

module.exports = router;
