import { CandidateProfile, Job, Ranked } from '../types';

interface Match {
  score: number; // 0 - 100
  matchedSkills: string[];
  missingSkills: string[];
}

// How well does a candidate fit a job? Used in both directions:
// recommending jobs to a candidate, and recommending candidates to an employer.
//   skills 60 points + experience 20 + location 10 + salary 10
export function matchScore(job: Job, candidate: CandidateProfile): Match {
  const matchedSkills = job.skills.filter((s) => candidate.skills.includes(s));
  const missingSkills = job.skills.filter((s) => !candidate.skills.includes(s));

  // no common skill means it is not a match at all
  if (job.skills.length > 0 && matchedSkills.length === 0) {
    return { score: 0, matchedSkills, missingSkills };
  }

  const skillPoints = job.skills.length ? (matchedSkills.length / job.skills.length) * 60 : 60;

  const experiencePoints =
    job.minExperience > 0 ? Math.min(candidate.experienceYears / job.minExperience, 1) * 20 : 20;

  const sameCity = Boolean(
    candidate.location && job.location.toLowerCase().includes(candidate.location.toLowerCase())
  );
  const locationPoints = job.remote || sameCity ? 10 : 0;

  const salaryPoints = !candidate.expectedSalary || candidate.expectedSalary <= job.salaryMax ? 10 : 0;

  return {
    score: Math.round(skillPoints + experiencePoints + locationPoints + salaryPoints),
    matchedSkills,
    missingSkills,
  };
}

// Generic ranking: give it any list and a function that scores one item
export function rank<T>(items: T[], scoreFn: (item: T) => Match, limit: number): Ranked<T>[] {
  return items
    .map((item) => ({ item, ...scoreFn(item) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}
