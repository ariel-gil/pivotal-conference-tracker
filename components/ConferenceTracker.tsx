'use client';

import React, { useState } from 'react';
import { Calendar, ExternalLink, Filter, ChevronDown, ChevronUp, AlertCircle, Check, CheckCheck, Search, HelpCircle, Clock, Plus, RefreshCw, Bug } from 'lucide-react';
import { Conference, ChangelogEntry } from '@/lib/db';
import { TIER_OPTIONS, ConferenceTier } from '@/lib/tiers';

// ============================================================================
// Constants
// ============================================================================

const URGENT_DAYS_THRESHOLD = 30;
const VERY_URGENT_DAYS_THRESHOLD = 7;

const categoryColors = {
    safety: { bg: 'bg-emerald-100', text: 'text-emerald-800', border: 'border-emerald-300' },
    ml: { bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' },
    nlp: { bg: 'bg-purple-100', text: 'text-purple-800', border: 'border-purple-300' },
    ethics: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300' }
};

const statusColors = {
    open: { bg: 'bg-green-100', text: 'text-green-800' },
    passed: { bg: 'bg-gray-100', text: 'text-gray-500' },
    rolling: { bg: 'bg-blue-100', text: 'text-blue-800' }
};

const tierColors: Record<string, { bg: string; text: string }> = {
    top: { bg: 'bg-yellow-100', text: 'text-yellow-800' },
    notable: { bg: 'bg-sky-100', text: 'text-sky-800' },
    niche: { bg: 'bg-gray-100', text: 'text-gray-600' },
};

const changelogIcons = {
    added: Plus,
    updated: RefreshCw,
    verified: CheckCheck,
    discovered: Search
};

const changelogColors = {
    added: 'text-green-600',
    updated: 'text-blue-600',
    verified: 'text-emerald-600',
    discovered: 'text-purple-600'
};

// ============================================================================
// Utility Functions
// ============================================================================

function isValidDate(dateStr: string): boolean {
    if (!dateStr || dateStr === "Rolling" || dateStr === "unknown") return false;
    const date = new Date(dateStr);
    return !isNaN(date.getTime());
}

function getDaysUntil(dateStr: string): number {
    if (!isValidDate(dateStr)) return Infinity;
    const deadline = new Date(dateStr);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function formatDaysUntil(days: number): string {
    if (days === Infinity) return "Rolling";
    if (days < 0) return `${Math.abs(days)}d ago`;
    if (days === 0) return "Today!";
    if (days === 1) return "Tomorrow!";
    if (days <= 7) return `${days}d left`;
    if (days <= 30) return `${Math.floor(days / 7)}w left`;
    return `${Math.floor(days / 30)}mo left`;
}

function formatRelativeTime(timestamp: string): string {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / (1000 * 60));
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return date.toLocaleDateString();
}

// ============================================================================
// Components
// ============================================================================

function ReviewStatusIndicator({ status }: { status?: string }) {
    switch (status) {
        case 'reviewed':
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-green-100 text-green-800" title="Verified by admin">
                    <CheckCheck className="w-3 h-3" />
                    Verified
                </span>
            );
        case 'speculative':
            return (
                <span className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-amber-100 text-amber-800" title="Not yet verified">
                    <HelpCircle className="w-3 h-3" />
                    Unverified
                </span>
            );
        default:
            // Don't show anything for 'unreviewed' - it's the default state
            return null;
    }
}

