import { cookies, headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPendingConferences, getAllConferences } from '@/lib/db';
import AdminReview from '@/components/AdminReview';

const ADMIN_COOKIE_NAME = 'admin_session';

// Simple in-memory rate limiter for login attempts
const loginAttempts = new Map<string, { count: number; resetTime: number }>();
const LOGIN_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes
const LOGIN_RATE_LIMIT_MAX_ATTEMPTS = 5;

async function getClientIP(): Promise<string> {
    const headersList = await headers();
    return headersList.get('x-forwarded-for')?.split(',')[0].trim() ||
        headersList.get('x-real-ip') ||
        'unknown';
}

function checkLoginRateLimit(ip: string): { allowed: boolean; minutesRemaining?: number } {
    const now = Date.now();
    const record = loginAttempts.get(ip);

    if (!record || now > record.resetTime) {
        loginAttempts.set(ip, { count: 1, resetTime: now + LOGIN_RATE_LIMIT_WINDOW_MS });
        return { allowed: true };
    }

    if (record.count >= LOGIN_RATE_LIMIT_MAX_ATTEMPTS) {
        return { allowed: false, minutesRemaining: Math.ceil((record.resetTime - now) / 60000) };
    }

    record.count++;
    return { allowed: true };
}

export default async function AdminPage({
    searchParams
}: {
    searchParams: Promise<{ key?: string }>
}) {
    const params = await searchParams;
    const adminKey = params.key;
    const adminSecret = process.env.ADMIN_SECRET;

    // If key is provided in URL, check rate limit first
    if (adminKey) {
        const clientIP = await getClientIP();
        const rateLimit = checkLoginRateLimit(clientIP);

        if (!rateLimit.allowed) {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="bg-white p-8 rounded-lg shadow-sm">
                        <h1 className="text-2xl font-bold text-red-600">Too Many Attempts</h1>
                        <p className="text-gray-600 mt-2">
                            Please try again in {rateLimit.minutesRemaining} minute{rateLimit.minutesRemaining !== 1 ? 's' : ''}.
                        </p>
                    </div>
                </div>
            );
        }

        if (adminKey === adminSecret) {
            redirect(`/api/admin/login?key=${adminKey}`);
        } else {
            return (
                <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                    <div className="bg-white p-8 rounded-lg shadow-sm">
                        <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                        <p className="text-gray-600 mt-2">Invalid admin key</p>
                    </div>
                </div>
            );
        }
    }

    // Check for existing session cookie
    const cookieStore = await cookies();
    const sessionCookie = cookieStore.get(ADMIN_COOKIE_NAME);

    if (!sessionCookie || sessionCookie.value !== adminSecret) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white p-8 rounded-lg shadow-sm">
                    <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                    <p className="text-gray-600 mt-2">Please provide admin key in URL: /admin?key=YOUR_SECRET</p>
                </div>
            </div>
        );
    }

    const pending = await getPendingConferences();
    const conferences = await getAllConferences();

    return <AdminReview initialPending={pending} initialConferences={conferences} />;
}

export const dynamic = 'force-dynamic';
