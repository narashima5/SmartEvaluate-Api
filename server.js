require("dotenv").config();
const express = require("express");
const cors = require("cors");
const { Pool } = require("pg");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

// PostgreSQL Connection Pool
const pool = new Pool({
  host:
    process.env.DB_HOST || "event-db.c3m8yqwqwxm9.eu-north-1.rds.amazonaws.com",
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || "event-db",
  user: process.env.DB_USER || "narashima",
  password: process.env.DB_PASSWORD || "vlnarashima9345",
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
    `);
    console.log("Database table verified/created successfully.");
  } catch (err) {
    console.error("Error initializing database table:", err);
  }
};

initDB();

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
app.get("/api/teams", async (req, res) => {
  try {
    const result = await pool.query("SELECT * FROM teams");
    const teams = result.rows.map(formatTeamFromDB);
    res.json(teams);
  } catch (error) {
    console.error("Error reading teams from DB:", error);
    res.status(500).json({ error: "Failed to read teams data" });
  }
});

// POST endpoint to add or update a team
app.post("/api/teams", async (req, res) => {
  try {
    const newTeam = req.body;

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
app.delete("/api/teams/:id", async (req, res) => {
  try {
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