function ChangelogSection({ entries }: { entries: ChangelogEntry[] }) {
    if (entries.length === 0) return null;

    return (
        <div className="bg-white rounded-lg shadow-sm p-4 mt-6">
            <h2 className="text-lg font-semibold text-gray-900 mb-3 flex items-center gap-2">
                <Clock className="w-5 h-5 text-gray-500" />
                Recent Updates
            </h2>
            <div className="space-y-2">
                {entries.map((entry) => {
                    const Icon = changelogIcons[entry.type] || RefreshCw;
                    const colorClass = changelogColors[entry.type] || 'text-gray-600';

                    return (
                        <div key={entry.id} className="flex items-start gap-3 text-sm">
                            <Icon className={`w-4 h-4 mt-0.5 ${colorClass}`} />
                            <div className="flex-1 min-w-0">
                                <span className="font-medium text-gray-900">{entry.conferenceName}</span>
                                <span className="text-gray-500"> — {entry.details}</span>
                            </div>
                            <span className="text-xs text-gray-400 whitespace-nowrap">
                                {formatRelativeTime(entry.timestamp)}
                            </span>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}

// ============================================================================
// Main Component
// ============================================================================

export default function ConferenceTracker({
    initialConferences,
    changelog,
    error
}: {
    initialConferences: Conference[];
    changelog: ChangelogEntry[];
    error: string | null;
}) {
    const [filter, setFilter] = useState('all');
    const [tierFilter, setTierFilter] = useState<ConferenceTier[]>(['top', 'notable']);
    const [showPassed, setShowPassed] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);

    const toggleTier = (tier: ConferenceTier) => {
        setTierFilter(prev =>
            prev.includes(tier) ? prev.filter(t => t !== tier) : [...prev, tier]
        );
    };

    if (error) {
        return (
            <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
                <div className="bg-red-50 border border-red-200 rounded-lg p-6 max-w-md">
                    <div className="flex items-center gap-2 text-red-800 mb-2">
                        <AlertCircle className="w-5 h-5" />
                        <h2 className="font-semibold">Error Loading Conferences</h2>
                    </div>
                    <p className="text-red-700 text-sm">{error}</p>
                    <p className="text-red-600 text-xs mt-2">
                        Please check that the database is set up and environment variables are configured correctly.
                    </p>
                </div>
            </div>
        );
    }

    const filteredConferences = initialConferences
        .filter(c => {
            if (filter !== 'all' && c.category !== filter) return false;
            if (tierFilter.length > 0 && !tierFilter.includes(c.tier || 'niche')) return false;
            // Filter by deadline date, not conference status
            if (!showPassed) {
                const daysUntilDeadline = getDaysUntil(c.deadline);
                if (daysUntilDeadline < 0) return false;
            }
            return true;
        })
        .sort((a, b) => {
            const daysA = getDaysUntil(a.deadline);
            const daysB = getDaysUntil(b.deadline);
            return daysA - daysB;
        });

    const needsReviewCount = initialConferences.filter(c =>
        c.confidence_score === 'needs-review' || c.confidence_score === 'low'
    ).length;

    const lastUpdated = initialConferences.find(c => c.last_verified)?.last_verified;

    return (
        <div className="min-h-screen bg-gray-50 p-4">
            <div className="max-w-4xl mx-auto">

                {/* Header */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                    <div className="flex items-center justify-between flex-wrap gap-2">
                        <div>
                            <h1 className="text-xl font-bold text-gray-900">AI Safety Conference Tracker</h1>
                            <p className="text-sm text-gray-500">
                                {lastUpdated
                                    ? `Last auto-refresh: ${new Date(lastUpdated).toLocaleDateString()} ${new Date(lastUpdated).toLocaleTimeString()}`
                                    : 'Automated daily updates'}. Results via AI w/search grounding but have not been fully verified, please double check them.
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 flex items-center gap-2">
                                <span className="px-2 py-0.5 rounded-full bg-green-100 text-green-800 flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3" />
                                    Verified
                                </span>
                                <span className="text-gray-400">= admin reviewed</span>
                            </div>
                        </div>
                    </div>

                    {/* Status badges */}
                    {needsReviewCount > 0 && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-lg">
                                <HelpCircle className="w-4 h-4" />
                                <span>
                                    {needsReviewCount} deadline{needsReviewCount > 1 ? 's' : ''} need verification
                                </span>
                            </div>
                        </div>
                    )}
                </div>

                {/* Filters */}
                <div className="bg-white rounded-lg shadow-sm p-4 mb-4">
                    <div className="flex flex-wrap gap-3 items-center">
                        <div className="flex items-center gap-2">
                            <Filter className="w-4 h-4 text-gray-500" />
                            <span className="text-sm text-gray-600">Category:</span>
                        </div>
                        {['all', 'safety', 'ml', 'nlp', 'ethics'].map(cat => (
                            <button
                                key={cat}
                                onClick={() => setFilter(cat)}
                                className={`px-3 py-1 rounded-full text-sm capitalize ${filter === cat
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                                    }`}
                            >
                                {cat}
                            </button>
                        ))}
                        <div className="flex items-center gap-2 ml-auto">
                            <label className="flex items-center gap-2 text-sm text-gray-600 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={showPassed}
                                    onChange={e => setShowPassed(e.target.checked)}
                                    className="rounded"
                                />
                                Show passed
                            </label>
                        </div>
                    </div>
                    <div className="flex flex-wrap gap-3 items-center mt-3 pt-3 border-t border-gray-100">
                        <span className="text-sm text-gray-600">Tier:</span>
                        {TIER_OPTIONS.map(opt => (
                            <button
                                key={opt.value}
                                onClick={() => toggleTier(opt.value)}
                                className={`px-3 py-1 rounded-full text-sm ${
                                    tierFilter.includes(opt.value)
                                        ? opt.color
                                        : 'bg-gray-50 text-gray-400 hover:bg-gray-100'
                                }`}
                            >
                                {opt.label}
                            </button>
                        ))}
                    </div>
                </div>

                {/* Conference List */}
                <div className="space-y-3">
                    {/* Column Headers */}
                    {filteredConferences.length > 0 && (
                        <div className="flex items-center justify-between px-4 py-2 text-xs font-medium text-gray-500 uppercase tracking-wider">
                            <div className="flex-1">
                                <span>Conference / Dates</span>
                            </div>
                            <div className="text-right mr-8">
                                <span>Submission Deadline</span>
                            </div>
                        </div>
                    )}
                    {filteredConferences.map(conf => {
                        const days = getDaysUntil(conf.deadline);
                        const isExpanded = expandedId === conf.id;
                        const isUrgent = days >= 0 && days <= VERY_URGENT_DAYS_THRESHOLD && conf.status !== 'passed';
                        const colors = categoryColors[conf.category as keyof typeof categoryColors] || categoryColors.ml;
                        const statusColor = statusColors[conf.status as keyof typeof statusColors] || statusColors.open;

                        return (
                            <div
                                key={conf.id}
                                className={`bg-white rounded-lg shadow-sm overflow-hidden border-l-4 ${colors.border} ${isUrgent ? 'ring-2 ring-red-200' : ''
                                    }`}
                            >
                                <div
                                    className="p-4 cursor-pointer hover:bg-gray-50"
                                    onClick={() => setExpandedId(isExpanded ? null : conf.id)}
                                >
                                    <div className="flex items-start justify-between gap-3">
                                        <div className="flex-1 min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <h3 className="font-semibold text-gray-900">{conf.name}</h3>
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${colors.bg} ${colors.text}`}>
                                                    {conf.category}
                                                </span>
                                                <span className={`px-2 py-0.5 rounded-full text-xs ${statusColor.bg} ${statusColor.text}`}>
                                                    {conf.status}
                                                </span>
                                                {(() => {
                                                    const tc = tierColors[conf.tier || 'niche'] || tierColors.niche;
                                                    return (
                                                        <span className={`px-2 py-0.5 rounded-full text-xs ${tc.bg} ${tc.text}`}>
                                                            {conf.tier || 'niche'}
                                                        </span>
                                                    );
                                                })()}
                                                <ReviewStatusIndicator status={conf.review_status} />
                                            </div>
                                            <div className="flex items-center gap-4 mt-1 text-sm text-gray-600">
                                                <span className="flex items-center gap-1">
                                                    <Calendar className="w-3.5 h-3.5" />
                                                    {conf.dates}
                                                </span>
                                                <span>{conf.location}</span>
                                            </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                            <div className={`text-right ${isUrgent ? 'text-red-600' : 'text-gray-600'}`}>
                                                <div className="font-semibold">
                                                    {formatDaysUntil(days)}
                                                </div>
                                                <div className="text-xs">
                                                    {conf.deadline}
                                                </div>
                                            </div>
                                            {isExpanded ? (
                                                <ChevronUp className="w-5 h-5 text-gray-400" />
                                            ) : (
                                                <ChevronDown className="w-5 h-5 text-gray-400" />
                                            )}
                                        </div>
                                    </div>
                                </div>

                                {isExpanded && (
                                    <div className="px-4 pb-4 border-t border-gray-100">
                                        <div className="pt-3 space-y-2">
                                            {conf.abstract_deadline && (
                                                <p className="text-sm">
                                                    <span className="font-medium text-gray-700">Abstract deadline:</span>{' '}
                                                    <span className="text-gray-600">{conf.abstract_deadline}</span>
                                                </p>
                                            )}
                                            <p className="text-sm text-gray-600">{conf.description}</p>
                                            <p className="text-sm">
                                                <span className="font-medium text-gray-700">Requirements:</span>{' '}
                                                <span className="text-gray-600">{conf.requirements}</span>
                                            </p>

                                            {conf.verification_sources && conf.verification_sources.length > 0 && (
                                                <div className="text-sm">
                                                    <span className="font-medium text-gray-700">Verified sources:</span>
                                                    <ul className="mt-1 space-y-1">
                                                        {conf.verification_sources.slice(0, 3).map((source, idx) => (
                                                            <li key={idx} className="text-xs text-gray-500 truncate">
                                                                • {source}
                                                            </li>
                                                        ))}
                                                    </ul>
                                                </div>
                                            )}

                                            {conf.last_verified && (
                                                <p className="text-xs text-gray-400">
                                                    Last verified: {new Date(conf.last_verified).toLocaleDateString()}
                                                </p>
                                            )}
                                            {conf.date_added && (
                                                <p className="text-xs text-gray-400">
                                                    Added to tracker: {new Date(conf.date_added).toLocaleDateString()}
                                                </p>
                                            )}
                                            <a
                                                href={conf.link}
                                                target="_blank"
                                                rel="noopener noreferrer"
                                                className="inline-flex items-center gap-1 text-sm text-blue-600 hover:text-blue-800"
                                                onClick={e => e.stopPropagation()}
                                            >
                                                <ExternalLink className="w-3.5 h-3.5" />
                                                Visit website
                                            </a>
                                        </div>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>

                {filteredConferences.length === 0 && (
                    <div className="bg-white rounded-lg shadow-sm p-8 text-center text-gray-500">
                        No conferences match your filters
                    </div>
                )}

                {/* Changelog Section */}
                <ChangelogSection entries={changelog} />

                {/* Footer */}
                <div className="mt-6 text-center text-sm text-gray-500">
                    <p>
                        {initialConferences.length} conferences tracked
                        {' • '}
                        {initialConferences.filter(c => c.tier === 'top').length} top
                        {' / '}
                        {initialConferences.filter(c => c.tier === 'notable').length} notable
                        {' / '}
                        {initialConferences.filter(c => !c.tier || c.tier === 'niche').length} niche
                        {' • '}
                        Automated verification every 24 hours
                    </p>
                    <a
                        href="https://github.com/ariel-gil/pivotal-conference-tracker/issues/new?title=Bug%20Report&body=%23%23%20Description%0ADescribe%20the%20issue...%0A%0A%23%23%20Steps%20to%20Reproduce%0A1.%20...%0A%0A%23%23%20Expected%20Behavior%0A..."
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-gray-400 hover:text-gray-600 transition-colors"
                    >
                        <Bug className="w-3.5 h-3.5" />
                        Report a bug
                    </a>
                </div>
            </div>
        </div>
    );
}
