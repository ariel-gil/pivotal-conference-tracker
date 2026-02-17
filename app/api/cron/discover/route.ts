import { NextRequest, NextResponse } from 'next/server';
import { getAllConferences, setAllConferences, addToPending, validateConferenceData, addChangelogEntry } from '@/lib/db';
import type { Conference, PendingConferenceInput } from '@/lib/db';
import { validateCronAuth, unauthorizedResponse } from '@/lib/auth';
import { discoverConferences } from '@/lib/verification';
import { assignTier } from '@/lib/tiers';

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authResult = validateCronAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        console.log('Starting scheduled conference discovery...');

        const existing = await getAllConferences();
        const existingNames = existing.map(c => c.name).join(', ');

        // Use shared discovery function
        const discovered = await discoverConferences(existingNames);

        if (discovered.length === 0) {
            console.log('No new conferences found in discovery');
            return NextResponse.json({
                success: true,
                added: 0,
                pending_review: 0,
                message: 'No new conferences found'
            });
        }

        // Validate and separate by tier + confidence
        const autoAdd: PendingConferenceInput[] = [];
        const toPending: PendingConferenceInput[] = [];
        const invalid: Array<{ conference: string; errors: string[] }> = [];

        for (const conf of discovered) {
            // Ensure tier is assigned
            if (!conf.tier) {
                conf.tier = assignTier(conf.name || '');
            }

            const validation = validateConferenceData(conf);
            if (!validation.valid) {
                invalid.push({ conference: conf.name || 'Unknown', errors: validation.errors });
                continue;
            }

            // Auto-add top/notable conferences with high confidence
            const isAutoApproveTier = conf.tier === 'top' || conf.tier === 'notable';
            if (isAutoApproveTier && conf.confidence_score === 'high') {
                autoAdd.push(conf);
            } else {
                toPending.push(conf);
            }
        }

        // Auto-add qualified conferences
        const addedConferences: string[] = [];
        if (autoAdd.length > 0) {
            const nextId = existing.length > 0 ? Math.max(...existing.map(c => c.id)) + 1 : 1;

            const newConferences: Conference[] = autoAdd.map((conf, idx) => ({
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
                tier: conf.tier || assignTier(conf.name),
                review_status: 'unreviewed',
                confidence_score: conf.confidence_score as Conference['confidence_score'],
                verification_sources: [],
                date_added: new Date().toISOString(),
                verification_history: []
            }));

            await setAllConferences([...existing, ...newConferences]);
            addedConferences.push(...autoAdd.map(c => c.name));

            for (const conf of autoAdd) {
                await addChangelogEntry({
                    type: 'added',
                    conferenceName: conf.name,
                    details: `Auto-discovered and added (${conf.tier} tier, high confidence, deadline: ${conf.deadline})`
                });
            }
        }

        // Add remaining to pending for review
        let pendingAdded = 0;
        for (const conf of toPending) {
            const added = await addToPending(conf);
            if (added) pendingAdded++;
        }

        console.log(`Discovery complete: ${addedConferences.length} added, ${pendingAdded} pending review`);

        return NextResponse.json({
            success: true,
            added: addedConferences.length,
            pending_review: pendingAdded,
            auto_added: addedConferences,
            skipped_invalid: invalid.length
        });
    } catch (error) {
        console.error('Scheduled discovery error:', error);
        return NextResponse.json(
            { error: 'Discovery failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
