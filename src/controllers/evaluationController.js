const Evaluation = require("../models/Evaluation");
const Project = require("../models/Project");
const AuditLog = require("../models/AuditLog");
const Domain = require("../models/Domain");
const EvaluationCriteria = require("../models/EvaluationCriteria");

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

exports.submitEvaluation = async (req, res) => {
  try {
    const {
      projectId,
      remarks,
      scores,
      innovation,
      technicalKnowledge,
      presentation,
      practicalImplementation,
      socialImpact,
    } = req.body;

    if (!projectId) {
      return res.status(400).json({ error: "Project ID is required." });
    }

    const hasScores = scores && Array.isArray(scores) && scores.length > 0;
    const hasStatic =
      innovation !== undefined &&
      technicalKnowledge !== undefined &&
      presentation !== undefined &&
      practicalImplementation !== undefined &&
      socialImpact !== undefined;

    if (!hasScores && !hasStatic) {
      return res.status(400).json({ error: "Evaluation scores or criteria marks are required." });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    // Check if duplicate/existing evaluation
    let existingEval = await Evaluation.findOne({ project: projectId, jury: req.user._id });
    if (existingEval) {
      // Update existing evaluation for this jury member
      if (hasScores) {
        existingEval.scores = scores;
        existingEval.totalMarks = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
      } else {
        existingEval.scores = [];
        existingEval.innovation = Number(innovation);
        existingEval.technicalKnowledge = Number(technicalKnowledge);
        existingEval.presentation = Number(presentation);
        existingEval.practicalImplementation = Number(practicalImplementation);
        existingEval.socialImpact = Number(socialImpact);
        existingEval.totalMarks =
          Number(innovation) +
          Number(technicalKnowledge) +
          Number(presentation) +
          Number(practicalImplementation) +
          Number(socialImpact);
      }
      existingEval.remarks = remarks || "";
      await existingEval.save();

      // Recalculate average project score across all jury evaluations
      await updateProjectScore(projectId);

      await logAudit(
        req.user._id,
        req.user.username,
        "PROJECT_EVALUATION_UPDATE",
        { projectId: project._id, projectCode: project.projectId, totalMarks: existingEval.totalMarks },
        req
      );

      return res.json({ message: "Evaluation saved successfully.", evaluation: existingEval });
    }

    // Create new evaluation for this jury member
    const evalData = {
      project: projectId,
      jury: req.user._id,
      remarks: remarks || "",
    };

    if (hasScores) {
      evalData.scores = scores;
    } else {
      evalData.innovation = Number(innovation);
      evalData.technicalKnowledge = Number(technicalKnowledge);
      evalData.presentation = Number(presentation);
      evalData.practicalImplementation = Number(practicalImplementation);
      evalData.socialImpact = Number(socialImpact);
    }

    const evaluation = await Evaluation.create(evalData);

    // Update project average score across all jury members
    await updateProjectScore(projectId);

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_EVALUATION_SUBMIT",
      { projectId: project._id, projectCode: project.projectId, totalMarks: evaluation.totalMarks },
      req
    );

    res.status(201).json({ message: "Evaluation saved successfully.", evaluation });
  } catch (error) {
    console.error("Submit Evaluation Error:", error);
    res.status(500).json({ error: "Failed to submit evaluation." });
  }
};

// Helper to recalculate project average score from all jury evaluations
const updateProjectScore = async (projectId) => {
  try {
    const evals = await Evaluation.find({ project: projectId });
    if (evals.length > 0) {
      const sum = evals.reduce((acc, curr) => acc + (Number(curr.totalMarks) || 0), 0);
      const avg = sum / evals.length;
      await Project.findByIdAndUpdate(projectId, {
        score: parseFloat(avg.toFixed(2)),
        status: "Evaluated",
      });
    } else {
      await Project.findByIdAndUpdate(projectId, {
        score: 0,
        status: "Checked In",
      });
    }
  } catch (error) {
    console.error("Recalculate Project Score Error:", error);
  }
};

