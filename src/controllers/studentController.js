const Student = require("../models/Student");
const School = require("../models/School");
const Event = require("../models/Event");
const Project = require("../models/Project");
const AuditLog = require("../models/AuditLog");
const xlsx = require("xlsx");

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

// Check if registration is locked / date rules apply
const checkRegistrationLock = async (eventId, category = "Visitor") => {
  if (category === "Visitor") {
    return { locked: false };
  }
  const event = await Event.findById(eventId);
  if (!event) return { locked: true, reason: "Event not found." };
  if (event.status === "locked" || event.status === "archived") {
    return { locked: true, reason: "Event registration is locked or archived." };
  }

  const now = new Date();
  const eventDate = new Date(event.date);

  // Compare year, month, date of event date with today
  const isSameDay =
    now.getFullYear() === eventDate.getFullYear() &&
    now.getMonth() === eventDate.getMonth() &&
    now.getDate() === eventDate.getDate();

  // Check if now is past the event day
  const isPastEventDay =
    now.getFullYear() > eventDate.getFullYear() ||
    (now.getFullYear() === eventDate.getFullYear() &&
      (now.getMonth() > eventDate.getMonth() ||
        (now.getMonth() === eventDate.getMonth() && now.getDate() > eventDate.getDate())));

  if (isPastEventDay) {
    return { locked: true, reason: "The event date has passed. Registration is closed." };
  }

  if (isSameDay) {
    // If it's the event day, only Visitors can register on-spot
    if (category !== "Visitor") {
      return {
        locked: true,
        reason: "Project presenter registrations are not allowed on the day of the event. Only visitor spot registrations are permitted.",
      };
    }
  }

  return { locked: false };
};

// POST /api/students/register-visitor
exports.registerVisitor = async (req, res) => {
  try {
    const { name, gender, dob, class: studentClass, section, emergencyContact, teacherName, eventId, phone } = req.body;

    if (!name || !gender || !dob || !studentClass || !section || !emergencyContact || !teacherName || !eventId || !phone) {
      return res.status(400).json({ error: "All student details, teacher name, event ID, and phone number are required." });
    }

    const lockCheck = await checkRegistrationLock(eventId, "Visitor");
    if (lockCheck.locked) {
      return res.status(400).json({ error: lockCheck.reason });
    }

    // Determine school from coordinator user context
    const schoolId = req.user.role === "school_coordinator" ? req.user.school : req.body.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School profile registration is required first." });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School profile not found." });
    }

    // Duplicate detection (same name, class, section, school and event)
    const duplicate = await Student.findOne({
      name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
      class: studentClass.trim(),
      section: section.trim(),
      school: schoolId,
      event: eventId,
    });

    if (duplicate) {
      return res.status(400).json({ error: "Student with this name, class, and section is already registered." });
    }

    const student = await Student.create({
      name,
      gender,
      dob,
      class: studentClass,
      section,
      school: schoolId,
      event: eventId,
      principalName: school.principalName,
      inChargeName: school.inChargeName,
      teacherName,
      emergencyContact,
      phone,
      category: "Visitor",
      checkedIn: true,
    });

    await logAudit(
      req.user._id,
      req.user.username,
      "STUDENT_REGISTER_VISITOR",
      { studentId: student._id, registrationNumber: student.registrationNumber },
      req
    );

    res.status(201).json({ message: "Visitor registered successfully.", student });
  } catch (error) {
    console.error("Register Visitor Error:", error);
    res.status(500).json({ error: "Failed to register visitor." });
  }
};

