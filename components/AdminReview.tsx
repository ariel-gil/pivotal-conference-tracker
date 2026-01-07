'use client';

import { useState } from 'react';
import { Check, X, RefreshCw } from 'lucide-react';
import type { PendingConference } from '@/lib/db';

export default function AdminReview({
    initialPending,
    adminKey
}: {
    initialPending: PendingConference[];
    adminKey: string
}) {
    const [pending, setPending] = useState(initialPending);
    const [loading, setLoading] = useState<string | null>(null);
    const [discovering, setDiscovering] = useState(false);
    const [discoveryResult, setDiscoveryResult] = useState<any>(null);

    const handleApprove = async (id: string) => {
        setLoading(id);
        const res = await fetch('/api/admin/approve', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminKey}`
            },
            body: JSON.stringify({ id })
        });

        if (res.ok) {
            setPending(pending.filter(c => c.id !== id));
        }
        setLoading(null);
    };

    const handleDismiss = async (id: string) => {
        setLoading(id);
        const res = await fetch('/api/admin/dismiss', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${adminKey}`
            },
            body: JSON.stringify({ id })
        });

        if (res.ok) {
            setPending(pending.filter(c => c.id !== id));
        }
        setLoading(null);
    };

    const handleDiscover = async () => {
        setDiscovering(true);
        setDiscoveryResult(null);

        try {
            const res = await fetch('/api/discover-conferences', {
                method: 'POST'
            });

            const result = await res.json();
            setDiscoveryResult(result);

            // Refresh pending list
            if (result.pending_review > 0) {
                window.location.reload();
            }
        } catch (error) {
            setDiscoveryResult({ error: String(error) });
        }

        setDiscovering(false);
    };

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-4xl mx-auto">
                <div className="flex items-center justify-between mb-6">
                    <h1 className="text-2xl font-bold">Conference Admin Panel</h1>
                    <button
                        onClick={handleDiscover}
                        disabled={discovering}
                        className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700 disabled:opacity-50"
                    >
                        <RefreshCw className={`w-4 h-4 ${discovering ? 'animate-spin' : ''}`} />
                        {discovering ? 'Discovering...' : 'Discover New Conferences'}
                    </button>
                </div>

                {discoveryResult && (
                    <div className={`mb-4 p-4 rounded-lg ${discoveryResult.error ? 'bg-red-50 text-red-800' : 'bg-green-50 text-green-800'}`}>
                        {discoveryResult.error ? (
                            <p>Discovery failed: {discoveryResult.error}</p>
                        ) : (
                            <div>
                                <p className="font-medium">Discovery complete!</p>
                                <p>Added: {discoveryResult.added} conferences</p>
                                <p>Pending review: {discoveryResult.pending_review} conferences</p>
                                {discoveryResult.auto_added?.length > 0 && (
                                    <p className="text-sm mt-1">Auto-added: {discoveryResult.auto_added.join(', ')}</p>
                                )}
                            </div>
                        )}
                    </div>
                )}

                <h2 className="text-xl font-semibold mb-4">Pending Conferences Review ({pending.length})</h2>

                {pending.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg shadow-sm text-gray-500">
                        No pending conferences to review
                    </div>
                ) : (
                    <div className="space-y-4">
                        {pending.map((conf) => (
                            <div key={conf.id} className="bg-white p-4 rounded-lg shadow-sm">
                                <div className="flex justify-between items-start">
                                    <div className="flex-1">
                                        <h3 className="font-semibold text-lg">{conf.name}</h3>
                                        <p className="text-sm text-gray-600">{conf.description}</p>
                                        <div className="mt-2 space-y-1 text-sm">
                                            <p><span className="font-medium">Deadline:</span> {conf.deadline}</p>
                                            <p><span className="font-medium">Location:</span> {conf.location}</p>
                                            <p><span className="font-medium">Dates:</span> {conf.dates}</p>
                                            <p><span className="font-medium">Category:</span> {conf.category}</p>
                                            <p><span className="font-medium">Confidence:</span>
                                                <span className={`ml-1 px-2 py-0.5 rounded text-xs ${conf.confidence_score === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                                                    }`}>
                                                    {conf.confidence_score}
                                                </span>
                                            </p>
                                            <a
                                                href={conf.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline inline-block mt-1"
                                            >
                                                {conf.link}
                                            </a>
                                        </div>
                                        <p className="text-xs text-gray-400 mt-2">
                                            Added: {new Date(conf.addedAt).toLocaleDateString()}
                                        </p>
                                    </div>
                                    <div className="flex gap-2 ml-4">
                                        <button
                                            onClick={() => handleApprove(conf.id)}
                                            disabled={loading === conf.id}
                                            className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                            title="Approve and add to tracker"
                                        >
                                            <Check className="w-4 h-4" />
                                            <span className="hidden sm:inline">Approve</span>
                                        </button>
                                        <button
                                            onClick={() => handleDismiss(conf.id)}
                                            disabled={loading === conf.id}
                                            className="bg-red-600 text-white px-4 py-2 rounded hover:bg-red-700 disabled:opacity-50 flex items-center gap-1"
                                            title="Dismiss"
                                        >
                                            <X className="w-4 h-4" />
                                            <span className="hidden sm:inline">Dismiss</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
