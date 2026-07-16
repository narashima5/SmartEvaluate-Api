const express = require("express");
const router = express.Router();
const authController = require("../controllers/authController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");
const { authLimiter } = require("../middleware/rateLimiter");

// Public endpoints
router.post("/login", authLimiter, authController.login);
router.post("/signup", authLimiter, authController.signup);
router.post("/verify-otp", authLimiter, authController.verifyOtp);
router.post("/register-coordinator", authLimiter, authController.registerCoordinator);

// Protected endpoints
router.get("/me", authenticateToken, authController.getMe);

// Admin / Coordinator approval endpoints
router.get("/pending-approvals", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), authController.getPendingApprovals);
router.post("/approve-user/:id", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), authController.approveUser);
router.post("/reject-user/:id", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), authController.rejectUser);

// Admin-only endpoints
router.get("/users", authenticateToken, authorizeRoles("super_admin"), authController.getUsers);
router.post("/create-user", authenticateToken, authorizeRoles("super_admin"), authController.createUser);
router.post("/reset-password", authenticateToken, authorizeRoles("super_admin"), authController.resetPassword);
router.delete("/users/:id", authenticateToken, authorizeRoles("super_admin"), authController.deleteUser);

module.exports = router;
