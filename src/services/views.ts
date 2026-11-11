import { Candidate, User } from '../types';

// Remove the password hash before sending an account to the client
export function toPublic<A extends User>(account: A): Omit<A, 'passwordHash'> {
  const { passwordHash, ...rest } = account;
  return rest;
}

// What an employer is allowed to see about a candidate (no resume text or file path)
export function candidateView(c: Candidate) {
  const { resumeFile, resumeText, ...profile } = c.profile;
  return { id: c.id, email: c.email, profile: { ...profile, hasResume: Boolean(resumeFile) } };
}
