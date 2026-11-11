import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { Repository } from '../db/repository';
import { employers, candidates } from '../db';
import { HttpError } from '../middleware/errors';
import { requireAuth, signToken } from '../middleware/auth';
import { employerProfileSchema, candidateProfileSchema } from '../schemas';
import { toPublic } from '../services/views';
import { BaseEntity, Candidate, Employer, User } from '../types';

const credentialsSchema = z.object({
  email: z.string().email().transform((e) => e.toLowerCase()),
  password: z.string().min(6),
});

// One router builder for both roles. A is Employer or Candidate:
// the register / login / profile logic is identical, only the profile fields differ.
function createAccountRouter<A extends User>(
  role: A['role'],
  repo: Repository<A>,
  profileSchema: z.AnyZodObject
) {
  const router = Router();

  router.post('/register', async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const profile = profileSchema.parse(req.body);

    if (repo.where((a) => a.email === email).length > 0) {
      throw new HttpError(409, 'Email is already registered');
    }

    const account = repo.create({
      role,
      email,
      passwordHash: await bcrypt.hash(password, 10),
      profile,
    } as unknown as Omit<A, keyof BaseEntity>);

    res.status(201).json({ token: signToken({ id: account.id, role }), account: toPublic(account) });
  });

  router.post('/login', async (req, res) => {
    const { email, password } = credentialsSchema.parse(req.body);
    const account = repo.where((a) => a.email === email)[0];

    if (!account || !(await bcrypt.compare(password, account.passwordHash))) {
      throw new HttpError(401, 'Wrong email or password');
    }
    res.json({ token: signToken({ id: account.id, role }), account: toPublic(account) });
  });

  router.get('/me', requireAuth(role), (req, res) => {
    const account = repo.findById(req.user!.id);
    if (!account) throw new HttpError(404, 'Account not found');
    res.json(toPublic(account));
  });

  router.put('/me', requireAuth(role), (req, res) => {
    const account = repo.findById(req.user!.id);
    if (!account) throw new HttpError(404, 'Account not found');

    const changes = profileSchema.partial().parse(req.body);
    const updated = repo.update(account.id, {
      profile: { ...account.profile, ...changes },
    } as unknown as Partial<Omit<A, keyof BaseEntity>>);
    res.json(toPublic(updated!));
  });

  return router;
}

export const employerAccounts = createAccountRouter<Employer>('employer', employers, employerProfileSchema);
export const candidateAccounts = createAccountRouter<Candidate>('candidate', candidates, candidateProfileSchema);
