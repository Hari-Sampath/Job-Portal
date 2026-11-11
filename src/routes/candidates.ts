import { Router } from 'express';
import fs from 'fs/promises';
import path from 'path';
import { config } from '../config';
import { applications, candidates, employers, jobs } from '../db';
import { HttpError } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { upload } from '../middleware/upload';
import { candidateSearchSchema, limitSchema } from '../schemas';
import { fullTextSearch, paginate, parseList } from '../services/search';
import { matchScore, rank } from '../services/recommend';
import { parseResume } from '../services/resumeParser';
import { candidateView, toPublic } from '../services/views';

// Extra candidate routes. Register / login / profile are in accounts.ts
const router = Router();

// ---------- Candidate: upload resume ----------
// The file is parsed and the profile is filled in (skills, phone, experience)
router.post('/me/resume', requireAuth('candidate'), upload.single('resume'), async (req, res) => {
  if (!req.file) throw new HttpError(400, 'Attach a file in the "resume" field');

  const candidate = candidates.findById(req.user!.id)!;
  const old = candidate.profile;
  const parsed = await parseResume(req.file.path);

  // remove the previous resume file
  if (old.resumeFile) await fs.rm(path.join(config.uploadDir, old.resumeFile), { force: true });

  // keep what the candidate already entered and add what was found in the resume
  const updated = candidates.update(candidate.id, {
    profile: {
      ...old,
      resumeFile: req.file.filename,
      resumeText: parsed.text,
      phone: old.phone ?? parsed.phone,
      skills: [...new Set([...old.skills, ...parsed.skills])],
      experienceYears: Math.max(old.experienceYears, parsed.experienceYears),
    },
  })!;

  res.json({
    message: 'Resume uploaded and parsed',
    parsed: {
      email: parsed.email,
      phone: parsed.phone,
      skills: parsed.skills,
      experienceYears: parsed.experienceYears,
    },
    account: toPublic(updated),
  });
});

// ---------- Candidate: recommended jobs ----------
router.get('/me/recommendations', requireAuth('candidate'), (req, res) => {
  const candidate = candidates.findById(req.user!.id)!;
  const { limit } = limitSchema.parse(req.query);

  const appliedJobIds = applications.where((a) => a.candidateId === candidate.id).map((a) => a.jobId);
  const openJobs = jobs.where((j) => j.status === 'open' && !appliedJobIds.includes(j.id));

  const matches = rank(openJobs, (job) => matchScore(job, candidate.profile), limit);
  res.json(
    matches.map((m) => ({
      ...m,
      item: { ...m.item, companyName: employers.findById(m.item.employerId)?.profile.companyName },
    }))
  );
});

// ---------- Employer: search candidates ----------
router.get('/search', requireAuth('employer'), (req, res) => {
  const f = candidateSearchSchema.parse(req.query);
  const requiredSkills = parseList(f.skills);

  let list = candidates.all();
  if (f.location) list = list.filter((c) => c.profile.location?.toLowerCase().includes(f.location!.toLowerCase()));
  if (f.minExperience !== undefined) list = list.filter((c) => c.profile.experienceYears >= f.minExperience!);
  if (f.maxExperience !== undefined) list = list.filter((c) => c.profile.experienceYears <= f.maxExperience!);
  if (f.maxSalary !== undefined) {
    list = list.filter((c) => !c.profile.expectedSalary || c.profile.expectedSalary <= f.maxSalary!);
  }
  if (requiredSkills.length) list = list.filter((c) => requiredSkills.every((s) => c.profile.skills.includes(s)));

  if (f.q) {
    list = fullTextSearch(list, f.q, [
      { text: (c) => c.profile.headline ?? '', weight: 3 },
      { text: (c) => c.profile.skills.join(' '), weight: 3 },
      { text: (c) => c.profile.fullName, weight: 2 },
      { text: (c) => c.profile.summary ?? '', weight: 1 },
      { text: (c) => c.profile.resumeText ?? '', weight: 1 },
    ]);
  }

  const result = paginate(list, f.page, f.limit);
  res.json({ ...result, items: result.items.map(candidateView) });
});

export default router;
