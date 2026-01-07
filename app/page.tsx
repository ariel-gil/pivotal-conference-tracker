import { getAllConferences, Conference } from '@/lib/db';
import ConferenceTracker from '@/components/ConferenceTracker';

export const dynamic = 'force-dynamic';
export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
    let conferences: Conference[] = [];
    let error = null;

    try {
        conferences = await getAllConferences();
    } catch (e) {
        console.error('Failed to fetch conferences:', e);
        error = 'Failed to load conferences. Database may not be initialized.';
    }

    return <ConferenceTracker initialConferences={conferences} error={error} />;
}
