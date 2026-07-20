const Project = require("../models/Project");
const AuditLog = require("../models/AuditLog");

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

exports.getProjects = async (req, res) => {
  try {
    let query = {};

    // Jury members can view all registered projects for evaluation

    // School coordinators can only view projects from their school
    if (req.user.role === "school_coordinator") {
      // Find students belonging to their school
      // An easier way: Populate members and filter them, or perform a subquery
      // Let's filter in database. Since members are references, we filter projects where event is active and members are from their school.
      // Wait, we can query projects where event matches the school coordinator's active registrations.
      // Better, we fetch coordinator's school, then find students of that school, then query projects that contain these student IDs.
      const Student = require("../models/Student");
      const userSchoolId = req.user.school?._id || req.user.school;
      const schoolStudents = await Student.find({ school: userSchoolId }).select("_id");
      const studentIds = schoolStudents.map((s) => s._id);
      query.members = { $in: studentIds };
    }

    // Filter by Event ID
    if (req.query.eventId) {
      query.event = req.query.eventId;
    }

    // Filter by Domain
    if (req.query.domain) {
      query.domain = req.query.domain;
    }

    // Filter by Status
    if (req.query.status) {
      query.status = req.query.status;
    }

    // Search query (projectId, title, teamName)
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { projectId: searchRegex },
        { title: searchRegex },
        { teamName: searchRegex },
        { guideTeacher: searchRegex },
      ];
    }

    const Student = require("../models/Student");
    const School = require("../models/School");

    const projects = await Project.find(query)
      .populate({
        path: "members",
        populate: { path: "school" },
      })
      .populate("event");

    for (const proj of projects) {
      if (proj.members && Array.isArray(proj.members)) {
        // Fallback: If any member in array is an ObjectId or string or has unpopulated school
        const memberIds = proj.members.map((m) => (typeof m === "object" && m._id ? m._id : m));
        if (memberIds.length > 0) {
          const fullMembers = await Student.find({ _id: { $in: memberIds } }).populate("school");
          if (fullMembers && fullMembers.length > 0) {
            proj.members = fullMembers;
          }
        }
      }
    }

    // Sort in memory
    projects.sort((a, b) => (a.projectId || "").localeCompare(b.projectId || ""));

    res.json(projects);
  } catch (error) {
    console.error("Get Projects Error:", error);
    res.status(500).json({ error: "Failed to fetch projects." });
  }
};

exports.getProjectById = async (req, res) => {
  try {
    const Student = require("../models/Student");
    const School = require("../models/School");

    let project = await Project.findById(req.params.id)
      .populate({
        path: "members",
        populate: { path: "school" },
      })
      .populate("event");

    if (!project) {
      project = await Project.findOne({ projectId: req.params.id })
        .populate({
          path: "members",
          populate: { path: "school" },
        })
        .populate("event");
    }

    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.members && Array.isArray(project.members)) {
      const memberIds = project.members.map((m) => (typeof m === "object" && m._id ? m._id : m));
      if (memberIds.length > 0) {
        const fullMembers = await Student.find({ _id: { $in: memberIds } }).populate("school");
        if (fullMembers && fullMembers.length > 0) {
          project.members = fullMembers;
        }
      }
    }

    res.json(project);
  } catch (error) {
    console.error("Get Project By ID Error:", error);
    res.status(500).json({ error: "Failed to fetch project details." });
  }
};

