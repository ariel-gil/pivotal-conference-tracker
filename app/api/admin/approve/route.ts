import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { approvePendingConference } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const authResult = await validateAdminAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    try {
        const { id } = await request.json();

        if (!id || typeof id !== 'string') {
            return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
        }

        const success = await approvePendingConference(id);
        if (!success) {
            return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
        }

        // Revalidate the main page cache so new conferences appear immediately
        revalidatePath('/');

        return NextResponse.json({ success: true });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
