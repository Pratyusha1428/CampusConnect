require("dotenv").config();

const express = require("express");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const multer = require("multer");
const mongoose = require("mongoose");
const { User, Opportunity, Saved, Application, Notice, Event } = require("./models");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const UPLOAD_DIR = path.join(ROOT, "uploads");
fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const seedOpportunities = [
  { _id: "job-1", title: "Frontend Developer Intern", company: "TechNova", type: "Internship", location: "Remote", stipend: "₹15,000/month", skills: ["HTML", "CSS", "JavaScript"], description: "Build and improve responsive web interfaces." },
  { _id: "job-2", title: "Data Analyst Intern", company: "DataBridge", type: "Internship", location: "Remote", stipend: "₹12,000/month", skills: ["Excel", "SQL", "Python"], description: "Help analyze datasets and prepare reports." },
  { _id: "job-3", title: "Junior Web Developer", company: "BrightApps", type: "Job", location: "Hybrid", stipend: "₹3–4 LPA", skills: ["JavaScript", "HTML", "CSS"], description: "Support the development of web applications." },
  { _id: "job-4", title: "Software Engineering Intern", company: "CodeWorks", type: "Internship", location: "On-site", stipend: "₹18,000/month", skills: ["JavaScript", "Git", "Problem solving"], description: "Work with a small engineering team on product features." },
  { _id: "job-5", title: "Python Automation Intern", company: "AutomateNow", type: "Internship", location: "Remote", stipend: "₹10,000/month", skills: ["Python", "APIs", "Automation"], description: "Create scripts to reduce repetitive tasks." }
];
const sessions = new Map();
const scrypt = (password, salt) => new Promise((resolve, reject) => {
  crypto.scrypt(password, salt, 64, (error, key) => error ? reject(error) : resolve(key.toString("hex")));
});
const asyncRoute = handler => (req, res, next) => Promise.resolve(handler(req, res, next)).catch(next);
const text = (value, maxLength) => typeof value === "string" ? value.trim().slice(0, maxLength) : "";

app.use(express.json({ limit: "1mb" }));
app.use(express.urlencoded({ extended: true }));
app.use("/uploads", (req, res) => res.sendStatus(404));
app.use("/data", (req, res) => res.sendStatus(404));
app.use("/server.js", (req, res) => res.sendStatus(404));
app.use("/models.js", (req, res) => res.sendStatus(404));
app.use("/package.json", (req, res) => res.sendStatus(404));
app.use(express.static(ROOT, { index: "index.html" }));

function publicUser(user) {
  return { id: user.id || user._id, name: user.name, email: user.email, role: user.role || "student" };
}
function publicRecord(record) {
  const result = record.toObject ? record.toObject() : { ...record };
  result.id = String(result._id ?? result.id);
  delete result._id;
  return result;
}
function publicProfile(profile) {
  const result = profile.toObject ? profile.toObject() : { ...profile };
  result.projects = (result.projects || []).map(publicRecord);
  result.certifications = (result.certifications || []).map(publicRecord);
  return result;
}
function auth(req, res, next) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const userId = sessions.get(token);
  if (!userId) return res.status(401).json({ error: "Please log in to continue." });
  User.findById(userId).then(user => {
    if (!user) return res.status(401).json({ error: "Session expired. Please log in again." });
    req.user = user;
    next();
  }).catch(next);
}
function adminOnly(req, res, next) {
  if (req.user.role !== "admin") return res.status(403).json({ error: "Administrator access is required." });
  next();
}
function studentOnly(req, res, next) {
  if (req.user.role !== "student") return res.status(403).json({ error: "Student access is required." });
  next();
}
const upload = multer({
  dest: UPLOAD_DIR,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, callback) => {
    const allowed = /\.(pdf|doc|docx)$/i.test(file.originalname);
    callback(allowed ? null : new Error("Please upload a PDF, DOC, or DOCX file."), allowed);
  }
});

