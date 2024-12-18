import { NextResponse } from 'next/server';
import { isValidApiKey } from '~/utils/api/validate';
import analysisQueue from '~/lib/queues/analysis-queue';

export async function GET(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        pending: (await analysisQueue.length)
      }
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error('Health check failed:', error);
    return NextResponse.json(
      { 
        status: 'unhealthy',
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: new Date().toISOString()
      },
      { status: 500 }
    );
  }
} 