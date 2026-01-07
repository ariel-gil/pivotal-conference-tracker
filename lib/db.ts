import Redis from 'ioredis';

// Initialize Redis client from REDIS_URL
const redis = new Redis(process.env.REDIS_URL || '');

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
  date_added?: string;  // When the conference was added to the tracker
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
  const data = await redis.get(CONFERENCES_KEY);
  return data ? JSON.parse(data) : [];
}

// Get conferences that need verification (speculative deadlines)
export async function getConferencesNeedingVerification(): Promise<Conference[]> {
  const conferences = await getAllConferences();
  return conferences.filter(c =>
    ['low', 'needs-review', 'medium'].includes(c.confidence_score) &&
    c.status !== 'passed'
  ).sort((a, b) => {
    // Sort by deadline (earliest first) to prioritize urgent conferences
    const aDate = new Date(a.deadline);
    const bDate = new Date(b.deadline);
    return aDate.getTime() - bDate.getTime();
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

    await redis.set(CONFERENCES_KEY, JSON.stringify(conferences));
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

    await redis.set(CONFERENCES_KEY, JSON.stringify(initializedConferences));
  }
}

// Set all conferences (useful for updates)
export async function setAllConferences(conferences: Conference[]): Promise<void> {
  await redis.set(CONFERENCES_KEY, JSON.stringify(conferences));
}

// ============================================================================
// Pending Conference Management (for admin review)
// ============================================================================

const PENDING_KEY = 'conferences:pending';

export interface PendingConference {
  id: string;  // UUID for safe identification
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
  confidence_score: string;
  addedAt: string;
}

// Get pending conferences awaiting review
export async function getPendingConferences(): Promise<PendingConference[]> {
  const data = await redis.get(PENDING_KEY);
  return data ? JSON.parse(data) : [];
}

// Add conference to pending list with UUID and duplicate detection
export async function addToPending(conference: any): Promise<boolean> {
  const pending = await getPendingConferences();

  // Check for duplicates using fuzzy name matching
  const existing = await getAllConferences();
  const normalizedName = conference.name.toLowerCase().replace(/\s+/g, ' ').trim();

  const isDuplicate = [...existing, ...pending].some(c => {
    const existingName = c.name.toLowerCase().replace(/\s+/g, ' ').trim();
    return existingName === normalizedName ||
      existingName.includes(normalizedName) ||
      normalizedName.includes(existingName);
  });

  if (isDuplicate) {
    console.log(`Skipping duplicate conference: ${conference.name}`);
    return false;
  }

  const pendingConference: PendingConference = {
    id: crypto.randomUUID(),  // Unique ID for safe operations
    name: conference.name,
    deadline: conference.deadline,
    abstract_deadline: conference.abstract_deadline,
    location: conference.location,
    dates: conference.dates,
    description: conference.description,
    requirements: conference.requirements || 'See conference website',
    link: conference.link,
    category: conference.category,
    status: conference.status,
    confidence_score: conference.confidence_score,
    addedAt: new Date().toISOString()
  };

  await redis.set(PENDING_KEY, JSON.stringify([...pending, pendingConference]));
  return true;
}

// Approve pending conference by UUID (move to main list)
export async function approvePendingConference(pendingId: string): Promise<boolean> {
  const pending = await getPendingConferences();
  const approvedIndex = pending.findIndex(c => c.id === pendingId);

  if (approvedIndex === -1) {
    return false;  // Conference not found
  }

  const [approved] = pending.splice(approvedIndex, 1);

  // Add to main conferences
  const conferences = await getAllConferences();
  const nextId = conferences.length > 0 ? Math.max(...conferences.map(c => c.id)) + 1 : 1;

  const newConference: Conference = {
    id: nextId,
    name: approved.name,
    deadline: approved.deadline,
    abstract_deadline: approved.abstract_deadline,
    location: approved.location,
    dates: approved.dates,
    description: approved.description,
    requirements: approved.requirements || 'See conference website',
    link: approved.link,
    category: approved.category,
    status: approved.status,
    confidence_score: approved.confidence_score as Conference['confidence_score'],
    verification_sources: [],
    date_added: new Date().toISOString(),
    verification_history: []
  };

  await setAllConferences([...conferences, newConference]);
  await redis.set(PENDING_KEY, JSON.stringify(pending));
  return true;
}

// Dismiss pending conference by UUID
export async function dismissPendingConference(pendingId: string): Promise<boolean> {
  const pending = await getPendingConferences();
  const dismissIndex = pending.findIndex(c => c.id === pendingId);

  if (dismissIndex === -1) {
    return false;  // Conference not found
  }

  pending.splice(dismissIndex, 1);
  await redis.set(PENDING_KEY, JSON.stringify(pending));
  return true;
}

// Validate conference data from LLM
export function validateConferenceData(conf: any): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!conf.name || typeof conf.name !== 'string') errors.push('Missing or invalid name');
  if (!conf.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(conf.deadline)) errors.push('Invalid deadline format');
  if (!conf.link || !conf.link.startsWith('http')) errors.push('Invalid link URL');
  if (!['safety', 'ml', 'nlp', 'ethics'].includes(conf.category)) errors.push('Invalid category');
  if (!['open', 'passed', 'rolling'].includes(conf.status)) errors.push('Invalid status');
  if (!['high', 'medium', 'low', 'needs-review'].includes(conf.confidence_score)) errors.push('Invalid confidence');

  return { valid: errors.length === 0, errors };
}