app.get("/api/health", (req, res) => res.json({ status: "ok", database: mongoose.connection.readyState === 1 ? "connected" : "disconnected" }));
app.post("/api/register", asyncRoute(async (req, res) => {
  const name = text(req.body.name, 100);
  const email = text(req.body.email, 254).toLowerCase();
  const password = typeof req.body.password === "string" ? req.body.password : "";
  if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6)
    return res.status(400).json({ error: "Enter a name, valid email, and password of at least 6 characters." });
  const salt = crypto.randomBytes(16).toString("hex");
  try {
    const user = await User.create({
      name, email, salt, passwordHash: await scrypt(password, salt), role: "student",
      profile: { name, email, course: "", college: "", skills: "" }
    });
    const token = crypto.randomBytes(32).toString("hex");
    sessions.set(token, user.id);
    res.status(201).json({ token, user: publicUser(user) });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "An account with this email already exists." });
    throw error;
  }
}));
app.post("/api/login", asyncRoute(async (req, res) => {
  const email = text(req.body.email, 254).toLowerCase();
  const user = await User.findOne({ email });
  if (!user) return res.status(401).json({ error: "Incorrect email or password." });
  const passwordHash = await scrypt(typeof req.body.password === "string" ? req.body.password : "", user.salt);
  const supplied = Buffer.from(passwordHash, "hex");
  const stored = Buffer.from(user.passwordHash, "hex");
  if (supplied.length !== stored.length || !crypto.timingSafeEqual(supplied, stored))
    return res.status(401).json({ error: "Incorrect email or password." });
  const requestedRole = req.body.role === "admin" ? "admin" : "student";
  if ((user.role || "student") !== requestedRole)
    return res.status(403).json({ error: requestedRole === "admin" ? "This account does not have administrator access." : "This is an administrator account. Please use administrator login." });
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, user.id);
  res.json({ token, user: publicUser(user) });
}));
app.post("/api/logout", auth, (req, res) => {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  sessions.delete(token);
  res.json({ message: "Logged out." });
});
app.get("/api/me", auth, (req, res) => res.json({ user: publicUser(req.user) }));

