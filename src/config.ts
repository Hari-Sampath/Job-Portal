import 'dotenv/config';
import path from 'path';
import { Role } from './types';

export const config = {
  port: Number(process.env.PORT) || 3000,
  dataDir: path.resolve(process.env.DATA_DIR || 'data'),
  uploadDir: path.resolve(process.env.UPLOAD_DIR || 'uploads'),

  // Each role signs its tokens with its own secret
  jwtSecrets: {
    employer: process.env.EMPLOYER_JWT_SECRET || 'dev-employer-secret',
    candidate: process.env.CANDIDATE_JWT_SECRET || 'dev-candidate-secret',
  } as Record<Role, string>,
  jwtExpiresIn: '7d',

  smtp: {
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
    from: process.env.MAIL_FROM || 'Job Portal <no-reply@jobportal.local>',
  },
};
