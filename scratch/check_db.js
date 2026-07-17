const connectDB = require("../src/config/db");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const Student = require("../src/models/Student");
const Attendance = require("../src/models/Attendance");

async function run() {
  await connectDB();
  console.log("Connected to Firestore.");

  const attendances = await Attendance.find().populate("student");
  console.log("\nAttendance Records:");
  attendances.forEach(a => {
    console.log(`- Student: ${a.student ? a.student.name : "None"}, RegNum: ${a.student ? a.student.registrationNumber : "None"}, EntryTime: ${a.entryTime}`);
  });
}

run().catch(console.error);
