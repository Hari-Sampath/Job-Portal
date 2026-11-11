import fs from 'fs/promises';
import path from 'path';
import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export interface ParsedResume {
  text: string;
  email?: string;
  phone?: string;
  skills: string[];
  experienceYears: number;
}

// Skills we look for in a resume. Add more here as needed.
const KNOWN_SKILLS = [
  'javascript', 'typescript', 'node.js', 'express', 'react', 'angular', 'vue', 'next.js', 'html', 'css',
  'java', 'spring boot', 'python', 'django', 'flask', 'c', 'c++', 'c#', '.net', 'rust', 'php', 'kotlin', 'swift',
  'sql', 'mysql', 'postgresql', 'mongodb', 'redis', 'firebase',
  'docker', 'kubernetes', 'aws', 'azure', 'gcp', 'git', 'linux', 'jenkins', 'ci/cd',
  'graphql', 'microservices', 'kafka', 'rabbitmq',
  'machine learning', 'deep learning', 'tensorflow', 'pytorch', 'pandas', 'numpy', 'cuda', 'opencv',
  'unity', 'unreal engine', 'figma', 'excel', 'communication', 'leadership',
];

// Different spellings of the same skill
const ALIASES: Record<string, string> = {
  nodejs: 'node.js',
  'node js': 'node.js',
  reactjs: 'react',
  postgres: 'postgresql',
  mongo: 'mongodb',
  expressjs: 'express',
  golang: 'go',
  'rest api': 'rest',
  restful: 'rest',
};

export async function parseResume(filePath: string): Promise<ParsedResume> {
  const text = await extractText(filePath);
  const lower = text.toLowerCase();

  return {
    text,
    email: text.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0],
    phone: text.match(/(?:\+\d{1,3}[\s-]?)?\d{10}\b/)?.[0],
    skills: findSkills(lower),
    experienceYears: findExperience(lower),
  };
}

async function extractText(filePath: string): Promise<string> {
  const ext = path.extname(filePath).toLowerCase();
  if (ext === '.pdf') return readPdf(await fs.readFile(filePath));
  if (ext === '.docx') return (await mammoth.extractRawText({ path: filePath })).value;
  return fs.readFile(filePath, 'utf-8'); // .txt
}

async function readPdf(data: Buffer): Promise<string> {
  const parser = new PDFParse({ data });
  try {
    return (await parser.getText()).text;
  } finally {
    await parser.destroy();
  }
}

function findSkills(lowerText: string): string[] {
  const found = new Set<string>();
  const candidates = [...KNOWN_SKILLS, ...Object.keys(ALIASES)];

  for (const word of candidates) {
    const escaped = word.replace(/[.*+?^${}()|[\]\\/]/g, '\\$&');
    // the word must not be glued to other letters/digits ("c" should not match inside "react" or "c++")
    if (new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9+#])`).test(lowerText)) {
      found.add(ALIASES[word] ?? word);
    }
  }
  return [...found].sort();
}

// Looks for phrases like "3 years of experience" or "experience: 5 years"
function findExperience(lowerText: string): number {
  const patterns = [
    /(\d{1,2})\+?\s*(?:years?|yrs?)\s*(?:of\s*)?(?:\w+\s+){0,2}experience/g,
    /experience\s*(?:of|:)?\s*(\d{1,2})\+?\s*(?:years?|yrs?)/g,
  ];
  const years = patterns.flatMap((p) => [...lowerText.matchAll(p)].map((m) => Number(m[1])));
  return years.length ? Math.max(...years) : 0;
}
