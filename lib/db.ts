import { kv } from '@vercel/kv';

export interface Conference {
  id: number;
  name: string;
  deadline: string;
  abstract_deadline?: string;
  location: string;
  dates: string;
  description: string;
  requirements: string;
  link: string;
  category: string;
  status: string;
  confidence_score: 'high' | 'medium' | 'low' | 'needs-review';
  verification_sources: string[];
  last_verified?: string;
  verification_history: VerificationRecord[];
}

export interface VerificationRecord {
  timestamp: string;
  old_deadline?: string;
  new_deadline: string;
  confidence: string;
  sources: string[];
  model_results: ModelResult[];
}

export interface ModelResult {
  model: string;
  deadline: string;
  confidence: string;
  source: string;
  search_number: number;
}

const CONFERENCES_KEY = 'conferences:all';

// Get all conferences
export async function getAllConferences(): Promise<Conference[]> {
  const conferences = await kv.get<Conference[]>(CONFERENCES_KEY);
  return conferences || [];
}

// Get conferences that need verification (speculative deadlines)
export async function getConferencesNeedingVerification(): Promise<Conference[]> {
  const conferences = await getAllConferences();
  return conferences.filter(c =>
    ['low', 'needs-review', 'medium'].includes(c.confidence_score) &&
    c.status !== 'passed'
  ).sort((a, b) => {
    const aTime = a.last_verified ? new Date(a.last_verified).getTime() : 0;
    const bTime = b.last_verified ? new Date(b.last_verified).getTime() : 0;
    return aTime - bTime;
  });
}

// Update conference deadline and verification info
export async function updateConferenceDeadline(
  id: number,
  deadline: string,
  confidenceScore: string,
  sources: string[],
  verificationRecord: VerificationRecord
): Promise<void> {
  const conferences = await getAllConferences();
  const index = conferences.findIndex(c => c.id === id);

  if (index !== -1) {
    conferences[index] = {
      ...conferences[index],
      deadline,
      confidence_score: confidenceScore as Conference['confidence_score'],
      verification_sources: sources,
      last_verified: new Date().toISOString(),
      verification_history: [
        ...conferences[index].verification_history,
        verificationRecord
      ]
    };

    await kv.set(CONFERENCES_KEY, conferences);
  }
}

// Initialize database with seed data
export async function initializeDatabase(
  conferences: Omit<Conference, 'id' | 'verification_sources' | 'verification_history' | 'last_verified'>[]
) {
  const existing = await getAllConferences();

  // Only initialize if empty
  if (existing.length === 0) {
    const initializedConferences: Conference[] = conferences.map((conf, index) => ({
      ...conf,
      id: index + 1,
      verification_sources: [],
      verification_history: [],
      last_verified: undefined
    }));

    await kv.set(CONFERENCES_KEY, initializedConferences);
  }
}

// Set all conferences (useful for updates)
export async function setAllConferences(conferences: Conference[]): Promise<void> {
  await kv.set(CONFERENCES_KEY, conferences);
}
