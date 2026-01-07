import { GoogleGenAI } from '@google/genai';

// ============================================================================
// Types
// ============================================================================

export interface SearchResult {
    deadline: string;
    confidence: string;
    source: string;
}

export interface ModelSearchResult extends SearchResult {
    model: string;
    searchNumber: number;
}

export interface VerificationResult {
    deadline: string;
    confidence: 'high' | 'medium' | 'low' | 'needs-review';
    sources: string[];
    modelResults: {
        model: string;
        deadline: string;
        confidence: string;
        source: string;
        searchNumber: number;
    }[];
    recommendation: string;
    conflicts?: string;
}

// ============================================================================
// AI Client
// ============================================================================

let genAI: GoogleGenAI | null = null;

function getGenAI(): GoogleGenAI {
    if (!genAI) {
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
            throw new Error('GEMINI_API_KEY environment variable is not set');
        }
        genAI = new GoogleGenAI({ apiKey });
    }
    return genAI;
}

// ============================================================================
// Search Functions
// ============================================================================

export async function performSearch(
    conferenceName: string,
    modelName: string,
    searchNumber: number
): Promise<SearchResult> {
    const today = new Date().toISOString().split('T')[0];
    const prompt = `Search for the official paper submission deadline for "${conferenceName}" conference in 2026. 
Look for the official Call for Papers (CFP) or conference website. 
Today's date is ${today}.

Return ONLY a JSON object with this exact format:
{
  "deadline": "YYYY-MM-DD",
  "confidence": "high/medium/low",
  "source": "URL or brief source description"
}

If you cannot find a confirmed deadline, set confidence to "low" and provide your best estimate.`;

    // Try primary model first, then fallback
    const modelsToTry = [modelName];

    // Add fallback models
    if (modelName === 'gemini-3-pro-preview') {
        modelsToTry.push('gemini-2.5-pro-latest');
    } else if (modelName === 'gemini-3-flash-preview') {
        modelsToTry.push('gemini-2.5-flash-latest');
    }

    for (const currentModel of modelsToTry) {
        try {
            const response = await getGenAI().models.generateContent({
                model: currentModel,
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            const text = response.text;

            // Extract JSON from response
            const jsonMatch = text?.match(/\{[\s\S]*?\}/);
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[0]);
                console.log(`✓ Search ${searchNumber} with ${currentModel} succeeded`);

                // Extract sources from grounding metadata if available
                const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
                const sources = groundingMetadata?.groundingChunks?.map(chunk => chunk.web?.uri).filter(Boolean) || [];

                return {
                    deadline: parsed.deadline || 'unknown',
                    confidence: parsed.confidence || 'low',
                    source: sources[0] || parsed.source || 'No source provided'
                };
            }
        } catch (error) {
            console.error(`Search ${searchNumber} with ${currentModel} failed:`, error);
            if (currentModel === modelsToTry[modelsToTry.length - 1]) {
                break;
            }
            console.log(`Trying fallback model...`);
        }
    }

    return {
        deadline: 'unknown',
        confidence: 'low',
        source: 'All search attempts failed'
    };
}

// ============================================================================
// Consensus Analysis
// ============================================================================

export function analyzeConsensus(results: ModelSearchResult[]): VerificationResult {
    // Count deadline occurrences
    const deadlineCounts = new Map<string, number>();
    const deadlineSources = new Map<string, string[]>();

    results.forEach(r => {
        if (r.deadline !== 'unknown') {
            deadlineCounts.set(r.deadline, (deadlineCounts.get(r.deadline) || 0) + 1);
            if (!deadlineSources.has(r.deadline)) {
                deadlineSources.set(r.deadline, []);
            }
            deadlineSources.get(r.deadline)!.push(r.source);
        }
    });

    // Find most common deadline
    let maxCount = 0;
    let consensusDeadline = 'unknown';
    deadlineCounts.forEach((count, deadline) => {
        if (count > maxCount) {
            maxCount = count;
            consensusDeadline = deadline;
        }
    });

    // Determine confidence based on consensus
    let confidence: 'high' | 'medium' | 'low' | 'needs-review';
    let recommendation: string;
    let conflicts: string | undefined;

    if (maxCount >= 3) {
        confidence = 'high';
        recommendation = 'Strong consensus across multiple searches. Deadline is likely confirmed.';
    } else if (maxCount === 2) {
        confidence = 'medium';
        recommendation = 'Partial consensus. Deadline appears consistent but may need verification.';
        const otherDeadlines = Array.from(deadlineCounts.keys()).filter(d => d !== consensusDeadline);
        if (otherDeadlines.length > 0) {
            conflicts = `Conflicting dates found: ${otherDeadlines.join(', ')}`;
        }
    } else if (consensusDeadline !== 'unknown') {
        confidence = 'low';
        recommendation = 'Low consensus. Multiple conflicting dates found. Manual verification recommended.';
        conflicts = `Multiple dates found: ${Array.from(deadlineCounts.keys()).join(', ')}`;
    } else {
        confidence = 'needs-review';
        recommendation = 'Unable to find reliable deadline information. Manual review required.';
        consensusDeadline = results[0]?.deadline || 'unknown';
    }

    return {
        deadline: consensusDeadline,
        confidence,
        sources: deadlineSources.get(consensusDeadline) || [],
        modelResults: results.map(r => ({
            model: r.model,
            deadline: r.deadline,
            confidence: r.confidence,
            source: r.source,
            searchNumber: r.searchNumber
        })),
        recommendation,
        conflicts
    };
}

// ============================================================================
// Full Verification
// ============================================================================

export async function verifyConferenceDeadline(conferenceName: string): Promise<VerificationResult> {
    console.log(`Starting verification for: ${conferenceName}`);

    // Perform 4 searches: 2 with Flash Preview, 2 with Pro Preview
    const searches = [
        { model: 'gemini-3-flash-preview', searchNum: 1 },
        { model: 'gemini-3-flash-preview', searchNum: 2 },
        { model: 'gemini-3-pro-preview', searchNum: 1 },
        { model: 'gemini-3-pro-preview', searchNum: 2 },
    ];

    const results = await Promise.all(
        searches.map(async ({ model, searchNum }) => {
            const result = await performSearch(conferenceName, model, searchNum);
            return {
                ...result,
                model,
                searchNumber: searchNum
            };
        })
    );

    console.log(`Verification results for ${conferenceName}:`, results);

    return analyzeConsensus(results);
}
