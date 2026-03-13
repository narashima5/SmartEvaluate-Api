const xlsx = require("xlsx");
const QRCode = require("qrcode");
const fs = require("fs");
const path = require("path");

async function generateQRCodes() {
  const outputDir = path.join(__dirname, "qrcodes");
  if (fs.existsSync(outputDir)) {
    fs.rmSync(outputDir, { recursive: true, force: true });
  }
  fs.mkdirSync(outputDir, { recursive: true });

  // Read Excel File
  const workbook = xlsx.readFile(
    path.join(__dirname, "COT Participants Data.xlsx"),
  );
  const sheetName = workbook.SheetNames[0];
  const worksheet = workbook.Sheets[sheetName];
  const rawData = xlsx.utils.sheet_to_json(worksheet);

  // Filter out any empty rows or rows without Team Name/ID
  const data = rawData.filter((team) => team["Team Name"] || team["TeamID"]);

  console.log(`Found ${data.length} teams. Generating QR codes...`);

  for (const team of data) {
    const teamName = team["Team Name"] || "Unknown_Team";
    team.name = teamName; // Assign .name property to pass server.js validation
    const safeName = teamName.replace(/[^a-z0-9]/gi, "_").toLowerCase();

    console.log(`Processing QR code for ${teamName}...`);

    // Minified data representation for cleaner QR Code scanning
    // ParticipantLog.tsx relies on Ticket ID, Order ID to infer final T-XXXX ID
    // The less data here, the easier it is for standard webcams to scan.
    const finalId = String(
      team["TeamID"] ||
        team["Team ID"] ||
        `T-${Math.floor(1000 + Math.random() * 9000)}`,
    );
    team.id = finalId;

    // Generate QR Code File
    const qrData = JSON.stringify(team);
    const outputPath = path.join(outputDir, `${finalId}_qr.png`);

    await QRCode.toFile(outputPath, qrData, {
      color: { dark: "#000000", light: "#ffffff" },
      width: 500, // Reasonable width
      errorCorrectionLevel: "L", // Keep density low for scanning
      margin: 2,
    });
  }

  console.log(
    "All QR codes generated successfully in SmartEvaluate-Api/qrcodes directory!",
  );
}

generateQRCodes().catch((err) => console.error(err));
