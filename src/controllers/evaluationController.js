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

    // Jury domain check (only block if jury has target_domain and it doesn't match)
    if (req.user.role === "jury" && req.user.target_domain && req.user.target_domain !== project.domain) {
      return res.status(403).json({ error: `You are only authorized to evaluate projects in the '${req.user.target_domain}' domain.` });
    }

    // Check if duplicate/existing evaluation
    const existingEval = await Evaluation.findOne({ project: projectId, jury: req.user._id });
    if (existingEval) {
      if (existingEval.isLocked) {
        return res.status(400).json({ error: "This evaluation is submitted and locked. Contact an admin to unlock." });
      }

      // Update existing unlocked evaluation
      if (hasScores) {
        existingEval.scores = scores;
        existingEval.innovation = undefined;
        existingEval.technicalKnowledge = undefined;
        existingEval.presentation = undefined;
        existingEval.practicalImplementation = undefined;
        existingEval.socialImpact = undefined;
      } else {
        existingEval.scores = [];
        existingEval.innovation = Number(innovation);
        existingEval.technicalKnowledge = Number(technicalKnowledge);
        existingEval.presentation = Number(presentation);
        existingEval.practicalImplementation = Number(practicalImplementation);
        existingEval.socialImpact = Number(socialImpact);
      }
      existingEval.remarks = remarks || "";
      existingEval.isLocked = true; // Re-lock after update
      await existingEval.save();

      // Recalculate project total score
      await updateProjectScore(projectId);

      await logAudit(
        req.user._id,
        req.user.username,
        "PROJECT_EVALUATION_UPDATE",
        { projectId: project._id, projectCode: project.projectId, totalMarks: existingEval.totalMarks },
        req
      );

      return res.json({ message: "Evaluation updated and locked successfully.", evaluation: existingEval });
    }

    // Create new evaluation
    const evalData = {
      project: projectId,
      jury: req.user._id,
      remarks: remarks || "",
      isLocked: true,
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

    // Update project overall status to Evaluated and update its average score
    project.status = "Evaluated";
    await project.save();

    await updateProjectScore(projectId);

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_EVALUATION_SUBMIT",
      { projectId: project._id, projectCode: project.projectId, totalMarks: evaluation.totalMarks },
      req
    );

    res.status(201).json({ message: "Evaluation submitted and locked successfully.", evaluation });
  } catch (error) {
    console.error("Submit Evaluation Error:", error);
    res.status(500).json({ error: "Failed to submit evaluation." });
  }
};

// Helper to recalculate project average score
const updateProjectScore = async (projectId) => {
  try {
    const evals = await Evaluation.find({ project: projectId });
    if (evals.length > 0) {
      const sum = evals.reduce((acc, curr) => acc + curr.totalMarks, 0);
      const avg = sum / evals.length;
      await Project.findByIdAndUpdate(projectId, { score: parseFloat(avg.toFixed(2)) });
    }
  } catch (error) {
    console.error("Recalculate Project Score Error:", error);
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
    const evaluation = await Evaluation.findById(id).populate("project");
    if (!evaluation) {
      return res.status(404).json({ error: "Evaluation not found" });
    }

    evaluation.isLocked = false;
    await evaluation.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "PROJECT_EVALUATION_UNLOCK",
      { evaluationId: evaluation._id, projectCode: evaluation.project.projectId },
      req
    );

    res.json({ message: "Evaluation successfully unlocked.", evaluation });
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
    const { domain } = req.query;
    let query = {};
    if (domain) {
      query.domain = domain;
    }
    const criteria = await EvaluationCriteria.find(query);
    criteria.sort((a, b) => (a.name || "").localeCompare(b.name || ""));
    res.json(criteria);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch evaluation criteria." });
  }
};

exports.createCriteria = async (req, res) => {
  try {
    const { domain, name, maxMarks, description } = req.body;
    if (!domain || !name || maxMarks === undefined) {
      return res.status(400).json({ error: "Domain, name, and maxMarks are required." });
    }
    const criteria = await EvaluationCriteria.create({
      domain: domain.trim(),
      name: name.trim(),
      maxMarks: Number(maxMarks),
      description: description || "",
    });
    await logAudit(
      req.user._id,
      req.user.username,
      "CREATE_CRITERIA",
      { domain: criteria.domain, name: criteria.name, maxMarks: criteria.maxMarks },
      req
    );
    res.status(201).json(criteria);
  } catch (error) {
    res.status(500).json({ error: "Failed to create evaluation criteria." });
  }
};