// POST /api/students/register-project
exports.registerProject = async (req, res) => {
  try {
    const {
      projectTitle,
      projectAbstract,
      projectDomain,
      teamName,
      guideTeacher,
      requiredEquipment,
      projectDescription,
      eventId,
      members, // Array of student objects
    } = req.body;

    if (
      !projectTitle ||
      !projectAbstract ||
      !projectDomain ||
      !teamName ||
      !guideTeacher ||
      !eventId ||
      !members ||
      !Array.isArray(members) ||
      members.length === 0
    ) {
      return res.status(400).json({ error: "Project details and team members details are required." });
    }

    const lockCheck = await checkRegistrationLock(eventId, "Project Presenter");
    if (lockCheck.locked) {
      return res.status(400).json({ error: lockCheck.reason });
    }

    const schoolId = req.user.role === "school_coordinator" ? req.user.school : req.body.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School profile registration is required first." });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School profile not found." });
    }

    // Step 1: Create Students (Presenter category)
    const studentIds = [];
    const createdStudents = [];

    for (const m of members) {
      // Validate member fields
      if (!m.name || !m.gender || !m.dob || !m.class || !m.section || !m.emergencyContact || !m.phone) {
        return res.status(400).json({ error: "All team members must have complete details including phone number." });
      }

      // Check duplicate student
      const duplicate = await Student.findOne({
        name: { $regex: new RegExp(`^${m.name.trim()}$`, "i") },
        class: m.class.trim(),
        section: m.section.trim(),
        school: schoolId,
        event: eventId,
      });

      if (duplicate) {
        // Rollback already created students in this transaction
        for (const s of createdStudents) {
          await Student.findByIdAndDelete(s._id);
        }
        return res.status(400).json({
          error: `Student ${m.name} in class ${m.class}-${m.section} is already registered.`,
        });
      }

      const student = await Student.create({
        name: m.name,
        gender: m.gender,
        dob: m.dob,
        class: m.class,
        section: m.section,
        school: schoolId,
        event: eventId,
        principalName: school.principalName,
        inChargeName: school.inChargeName,
        teacherName: guideTeacher, // Guide teacher is the accompanying teacher for presenters
        emergencyContact: m.emergencyContact,
        phone: m.phone,
        category: "Project Presenter",
      });

      studentIds.push(student._id);
      createdStudents.push(student);
    }

    // Step 2: Create Project
    const project = await Project.create({
      title: projectTitle,
      abstract: projectAbstract,
      domain: projectDomain,
      teamName,
      members: studentIds,
      guideTeacher,
      requiredEquipment,
      description: projectDescription,
      event: eventId,
      status: "Registered",
    });

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_REGISTER",
      { projectId: project._id, projectCode: project.projectId, membersCount: studentIds.length },
      req
    );

    res.status(201).json({
      message: "Project and team registered successfully.",
      project,
      students: createdStudents,
    });
  } catch (error) {
    console.error("Register Project Error:", error);
    res.status(500).json({ error: "Failed to register project." });
  }
};

// GET /api/students
exports.getStudents = async (req, res) => {
  try {
    let query = {};

    // Coordinators can only see their own school's students
    if (req.user.role === "school_coordinator") {
      if (!req.user.school) {
        return res.json([]);
      }
      query.school = req.user.school;
    }

    // Filters for admin/event_coordinator
    if (req.query.schoolId) query.school = req.query.schoolId;
    if (req.query.eventId) query.event = req.query.eventId;
    if (req.query.category) query.category = req.query.category;
    if (req.query.checkedIn !== undefined) query.checkedIn = req.query.checkedIn === "true";

    // Search filter
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { name: searchRegex },
        { registrationNumber: searchRegex },
        { class: searchRegex },
        { teacherName: searchRegex },
      ];
    }

    const students = await Student.find(query).populate("school");

    // Sort in memory to avoid Firestore composite index requirements
    students.sort((a, b) => {
      const dateA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const dateB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return dateB - dateA; // Descending
    });

    res.json(students);
  } catch (error) {
    console.error("Get Students Error:", error);
    res.status(500).json({ error: "Failed to fetch registrations." });
  }
};

// DELETE /api/students/:id
exports.deleteStudent = async (req, res) => {
  try {
    const student = await Student.findById(req.params.id);
    if (!student) {
      return res.status(404).json({ error: "Student registration not found." });
    }

    // Role verification
    if (req.user.role === "school_coordinator" && req.user.school.toString() !== student.school.toString()) {
      return res.status(403).json({ error: "Unauthorized operation." });
    }

    // Check lock
    const lockCheck = await checkRegistrationLock(student.event, student.category);
    if (lockCheck.locked && req.user.role !== "super_admin") {
      return res.status(400).json({ error: `Registrations are locked: ${lockCheck.reason}` });
    }

    // If student is part of a project, handle project cleanup
    if (student.category === "Project Presenter") {
      // Find the project they belong to
      const project = await Project.findOne({ members: student._id });
      if (project) {
        // Remove student from project members list
        project.members = project.members.filter((mId) => mId.toString() !== student._id.toString());
        if (project.members.length === 0) {
          // If no members left, delete the project entirely
          await Project.findByIdAndDelete(project._id);
        } else {
          await project.save();
        }
      }
    }

    await Student.findByIdAndDelete(student._id);

    await logAudit(
      req.user._id,
      req.user.username,
      "STUDENT_DELETE",
      { name: student.name, registrationNumber: student.registrationNumber },
      req
    );

    res.json({ message: "Student registration removed successfully." });
  } catch (error) {
    console.error("Delete Student Error:", error);
    res.status(500).json({ error: "Failed to delete student registration." });
  }
};

