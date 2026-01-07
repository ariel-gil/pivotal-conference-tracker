'use client';

import { useState } from 'react';
import { Check, X, RefreshCw, Trash2 } from 'lucide-react';
import type { PendingConference, Conference } from '@/lib/db';

export default function AdminReview({
    initialPending,
    initialConferences
}: {
    initialPending: PendingConference[];
    initialConferences: Conference[];
}) {
    const [pending, setPending] = useState(initialPending);
    const [conferences, setConferences] = useState(initialConferences);
    const [loading, setLoading] = useState<string | null>(null);
    const [discovering, setDiscovering] = useState(false);
    const [discoveryResult, setDiscoveryResult] = useState<{
        success?: boolean;
        added?: number;
        pending_review?: number;
        auto_added?: string[];
        error?: string;
    } | null>(null);

    const handleApprove = async (id: string) => {
        setLoading(id);
        try {
            const res = await fetch('/api/admin/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id })
            });

            if (res.ok) {
                setPending(pending.filter(c => c.id !== id));
            } else {
                const data = await res.json();
                alert(`Failed to approve: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const handleDismiss = async (id: string) => {
        setLoading(id);
        try {
            const res = await fetch('/api/admin/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id })
            });

            if (res.ok) {
                setPending(pending.filter(c => c.id !== id));
            } else {
                const data = await res.json();
                alert(`Failed to dismiss: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const handleDelete = async (id: number, name: string) => {
        if (!confirm(`Are you sure you want to delete "${name}"? This cannot be undone.`)) {
            return;
        }

        setLoading(`conf-${id}`);
        try {
            const res = await fetch('/api/admin/delete', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id })
            });

            if (res.ok) {
                setConferences(conferences.filter(c => c.id !== id));
            } else {
                const data = await res.json();
                alert(`Failed to delete: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const handleDiscover = async () => {
        setDiscovering(true);
        setDiscoveryResult(null);

        try {
            const res = await fetch('/api/discover-conferences', {
                method: 'POST',
                credentials: 'include'
            });

            const result = await res.json();

            if (res.status === 429) {
                setDiscoveryResult({ error: `Rate limited. Try again in ${result.retryAfterSeconds} seconds.` });
            } else {
                setDiscoveryResult(result);

                if (result.pending_review > 0) {
                    window.location.reload();
                }
            }
        } catch (error) {
            setDiscoveryResult({ error: error instanceof Error ? error.message : String(error) });
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
                                <p>Pending review: {discoveryResult.pending_review} conferences</p>
                            </div>
                        )}
                    </div>
                )}

                {/* Pending Conferences Section */}
                <h2 className="text-xl font-semibold mb-4">Pending Review ({pending.length})</h2>

                {pending.length === 0 ? (
                    <div className="bg-white p-6 rounded-lg shadow-sm text-gray-500 mb-8">
                        No pending conferences to review
                    </div>
                ) : (
                    <div className="space-y-4 mb-8">
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
                                                <span className={`ml-1 px-2 py-0.5 rounded text-xs ${conf.confidence_score === 'high' ? 'bg-green-100 text-green-800' :
                                                    conf.confidence_score === 'medium' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
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

                {/* Existing Conferences Section */}
                <h2 className="text-xl font-semibold mb-4">Active Conferences ({conferences.length})</h2>
                <div className="space-y-2">
                    {conferences.map((conf) => (
                        <div key={conf.id} className="bg-white p-3 rounded-lg shadow-sm flex justify-between items-center">
                            <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                    <span className="font-medium truncate">{conf.name}</span>
                                    <span className={`px-2 py-0.5 rounded text-xs ${conf.category === 'safety' ? 'bg-emerald-100 text-emerald-800' :
                                        conf.category === 'ml' ? 'bg-blue-100 text-blue-800' :
                                            conf.category === 'nlp' ? 'bg-purple-100 text-purple-800' :
                                                'bg-amber-100 text-amber-800'
                                        }`}>
                                        {conf.category}
                                    </span>
                                </div>
                                <p className="text-sm text-gray-500">Deadline: {conf.deadline}</p>
                            </div>
                            <button
                                onClick={() => handleDelete(conf.id, conf.name)}
                                disabled={loading === `conf-${conf.id}`}
                                className="bg-gray-100 text-red-600 px-3 py-2 rounded hover:bg-red-100 disabled:opacity-50 flex items-center gap-1"
                                title="Delete conference"
                            >
                                <Trash2 className="w-4 h-4" />
                                <span className="hidden sm:inline">Delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

