import Redis from 'ioredis';
import { ConferenceTier, assignTier, VALID_TIERS } from './tiers';

// ============================================================================
// Constants
// ============================================================================

const CONFERENCES_KEY = 'conferences:all';
const PENDING_KEY = 'conferences:pending';
const PENDING_UPDATES_KEY = 'conferences:pending_updates';
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

/**
 * Represents a confirmed, public-facing conference in the tracker.
 * These are displayed on the main dashboard.
 */
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
  tier: ConferenceTier;
  review_status: 'unreviewed' | 'reviewed' | 'speculative';
  confidence_score: 'high' | 'medium' | 'low' | 'needs-review';
  verification_sources: string[];
  last_verified?: string;
  date_added?: string;
  verification_history: VerificationRecord[];
}

/**
 * Record of a single verification run for audit history.
 */
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

/**
 * Represents a discovered conference waiting in the admin queue.
 * These require approval before becoming public 'Conference' objects.
 */
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
  tier?: ConferenceTier;
  confidence_score: string;
  addedAt: string;
}

/**
 * Represents an AI-suggested update to an existing conference.
 * These require admin approval when the conference has review_status === 'reviewed'.
 */
export interface PendingUpdate {
  id: string;
  conferenceId: number;
  conferenceName: string;
  field: 'deadline' | 'dates' | 'location' | 'abstract_deadline';
  oldValue: string;
  newValue: string;
  confidence: string;
  sources: string[];
  createdAt: string;
  verificationRecord?: VerificationRecord;
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
  tier?: ConferenceTier;
  confidence_score: string;
}

// ============================================================================
// Conference Functions
// ============================================================================

/**
 * Retrieves all active conferences from the public list.
 */
