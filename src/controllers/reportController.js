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
      "Emergency Contact": s.emergencyContact,
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

    const checkins = await Attendance.find({ event: eventId })
      .populate({
        path: "student",
        populate: { path: "school" },
      })
      .populate("scannedBy", "username");

    // Sort in-memory to prevent Firestore index requirements
    checkins.sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : 0;
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : 0;
      return timeA - timeB; // Ascending
    });

    const reportData = checkins.map((c) => ({
      "Reg Number": c.student ? c.student.registrationNumber : "N/A",
      Name: c.student ? c.student.name : "N/A",
      Category: c.student ? c.student.category : "N/A",
      School: (c.student && c.student.school) ? c.student.school.name : "N/A",
      Class: c.student ? c.student.class : "N/A",
      Section: c.student ? c.student.section : "N/A",
      "Entry Time": c.entryTime ? (c.entryTime instanceof Date ? c.entryTime.toISOString() : new Date(c.entryTime).toISOString()) : "",
      Gate: c.gate,
      "Scanned By": c.scannedBy ? c.scannedBy.username : "N/A",
    }));

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
          "School Code": school.code,
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
    const projects = await Project.find({ event: eventId }).populate("members");
    const filteredProjects = projects.filter(p => p.status === "Evaluated" || p.status === "Winner");
    
    // Sort in-memory to prevent Firestore index requirements
    filteredProjects.sort((a, b) => {
      const scoreDiff = (b.score || 0) - (a.score || 0);
      if (scoreDiff !== 0) return scoreDiff;
      return (a.projectId || "").localeCompare(b.projectId || "");
    });

    const reportData = filteredProjects.map((p, idx) => ({
      Rank: idx + 1,
      "Project ID": p.projectId,
      Title: p.title,
      Domain: p.domain,
      "Team Name": p.teamName,
      Members: p.members ? p.members.map((m) => m.name).join(", ") : "",
      "Guide Teacher": p.guideTeacher,
      "Stall Number": p.stallNumber || "Not Assigned",
      "Average Score": p.score || 0,
      Status: p.status,
    }));

    sendSheetResponse(res, reportData, "Winners_Report", format);
  } catch (error) {
    console.error("Winner Report Error:", error);
    res.status(500).json({ error: "Failed to generate winners report." });
  }
};
