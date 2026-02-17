'use client';

import { useState } from 'react';
import { Check, X, RefreshCw, Trash2, ChevronDown, AlertTriangle, Edit3, Save } from 'lucide-react';
import type { PendingConference, Conference, PendingUpdate } from '@/lib/db';
import { TIER_OPTIONS } from '@/lib/tiers';

const REVIEW_STATUS_OPTIONS = [
    { value: 'unreviewed', label: 'Unreviewed', color: 'bg-gray-100 text-gray-800' },
    { value: 'reviewed', label: 'Reviewed', color: 'bg-green-100 text-green-800' },
    { value: 'speculative', label: 'Speculative', color: 'bg-amber-100 text-amber-800' }
] as const;

export default function AdminReview({
    initialPending,
    initialConferences,
    initialPendingUpdates = []
}: {
    initialPending: PendingConference[];
    initialConferences: Conference[];
    initialPendingUpdates?: PendingUpdate[];
}) {
    const [pending, setPending] = useState(initialPending);
    const [conferences, setConferences] = useState(initialConferences);
    const [pendingUpdates, setPendingUpdates] = useState(initialPendingUpdates);
    const [loading, setLoading] = useState<string | null>(null);
    const [discovering, setDiscovering] = useState(false);
    const [discoveryResult, setDiscoveryResult] = useState<{
        success?: boolean;
        added?: number;
        pending_review?: number;
        auto_added?: string[];
        error?: string;
    } | null>(null);
    const [expandedConf, setExpandedConf] = useState<number | null>(null);
    const [editingDeadline, setEditingDeadline] = useState<number | null>(null);
    const [editDeadlineValue, setEditDeadlineValue] = useState('');

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

    const handleUpdateField = async (id: number, field: string, value: string) => {
        setLoading(`field-${id}-${field}`);
        try {
            const res = await fetch('/api/admin/update-conference', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id, field, value })
            });

            if (res.ok) {
                setConferences(conferences.map(c =>
                    c.id === id ? { ...c, [field]: value } : c
                ));
                if (field === 'deadline') {
                    setEditingDeadline(null);
                }
            } else {
                const data = await res.json();
                alert(`Failed to update: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const handleApprovePendingUpdate = async (updateId: string) => {
        setLoading(`update-${updateId}`);
        try {
            const res = await fetch('/api/admin/pending-updates/approve', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: updateId })
            });

            if (res.ok) {
                const update = pendingUpdates.find(u => u.id === updateId);
                if (update) {
                    setConferences(conferences.map(c =>
                        c.id === update.conferenceId
                            ? { ...c, [update.field]: update.newValue }
                            : c
                    ));
                }
                setPendingUpdates(pendingUpdates.filter(u => u.id !== updateId));
            } else {
                const data = await res.json();
                alert(`Failed to approve update: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const handleDismissPendingUpdate = async (updateId: string) => {
        setLoading(`update-${updateId}`);
        try {
            const res = await fetch('/api/admin/pending-updates/dismiss', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ id: updateId })
            });

            if (res.ok) {
                setPendingUpdates(pendingUpdates.filter(u => u.id !== updateId));
            } else {
                const data = await res.json();
                alert(`Failed to dismiss update: ${data.error}`);
            }
        } catch (error) {
            alert(`Error: ${error instanceof Error ? error.message : String(error)}`);
        }
        setLoading(null);
    };

    const startEditingDeadline = (conf: Conference) => {
        setEditingDeadline(conf.id);
        setEditDeadlineValue(conf.deadline);
    };

    const getReviewStatusStyle = (status: Conference['review_status']) => {
        const option = REVIEW_STATUS_OPTIONS.find(o => o.value === status);
        return option?.color || 'bg-gray-100 text-gray-800';
    };

    const getTierStyle = (tier?: string) => {
        const option = TIER_OPTIONS.find(o => o.value === tier);
        return option?.color || 'bg-gray-100 text-gray-600';
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

                {/* Status Logic Explanation */}
                <div className="mb-6 p-3 bg-blue-50 border border-blue-100 rounded-lg text-sm text-blue-800">
                    <p><strong>Review Status:</strong> Mark conferences as <span className="bg-green-100 px-1 rounded">Reviewed</span> to protect them from AI overwrites.
                        AI-detected changes to reviewed conferences appear in &quot;AI-Suggested Updates&quot; for manual approval.
                        <span className="bg-gray-100 px-1 rounded">Unreviewed</span> and <span className="bg-amber-100 px-1 rounded">Speculative</span> conferences update automatically.</p>
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

                {/* Pending Updates Section (AI-suggested changes for reviewed conferences) */}
                {pendingUpdates.length > 0 && (
                    <>
                        <h2 className="text-xl font-semibold mb-4 flex items-center gap-2">
                            <AlertTriangle className="w-5 h-5 text-amber-500" />
                            AI-Suggested Updates ({pendingUpdates.length})
                        </h2>
                        <div className="space-y-3 mb-8">
                            {pendingUpdates.map((update) => (
                                <div key={update.id} className="bg-amber-50 border border-amber-200 p-4 rounded-lg">
                                    <div className="flex justify-between items-start">
                                        <div className="flex-1">
                                            <h3 className="font-semibold">{update.conferenceName}</h3>
                                            <p className="text-sm text-amber-800 mt-1">
                                                <span className="font-medium capitalize">{update.field}:</span>{' '}
                                                <span className="line-through text-amber-600">{update.oldValue}</span>
                                                {' → '}
                                                <span className="font-medium">{update.newValue}</span>
                                            </p>
                                            <p className="text-xs text-amber-600 mt-1">
                                                Confidence: {update.confidence} • Sources: {update.sources.length}
                                            </p>
                                            <p className="text-xs text-gray-500 mt-1">
                                                Suggested: {new Date(update.createdAt).toLocaleString()}
                                            </p>
                                        </div>
                                        <div className="flex gap-2 ml-4">
                                            <button
                                                onClick={() => handleApprovePendingUpdate(update.id)}
                                                disabled={loading === `update-${update.id}`}
                                                className="bg-green-600 text-white px-3 py-1.5 rounded text-sm hover:bg-green-700 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <Check className="w-3 h-3" />
                                                Apply
                                            </button>
                                            <button
                                                onClick={() => handleDismissPendingUpdate(update.id)}
                                                disabled={loading === `update-${update.id}`}
                                                className="bg-gray-600 text-white px-3 py-1.5 rounded text-sm hover:bg-gray-700 disabled:opacity-50 flex items-center gap-1"
                                            >
                                                <X className="w-3 h-3" />
                                                Dismiss
                                            </button>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </>
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
                                            <p><span className="font-medium">Tier:</span>
                                                <span className={`ml-1 px-2 py-0.5 rounded text-xs ${getTierStyle(conf.tier)}`}>
                                                    {conf.tier || 'niche'}
                                                </span>
                                            </p>
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
                    {conferences.map((conf) => {
                        const isExpanded = expandedConf === conf.id;
                        const isEditingThisDeadline = editingDeadline === conf.id;
                        return (
                            <div key={conf.id} className="bg-white rounded-lg shadow-sm overflow-hidden">
                                <div
                                    className="p-3 flex justify-between items-center cursor-pointer hover:bg-gray-50"
                                    onClick={() => setExpandedConf(isExpanded ? null : conf.id)}
                                >
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
                                            <span className="font-medium truncate">{conf.name}</span>
                                            <span className={`px-2 py-0.5 rounded text-xs ${conf.category === 'safety' ? 'bg-emerald-100 text-emerald-800' :
                                                conf.category === 'ml' ? 'bg-blue-100 text-blue-800' :
                                                    conf.category === 'nlp' ? 'bg-purple-100 text-purple-800' :
                                                        'bg-amber-100 text-amber-800'
                                                }`}>
                                                {conf.category}
                                            </span>
                                            <select
                                                value={conf.review_status || 'unreviewed'}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    handleUpdateField(conf.id, 'review_status', e.target.value);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className={`px-2 py-0.5 rounded text-xs border-0 cursor-pointer ${getReviewStatusStyle(conf.review_status || 'unreviewed')}`}
                                                disabled={loading === `field-${conf.id}-review_status`}
                                            >
                                                {REVIEW_STATUS_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                            <select
                                                value={conf.tier || 'niche'}
                                                onChange={(e) => {
                                                    e.stopPropagation();
                                                    handleUpdateField(conf.id, 'tier', e.target.value);
                                                }}
                                                onClick={(e) => e.stopPropagation()}
                                                className={`px-2 py-0.5 rounded text-xs border-0 cursor-pointer ${getTierStyle(conf.tier)}`}
                                                disabled={loading === `field-${conf.id}-tier`}
                                            >
                                                {TIER_OPTIONS.map(opt => (
                                                    <option key={opt.value} value={opt.value}>{opt.label}</option>
                                                ))}
                                            </select>
                                        </div>
                                        <div className="text-sm text-gray-500 ml-6 flex items-center gap-2">
                                            <span>Deadline:</span>
                                            {isEditingThisDeadline ? (
                                                <div className="flex items-center gap-1" onClick={(e) => e.stopPropagation()}>
                                                    <input
                                                        type="date"
                                                        value={editDeadlineValue}
                                                        onChange={(e) => setEditDeadlineValue(e.target.value)}
                                                        className="border rounded px-2 py-0.5 text-sm"
                                                    />
                                                    <button
                                                        onClick={() => handleUpdateField(conf.id, 'deadline', editDeadlineValue)}
                                                        disabled={loading === `field-${conf.id}-deadline`}
                                                        className="p-1 text-green-600 hover:bg-green-50 rounded"
                                                    >
                                                        <Save className="w-4 h-4" />
                                                    </button>
                                                    <button
                                                        onClick={() => setEditingDeadline(null)}
                                                        className="p-1 text-gray-400 hover:bg-gray-100 rounded"
                                                    >
                                                        <X className="w-4 h-4" />
                                                    </button>
                                                </div>
                                            ) : (
                                                <>
                                                    <span>{conf.deadline}</span>
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); startEditingDeadline(conf); }}
                                                        className="p-1 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded"
                                                        title="Edit deadline"
                                                    >
                                                        <Edit3 className="w-3 h-3" />
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </div>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); handleDelete(conf.id, conf.name); }}
                                        disabled={loading === `conf-${conf.id}`}
                                        className="bg-gray-100 text-red-600 px-3 py-2 rounded hover:bg-red-100 disabled:opacity-50 flex items-center gap-1"
                                        title="Delete conference"
                                    >
                                        <Trash2 className="w-4 h-4" />
                                        <span className="hidden sm:inline">Delete</span>
                                    </button>
                                </div>
                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-gray-100 bg-gray-50">
                                        <div className="pt-3 space-y-2 text-sm">
                                            <p className="text-gray-600">{conf.description}</p>
                                            <p><span className="font-medium text-gray-700">Location:</span> {conf.location}</p>
                                            <p><span className="font-medium text-gray-700">Dates:</span> {conf.dates}</p>
                                            {conf.abstract_deadline && (
                                                <p><span className="font-medium text-gray-700">Abstract deadline:</span> {conf.abstract_deadline}</p>
                                            )}
                                            <p><span className="font-medium text-gray-700">Requirements:</span> {conf.requirements}</p>
                                            <p><span className="font-medium text-gray-700">Tier:</span>{' '}
                                                <span className={`px-2 py-0.5 rounded text-xs ${getTierStyle(conf.tier)}`}>
                                                    {conf.tier || 'niche'}
                                                </span>
                                            </p>
                                            <p><span className="font-medium text-gray-700">AI Confidence:</span>{' '}
                                                <span className={`px-2 py-0.5 rounded text-xs ${conf.confidence_score === 'high' ? 'bg-green-100 text-green-800' :
                                                    conf.confidence_score === 'medium' ? 'bg-amber-100 text-amber-800' :
                                                        'bg-red-100 text-red-800'
                                                    }`}>
                                                    {conf.confidence_score}
                                                </span>
                                            </p>
                                            <a
                                                href={conf.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="text-blue-600 hover:underline inline-block"
                                                onClick={(e) => e.stopPropagation()}
                                            >
                                                {conf.link}
                                            </a>
                                            {conf.last_verified && (
                                                <p className="text-xs text-gray-400">Last verified: {new Date(conf.last_verified).toLocaleString()}</p>
                                            )}
                                            {conf.date_added && (
                                                <p className="text-xs text-gray-400">Added: {new Date(conf.date_added).toLocaleDateString()}</p>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
