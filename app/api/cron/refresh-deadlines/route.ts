import { NextRequest, NextResponse } from 'next/server';
import { getConferencesNeedingVerification, updateConferenceDeadline } from '@/lib/db';
import { verifyConferenceDeadline } from '@/lib/verification';
import { validateCronAuth, unauthorizedResponse } from '@/lib/auth';

// Constants
const MAX_CONFERENCES_PER_RUN = 10;
const DELAY_BETWEEN_VERIFICATIONS_MS = 2000;

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authResult = validateCronAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    try {
        console.log('Starting automated deadline refresh...');

        const conferences = await getConferencesNeedingVerification();

        // Process limited conferences per run to avoid timeout
        const conferencesToProcess = conferences.slice(0, MAX_CONFERENCES_PER_RUN);
        console.log(`Processing ${conferencesToProcess.length} of ${conferences.length} conferences needing verification`);

        const results = [];

        for (const conf of conferencesToProcess) {
            console.log(`Verifying: ${conf.name}`);

            try {
                // Call verification directly instead of HTTP
                const verification = await verifyConferenceDeadline(conf.name);

                // Update database
                const verificationRecord = {
                    timestamp: new Date().toISOString(),
                    old_deadline: conf.deadline,
                    new_deadline: verification.deadline,
                    confidence: verification.confidence,
                    sources: verification.sources,
                    model_results: verification.modelResults.map(r => ({
                        model: r.model,
                        deadline: r.deadline,
                        confidence: r.confidence,
                        source: r.source,
                        search_number: r.searchNumber
                    }))
                };

                await updateConferenceDeadline(
                    conf.id,
                    verification.deadline,
                    verification.confidence,
                    verification.sources,
                    verificationRecord
                );

                results.push({
                    conference: conf.name,
                    status: 'success',
                    old_deadline: conf.deadline,
                    new_deadline: verification.deadline,
                    confidence: verification.confidence
                });

                console.log(`✓ ${conf.name}: ${conf.deadline} → ${verification.deadline} (${verification.confidence})`);

                // Delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, DELAY_BETWEEN_VERIFICATIONS_MS));
            } catch (error) {
                console.error(`✗ ${conf.name}:`, error);
                results.push({
                    conference: conf.name,
                    status: 'error',
                    error: error instanceof Error ? error.message : String(error)
                });
            }
        }

        console.log('Automated refresh complete');

        // Revalidate cache so updates appear on the main page
        try {
            const { revalidatePath } = await import('next/cache');
            revalidatePath('/');
        } catch (e) {
            console.error('Failed to revalidate path:', e);
        }

        return NextResponse.json({
            success: true,
            processed: conferencesToProcess.length,
            total_needing_verification: conferences.length,
            results
        });
    } catch (error) {
        console.error('Cron job error:', error);
        return NextResponse.json(
            { error: 'Cron job failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
