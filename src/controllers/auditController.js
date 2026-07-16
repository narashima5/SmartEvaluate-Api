const AuditLog = require("../models/AuditLog");

exports.getAuditLogs = async (req, res) => {
  try {
    let query = {};

    // Search query by username or action
    if (req.query.search) {
      const searchRegex = new RegExp(req.query.search, "i");
      query.$or = [
        { actorUsername: searchRegex },
        { action: searchRegex },
      ];
    }

    if (req.query.action) {
      query.action = req.query.action;
    }

    const logs = await AuditLog.find(query)
      .populate("actor", "username email role");

    // Sort in memory to avoid Firestore index requirement
    logs.sort((a, b) => {
      const timeA = a.createdAt ? new Date(a.createdAt).getTime() : 0;
      const timeB = b.createdAt ? new Date(b.createdAt).getTime() : 0;
      return timeB - timeA; // Descending
    });

    // Apply limit in memory
    const limitedLogs = logs.slice(0, 200);

    res.json(limitedLogs);
  } catch (error) {
    console.error("Get Audit Logs Error:", error);
    res.status(500).json({ error: "Failed to retrieve audit logs." });
  }
};
