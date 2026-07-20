const express = require("express");
const router = express.Router();
const evaluationController = require("../controllers/evaluationController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Domains master data
router.get("/domains", evaluationController.getDomains);
router.post("/domains", authenticateToken, authorizeRoles("jury", "super_admin", "event_coordinator"), evaluationController.createDomain);

// Evaluation Criteria master data
router.get("/criteria", authenticateToken, evaluationController.getCriteria);
router.post("/criteria", authenticateToken, authorizeRoles("jury", "super_admin", "event_coordinator"), evaluationController.createCriteria);
router.delete("/criteria/:id", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), evaluationController.deleteCriteria);

// Jury operations
router.post("/", authenticateToken, authorizeRoles("jury", "super_admin"), evaluationController.submitEvaluation);
router.get("/me", authenticateToken, authorizeRoles("jury"), evaluationController.getJuryEvaluations);

// Admin / Event Coordinator operations
router.get("/leaderboard", authenticateToken, evaluationController.getLeaderboard);
router.get("/project/:projectId", authenticateToken, authorizeRoles("super_admin", "event_coordinator"), evaluationController.getProjectEvaluations);
router.post("/:id/unlock", authenticateToken, authorizeRoles("super_admin"), evaluationController.unlockEvaluation);

module.exports = router;
