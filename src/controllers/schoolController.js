const School = require("../models/School");
const User = require("../models/User");
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

exports.registerSchool = async (req, res) => {
  try {
    const {
      name,
      code,
      address,
      district,
      state,
      pincode,
      principalName,
      inChargeName,
      coordinatorEmail,
      coordinatorMobile,
      teachersCount,
      teacherNames,
      emergencyContact,
    } = req.body;

    if (
      !name ||
      !address ||
      !district ||
      !state ||
      !pincode ||
      !principalName ||
      !inChargeName ||
      !coordinatorEmail ||
      !coordinatorMobile ||
      !emergencyContact
    ) {
      return res.status(400).json({ error: "All required school profile fields must be filled." });
    }

    const generatedCode = code && code.trim()
      ? code.trim()
      : "SCH-" + Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90);

    if (code && code.trim()) {
      const existingSchool = await School.findOne({ code: code.trim() });
      if (existingSchool) {
        return res.status(400).json({ error: `School with code ${code} is already registered.` });
      }
    }

    // Create the School
    const school = await School.create({
      name,
      code: generatedCode,
      address,
      district,
      state,
      pincode,
      principalName,
      inChargeName,
      coordinatorEmail: coordinatorEmail.toLowerCase(),
      coordinatorMobile,
      teachersCount: parseInt(teachersCount, 10) || 0,
      teacherNames: Array.isArray(teacherNames) ? teacherNames : [],
      emergencyContact,
    });

    // Update coordinator user account to reference this school if applicable
    if (req.user.role === "school_coordinator") {
      const user = await User.findById(req.user._id);
      if (user) {
        user.school = school._id;
        await user.save();
      }
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "SCHOOL_REGISTER",
      { schoolId: school._id, name: school.name, code: school.code },
      req
    );

    res.status(201).json({
      message: "School profile registered successfully.",
      school,
    });
  } catch (error) {
    console.error("Register School Error:", error);
    res.status(500).json({ error: "Failed to register school profile." });
  }
};

exports.getCoordinatorSchool = async (req, res) => {
  try {
    if (!req.user.school) {
      return res.status(404).json({ error: "No school registered for this coordinator." });
    }
    const schoolId = req.user.school._id || req.user.school;
    const school = await School.findById(schoolId);
    res.json(school);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch school details." });
  }
};

exports.getSchools = async (req, res) => {
  try {
    let query = {};
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { name: searchRegex },
        { code: searchRegex },
        { district: searchRegex },
        { principalName: searchRegex },
      ];
    }
    const schools = await School.find(query).sort({ name: 1 });
    res.json(schools);
  } catch (error) {
    res.status(500).json({ error: "Failed to list schools." });
  }
};

exports.getSchoolById = async (req, res) => {
  try {
    const school = await School.findById(req.params.id);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }
    res.json(school);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch school details." });
  }
};

exports.updateSchool = async (req, res) => {
  try {
    const { id } = req.params;

    // A coordinator can only update their own school; Admin can update any
    const userSchoolId = (req.user.school?._id || req.user.school || "").toString();
    if (req.user.role === "school_coordinator" && userSchoolId !== id) {
      return res.status(403).json({ error: "You are not authorized to update this school." });
    }

    const school = await School.findById(id);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    const fieldsToUpdate = [
      "name",
      "address",
      "district",
      "state",
      "pincode",
      "principalName",
      "inChargeName",
      "coordinatorEmail",
      "coordinatorMobile",
      "teachersCount",
      "teacherNames",
      "emergencyContact",
    ];

    fieldsToUpdate.forEach((field) => {
      if (req.body[field] !== undefined) {
        if (field === "teachersCount") {
          school[field] = parseInt(req.body[field], 10) || 0;
        } else if (field === "coordinatorEmail") {
          school[field] = req.body[field].toLowerCase();
        } else {
          school[field] = req.body[field];
        }
      }
    });

    await school.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "SCHOOL_UPDATE",
      { schoolId: school._id, name: school.name },
      req
    );
    res.json({ message: "School profile updated successfully.", school });
  } catch (error) {
    console.error("Update School Error:", error);
    res.status(500).json({ error: "Failed to update school profile." });
  }
};

exports.deleteSchool = async (req, res) => {
  try {
    const { id } = req.params;
    const school = await School.findById(id);
    if (!school) {
      return res.status(404).json({ error: "School not found" });
    }

    // Remove school reference from users
    await User.updateMany({ school: id }, { $unset: { school: "" } });

    await School.findByIdAndDelete(id);

    await logAudit(
      req.user._id,
      req.user.username,
      "SCHOOL_DELETE",
      { schoolId: id, name: school.name },
      req
    );

    res.json({ message: "School profile deleted successfully." });
  } catch (error) {
    console.error("Delete School Error:", error);
    res.status(500).json({ error: "Failed to delete school profile." });
  }
};
