import { NextRequest, NextResponse } from 'next/server';
import { cookies } from 'next/headers';

const ADMIN_COOKIE_NAME = 'admin_session';
const ADMIN_COOKIE_MAX_AGE = 60 * 60 * 24; // 24 hours

/**
 * Validates admin authorization from either:
 * 1. HTTP-only session cookie (preferred)
 * 2. Authorization Bearer token (fallback for cron jobs)
 */
export async function validateAdminAuth(request: NextRequest): Promise<{ valid: boolean; error?: string }> {
    const adminSecret = process.env.ADMIN_SECRET;

    if (!adminSecret) {
        console.error('ADMIN_SECRET environment variable is not set');
        return { valid: false, error: 'Server configuration error' };
    }

    // Check Authorization header first (for cron jobs and API calls)
    const authHeader = request.headers.get('authorization');
    if (authHeader === `Bearer ${adminSecret}`) {
        return { valid: true };
    }

    // Check session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);
    if (sessionCookie?.value === adminSecret) {
        return { valid: true };
    }

    return { valid: false, error: 'Unauthorized' };
}

/**
 * Creates an unauthorized response
 */
export function unauthorizedResponse(message: string = 'Unauthorized'): NextResponse {
    return NextResponse.json({ error: message }, { status: 401 });
}

/**
 * Sets the admin session cookie
 */
export async function setAdminSessionCookie(secret: string): Promise<void> {
    const cookieStore = await cookies();
    cookieStore.set(ADMIN_COOKIE_NAME, secret, {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'strict',
        maxAge: ADMIN_COOKIE_MAX_AGE,
        path: '/'
    });
}

/**
 * Validates cron job authorization
 */
export function validateCronAuth(request: NextRequest): { valid: boolean; error?: string } {
    const authHeader = request.headers.get('authorization');
    const cronSecret = process.env.CRON_SECRET;

    if (!cronSecret) {
        console.error('CRON_SECRET environment variable is not set');
        return { valid: false, error: 'Server configuration error' };
    }

    if (authHeader !== `Bearer ${cronSecret}`) {
        return { valid: false, error: 'Unauthorized' };
    }

    return { valid: true };
}

/**
 * Simple in-memory rate limiter
 */
const rateLimitStore = new Map<string, { count: number; resetTime: number }>();

const RATE_LIMIT_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const RATE_LIMIT_MAX_REQUESTS = 3;

export function checkRateLimit(identifier: string): { allowed: boolean; retryAfterMs?: number } {
    const now = Date.now();
    const record = rateLimitStore.get(identifier);

    if (!record || now > record.resetTime) {
        // Reset or create new window
        rateLimitStore.set(identifier, { count: 1, resetTime: now + RATE_LIMIT_WINDOW_MS });
        return { allowed: true };
    }

    if (record.count >= RATE_LIMIT_MAX_REQUESTS) {
        return { allowed: false, retryAfterMs: record.resetTime - now };
    }

    record.count++;
    return { allowed: true };
}

export function rateLimitedResponse(retryAfterMs: number): NextResponse {
    const retryAfterSeconds = Math.ceil(retryAfterMs / 1000);
    return NextResponse.json(
        { error: 'Rate limit exceeded', retryAfterSeconds },
        {
            status: 429,
            headers: { 'Retry-After': String(retryAfterSeconds) }
        }
    );
}
