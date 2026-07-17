const jwt = require("jsonwebtoken");
const Student = require("../models/Student");
const Project = require("../models/Project");
const Attendance = require("../models/Attendance");
const AuditLog = require("../models/AuditLog");

const QR_SECRET = process.env.QR_SIGNING_SECRET || "qr-secure-expo-signing-key-2026";

const logAudit = async (actorId, username, action, details, req) => {
  try {
    const ipAddress = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
    await AuditLog.create({
      actor: actorId,
      actorUsername: username,
      action,
      details,
      ipAddress,
    });
  } catch (error) {
    console.error("Audit Logging Error:", error);
  }
};

// GET /api/checkin/sign/:studentId
// Returns the signed token to render inside the QR code for a student
exports.getSignedTicketToken = async (req, res) => {
  try {
    const { studentId } = req.params;
    const student = await Student.findById(studentId).populate("event");

    if (!student) {
      return res.status(404).json({ error: "Student not found" });
    }

    // Role check: coordinator must own the school of the student
    if (req.user.role === "school_coordinator" && req.user.school.toString() !== student.school.toString()) {
      return res.status(403).json({ error: "Unauthorized access to student ticket." });
    }

    // Sign payload
    const token = jwt.sign(
      {
        studentId: student._id,
        regNum: student.registrationNumber,
        eventId: student.event._id,
        eventDate: student.event.date,
      },
      QR_SECRET
      // No expiry or set it to event date + 1 day
    );

    // Update ticketGenerated status
    student.ticketGenerated = true;
    await student.save();

    res.json({ token });
  } catch (error) {
    console.error("Sign Ticket Error:", error);
    res.status(500).json({ error: "Failed to sign ticket QR token." });
  }
};

// POST /api/checkin/verify
// Called by volunteer when scanning QR code
exports.verifyAndCheckin = async (req, res) => {
  try {
    const { qrToken, gate } = req.body;

    if (!qrToken) {
      return res.status(400).json({ error: "QR token is required." });
    }

    // 1. Verify token signature
    let decoded;
    try {
      decoded = jwt.verify(qrToken, QR_SECRET);
    } catch (err) {
      return res.status(400).json({ status: "invalid", message: "Invalid QR Code. Cryptographic signature verification failed." });
    }

    const { studentId, regNum, eventId } = decoded;

    // 2. Fetch student and verify existence
    const student = await Student.findById(studentId).populate("school").populate("event");
    if (!student) {
      return res.status(404).json({ status: "invalid", message: "Student registration record not found in system." });
    }

    // Check if event is active
    if (student.event.status !== "active") {
      return res.status(400).json({
        status: "invalid",
        message: `This registration is for event '${student.event.title}' which is currently not active.`,
      });
    }

    // 3. Check for duplicates (already checked in)
    const existingCheckin = await Attendance.findOne({ student: studentId, event: eventId });
    if (existingCheckin) {
      return res.status(400).json({
        status: "duplicate",
        message: "Already Checked In",
        student: {
          name: student.name,
          school: student.school.name,
          category: student.category,
        },
        entryTime: existingCheckin.entryTime,
      });
    }

    // 4. Create check-in record
    const checkin = await Attendance.create({
      student: studentId,
      event: eventId,
      scannedBy: req.user._id,
      gate: gate || "Main Gate",
    });

    // Update student checkedIn status
    student.checkedIn = true;
    await student.save();

    // If presenter, find project and mark as Checked In (if not already)
    let projectCode = null;
    let stallNumber = null;
    if (student.category === "Project Presenter") {
      const project = await Project.findOne({ members: studentId });
      if (project) {
        projectCode = project.projectId;
        stallNumber = project.stallNumber;
        if (project.status === "Registered") {
          project.status = "Checked In";
          await project.save();
        }
      }
    }

    // Emit WebSockets real-time event via app socket server instance if attached
    const io = req.app.get("socketio");
    if (io) {
      // Fetch latest stats and emit
      const totalCheckedIn = await Student.countDocuments({ event: eventId, checkedIn: true });
      const totalVisitors = await Student.countDocuments({ event: eventId, category: "Visitor", checkedIn: true });
      const totalPresenters = await Student.countDocuments({ event: eventId, category: "Project Presenter", checkedIn: true });
      
      io.emit("attendance_update", {
        student: {
          id: student._id,
          name: student.name,
          school: student.school.name,
          category: student.category,
          registrationNumber: student.registrationNumber,
          projectCode,
          stallNumber,
          entryTime: checkin.entryTime,
          gate: checkin.gate || "Main Gate",
        },
        stats: {
          totalCheckedIn,
          totalVisitors,
          totalPresenters,
        },
      });
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "STUDENT_CHECKIN",
      { studentId: student._id, registrationNumber: student.registrationNumber, gate: gate || "Main Gate" },
      req
    );

    res.json({
      status: "success",
      message: "Check-in successful",
      student: {
        name: student.name,
        school: student.school.name,
        category: student.category,
        registrationNumber: student.registrationNumber,
        projectCode,
        stallNumber,
        entryTime: checkin.entryTime,
      },
    });
  } catch (error) {
    console.error("Check-in Error:", error);
    res.status(500).json({ error: "Check-in operation failed." });
  }
};