exports.adminUpdateEvaluation = async (req, res) => {
  try {
    const { id } = req.params;
    const { scores, remarks } = req.body;

    const evaluation = await Evaluation.findById(id);
    if (!evaluation) {
      return res.status(404).json({ error: "Evaluation record not found." });
    }

    if (scores && Array.isArray(scores)) {
      evaluation.scores = scores;
      evaluation.totalMarks = scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
    }

    if (remarks !== undefined) {
      evaluation.remarks = remarks;
    }

    await evaluation.save();
    await updateProjectScore(evaluation.project);

    await logAudit(
      req.user._id,
      req.user.username,
      "ADMIN_EVALUATION_UPDATE",
      { evaluationId: evaluation._id, projectId: evaluation.project, totalMarks: evaluation.totalMarks },
      req
    );

    res.json({ message: "Jury evaluation marks updated successfully.", evaluation });
  } catch (error) {
    console.error("Admin Update Evaluation Error:", error);
    res.status(500).json({ error: "Failed to update evaluation." });
  }
};

exports.getProjectEvaluations = async (req, res) => {
  try {
    const { projectId } = req.params;
    const evaluations = await Evaluation.find({ project: projectId }).populate("jury", "username email");
    res.json(evaluations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch evaluations." });
  }
};

exports.getJuryEvaluations = async (req, res) => {
  try {
    const evaluations = await Evaluation.find({ jury: req.user._id }).populate("project");
    res.json(evaluations);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch jury evaluations." });
  }
};

exports.unlockEvaluation = async (req, res) => {
  try {
    const { id } = req.params;

    if (!id) {
      return res.status(400).json({ error: "ID parameter is required." });
    }

    const mongoose = require("../config/db");
    const isHexId = /^[0-9a-fA-F]{24}$/.test(id);

    let project = null;
    if (isHexId) {
      project = await Project.findById(id);
    }
    if (!project) {
      project = await Project.findOne({ projectId: id });
    }
    if (!project && isHexId) {
      const evalDoc = await Evaluation.findById(id);
      if (evalDoc) {
        project = await Project.findById(evalDoc.project);
      }
    }

    const targetProjectId = project ? project._id : (isHexId ? id : null);

    if (!targetProjectId) {
      return res.status(404).json({ error: "Project or evaluation document not found." });
    }

    // Unlock ALL evaluations for this project (by project reference or evaluation _id)
    const queryCond = isHexId
      ? { $or: [{ project: targetProjectId }, { project: String(targetProjectId) }, { _id: id }] }
      : { $or: [{ project: targetProjectId }, { project: String(targetProjectId) }] };

    const updateResult = await Evaluation.updateMany(
      queryCond,
      { $set: { isLocked: false } }
    );

    // Reset project status to "Checked In" so jury panel can evaluate again
    const updatedProject = await Project.findByIdAndUpdate(
      targetProjectId,
      { status: "Checked In" },
      { new: true }
    );

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_EVALUATION_UNLOCK",
      { targetProjectId, inputId: id, modifiedCount: updateResult.modifiedCount },
      req
    );

    res.json({ message: "Evaluation successfully unlocked.", project: updatedProject || project });
  } catch (error) {
    console.error("Unlock Evaluation Error:", error);
    res.status(500).json({ error: "Failed to unlock evaluation." });
  }
};

exports.getDomains = async (req, res) => {
  try {
    const domains = await Domain.find();
    domains.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    res.json(domains);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch domains." });
  }
};

exports.createDomain = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ error: "Domain name is required." });
    }
    const existing = await Domain.findOne({ name: { $regex: new RegExp(`^${name.trim()}$`, "i") } });
    if (existing) {
      return res.status(400).json({ error: "Domain already exists." });
    }
    const domain = await Domain.create({ name: name.trim(), description: description || "" });
    await logAudit(req.user._id, req.user.username, "CREATE_DOMAIN", { name: domain.name }, req);
    res.status(201).json(domain);
  } catch (error) {
    res.status(500).json({ error: "Failed to create domain." });
  }
};

