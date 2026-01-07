import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE_NAME = 'admin_session';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

export async function GET(request: NextRequest) {
    const { searchParams } = new URL(request.url);
    const key = searchParams.get('key');
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
        return NextResponse.json({ error: 'Server configuration error' }, { status: 500 });
    }

    if (!key || key !== adminSecret) {
        return NextResponse.json({ error: 'Invalid admin key' }, { status: 401 });
    }

    // Set the session cookie and redirect to admin page
    const response = NextResponse.redirect(new URL('/admin', request.url));

    response.cookies.set(ADMIN_COOKIE_NAME, adminSecret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: ADMIN_COOKIE_MAX_AGE,
        path: '/'
    });

    return response;
}
