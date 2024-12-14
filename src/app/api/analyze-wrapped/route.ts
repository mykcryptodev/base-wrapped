import { NextResponse } from 'next/server';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import OpenAI from 'openai';

const GRAPHQL_ENDPOINT = 'https://public.zapper.xyz/graphql';

// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Assistant ID for Base Wrapped
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

// Add a simple in-memory lock mechanism
export const activeAnalyses = new Set<string>();

// Track analysis progress
export const analysisProgress = new Map<string, {
  currentChunk: number;
  totalChunks: number;
}>();

interface GraphQLResponse {
  data: {
    accountsTimeline: {
      edges: Array<{
        node: {
          app: {
            tags: string[];
            app: {
              imgUrl: string;
              category: {
                name: string;
                description: string;
              };
            };
          };
          interpretation: {
            processedDescription: string;
          };
          interpreter: {
            category: string;
          };
          key: string;
          timestamp: number;
          transaction: {
            toUser: {
              displayName: {
                value: string;
              };
            };
            fromUser: {
              displayName: {
                value: string;
              };
            };
            value: string;
          };
        };
      }>;
      pageInfo: {
        startCursor: string;
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
}

export function isValidApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validApiKey = process.env.API_ROUTE_SECRET;
  
  if (!validApiKey) {
    console.error('API_ROUTE_SECRET is not configured');
    return false;
  }

  return apiKey === validApiKey;
}

export async function fetchTransactionsFromZapper(address: string) {
  const allTransactions = [];
  let hasNextPage = true;
  let cursor = null;
  const PERIOD_START = new Date('2024-01-01').getTime();
  const PERIOD_END = new Date().getTime();

  while (hasNextPage) {
    const query = {
      query: `
        query($addresses: [Address!], $realtimeInterpretation: Boolean, $isSigner: Boolean, $network: Network!, $first: Int, $after: String) {
          accountsTimeline(addresses: $addresses, realtimeInterpretation: $realtimeInterpretation, isSigner: $isSigner, network: $network, first: $first, after: $after) {
            edges {
              node {
                app {
                  tags
                  app {
                    imgUrl
                    category {
                      name
                      description
                    }
                  }
                }
                interpretation {
                  processedDescription
                }
                interpreter {
                  category
                }
                key
                timestamp
                transaction {
                  toUser {
                    displayName {
                      value
                    }
                    avatar {
                      value {
                        ... on AvatarUrl {
                          url
                        }
                      }
                    }
                  }
                  fromUser {
                    displayName {
                      value
                    }
                    avatar {
                      value {
                        ... on AvatarUrl {
                          url
                        }
                      }
                    }
                  }
                  value
                }
              }
            }
            pageInfo {
              startCursor
              hasNextPage
              endCursor
            }
          }
        }
      `,
      variables: {
        addresses: [address],
        isSigner: true,
        realtimeInterpretation: false,
        network: "BASE_MAINNET",
        first: 100,
        after: cursor
      }
    };

    const response = await fetch(GRAPHQL_ENDPOINT, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Basic ${Buffer.from(process.env.ZAPPER_API_KEY!).toString('base64')}`,
      },
      body: JSON.stringify(query),
    });

    if (!response.ok) {
      throw new Error('GraphQL request failed');
    }

    const result: GraphQLResponse = await response.json();
    const transactions = result.data.accountsTimeline.edges;
    const pageInfo = result.data.accountsTimeline.pageInfo;

    // Check if we've reached our period or earlier
    const oldestTimestamp = transactions[transactions.length - 1]?.node.timestamp;
    if (oldestTimestamp && oldestTimestamp < PERIOD_START) {
      // Filter only the period transactions from this batch
      const periodTransactions = transactions.filter(
        tx => tx.node.timestamp >= PERIOD_START && tx.node.timestamp < PERIOD_END
      );
      allTransactions.push(...periodTransactions);
      break;
    }

    allTransactions.push(...transactions);
    console.log({transactions});

    // Update pagination using pageInfo
    hasNextPage = pageInfo.hasNextPage;
    console.log({pageInfo, hasNextPage});
    if (hasNextPage) {
      cursor = pageInfo.endCursor;
    }
  }

  return allTransactions;
}

// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;

export async function saveToS3Cache(key: string, data: unknown) {
  try {
    const command = new PutObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
      Body: JSON.stringify(data),
      ContentType: 'application/json',
    });
    
    await s3Client.send(command);
  } catch (error) {
    console.error('Error saving to S3:', error);
    throw error;
  }
}

// New function to chunk transactions
function chunkTransactions(transactions: any[], chunkSize = 200) {
  const chunks = [];
  for (let i = 0; i < transactions.length; i += chunkSize) {
    chunks.push(transactions.slice(i, i + chunkSize));
  }
  return chunks;
}

// Modified function to analyze chunks
async function analyzeTransactionChunk(chunk: any, index: number, totalChunks: number) {
  console.log(`
    
    
    ====ANALAZING A CHUNK ${index} of ${totalChunks}====



    `)
  // Create a new thread for this chunk
  const thread = await openai.beta.threads.create();
  
  try {
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: `Please analyze this batch of transactions and provide insights: ${JSON.stringify(chunk)}`
    });

    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID!,
    });

    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'failed') {
        throw new Error('Assistant run failed');
      }
      console.log({runStatus, runId: run.id, threadId: thread.id});
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];
    return lastMessage.content[0].type === 'text' ? lastMessage.content[0].text.value : '';
  } finally {
    // Clean up the thread
    try {
      await openai.beta.threads.del(thread.id);
    } catch (error) {
      console.error('Error cleaning up chunk thread:', error);
    }
  }
}

export async function getAnalysisFromOpenAI(transactions: unknown, address: string) {
  console.log(`
    
    
    🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈
    ====INITIALIZING ANALYSIS====
    🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈🌈

    
    `)
  let finalThread: string | undefined;
  try {
    // Chunk the transactions
    const chunks = chunkTransactions(transactions as any[]);
    const normalizedAddress = address.toLowerCase();

    // Initialize progress
    analysisProgress.set(normalizedAddress, {
      currentChunk: 0,
      totalChunks: chunks.length
    });

    // Process chunks in parallel with separate threads
    const chunkPromises = chunks.map((chunk, index) => 
      analyzeTransactionChunk(chunk, index, chunks.length)
        .then(async (chunkAnalysis) => {
          // Update progress after each chunk
          analysisProgress.set(normalizedAddress, {
            currentChunk: index + 1,
            totalChunks: chunks.length
          });

          try {
            return JSON.parse(chunkAnalysis);
          } catch (error) {
            console.error('Error parsing chunk analysis:', error);
            return {};
          }
        })
    );

    // Wait for all chunks to be processed
    const chunkResults = await Promise.all(chunkPromises);
    console.log(`
      

      ====🔥CHUNK RESULTS====
      
      
      `)
    console.log(JSON.stringify(chunkResults));

    // Combine all chunk results
    const combinedAnalysis = chunkResults.reduce((acc, curr) => {
      // Merge arrays for each category
      ['popularTokens', 'popularActions', 'popularUsers', 'otherStories'].forEach(category => {
        if (curr[category]) {
          if (!acc[category]) acc[category] = [];
          acc[category] = [...acc[category], ...curr[category]];
        }
      });
      return acc;
    }, {} as any);

    console.log(`
      

      ====🔥COMBINED ANALYSIS====
      
      
      `)
    console.log(JSON.stringify(combinedAnalysis));

    // Create a new thread for final consolidation
    const finalConsolidationThread = await openai.beta.threads.create();
    finalThread = finalConsolidationThread.id;

    // Final consolidation message
    await openai.beta.threads.messages.create(finalConsolidationThread.id, {
      role: "user",
      content: `Please provide a final consolidated analysis, removing any duplicates and keeping only the most significant items in each category. Here's all the data: ${JSON.stringify(combinedAnalysis)}`
    });

    const finalRun = await openai.beta.threads.runs.create(finalConsolidationThread.id, {
      assistant_id: ASSISTANT_ID!,
    });

    let finalRunStatus = await openai.beta.threads.runs.retrieve(finalConsolidationThread.id, finalRun.id);
    while (finalRunStatus.status !== 'completed') {
      if (finalRunStatus.status === 'failed') {
        throw new Error('Final analysis run failed');
      }
      console.log({finalRunStatus});
      await new Promise(resolve => setTimeout(resolve, 1000));
      finalRunStatus = await openai.beta.threads.runs.retrieve(finalConsolidationThread.id, finalRun.id);
    }

    const finalMessages = await openai.beta.threads.messages.list(finalConsolidationThread.id);
    const finalMessage = finalMessages.data[0];
    return JSON.parse(finalMessage.content[0].type === 'text' ? finalMessage.content[0].text.value : '');

  } catch (error) {
    console.error('Error getting analysis from OpenAI:', error);
    throw error;
  } finally {
    if (finalThread) {
      try {
        await openai.beta.threads.del(finalThread);
      } catch (cleanupError) {
        console.error('Error cleaning up final thread:', cleanupError);
      }
    }
    // Clean up progress tracking
    analysisProgress.delete(address.toLowerCase());
  }
}

export async function getFromS3Cache(key: string) {
  try {
    const command = new GetObjectCommand({
      Bucket: BUCKET_NAME,
      Key: key,
    });
    
    const response = await s3Client.send(command);
    if (response.Body) {
      const str = await response.Body.transformToString();
      return JSON.parse(str);
    }
  } catch (e) {
    console.log({e});
    return null;
  }
}

export async function POST(request: Request) {
  try {
    if (!isValidApiKey(request)) {
      return NextResponse.json(
        { error: 'Unauthorized - Invalid or missing API key' },
        { status: 401 }
      );
    }

    const { address } = await request.json();

    if (!address || typeof address !== 'string') {
      return NextResponse.json(
        { error: 'Invalid address parameter' },
        { status: 400 }
      );
    }

    const normalizedAddress = address.toLowerCase();

    // Check if we have cached analysis in S3
    const analysisCacheKey = `wrapped-2024-analysis/${normalizedAddress}.json`;
    const cachedAnalysis = await getFromS3Cache(analysisCacheKey);
    
    if (cachedAnalysis) {
      console.log('Analysis cache hit for address:', address);
      return NextResponse.json({ 
        status: 'complete',
        analysis: cachedAnalysis 
      });
    }

    // Check if analysis is already in progress
    if (activeAnalyses.has(normalizedAddress)) {
      console.log(`Analysis already in progress for ${normalizedAddress}`);
      const chunkProgress = analysisProgress.get(normalizedAddress);
      
      return NextResponse.json({
        status: 'analyzing',
        message: chunkProgress 
          ? `Analyzing chunk ${chunkProgress.currentChunk} of ${chunkProgress.totalChunks}...`
          : 'Analyzing your transactions with AI...',
        step: 2,
        totalSteps: 3,
        progress: chunkProgress ? {
          current: chunkProgress.currentChunk,
          total: chunkProgress.totalChunks
        } : undefined
      });
    }

    // Check if we have cached raw transactions
    const rawCacheKey = `wrapped-2024-raw/${normalizedAddress}.json`;
    let transactions;
    let status: 'fetching' | 'analyzing' = 'fetching';
    let step = 1;
    
    try {
      transactions = await getFromS3Cache(rawCacheKey);
      if (transactions) {
        status = 'analyzing';
        step = 2;
      }
    } catch (error) {
      console.error('Error getting transactions from S3:', error);
    }
    
    // Start the background process
    activeAnalyses.add(normalizedAddress);
    console.log(`Starting analysis for ${normalizedAddress}`);
    
    try {
      const processUrl = new URL('/api/process-wrapped', request.url).toString();
      fetch(processUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.API_ROUTE_SECRET!
        },
        body: JSON.stringify({ address: normalizedAddress })
      }).catch((error) => {
        console.error('Error triggering background process:', error);
        activeAnalyses.delete(normalizedAddress);
      });
    } catch (error) {
      console.error('Error triggering background process:', error);
      activeAnalyses.delete(normalizedAddress);
    }

    return NextResponse.json({
      status,
      message: status === 'analyzing' 
        ? 'Starting analysis of your transactions...'
        : 'Fetching your transaction history... (Step 1 of 3)',
      step,
      totalSteps: 3
    });

  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 