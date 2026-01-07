import { NextRequest, NextResponse } from 'next/server';

const ADMIN_COOKIE_NAME = 'admin_session';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

function getClientIP(request: NextRequest): string {
    return request.headers.get('x-forwarded-for')?.split(',')[0].trim() ||
        request.headers.get('x-real-ip') ||
        'unknown';
}

function checkLoginRateLimit(ip: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const record = loginAttempts.get(ip);

    if (!record || now > record.resetTime) {
        loginAttempts.set(ip, { count: 1, resetTime: now + LOGIN_RATE_LIMIT_WINDOW_MS });
        return { allowed: true };
    }

    if (record.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        return { allowed: false, retryAfterMs: record.resetTime - now };
    }

    record.count++;
    return { allowed: true };
}

export async function GET(request: NextRequest) {
    const clientIP = getClientIP(request);

    // Check rate limit
    const rateLimit = checkLoginRateLimit(clientIP);
    if (!rateLimit.allowed) {
        const retryAfterSeconds = Math.ceil(rateLimit.retryAfterMs! / 1000);
        return NextResponse.json(
            { error: 'Too many login attempts. Please try again later.' },
            { status: 429, headers: { 'Retry-After': String(retryAfterSeconds) } }
        );
    }

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
