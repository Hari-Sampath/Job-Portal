// Runs the whole workflow against a temporary data folder:  npm test
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'jobportal-'));
process.env.DATA_DIR = path.join(tmp, 'data');
process.env.UPLOAD_DIR = path.join(tmp, 'uploads');

async function main() {
  const { app } = await import('../src/app'); // imported after the env variables are set
  const server = app.listen(0);
  const base = `http://localhost:${(server.address() as { port: number }).port}/api`;

  // small helper: calls the API and returns { status, body }
  async function call(method: string, url: string, token?: string, body?: unknown) {
    const res = await fetch(base + url, {
      method,
      headers: {
        ...(body ? { 'Content-Type': 'application/json' } : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const text = await res.text();
    return { status: res.status, body: text ? JSON.parse(text) : null };
  }

  let step = 0;
  const log = (msg: string) => console.log(`${++step}. ${msg}`);

  // ---- 1. accounts ----
  const emp = await call('POST', '/employers/register', undefined, {
    email: 'hr@acme.com', password: 'secret123', companyName: 'Acme Tech', location: 'Hyderabad',
  });
  assert.equal(emp.status, 201);
  const employerToken = emp.body.token;
  log('employer registered');

  const dup = await call('POST', '/employers/register', undefined, {
    email: 'hr@acme.com', password: 'secret123', companyName: 'Acme Tech',
  });
  assert.equal(dup.status, 409);
  log('duplicate email rejected');

  const cand = await call('POST', '/candidates/register', undefined, {
    email: 'hari@mail.com', password: 'secret123', fullName: 'Hari Sampath', location: 'Hyderabad',
    skills: ['Node.js', 'TypeScript', 'node.js'], experienceYears: 1,
  });
  assert.equal(cand.status, 201);
  assert.deepEqual(cand.body.account.profile.skills, ['node.js', 'typescript']);
  assert.equal(cand.body.account.passwordHash, undefined);
  const candidateToken = cand.body.token;
  log('candidate registered (skills cleaned, password hidden)');

  const login = await call('POST', '/candidates/login', undefined, { email: 'hari@mail.com', password: 'secret123' });
  assert.equal(login.status, 200);
  assert.equal((await call('POST', '/candidates/login', undefined, { email: 'hari@mail.com', password: 'wrong!!' })).status, 401);
  log('login works, wrong password rejected');

  // ---- 2. separate auth for each role ----
  assert.equal((await call('GET', '/employers/me', candidateToken)).status, 401);
  assert.equal((await call('GET', '/candidates/me', employerToken)).status, 401);
  assert.equal((await call('POST', '/jobs', candidateToken, {})).status, 401);
  log('candidate token cannot be used as employer token and vice versa');

  // ---- 3. jobs ----
  const job1 = await call('POST', '/jobs', employerToken, {
    title: 'Backend Developer', description: 'Build REST APIs with Node.js and TypeScript for our hiring platform',
    location: 'Hyderabad', jobType: 'full-time', salaryMin: 600000, salaryMax: 1200000, minExperience: 1,
    skills: ['node.js', 'typescript', 'mongodb'],
  });
  assert.equal(job1.status, 201);
  const job2 = await call('POST', '/jobs', employerToken, {
    title: 'Data Scientist', description: 'Train machine learning models and analyse large datasets daily',
    location: 'Bangalore', salaryMin: 1500000, salaryMax: 2500000, minExperience: 3, skills: ['python', 'machine learning'],
  });
  const job3 = await call('POST', '/jobs', employerToken, {
    title: 'React Frontend Intern', description: 'Help build dashboards using React and CSS in a remote team',
    location: 'Chennai', remote: true, jobType: 'internship', salaryMin: 120000, salaryMax: 240000, skills: ['react', 'css'],
  });
  assert.equal((await call('POST', '/jobs', employerToken, { title: 'x' })).status, 400);
  log('3 jobs posted, invalid job rejected');

  // ---- 4. search with filters ----
  let r = await call('GET', '/jobs?q=node');
  assert.equal(r.body.total, 1);
  assert.equal(r.body.items[0].companyName, 'Acme Tech');
  r = await call('GET', '/jobs?location=bangalore');
  assert.equal(r.body.items[0].title, 'Data Scientist');
  r = await call('GET', '/jobs?minSalary=2000000');
  assert.equal(r.body.total, 1);
  r = await call('GET', '/jobs?experience=1');
  assert.equal(r.body.total, 2); // data scientist needs 3 years
  r = await call('GET', '/jobs?skills=react,css');
  assert.equal(r.body.items[0].title, 'React Frontend Intern');
  r = await call('GET', '/jobs?jobType=internship&remote=true');
  assert.equal(r.body.total, 1);
  r = await call('GET', '/jobs?q=machine learning models');
  assert.equal(r.body.items[0].title, 'Data Scientist');
  r = await call('GET', '/jobs?q=acme&limit=2&page=2');
  assert.equal(r.body.items.length, 1);
  log('job search: text, location, salary, experience, skills, type, remote, pagination');

  // ---- 5. resume upload + parsing ----
  const resumeText = `Hari Sampath
hari@mail.com | +91 9876543210
3 years of experience building backend systems.
Skills: Node.js, Express, MongoDB, Docker, Git, Python`;
  const form = new FormData();
  form.append('resume', new Blob([resumeText], { type: 'text/plain' }), 'resume.txt');
  const up = await fetch(base + '/candidates/me/resume', {
    method: 'POST', headers: { Authorization: `Bearer ${candidateToken}` }, body: form,
  });
  const upBody: any = await up.json();
  assert.equal(up.status, 200);
  assert.equal(upBody.parsed.experienceYears, 3);
  assert.equal(upBody.parsed.email, 'hari@mail.com');
  assert.ok(upBody.account.profile.skills.includes('mongodb'));
  assert.ok(upBody.account.profile.skills.includes('typescript')); // kept from registration
  assert.equal(upBody.account.profile.experienceYears, 3);
  log(`resume parsed: skills = ${upBody.parsed.skills.join(', ')}`);

  const bad = new FormData();
  bad.append('resume', new Blob(['x']), 'photo.png');
  const badRes = await fetch(base + '/candidates/me/resume', {
    method: 'POST', headers: { Authorization: `Bearer ${candidateToken}` }, body: bad,
  });
  assert.equal(badRes.status, 400);
  log('wrong file type rejected');

  // ---- 6. recommendations ----
  const rec = await call('GET', '/candidates/me/recommendations', candidateToken);
  assert.equal(rec.body[0].item.title, 'Backend Developer');
  assert.deepEqual(rec.body[0].missingSkills, []);
  assert.ok(rec.body.every((m: any) => m.item.title !== 'React Frontend Intern')); // no common skill
  log(`recommended job: ${rec.body[0].item.title} (score ${rec.body[0].score})`);

  const recCand = await call('GET', `/jobs/${job1.body.id}/recommended-candidates`, employerToken);
  assert.equal(recCand.body[0].item.profile.fullName, 'Hari Sampath');
  log('recommended candidates for a job work');

  // ---- 7. employer searches candidates ----
  r = await call('GET', '/candidates/search?skills=docker&minExperience=2', employerToken);
  assert.equal(r.body.total, 1);
  r = await call('GET', '/candidates/search?q=backend systems', employerToken); // found through resume text
  assert.equal(r.body.total, 1);
  assert.equal(r.body.items[0].profile.resumeText, undefined);
  assert.equal((await call('GET', '/candidates/search', candidateToken)).status, 401);
  log('candidate search works (also searches resume text)');

  // ---- 8. apply + track + status update ----
  const jobId = job1.body.id;
  const applied = await call('POST', `/jobs/${jobId}/apply`, candidateToken, { coverLetter: 'I would love to join.' });
  assert.equal(applied.status, 201);
  assert.ok(applied.body.matchScore > 80);
  assert.equal((await call('POST', `/jobs/${jobId}/apply`, candidateToken, {})).status, 409);
  log(`applied (match score ${applied.body.matchScore}), duplicate application rejected`);

  const rec2 = await call('GET', '/candidates/me/recommendations', candidateToken);
  assert.ok(rec2.body.every((m: any) => m.item.id !== jobId)); // already applied jobs are hidden
  log('applied jobs disappear from recommendations');

  const list = await call('GET', `/jobs/${jobId}/applications`, employerToken);
  assert.equal(list.body[0].candidate.profile.fullName, 'Hari Sampath');

  const status = await call('PATCH', `/applications/${applied.body.id}/status`, employerToken, {
    status: 'interview', note: 'Please come on Friday at 10 AM',
  });
  assert.equal(status.body.status, 'interview');
  assert.equal((await call('PATCH', `/applications/${applied.body.id}/status`, employerToken, { status: 'bogus' })).status, 400);

  const mine = await call('GET', '/applications/mine', candidateToken);
  assert.equal(mine.body[0].status, 'interview');
  assert.equal(mine.body[0].history.length, 2);
  assert.equal(mine.body[0].job.companyName, 'Acme Tech');
  log('employer updated status, candidate sees it with history');

  // ---- 9. resume download + ownership rules ----
  const dl = await fetch(`${base}/applications/${applied.body.id}/resume`, { headers: { Authorization: `Bearer ${employerToken}` } });
  assert.equal(dl.status, 200);
  assert.ok((await dl.text()).includes('Hari Sampath'));

  const other = await call('POST', '/employers/register', undefined, { email: 'hr@other.com', password: 'secret123', companyName: 'Other Co' });
  assert.equal((await call('PUT', `/jobs/${jobId}`, other.body.token, { title: 'Hacked' })).status, 403);
  assert.equal((await call('GET', `/jobs/${jobId}/applications`, other.body.token)).status, 403);
  assert.equal((await call('PATCH', `/applications/${applied.body.id}/status`, other.body.token, { status: 'hired' })).status, 403);
  log('another employer cannot touch this job or its applications');

  // ---- 10. update / close / delete ----
  const closed = await call('PUT', `/jobs/${job2.body.id}`, employerToken, { status: 'closed' });
  assert.equal(closed.body.status, 'closed');
  assert.equal((await call('GET', '/jobs?q=scientist')).body.total, 0);
  assert.equal((await call('POST', `/jobs/${job2.body.id}/apply`, candidateToken, {})).status, 400);
  assert.equal((await call('DELETE', `/jobs/${job3.body.id}`, employerToken)).status, 204);
  assert.equal((await call('GET', `/jobs/${job3.body.id}`)).status, 404);
  const own = await call('GET', '/jobs/mine', employerToken);
  assert.equal(own.body.find((j: any) => j.id === jobId).applicationCount, 1);
  log('close and delete jobs, employer dashboard shows application counts');

  const profile = await call('PUT', '/candidates/me', candidateToken, { headline: 'Backend developer' });
  assert.equal(profile.body.profile.headline, 'Backend developer');
  assert.equal(profile.body.profile.fullName, 'Hari Sampath');
  assert.equal(profile.body.profile.experienceYears, 3);
  log('profile update keeps other fields');

  console.log('\nAll checks passed');
  server.close();
  fs.rmSync(tmp, { recursive: true, force: true });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
