import { NextResponse } from 'next/server';
import { GoogleGenAI } from '@google/genai';

// Force dynamic to ensure fresh checks
export const dynamic = 'force-dynamic';

interface HealthCheck {
    status: 'healthy' | 'degraded' | 'unhealthy';
    timestamp: string;
    checks: {
        redis: CheckResult;
        gemini: CheckResult;
    };
    version: string;
}

interface CheckResult {
    status: 'pass' | 'fail';
    latencyMs?: number;
    error?: string;
}

export async function GET() {
    const startTime = Date.now();
    const checks: HealthCheck['checks'] = {
        redis: { status: 'fail' },
        gemini: { status: 'fail' },
    };

    // Check Redis connectivity
    try {
        const redisStart = Date.now();
        const Redis = (await import('ioredis')).default;
        const redis = new Redis(process.env.REDIS_URL || '', {
            maxRetriesPerRequest: 1,
            connectTimeout: 5000,
        });

        await redis.ping();
        await redis.quit();

        checks.redis = {
            status: 'pass',
            latencyMs: Date.now() - redisStart,
        };
    } catch (error) {
        checks.redis = {
            status: 'fail',
            error: error instanceof Error ? error.message : 'Unknown Redis error',
        };
    }

    // Check Gemini API connectivity
    try {
        const geminiStart = Date.now();
        const apiKey = process.env.GEMINI_API_KEY;

        if (!apiKey) {
            throw new Error('GEMINI_API_KEY not configured');
        }

        const ai = new GoogleGenAI({ apiKey });

        // Simple model list call to verify API connectivity without consuming quota
        await ai.models.list({ pageSize: 1 });

        checks.gemini = {
            status: 'pass',
            latencyMs: Date.now() - geminiStart,
        };
    } catch (error) {
        checks.gemini = {
            status: 'fail',
            error: error instanceof Error ? error.message : 'Unknown Gemini error',
        };
    }

    // Determine overall status
    const allPass = Object.values(checks).every(c => c.status === 'pass');
    const allFail = Object.values(checks).every(c => c.status === 'fail');

    const overallStatus: HealthCheck['status'] = allPass
        ? 'healthy'
        : allFail
            ? 'unhealthy'
            : 'degraded';

    const response: HealthCheck = {
        status: overallStatus,
        timestamp: new Date().toISOString(),
        checks,
        version: process.env.npm_package_version || '0.1.0',
    };

    const httpStatus = overallStatus === 'healthy' ? 200 : overallStatus === 'degraded' ? 200 : 503;

    return NextResponse.json(response, { status: httpStatus });
}
