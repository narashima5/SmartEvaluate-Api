const mongoose = require("../config/db");

const SchoolSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    code: {
      type: String,
      required: false,
      unique: true,
      trim: true,
    },
    address: {
      type: String,
      required: true,
    },
    district: {
      type: String,
      required: true,
      trim: true,
    },
    state: {
      type: String,
      required: true,
      trim: true,
    },
    pincode: {
      type: String,
      required: true,
      trim: true,
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
    coordinatorEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
    },
    coordinatorMobile: {
      type: String,
      required: true,
      trim: true,
    },
    teachersCount: {
      type: Number,
      required: true,
      default: 0,
    },
    teacherNames: {
      type: [String],
      default: [],
    },
    emergencyContact: {
      type: String,
      required: true,
      trim: true,
    },
  },
  {
    timestamps: true,
  }
);

module.exports = mongoose.model("School", SchoolSchema);