exports.updateProjectDetails = async (req, res) => {
  try {
    const { id } = req.params;
    const { title, abstract, domain, teamName, guideTeacher, requiredEquipment, description } = req.body;

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Access check for coordinator
    if (req.user.role === "school_coordinator") {
      const Student = require("../models/Student");
      const userSchoolId = req.user.school?._id || req.user.school;
      const isMember = await Student.findOne({ _id: { $in: project.members }, school: userSchoolId });
      if (!isMember) {
        return res.status(403).json({ error: "Unauthorized access to project." });
      }
    }

    project.title = title || project.title;
    project.abstract = abstract || project.abstract;
    project.domain = domain || project.domain;
    project.teamName = teamName || project.teamName;
    project.guideTeacher = guideTeacher || project.guideTeacher;
    project.requiredEquipment = requiredEquipment !== undefined ? requiredEquipment : project.requiredEquipment;
    project.description = description !== undefined ? description : project.description;

    await project.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_UPDATE_DETAILS",
      { projectId: project._id, projectCode: project.projectId },
      req
    );

    res.json({ message: "Project updated successfully.", project });
  } catch (error) {
    console.error("Update Project Error:", error);
    res.status(500).json({ error: "Failed to update project." });
  }
};

exports.assignStall = async (req, res) => {
  try {
    const { id } = req.params;
    const { stallNumber } = req.body;

    if (!stallNumber) {
      return res.status(400).json({ error: "Stall number is required." });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    project.stallNumber = stallNumber;
    await project.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_ASSIGN_STALL",
      { projectId: project._id, projectCode: project.projectId, stallNumber },
      req
    );

    res.json({ message: "Stall allocated successfully.", project });
  } catch (error) {
    console.error("Stall Allocation Error:", error);
    res.status(500).json({ error: "Failed to assign stall." });
  }
};

// Automatic stall allocation helper
exports.autoAllocateStalls = async (req, res) => {
  try {
    const { eventId, prefix } = req.body;
    if (!eventId) {
      return res.status(400).json({ error: "Event ID is required." });
    }

    // Fetch all projects for the event to filter and sort in-memory
    const allProjects = await Project.find({ event: eventId });
    
    // Filter projects that do not have a stall allocated
    const projectsWithoutStalls = allProjects.filter(p => !p.stallNumber);
    if (projectsWithoutStalls.length === 0) {
      return res.status(400).json({ error: "All projects already have stalls allocated." });
    }

    // Sort the unallocated projects in memory by domain, then by projectId
    projectsWithoutStalls.sort((a, b) => {
      const domCompare = (a.domain || "").localeCompare(b.domain || "");
      if (domCompare !== 0) return domCompare;
      return (a.projectId || "").localeCompare(b.projectId || "");
    });

    let allocatedCount = 0;
    const stallPrefix = prefix || "ST-";
    
    // Find current max stall number from already allocated ones
    const existingStalls = allProjects.filter(p => p.stallNumber);
    let nextStallIndex = 1;
    if (existingStalls.length > 0) {
      const numbers = existingStalls
        .map((p) => parseInt(p.stallNumber.replace(stallPrefix, ""), 10))
        .filter((n) => !isNaN(n));
      if (numbers.length > 0) {
        nextStallIndex = Math.max(...numbers) + 1;
      }
    }

    for (const p of projectsWithoutStalls) {
      p.stallNumber = `${stallPrefix}${String(nextStallIndex).padStart(3, "0")}`;
      await p.save();
      nextStallIndex++;
      allocatedCount++;
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECTS_AUTO_ALLOCATE_STALLS",
      { allocatedCount, eventId },
      req
    );

    res.json({ message: `Successfully allocated stalls to ${allocatedCount} projects.`, allocatedCount });
  } catch (error) {
    console.error("Auto Allocate Stalls Error:", error);
    res.status(500).json({ error: error.message || "Failed to auto-allocate stalls." });
  }
};

exports.updateProjectStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!status) {
      return res.status(400).json({ error: "Status is required." });
    }

    const project = await Project.findById(id);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    project.status = status;
    await project.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_STATUS_UPDATE",
      { projectId: project._id, projectCode: project.projectId, status },
      req
    );

    res.json({ message: "Project status updated successfully.", project });
  } catch (error) {
    console.error("Update Status Error:", error);
    res.status(500).json({ error: "Failed to update project status." });
  }
};
