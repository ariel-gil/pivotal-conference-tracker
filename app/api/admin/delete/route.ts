import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { deleteConference } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const authResult = await validateAdminAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    try {
        const { id } = await request.json();

        if (!id || typeof id !== 'number') {
            return NextResponse.json({ error: 'Invalid conference ID (must be a number)' }, { status: 400 });
        }

        const result = await deleteConference(id);
        if (!result.success) {
            return NextResponse.json({ error: 'Conference not found' }, { status: 404 });
        }

        // Revalidate the main page cache
        revalidatePath('/');

        return NextResponse.json({ success: true, deleted: result.name });
    } catch (error) {
        return NextResponse.json(
            { error: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}
