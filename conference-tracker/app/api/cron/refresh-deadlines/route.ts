import { NextRequest, NextResponse } from 'next/server';
import { getConferencesNeedingVerification, updateConferenceDeadline } from '@/lib/db';

export async function GET(request: NextRequest) {
    // Verify cron secret
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    try {
        console.log('Starting automated deadline refresh...');

        const conferences = await getConferencesNeedingVerification();
        console.log(`Found ${conferences.length} conferences needing verification`);

        const results = [];

        for (const conf of conferences) {
            console.log(`Verifying: ${conf.name}`);

            try {
                // Call verification API
                const verifyResponse = await fetch(
                    `${process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : 'http://localhost:3000'}/api/verify-deadline`,
                    {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ conferenceName: conf.name })
                    }
                );

                if (!verifyResponse.ok) {
                    throw new Error(`Verification API returned ${verifyResponse.status}`);
                }

                const verification = await verifyResponse.json();

                // Update database
                const verificationRecord = {
                    timestamp: new Date().toISOString(),
                    old_deadline: conf.deadline,
                    new_deadline: verification.deadline,
                    confidence: verification.confidence,
                    sources: verification.sources,
                    model_results: verification.modelResults
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

                // Small delay between requests to avoid rate limiting
                await new Promise(resolve => setTimeout(resolve, 2000));
            } catch (error) {
                console.error(`✗ ${conf.name}: ${error}`);
                results.push({
                    conference: conf.name,
                    status: 'error',
                    error: String(error)
                });
            }
        }

        console.log('Automated refresh complete');

        return NextResponse.json({
            success: true,
            processed: conferences.length,
            results
        });
    } catch (error) {
        console.error('Cron job error:', error);
        return NextResponse.json(
            { error: 'Cron job failed', details: String(error) },
            { status: 500 }
        );
    }
}

// Allow manual triggering for testing
export const dynamic = 'force-dynamic';
