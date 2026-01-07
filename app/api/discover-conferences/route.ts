import { GoogleGenAI } from '@google/genai';
import { NextResponse } from 'next/server';
import { getAllConferences, setAllConferences, addToPending, validateConferenceData } from '@/lib/db';
import type { Conference } from '@/lib/db';

const genAI = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY || '' });

export async function POST() {
    if (!process.env.GEMINI_API_KEY) {
        return NextResponse.json({ error: 'GEMINI_API_KEY not configured' }, { status: 500 });
    }

    try {
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
            return NextResponse.json({
                success: true,
                added: 0,
                pending_review: 0,
                message: 'No new conferences found'
            });
        }

        let discovered;
        try {
            discovered = JSON.parse(jsonMatch[0]);
        } catch (parseError) {
            console.error('Failed to parse LLM response:', parseError);
            return NextResponse.json({
                error: 'Failed to parse conference data',
                details: String(parseError)
            }, { status: 500 });
        }

        // Validate and separate by confidence
        const validHigh: any[] = [];
        const validLow: any[] = [];
        const invalid: any[] = [];

        for (const conf of discovered) {
            const validation = validateConferenceData(conf);
            if (!validation.valid) {
                invalid.push({ conference: conf.name, errors: validation.errors });
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

            const newConferences: Conference[] = validHigh.map((conf: any, idx: number) => ({
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
                confidence_score: conf.confidence_score,
                verification_sources: [],
                date_added: new Date().toISOString(),
                verification_history: []
            }));

            await setAllConferences([...existing, ...newConferences]);
            addedConferences.push(...validHigh.map(c => c.name));
        }

        // Add low confidence to pending for review
        let pendingAdded = 0;
        for (const conf of validLow) {
            const added = await addToPending(conf);
            if (added) pendingAdded++;
        }

        return NextResponse.json({
            success: true,
            added: addedConferences.length,
            pending_review: pendingAdded,
            auto_added: addedConferences,
            skipped_invalid: invalid.length,
            invalid_conferences: invalid
        });
    } catch (error) {
        console.error('Discovery error:', error);
        return NextResponse.json(
            { error: 'Discovery failed', details: String(error) },
            { status: 500 }
        );
    }
}

export const dynamic = 'force-dynamic';