app.get("/api/opportunities", asyncRoute(async (req, res) => {
  const q = text(String(req.query.q || ""), 200).toLowerCase();
  const type = text(String(req.query.type || "all"), 20).toLowerCase();
  const remote = String(req.query.remote || "false") === "true";
  const opportunities = await Opportunity.find().lean();
  res.json(opportunities.filter(item => {
    const searchText = [item.title, item.company, item.location, item.stipend, ...(item.skills || [])].join(" ").toLowerCase();
    return (!q || searchText.includes(q)) && (type === "all" || item.type.toLowerCase() === type) && (!remote || item.location.toLowerCase() === "remote");
  }).map(publicRecord));
}));
app.get("/api/notices", asyncRoute(async (req, res) => {
  res.json((await Notice.find().sort({ publishedAt: -1 }).lean()).map(publicRecord));
}));
app.get("/api/events", asyncRoute(async (req, res) => {
  res.json((await Event.find().sort({ eventDate: 1 }).lean()).map(publicRecord));
}));
app.get("/api/admin/summary", auth, adminOnly, asyncRoute(async (req, res) => {
  const [students, opportunities, notices, events, applications] = await Promise.all([
    User.countDocuments({ role: "student" }), Opportunity.countDocuments(), Notice.countDocuments(), Event.countDocuments(), Application.countDocuments()
  ]);
  res.json({ students, opportunities, notices, events, applications });
}));
app.get("/api/admin/applications", auth, adminOnly, asyncRoute(async (req, res) => {
  const applications = await Application.find().sort({ appliedAt: -1 }).lean();
  const [students, opportunities] = await Promise.all([
    User.find({ _id: { $in: applications.map(application => application.userId) } })
      .select("name email profile.name profile.email profile.course profile.college")
      .lean(),
    Opportunity.find({ _id: { $in: applications.map(application => application.opportunityId) } }).lean()
  ]);
  const studentById = new Map(students.map(student => [student._id, {
    name: student.profile?.name || student.name,
    email: student.email,
    course: student.profile?.course || "",
    college: student.profile?.college || ""
  }]));
  const opportunityById = new Map(opportunities.map(opportunity => [opportunity._id, publicRecord(opportunity)]));
  res.json(applications.map(application => ({
    id: application._id,
    status: application.status,
    appliedAt: application.appliedAt,
    student: studentById.get(application.userId) || null,
    opportunity: opportunityById.get(application.opportunityId) || null
  })));
}));
app.patch("/api/admin/applications/:id/status", auth, adminOnly, asyncRoute(async (req, res) => {
  const status = text(req.body.status, 30);
  const allowedStatuses = ["Under Review", "Shortlisted", "Interview", "Rejected"];
  if (!allowedStatuses.includes(status))
    return res.status(400).json({ error: "Choose a valid application status." });
  const application = await Application.findByIdAndUpdate(
    req.params.id,
    { status },
    { new: true, runValidators: true }
  );
  if (!application) return res.status(404).json({ error: "Application not found." });
  res.json({ id: application.id, status: application.status });
}));
app.get("/api/admin/opportunities", auth, adminOnly, asyncRoute(async (req, res) => {
  res.json((await Opportunity.find().sort({ _id: -1 }).lean()).map(publicRecord));
}));
app.post("/api/admin/opportunities", auth, adminOnly, asyncRoute(async (req, res) => {
  const opportunity = {
    title: text(req.body.title, 150),
    company: text(req.body.company, 120),
    type: text(req.body.type, 20),
    location: text(req.body.location, 120),
    stipend: text(req.body.stipend, 80),
    skills: text(req.body.skills, 500).split(",").map(skill => skill.trim()).filter(Boolean).slice(0, 20),
    description: text(req.body.description, 2000)
  };
  if (opportunity.title.length < 3 || !opportunity.company || !["Internship", "Job"].includes(opportunity.type) || !opportunity.location || !opportunity.description)
    return res.status(400).json({ error: "Enter a title, company, opportunity type, location, and description." });
  const created = await Opportunity.create(opportunity);
  res.status(201).json(publicRecord(created));
}));
app.delete("/api/admin/opportunities/:id", auth, adminOnly, asyncRoute(async (req, res) => {
  const opportunity = await Opportunity.findByIdAndDelete(req.params.id);
  if (!opportunity) return res.status(404).json({ error: "Opportunity not found." });
  await Promise.all([
    Saved.deleteMany({ opportunityId: req.params.id }),
    Application.deleteMany({ opportunityId: req.params.id })
  ]);
  res.sendStatus(204);
}));
app.get("/api/admin/notices", auth, adminOnly, asyncRoute(async (req, res) => {
  res.json((await Notice.find().sort({ publishedAt: -1 }).lean()).map(publicRecord));
}));
app.post("/api/admin/notices", auth, adminOnly, asyncRoute(async (req, res) => {
  const notice = {
    title: text(req.body.title, 150),
    content: text(req.body.content, 3000),
    category: text(req.body.category, 40) || "General"
  };
  if (notice.title.length < 3 || notice.content.length < 3)
    return res.status(400).json({ error: "Enter a notice title and message." });
  res.status(201).json(publicRecord(await Notice.create(notice)));
}));
app.delete("/api/admin/notices/:id", auth, adminOnly, asyncRoute(async (req, res) => {
  const notice = await Notice.findByIdAndDelete(req.params.id);
  if (!notice) return res.status(404).json({ error: "Notice not found." });
  res.sendStatus(204);
}));
app.get("/api/admin/events", auth, adminOnly, asyncRoute(async (req, res) => {
  res.json((await Event.find().sort({ eventDate: 1 }).lean()).map(publicRecord));
}));
app.post("/api/admin/events", auth, adminOnly, asyncRoute(async (req, res) => {
  const event = {
    title: text(req.body.title, 150),
    description: text(req.body.description, 2000),
    eventDate: text(req.body.eventDate, 40),
    location: text(req.body.location, 150),
    registrationUrl: text(req.body.registrationUrl, 500)
  };
  const parsedDate = new Date(`${event.eventDate}T00:00:00Z`);
  const validDate = /^\d{4}-\d{2}-\d{2}$/.test(event.eventDate) &&
    !Number.isNaN(parsedDate.getTime()) && parsedDate.toISOString().slice(0, 10) === event.eventDate;
  if (event.title.length < 3 || event.description.length < 3 || !validDate || !event.location)
    return res.status(400).json({ error: "Enter an event title, description, valid date, and location." });
  if (event.registrationUrl) {
    try {
      const url = new URL(event.registrationUrl);
      if (!["http:", "https:"].includes(url.protocol)) throw new Error("Invalid URL protocol.");
    } catch {
      return res.status(400).json({ error: "Registration link must be a valid HTTP or HTTPS URL." });
    }
  }
  res.status(201).json(publicRecord(await Event.create(event)));
}));
app.delete("/api/admin/events/:id", auth, adminOnly, asyncRoute(async (req, res) => {
  const event = await Event.findByIdAndDelete(req.params.id);
  if (!event) return res.status(404).json({ error: "Event not found." });
  res.sendStatus(204);
}));

