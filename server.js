require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET =
  process.env.JWT_SECRET || "smart-evaluate-super-secret-key-2024";

// PostgreSQL Connection Pool
const pool = new Pool({
  host:
    process.env.DB_HOST || "event-db.c3m8yqwqwxm9.eu-north-1.rds.amazonaws.com",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "event-db",
  user: process.env.DB_USER || "narashima",
  password: process.env.DB_PASS || process.env.DB_PASSWORD || "vlnarashima9345",
  ssl: {
    rejectUnauthorized: false,
  },
});

app.use(
  cors({
    origin: [
      "https://smart-evaluate-ui.vercel.app",
      "http://localhost:5173",
      "http://localhost:3000",
    ],
    methods: ["GET", "POST", "PUT", "DELETE"],
    credentials: true,
  }),
);
app.use(express.json());

// Initialize Database Table
const initDB = async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS teams (
        id VARCHAR(255) PRIMARY KEY,
        name VARCHAR(255),
        domain VARCHAR(255),
        members TEXT,
        "problemStatement" TEXT,
        "Team Leader Name" VARCHAR(255),
        "Team Member 1 Name" VARCHAR(255),
        "Team Member 2 Name" VARCHAR(255),
        "Team Member 3 Name" VARCHAR(255),
        "Team Member 4 Name" VARCHAR(255),
        "Team Member 5 Name" VARCHAR(255),
        "Team Member 6 Name" VARCHAR(255),
        location VARCHAR(255),
        college VARCHAR(255),
        "leaderEmail" VARCHAR(255),
        "leaderPhone" VARCHAR(255),
        r1_1 INTEGER, r1_2 INTEGER, r1_3 INTEGER, r1_4 INTEGER,
        r2_1 INTEGER, r2_2 INTEGER, r2_3 INTEGER, r2_4 INTEGER,
        r3_1 INTEGER, r3_2 INTEGER, r3_3 INTEGER, r3_4 INTEGER,
        "isProblemStatementLocked" BOOLEAN DEFAULT FALSE,
        "isRound1Locked" BOOLEAN DEFAULT FALSE,
        "isRound2Locked" BOOLEAN DEFAULT FALSE,
        "isRound3Locked" BOOLEAN DEFAULT FALSE
      );
      
      CREATE TABLE IF NOT EXISTS users (
        id SERIAL PRIMARY KEY,
        username VARCHAR(255) UNIQUE NOT NULL,
        password_hash VARCHAR(255) NOT NULL,
        role VARCHAR(50) NOT NULL,
        target_domain VARCHAR(255)
      );
    `);
    console.log("Database tables verified/created successfully.");

    // Seed initial users if none exist
    const { rows } = await pool.query("SELECT COUNT(*) FROM users");
    if (parseInt(rows[0].count, 10) === 0) {
      console.log("Seeding initial users...");
      const saltRounds = 10;
      const initialUsers = [
        {
          username: "healthcare",
          password: "health@123",
          role: "jury",
          target_domain: "Healthcare Technology",
        },
        {
          username: "genai",
          password: "ai@123",
          role: "jury",
          target_domain: "AI / Generative AI",
        },
        {
          username: "open",
          password: "open@123",
          role: "jury",
          target_domain: "Open Innovation",
        },
        {
          username: "cybersecurity",
          password: "cyber@123",
          role: "jury",
          target_domain: "Cybersecurity",
        },
        {
          username: "disaster",
          password: "disaster@123",
          role: "jury",
          target_domain: "Disaster Prediction & Response",
        },
        {
          username: "evs",
          password: "evs@123",
          role: "jury",
          target_domain: "Climate & Environmental Intelligence",
        },
        {
          username: "iot",
          password: "iot@123",
          role: "jury",
          target_domain: "IoT & Smart Cities",
        },
        {
          username: "admin",
          password: "admin@123",
          role: "admin",
          target_domain: "All",
        },
      ];

      for (const user of initialUsers) {
        const hash = await bcrypt.hash(user.password, saltRounds);
        await pool.query(
          "INSERT INTO users (username, password_hash, role, target_domain) VALUES ($1, $2, $3, $4)",
          [user.username, hash, user.role, user.target_domain],
        );
      }
      console.log("Initial users seeded successfully.");
    }
  } catch (err) {
    console.error("Error initializing database tables:", err);
  }
};

initDB();

// -----------------------------------------------------------------------------------------
// JWT Authentication Middleware
// -----------------------------------------------------------------------------------------
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers["authorization"];
  const token = authHeader && authHeader.split(" ")[1];

  if (!token)
    return res.status(401).json({ error: "Access denied. No token provided." });

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) return res.status(403).json({ error: "Invalid token." });
    req.user = user;
    next();
  });
};

// -----------------------------------------------------------------------------------------
// Authentication Endpoints
// -----------------------------------------------------------------------------------------

// POST endpoint to handle user login
app.post("/api/login", async (req, res) => {
  try {
    const { domain, password } = req.body;

    if (!domain || !password) {
      return res
        .status(400)
        .json({ error: "Domain username and password are required." });
    }

    // Fetch user
    const result = await pool.query("SELECT * FROM users WHERE username = $1", [
      domain.toLowerCase(),
    ]);

    if (result.rows.length === 0) {
      return res.status(401).json({ error: "Invalid domain or password." });
    }

    const user = result.rows[0];

    // Verify Password
    const isPasswordValid = await bcrypt.compare(password, user.password_hash);
    if (!isPasswordValid) {
      return res.status(401).json({ error: "Invalid domain or password." });
    }

    // Generate JWT token containing the targeted domain context
    const tokenPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      target_domain: user.target_domain,
    };

    const token = jwt.sign(tokenPayload, JWT_SECRET, { expiresIn: "10h" });

    res.json({
      message: "Login successful",
      token,
      user: {
        username: user.username,
        role: user.role,
        target_domain: user.target_domain,
      },
    });
  } catch (error) {
    console.error("Login Error:", error);
    res.status(500).json({ error: "Internal server error during login" });
  }
});

// Helper function to format team for frontend consumption
const formatTeamFromDB = (team) => {
  return {
    ...team,
    members: team.members ? team.members.split(",") : [],
    isProblemStatementLocked: !!team.isProblemStatementLocked,
    isRound1Locked: !!team.isRound1Locked,
    isRound2Locked: !!team.isRound2Locked,
    isRound3Locked: !!team.isRound3Locked,
  };
};

// GET endpoint to fetch all teams
app.get("/api/teams", authenticateToken, async (req, res) => {
  try {
    let query = "SELECT * FROM teams";
    let values = [];

    // Filter teams specifically for non-admin users
    if (req.user.role !== "admin") {
      query += " WHERE domain = $1";
      values.push(req.user.target_domain);
    }

    const result = await pool.query(query, values);
    const teams = result.rows.map(formatTeamFromDB);
    res.json(teams);
  } catch (error) {
    console.error("Error reading teams from DB:", error);
    res.status(500).json({ error: "Failed to read teams data" });
  }
});

// POST endpoint to add or update a team
app.post("/api/teams", authenticateToken, async (req, res) => {
  try {
    const newTeam = req.body;

    // Check optional access constraints on domains creating teams outside their scope
    if (
      req.user.role !== "admin" &&
      (newTeam.domain || newTeam.Domain) !== req.user.target_domain
    ) {
      return res.status(403).json({
        error:
          "Access denied. Cannot create/update a team outside your assigned domain.",
      });
    }

    // Basic validation
    if (!newTeam || !newTeam.id || !newTeam.name) {
      return res
        .status(400)
        .json({ error: "Invalid team data. ID and Name are required." });
    }

    const membersStr = Array.isArray(newTeam.members)
      ? newTeam.members.join(",")
      : newTeam.members || "";

    const query = `
      INSERT INTO teams (
        id, name, domain, members, "problemStatement",
        "Team Leader Name", "Team Member 1 Name", "Team Member 2 Name",
        "Team Member 3 Name", "Team Member 4 Name", "Team Member 5 Name", "Team Member 6 Name",
        location, college, "leaderEmail", "leaderPhone",
        r1_1, r1_2, r1_3, r1_4,
        r2_1, r2_2, r2_3, r2_4,
        r3_1, r3_2, r3_3, r3_4,
        "isProblemStatementLocked", "isRound1Locked", "isRound2Locked", "isRound3Locked"
      ) VALUES (
        $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16,
        $17, $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28,
        $29, $30, $31, $32
      )
      ON CONFLICT (id) DO UPDATE SET
        name = EXCLUDED.name,
        domain = EXCLUDED.domain,
        members = EXCLUDED.members,
        "problemStatement" = EXCLUDED."problemStatement",
        "Team Leader Name" = EXCLUDED."Team Leader Name",
        "Team Member 1 Name" = EXCLUDED."Team Member 1 Name",
        "Team Member 2 Name" = EXCLUDED."Team Member 2 Name",
        "Team Member 3 Name" = EXCLUDED."Team Member 3 Name",
        "Team Member 4 Name" = EXCLUDED."Team Member 4 Name",
        "Team Member 5 Name" = EXCLUDED."Team Member 5 Name",
        "Team Member 6 Name" = EXCLUDED."Team Member 6 Name",
        location = EXCLUDED.location,
        college = EXCLUDED.college,
        "leaderEmail" = EXCLUDED."leaderEmail",
        "leaderPhone" = EXCLUDED."leaderPhone",
        r1_1 = EXCLUDED.r1_1, r1_2 = EXCLUDED.r1_2, r1_3 = EXCLUDED.r1_3, r1_4 = EXCLUDED.r1_4,
        r2_1 = EXCLUDED.r2_1, r2_2 = EXCLUDED.r2_2, r2_3 = EXCLUDED.r2_3, r2_4 = EXCLUDED.r2_4,
        r3_1 = EXCLUDED.r3_1, r3_2 = EXCLUDED.r3_2, r3_3 = EXCLUDED.r3_3, r3_4 = EXCLUDED.r3_4,
        "isProblemStatementLocked" = EXCLUDED."isProblemStatementLocked",
        "isRound1Locked" = EXCLUDED."isRound1Locked",
        "isRound2Locked" = EXCLUDED."isRound2Locked",
        "isRound3Locked" = EXCLUDED."isRound3Locked"
      RETURNING *;
    `;

    const values = [
      newTeam.id,
      newTeam.name || newTeam["Team Name"],
      newTeam.domain || newTeam.Domain,
      membersStr,
      newTeam.problemStatement,
      newTeam["Team Leader Name"],
      newTeam["Team Member 1 Name"],
      newTeam["Team Member 2 Name"],
      newTeam["Team Member 3 Name"],
      newTeam["Team Member 4 Name"],
      newTeam["Team Member 5 Name"],
      newTeam["Team Member 6 Name"],
      newTeam.location,
      newTeam.college || newTeam.Department,
      newTeam.leaderEmail || newTeam.Email,
      newTeam.leaderPhone || newTeam["Phone Number"],
      newTeam.r1_1 || null,
      newTeam.r1_2 || null,
      newTeam.r1_3 || null,
      newTeam.r1_4 || null,
      newTeam.r2_1 || null,
      newTeam.r2_2 || null,
      newTeam.r2_3 || null,
      newTeam.r2_4 || null,
      newTeam.r3_1 || null,
      newTeam.r3_2 || null,
      newTeam.r3_3 || null,
      newTeam.r3_4 || null,
      newTeam.isProblemStatementLocked === true ||
        newTeam.isProblemStatementLocked === "true",
      newTeam.isRound1Locked === true || newTeam.isRound1Locked === "true",
      newTeam.isRound2Locked === true || newTeam.isRound2Locked === "true",
      newTeam.isRound3Locked === true || newTeam.isRound3Locked === "true",
    ];

    await pool.query(query, values);

    res
      .status(201)
      .json({ message: "Team registered successfully", team: newTeam });
  } catch (error) {
    console.error("Error saving team to DB:", error);
    res.status(500).json({ error: "Failed to save team data" });
  }
});

// DELETE endpoint to remove a team
app.delete("/api/teams/:id", authenticateToken, async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      return res.status(403).json({ error: "Access denied. Admin only." });
    }

    const teamId = req.params.id;

    const result = await pool.query(
      "DELETE FROM teams WHERE id = $1 RETURNING *",
      [teamId],
    );

    if (result.rowCount === 0) {
      return res.status(404).json({ error: "Team not found" });
    }

    res.status(200).json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team from DB:", error);
    res.status(500).json({ error: "Failed to delete team data" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
