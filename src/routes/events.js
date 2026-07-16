const express = require("express");
const router = express.Router();
const eventController = require("../controllers/eventController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Any logged in user can fetch events
router.get("/", authenticateToken, eventController.getEvents);
router.get("/active", eventController.getActiveEvent);

// Admin-only operations
router.post("/", authenticateToken, authorizeRoles("super_admin"), eventController.createEvent);
router.put("/:id", authenticateToken, authorizeRoles("super_admin"), eventController.updateEvent);
router.post("/:id/activate", authenticateToken, authorizeRoles("super_admin"), eventController.activateEvent);
router.post("/:id/active", authenticateToken, authorizeRoles("super_admin"), eventController.activateEvent);
router.delete("/:id", authenticateToken, authorizeRoles("super_admin"), eventController.deleteEvent);

module.exports = router;
