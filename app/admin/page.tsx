import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getPendingConferences } from '@/lib/db';
import AdminReview from '@/components/AdminReview';

const ADMIN_COOKIE_NAME = 'admin_session';

export default async function AdminPage({
    searchParams
}: {
    searchParams: Promise<{ key?: string }>
}) {
    const params = await searchParams;
    const adminKey = params.key;
    const adminSecret = process.env.ADMIN_SECRET;

    // If key is provided in URL, redirect to login endpoint to set cookie
    if (adminKey) {
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

    return <AdminReview initialPending={pending} />;
}

export const dynamic = 'force-dynamic';
