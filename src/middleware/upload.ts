import fs from 'fs';
import path from 'path';
import multer from 'multer';
import { config } from '../config';
import { HttpError } from './errors';

fs.mkdirSync(config.uploadDir, { recursive: true });

const allowedTypes = ['.pdf', '.docx', '.txt'];

// Saves resumes as <candidateId>-<timestamp>.<ext>. Needs req.user, so use it after requireAuth.
export const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, config.uploadDir),
    filename: (req, file, cb) =>
      cb(null, `${req.user!.id}-${Date.now()}${path.extname(file.originalname).toLowerCase()}`),
  }),
  limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (allowedTypes.includes(ext)) cb(null, true);
    else cb(new HttpError(400, 'Resume must be a PDF, DOCX or TXT file'));
  },
});
