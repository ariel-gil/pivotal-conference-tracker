import { NextRequest, NextResponse } from 'next/server';
import { dismissPendingUpdate } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const authResult = await validateAdminAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    try {
        const { id } = await request.json();

        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'Invalid update ID' }, { status: 400 });
        }

        const success = await dismissPendingUpdate(id);

        if (!success) {
            return NextResponse.json({ error: 'Update not found or already processed' }, { status: 404 });
        }

        return NextResponse.json({ success: true });
    } catch (error) {
        console.error('Dismiss pending update error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
