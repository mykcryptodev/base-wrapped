import { NextResponse } from 'next/server';
import analysisQueue from '~/lib/queues/analysis-queue';

export async function POST(req: Request) {
  try {
    const { address, fid } = await req.json();
    
    if (!address) {
      return NextResponse.json({ error: 'Address is required' }, { status: 400 });
    }

    await analysisQueue.enqueue(
      { address, fid },
      {
        id: address.toLowerCase(), // Use address as unique ID
        exclusive: true
      }
    );

    return NextResponse.json({ status: 'queued', address });
  } catch (error) {
    console.error('Failed to start job:', error);
    return NextResponse.json(
      { error: 'Failed to start analysis job' },
      { status: 500 }
    );
  }
} 