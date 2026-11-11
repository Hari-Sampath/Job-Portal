import { config } from '../config';
import { Repository } from './repository';
import { Application, Candidate, Employer, Job } from '../types';

export const employers = new Repository<Employer>('employers', config.dataDir);
export const candidates = new Repository<Candidate>('candidates', config.dataDir);
export const jobs = new Repository<Job>('jobs', config.dataDir);
export const applications = new Repository<Application>('applications', config.dataDir);
