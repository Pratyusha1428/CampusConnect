require("dotenv").config();

const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mongoose = require("mongoose");
const { User, Opportunity, Saved, Application, Notice, Event } = require("./models");

async function migrate() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Configure it in your .env file.");
  const source = path.join(__dirname, "data", "db.json");
  if (!fs.existsSync(source)) throw new Error("The legacy data/db.json file was not found.");
  const data = JSON.parse(fs.readFileSync(source, "utf8"));

  await mongoose.connect(process.env.MONGODB_URI);
  const models = [User, Opportunity, Saved, Application, Notice, Event];
  const counts = await Promise.all(models.map(model => model.estimatedDocumentCount()));
  if (counts.some(count => count > 0)) throw new Error("Migration stopped: the target database already contains CampusConnect records.");

  const users = (data.users || []).map(user => ({
    ...user,
    _id: user.id,
    role: "student",
    profile: data.profiles?.[user.id] || { name: user.name, email: user.email, course: "", college: "", skills: "" },
    resume: data.resumes?.[user.id] || undefined
  }));
  const opportunities = (data.opportunities || []).map(item => ({ ...item, _id: item.id }));
  const saved = (data.saved || []).map(item => ({ ...item, _id: crypto.randomUUID() }));
  const applications = (data.applications || []).map(item => ({ ...item, _id: item.id }));

  if (users.length) await User.insertMany(users);
  if (opportunities.length) await Opportunity.insertMany(opportunities);
  if (saved.length) await Saved.insertMany(saved);
  if (applications.length) await Application.insertMany(applications);
  console.log(`Imported ${users.length} users, ${opportunities.length} opportunities, ${saved.length} saved items, and ${applications.length} applications.`);
}

migrate().catch(error => {
  console.error(`JSON migration failed: ${error.message}`);
  process.exitCode = 1;
}).finally(async () => {
  if (mongoose.connection.readyState === 1) await mongoose.disconnect();
});
