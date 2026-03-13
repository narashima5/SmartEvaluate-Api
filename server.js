const express = require("express");
const cors = require("cors");
const xlsx = require("xlsx");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;
const EXCEL_FILE = path.join(__dirname, "teams.xlsx");

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

// Helper function to read teams from Excel
const readTeamsFromExcel = () => {
  if (!fs.existsSync(EXCEL_FILE)) {
    return [];
  }
  const workbook = xlsx.readFile(EXCEL_FILE);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  const data = xlsx.utils.sheet_to_json(sheet);

  // Parse strings back to arrays/objects where necessary
  return data.map((team) => ({
    ...team,
    members: team.members ? team.members.split(",") : [],
    r1_1: team.r1_1 ? parseInt(team.r1_1, 10) : undefined,
    r1_2: team.r1_2 ? parseInt(team.r1_2, 10) : undefined,
    r1_3: team.r1_3 ? parseInt(team.r1_3, 10) : undefined,
    r1_4: team.r1_4 ? parseInt(team.r1_4, 10) : undefined,
    r2_1: team.r2_1 ? parseInt(team.r2_1, 10) : undefined,
    r2_2: team.r2_2 ? parseInt(team.r2_2, 10) : undefined,
    r2_3: team.r2_3 ? parseInt(team.r2_3, 10) : undefined,
    r2_4: team.r2_4 ? parseInt(team.r2_4, 10) : undefined,
    r3_1: team.r3_1 ? parseInt(team.r3_1, 10) : undefined,
    r3_2: team.r3_2 ? parseInt(team.r3_2, 10) : undefined,
    r3_3: team.r3_3 ? parseInt(team.r3_3, 10) : undefined,
    r3_4: team.r3_4 ? parseInt(team.r3_4, 10) : undefined,
    isProblemStatementLocked:
      team.isProblemStatementLocked === "true" ||
      team.isProblemStatementLocked === true,
    isRound1Locked:
      team.isRound1Locked === "true" || team.isRound1Locked === true,
    isRound2Locked:
      team.isRound2Locked === "true" || team.isRound2Locked === true,
    isRound3Locked:
      team.isRound3Locked === "true" || team.isRound3Locked === true,
  }));
};

// Helper function to save teams to Excel
const saveTeamsToExcel = (teams) => {
  // Format complex objects before saving
  const formattedTeams = teams.map((team) => ({
    ...team,
    members: Array.isArray(team.members)
      ? team.members.join(",")
      : team.members,
  }));

  const workbook = xlsx.utils.book_new();
  const worksheet = xlsx.utils.json_to_sheet(formattedTeams);
  xlsx.utils.book_append_sheet(workbook, worksheet, "Teams");
  xlsx.writeFile(workbook, EXCEL_FILE);
};

// GET endpoint to fetch all teams
app.get("/api/teams", (req, res) => {
  try {
    const teams = readTeamsFromExcel();
    res.json(teams);
  } catch (error) {
    console.error("Error reading teams:", error);
    res.status(500).json({ error: "Failed to read teams data" });
  }
});

// POST endpoint to add a new team
app.post("/api/teams", (req, res) => {
  try {
    const newTeam = req.body;

    // Basic validation
    if (!newTeam || !newTeam.id || !newTeam.name) {
      return res
        .status(400)
        .json({ error: "Invalid team data. ID and Name are required." });
    }

    let teams = readTeamsFromExcel();

    // Check if team already exists
    const existingIndex = teams.findIndex((t) => t.id === newTeam.id);

    if (existingIndex >= 0) {
      // Update existing team
      teams[existingIndex] = { ...teams[existingIndex], ...newTeam };
    } else {
      // Add new team
      teams.push(newTeam);
    }

    saveTeamsToExcel(teams);

    res
      .status(201)
      .json({ message: "Team registered successfully", team: newTeam });
  } catch (error) {
    console.error("Error saving team:", error);
    res.status(500).json({ error: "Failed to save team data" });
  }
});

// DELETE endpoint to remove a team
app.delete("/api/teams/:id", (req, res) => {
  try {
    const teamId = req.params.id;
    let teams = readTeamsFromExcel();

    const initialLength = teams.length;
    teams = teams.filter((t) => t.id !== teamId);

    if (teams.length === initialLength) {
      return res.status(404).json({ error: "Team not found" });
    }

    saveTeamsToExcel(teams);
    res.status(200).json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ error: "Failed to delete team data" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
