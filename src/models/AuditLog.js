const mongoose = require("../config/db");

const AuditLogSchema = new mongoose.Schema({
  actor: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: false, // Can be null if guest/system
  },
  actorUsername: {
    type: String,
    required: false,
  },
  action: {
    type: String,
    required: true,
    trim: true,
  },
  details: {
    type: mongoose.Schema.Types.Mixed,
    default: {},
  },
  ipAddress: {
    type: String,
    trim: true,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("AuditLog", AuditLogSchema);
