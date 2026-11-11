import { Router } from 'express';
import { applications, candidates, employers, jobs } from '../db';
import { HttpError } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { createJobSchema, jobSearchSchema, limitSchema, updateJobSchema } from '../schemas';
import { fullTextSearch, paginate, parseList } from '../services/search';
import { matchScore, rank } from '../services/recommend';
import { candidateView } from '../services/views';
import { Job } from '../types';

const router = Router();

// Adds the company name to a job before sending it to the client
function withCompany(job: Job) {
  return { ...job, companyName: employers.findById(job.employerId)?.profile.companyName };
}

// Finds a job and makes sure it belongs to the logged in employer
function getOwnJob(jobId: string, employerId: string): Job {
  const job = jobs.findById(jobId);
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.employerId !== employerId) throw new HttpError(403, 'This job belongs to another employer');
  return job;
}

// ---------- Public: search jobs ----------
router.get('/', (req, res) => {
  const f = jobSearchSchema.parse(req.query);
  const requiredSkills = parseList(f.skills);

  // 1. filters
  let list = jobs.where((j) => j.status === 'open');
  if (f.location) list = list.filter((j) => j.location.toLowerCase().includes(f.location!.toLowerCase()));
  if (f.jobType) list = list.filter((j) => j.jobType === f.jobType);
  if (f.remote) list = list.filter((j) => j.remote === (f.remote === 'true'));
  if (f.minSalary !== undefined) list = list.filter((j) => j.salaryMax >= f.minSalary!);
  if (f.maxSalary !== undefined) list = list.filter((j) => j.salaryMin <= f.maxSalary!);
  if (f.experience !== undefined) list = list.filter((j) => j.minExperience <= f.experience!);
  if (requiredSkills.length) list = list.filter((j) => requiredSkills.every((s) => j.skills.includes(s)));

  // 2. text search (best match first) or newest first when there is no search text
  if (f.q) {
    list = fullTextSearch(list, f.q, [
      { text: (j) => j.title, weight: 3 },
      { text: (j) => j.skills.join(' '), weight: 2 },
      { text: (j) => employers.findById(j.employerId)?.profile.companyName ?? '', weight: 2 },
      { text: (j) => j.description, weight: 1 },
    ]);
  } else {
    list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  }

  const result = paginate(list, f.page, f.limit);
  res.json({ ...result, items: result.items.map(withCompany) });
});

// ---------- Employer: manage own jobs ----------
router.post('/', requireAuth('employer'), (req, res) => {
  const data = createJobSchema.parse(req.body);
  const job = jobs.create({ ...data, employerId: req.user!.id, status: 'open' });
  res.status(201).json(withCompany(job));
});

// must be above "/:id", otherwise "mine" would be treated as an id
router.get('/mine', requireAuth('employer'), (req, res) => {
  const own = jobs.where((j) => j.employerId === req.user!.id);
  res.json(
    own.map((j) => ({
      ...j,
      applicationCount: applications.where((a) => a.jobId === j.id).length,
    }))
  );
});

router.get('/:id', (req, res) => {
  const job = jobs.findById(String(req.params.id));
  if (!job) throw new HttpError(404, 'Job not found');
  res.json(withCompany(job));
});

router.put('/:id', requireAuth('employer'), (req, res) => {
  const job = getOwnJob(String(req.params.id), req.user!.id);
  const changes = updateJobSchema.parse(req.body);

  const salaryMin = changes.salaryMin ?? job.salaryMin;
  const salaryMax = changes.salaryMax ?? job.salaryMax;
  if (salaryMax < salaryMin) throw new HttpError(400, 'salaryMax must be greater than or equal to salaryMin');

  res.json(withCompany(jobs.update(job.id, changes)!));
});

router.delete('/:id', requireAuth('employer'), (req, res) => {
  const job = getOwnJob(String(req.params.id), req.user!.id);
  jobs.remove(job.id);
  res.status(204).send();
});

// ---------- Employer: best candidates for a job ----------
router.get('/:id/recommended-candidates', requireAuth('employer'), (req, res) => {
  const job = getOwnJob(String(req.params.id), req.user!.id);
  const { limit } = limitSchema.parse(req.query);

  const matches = rank(candidates.all(), (c) => matchScore(job, c.profile), limit);
  res.json(matches.map((m) => ({ ...m, item: candidateView(m.item) })));
});

export default router;
