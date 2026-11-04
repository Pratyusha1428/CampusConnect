const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { once } = require("node:events");
const test = require("node:test");
const { User, Session } = require("../models");
const { app } = require("../server");

test("student signup, login, sessions, and resume storage use the API", async t => {
  const users = new Map();
  const sessions = new Map();
  const originalMethods = {
    userCreate: User.create,
    userFindOne: User.findOne,
    userFindById: User.findById,
    sessionCreate: Session.create,
    sessionFindById: Session.findById,
    sessionDeleteOne: Session.deleteOne
  };
  User.create = async record => {
    if ([...users.values()].some(user => user.email === record.email)) {
      const error = new Error("Duplicate email");
      error.code = 11000;
      throw error;
    }
    const user = {
      ...record,
      _id: crypto.randomUUID(),
      save: async function save() { users.set(this._id, this); }
    };
    user.id = user._id;
    users.set(user._id, user);
    return user;
  };
  User.findOne = async ({ email }) => [...users.values()].find(user => user.email === email) || null;
  User.findById = async id => users.get(id) || null;
  Session.create = async session => {
    sessions.set(session._id, session);
    return session;
  };
  Session.findById = async id => sessions.get(id) || null;
  Session.deleteOne = async ({ _id }) => ({ deletedCount: Number(sessions.delete(_id)) });
  const adminSalt = crypto.randomBytes(16).toString("hex");
  const admin = {
    _id: crypto.randomUUID(),
    name: "Placement Administrator",
    email: "admin@example.com",
    role: "admin",
    salt: adminSalt,
    passwordHash: crypto.scryptSync("administrator-password", adminSalt, 64).toString("hex")
  };
  admin.id = admin._id;
  users.set(admin._id, admin);

  const server = app.listen(0, "127.0.0.1");
  await once(server, "listening");
  t.after(async () => {
    await new Promise((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    User.create = originalMethods.userCreate;
    User.findOne = originalMethods.userFindOne;
    User.findById = originalMethods.userFindById;
    Session.create = originalMethods.sessionCreate;
    Session.findById = originalMethods.sessionFindById;
    Session.deleteOne = originalMethods.sessionDeleteOne;
  });

  const baseUrl = `http://127.0.0.1:${server.address().port}`;
  const sendJson = (url, body, token) => fetch(`${baseUrl}${url}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(body)
  });

  const healthResponse = await fetch(`${baseUrl}/api/health`);
  assert.equal(healthResponse.status, 503);
  assert.deepEqual(await healthResponse.json(), { status: "unavailable", database: "disconnected" });

  const signupResponse = await sendJson("/api/register", {
    name: "Test Student",
    email: "student@example.com",
    password: "student-password",
    role: "admin"
  });
  assert.equal(signupResponse.status, 201);
  const signup = await signupResponse.json();
  assert.equal(signup.user.role, "student");
  assert.equal(signup.user.email, "student@example.com");
  assert.equal(users.get(signup.user.id).profile.name, "Test Student");
  assert.equal(users.get(signup.user.id).passwordHash === "student-password", false);
  assert.equal(sessions.size, 1);
  assert.notEqual([...sessions.keys()][0], signup.token);

  const meResponse = await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${signup.token}` }
  });
  assert.equal(meResponse.status, 200);
  assert.equal((await meResponse.json()).user.id, signup.user.id);

  const loginResponse = await sendJson("/api/login", {
    email: " STUDENT@EXAMPLE.COM ",
    password: "student-password",
    role: "student"
  });
  assert.equal(loginResponse.status, 200);
  const login = await loginResponse.json();
  assert.equal(login.user.id, signup.user.id);

  assert.equal((await sendJson("/api/login", {
    email: "student@example.com",
    password: "incorrect-password",
    role: "student"
  })).status, 401);
  assert.equal((await sendJson("/api/login", {
    email: "student@example.com",
    password: "student-password",
    role: "admin"
  })).status, 403);
  const adminLogin = await sendJson("/api/login", {
    email: "admin@example.com",
    password: "administrator-password",
    role: "admin"
  });
  assert.equal(adminLogin.status, 200);
  assert.equal((await adminLogin.json()).user.role, "admin");
  assert.equal((await sendJson("/api/login", {
    email: "admin@example.com",
    password: "administrator-password",
    role: "student"
  })).status, 403);
  assert.equal((await sendJson("/api/register", {
    name: "Duplicate Student",
    email: "STUDENT@example.com",
    password: "student-password"
  })).status, 409);

  const form = new FormData();
  form.append("resume", new Blob(["test resume"], { type: "application/pdf" }), "resume.pdf");
  const uploadResponse = await fetch(`${baseUrl}/api/resume`, {
    method: "POST",
    headers: { Authorization: `Bearer ${login.token}` },
    body: form
  });
  assert.equal(uploadResponse.status, 201);
  const uploadedResume = await uploadResponse.json();
  assert.equal(uploadedResume.originalName, "resume.pdf");
  assert.equal(uploadedResume.hasFile, true);
  assert.equal(users.get(signup.user.id).resume.data.toString(), "test resume");

  const resumeMetadata = await fetch(`${baseUrl}/api/resume`, {
    headers: { Authorization: `Bearer ${login.token}` }
  });
  assert.equal(resumeMetadata.status, 200);
  const resume = await resumeMetadata.json();
  assert.equal(resume.size, 11);
  assert.equal(resume.hasFile, true);

  const downloadResponse = await fetch(`${baseUrl}/api/resume/file`, {
    headers: { Authorization: `Bearer ${login.token}` }
  });
  assert.equal(downloadResponse.status, 200);
  assert.equal(await downloadResponse.text(), "test resume");
  assert.match(downloadResponse.headers.get("content-disposition"), /resume\.pdf/);

  const expiredSessionId = [...sessions.keys()][0];
  sessions.get(expiredSessionId).expiresAt = new Date(Date.now() - 1000);
  assert.equal((await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${signup.token}` }
  })).status, 401);
  assert.equal(sessions.has(expiredSessionId), false);

  assert.equal((await sendJson("/api/logout", {}, login.token)).status, 200);
  assert.equal((await fetch(`${baseUrl}/api/me`, {
    headers: { Authorization: `Bearer ${login.token}` }
  })).status, 401);
});
