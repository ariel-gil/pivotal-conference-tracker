import { NextRequest, NextResponse } from 'next/server';
import { dismissPendingConference } from '@/lib/db';

export async function POST(request: NextRequest) {
    // Verify admin authorization
    const authHeader = request.headers.get('authorization');
    if (!authHeader || authHeader !== `Bearer ${process.env.ADMIN_SECRET}`) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id || typeof id !== 'string') {
        return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
    }

    try {
        const success = await dismissPendingConference(id);
        if (!success) {
            return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
        }
        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json({ error: String(error) }, { status: 500 });
    }
}
