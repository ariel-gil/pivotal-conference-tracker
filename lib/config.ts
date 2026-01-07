// Centralized AI model configuration

export const AI_MODELS = {
    // Primary models for verification and discovery (with grounding)
    FLASH: 'gemini-3-flash-preview',
    PRO: 'gemini-3-pro-preview',

    // Fallback models if primary fails
    FALLBACK_FLASH: 'gemini-2.5-flash-latest',
    FALLBACK_PRO: 'gemini-2.5-pro-latest',
} as const;

// Model configurations for verification (4 searches)
export const VERIFICATION_MODELS = [
    { model: AI_MODELS.FLASH, fallback: AI_MODELS.FALLBACK_FLASH },
    { model: AI_MODELS.FLASH, fallback: AI_MODELS.FALLBACK_FLASH },
    { model: AI_MODELS.PRO, fallback: AI_MODELS.FALLBACK_PRO },
    { model: AI_MODELS.PRO, fallback: AI_MODELS.FALLBACK_PRO },
];

// Use Flash for discovery (cheaper, still accurate)
export const DISCOVERY_MODEL = AI_MODELS.FLASH;
export const DISCOVERY_FALLBACK = AI_MODELS.FALLBACK_FLASH;
