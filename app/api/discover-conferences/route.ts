import { NextRequest, NextResponse } from 'next/server';
import { getAllConferences, setAllConferences, addToPending, validateConferenceData, addChangelogEntry } from '@/lib/db';
import type { Conference, PendingConferenceInput } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse, checkRateLimit, rateLimitedResponse } from '@/lib/auth';
import { discoverConferences } from '@/lib/verification';

export async function POST(request: NextRequest) {
    // Require admin auth for discovery
    const authResult = await validateAdminAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    // Rate limiting
    const rateLimit = checkRateLimit('discover-conferences');
    if (!rateLimit.allowed) {
        return rateLimitedResponse(rateLimit.retryAfterMs!);
    }

    if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        const existing = await getAllConferences();
        const existingNames = existing.map(c => c.name).join(', ');

        // Use shared discovery function
        const discovered = await discoverConferences(existingNames);

        if (discovered.length === 0) {
            return NextResponse.json({
                success: true,
                added: 0,
                pending_review: 0,
                message: 'No new conferences found'
            });
        }

        // Validate and separate by confidence
        const validHigh: PendingConferenceInput[] = [];
        const validLow: PendingConferenceInput[] = [];
        const invalid: Array<{ conference: string; errors: string[] }> = [];

        for (const conf of discovered) {
            const validation = validateConferenceData(conf);
            if (!validation.valid) {
                invalid.push({ conference: conf.name || 'Unknown', errors: validation.errors });
                continue;
            }

            if (conf.confidence_score === 'high') {
                validHigh.push(conf);
            } else {
                validLow.push(conf);
            }
        }

        // Auto-add high confidence conferences
        const addedConferences: string[] = [];
        if (validHigh.length > 0) {
            const nextId = existing.length > 0 ? Math.max(...existing.map(c => c.id)) + 1 : 1;

            const newConferences: Conference[] = validHigh.map((conf, idx) => ({
                id: nextId + idx,
                name: conf.name,
                deadline: conf.deadline,
                abstract_deadline: conf.abstract_deadline,
                location: conf.location,
                dates: conf.dates,
                description: conf.description,
                requirements: conf.requirements || 'See conference website',
                link: conf.link,
                category: conf.category,
                status: conf.status,
                confidence_score: conf.confidence_score as Conference['confidence_score'],
                verification_sources: [],
                date_added: new Date().toISOString(),
                verification_history: []
            }));

            await setAllConferences([...existing, ...newConferences]);
            addedConferences.push(...validHigh.map(c => c.name));

            for (const conf of validHigh) {
                await addChangelogEntry({
                    type: 'added',
                    conferenceName: conf.name,
                    details: `Auto-discovered and added (high confidence, deadline: ${conf.deadline})`
                });
            }
        }

        // Add low confidence to pending for review
        let pendingAdded = 0;
        for (const conf of validLow) {
            const added = await addToPending(conf);
            if (added) pendingAdded++;
        }

        return NextResponse.json({
            success: true,
            added: addedConferences.length,
            pending_review: pendingAdded,
            auto_added: addedConferences,
            skipped_invalid: invalid.length,
            invalid_conferences: invalid
        });
    } catch (error) {
        console.error('Discovery error:', error);
        return NextResponse.json(
            { error: 'Discovery failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
