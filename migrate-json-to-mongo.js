require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { User, Session, Opportunity, Saved, Application, Notice, Event } = require("./models");

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Configure it in your .env file.");
  const source = path.join(__dirname, "data", "db.json");
  if (!fs.existsSync(source)) throw new Error("The legacy data/db.json file was not found.");
  const data = JSON.parse(fs.readFileSync(source, "utf8"));

  await mongoose.connect(process.env.MONGODB_URI);
  const models = [User, Session, Opportunity, Saved, Application, Notice, Event];
  const counts = await Promise.all(models.map(model => model.estimatedDocumentCount()));
  if (counts.some(count => count > 0)) throw new Error("Migration stopped: the target database already contains CampusConnect records.");

  let restoredResumeFiles = 0;
  let missingResumeFiles = 0;
  const users = (data.users || []).map(user => {
    const resume = data.resumes?.[user.id];
    let migratedResume;
    if (resume) {
      migratedResume = { ...resume };
      if (resume.filename) {
        const resumePath = path.join(__dirname, "uploads", path.basename(resume.filename));
        if (fs.existsSync(resumePath)) {
          migratedResume.data = fs.readFileSync(resumePath);
          migratedResume.contentType = "application/octet-stream";
          migratedResume.size = migratedResume.data.length;
          restoredResumeFiles += 1;
        } else {
          missingResumeFiles += 1;
        }
      }
    }
    return {
      ...user,
      _id: user.id,
      role: "student",
      profile: data.profiles?.[user.id] || { name: user.name, email: user.email, course: "", college: "", skills: "" },
      resume: migratedResume
    };
  });
  const opportunities = (data.opportunities || []).map(item => ({ ...item, _id: item.id }));
  const saved = (data.saved || []).map(item => ({ ...item, _id: crypto.randomUUID() }));
  const applications = (data.applications || []).map(item => ({ ...item, _id: item.id }));

  if (users.length) await User.insertMany(users);
  if (opportunities.length) await Opportunity.insertMany(opportunities);
  if (saved.length) await Saved.insertMany(saved);
  if (applications.length) await Application.insertMany(applications);
  console.log(`Imported ${users.length} users, ${opportunities.length} opportunities, ${saved.length} saved items, and ${applications.length} applications. Restored ${restoredResumeFiles} resume files; ${missingResumeFiles} local resume files were not found.`);
}

migrate().catch(error => {
  console.error(`JSON migration failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
});
