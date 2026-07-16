const mongoose = require("../config/db");
const bcrypt = require("bcrypt");

const UserSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
    },
    password_hash: {
      type: String,
      required: true,
    },
    role: {
      type: String,
      enum: ["super_admin", "school_coordinator", "volunteer", "jury", "event_coordinator"],
      required: true,
    },
    target_domain: {
      type: String,
      default: null, // Used specifically for Jury members to filter assigned domain
    },
    school: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "School",
      default: null, // Reference to school for School Coordinators
    },
    isApproved: {
      type: Boolean,
      default: true,
    },
  },
  {
    timestamps: true,
  }
);

// Method to verify password
UserSchema.methods.comparePassword = async function (candidatePassword) {
  return bcrypt.compare(candidatePassword, this.password_hash);
};

module.exports = mongoose.model("User", UserSchema);
