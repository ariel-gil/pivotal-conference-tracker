import { getPendingConferences } from '@/lib/db';
import AdminReview from '@/components/AdminReview';

export default async function AdminPage({
    searchParams
}: {
    searchParams: Promise<{ key?: string }>
}) {
    const params = await searchParams;
    const adminKey = params.key;

    if (!adminKey || adminKey !== process.env.ADMIN_SECRET) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center">
                <div className="bg-white p-8 rounded-lg shadow-sm">
                    <h1 className="text-2xl font-bold text-red-600">Access Denied</h1>
                    <p className="text-gray-600 mt-2">Invalid or missing admin key</p>
                </div>
            </div>
        );
    }

    const pending = await getPendingConferences();

    // Pass admin key to client component for API calls
    return <AdminReview initialPending={pending} adminKey={adminKey} />;
}

export const dynamic = 'force-dynamic';
