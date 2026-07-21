const connectDB = require("../src/config/db");
const dotenv = require("dotenv");
const path = require("path");

dotenv.config({ path: path.join(__dirname, "../.env") });

const Project = require("../src/models/Project");
const Student = require("../src/models/Student");

async function checkProjects() {
  await connectDB();
  console.log("Connected to DB.");

  const rawProjects = await Project.find();
  console.log(`Found ${rawProjects.length} raw projects.`);

  for (const p of rawProjects) {
    console.log(`\nProject ID: ${p.projectId}, Title: ${p.title}`);
    console.log(`Raw members field:`, p.members);

    if (p.members && Array.isArray(p.members)) {
      const studentDocs = [];
      for (const mId of p.members) {
        const idStr = typeof mId === "object" && mId._id ? mId._id : mId;
        const student = await Student.findById(idStr);
        if (student) {
          studentDocs.push(student.name);
        } else {
          studentDocs.push(`NOT_FOUND(${idStr})`);
        }
      }
      console.log(`Resolved member names individually:`, studentDocs);
    }
  }

  process.exit(0);
}

checkProjects().catch((err) => {
  console.error(err);
  process.exit(1);
});
