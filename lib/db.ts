import Redis from 'ioredis';

// ============================================================================
// Constants
// ============================================================================

const CONFERENCES_KEY = 'conferences:all';
const PENDING_KEY = 'conferences:pending';
const CHANGELOG_KEY = 'conferences:changelog';
const MAX_CHANGELOG_ENTRIES = 50;

// ============================================================================
// Redis Client with Error Handling
// ============================================================================

function createRedisClient(): Redis {
  const redisUrl = process.env.REDIS_URL;

  if (!redisUrl) {
    console.error('REDIS_URL environment variable is not set');
  }

  const client = new Redis(redisUrl || '', {
    maxRetriesPerRequest: 3,
    retryStrategy(times) {
      const delay = Math.min(times * 100, 3000);
      console.log(`Redis retry attempt ${times}, waiting ${delay}ms`);
      return delay;
    },
    reconnectOnError(err) {
      console.error('Redis reconnect on error:', err.message);
      return true;
    },
  });

  client.on('error', (err) => {
    console.error('Redis Client Error:', err.message);
  });

  client.on('connect', () => {
    console.log('Redis connected successfully');
  });

  return client;
}

const redis = createRedisClient();

// ============================================================================
// Types
// ============================================================================

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
  date_added?: string;
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

export interface PendingConference {
  id: string;
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

export interface ChangelogEntry {
  id: string;
  timestamp: string;
  type: 'added' | 'updated' | 'verified' | 'discovered';
  conferenceName: string;
  details: string;
}

export interface PendingConferenceInput {
  name: string;
  deadline: string;
  abstract_deadline?: string;
  location: string;
  dates: string;
  description: string;
  requirements?: string;
  link: string;
  category: string;
  status: string;
  confidence_score: string;
}

// ============================================================================
// Conference Functions
// ============================================================================

export async function getAllConferences(): Promise<Conference[]> {
  try {
    const data = await redis.get(CONFERENCES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get conferences:', error);
    throw new Error(`Database read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function getConferencesNeedingVerification(): Promise<Conference[]> {
  const conferences = await getAllConferences();
  return conferences.filter(c =>
    ['low', 'needs-review', 'medium'].includes(c.confidence_score) &&
    c.status !== 'passed'
  ).sort((a, b) => {
    const aDate = new Date(a.deadline);
    const bDate = new Date(b.deadline);
    return aDate.getTime() - bDate.getTime();
  });
}

export async function updateConferenceDeadline(
  id: number,
  deadline: string,
  confidenceScore: string,
  sources: string[],
  verificationRecord: VerificationRecord
): Promise<void> {
  // Use WATCH for optimistic locking
  await redis.watch(CONFERENCES_KEY);

  try {
    const conferences = await getAllConferences();
    const index = conferences.findIndex(c => c.id === id);

    if (index !== -1) {
      const oldDeadline = conferences[index].deadline;
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

      const multi = redis.multi();
      multi.set(CONFERENCES_KEY, JSON.stringify(conferences));
      await multi.exec();

      // Add changelog entry if deadline changed
      if (oldDeadline !== deadline) {
        await addChangelogEntry({
          type: 'updated',
          conferenceName: conferences[index].name,
          details: `Deadline changed from ${oldDeadline} to ${deadline}`
        });
      } else {
        await addChangelogEntry({
          type: 'verified',
          conferenceName: conferences[index].name,
          details: `Deadline verified: ${deadline} (${confidenceScore} confidence)`
        });
      }
    }
  } finally {
    await redis.unwatch();
  }
}

export async function initializeDatabase(
  conferences: Omit<Conference, 'id' | 'verification_sources' | 'verification_history' | 'last_verified'>[]
) {
  const existing = await getAllConferences();

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

export async function setAllConferences(conferences: Conference[]): Promise<void> {
  await redis.set(CONFERENCES_KEY, JSON.stringify(conferences));
}

// ============================================================================
// Pending Conference Functions
// ============================================================================

export async function getPendingConferences(): Promise<PendingConference[]> {
  try {
    const data = await redis.get(PENDING_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get pending conferences:', error);
    throw new Error(`Database read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function addToPending(conference: PendingConferenceInput): Promise<boolean> {
  const pending = await getPendingConferences();
  const existing = await getAllConferences();

  // Check for duplicates using fuzzy name matching
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
    id: crypto.randomUUID(),
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

  await addChangelogEntry({
    type: 'discovered',
    conferenceName: conference.name,
    details: `Discovered and pending review`
  });

  return true;
}

export async function approvePendingConference(pendingId: string): Promise<boolean> {
  await redis.watch(PENDING_KEY, CONFERENCES_KEY);

  try {
    const pending = await getPendingConferences();
    const approvedIndex = pending.findIndex(c => c.id === pendingId);

    if (approvedIndex === -1) {
      return false;
    }

    const [approved] = pending.splice(approvedIndex, 1);
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

    const multi = redis.multi();
    multi.set(CONFERENCES_KEY, JSON.stringify([...conferences, newConference]));
    multi.set(PENDING_KEY, JSON.stringify(pending));
    await multi.exec();

    await addChangelogEntry({
      type: 'added',
      conferenceName: approved.name,
      details: `Added to tracker (deadline: ${approved.deadline})`
    });

    return true;
  } finally {
    await redis.unwatch();
  }
}

export async function dismissPendingConference(pendingId: string): Promise<boolean> {
  const pending = await getPendingConferences();
  const dismissIndex = pending.findIndex(c => c.id === pendingId);

  if (dismissIndex === -1) {
    return false;
  }

  pending.splice(dismissIndex, 1);
  await redis.set(PENDING_KEY, JSON.stringify(pending));
  return true;
}

// ============================================================================
// Changelog Functions
// ============================================================================

export async function getChangelog(limit: number = MAX_CHANGELOG_ENTRIES): Promise<ChangelogEntry[]> {
  try {
    const data = await redis.get(CHANGELOG_KEY);
    const entries: ChangelogEntry[] = data ? JSON.parse(data) : [];
    return entries.slice(0, limit);
  } catch (error) {
    console.error('Failed to get changelog:', error);
    return [];
  }
}

export async function addChangelogEntry(entry: Omit<ChangelogEntry, 'id' | 'timestamp'>): Promise<void> {
  try {
    const changelog = await getChangelog(MAX_CHANGELOG_ENTRIES - 1);

    const newEntry: ChangelogEntry = {
      id: crypto.randomUUID(),
      timestamp: new Date().toISOString(),
      ...entry
    };

    // Add to beginning (newest first), limit total entries
    const updated = [newEntry, ...changelog].slice(0, MAX_CHANGELOG_ENTRIES);
    await redis.set(CHANGELOG_KEY, JSON.stringify(updated));
  } catch (error) {
    console.error('Failed to add changelog entry:', error);
    // Non-critical, don't throw
  }
}

// ============================================================================
// Validation
// ============================================================================

export function validateConferenceData(conf: PendingConferenceInput): { valid: boolean; errors: string[] } {
  const errors: string[] = [];

  if (!conf.name || typeof conf.name !== 'string') errors.push('Missing or invalid name');
  if (!conf.deadline || !/^\d{4}-\d{2}-\d{2}$/.test(conf.deadline)) errors.push('Invalid deadline format');
  if (!conf.link || !conf.link.startsWith('http')) errors.push('Invalid link URL');
  if (!['safety', 'ml', 'nlp', 'ethics'].includes(conf.category)) errors.push('Invalid category');
  if (!['open', 'passed', 'rolling'].includes(conf.status)) errors.push('Invalid status');
  if (!['high', 'medium', 'low', 'needs-review'].includes(conf.confidence_score)) errors.push('Invalid confidence');

  return { valid: errors.length === 0, errors };
}
