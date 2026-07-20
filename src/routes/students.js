const express = require("express");
const router = express.Router();
const multer = require("multer");
const studentController = require("../controllers/studentController");
const authenticateToken = require("../middleware/authMiddleware");
const authorizeRoles = require("../middleware/rbacMiddleware");

// Setup multer memory storage for file uploads
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024 }, // Limit 5MB
});

// Any logged in user can query students (under role restrictions defined in controller)
router.get("/", authenticateToken, studentController.getStudents);

// Volunteer/Coordinator/Admin operations
router.post("/register-visitor", authenticateToken, authorizeRoles("school_coordinator", "super_admin", "event_coordinator", "volunteer"), studentController.registerVisitor);
router.post("/register-project", authenticateToken, authorizeRoles("school_coordinator", "super_admin", "event_coordinator", "volunteer"), studentController.registerProject);
router.delete("/:id", authenticateToken, authorizeRoles("school_coordinator", "super_admin"), studentController.deleteStudent);

// Bulk templates and uploads
router.get("/template", authenticateToken, authorizeRoles("school_coordinator", "super_admin"), studentController.getExcelTemplate);
router.post(
  "/bulk-upload",
  authenticateToken,
  authorizeRoles("school_coordinator", "super_admin"),
  upload.single("file"),
  studentController.bulkUpload
);

module.exports = router;
