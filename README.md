# Job Portal Backend

A Representational State Transfer (REST) Application Programming Interface (API) for a job portal, built with Express.js and TypeScript.

- **Employers** register, post and manage jobs, search candidates, review applicants and update their status.
- **Candidates** register, upload a resume (it is parsed automatically), search jobs, apply, track applications and get job recommendations.

## Run it

```bash
npm install
cp .env.example .env     # optional, defaults work for development
npm run dev              # http://localhost:3000
npm test                 # runs the full workflow end to end
npm run build && npm start
```

Data is saved as JavaScript Object Notation (JSON) files in `data/`, resumes in `uploads/`.
If no Simple Mail Transfer Protocol (SMTP) settings are in `.env`, emails are only printed in the console.

After `npm run dev`, open http://localhost:3000 for the web interface (`public/index.html`).

## Project structure

```
src/
  types.ts              all data models (generic Account<R, P>, Paginated<T>, Ranked<T>, Job, Application)
  config.ts             environment settings
  schemas.ts            input validation rules (zod)
  app.ts / server.ts    Express setup / start
  db/repository.ts      generic Repository<T>: one class stores any entity in a JSON file
  db/index.ts           the four repositories (employers, candidates, jobs, applications)
  middleware/auth.ts    JSON Web Token (JWT) login check, separate secret per role
  middleware/upload.ts  Multer resume upload (PDF, DOCX, TXT, max 5 MB)
  middleware/errors.ts  one place for error responses
  services/search.ts    generic full-text search + pagination
  services/recommend.ts match score between a job and a candidate
  services/resumeParser.ts  reads a resume and finds email, phone, skills, experience
  services/email.ts     status update emails
  routes/accounts.ts    register / login / profile for BOTH roles (one generic function)
  routes/jobs.ts        job CRUD, job search, recommended candidates
  routes/candidates.ts  resume upload, job recommendations, candidate search
  routes/applications.ts apply, track, change status, download resume
test/smoke.ts           end-to-end workflow test
```

## Workflow

1. Employer registers (`/api/employers/register`) and gets a token. Candidate does the same on `/api/candidates/...`.
2. Employer posts jobs with required skills, minimum experience, salary range, location, job type.
3. Candidate uploads a resume. The parser extracts the text, then **adds** the skills it finds, the phone number and the years of experience to the profile.
4. Candidate searches jobs (text + filters) or opens their recommendations.
5. Candidate applies. A match score (0 - 100) is stored with the application and both sides get an email.
6. Employer sees applicants (best match first), can download their resume, and sets a status:
   `applied -> reviewing -> shortlisted -> interview -> rejected / hired`. The candidate is emailed every time.
7. Candidate tracks status and full history in `/api/applications/mine`.

## Endpoints

`E` = employer token, `C` = candidate token. Send it as `Authorization: Bearer <token>`.

| Method | Path | Who | What |
|---|---|---|---|
| POST | `/api/employers/register`, `/login` | public | create account / log in |
| GET, PUT | `/api/employers/me` | E | view / update company profile |
| POST | `/api/candidates/register`, `/login` | public | create account / log in |
| GET, PUT | `/api/candidates/me` | C | view / update candidate profile |
| POST | `/api/candidates/me/resume` | C | upload resume (form field `resume`), parsed automatically |
| GET | `/api/candidates/me/recommendations` | C | best matching jobs (`?limit=`) |
| GET | `/api/candidates/search` | E | search candidates (`q, skills, minExperience, maxExperience, location, maxSalary, page, limit`) |
| GET | `/api/jobs` | public | search jobs (`q, location, jobType, remote, minSalary, maxSalary, experience, skills, page, limit`) |
| GET | `/api/jobs/:id` | public | one job |
| POST | `/api/jobs` | E | post a job |
| GET | `/api/jobs/mine` | E | my jobs with application counts |
| PUT, DELETE | `/api/jobs/:id` | E (owner) | edit / close (`status: "closed"`) / delete |
| GET | `/api/jobs/:id/recommended-candidates` | E (owner) | best matching candidates |
| POST | `/api/jobs/:id/apply` | C | apply (optional `coverLetter`) |
| GET | `/api/jobs/:id/applications` | E (owner) | applicants, best match first (`?status=`) |
| GET | `/api/applications/mine` | C | my applications with status history |
| PATCH | `/api/applications/:id/status` | E (owner) | set status (+ optional `note`) |
| GET | `/api/applications/:id/resume` | E (owner) or C (applicant) | download resume |

Search filter notes: `skills=react,css` means the job (or candidate) must have **all** listed skills.
`experience=2` on jobs means "jobs I qualify for with 2 years". `minSalary` / `maxSalary` compare against the job's salary range.

## Example requests

```bash
# employer registers and posts a job
curl -X POST localhost:3000/api/employers/register -H "Content-Type: application/json" \
  -d '{"email":"hr@acme.com","password":"secret123","companyName":"Acme Tech"}'

curl -X POST localhost:3000/api/jobs -H "Content-Type: application/json" -H "Authorization: Bearer $EMPLOYER_TOKEN" \
  -d '{"title":"Backend Developer","description":"Build REST APIs with Node.js","location":"Hyderabad",
       "salaryMin":600000,"salaryMax":1200000,"minExperience":1,"skills":["node.js","typescript"]}'

# candidate uploads resume and searches
curl -X POST localhost:3000/api/candidates/me/resume -H "Authorization: Bearer $CANDIDATE_TOKEN" -F "resume=@resume.pdf"
curl "localhost:3000/api/jobs?q=backend&location=hyderabad&minSalary=500000&skills=node.js"
```

## How the main ideas work

**Generics (reusable models).** `Account<R, P>` is one account shape for any role: `Employer = Account<'employer', EmployerProfile>`
and `Candidate = Account<'candidate', CandidateProfile>`. `User = Employer | Candidate` is a union type.
`Repository<T>` stores any entity, `createAccountRouter<A>()` builds register / login / profile routes for either role,
`fullTextSearch<T>()`, `paginate<T>()` and `rank<T>()` work on jobs and candidates alike.

**Separate auth.** Employer and candidate tokens are signed with different secrets (`EMPLOYER_JWT_SECRET`, `CANDIDATE_JWT_SECRET`).
`requireAuth('employer')` only accepts employer tokens, `requireAuth('candidate')` only candidate tokens.

**Full-text search.** Text is split into words. Each matching word scores `matches x field weight x rarity`
(title counts 3, skills 2, description 1; rarer words count more). Prefixes match too, so `develop` finds `developer`.

**Recommendations.** `matchScore(job, candidate)` = skills 60 + experience 20 + location 10 + salary 10.
No common skill means score 0. The same function ranks jobs for a candidate and candidates for a job.

**Resume parsing.** Portable Document Format (PDF), Word (DOCX) and plain text files are converted to text. Email and phone come from
patterns, skills from the `KNOWN_SKILLS` list in `services/resumeParser.ts` (add your own), experience from phrases like "3 years of experience".

## Possible next steps

Swap the JSON files for a database (only `db/repository.ts` needs to change), add refresh tokens, rate limiting, and a frontend.
