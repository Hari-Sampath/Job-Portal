import nodemailer from 'nodemailer';
import { config } from '../config';
import { ApplicationStatus } from '../types';

// With SMTP settings in .env emails are really sent.
// Without them, emails are only printed in the console (good for development).
const useSmtp = Boolean(config.smtp.host);

const transporter = useSmtp
  ? nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      auth: { user: config.smtp.user, pass: config.smtp.pass },
    })
  : nodemailer.createTransport({ jsonTransport: true });

// Never throws: a failed email must not break the API request
async function sendMail(to: string, subject: string, text: string) {
  try {
    await transporter.sendMail({ from: config.smtp.from, to, subject, text });
    if (!useSmtp) console.log(`[email] to: ${to} | subject: ${subject}`);
  } catch (err) {
    console.error('Email failed:', err);
  }
}

export function sendApplicationReceived(to: string, name: string, jobTitle: string) {
  return sendMail(to, `Application received: ${jobTitle}`, `Hi ${name},\n\nWe received your application for "${jobTitle}".`);
}

export function sendNewApplicant(to: string, candidateName: string, jobTitle: string) {
  return sendMail(to, `New applicant for ${jobTitle}`, `${candidateName} applied for "${jobTitle}".`);
}

export function sendStatusUpdate(to: string, name: string, jobTitle: string, status: ApplicationStatus, note?: string) {
  const extra = note ? `\n\nMessage from the employer: ${note}` : '';
  return sendMail(
    to,
    `Application update: ${jobTitle}`,
    `Hi ${name},\n\nYour application for "${jobTitle}" is now: ${status}.${extra}`
  );
}
