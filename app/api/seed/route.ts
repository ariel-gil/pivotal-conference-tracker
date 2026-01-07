import { initializeDatabase } from '@/lib/db';
import { initialConferences } from '@/lib/seed-data';
import { NextResponse } from 'next/server';

export async function GET() {
    try {
        await initializeDatabase(initialConferences);
        return NextResponse.json({
            success: true,
            message: 'Database initialized with conference data'
        });
    } catch (error) {
        return NextResponse.json(
            { error: 'Failed to initialize database', details: String(error) },
            { status: 500 }
        );
    }
}
