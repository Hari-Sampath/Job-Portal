import express from 'express';
import cors from 'cors';
import path from 'path';
import { employerAccounts, candidateAccounts } from './routes/accounts';
import candidateRoutes from './routes/candidates';
import jobRoutes from './routes/jobs';
import applicationRoutes from './routes/applications';
import { errorHandler, notFound } from './middleware/errors';

export const app = express();

app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, '../public'))); // the web page

app.get('/health', (_req, res) => {
  res.json({ status: 'ok' });
});

app.use('/api/employers', employerAccounts);
app.use('/api/candidates', candidateAccounts, candidateRoutes);
app.use('/api/jobs', jobRoutes);
app.use('/api', applicationRoutes);

app.use(notFound);
app.use(errorHandler);