exports.getCriteria = async (req, res) => {
  try {
    let criteria = await EvaluationCriteria.find({});
    if (criteria.length === 0) {
      criteria = await EvaluationCriteria.insertMany([
        { name: "Innovation & Originality", maxMarks: 20, description: "Novelty of concept and creative approach." },
        { name: "Technical Knowledge", maxMarks: 20, description: "Understanding of scientific principles and technical execution." },
        { name: "Presentation & Communication", maxMarks: 20, description: "Clarity of demonstration and team presentation skills." },
        { name: "Practical Implementation", maxMarks: 20, description: "Functionality, prototype working condition, and design." },
        { name: "Social & Environmental Impact", maxMarks: 20, description: "Real-world utility and problem-solving relevance." },
      ]);
    }
    criteria.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    res.json(criteria);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch evaluation criteria." });
  }
};

exports.createCriteria = async (req, res) => {
  try {
    const { name, maxMarks, description } = req.body;
    if (!name || maxMarks === undefined) {
      return res.status(400).json({ error: "Name and maxMarks are required." });
    }
    const criteria = await EvaluationCriteria.create({
      name: name.trim(),
      maxMarks: Number(maxMarks),
      description: description || "",
    });
    await logAudit(
      req.user._id,
      req.user.username,
      "CREATE_CRITERIA",
      { name: criteria.name, maxMarks: criteria.maxMarks },
      req
    );
    res.status(201).json(criteria);
  } catch (error) {
    console.error("Create Criteria Error:", error);
    res.status(500).json({ error: "Failed to create evaluation criteria." });
  }
};

exports.deleteCriteria = async (req, res) => {
  try {
    const { id } = req.params;
    const criteria = await EvaluationCriteria.findByIdAndDelete(id);
    if (!criteria) {
      return res.status(404).json({ error: "Criteria not found" });
    }
    await logAudit(
      req.user._id,
      req.user.username,
      "DELETE_CRITERIA",
      { name: criteria.name },
      req
    );
    res.json({ message: "Criteria deleted successfully." });
  } catch (error) {
    console.error("Delete Criteria Error:", error);
    res.status(500).json({ error: "Failed to delete criteria." });
  }
};

exports.updateCriteria = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, maxMarks, description } = req.body;
    if (!name || maxMarks === undefined) {
      return res.status(400).json({ error: "Name and maxMarks are required." });
    }
    const criteria = await EvaluationCriteria.findByIdAndUpdate(
      id,
      {
        name: name.trim(),
        maxMarks: Number(maxMarks),
        description: description || "",
      },
      { new: true }
    );
    if (!criteria) {
      return res.status(404).json({ error: "Criteria not found" });
    }
    await logAudit(
      req.user._id,
      req.user.username,
      "UPDATE_CRITERIA",
      { id, name: criteria.name, maxMarks: criteria.maxMarks },
      req
    );
    res.json(criteria);
  } catch (error) {
    console.error("Update Criteria Error:", error);
    res.status(500).json({ error: "Failed to update evaluation criteria." });
  }
};

exports.deleteAllCriteria = async (req, res) => {
  try {
    const result = await EvaluationCriteria.deleteMany({});
    await logAudit(
      req.user._id,
      req.user.username,
      "DELETE_ALL_CRITERIA",
      { deletedCount: result ? result.deletedCount : 0 },
      req
    );
    res.json({ message: "All evaluation criteria deleted successfully." });
  } catch (error) {
    console.error("Delete All Criteria Error:", error);
    res.status(500).json({ error: "Failed to delete all criteria." });
  }
};

