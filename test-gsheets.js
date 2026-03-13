const { GoogleSpreadsheet } = require("google-spreadsheet");
const { JWT } = require("google-auth-library");

const SPREADSHEET_ID = "1GEp0KZ9IIppLnr49RTJozb_5g2G-okp-d1Wujs3N1z0";
const creds = require("./smartevaluate-490108-af95ba96ca71.json");

async function test() {
  try {
    const auth = new JWT({
      email: creds.client_email,
      key: creds.private_key,
      scopes: ["https://www.googleapis.com/auth/spreadsheets"],
    });

    const doc = new GoogleSpreadsheet(SPREADSHEET_ID, auth);
    await doc.loadInfo();
    console.log("Success! Document loaded:", doc.title);

    let sheet = doc.sheetsByTitle["Teams"];
    if (!sheet) {
      console.log("Creating Teams sheet...");
      sheet = await doc.addSheet({
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
        title: "Teams",
      });
    }
    console.log("Sheet accessible");
    const rows = await sheet.getRows();
    console.log("Current rows:", rows.length);
  } catch (err) {
    console.error("Error:", err);
  }
}

test();
