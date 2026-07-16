const mongoose = require("../config/db");

const ProjectSchema = new mongoose.Schema(
  {
    projectId: {
      type: String,
      required: true,
      unique: true,
    },
    title: {
      type: String,
      required: true,
      trim: true,
    },
    abstract: {
      type: String,
      required: true,
      trim: true,
    },
    domain: {
      type: String,
      required: true,
      trim: true,
    },
    teamName: {
      type: String,
      required: true,
      trim: true,
    },
    members: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Student",
      },
    ],
    guideTeacher: {
      type: String,
      required: true,
      trim: true,
    },
    requiredEquipment: {
      type: String,
      trim: true,
      default: "",
    },
    description: {
      type: String,
      trim: true,
      default: "",
    },
    stallNumber: {
      type: String,
      default: null, // Assigned manually or automatically by admin
    },
    status: {
      type: String,
      enum: ["Registered", "Checked In", "Evaluated", "Winner"],
      default: "Registered",
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    score: {
      type: Number,
      default: 0, // Cached average or total score for sorting leaderboard
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save validation/hook to generate projectId if not set
ProjectSchema.pre("validate", async function () {
  if (!this.projectId) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Project").countDocuments();
    const padStr = String(count + 1).padStart(3, "0");
    this.projectId = `SCI${year}-${padStr}`;
  }
});

module.exports = mongoose.model("Project", ProjectSchema);
