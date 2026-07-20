const Student = require("../models/Student");
const Project = require("../models/Project");
const School = require("../models/School");
const Attendance = require("../models/Attendance");

exports.getAnalytics = async (req, res) => {
  try {
    const { eventId } = req.query;
    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required." });
    }

    const matchEvent = { event: eventId };

    // 1. Fetch students for the event and populate school
    const students = await Student.find(matchEvent).populate("school");

    // 2. Total registrations & category counts
    let totalRegistrations = students.length;
    let visitorsRegistered = 0;
    let presentersRegistered = 0;
    let checkedInCount = 0;

    students.forEach((s) => {
      if (s.category === "Visitor") {
        visitorsRegistered++;
      } else if (s.category === "Project Presenter") {
        presentersRegistered++;
      }
      if (s.checkedIn) {
        checkedInCount++;
      }
    });

    const pendingCount = totalRegistrations - checkedInCount;
    const attendancePercentage = totalRegistrations > 0 ? parseFloat(((checkedInCount / totalRegistrations) * 100).toFixed(2)) : 0;

    // 3. Gender ratio
    const genderMap = {};
    students.forEach((s) => {
      if (s.gender) {
        genderMap[s.gender] = (genderMap[s.gender] || 0) + 1;
      }
    });
    const genderRatio = Object.entries(genderMap).map(([name, value]) => ({ name, value }));

    // 4. Class-wise participation
    const classMap = {};
    students.forEach((s) => {
      if (s.class) {
        classMap[s.class] = (classMap[s.class] || 0) + 1;
      }
    });
    const classParticipation = Object.entries(classMap)
      .map(([name, count]) => ({ name: `Class ${name}`, count }))
      .sort((a, b) => a.name.localeCompare(b.name, undefined, { numeric: true }));

    // 5. Fetch projects for the event
    const projects = await Project.find(matchEvent);

    // 6. Projects by Domain
    const domainMap = {};
    projects.forEach((p) => {
      if (p.domain) {
        domainMap[p.domain] = (domainMap[p.domain] || 0) + 1;
      }
    });
    const projectsByDomain = Object.entries(domainMap).map(([name, value]) => ({ name, value }));

    // 7. School-wise participation
    const schoolMap = {};
    students.forEach((s) => {
      const schoolId = s.school?._id || s.school || "unknown";
      const schoolName = s.school?.name || "Unknown School";
      const schoolCode = s.school?.code || "N/A";

      if (!schoolMap[schoolId]) {
        schoolMap[schoolId] = {
          schoolId,
          schoolName,
          code: schoolCode,
          studentsCount: 0,
          attendanceCount: 0,
        };
      }
      schoolMap[schoolId].studentsCount++;
      if (s.checkedIn) {
        schoolMap[schoolId].attendanceCount++;
      }
    });
    const schoolParticipation = Object.values(schoolMap)
      .sort((a, b) => b.studentsCount - a.studentsCount)
      .map((s) => ({
        schoolId: s.schoolId,
        schoolName: s.schoolName,
        code: s.code,
        studentsCount: s.studentsCount,
        attendanceCount: s.attendanceCount,
      }));

    // 8. Projects status distribution
    const projectStatusMap = {};
    projects.forEach((p) => {
      if (p.status) {
        projectStatusMap[p.status] = (projectStatusMap[p.status] || 0) + 1;
      }
    });
    const projectStatus = Object.entries(projectStatusMap).map(([name, count]) => ({ name, count }));

    // 9. Fetch recent check-ins cleanly in memory to avoid Firestore composite index requirements
    const recentAttendances = await Attendance.find({ event: eventId });
    recentAttendances.sort((a, b) => {
      const timeA = a.entryTime ? new Date(a.entryTime).getTime() : 0;
      const timeB = b.entryTime ? new Date(b.entryTime).getTime() : 0;
      return timeB - timeA;
    });

    const recentScans = [];
    const limitedAttendances = recentAttendances.slice(0, 20);

    for (const att of limitedAttendances) {
      const student = students.find((s) => String(s._id) === String(att.student));
      if (student) {
        let projectCode = null;
        let stallNumber = null;
        if (student.category === "Project Presenter") {
          const proj = projects.find(
            (p) =>
              p.members &&
              Array.isArray(p.members) &&
              p.members.some((m) => {
                const mId = m && typeof m === "object" && m._id ? m._id : m;
                return String(mId) === String(student._id);
              })
          );
          if (proj) {
            projectCode = proj.projectId;
            stallNumber = proj.stallNumber;
          }
        }
        recentScans.push({
          name: student.name,
          school: student.school?.name || "Unknown School",
          category: student.category,
          registrationNumber: student.registrationNumber,
          projectCode,
          stallNumber,
          entryTime: att.entryTime,
          gate: att.gate || "Main Gate",
        });
      }
    }

    res.json({
      summary: {
        totalRegistrations,
        visitorsRegistered,
        presentersRegistered,
        checkedInCount,
        pendingCount,
        attendancePercentage,
      },
      genderRatio,
      classParticipation,
      projectsByDomain,
      schoolParticipation,
      projectStatus,
      recentScans,
    });
  } catch (error) {
    console.error("Dashboard Analytics Error:", error);
    res.status(500).json({ error: "Failed to generate dashboard statistics." });
  }
};
