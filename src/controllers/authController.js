const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const nodemailer = require("nodemailer");
const User = require("../models/User");
const Otp = require("../models/Otp");
const AuditLog = require("../models/AuditLog");

const JWT_SECRET = process.env.JWT_SECRET || "smart-evaluate-super-secret-key-2026";
const SALT_ROUNDS = 10;

// Helper to write audit logs
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

// Helper to send OTP email
const sendOtpEmail = async (email, otp) => {
  console.log(`[OTP Verification] Generated OTP ${otp} for ${email}`);
  if (!process.env.SMTP_HOST) {
    console.log("[OTP Verification] SMTP is not configured, logged to console only.");
    return;
  }

  const transportConfig = {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === "true",
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
    connectionTimeout: 10000, // 10 seconds timeout
    greetingTimeout: 10000,
    socketTimeout: 15000,
  };

  // If host is Gmail, use nodemailer's built-in service configuration
  if (process.env.SMTP_HOST.toLowerCase().includes("gmail.com")) {
    delete transportConfig.host;
    delete transportConfig.port;
    delete transportConfig.secure;
    transportConfig.service = "gmail";
  }

  const transporter = nodemailer.createTransport(transportConfig);

  try {
    await transporter.sendMail({
      from: `"SmartEvaluate" <${process.env.SMTP_FROM || process.env.SMTP_USER || "no-reply@smartevaluate.com"}>`,
      to: email,
      subject: "SmartEvaluate Signup Verification OTP",
      text: `Your OTP for registering on SmartEvaluate is: ${otp}. It is valid for 10 minutes.`,
      html: `<p>Your OTP for registering on SmartEvaluate is: <strong>${otp}</strong>.</p><p>It is valid for 10 minutes.</p>`,
    });
    console.log(`[OTP Verification] Email sent successfully to ${email}`);
  } catch (err) {
    console.error(`[OTP Verification] Failed to send email to ${email}:`, err.message);
  }
};

exports.login = async (req, res) => {
  try {
    const { username, usernameOrEmail, password } = req.body;
    const identifier = username || usernameOrEmail;

    if (!identifier || !password) {
      return res.status(400).json({ error: "Username or Email and password are required." });
    }

    const user = await User.findOne({
      $or: [
        { username: identifier.toLowerCase() },
        { email: identifier.toLowerCase() },
      ],
    }).populate("school");
    if (!user) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const isMatch = await user.comparePassword(password);
    if (!isMatch) {
      return res.status(401).json({ error: "Invalid username or password." });
    }

    const tokenPayload = {
      userId: user._id,
      username: user.username,
      role: user.role,
      target_domain: user.target_domain,
      schoolId: user.school ? user.school._id : null,
      isApproved: user.isApproved,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "10h" });

    // Log the successful login
    await logAudit(user._id, user.username, "USER_LOGIN", { role: user.role }, req);

    res.json({
      message: "Login successful",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        target_domain: user.target_domain,
        school: user.school,
        isApproved: user.isApproved,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error during login" });
  }
};

exports.signup = async (req, res) => {
  try {
    const { role, username, email, password } = req.body;

    if (!role || !username || !email || !password) {
      return res.status(400).json({ error: "Role, username, email, and password are required." });
    }

    const validRoles = ["school_coordinator", "jury", "volunteer"];
    if (!validRoles.includes(role)) {
      return res.status(400).json({ error: "Invalid registration role selected." });
    }

    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already registered." });
    }

    // Role-specific validation
    let schoolId = null;
    if (role === "school_coordinator") {
      const {
        schoolName,
        schoolCode,
        schoolAddress,
        schoolDistrict,
        schoolState,
        schoolPincode,
        principalName,
        inChargeName,
        emergencyContact,
        coordinatorMobile,
        schoolId: existingSchoolId,
      } = req.body;

      if (existingSchoolId) {
        schoolId = existingSchoolId;
      } else {
        if (
          !schoolName ||
          !schoolAddress ||
          !schoolDistrict ||
          !schoolState ||
          !schoolPincode ||
          !principalName ||
          !inChargeName ||
          !emergencyContact ||
          !coordinatorMobile
        ) {
          return res.status(400).json({ error: "All school profile and coordinator details are required." });
        }

        const School = require("../models/School");
        const generatedCode = schoolCode && schoolCode.trim() 
          ? schoolCode.trim() 
          : "SCH-" + Date.now().toString().slice(-6) + Math.floor(10 + Math.random() * 90);

        const school = await School.create({
          name: schoolName,
          code: generatedCode,
          address: schoolAddress,
          district: schoolDistrict,
          state: schoolState,
          pincode: schoolPincode,
          principalName,
          inChargeName,
          emergencyContact,
          coordinatorMobile,
        });
        schoolId = school._id;
      }
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    // Jury and Volunteers start as unapproved (false), coordinators are approved immediately (true)
    const isApproved = role !== "jury" && role !== "volunteer";

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash,
      role,
      school: schoolId,
      isApproved,
    });

    // Generate JWT token
    const tokenPayload = {
      userId: user._id,
      username: user.username,
      role: user.role,
      schoolId: schoolId,
      isApproved,
    };
    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "10h" });

    await logAudit(user._id, user.username, "USER_SIGNUP", { role: user.role }, req);

    res.status(201).json({
      message: isApproved ? "Registration successful." : "Registration successful. Waiting for admin approval.",
      token,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        school: schoolId,
        isApproved,
      },
    });
  } catch (error) {
    console.error("Signup Error:", error);
    res.status(500).json({ error: "Internal server error during signup" });
  }
};

