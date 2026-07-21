const Student = require("../models/Student");
const Project = require("../models/Project");
const School = require("../models/School");
const Attendance = require("../models/Attendance");
const Evaluation = require("../models/Evaluation");
const xlsx = require("xlsx");

// Helper to write Excel/CSV response
const sendSheetResponse = (res, data, sheetName, format) => {
  if (format === "json") {
    return res.json(data);
  }

  const wb = xlsx.utils.book_new();
  const ws = xlsx.utils.json_to_sheet(data);
  xlsx.utils.book_append_sheet(wb, ws, sheetName);

  if (format === "csv") {
    const csvContent = xlsx.utils.sheet_to_csv(ws);
    res.setHeader("Content-Disposition", `attachment; filename="${sheetName}.csv"`);
    res.setHeader("Content-Type", "text/csv");
    return res.send(csvContent);
  }

  // Default Excel
  const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Disposition", `attachment; filename="${sheetName}.xlsx"`);
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.send(buf);
};

// GET /api/reports/registrations
exports.getRegistrationReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    const students = await Student.find({ event: eventId }).populate("school");
    
    // Sort in-memory to prevent Firestore index requirements
    students.sort((a, b) => (a.registrationNumber || "").localeCompare(b.registrationNumber || ""));

    const reportData = students.map((s) => ({
      "Reg Number": s.registrationNumber,
      Name: s.name,
      Category: s.category,
      Gender: s.gender,
      DOB: s.dob ? (s.dob instanceof Date ? s.dob.toISOString().split("T")[0] : new Date(s.dob).toISOString().split("T")[0]) : "",
      Class: s.class,
      Section: s.section,
      School: s.school ? s.school.name : "N/A",
      District: s.school ? s.school.district : "N/A",
      State: s.school ? s.school.state : "N/A",
      "Teacher Name": s.teacherName,
      "Student Phone": s.phone || s.emergencyContact || "N/A",
      "Checked In": s.checkedIn ? "Yes" : "No",
    }));

    sendSheetResponse(res, reportData, "Registrations_Report", format);
  } catch (error) {
    console.error("Registration Report Error:", error);
    res.status(500).json({ error: "Failed to generate registrations report." });
  }
};

// GET /api/reports/attendance
exports.getAttendanceReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    const mongoose = require("../config/db");
    const User = require("../models/User");
    const eventIdStr = String(eventId);
    const isHexEvent = /^[0-9a-fA-F]{24}$/.test(eventIdStr);

    let checkinQuery = isHexEvent
      ? { $or: [{ event: eventIdStr }, { event: new mongoose.Types.ObjectId(eventIdStr) }] }
      : { event: eventIdStr };

    const checkins = await Attendance.find(checkinQuery).lean();
    const checkedInStudents = await Student.find({ event: eventId, checkedIn: true }).populate("school").lean();

    const studentMap = new Map();
    for (const s of checkedInStudents) {
      studentMap.set(s._id.toString(), s);
      if (s.registrationNumber) {
        studentMap.set(s.registrationNumber, s);
      }
    }

    const reportDataMap = new Map();

    for (const c of checkins) {
      let studentDoc = null;
      if (c.student) {
        const sId = c.student._id ? c.student._id.toString() : c.student.toString();
        studentDoc = studentMap.get(sId);
        if (!studentDoc && /^[0-9a-fA-F]{24}$/.test(sId)) {
          studentDoc = await Student.findById(sId).populate("school").lean();
        }
      }

      let scannedUser = null;
      if (c.scannedBy) {
        const uId = c.scannedBy._id ? c.scannedBy._id.toString() : c.scannedBy.toString();
        if (/^[0-9a-fA-F]{24}$/.test(uId)) {
          scannedUser = await User.findById(uId, "username").lean();
        }
      }

      const sKey = studentDoc ? studentDoc._id.toString() : (c.student ? c.student.toString() : c._id.toString());

      reportDataMap.set(sKey, {
        "Reg Number": studentDoc ? studentDoc.registrationNumber : "N/A",
        "Student Name": studentDoc ? studentDoc.name : "N/A",
        "Student Type": studentDoc ? studentDoc.category : "N/A",
        School: studentDoc && studentDoc.school ? (typeof studentDoc.school === "object" ? studentDoc.school.name : "N/A") : "N/A",
        Class: studentDoc ? studentDoc.class : "N/A",
        Section: studentDoc ? studentDoc.section : "N/A",
        "Check-In Date": c.entryTime ? new Date(c.entryTime).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"),
        "Check-In Time": c.entryTime ? new Date(c.entryTime).toLocaleTimeString("en-IN") : new Date().toLocaleTimeString("en-IN"),
        Gate: c.gate || "Main Gate",
        "Scanned By": scannedUser ? scannedUser.username : (c.scannedBy?.username || "Volunteer Desk"),
        _time: c.entryTime ? new Date(c.entryTime).getTime() : 0,
      });
    }

    // Include checked-in students who don't have explicit Attendance log entry
    for (const s of checkedInStudents) {
      const sKey = s._id.toString();
      if (!reportDataMap.has(sKey)) {
        reportDataMap.set(sKey, {
          "Reg Number": s.registrationNumber,
          "Student Name": s.name,
          "Student Type": s.category,
          School: s.school ? (typeof s.school === "object" ? s.school.name : "N/A") : "N/A",
          Class: s.class,
          Section: s.section,
          "Check-In Date": s.updatedAt ? new Date(s.updatedAt).toLocaleDateString("en-IN") : new Date().toLocaleDateString("en-IN"),
          "Check-In Time": s.updatedAt ? new Date(s.updatedAt).toLocaleTimeString("en-IN") : new Date().toLocaleTimeString("en-IN"),
          Gate: "Main Gate",
          "Scanned By": "Desk Registration",
          _time: s.updatedAt ? new Date(s.updatedAt).getTime() : 0,
        });
      }
    }

    const reportData = Array.from(reportDataMap.values());
    reportData.sort((a, b) => a._time - b._time);

    // Clean internal sorting key
    reportData.forEach((r) => delete r._time);

    sendSheetResponse(res, reportData, "Attendance_Report", format);
  } catch (error) {
    console.error("Attendance Report Error:", error);
    res.status(500).json({ error: "Failed to generate attendance report." });
  }
};

