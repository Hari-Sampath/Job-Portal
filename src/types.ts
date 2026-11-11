// ---------- Shared building blocks (generics) ----------

export type Role = 'employer' | 'candidate';

export interface BaseEntity {
  id: string;
  createdAt: string;
  updatedAt: string;
}

// One account shape for both roles: R = the role, P = the profile type for that role
export interface Account<R extends Role, P> extends BaseEntity {
  role: R;
  email: string;
  passwordHash: string;
  profile: P;
}

export interface Paginated<T> {
  items: T[];
  page: number;
  limit: number;
  total: number;
  totalPages: number;
}

// A scored match, used both for "jobs for a candidate" and "candidates for a job"
export interface Ranked<T> {
  item: T;
  score: number;
  matchedSkills: string[];
  missingSkills: string[];
}

// ---------- Employer / Candidate ----------

export interface EmployerProfile {
  companyName: string;
  industry?: string;
  website?: string;
  location?: string;
  description?: string;
}

export interface CandidateProfile {
  fullName: string;
  headline?: string;
  location?: string;
  phone?: string;
  summary?: string;
  skills: string[];
  experienceYears: number;
  expectedSalary?: number;
  resumeFile?: string; // file name inside the uploads folder
  resumeText?: string; // text extracted from the resume, used for search
}

export type Employer = Account<'employer', EmployerProfile>;
export type Candidate = Account<'candidate', CandidateProfile>;
export type User = Employer | Candidate; // union type

// ---------- Jobs / Applications ----------

export const JOB_TYPES = ['full-time', 'part-time', 'contract', 'internship'] as const;
export type JobType = (typeof JOB_TYPES)[number];

export interface Job extends BaseEntity {
  employerId: string;
  title: string;
  description: string;
  location: string;
  remote: boolean;
  jobType: JobType;
  salaryMin: number; // yearly
  salaryMax: number; // yearly
  minExperience: number; // years
  skills: string[];
  status: 'open' | 'closed';
}

export const APPLICATION_STATUSES = [
  'applied',
  'reviewing',
  'shortlisted',
  'interview',
  'rejected',
  'hired',
] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export interface Application extends BaseEntity {
  jobId: string;
  candidateId: string;
  coverLetter?: string;
  status: ApplicationStatus;
  matchScore: number; // how well the candidate matched the job when applying
  history: { status: ApplicationStatus; at: string; note?: string }[];
}