exports.verifyOtp = async (req, res) => {
  return res.status(400).json({ error: "OTP verification is deprecated." });
};

exports.registerCoordinator = async (req, res) => {
  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return res.status(400).json({ error: "Username, email, and password are required." });
    }

    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already registered." });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash,
      role: "school_coordinator",
      isApproved: true,
    });

    await logAudit(user._id, user.username, "COORDINATOR_SIGNUP", { email: user.email }, req);

    res.status(201).json({
      message: "School coordinator registered successfully.",
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        isApproved: user.isApproved,
      },
    });
  } catch (error) {
    console.error("Coordinator Registration Error:", error);
    res.status(500).json({ error: "Internal server error during registration" });
  }
};

exports.createUser = async (req, res) => {
  try {
    const { username, email, password, role, target_domain, schoolId } = req.body;

    if (!username || !email || !password || !role) {
      return res.status(400).json({ error: "Username, email, password, and role are required." });
    }

    const existingUser = await User.findOne({
      $or: [{ username: username.toLowerCase() }, { email: email.toLowerCase() }],
    });

    if (existingUser) {
      return res.status(400).json({ error: "Username or Email already exists." });
    }

    const password_hash = await bcrypt.hash(password, SALT_ROUNDS);

    const user = await User.create({
      username: username.toLowerCase(),
      email: email.toLowerCase(),
      password_hash,
      role,
      target_domain: role === "jury" ? target_domain : null,
      school: role === "school_coordinator" ? schoolId : null,
      isApproved: true, // Created directly by admin -> approved immediately
    });

    await logAudit(
      req.user._id,
      req.user.username,
      "USER_CREATE",
      { createdUser: user.username, role: user.role },
      req
    );

    res.status(201).json({
      message: `${role} created successfully.`,
      user: {
        id: user._id,
        username: user.username,
        email: user.email,
        role: user.role,
        target_domain: user.target_domain,
        isApproved: user.isApproved,
      },
    });
  } catch (error) {
    console.error("User Creation Error:", error);
    res.status(500).json({ error: "Internal server error during user creation" });
  }
};

exports.getMe = async (req, res) => {
  try {
    res.json({
      user: {
        id: req.user._id,
        username: req.user.username,
        email: req.user.email,
        role: req.user.role,
        target_domain: req.user.target_domain,
        school: req.user.school,
        isApproved: req.user.isApproved,
      },
    });
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user context" });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const { userId, newPassword } = req.body;

    if (!userId || !newPassword) {
      return res.status(400).json({ error: "User ID and new password are required." });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    const password_hash = await bcrypt.hash(newPassword, SALT_ROUNDS);
    user.password_hash = password_hash;
    await user.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "PASSWORD_RESET",
      { resetTarget: user.username },
      req
    );

    res.json({ message: `Password for ${user.username} has been reset successfully.` });
  } catch (error) {
    console.error("Password Reset Error:", error);
    res.status(500).json({ error: "Failed to reset password" });
  }
};

exports.getUsers = async (req, res) => {
  try {
    const users = await User.find({}, "-password_hash").populate("school");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to list users" });
  }
};

exports.deleteUser = async (req, res) => {
  try {
    const { id } = req.params;
    if (id === req.user._id.toString()) {
      return res.status(400).json({ error: "You cannot delete your own account." });
    }

    const user = await User.findByIdAndDelete(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }

    await logAudit(
      req.user._id,
      req.user.username,
      "USER_DELETE",
      { deletedTarget: user.username },
      req
    );

    res.json({ message: "User deleted successfully." });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete user." });
  }
};

exports.getPendingApprovals = async (req, res) => {
  try {
    const users = await User.find({ isApproved: false }, "-password_hash").populate("school");
    res.json(users);
  } catch (error) {
    res.status(500).json({ error: "Failed to list pending approvals." });
  }
};

exports.approveUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    user.isApproved = true;
    await user.save();

    await logAudit(
      req.user._id,
      req.user.username,
      "USER_APPROVAL",
      { approvedUser: user.username, role: user.role },
      req
    );

    res.json({ message: `User ${user.username} approved successfully.` });
  } catch (error) {
    res.status(500).json({ error: "Failed to approve user." });
  }
};

exports.rejectUser = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);
    if (!user) {
      return res.status(404).json({ error: "User not found." });
    }
    
    const username = user.username;
    const role = user.role;

    // Delete the user from the database
    await User.findByIdAndDelete(id);

    await logAudit(
      req.user._id,
      req.user.username,
      "USER_REJECTION",
      { rejectedUser: username, role: role },
      req
    );

    res.json({ message: `User ${username} registration rejected and removed successfully.` });
  } catch (error) {
    console.error("Reject User Error:", error);
    res.status(500).json({ error: "Failed to reject user." });
  }
};
