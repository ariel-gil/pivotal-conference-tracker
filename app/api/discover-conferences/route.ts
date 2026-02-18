import { NextRequest, NextResponse } from 'next/server';
import { getAllConferences, setAllConferences, addToPending, validateConferenceData, addChangelogEntry } from '@/lib/db';
import type { Conference, PendingConferenceInput } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse, checkRateLimit, rateLimitedResponse } from '@/lib/auth';
import { discoverConferences } from '@/lib/verification';
import { assignTier } from '@/lib/tiers';

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
        const existingNames = existing.map(c => c.name);
        const topTierNames = existing.filter(c => c.tier === 'top').map(c => c.name);

        // Use shared discovery function
        const discovered = await discoverConferences(existingNames, topTierNames);

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
            // Ensure tier is assigned before adding to pending
            if (!conf.tier) {
                conf.tier = assignTier(conf.name || '');
            }

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

        // Add ALL valid conferences to pending for review
        let pendingAdded = 0;

        // Combine high and low confidence lists
        const allValid = [...validHigh, ...validLow];

        for (const conf of allValid) {
            const added = await addToPending(conf);
            if (added) pendingAdded++;
        }

        return NextResponse.json({
            success: true,
            added: 0, // No longer auto-adding
            pending_review: pendingAdded,
            auto_added: [],
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
