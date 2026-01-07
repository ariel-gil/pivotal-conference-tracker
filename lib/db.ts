import { sql } from '@vercel/postgres';

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

// Get all conferences
export async function getAllConferences(): Promise<Conference[]> {
    const { rows } = await sql<Conference>`
    SELECT * FROM conferences 
    ORDER BY deadline ASC
  `;
    return rows;
}

// Get conferences that need verification (speculative deadlines)
export async function getConferencesNeedingVerification(): Promise<Conference[]> {
    const { rows } = await sql<Conference>`
    SELECT * FROM conferences 
    WHERE confidence_score IN ('low', 'needs-review', 'medium')
    AND status != 'passed'
    ORDER BY last_verified ASC NULLS FIRST
  `;
    return rows;
}

// Update conference deadline and verification info
export async function updateConferenceDeadline(
    id: number,
    deadline: string,
    confidenceScore: string,
    sources: string[],
    verificationRecord: VerificationRecord
): Promise<void> {
    await sql`
    UPDATE conferences
    SET 
      deadline = ${deadline},
      confidence_score = ${confidenceScore},
      verification_sources = ${JSON.stringify(sources)}::jsonb,
      last_verified = NOW(),
      verification_history = verification_history || ${JSON.stringify([verificationRecord])}::jsonb
    WHERE id = ${id}
  `;
}

// Initialize database with seed data
export async function initializeDatabase(conferences: Omit<Conference, 'id' | 'verification_sources' | 'verification_history' | 'last_verified'>[]) {
    for (const conf of conferences) {
        await sql`
      INSERT INTO conferences (
        name, deadline, abstract_deadline, location, dates, 
        description, requirements, link, category, status, confidence_score
      ) VALUES (
        ${conf.name}, ${conf.deadline}, ${conf.abstract_deadline || null}, 
        ${conf.location}, ${conf.dates}, ${conf.description}, 
        ${conf.requirements}, ${conf.link}, ${conf.category}, 
        ${conf.status}, ${conf.confidence_score}
      )
      ON CONFLICT DO NOTHING
    `;
    }
}
