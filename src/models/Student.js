const mongoose = require("../config/db");

const StudentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    gender: {
      type: String,
      enum: ["Male", "Female", "Other"],
      required: true,
    },
    dob: {
      type: Date,
      required: true,
    },
    class: {
      type: String,
      required: true,
      trim: true,
    },
    section: {
      type: String,
      required: true,
      trim: true,
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      required: true,
    },
    event: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Event",
      required: true,
    },
    principalName: {
      type: String,
      required: true,
      trim: true,
    },
    inChargeName: {
      type: String,
      required: true,
      trim: true,
    },
    teacherName: {
      type: String,
      required: true,
      trim: true,
    },
    emergencyContact: {
      type: String,
      required: true,
      trim: true,
    },
    phone: {
      type: String,
      required: true,
      trim: true,
    },
    category: {
      type: String,
      enum: ["Visitor", "Project Presenter"],
      required: true,
    },
    registrationNumber: {
      type: String,
      required: true,
      unique: true,
    },
    ticketGenerated: {
      type: Boolean,
      default: false,
    },
    checkedIn: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Pre-save validation/hook to generate registrationNumber if not set
StudentSchema.pre("validate", async function () {
  if (!this.registrationNumber) {
    const year = new Date().getFullYear();
    const count = await mongoose.model("Student").countDocuments();
    // Unique pad count
    const padStr = String(count + 1).padStart(4, "0");
    this.registrationNumber = `REG-${year}-${padStr}`;
  }
});

module.exports = mongoose.model("Student", StudentSchema);
