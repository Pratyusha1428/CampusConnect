const mongoose = require("mongoose");
const crypto = require("crypto");

const id = () => crypto.randomUUID();

const projectSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  title: { type: String, required: true, maxlength: 120 },
  description: { type: String, required: true, maxlength: 1000 },
  technologies: { type: String, default: "", maxlength: 300 },
  url: { type: String, default: "", maxlength: 500 }
}, { versionKey: false });

const certificationSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  name: { type: String, required: true, maxlength: 150 },
  issuer: { type: String, required: true, maxlength: 150 },
  issueDate: { type: String, default: "", maxlength: 30 },
  credentialUrl: { type: String, default: "", maxlength: 500 }
}, { versionKey: false });

const userSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  name: { type: String, required: true, maxlength: 100 },
  email: { type: String, required: true, lowercase: true, unique: true, index: true },
  salt: { type: String, required: true },
  passwordHash: { type: String, required: true },
  role: { type: String, enum: ["student", "admin"], default: "student" },
  profile: {
    name: { type: String, default: "" },
    email: { type: String, default: "" },
    course: { type: String, default: "" },
    college: { type: String, default: "" },
    skills: { type: String, default: "" },
    bio: { type: String, default: "", maxlength: 1000 },
    projects: { type: [projectSchema], default: [] },
    certifications: { type: [certificationSchema], default: [] }
  },
  resume: {
    filename: String,
    originalName: String,
    uploadedAt: Date
  }
}, { versionKey: false });

const opportunitySchema = new mongoose.Schema({
  _id: { type: String, default: id },
  title: { type: String, required: true, maxlength: 150 },
  company: { type: String, required: true, maxlength: 120 },
  type: { type: String, enum: ["Internship", "Job"], required: true },
  location: { type: String, required: true, maxlength: 120 },
  stipend: { type: String, default: "", maxlength: 80 },
  skills: { type: [String], default: [] },
  description: { type: String, required: true, maxlength: 2000 }
}, { versionKey: false });

const savedSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  userId: { type: String, ref: "User", required: true },
  opportunityId: { type: String, ref: "Opportunity", required: true }
}, { versionKey: false });
savedSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });

const applicationSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  userId: { type: String, ref: "User", required: true },
  opportunityId: { type: String, ref: "Opportunity", required: true },
  status: {
    type: String,
    enum: ["Under Review", "Shortlisted", "Interview", "Rejected"],
    default: "Under Review"
  },
  appliedAt: { type: Date, default: Date.now }
}, { versionKey: false });
applicationSchema.index({ userId: 1, opportunityId: 1 }, { unique: true });

const noticeSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  title: { type: String, required: true, maxlength: 150 },
  content: { type: String, required: true, maxlength: 3000 },
  category: { type: String, default: "General", maxlength: 40 },
  publishedAt: { type: Date, default: Date.now }
}, { versionKey: false });

const eventSchema = new mongoose.Schema({
  _id: { type: String, default: id },
  title: { type: String, required: true, maxlength: 150 },
  description: { type: String, required: true, maxlength: 2000 },
  eventDate: { type: String, required: true },
  location: { type: String, required: true, maxlength: 150 },
  registrationUrl: { type: String, default: "", maxlength: 500 }
}, { versionKey: false });

module.exports = {
  User: mongoose.models.User || mongoose.model("User", userSchema),
  Opportunity: mongoose.models.Opportunity || mongoose.model("Opportunity", opportunitySchema),
  Saved: mongoose.models.Saved || mongoose.model("Saved", savedSchema),
  Application: mongoose.models.Application || mongoose.model("Application", applicationSchema),
  Notice: mongoose.models.Notice || mongoose.model("Notice", noticeSchema),
  Event: mongoose.models.Event || mongoose.model("Event", eventSchema)
};
