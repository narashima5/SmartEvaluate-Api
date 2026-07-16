require("dotenv").config();
const mongoose = require("./src/config/db");
const bcrypt = require("bcrypt");

const User = require("./src/models/User");
const School = require("./src/models/School");
const Event = require("./src/models/Event");
const Student = require("./src/models/Student");
const Project = require("./src/models/Project");
const Attendance = require("./src/models/Attendance");
const Evaluation = require("./src/models/Evaluation");
const AuditLog = require("./src/models/AuditLog");
const Domain = require("./src/models/Domain");
const EvaluationCriteria = require("./src/models/EvaluationCriteria");

const MONGODB_URI = process.env.MONGODB_URI || "mongodb://localhost:27017/smart-evaluate";
const SALT_ROUNDS = 10;

const seedDatabase = async () => {
  try {
    console.log("Connecting to database for seeding...");
    await mongoose.connect(MONGODB_URI);
    console.log("Database connected successfully.");

    // Clear existing data
    console.log("Clearing existing collections...");
    await User.deleteMany({});
    await School.deleteMany({});
    await Event.deleteMany({});
    await Student.deleteMany({});
    await Project.deleteMany({});
    await Attendance.deleteMany({});
    await Evaluation.deleteMany({});
    await AuditLog.deleteMany({});
    await Domain.deleteMany({});
    await EvaluationCriteria.deleteMany({});
    console.log("All collections cleared.");

    // Seed Users
    console.log("Seeding admin and coordinator user accounts...");
    const adminPassword = await bcrypt.hash("admin@123", SALT_ROUNDS);

    // Super Admin
    await User.create({
      username: "admin",
      email: "admin@gmail.com",
      password_hash: adminPassword,
      role: "super_admin",
      isApproved: true,
    });

    // Event Coordinator
    await User.create({
      username: "coordinator",
      email: "event@gmail.com",
      password_hash: adminPassword,
      role: "event_coordinator",
      isApproved: true,
    });
    console.log("Admin and coordinator user accounts created.");

    // Seed Domains
    console.log("Seeding master project domains...");
    const domains = [
      "IoT & Smart Cities",
      "AI / Generative AI",
      "Climate & Environmental Intelligence",
      "Disaster Prediction & Response",
      "Cybersecurity",
      "Healthcare Technology",
      "Open Innovation",
    ];
    for (const dom of domains) {
      await Domain.create({
        name: dom,
        description: `${dom} description and research context.`,
      });
    }
    console.log("Project domains seeded.");

    // Seed Evaluation Criteria
    console.log("Seeding master evaluation criteria...");
    const criteriaList = [
      { domain: "IoT & Smart Cities", name: "Hardware Design & Sensors Integration", maxMarks: 25, description: "Quality of electronic design and sensor interface." },
      { domain: "IoT & Smart Cities", name: "Software Logic & Connectivity", maxMarks: 25, description: "Network communication protocols and logical programming." },
      { domain: "IoT & Smart Cities", name: "Problem Solving & Innovation", maxMarks: 25, description: "Novelty and efficiency of the smart city solution." },
      { domain: "IoT & Smart Cities", name: "Social Relevance & Impact", maxMarks: 25, description: "Practical applicability for cities." },
      
      { domain: "AI / Generative AI", name: "Model Accuracy & Training", maxMarks: 25, description: "Dataset choice and intelligence of the model." },
      { domain: "AI / Generative AI", name: "User Interface & Experience", maxMarks: 25, description: "How users interact with the generative features." },
      { domain: "AI / Generative AI", name: "Algorithmic Innovation", maxMarks: 25, description: "Novelty in network architecture or data usage." },
      { domain: "AI / Generative AI", name: "Ethics & Compliance", maxMarks: 25, description: "Addressing bias and security concerns." },
    ];

    // Default criteria for remaining domains
    for (const d of domains) {
      if (d !== "IoT & Smart Cities" && d !== "AI / Generative AI") {
        criteriaList.push(
          { domain: d, name: "Innovation", maxMarks: 25, description: "Originality and novelty." },
          { domain: d, name: "Technical Knowledge", maxMarks: 25, description: "Understanding of technology used." },
          { domain: d, name: "Presentation & Demo", maxMarks: 25, description: "Clarity of delivery and demo execution." },
          { domain: d, name: "Practical Implementation", maxMarks: 25, description: "Feasibility and real-world implementation." }
        );
      }
    }

    for (const crit of criteriaList) {
      await EvaluationCriteria.create(crit);
    }
    console.log("Evaluation criteria seeded.");

    console.log("\nDATABASE SEEDING COMPLETED SUCCESSFULLY.");
    process.exit(0);
  } catch (error) {
    console.error("Database Seeding Failed:", error);
    process.exit(1);
  }
};

seedDatabase();