app.get("/api/saved", auth, studentOnly, asyncRoute(async (req, res) => {
  const saved = await Saved.find({ userId: req.user.id }).lean();
  res.json((await Opportunity.find({ _id: { $in: saved.map(item => item.opportunityId) } }).lean()).map(publicRecord));
}));
app.post("/api/saved/:id", auth, studentOnly, asyncRoute(async (req, res) => {
  if (!await Opportunity.exists({ _id: req.params.id })) return res.status(404).json({ error: "Opportunity not found." });
  const existing = await Saved.findOne({ userId: req.user.id, opportunityId: req.params.id });
  if (existing) {
    await existing.deleteOne();
    return res.json({ saved: false });
  }
  await Saved.create({ userId: req.user.id, opportunityId: req.params.id });
  res.json({ saved: true });
}));
app.get("/api/applications", auth, studentOnly, asyncRoute(async (req, res) => {
  const applications = await Application.find({ userId: req.user.id }).sort({ appliedAt: -1 }).lean();
  const opportunityIds = applications.map(item => item.opportunityId);
  const opportunities = await Opportunity.find({ _id: { $in: opportunityIds } }).lean();
  const byId = new Map(opportunities.map(item => [item._id, publicRecord(item)]));
  res.json(applications.map(item => ({ ...item, id: item._id, opportunity: byId.get(item.opportunityId) || null })));
}));
app.post("/api/applications/:id", auth, studentOnly, asyncRoute(async (req, res) => {
  if (!await Opportunity.exists({ _id: req.params.id })) return res.status(404).json({ error: "Opportunity not found." });
  try {
    const application = await Application.create({ userId: req.user.id, opportunityId: req.params.id });
    res.status(201).json({ ...application.toObject(), id: application.id });
  } catch (error) {
    if (error.code === 11000) return res.status(409).json({ error: "You have already applied to this opportunity." });
    throw error;
  }
}));
app.get("/api/profile", auth, studentOnly, (req, res) => res.json(publicProfile(req.user.profile || {
  name: req.user.name, email: req.user.email, course: "", college: "", skills: "", bio: ""
})));
app.put("/api/profile", auth, studentOnly, asyncRoute(async (req, res) => {
  req.user.profile = {
    name: text(req.body.name, 100) || req.user.name,
    email: req.user.email,
    course: text(req.body.course, 150),
    college: text(req.body.college, 200),
    skills: text(req.body.skills, 500),
    bio: text(req.body.bio, 1000),
    projects: req.user.profile.projects,
    certifications: req.user.profile.certifications
  };
  req.user.name = req.user.profile.name;
  await req.user.save();
  res.json(publicProfile(req.user.profile));
}));
function validOptionalUrl(value) {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["http:", "https:"].includes(url.protocol);
  } catch {
    return false;
  }
}
app.post("/api/profile/projects", auth, studentOnly, asyncRoute(async (req, res) => {
  const project = {
    title: text(req.body.title, 120),
    description: text(req.body.description, 1000),
    technologies: text(req.body.technologies, 300),
    url: text(req.body.url, 500)
  };
  if (project.title.length < 2 || project.description.length < 2)
    return res.status(400).json({ error: "Enter a project title and description." });
  if (!validOptionalUrl(project.url))
    return res.status(400).json({ error: "Project link must be a valid HTTP or HTTPS URL." });
  req.user.profile.projects.push(project);
  await req.user.save();
  res.status(201).json(publicRecord(req.user.profile.projects[req.user.profile.projects.length - 1]));
}));
app.delete("/api/profile/projects/:id", auth, studentOnly, asyncRoute(async (req, res) => {
  const project = req.user.profile.projects.id(req.params.id);
  if (!project) return res.status(404).json({ error: "Project not found." });
  project.deleteOne();
  await req.user.save();
  res.sendStatus(204);
}));
app.post("/api/profile/certifications", auth, studentOnly, asyncRoute(async (req, res) => {
  const certification = {
    name: text(req.body.name, 150),
    issuer: text(req.body.issuer, 150),
    issueDate: text(req.body.issueDate, 30),
    credentialUrl: text(req.body.credentialUrl, 500)
  };
  if (certification.name.length < 2 || certification.issuer.length < 2)
    return res.status(400).json({ error: "Enter the certification name and issuing organization." });
  if (!validOptionalUrl(certification.credentialUrl))
    return res.status(400).json({ error: "Credential link must be a valid HTTP or HTTPS URL." });
  req.user.profile.certifications.push(certification);
  await req.user.save();
  res.status(201).json(publicRecord(req.user.profile.certifications[req.user.profile.certifications.length - 1]));
}));
app.delete("/api/profile/certifications/:id", auth, studentOnly, asyncRoute(async (req, res) => {
  const certification = req.user.profile.certifications.id(req.params.id);
  if (!certification) return res.status(404).json({ error: "Certification not found." });
  certification.deleteOne();
  await req.user.save();
  res.sendStatus(204);
}));
app.post("/api/resume", auth, studentOnly, upload.single("resume"), asyncRoute(async (req, res) => {
  if (!req.file) return res.status(400).json({ error: "Choose a PDF, DOC, or DOCX file." });
  req.user.resume = { filename: req.file.filename, originalName: path.basename(req.file.originalname), uploadedAt: new Date() };
  await req.user.save();
  res.status(201).json(req.user.resume);
}));
app.get("/api/resume", auth, studentOnly, (req, res) => res.json(req.user.resume || null));

