'use client';

import React, { useState } from 'react';
import { Calendar, ExternalLink, Filter, ChevronDown, ChevronUp, AlertCircle, Check, CheckCheck, Search, HelpCircle } from 'lucide-react';
import { Conference } from '@/lib/db';

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

function getDaysUntil(dateStr: string) {
    if (dateStr === "Rolling" || dateStr === "unknown") return Infinity;
    const deadline = new Date(dateStr);
    const today = new Date();
    const diffTime = deadline.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    return diffDays;
}

function formatDaysUntil(days: number) {
    if (days === Infinity) return "Rolling";
    if (days < 0) return `${Math.abs(days)}d ago`;
    if (days === 0) return "Today!";
    if (days === 1) return "Tomorrow!";
    if (days <= 7) return `${days}d left`;
    if (days <= 30) return `${Math.floor(days / 7)}w left`;
    return `${Math.floor(days / 30)}mo left`;
}

function ConfidenceIndicator({ score }: { score: string }) {
    switch (score) {
        case 'high':
            return (
                <span className="flex items-center gap-1 text-green-600" title="High confidence (3-4 sources agree)">
                    <CheckCheck className="w-4 h-4" />
                    <CheckCheck className="w-4 h-4 -ml-3" />
                </span>
            );
        case 'medium':
            return (
                <span className="flex items-center gap-1 text-amber-600" title="Medium confidence (2 sources agree)">
                    <CheckCheck className="w-4 h-4" />
                </span>
            );
        case 'low':
            return (
                <span className="flex items-center gap-1 text-orange-600" title="Low confidence (conflicting data)">
                    <Check className="w-4 h-4" />
                </span>
            );
        case 'needs-review':
            return (
                <span className="flex items-center gap-1 text-red-600" title="Needs manual review">
                    <Search className="w-4 h-4" />
                </span>
            );
        default:
            return null;
    }
}

export default function ConferenceTracker({
    initialConferences,
    error
}: {
    initialConferences: Conference[];
    error: string | null;
}) {
    const [filter, setFilter] = useState('all');
    const [showPassed, setShowPassed] = useState(false);
    const [expandedId, setExpandedId] = useState<number | null>(null);
    const [sortBy, setSortBy] = useState('deadline');

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
                        Make sure the database is set up and environment variables are configured.
                    </p>
                </div>
            </div>
        );
    }

    const filteredConferences = initialConferences
        .filter(c => {
            if (filter !== 'all' && c.category !== filter) return false;
            if (!showPassed && c.status === 'passed') return false;
            return true;
        })
        .sort((a, b) => {
            if (sortBy === 'deadline') {
                const daysA = getDaysUntil(a.deadline);
                const daysB = getDaysUntil(b.deadline);
                return daysA - daysB;
            }
            return a.name.localeCompare(b.name);
        });

    const urgentCount = initialConferences.filter(c => {
        const days = getDaysUntil(c.deadline);
        return days >= 0 && days <= 30 && c.status !== 'passed';
    }).length;

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
                                    : 'Automated daily updates'}
                            </p>
                        </div>
                        <div className="flex items-center gap-3">
                            <div className="text-xs text-gray-500 flex items-center gap-3">
                                <span className="flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3 text-green-600" />
                                    <span>High</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <CheckCheck className="w-3 h-3 text-amber-600" />
                                    <span>Medium</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <Check className="w-3 h-3 text-orange-600" />
                                    <span>Low</span>
                                </span>
                                <span className="flex items-center gap-1">
                                    <Search className="w-3 h-3 text-red-600" />
                                    <span>Review</span>
                                </span>
                            </div>
                        </div>
                    </div>

                    {/* Status badges */}
                    {(needsReviewCount > 0 || urgentCount > 0) && (
                        <div className="mt-3 flex items-center gap-2 flex-wrap">
                            {needsReviewCount > 0 && (
                                <div className="flex items-center gap-2 text-sm text-amber-700 bg-amber-50 px-3 py-1 rounded-lg">
                                    <HelpCircle className="w-4 h-4" />
                                    <span>
                                        {needsReviewCount} deadline{needsReviewCount > 1 ? 's' : ''} need verification
                                    </span>
                                </div>
                            )}
                            {urgentCount > 0 && (
                                <div className="flex items-center gap-2 text-sm text-red-700 bg-red-50 px-3 py-1 rounded-lg">
                                    <AlertCircle className="w-4 h-4" />
                                    <span>
                                        {urgentCount} urgent deadline{urgentCount > 1 ? 's' : ''} (within 30 days)
                                    </span>
                                </div>
                            )}
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
                </div>

                {/* Conference List */}
                <div className="space-y-3">
                    {filteredConferences.map(conf => {
                        const days = getDaysUntil(conf.deadline);
                        const isExpanded = expandedId === conf.id;
                        const isUrgent = days >= 0 && days <= 7 && conf.status !== 'passed';
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
                                                <ConfidenceIndicator score={conf.confidence_score} />
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

                {/* Footer */}
                <div className="mt-6 text-center text-sm text-gray-500">
                    {initialConferences.length} conferences tracked • Automated verification every 24 hours
                </div>
            </div>
        </div>
    );
}