// GET /api/students/template
exports.getExcelTemplate = async (req, res) => {
  try {
    const wb = xlsx.utils.book_new();

    // Template columns
    const visitorData = [
      ["Student Name", "Gender", "Date of Birth (YYYY-MM-DD)", "Class", "Section", "Accompanying Teacher Name", "Emergency Contact", "Student Phone"],
      ["John Doe", "Male", "2012-05-15", "8", "A", "Sarah Smith", "9876543210", "9876543210"],
      ["Jane Doe", "Female", "2013-08-20", "7", "B", "Sarah Smith", "9876543210", "9876543210"],
    ];

    const presenterData = [
      ["Student Name", "Gender", "Date of Birth (YYYY-MM-DD)", "Class", "Section", "Emergency Contact", "Student Phone", "Project Title", "Project Domain", "Project Abstract", "Team Name", "Guide Teacher", "Required Equipment", "Project Description"],
      ["Alice Smith", "Female", "2010-02-10", "10", "A", "9998887776", "9998887776", "Smart Irrigation System", "IoT & Smart Cities", "Abstract text here...", "Team Aqua", "Robert Jones", "Water Pump, Arduino", "Description here..."],
      ["Bob Smith", "Male", "2010-04-12", "10", "A", "9998887775", "9998887775", "Smart Irrigation System", "IoT & Smart Cities", "Abstract text here...", "Team Aqua", "Robert Jones", "Water Pump, Arduino", "Description here..."],
    ];

    const wsVisitors = xlsx.utils.aoa_to_sheet(visitorData);
    const wsPresenters = xlsx.utils.aoa_to_sheet(presenterData);

    xlsx.utils.book_append_sheet(wb, wsVisitors, "Visitors");
    xlsx.utils.book_append_sheet(wb, wsPresenters, "Project Presenters");

    const buf = xlsx.write(wb, { type: "buffer", bookType: "xlsx" });

    res.setHeader("Content-Disposition", 'attachment; filename="Science_Expo_Template.xlsx"');
    res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
    res.send(buf);
  } catch (error) {
    console.error("Excel Template Generation Error:", error);
    res.status(500).json({ error: "Failed to generate template." });
  }
};

