import Queue from 'bull';

let jobQueue: Queue.Queue | null = null;

export function getQueue() {
  if (jobQueue) {
    return jobQueue;
  }

  // Get Redis URL and token from environment variables
  const REDIS_URL = process.env.KV_REST_API_URL;
  const REDIS_TOKEN = process.env.KV_REST_API_TOKEN;

  console.log('Initializing queue with Redis URL:', REDIS_URL ? 'URL is set' : 'URL is missing');
  console.log('Redis token:', REDIS_TOKEN ? 'Token is set' : 'Token is missing');

  if (!REDIS_URL) {
    throw new Error('Redis URL not found in environment variables (KV_REST_API_URL)');
  }

  if (!REDIS_TOKEN) {
    throw new Error('Redis token not found in environment variables (KV_REST_API_TOKEN)');
  }

  // Parse Redis URL to get host and port
  const redisUrl = new URL(REDIS_URL);

  // Create a new queue with connection options
  console.log('Creating job queue...');
  jobQueue = new Queue('wrapped-analysis-jobs', {
    redis: {
      host: redisUrl.hostname,
      port: Number(redisUrl.port) || 6379,
      password: REDIS_TOKEN,
      tls: {
        rejectUnauthorized: false // Required for some Redis providers
      },
      maxRetriesPerRequest: 3,
      enableReadyCheck: false,
      retryStrategy: function (times: number) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    }
  });

  // Add queue event listeners for debugging
  jobQueue.on('error', (error) => {
    console.error('Queue error:', error);
  });

  jobQueue.on('waiting', (jobId) => {
    console.log('Job waiting:', jobId);
  });

  jobQueue.on('active', (job) => {
    console.log('Job active:', job.id);
  });

  jobQueue.on('completed', (job) => {
    console.log('Job completed:', job.id);
  });

  jobQueue.on('failed', (job, error) => {
    console.error('Job failed:', job?.id, error);
  });

  // Add connection event listeners
  jobQueue.on('connect', () => {
    console.log('Connected to Redis');
  });

  jobQueue.on('disconnect', () => {
    console.log('Disconnected from Redis');
  });

  console.log('Job queue initialized');
  return jobQueue;
}

export type WrappedAnalysisJob = {
  address: string;
  fid?: number;
};

export type JobProgress = {
  status: 'fetching' | 'analyzing' | 'complete';
  step: number;
  totalSteps: number;
  chunkProgress?: {
    currentChunk: number;
    totalChunks: number;
  };
}; 