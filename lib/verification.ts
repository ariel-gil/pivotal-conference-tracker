import { GoogleGenAI } from '@google/genai';
import { AI_MODELS, VERIFICATION_MODELS, DISCOVERY_MODEL, DISCOVERY_FALLBACK } from './config';

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

export function getGenAI(): GoogleGenAI {
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
    searchNumber: number,
    fallbackModel?: string
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

    const modelsToTry = [modelName];
    if (fallbackModel) {
        modelsToTry.push(fallbackModel);
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

    let maxCount = 0;
    let consensusDeadline = 'unknown';
    deadlineCounts.forEach((count, deadline) => {
        if (count > maxCount) {
            maxCount = count;
            consensusDeadline = deadline;
        }
    });

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

    const results = await Promise.all(
        VERIFICATION_MODELS.map(async ({ model, fallback }, index) => {
            const searchNum = (index % 2) + 1;
            const result = await performSearch(conferenceName, model, searchNum, fallback);
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

// ============================================================================
// Discovery
// ============================================================================

export async function discoverConferences(existingNames: string): Promise<any[]> {
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

Only return conferences you found with credible, recent sources. Set confidence_score to "high" only if you found official CFP/website.
Do not include any conferences more than 1 year into the future from today's date.`;

    // Try primary model, then fallback
    const modelsToTry = [DISCOVERY_MODEL, DISCOVERY_FALLBACK];

    for (const model of modelsToTry) {
        try {
            const response = await getGenAI().models.generateContent({
                model,
                contents: prompt,
                config: {
                    tools: [{ googleSearch: {} }]
                }
            });

            const text = response.text;
            const jsonMatch = text?.match(/\[[\s\S]*\]/);

            if (jsonMatch) {
                console.log(`Discovery succeeded with ${model}`);
                return JSON.parse(jsonMatch[0]);
            }
        } catch (error) {
            console.error(`Discovery with ${model} failed:`, error);
            if (model === modelsToTry[modelsToTry.length - 1]) {
                throw error;
            }
            console.log('Trying fallback model for discovery...');
        }
    }

    return [];
}
