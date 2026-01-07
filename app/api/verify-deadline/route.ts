import { NextRequest, NextResponse } from 'next/server';
import { verifyConferenceDeadline } from '@/lib/verification';

export async function POST(request: NextRequest) {
    try {
        const { conferenceName } = await request.json();

        if (!conferenceName) {
            return NextResponse.json(
                { error: 'Conference name is required' },
                { status: 400 }
            );
        }

        if (!process.env.GEMINI_API_KEY) {
            return NextResponse.json(
                { error: 'GEMINI_API_KEY not configured' },
                { status: 500 }
            );
        }

        const verification = await verifyConferenceDeadline(conferenceName);
        return NextResponse.json(verification);
    } catch (error) {
        console.error('Verification error:', error);
        return NextResponse.json(
            { error: 'Verification failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