// GET /api/reports/schools
exports.getSchoolReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    const Student = require("../models/Student");
    const schoolsList = await School.find();
    
    // Sort in-memory to prevent Firestore index requirements
    schoolsList.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    
    const reportData = [];

    for (const school of schoolsList) {
      const studentCount = await Student.countDocuments({ event: eventId, school: school._id });
      const checkedInCount = await Student.countDocuments({ event: eventId, school: school._id, checkedIn: true });

      if (studentCount > 0) {
        reportData.push({
          "School Name": school.name,
          District: school.district,
          State: school.state,
          Principal: school.principalName,
          "In Charge": school.inChargeName,
          "Coordinator Email": school.coordinatorEmail,
          "Coordinator Mobile": school.coordinatorMobile,
          "Attending Teachers": school.teachersCount,
          "Registered Students": studentCount,
          "Attended Students": checkedInCount,
        });
      }
    }

    sendSheetResponse(res, reportData, "School_wise_Report", format);
  } catch (error) {
    console.error("School Report Error:", error);
    res.status(500).json({ error: "Failed to generate school report." });
  }
};

// GET /api/reports/projects
exports.getProjectReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    const projects = await Project.find({ event: eventId }).populate("members");
    
    // Sort in-memory to prevent Firestore index requirements
    projects.sort((a, b) => (a.projectId || "").localeCompare(b.projectId || ""));

    const reportData = projects.map((p) => ({
      "Project ID": p.projectId,
      Title: p.title,
      Domain: p.domain,
      "Team Name": p.teamName,
      Members: p.members ? p.members.map((m) => m.name).join(", ") : "",
      "Guide Teacher": p.guideTeacher,
      "Stall Number": p.stallNumber || "Not Assigned",
      Status: p.status,
      "Average Score": p.score || 0,
    }));

    sendSheetResponse(res, reportData, "Projects_Report", format);
  } catch (error) {
    console.error("Project Report Error:", error);
    res.status(500).json({ error: "Failed to generate projects report." });
  }
};

// GET /api/reports/evaluations
exports.getEvaluationReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    const evals = await Evaluation.find()
      .populate({
        path: "project",
        match: { event: eventId },
      })
      .populate("jury", "username target_domain");

    // Filter evaluations where project event matches eventId
    const filteredEvals = evals.filter((e) => e.project !== null);

    // Sort in-memory to prevent Firestore index requirements
    filteredEvals.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA; // Descending
    });

    const reportData = filteredEvals.map((e) => ({
      "Project ID": e.project.projectId,
      "Project Title": e.project.title,
      Domain: e.project.domain,
      Jury: e.jury ? e.jury.username : "N/A",
      Innovation: e.innovation,
      "Technical Knowledge": e.technicalKnowledge,
      Presentation: e.presentation,
      "Practical Implementation": e.practicalImplementation,
      "Social Impact": e.socialImpact,
      Total: e.totalMarks,
      Remarks: e.remarks || "",
    }));

    sendSheetResponse(res, reportData, "Jury_Evaluation_Report", format);
  } catch (error) {
    console.error("Evaluation Report Error:", error);
    res.status(500).json({ error: "Failed to generate evaluation report." });
  }
};

// GET /api/reports/winners
exports.getWinnerReport = async (req, res) => {
  try {
    const { eventId, format } = req.query;
    if (!eventId) return res.status(400).json({ error: "Event ID is required." });

    // Find evaluated projects
    const projects = await Project.find({ event: eventId }).populate({
      path: "members",
      populate: { path: "school" },
    });
    const filteredProjects = projects.filter(p => p.status === "Evaluated" || p.status === "Winner");
    
    // Sort in-memory to prevent Firestore index requirements
    filteredProjects.sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.projectId || "").localeCompare(b.projectId || "");
    });

    const reportData = filteredProjects.map((p, idx) => {
      const schoolName = (p.members && p.members.length > 0 && p.members[0].school)
        ? (typeof p.members[0].school === "object" ? p.members[0].school.name : "N/A")
        : "N/A";

      return {
        Rank: idx + 1,
        "Project ID": p.projectId,
        Title: p.title,
        School: schoolName,
        "Team Name": p.teamName,
        Members: p.members ? p.members.map((m) => m.name).join(", ") : "",
        "Guide Teacher": p.guideTeacher,
        "Stall Number": p.stallNumber || "Not Assigned",
        "Average Score": p.score || 0,
        Status: p.status,
      };
    });

    sendSheetResponse(res, reportData, "Winners_Report", format);
  } catch (error) {
    console.error("Winner Report Error:", error);
    res.status(500).json({ error: "Failed to generate winners report." });
  }
};
