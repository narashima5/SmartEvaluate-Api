const mongoose = require("../config/db");

const AttendanceSchema = new mongoose.Schema(
  {
    student: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Student",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    entryTime: {
      type: Date,
      default: Date.now,
    },
    scannedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    gate: {
      type: String,
      default: "Main Gate",
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

// Compound index to prevent duplicate attendance records for the same student at the same event
AttendanceSchema.index({ student: 1, event: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", AttendanceSchema);
