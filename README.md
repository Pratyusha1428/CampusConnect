# CampusConnect

A campus placement portal built with HTML, CSS, browser JavaScript, Node.js, Express, and MongoDB.

## Requirements
- Node.js LTS
- MongoDB running locally or a MongoDB Atlas connection string
- A browser

## Configure and run
1. Open the project folder in VS Code and run `npm install`.
2. Copy `.env.example` to `.env`.
3. Set `MONGODB_URI` to your local MongoDB URI or Atlas connection string.
4. Change `ADMIN_EMAIL` and `ADMIN_PASSWORD` to the placement cell administrator's credentials. The password must be at least 12 characters.
5. Run `npm start` and open `http://localhost:3000`.

The app stops with a clear error if MongoDB is not configured or unavailable. Never commit `.env` or use real student data in a public demo.

## Features
- First-visit student or placement-cell role selection
- Student registration and login with password hashing
- Admin-only login and server-enforced admin permissions
- Admin dashboard to review student applications and update their status, and to publish/delete internships/jobs, notices, and events
- Student opportunity search, filters, saved opportunities, and applications
- Student profile, projects, and certifications editing, plus resume upload (PDF/DOC/DOCX, maximum 5 MB)
- MongoDB persistence through Mongoose

## Existing JSON demo data

The old `data/db.json` file is not used by the app after the MongoDB update. To explicitly import its existing users, profiles, resumes, opportunities, saved items, and applications, configure `.env` first and run `npm run migrate:json` **before** starting the app against an empty database. This copies the records, including password hashes and email addresses, to the MongoDB database in `MONGODB_URI`. Review that destination and its access controls before running the migration. The migration refuses to run if any CampusConnect collection already contains records.

If you do not need those records, simply run `npm start`; the app creates the sample opportunities automatically.

## Local MVP limitations
- This is a development MVP, not a production deployment.
- Login sessions are held in server memory; restarting the server logs users out.
- Opportunity data is sample data, not live job listings.
- Email verification, password reset, and AI resume analysis are not included.
- Use HTTPS, managed session storage, rate limiting, backups, and appropriate privacy controls before deployment.
