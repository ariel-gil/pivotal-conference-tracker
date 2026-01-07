import { getAllConferences, getChangelog, Conference, ChangelogEntry } from '@/lib/db';
import ConferenceTracker from '@/components/ConferenceTracker';

export const revalidate = 3600; // Revalidate every hour

export default async function Home() {
    let conferences: Conference[] = [];
    let changelog: ChangelogEntry[] = [];
    let error: string | null = null;

    try {
        conferences = await getAllConferences();
        changelog = await getChangelog(10); // Get last 10 changelog entries
    } catch (e) {
        console.error('Failed to fetch data:', e);
        const errorMessage = e instanceof Error ? e.message : 'Unknown error';
        if (errorMessage.includes('REDIS_URL')) {
            error = 'Database configuration error. Please check REDIS_URL environment variable.';
        } else if (errorMessage.includes('connection')) {
            error = 'Unable to connect to database. Please check your Redis connection.';
        } else {
            error = `Failed to load conferences: ${errorMessage}`;
        }
    }

    return <ConferenceTracker initialConferences={conferences} changelog={changelog} error={error} />;
}
