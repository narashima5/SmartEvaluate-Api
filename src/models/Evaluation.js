const mongoose = require("../config/db");

const EvaluationSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Project",
      required: true,
    },
    jury: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },
    innovation: {
      type: Number,
      min: 0,
      max: 25,
    },
    technicalKnowledge: {
      type: Number,
      min: 0,
      max: 20,
    },
    presentation: {
      type: Number,
      min: 0,
      max: 20,
    },
    practicalImplementation: {
      type: Number,
      min: 0,
      max: 20,
    },
    socialImpact: {
      type: Number,
      min: 0,
      max: 15,
    },
    scores: [
      {
        criteriaId: { type: String, required: true },
        criteriaName: { type: String, required: true },
        score: { type: Number, required: true },
      }
    ],
    totalMarks: {
      type: Number,
      required: true,
      min: 0,
    },
    remarks: {
      type: String,
      trim: true,
      default: "",
    },
    isLocked: {
      type: Boolean,
      default: true, // Becomes read-only after submission unless unlocked by admin
    },
  },
  {
    timestamps: true,
  }
);

// Unique compound index so a jury member can only evaluate a project once
EvaluationSchema.index({ project: 1, jury: 1 }, { unique: true });

// Pre-validate hook to calculate totalMarks
EvaluationSchema.pre("validate", function () {
  if (this.scores && this.scores.length > 0) {
    this.totalMarks = this.scores.reduce((sum, s) => sum + (Number(s.score) || 0), 0);
  } else {
    this.totalMarks =
      (this.innovation || 0) +
      (this.technicalKnowledge || 0) +
      (this.presentation || 0) +
      (this.practicalImplementation || 0) +
      (this.socialImpact || 0);
  }
});

module.exports = mongoose.model("Evaluation", EvaluationSchema);
