import { z } from 'zod';
import { APPLICATION_STATUSES, JOB_TYPES } from './types';

// Skills are stored lowercase and without duplicates so matching is easy
const skills = z
  .array(z.string())
  .transform((list) => [...new Set(list.map((s) => s.trim().toLowerCase()).filter(Boolean))]);

export const employerProfileSchema = z.object({
  companyName: z.string().min(2),
  industry: z.string().optional(),
  website: z.string().url().optional(),
  location: z.string().optional(),
  description: z.string().optional(),
});

export const candidateProfileSchema = z.object({
  fullName: z.string().min(2),
  headline: z.string().optional(),
  location: z.string().optional(),
  phone: z.string().optional(),
  summary: z.string().optional(),
  skills: skills.default([]),
  experienceYears: z.number().min(0).max(50).default(0),
  expectedSalary: z.number().positive().optional(),
});

export const jobBaseSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  location: z.string().min(2),
  remote: z.boolean().default(false),
  jobType: z.enum(JOB_TYPES).default('full-time'),
  salaryMin: z.number().nonnegative(),
  salaryMax: z.number().nonnegative(),
  minExperience: z.number().min(0).default(0),
  skills,
});

export const createJobSchema = jobBaseSchema.refine((j) => j.salaryMax >= j.salaryMin, {
  message: 'salaryMax must be greater than or equal to salaryMin',
  path: ['salaryMax'],
});

export const updateJobSchema = jobBaseSchema
  .partial()
  .extend({ status: z.enum(['open', 'closed']).optional() });

// Query strings arrive as text, so numbers use z.coerce
const page = {
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(50).default(10),
};

export const jobSearchSchema = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  jobType: z.enum(JOB_TYPES).optional(),
  remote: z.enum(['true', 'false']).optional(),
  minSalary: z.coerce.number().optional(),
  maxSalary: z.coerce.number().optional(),
  experience: z.coerce.number().optional(), // candidate's years: shows jobs they qualify for
  skills: z.string().optional(), // comma separated, job must require all of them
  ...page,
});

export const candidateSearchSchema = z.object({
  q: z.string().optional(),
  location: z.string().optional(),
  skills: z.string().optional(), // comma separated, candidate must have all of them
  minExperience: z.coerce.number().optional(),
  maxExperience: z.coerce.number().optional(),
  maxSalary: z.coerce.number().optional(),
  ...page,
});

export const applySchema = z.object({
  coverLetter: z.string().max(3000).optional(),
});

export const statusSchema = z.object({
  status: z.enum(APPLICATION_STATUSES),
  note: z.string().max(500).optional(),
});

export const limitSchema = z.object({
  limit: z.coerce.number().int().min(1).max(50).default(10),
});
