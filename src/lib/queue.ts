import Queue from 'bull';

let jobQueue: Queue.Queue | null = null;

export async function getQueue() {
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

  try {
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
        enableReadyCheck: true, // Enable ready check
        retryStrategy: function (times: number) {
          if (times > 10) {
            console.error('Redis connection failed after 10 retries');
            return null; // Stop retrying
          }
          const delay = Math.min(times * 50, 2000);
          console.log(`Redis connection retry ${times} in ${delay}ms`);
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
      console.error('Disconnected from Redis - attempting to reconnect...');
      jobQueue = null; // Clear the queue so it will be recreated on next getQueue() call
    });

    // Verify the connection works
    await jobQueue.isReady();
    console.log('Job queue initialized and ready');
    
    return jobQueue;
  } catch (error) {
    console.error('Failed to initialize job queue:', error);
    jobQueue = null;
    throw error;
  }
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