import { GoogleGenAI } from '@google/genai';
import { NextRequest, NextResponse } from 'next/server';
import { getAllConferences, setAllConferences, addToPending, validateConferenceData, addChangelogEntry } from '@/lib/db';
import type { Conference, PendingConferenceInput } from '@/lib/db';
import { validateCronAuth, unauthorizedResponse } from '@/lib/auth';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function GET(request: NextRequest) {
    // Verify cron secret (same as other cron jobs)
    const authResult = validateCronAuth(request);
    if (!authResult.valid) {
        return unauthorizedResponse(authResult.error);
    }

    if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
        console.log('Starting scheduled conference discovery...');

        // Get existing conferences to avoid duplicates
        const existing = await getAllConferences();
        const existingNames = existing.map(c => c.name).join(', ');

        const prompt = `Search for upcoming AI safety, AI ethics, machine learning, and NLP conferences in 2026 and 2027.
        
Focus on academic conferences relevant to AI alignment, AI safety research, fairness, transparency, and interpretability.

Return ONLY a JSON array with this exact format:
[
  {
    "name": "Conference Name YEAR",
    "deadline": "YYYY-MM-DD",
    "abstract_deadline": "YYYY-MM-DD",
    "location": "City, Country",
    "dates": "Conference dates",
    "description": "Brief description",
    "requirements": "Submission requirements",
    "link": "Official website URL",
    "category": "safety/ml/nlp/ethics",
    "status": "open/passed/rolling",
    "confidence_score": "high/medium/low"
  }
]

Exclude these existing conferences: ${existingNames}

Only return conferences you found with credible, recent sources. Set confidence_score to "high" only if you found official CFP/website.`;

        const response = await genAI.models.generateContent({
            model: 'gemini-2.5-pro-latest',
            contents: prompt,
            config: {
                tools: [{ googleSearch: {} }]
            }
        });

        const text = response.text;
        const jsonMatch = text?.match(/\[[\s\S]*\]/);

        if (!jsonMatch) {
            console.log('No new conferences found in discovery');
            return NextResponse.json({
                success: true,
                added: 0,
                pending_review: 0,
                message: 'No new conferences found'
            });
        }

        let discovered: PendingConferenceInput[];
        try {
            discovered = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('Failed to parse LLM response:', parseError);
            return NextResponse.json({
                error: 'Failed to parse conference data from AI response',
                details: parseError instanceof Error ? parseError.message : String(parseError)
            }, { status: 500 });
        }

        // Validate and separate by confidence
        const validHigh: PendingConferenceInput[] = [];
        const validLow: PendingConferenceInput[] = [];
        const invalid: Array<{ conference: string; errors: string[] }> = [];

        for (const conf of discovered) {
            const validation = validateConferenceData(conf);
            if (!validation.valid) {
                invalid.push({ conference: conf.name || 'Unknown', errors: validation.errors });
                continue;
            }

            if (conf.confidence_score === 'high') {
                validHigh.push(conf);
            } else {
                validLow.push(conf);
            }
        }

        // Auto-add high confidence conferences
        const addedConferences: string[] = [];
        if (validHigh.length > 0) {
            const nextId = existing.length > 0 ? Math.max(...existing.map(c => c.id)) + 1 : 1;

            const newConferences: Conference[] = validHigh.map((conf, idx) => ({
                id: nextId + idx,
                name: conf.name,
                deadline: conf.deadline,
                abstract_deadline: conf.abstract_deadline,
                location: conf.location,
                dates: conf.dates,
                description: conf.description,
                requirements: conf.requirements || 'See conference website',
                link: conf.link,
                category: conf.category,
                status: conf.status,
                confidence_score: conf.confidence_score as Conference['confidence_score'],
                verification_sources: [],
                date_added: new Date().toISOString(),
                verification_history: []
            }));

            await setAllConferences([...existing, ...newConferences]);
            addedConferences.push(...validHigh.map(c => c.name));

            // Add changelog entries for auto-added conferences
            for (const conf of validHigh) {
                await addChangelogEntry({
                    type: 'added',
                    conferenceName: conf.name,
                    details: `Auto-discovered and added (high confidence, deadline: ${conf.deadline})`
                });
            }
        }

        // Add low confidence to pending for review
        let pendingAdded = 0;
        for (const conf of validLow) {
            const added = await addToPending(conf);
            if (added) pendingAdded++;
        }

        console.log(`Discovery complete: ${addedConferences.length} added, ${pendingAdded} pending review`);

        return NextResponse.json({
            success: true,
            added: addedConferences.length,
            pending_review: pendingAdded,
            auto_added: addedConferences,
            skipped_invalid: invalid.length
        });
    } catch (error) {
        console.error('Scheduled discovery error:', error);
        return NextResponse.json(
            { error: 'Discovery failed', details: error instanceof Error ? error.message : String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