app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof multer.MulterError || error.message === "Please upload a PDF, DOC, or DOCX file.")
    return res.status(400).json({ error: error.message });
  if (error.name === "ValidationError") return res.status(400).json({ error: error.message });
  if (error.name === "CastError") return res.status(400).json({ error: "Invalid item identifier." });
  console.error(error);
  res.status(500).json({ error: "The server could not complete this request." });
});

async function provisionAdmin() {
  const email = text(process.env.ADMIN_EMAIL || "", 254).toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";
  if (!email && !password) {
    console.warn("Admin account is not configured. Set ADMIN_EMAIL and ADMIN_PASSWORD to enable admin login.");
    return;
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 12)
    throw new Error("Set a valid ADMIN_EMAIL and an ADMIN_PASSWORD of at least 12 characters.");
  let user = await User.findOne({ email });
  if (!user) user = new User({ name: "Placement Cell Admin", email });
  const salt = crypto.randomBytes(16).toString("hex");
  user.name = user.name || "Placement Cell Admin";
  user.role = "admin";
  user.salt = salt;
  user.passwordHash = await scrypt(password, salt);
  user.profile = { name: user.name, email, course: "", college: "", skills: "" };
  await user.save();
  console.log(`Administrator account ready for ${email}.`);
}

async function start() {
  if (!process.env.MONGODB_URI) throw new Error("MONGODB_URI is required. Configure it in your .env file.");
  await mongoose.connect(process.env.MONGODB_URI);
  await provisionAdmin();
  if (await Opportunity.estimatedDocumentCount() === 0) await Opportunity.insertMany(seedOpportunities);
  app.listen(PORT, () => console.log(`CampusConnect running at http://localhost:${PORT}`));
}

start().catch(async error => {
  console.error(`CampusConnect could not start: ${error.message}`);
  await mongoose.disconnect();
  process.exitCode = 1;
});
