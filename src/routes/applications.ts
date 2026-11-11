import { Router } from 'express';
import path from 'path';
import { config } from '../config';
import { applications, candidates, employers, jobs } from '../db';
import { HttpError } from '../middleware/errors';
import { requireAuth } from '../middleware/auth';
import { applySchema, statusSchema } from '../schemas';
import { matchScore } from '../services/recommend';
import { sendApplicationReceived, sendNewApplicant, sendStatusUpdate } from '../services/email';
import { candidateView } from '../services/views';
import { Application } from '../types';

// Mounted on /api, so the full paths are written here
const router = Router();

// ---------- Candidate: apply to a job ----------
router.post('/jobs/:id/apply', requireAuth('candidate'), (req, res) => {
  const job = jobs.findById(String(req.params.id));
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.status !== 'open') throw new HttpError(400, 'This job is closed');

  const candidate = candidates.findById(req.user!.id)!;
  const alreadyApplied = applications.where((a) => a.jobId === job.id && a.candidateId === candidate.id);
  if (alreadyApplied.length > 0) throw new HttpError(409, 'You already applied to this job');

  const { coverLetter } = applySchema.parse(req.body);
  const application = applications.create({
    jobId: job.id,
    candidateId: candidate.id,
    coverLetter,
    status: 'applied',
    matchScore: matchScore(job, candidate.profile).score,
    history: [{ status: 'applied', at: new Date().toISOString() }],
  });

  // emails are sent in the background, we do not wait for them
  const employer = employers.findById(job.employerId);
  sendApplicationReceived(candidate.email, candidate.profile.fullName, job.title);
  if (employer) sendNewApplicant(employer.email, candidate.profile.fullName, job.title);

  res.status(201).json(application);
});

// ---------- Candidate: track my applications ----------
router.get('/applications/mine', requireAuth('candidate'), (req, res) => {
  const mine = applications.where((a) => a.candidateId === req.user!.id);
  res.json(
    mine.map((a) => {
      const job = jobs.findById(a.jobId);
      return {
        ...a,
        job: job && {
          id: job.id,
          title: job.title,
          location: job.location,
          companyName: employers.findById(job.employerId)?.profile.companyName,
        },
      };
    })
  );
});

// ---------- Employer: see applicants of one of my jobs ----------
router.get('/jobs/:id/applications', requireAuth('employer'), (req, res) => {
  const job = jobs.findById(String(req.params.id));
  if (!job) throw new HttpError(404, 'Job not found');
  if (job.employerId !== req.user!.id) throw new HttpError(403, 'This job belongs to another employer');

  const status = req.query.status;
  const list = applications
    .where((a) => a.jobId === job.id && (!status || a.status === status))
    .sort((a, b) => b.matchScore - a.matchScore); // best match first

  res.json(list.map((a) => ({ ...a, candidate: candidateView(candidates.findById(a.candidateId)!) })));
});

// ---------- Employer: change application status (sends an email) ----------
router.patch('/applications/:id/status', requireAuth('employer'), (req, res) => {
  const application = applications.findById(String(req.params.id));
  if (!application) throw new HttpError(404, 'Application not found');

  const job = jobs.findById(application.jobId)!;
  if (job.employerId !== req.user!.id) throw new HttpError(403, 'This application is for another employer');

  const { status, note } = statusSchema.parse(req.body);
  const updated = applications.update(application.id, {
    status,
    history: [...application.history, { status, at: new Date().toISOString(), note }],
  })!;

  const candidate = candidates.findById(application.candidateId)!;
  sendStatusUpdate(candidate.email, candidate.profile.fullName, job.title, status, note);

  res.json(updated);
});

// ---------- Download the resume of an application ----------
// Allowed for the candidate who applied and for the employer who owns the job
router.get('/applications/:id/resume', requireAuth('employer', 'candidate'), (req, res) => {
  const application: Application | undefined = applications.findById(String(req.params.id));
  if (!application) throw new HttpError(404, 'Application not found');

  const job = jobs.findById(application.jobId)!;
  const user = req.user!;
  const allowed =
    (user.role === 'candidate' && application.candidateId === user.id) ||
    (user.role === 'employer' && job.employerId === user.id);
  if (!allowed) throw new HttpError(403, 'Not allowed');

  const file = candidates.findById(application.candidateId)?.profile.resumeFile;
  if (!file) throw new HttpError(404, 'This candidate has not uploaded a resume');
  res.download(path.join(config.uploadDir, file));
});

export default router;
