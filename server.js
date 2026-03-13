const express = require("express");
const cors = require("cors");
const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");
const fs = require("fs");
const path = require("path");

const app = express();
const PORT = process.env.PORT || 5000;

const SPREADSHEET_ID =
  process.env.GOOGLE_SPREADSHEET_ID ||
  "1GEp0KZ9IIppLnr49RTJozb_5g2G-okp-d1Wujs3N1z0";

let client_email = process.env.GOOGLE_CLIENT_EMAIL;
let private_key = process.env.GOOGLE_PRIVATE_KEY;

if (!client_email || !private_key) {
  try {
    const creds = require("./smartevaluate-490108-af95ba96ca71.json");
    client_email = creds.client_email;
    private_key = creds.private_key;
  } catch (err) {
    console.error("Warning: Google Sheets credentials not found.");
  }
}

if (private_key) {
  private_key = private_key.replace(/\\n/g, "\n");
}

const auth = new JWT({
  email: client_email,
  key: private_key,
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);

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

// Helper function to get the Teams sheet
const getTeamsSheet = async () => {
  await doc.loadInfo();
  let sheet = doc.sheetsByTitle["Teams"];
  if (!sheet) {
    sheet = await doc.addSheet({
      title: "Teams",
      headerValues: [
        "id",
        "name",
        "domain",
        "members",
        "problemStatement",
        "Team Leader Name",
        "Team Member 1 Name",
        "Team Member 2 Name",
        "Team Member 3 Name",
        "Team Member 4 Name",
        "Team Member 5 Name",
        "Team Member 6 Name",
        "location",
        "college",
        "leaderEmail",
        "leaderPhone",
        "r1_1",
        "r1_2",
        "r1_3",
        "r1_4",
        "r2_1",
        "r2_2",
        "r2_3",
        "r2_4",
        "r3_1",
        "r3_2",
        "r3_3",
        "r3_4",
        "isProblemStatementLocked",
        "isRound1Locked",
        "isRound2Locked",
        "isRound3Locked",
      ],
    });
  }
  return sheet;
};

// Helper function to read teams from Google Sheets
const readTeamsFromSheet = async () => {
  const sheet = await getTeamsSheet();
  const rows = await sheet.getRows();

  return rows.map((row) => {
    const team = row.toObject();
    return {
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
    };
  });
};

// Helper function to format team for saving
const formatTeamForSaving = (team) => {
  return {
    ...team,
    members: Array.isArray(team.members)
      ? team.members.join(",")
      : team.members,
  };
};

// GET endpoint to fetch all teams
app.get("/api/teams", async (req, res) => {
  try {
    const teams = await readTeamsFromSheet();
    res.json(teams);
  } catch (error) {
    console.error("Error reading teams:", error);
    res.status(500).json({ error: "Failed to read teams data" });
  }
});

// POST endpoint to add a new team
app.post("/api/teams", async (req, res) => {
  try {
    const newTeam = req.body;

    // Basic validation
    if (!newTeam || !newTeam.id || !newTeam.name) {
      return res
        .status(400)
        .json({ error: "Invalid team data. ID and Name are required." });
    }

    const sheet = await getTeamsSheet();
    const rows = await sheet.getRows();
    const existingRowIndex = rows.findIndex((r) => r.get("id") === newTeam.id);

    const formattedTeam = formatTeamForSaving(newTeam);

    if (existingRowIndex >= 0) {
      // Update existing team
      const row = rows[existingRowIndex];
      Object.keys(formattedTeam).forEach((key) => {
        if (formattedTeam[key] !== undefined) {
          row.assign({ [key]: formattedTeam[key] });
        }
      });
      await row.save();
    } else {
      // Add new team
      await sheet.addRow(formattedTeam);
    }

    res
      .status(201)
      .json({ message: "Team registered successfully", team: newTeam });
  } catch (error) {
    console.error("Error saving team:", error);
    res.status(500).json({ error: "Failed to save team data" });
  }
});

// DELETE endpoint to remove a team
app.delete("/api/teams/:id", async (req, res) => {
  try {
    const teamId = req.params.id;
    const sheet = await getTeamsSheet();
    const rows = await sheet.getRows();

    const rowToDelete = rows.find((r) => r.get("id") === teamId);

    if (!rowToDelete) {
      return res.status(404).json({ error: "Team not found" });
    }

    await rowToDelete.delete();
    res.status(200).json({ message: "Team deleted successfully" });
  } catch (error) {
    console.error("Error deleting team:", error);
    res.status(500).json({ error: "Failed to delete team data" });
  }
});

app.listen(PORT, () => {
  console.log(`Backend server running on http://localhost:${PORT}`);
});