// POST /api/students/bulk-upload
exports.bulkUpload = async (req, res) => {
  try {
    const { eventId } = req.body;
    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required." });
    }

    const schoolId = req.user.role === "school_coordinator" ? req.user.school : req.body.schoolId;
    if (!schoolId) {
      return res.status(400).json({ error: "School profile registration is required first." });
    }

    const school = await School.findById(schoolId);
    if (!school) {
      return res.status(404).json({ error: "School profile not found." });
    }

    if (!req.file) {
      return res.status(400).json({ error: "Excel file is required." });
    }

    const workbook = xlsx.read(req.file.buffer, { type: "buffer" });
    let visitorsAdded = 0;
    let projectsAdded = 0;
    const errors = [];

    // Parse Sheet 1: Visitors
    const sheetVisitors = workbook.Sheets["Visitors"];
    if (sheetVisitors) {
      const lockCheck = await checkRegistrationLock(eventId, "Visitor");
      if (lockCheck.locked) {
        errors.push(`Visitors: ${lockCheck.reason}`);
      } else {
        const rows = xlsx.utils.sheet_to_json(sheetVisitors);
        for (const [idx, row] of rows.entries()) {
          const name = row["Student Name"];
          const gender = row["Gender"];
          const dob = row["Date of Birth (YYYY-MM-DD)"];
          const studentClass = row["Class"];
          const section = row["Section"];
          const teacherName = row["Accompanying Teacher Name"];
          const emergencyContact = row["Emergency Contact"];
          const phone = row["Student Phone"] || row["Phone"] || emergencyContact;

          if (!name || !gender || !dob || !studentClass || !section || !teacherName || !emergencyContact || !phone) {
            errors.push(`Visitors row ${idx + 2}: Missing required fields.`);
            continue;
          }

          try {
            const duplicate = await Student.findOne({
              name: { $regex: new RegExp(`^${name.trim()}$`, "i") },
              class: String(studentClass).trim(),
              section: String(section).trim(),
              school: schoolId,
              event: eventId,
            });

            if (duplicate) {
              errors.push(`Visitors row ${idx + 2}: ${name} already registered.`);
              continue;
            }

            await Student.create({
              name,
              gender,
              dob: new Date(dob),
              class: String(studentClass),
              section: String(section),
              school: schoolId,
              event: eventId,
              principalName: school.principalName,
              inChargeName: school.inChargeName,
              teacherName,
              emergencyContact: String(emergencyContact),
              phone: String(phone),
              category: "Visitor",
              checkedIn: true,
            });
            visitorsAdded++;
          } catch (e) {
            errors.push(`Visitors row ${idx + 2}: Failed to save due to database error.`);
          }
        }
      }
    }

    // Parse Sheet 2: Project Presenters
    const sheetPresenters = workbook.Sheets["Project Presenters"];
    if (sheetPresenters) {
      const lockCheck = await checkRegistrationLock(eventId, "Project Presenter");
      if (lockCheck.locked) {
        errors.push(`Project Presenters: ${lockCheck.reason}`);
      } else {
        const rows = xlsx.utils.sheet_to_json(sheetPresenters);
        const projectGroups = {};
        for (const [idx, row] of rows.entries()) {
          const teamName = row["Team Name"];
          const title = row["Project Title"];
          if (!teamName || !title) {
            errors.push(`Presenters row ${idx + 2}: Missing Team Name or Project Title.`);
            continue;
          }

          const key = `${teamName.trim()}-${title.trim()}`.toLowerCase();
          if (!projectGroups[key]) {
            projectGroups[key] = {
              title,
              teamName,
              abstract: row["Project Abstract"] || "No abstract provided.",
              domain: row["Project Domain"] || "Open Innovation",
              guideTeacher: row["Guide Teacher"] || school.inChargeName,
              requiredEquipment: row["Required Equipment"] || "",
              description: row["Project Description"] || "",
              members: [],
              rowIndices: [],
            };
          }

          projectGroups[key].members.push({
            name: row["Student Name"],
            gender: row["Gender"],
            dob: row["Date of Birth (YYYY-MM-DD)"],
            class: String(row["Class"]),
            section: String(row["Section"]),
            emergencyContact: String(row["Emergency Contact"]),
            phone: String(row["Student Phone"] || row["Phone"] || row["Emergency Contact"]),
          });
          projectGroups[key].rowIndices.push(idx + 2);
        }

        // Create Projects
        for (const key of Object.keys(projectGroups)) {
          const pData = projectGroups[key];
          try {
            const studentIds = [];
            const createdStudents = [];
            let skipProject = false;

            for (const m of pData.members) {
              if (!m.name || !m.gender || !m.dob || !m.class || !m.section || !m.emergencyContact || !m.phone) {
                errors.push(`Presenters Project ${pData.title}: Team member ${m.name || "Unknown"} has missing details. Skipping project.`);
                skipProject = true;
                break;
              }

              const duplicate = await Student.findOne({
                name: { $regex: new RegExp(`^${m.name.trim()}$`, "i") },
                class: m.class,
                section: m.section,
                school: schoolId,
                event: eventId,
              });

              if (duplicate) {
                errors.push(`Presenters Project ${pData.title}: Member ${m.name} is already registered. Skipping project.`);
                skipProject = true;
                break;
              }

              const student = await Student.create({
                name: m.name,
                gender: m.gender,
                dob: new Date(m.dob),
                class: m.class,
                section: m.section,
                school: schoolId,
                event: eventId,
                principalName: school.principalName,
                inChargeName: school.inChargeName,
                teacherName: pData.guideTeacher,
                emergencyContact: m.emergencyContact,
                phone: m.phone,
                category: "Project Presenter",
              });

              studentIds.push(student._id);
              createdStudents.push(student);
            }

            if (skipProject) {
              for (const s of createdStudents) {
                await Student.findByIdAndDelete(s._id);
              }
              continue;
            }

            await Project.create({
              title: pData.title,
              abstract: pData.abstract,
              domain: pData.domain,
              teamName: pData.teamName,
              members: studentIds,
              guideTeacher: pData.guideTeacher,
              requiredEquipment: pData.requiredEquipment,
              description: pData.description,
              event: eventId,
              status: "Registered",
            });

            projectsAdded++;
          } catch (e) {
            console.error("Bulk Project Save Error:", e);
            errors.push(`Presenters Project ${pData.title}: Database save failed.`);
          }
        }
      }
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "BULK_UPLOAD_REGISTRATIONS",
      { visitorsAdded, projectsAdded, errorsCount: errors.length },
      req
    );

    res.json({
      message: `Bulk registration completed.`,
      visitorsAdded,
      projectsAdded,
      errors,
    });
  } catch (error) {
    console.error("Bulk Upload Error:", error);
    res.status(500).json({ error: "Failed to process bulk upload." });
  }
};