exports.getLeaderboard = async (req, res) => {
  try {
    const { eventId } = req.query;
    let query = {};
    if (eventId) {
      query.event = eventId;
    }

    const School = require("../models/School");
    const Evaluation = require("../models/Evaluation");

    const projects = await Project.find(query).populate("members").populate("event");
    const evaluations = await Evaluation.find({});

    const leaderboard = [];

    for (const proj of projects) {
      const projEvals = evaluations.filter((e) => String(e.project) === String(proj._id));
      const evalCount = projEvals.length;
      let totalScore = proj.score || 0;

      if (evalCount > 0) {
        const sum = projEvals.reduce((acc, curr) => acc + (curr.totalMarks || 0), 0);
        totalScore = parseFloat((sum / evalCount).toFixed(2));
      }

      let schoolName = "N/A";
      let schoolCode = "N/A";
      if (proj.members && proj.members.length > 0) {
        const firstMember = proj.members[0];
        const studentSchoolId = firstMember.school?._id || firstMember.school;
        if (studentSchoolId) {
          if (typeof studentSchoolId === "object" && studentSchoolId.name) {
            schoolName = studentSchoolId.name;
            schoolCode = studentSchoolId.code || "N/A";
          } else {
            const sch = await School.findById(studentSchoolId);
            if (sch) {
              schoolName = sch.name;
              schoolCode = sch.code || "N/A";
            }
          }
        }
      }

      leaderboard.push({
        _id: proj._id,
        projectId: proj.projectId,
        title: proj.title,
        teamName: proj.teamName,
        guideTeacher: proj.guideTeacher,
        schoolName,
        schoolCode,
        stallNumber: proj.stallNumber,
        score: totalScore,
        evaluationsCount: evalCount,
        status: evalCount > 0 ? "Evaluated" : "Pending",
      });
    }

    leaderboard.sort((a, b) => b.score - a.score);

    leaderboard.forEach((item, index) => {
      item.rank = index + 1;
    });

    res.json(leaderboard);
  } catch (error) {
    console.error("Get Leaderboard Error:", error);
    res.status(500).json({ error: "Failed to fetch project leaderboard." });
  }
};

exports.getEvaluationsByJury = async (req, res) => {
  try {
    const { juryId } = req.params;
    const User = require("../models/User");
    const Student = require("../models/Student");
    const School = require("../models/School");
    const juryIdStr = String(juryId);

    let evals = await Evaluation.find({ jury: juryIdStr });
    if (!evals || evals.length === 0) {
      evals = await Evaluation.find({ jury: juryId });
    }

    const juryUser = await User.findById(juryIdStr);

    const populatedEvals = await Promise.all(
      evals.map(async (e) => {
        const plainEval = typeof e.toObject === "function" ? e.toObject() : { ...e };
        let projectDoc = null;

        if (plainEval.project) {
          const projIdStr = plainEval.project._id ? String(plainEval.project._id) : String(plainEval.project);

          // 1. Try finding project by document ID
          projectDoc = await Project.findById(projIdStr);

          // 2. Fall back to finding by custom projectId code (e.g. PRJ001)
          if (!projectDoc) {
            projectDoc = await Project.findOne({ projectId: projIdStr });
          }
        }

        let plainProject = null;
        if (projectDoc) {
          plainProject = typeof projectDoc.toObject === "function" ? projectDoc.toObject() : { ...projectDoc };

          // Populate student members & school details
          const rawMembers = Array.isArray(plainProject.members) ? plainProject.members : [];
          const populatedMembers = [];

          for (const m of rawMembers) {
            const mId = m && m._id ? String(m._id) : String(m);
            let studentDoc = await Student.findById(mId);
            if (!studentDoc && typeof m === "object" && m.name) {
              studentDoc = m;
            }
            if (studentDoc) {
              const plainStudent = typeof studentDoc.toObject === "function" ? studentDoc.toObject() : { ...studentDoc };
              if (plainStudent.school) {
                const schoolId = plainStudent.school._id ? String(plainStudent.school._id) : String(plainStudent.school);
                const schoolDoc = await School.findById(schoolId);
                if (schoolDoc) {
                  plainStudent.school = typeof schoolDoc.toObject === "function" ? schoolDoc.toObject() : schoolDoc;
                }
              }
              populatedMembers.push(plainStudent);
            }
          }
          plainProject.members = populatedMembers;
        }

        const plainJury = juryUser ? (typeof juryUser.toObject === "function" ? juryUser.toObject() : juryUser) : plainEval.jury;

        return {
          ...plainEval,
          project: plainProject,
          jury: plainJury,
        };
      })
    );

    res.json(populatedEvals);
  } catch (error) {
    console.error("Get Jury Evaluations Error:", error);
    res.status(500).json({ error: "Failed to fetch jury evaluations." });
  }
};