export async function getAllConferences(): Promise<Conference[]> {
  try {
    const data = await redis.get(CONFERENCES_KEY);
    const conferences: Conference[] = data ? JSON.parse(data) : [];
    // Backfill missing tier on read for existing data
    for (const c of conferences) {
      if (!c.tier) {
        c.tier = assignTier(c.name);
      }
    }
    return conferences;
  } catch (error) {
    console.error('Failed to get conferences:', error);
    throw new Error(`Database read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

/**
 * Filters conferences that need re-verification (low confidence or needs-review).
 */
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
  conferences: Omit<Conference, 'id' | 'verification_sources' | 'verification_history' | 'last_verified' | 'review_status'>[]
) {
  const existing = await getAllConferences();

  if (existing.length === 0) {
    const initializedConferences: Conference[] = conferences.map((conf, index) => ({
      ...conf,
      id: index + 1,
      tier: conf.tier || assignTier(conf.name),
      review_status: 'unreviewed',
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
// Deduplication
// ============================================================================

function normalizeForDedup(name: string): string {
  return name
    .toLowerCase()
    .replace(/\d{4}/g, '')       // strip year suffixes
    .replace(/[^a-z\s]/g, '')    // strip non-alpha except spaces
    .replace(/\s+/g, ' ')
    .trim();
}

function tokenizeForDedup(name: string): string[] {
  return normalizeForDedup(name).split(' ').filter(t => t.length > 0);
}

function extractYears(name: string): number[] {
  return (name.match(/\d{4}/g) || []).map(Number);
}

/**
 * Checks whether `candidateName` is a duplicate of any conference in the list.
 * Uses two strategies with a year-mismatch guard:
 *   1. Exact match after normalization (strip years, punctuation, lowercase)
 *   2. Token overlap: all tokens of the shorter name appear in the longer name
 *      (requires the shorter name to have at least 2 tokens to avoid false positives)
 *
 * If both names contain 4-digit years and no year in common, they are never duplicates
 * (e.g. "AAAI 2026" vs "AAAI 2027" are distinct editions).
 */
export function isConferenceDuplicate(
  candidateName: string,
  existingConferences: Array<{ name: string }>
): boolean {
  const candidateNorm = normalizeForDedup(candidateName);
  const candidateTokens = tokenizeForDedup(candidateName);
  const candidateYears = extractYears(candidateName);

  for (const existing of existingConferences) {
    // Year-mismatch guard: if both have years and share none, skip
    const existingYears = extractYears(existing.name);
    if (
      candidateYears.length > 0 &&
      existingYears.length > 0 &&
      !candidateYears.some(y => existingYears.includes(y))
    ) {
      continue;
    }

    const existingNorm = normalizeForDedup(existing.name);

    // 1. Exact match after normalization
    if (candidateNorm === existingNorm) return true;

    // 2. Token overlap: all tokens of the shorter name appear in the longer
    //    Requires at least 2 tokens in the shorter name to avoid single-word
    //    false positives (e.g. "Ai4" → token "ai" matching many names)
    const existingTokens = tokenizeForDedup(existing.name);
    const [shorter, longer] = candidateTokens.length <= existingTokens.length
      ? [candidateTokens, existingTokens]
      : [existingTokens, candidateTokens];

    if (shorter.length >= 2 && shorter.every(t => longer.includes(t))) return true;
  }

  return false;
}

/**
 * Scans all conferences for duplicates using `isConferenceDuplicate()`.
 * Keeps the first occurrence (lower ID = added earlier), removes later duplicates.
 * Uses WATCH/MULTI for safe concurrent writes.
 */
export async function findAndRemoveDuplicates(): Promise<{
  removed: Array<{ id: number; name: string; duplicateOf: string }>;
}> {
  await redis.watch(CONFERENCES_KEY);

  try {
    const conferences = await getAllConferences();
    const seen: Conference[] = [];
    const toRemove: Array<{ id: number; name: string; duplicateOf: string }> = [];

    // Sort by ID ascending so lower IDs (added earlier) are kept
    const sorted = [...conferences].sort((a, b) => a.id - b.id);

    for (const conf of sorted) {
      const match = seen.find(s => isConferenceDuplicate(conf.name, [s]));
      if (match) {
        toRemove.push({ id: conf.id, name: conf.name, duplicateOf: match.name });
      } else {
        seen.push(conf);
      }
    }

    if (toRemove.length === 0) {
      await redis.unwatch();
      return { removed: [] };
    }

    const removeIds = new Set(toRemove.map(r => r.id));
    const filtered = conferences.filter(c => !removeIds.has(c.id));

    const multi = redis.multi();
    multi.set(CONFERENCES_KEY, JSON.stringify(filtered));
    await multi.exec();

    // Log each removal to changelog
    for (const entry of toRemove) {
      await addChangelogEntry({
        type: 'updated',
        conferenceName: entry.name,
        details: `Removed as duplicate of "${entry.duplicateOf}"`
      });
    }

    return { removed: toRemove };
  } finally {
    await redis.unwatch();
  }
}

// ============================================================================
// Pending Conference Functions
// ============================================================================

export async function getPendingConferences(): Promise<PendingConference[]> {
  try {
    const data = await redis.get(PENDING_KEY);
    const pending: PendingConference[] = data ? JSON.parse(data) : [];
    // Backfill missing tier on read for existing data
    for (const c of pending) {
      if (!c.tier) {
        c.tier = assignTier(c.name);
      }
    }
    return pending;
  } catch (error) {
    console.error('Failed to get pending conferences:', error);
    throw new Error(`Database read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function addToPending(conference: PendingConferenceInput): Promise<boolean> {
  const pending = await getPendingConferences();
  const existing = await getAllConferences();

  // Check for duplicates using token overlap + tier pattern matching
  const isDuplicate = isConferenceDuplicate(conference.name, [...existing, ...pending]);

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
    tier: conference.tier || assignTier(conference.name),
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

    // Check for duplicates before adding to public list
    if (isConferenceDuplicate(approved.name, conferences)) {
      console.log(`Approve blocked: "${approved.name}" duplicates an existing conference`);
      // Remove from pending even though we're not adding — it's a stale duplicate
      const multi = redis.multi();
      multi.set(PENDING_KEY, JSON.stringify(pending));
      await multi.exec();
      return false;
    }

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
      tier: approved.tier || assignTier(approved.name),
      review_status: 'unreviewed',
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

/**
 * Deletes a conference from the public list.
 */
export async function deleteConference(conferenceId: number): Promise<{ success: boolean; name?: string }> {
  await redis.watch(CONFERENCES_KEY);

  try {
    const conferences = await getAllConferences();
    const deleteIndex = conferences.findIndex(c => c.id === conferenceId);

    if (deleteIndex === -1) {
      return { success: false };
    }

    const [deleted] = conferences.splice(deleteIndex, 1);
    await redis.set(CONFERENCES_KEY, JSON.stringify(conferences));

    await addChangelogEntry({
      type: 'updated',
      conferenceName: deleted.name,
      details: 'Removed from tracker'
    });

    return { success: true, name: deleted.name };
  } finally {
    await redis.unwatch();
  }
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
// Pending Updates Functions (AI-suggested changes for reviewed conferences)
// ============================================================================

export async function getPendingUpdates(): Promise<PendingUpdate[]> {
  try {
    const data = await redis.get(PENDING_UPDATES_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to get pending updates:', error);
    throw new Error(`Database read failed: ${error instanceof Error ? error.message : 'Unknown error'}`);
  }
}

export async function addPendingUpdate(
  conferenceId: number,
  conferenceName: string,
  field: PendingUpdate['field'],
  oldValue: string,
  newValue: string,
  confidence: string,
  sources: string[],
  verificationRecord?: VerificationRecord
): Promise<boolean> {
  const updates = await getPendingUpdates();

  // Check for duplicate pending update for same conference and field
  const existingIndex = updates.findIndex(
    u => u.conferenceId === conferenceId && u.field === field
  );

  const newUpdate: PendingUpdate = {
    id: crypto.randomUUID(),
    conferenceId,
    conferenceName,
    field,
    oldValue,
    newValue,
    confidence,
    sources,
    createdAt: new Date().toISOString(),
    verificationRecord
  };

  if (existingIndex !== -1) {
    // Replace existing pending update for this field
    updates[existingIndex] = newUpdate;
  } else {
    updates.push(newUpdate);
  }

  await redis.set(PENDING_UPDATES_KEY, JSON.stringify(updates));

  await addChangelogEntry({
    type: 'discovered',
    conferenceName,
    details: `AI suggested ${field} change: ${oldValue} → ${newValue} (pending review)`
  });

  return true;
}

export async function approvePendingUpdate(updateId: string): Promise<boolean> {
  await redis.watch(PENDING_UPDATES_KEY, CONFERENCES_KEY);

  try {
    const updates = await getPendingUpdates();
    const updateIndex = updates.findIndex(u => u.id === updateId);

    if (updateIndex === -1) {
      return false;
    }

    const [update] = updates.splice(updateIndex, 1);
    const conferences = await getAllConferences();
    const confIndex = conferences.findIndex(c => c.id === update.conferenceId);

    if (confIndex === -1) {
      // Conference was deleted, just remove the pending update
      await redis.set(PENDING_UPDATES_KEY, JSON.stringify(updates));
      return false;
    }

    // Apply the update
    const oldValue = (conferences[confIndex] as any)[update.field];
    (conferences[confIndex] as any)[update.field] = update.newValue;
    conferences[confIndex].last_verified = new Date().toISOString();

    // Add verification record if provided
    if (update.verificationRecord) {
      conferences[confIndex].verification_history.push(update.verificationRecord);
    }

    const multi = redis.multi();
    multi.set(CONFERENCES_KEY, JSON.stringify(conferences));
    multi.set(PENDING_UPDATES_KEY, JSON.stringify(updates));
    await multi.exec();

    await addChangelogEntry({
      type: 'updated',
      conferenceName: update.conferenceName,
      details: `${update.field} updated: ${oldValue} → ${update.newValue} (approved)`
    });

    return true;
  } finally {
    await redis.unwatch();
  }
}

export async function dismissPendingUpdate(updateId: string): Promise<boolean> {
  const updates = await getPendingUpdates();
  const updateIndex = updates.findIndex(u => u.id === updateId);

  if (updateIndex === -1) {
    return false;
  }

  updates.splice(updateIndex, 1);
  await redis.set(PENDING_UPDATES_KEY, JSON.stringify(updates));
  return true;
}

// ============================================================================
// Admin Conference Editing Functions
// ============================================================================

export async function updateConferenceField(
  conferenceId: number,
  field: string,
  value: string
): Promise<{ success: boolean; oldValue?: string; error?: string }> {
  await redis.watch(CONFERENCES_KEY);

  try {
    const conferences = await getAllConferences();
    const confIndex = conferences.findIndex(c => c.id === conferenceId);

    if (confIndex === -1) {
      return { success: false, error: 'Conference not found' };
    }

    const oldValue = (conferences[confIndex] as any)[field];
    (conferences[confIndex] as any)[field] = value;

    await redis.set(CONFERENCES_KEY, JSON.stringify(conferences));

    await addChangelogEntry({
      type: 'updated',
      conferenceName: conferences[confIndex].name,
      details: `${field} manually updated: ${oldValue} → ${value}`
    });

    return { success: true, oldValue };
  } finally {
    await redis.unwatch();
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
  if (conf.tier && !VALID_TIERS.includes(conf.tier)) errors.push('Invalid tier');

  return { valid: errors.length === 0, errors };
}
