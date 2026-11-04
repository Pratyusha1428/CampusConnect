# CampusConnect

A campus placement portal built with HTML, CSS, browser JavaScript, Node.js, Express, and MongoDB.

## What runs where

The website needs both the Node.js/Express server and MongoDB. GitHub Actions can automate a deployment, but **GitHub Pages only serves static files**; it cannot run this app's API or store accounts. Use a Node.js web host for the app and MongoDB Atlas for persistent account, application, profile, and resume data.

## Deploy the full app

This repository includes a Render Blueprint in `render.yaml`.

1. Push the project to GitHub. Do not commit `.env`, `data/db.json`, or student uploads.
2. In Render, create a Blueprint from the repository and review the `campusconnect` web service.
3. Set `MONGODB_URI` to the Atlas connection string, `ADMIN_EMAIL` to the placement-cell email, and `ADMIN_PASSWORD` to a unique password of at least 12 characters in the Render service's environment settings.
4. In Atlas Network Access, allow the web service's outbound IP addresses. Keep database credentials private; do not put them in the repository or browser code.
5. Wait for `/api/health` to report `{"status":"ok","database":"connected"}` and open the Render service URL. Signups and logins work on that URL because the frontend and API are served by the same Node service.

Do not use the GitHub Pages URL for signup/login. If Pages is enabled, it is only a static preview; it cannot use the Node server or MongoDB.

## Import existing local accounts (one time)

The older `data/db.json` and `uploads/` files are intentionally ignored by Git, so they are not included in a GitHub deployment. To keep their users and related records:

1. On the computer that has the old data, configure `.env` with the same Atlas database you plan to use for the app. Add your computer's IP to Atlas Network Access temporarily.
2. Before starting the web service against that database, run `npm.cmd run migrate:json` in PowerShell (`npm run migrate:json` in Command Prompt). The migration imports the existing users, profiles, resumes, opportunities, saved items, and applications, including available resume files.
3. The migration only runs against an empty CampusConnect database. If the app has already seeded data into the target database, back it up and use a separate empty database rather than deleting records.
4. Remove the temporary IP rule when finished if it is no longer needed.

If the old data is missing or the migration is not run, an existing local account will not be found in the deployed Atlas database. Ask students to create new accounts only after the backend is live.

## Run locally

Requirements: Node.js LTS and MongoDB local or Atlas.

1. Copy `.env.example` to `.env` and set `MONGODB_URI`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
2. If you have existing JSON accounts, migrate them to an empty target database before starting the app.
3. Install dependencies and start the app from this folder:

   ```powershell
   npm.cmd install
   npm.cmd start
   ```

4. Open `http://localhost:3000`. Keep the server terminal open.

If PowerShell blocks `npm`, use `npm.cmd` as shown or run `npm` from Command Prompt. The site opened directly as an HTML file does not have a backend.

## Features

- Student account signup and login with password hashing
- Administrator login provisioned from server environment variables
- MongoDB-backed sessions that survive server restarts and expire after seven days
- Admin dashboard for reviewing applications and managing jobs, internships, notices, and events
- Student profile, projects, certifications, saved opportunities, and applications
- Resume upload/download (PDF/DOC/DOCX, maximum 5 MB), stored in MongoDB

## Validate

Run the automated API tests with `npm test` (or `npm.cmd test` in PowerShell).

## Limitations

- This is an MVP. Email verification, password reset, rate limiting, and AI resume analysis are not included.
- Opportunity records are sample data until an administrator publishes real ones.
- Use HTTPS, backups, and appropriate privacy controls before handling real student information.
