import { NextRequest, NextResponse } from 'next/server';
import { revalidatePath } from 'next/cache';
import { updateConferenceField } from '@/lib/db';
import { validateAdminAuth, unauthorizedResponse } from '@/lib/auth';

export async function POST(request: NextRequest) {
    const authResult = await validateAdminAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    try {
        const { id, field, value } = await request.json();

        if (typeof id !== 'number') {
            return NextResponse.json({ error: 'Invalid conference ID' }, { status: 400 });
        }

        if (!field || typeof field !== 'string') {
            return NextResponse.json({ error: 'Invalid field name' }, { status: 400 });
        }

        // Whitelist allowed fields for security
        const allowedFields = ['deadline', 'review_status', 'dates', 'location', 'abstract_deadline'];
        if (!allowedFields.includes(field)) {
            return NextResponse.json({ error: `Field '${field}' is not editable` }, { status: 400 });
        }

        // Validate review_status values
        if (field === 'review_status' && !['unreviewed', 'reviewed', 'speculative'].includes(value)) {
            return NextResponse.json({ error: 'Invalid review_status value' }, { status: 400 });
        }

        // Validate deadline format
        if (field === 'deadline' && !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
            return NextResponse.json({ error: 'Invalid deadline format (expected YYYY-MM-DD)' }, { status: 400 });
        }

        const result = await updateConferenceField(id, field, value);

        if (!result.success) {
            return NextResponse.json({ error: result.error || 'Update failed' }, { status: 404 });
        }

        revalidatePath('/');

        return NextResponse.json({
            success: true,
            field,
            oldValue: result.oldValue,
            newValue: value
        });
    } catch (error) {
        console.error('Update conference error:', error);
        return NextResponse.json(
            { error: 'Internal server error', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
