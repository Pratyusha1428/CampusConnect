/* CampusConnect: small, readable frontend interactions */
(() => {
  const API = "/api";
  const getToken = () => localStorage.getItem("cc_token");
  const getUser = () => { try { return JSON.parse(localStorage.getItem("cc_user") || "null"); } catch { return null; } };
  const saveSession = data => { localStorage.setItem("cc_token", data.token); localStorage.setItem("cc_user", JSON.stringify(data.user)); };
  const selectedRole = () => new URLSearchParams(location.search).get("role") === "admin" ? "admin" : "student";
  async function request(path, options = {}) {
    const headers = { ...(options.headers || {}) };
    if (getToken()) headers.Authorization = `Bearer ${getToken()}`;
    if (options.body && !(options.body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(API + path, { ...options, headers });
    const data = response.status === 204 ? null : await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(data?.error || "Something went wrong.");
    return data;
  }
  function message(text, error = false, parent) {
    let box = document.querySelector(".cc-message");
    if (!box) {
      box = document.createElement("p"); box.className = "cc-message";
      (parent || document.querySelector("main") || document.body).prepend(box);
    }
    box.textContent = text;
    box.style.cssText = `margin:12px 0;padding:10px 14px;border-radius:6px;background:${error ? "#4a2028" : "#173d35"};color:#fff;`;
    return box;
  }
  function requireLogin() {
    if (!getToken()) { location.href = "login.html?role=student"; return false; }
    if (getUser()?.role === "admin") { location.href = "admin.html"; return false; }
    return true;
  }
  function requireAdmin() {
    if (!getToken()) { location.href = "login.html?role=admin"; return false; }
    if (getUser()?.role !== "admin") { location.href = "index.html"; return false; }
    return true;
  }
  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, ch => ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" }[ch]));
  }
  function cardHTML(job, saved = false) {
    return `<article class="${saved ? "saved-card" : "opportunity-card"}" data-id="${escapeHtml(job.id)}">
      <p class="opportunity-type">${escapeHtml(job.type)}</p>
      <h2>${escapeHtml(job.title)}</h2><p class="company">${escapeHtml(job.company)}</p>
      <p class="details">${escapeHtml(job.location)} • ${escapeHtml(job.stipend)}</p>
      <p class="skills">${(job.skills || []).map(s => `<span>${escapeHtml(s)}</span>`).join(" ")}</p>
      <p>${escapeHtml(job.description || "")}</p>
      <div style="display:flex;gap:10px;flex-wrap:wrap;margin-top:14px">
        <button type="button" class="cc-apply" data-id="${escapeHtml(job.id)}">Apply</button>
        <button type="button" class="cc-save" data-id="${escapeHtml(job.id)}">${saved ? "Remove saved" : "Save job"}</button>
      </div>
    </article>`;
  }
  async function loadOpportunities() {
    const list = document.querySelector(".opportunity-list");
    if (!list) return;
    const search = document.querySelector('.search-box input[type="search"]');
    const filters = [...document.querySelectorAll(".filters .filter")];
    let selected = "all";
    async function render() {
      const q = search?.value.trim() || "";
      const remote = selected === "remote";
      const type = ["internships", "jobs"].includes(selected) ? (selected === "internships" ? "internship" : "job") : "all";
      try {
        const jobs = await request(`/opportunities?q=${encodeURIComponent(q)}&type=${type}&remote=${remote}`);
        list.innerHTML = jobs.length ? jobs.map(j => cardHTML(j)).join("") : "<p>No opportunities match your search.</p>";
      } catch (e) { message(e.message, true); }
    }
    search?.addEventListener("input", render);
    document.querySelector(".search-box button")?.addEventListener("click", render);
    filters.forEach((button, i) => button.addEventListener("click", () => {
      filters.forEach(b => b.classList.remove("active")); button.classList.add("active");
      selected = ["all", "internships", "jobs", "remote"][i] || "all"; render();
    }));
    await render();
  }
  async function handleAuth() {
    const form = document.querySelector(".auth-card form");
    if (!form) return;
    const isSignup = location.pathname.endsWith("signup.html");
    const role = isSignup ? "student" : selectedRole();
    if (!isSignup && role === "admin") {
      const heading = document.querySelector(".auth-card h1");
      const eyebrow = document.querySelector(".auth-card .eyebrow");
      const description = document.querySelector(".auth-description");
      const switchLink = document.querySelector(".auth-switch");
      if (heading) heading.textContent = "Placement cell login.";
      if (eyebrow) eyebrow.textContent = "ADMINISTRATOR PORTAL";
      if (description) description.textContent = "Sign in with your placement cell administrator account.";
      if (switchLink) switchLink.innerHTML = 'Not an administrator? <a href="index.html">Choose your portal</a>';
    }
    form.addEventListener("submit", async event => {
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]'); if (button) button.disabled = true;
      try {
        const body = isSignup
          ? { name: document.querySelector("#name").value, email: document.querySelector("#email").value, password: document.querySelector("#password").value }
          : { email: document.querySelector("#email").value, password: document.querySelector("#password").value, role };
        const data = await request(isSignup ? "/register" : "/login", { method: "POST", body: JSON.stringify(body) });
        saveSession(data); location.href = "index.html";
      } catch (e) { message(e.message, true, form); }
      finally { if (button) button.disabled = false; }
    });
  }
  async function handleCardActions() {
    document.addEventListener("click", async event => {
      const apply = event.target.closest(".cc-apply, .saved-apply-btn");
      const save = event.target.closest(".cc-save, .remove-save-btn");
      if (!apply && !save) return;
      const card = event.target.closest("[data-id]") || event.target.closest(".saved-card");
      const id = (apply || save).dataset.id || card?.dataset.id;
      if (!id) { message("Please refresh the page and try again.", true); return; }
      if (!requireLogin()) return;
      try {
        if (apply) { await request(`/applications/${id}`, { method: "POST", body: "{}" }); message("Application submitted successfully."); }
        else { await request(`/saved/${id}`, { method: "POST", body: "{}" }); message("Saved jobs updated."); if (location.pathname.endsWith("saved.html")) loadSaved(); }
      } catch (e) { message(e.message, true); }
    });
  }
  async function loadSaved() {
    const container = document.querySelector(".saved-grid");
    if (!container) return;
    if (!requireLogin()) return;
    try {
      const jobs = await request("/saved");
      container.innerHTML = jobs.length ? jobs.map(j => cardHTML(j, true)).join("") : "<p>You haven't saved any opportunities yet. Visit Opportunities to save a job.</p>";
      const count = document.querySelector(".saved-summary strong");
      if (count) count.textContent = jobs.length;
    } catch (e) { message(e.message, true); }
  }
  async function loadApplications() {
    const container = document.querySelector(".applications-panel");
    if (!container) return;
    if (!requireLogin()) return;
    try {
      const items = await request("/applications");
      const statuses = items.reduce((a, x) => { a[x.status] = (a[x.status] || 0) + 1; return a; }, {});
      const stats = document.querySelectorAll(".application-stat strong, .application-stat span.stat-value");
      if (stats[0]) stats[0].textContent = items.length;
      container.innerHTML = items.length ? items.map(a => `<article class="application-card">
        <div class="application-main"><div><p class="application-type">${escapeHtml(a.opportunity?.type || "Opportunity")}</p>
        <h3>${escapeHtml(a.opportunity?.title || "Opportunity")}</h3><p>${escapeHtml(a.opportunity?.company || "")} • ${escapeHtml(a.opportunity?.location || "")}</p></div>
        <span class="status-badge status-review">${escapeHtml(a.status)}</span></div>
        <p class="application-meta">Applied on ${new Date(a.appliedAt).toLocaleDateString()}</p></article>`).join("") : "<p>You haven't applied to any opportunities yet. Browse opportunities to get started.</p>";
    } catch (e) { message(e.message, true); }
  }
  async function loadProfile() {
    if (!document.querySelector(".profile-container")) return;
    if (!requireLogin()) return;
    try {
      const profile = await request("/profile");
      const form = document.querySelector("#profile-edit-form");
      const editButton = document.querySelector(".edit-profile-btn");
      const setValue = (selector, value) => {
        const element = document.querySelector(selector);
        if (element) element.value = value || "";
      };
      const render = current => {
        const fullName = current.name || "Student";
        const nameElement = document.querySelector(".profile-intro h1");
        const intro = document.querySelectorAll(".profile-intro p");
        const avatar = document.querySelector(".profile-avatar");
        const education = document.querySelector(".education-card");
        const about = document.querySelector(".profile-bio");
        if (nameElement) nameElement.textContent = fullName;
        if (intro[0]) intro[0].textContent = current.course || "Add your course or degree";
        if (intro[1]) intro[1].textContent = current.college || "Add your college";
        if (avatar) avatar.textContent = fullName.split(/\s+/).filter(Boolean).slice(0, 2).map(part => part[0]).join("").toUpperCase();
        if (education) {
          const heading = education.querySelector("h3");
          const college = education.querySelector("p");
          const specialization = education.querySelectorAll("p")[1];
          if (heading) heading.textContent = current.course || "Course or degree not added";
          if (college) college.textContent = current.college || "College not added";
          if (specialization) specialization.hidden = true;
        }
        if (about) about.textContent = current.bio || "Add a short introduction about yourself using Edit Profile.";
        const skills = document.querySelector(".skills-container");
        if (skills) {
          const list = (current.skills || "").split(",").map(skill => skill.trim()).filter(Boolean);
          skills.innerHTML = list.length
            ? list.map(skill => `<span class="skill">${escapeHtml(skill)}</span>`).join("")
            : "<p>Add your skills using Edit Profile.</p>";
        }
        const projectsContainer = document.querySelector(".profile-projects");
        if (projectsContainer) {
          const projects = current.projects || [];
          projectsContainer.innerHTML = projects.length ? projects.map(project => `<article class="project-card profile-item-card" data-profile-item-id="${escapeHtml(project.id)}">
            <div class="profile-item-heading"><h3>${escapeHtml(project.title)}</h3><button type="button" class="profile-item-delete" data-kind="projects" data-id="${escapeHtml(project.id)}">Remove</button></div>
            <p>${escapeHtml(project.description)}</p>
            ${project.technologies ? `<div class="project-tech">${project.technologies.split(",").map(value => value.trim()).filter(Boolean).map(value => `<span>${escapeHtml(value)}</span>`).join("")}</div>` : ""}
            ${project.url ? `<a href="${escapeHtml(project.url)}" target="_blank" rel="noopener noreferrer">View project →</a>` : ""}
          </article>`).join("") : "<p class=\"empty-state\">You haven't added any projects yet.</p>";
        }
        const certificationsContainer = document.querySelector(".profile-certifications");
        if (certificationsContainer) {
          const certifications = current.certifications || [];
          certificationsContainer.innerHTML = certifications.length ? certifications.map(certification => `<article class="certification-card profile-item-card" data-profile-item-id="${escapeHtml(certification.id)}">
            <div class="profile-item-heading"><h3>${escapeHtml(certification.name)}</h3><button type="button" class="profile-item-delete" data-kind="certifications" data-id="${escapeHtml(certification.id)}">Remove</button></div>
            <p>${escapeHtml(certification.issuer)}${certification.issueDate ? ` · ${escapeHtml(certification.issueDate)}` : ""}</p>
            ${certification.credentialUrl ? `<a href="${escapeHtml(certification.credentialUrl)}" target="_blank" rel="noopener noreferrer">View credential →</a>` : ""}
          </article>`).join("") : "<p class=\"empty-state\">You haven't added any certifications yet.</p>";
        }
        setValue("#profile-name", current.name);
        setValue("#profile-course", current.course);
        setValue("#profile-college", current.college);
        setValue("#profile-skills", current.skills);
        setValue("#profile-bio", current.bio);
      };
      render(profile);
      editButton?.addEventListener("click", () => {
        if (!form) return;
        form.hidden = !form.hidden;
        editButton.setAttribute("aria-expanded", String(!form.hidden));
        if (!form.hidden) form.querySelector("#profile-name")?.focus();
      });
      document.querySelector(".profile-cancel-btn")?.addEventListener("click", () => {
        render(profile);
        if (form) form.hidden = true;
        editButton?.setAttribute("aria-expanded", "false");
      });
      form?.addEventListener("submit", async event => {
        event.preventDefault();
        const submit = form.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
          const updated = await request("/profile", {
            method: "PUT",
            body: JSON.stringify(Object.fromEntries(new FormData(form).entries()))
          });
          render(updated);
          profile.name = updated.name;
          profile.course = updated.course;
          profile.college = updated.college;
          profile.skills = updated.skills;
          profile.bio = updated.bio;
          profile.projects = updated.projects || profile.projects || [];
          profile.certifications = updated.certifications || profile.certifications || [];
          const user = getUser();
          if (user) saveSession({ token: getToken(), user: { ...user, name: updated.name } });
          form.hidden = true;
          editButton?.setAttribute("aria-expanded", "false");
          message("Profile updated successfully.");
        } catch (e) { message(e.message, true, form); }
        finally { if (submit) submit.disabled = false; }
      });
      document.querySelectorAll("[data-open-profile-form]").forEach(button => button.addEventListener("click", () => {
        const itemForm = document.getElementById(button.dataset.openProfileForm);
        if (!itemForm) return;
        itemForm.hidden = !itemForm.hidden;
        if (!itemForm.hidden) itemForm.querySelector("input")?.focus();
      }));
      document.querySelectorAll(".profile-item-cancel").forEach(button => button.addEventListener("click", () => {
        const itemForm = button.closest("form");
        itemForm?.reset();
        if (itemForm) itemForm.hidden = true;
      }));
      document.querySelectorAll(".profile-item-form").forEach(itemForm => itemForm.addEventListener("submit", async event => {
        event.preventDefault();
        const kind = itemForm.dataset.profileItem;
        if (!["projects", "certifications"].includes(kind)) return;
        const submit = itemForm.querySelector('button[type="submit"]');
        if (submit) submit.disabled = true;
        try {
          await request(`/profile/${kind}`, {
            method: "POST",
            body: JSON.stringify(Object.fromEntries(new FormData(itemForm).entries()))
          });
          const updated = await request("/profile");
          profile.projects = updated.projects || [];
          profile.certifications = updated.certifications || [];
          render(profile);
          itemForm.reset();
          itemForm.hidden = true;
          message(kind === "projects" ? "Project added successfully." : "Certification added successfully.");
        } catch (e) { message(e.message, true, itemForm); }
        finally { if (submit) submit.disabled = false; }
      }));
      document.querySelector(".profile-container")?.addEventListener("click", async event => {
        const button = event.target.closest(".profile-item-delete");
        if (!button) return;
        const kind = button.dataset.kind;
        const id = button.dataset.id;
        if (!["projects", "certifications"].includes(kind) || !id) return;
        button.disabled = true;
        try {
          await request(`/profile/${kind}/${encodeURIComponent(id)}`, { method: "DELETE" });
          const updated = await request("/profile");
          profile.projects = updated.projects || [];
          profile.certifications = updated.certifications || [];
          render(profile);
          message(kind === "projects" ? "Project removed." : "Certification removed.");
        } catch (e) { message(e.message, true); button.disabled = false; }
      });
    } catch (e) { message(e.message, true); }
  }
  async function loadDashboard() {
    if (!document.querySelector(".dashboard")) return;
    if (!requireLogin()) return;
    const user = getUser();
    const welcome = document.querySelector(".dashboard-header h1");
    if (welcome && user) welcome.textContent = `Welcome back, ${user.name}.`;
    try {
      const [apps, saved] = await Promise.all([request("/applications"), request("/saved")]);
      const stats = document.querySelectorAll(".dashboard-stat strong");
      if (stats[0]) stats[0].textContent = apps.length;
      if (stats[1]) stats[1].textContent = apps.filter(a => a.status === "Shortlisted").length;
      if (stats[2]) stats[2].textContent = apps.filter(a => a.status === "Interview").length;
      if (stats[3]) stats[3].textContent = saved.length;
    } catch (e) { message(e.message, true); }
  }
  async function loadCampusUpdates() {
    const noticesContainer = document.querySelector(".notices-list");
    const eventsContainer = document.querySelector(".events-list");
    if (!noticesContainer && !eventsContainer) return;
    try {
      const [notices, events] = await Promise.all([request("/notices"), request("/events")]);
      if (noticesContainer) {
        noticesContainer.innerHTML = notices.length ? notices.map(notice => `<article class="update-card">
          <p class="opportunity-type">${escapeHtml(notice.category || "Notice")}</p>
          <h3>${escapeHtml(notice.title)}</h3><p>${escapeHtml(notice.content)}</p>
          <small>${new Date(notice.publishedAt).toLocaleDateString()}</small>
        </article>`).join("") : "<p>No notices have been posted yet.</p>";
      }
      if (eventsContainer) {
        eventsContainer.innerHTML = events.length ? events.map(item => `<article class="update-card">
          <p class="opportunity-type">CAMPUS EVENT</p><h3>${escapeHtml(item.title)}</h3>
          <p>${escapeHtml(item.description)}</p><p>${escapeHtml(item.location)} · ${new Date(`${item.eventDate}T00:00:00`).toLocaleDateString()}</p>
          ${item.registrationUrl ? `<a class="opportunity-link" href="${escapeHtml(item.registrationUrl)}" target="_blank" rel="noopener noreferrer">Register →</a>` : ""}
        </article>`).join("") : "<p>No upcoming events have been posted yet.</p>";
      }
    } catch (e) { message(e.message, true); }
  }
  async function loadAdminDashboard() {
    if (!document.querySelector(".admin-page") || !requireAdmin()) return;
    const applicationStatuses = ["Under Review", "Shortlisted", "Interview", "Rejected"];
    const resources = {
      opportunities: { endpoint: "/admin/opportunities", formEndpoint: "/admin/opportunities", label: item => `${item.title} · ${item.company}` },
      notices: { endpoint: "/admin/notices", formEndpoint: "/admin/notices", label: item => `${item.title} · ${item.category}` },
      events: { endpoint: "/admin/events", formEndpoint: "/admin/events", label: item => `${item.title} · ${item.eventDate}` }
    };
    async function refresh() {
      const [summary, ...items] = await Promise.all([
        request("/admin/summary"),
        ...Object.values(resources).map(resource => request(resource.endpoint)),
        request("/admin/applications")
      ]);
      document.querySelectorAll("[data-admin-count]").forEach(element => {
        element.textContent = summary[element.dataset.adminCount] ?? 0;
      });
      Object.entries(resources).forEach(([kind, resource], index) => {
        const container = document.querySelector(`[data-admin-list="${kind}"]`);
        if (!container) return;
        const entries = items[index];
        container.innerHTML = entries.length ? entries.map(item => `<li>
          <span>${escapeHtml(resource.label(item))}</span>
          <button type="button" class="admin-delete" data-kind="${kind}" data-id="${escapeHtml(item.id)}">Delete</button>
        </li>`).join("") : "<li class=\"empty-state\">Nothing published yet.</li>";
      });
      const applications = items[Object.keys(resources).length];
      const applicationContainer = document.querySelector("[data-admin-applications]");
      if (applicationContainer) {
        applicationContainer.innerHTML = applications.length ? applications.map(application => `<article class="admin-application">
        <div class="admin-application-details">
          <p class="opportunity-type">${escapeHtml(application.opportunity?.type || "Application")}</p>
          <h3>${escapeHtml(application.opportunity?.title || "Opportunity no longer available")}</h3>
          <p>${escapeHtml(application.opportunity?.company || "")}${application.opportunity?.location ? ` · ${escapeHtml(application.opportunity.location)}` : ""}</p>
          <p class="admin-applicant"><strong>Student:</strong> ${escapeHtml(application.student?.name || "Student account unavailable")}
            ${application.student?.email ? ` · <a href="mailto:${escapeHtml(application.student.email)}">${escapeHtml(application.student.email)}</a>` : ""}</p>
          ${application.student?.course || application.student?.college ? `<p class="admin-applicant">${escapeHtml([application.student.course, application.student.college].filter(Boolean).join(" · "))}</p>` : ""}
          <small>Applied ${new Date(application.appliedAt).toLocaleDateString()}</small>
        </div>
        <form class="admin-status-form" data-id="${escapeHtml(application.id)}">
          <label>Status
            <select name="status">${applicationStatuses.map(status => `<option value="${escapeHtml(status)}"${status === application.status ? " selected" : ""}>${escapeHtml(status)}</option>`).join("")}</select>
          </label>
          <button type="submit" class="admin-status-save">Update status</button>
        </form>
        </article>`).join("") : "<p>No student applications have been submitted yet.</p>";
      }
    }
    document.addEventListener("submit", async event => {
      const form = event.target.closest(".admin-status-form");
      if (!form) return;
      event.preventDefault();
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const status = new FormData(form).get("status");
        await request(`/admin/applications/${encodeURIComponent(form.dataset.id)}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
        });
        message("Application status updated.");
        await refresh();
      } catch (e) {
        message(e.message, true, form);
        if (button) button.disabled = false;
      }
    });
    document.querySelectorAll(".admin-form").forEach(form => form.addEventListener("submit", async event => {
      event.preventDefault();
      const kind = form.dataset.kind;
      const resource = resources[kind];
      if (!resource) return;
      const button = form.querySelector('button[type="submit"]');
      if (button) button.disabled = true;
      try {
        const body = Object.fromEntries(new FormData(form).entries());
        await request(resource.formEndpoint, { method: "POST", body: JSON.stringify(body) });
        form.reset();
        message("Published successfully.", false, form);
        await refresh();
      } catch (e) { message(e.message, true, form); }
      finally { if (button) button.disabled = false; }
    }));
    document.addEventListener("click", async event => {
      const button = event.target.closest(".admin-delete");
      if (!button) return;
      if (!confirm("Delete this item? This cannot be undone.")) return;
      button.disabled = true;
      try {
        await request(`/admin/${button.dataset.kind}/${encodeURIComponent(button.dataset.id)}`, { method: "DELETE" });
        await refresh();
      } catch (e) { message(e.message, true); button.disabled = false; }
    });
    try { await refresh(); } catch (e) { message(e.message, true); }
  }
  async function handleResume() {
    const page = document.querySelector(".resume-page, .profile-container");
    if (!page) return;
    const buttons = [...document.querySelectorAll(".upload-btn, .replace-btn, .resume-page .primary-btn")];
    let fileInput = document.querySelector("#cc-resume-file");
    if (!fileInput) {
      fileInput = document.createElement("input"); fileInput.type = "file"; fileInput.id = "cc-resume-file";
      fileInput.accept = ".pdf,.doc,.docx"; fileInput.hidden = true; document.body.appendChild(fileInput);
    }
    buttons.forEach(button => button.addEventListener("click", event => {
      if (button.closest("a")) return;
      event.preventDefault(); if (requireLogin()) fileInput.click();
    }));
    fileInput.addEventListener("change", async () => {
      if (!fileInput.files.length) return;
      const data = new FormData(); data.append("resume", fileInput.files[0]);
      try {
        const result = await request("/resume", { method: "POST", body: data });
        message(`Resume uploaded: ${result.originalName}`);
      } catch (e) { message(e.message, true); }
    });
  }
  function handleLogout() {
    document.addEventListener("click", event => {
      const link = event.target.closest('a[href="login.html"], a[href="index.html"]');
      if (!link) return;
      if (!/logout/i.test(link.textContent)) return;
      event.preventDefault();
      request("/logout", { method: "POST" }).catch(error => {
        message(`Your local session was cleared, but the server logout request failed: ${error.message}`, true);
      }).finally(() => {
        localStorage.removeItem("cc_token");
        localStorage.removeItem("cc_user");
        location.href = "index.html";
      });
    });
  }
  function fixLinks() {
    document.querySelectorAll('a[href="#"]').forEach(a => {
      const text = a.textContent.toLowerCase();
      if (text.includes("login")) a.href = "login.html";
      else if (text.includes("sign up") || text.includes("create one")) a.href = "signup.html";
      else if (text.includes("internship") || text.includes("opportunit") || text.includes("explore jobs") || text.includes("find where")) a.href = "opportunities.html";
      else if (text.includes("profile")) a.href = "profile.html";
    });
  }
  function initializeNavigation() {
    document.querySelectorAll(".navbar").forEach((navbar, index) => {
      const links = navbar.querySelector(":scope > nav, :scope > .nav-links");
      const logo = navbar.querySelector(":scope > .logo");
      if (!links || !logo) return;
      const menuId = `campusconnect-menu-${index + 1}`;
      links.id = links.id || menuId;
      const toggle = document.createElement("button");
      toggle.type = "button";
      toggle.className = "nav-toggle";
      toggle.textContent = "Menu";
      toggle.setAttribute("aria-label", "Toggle navigation menu");
      toggle.setAttribute("aria-controls", links.id);
      toggle.setAttribute("aria-expanded", "false");
      logo.insertAdjacentElement("afterend", toggle);
      toggle.addEventListener("click", () => {
        const isOpen = links.classList.toggle("is-open");
        toggle.setAttribute("aria-expanded", String(isOpen));
        toggle.textContent = isOpen ? "Close" : "Menu";
      });
      links.addEventListener("click", event => {
        if (!event.target.closest("a")) return;
        links.classList.remove("is-open");
        toggle.setAttribute("aria-expanded", "false");
        toggle.textContent = "Menu";
      });
    });
  }
  function updateHomeNavigation(user) {
    const navbar = document.querySelector(".home-entry .navbar");
    const nav = navbar?.querySelector("nav");
    const actions = navbar?.querySelector(".nav-actions");
    if (!navbar || !nav || !actions) return;
    nav.innerHTML = user.role === "admin"
      ? '<a href="index.html">Home</a><a href="admin.html">Admin dashboard</a>'
      : '<a href="index.html">Home</a><a href="opportunities.html">Opportunities</a><a href="saved.html">Saved</a><a href="applications.html">Applications</a><a href="notices.html">Notices & events</a><a href="profile.html">Profile</a>';
    actions.innerHTML = user.role === "admin"
      ? '<a href="admin.html" class="login-btn">Admin dashboard</a><a href="index.html" class="signup-btn" data-logout>Logout</a>'
      : '<a href="dashboard.html" class="login-btn">Dashboard</a><a href="index.html" class="signup-btn" data-logout>Logout</a>';
  }
  async function routeEntryPages() {
    const isHome = document.body.classList.contains("home-entry");
    const isRolePage = Boolean(document.querySelector(".role-page"));
    if (!isHome && !isRolePage) return;
    const token = getToken();
    if (!token) {
      if (isHome) location.replace("role.html");
      return;
    }
    try {
      const { user } = await request("/me");
      saveSession({ token, user });
      if (isRolePage) location.replace("index.html");
      else updateHomeNavigation(user);
    } catch {
      localStorage.removeItem("cc_token");
      localStorage.removeItem("cc_user");
      if (isHome) location.replace("role.html");
    }
  }
  document.addEventListener("DOMContentLoaded", async () => {
    fixLinks(); initializeNavigation(); handleLogout(); handleAuth(); handleCardActions();
    await Promise.all([routeEntryPages(), loadOpportunities(), loadSaved(), loadApplications(), loadProfile(), loadDashboard(), loadCampusUpdates(), loadAdminDashboard(), handleResume()]);
  });
})();