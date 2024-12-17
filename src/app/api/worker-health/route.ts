import { NextResponse } from 'next/server';
import { getQueue } from '~/lib/queue';
import { isValidApiKey } from '~/utils/api/validate';

export async function GET(req: Request) {
  try {
    if (!isValidApiKey(req)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const queue = getQueue();
    const health = {
      status: 'healthy',
      timestamp: new Date().toISOString(),
      metrics: {
        waiting: await queue.getWaitingCount(),
        active: await queue.getActiveCount(),
        completed: await queue.getCompletedCount(),
        failed: await queue.getFailedCount()
      }
    };

    return NextResponse.json(health);
  } catch (error) {
    console.error('Worker health check failed:', error);
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