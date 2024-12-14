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

interface GraphQLResponse {
  data: {
    accountsTimeline: {
      edges: Array<{
        node: {
          app: {
            app: {
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

function isValidApiKey(request: Request): boolean {
  const apiKey = request.headers.get('x-api-key');
  const validApiKey = process.env.API_ROUTE_SECRET;
  
  if (!validApiKey) {
    console.error('API_ROUTE_SECRET is not configured');
    return false;
  }

  return apiKey === validApiKey;
}

async function sendDataToAnalysis(transactions: unknown, address: string) {
  // send the data to run analysis
  // try {
  //   const analysisUrl = 'https://hook.us1.make.com/4ae95x7n2fy88bddfwv4i7vo8ewfdzi9'
  //   const response = await fetch(analysisUrl, {
  //     method: 'POST',
  //     headers: {
  //       'Content-Type': 'application/json',
  //     },
  //     body: JSON.stringify({ 
  //       transactions,
  //       address
  //     }),
  //   });
  //   if (!response.ok) {
  //     console.error('Error sending data to analysis:', response);
  //   }
  // } catch (error) {
  //   console.error('Error sending data to analysis:', error);
  // }
  console.log('sending data to analysis');
  console.log({transactions, address});
}

async function fetchTransactionsFromZapper(address: string) {
  const allTransactions = [];
  let hasNextPage = true;
  let cursor = null;
  const TWO_MONTHS_AGO = new Date();
  TWO_MONTHS_AGO.setMonth(TWO_MONTHS_AGO.getMonth() - 2);
  const PERIOD_START = TWO_MONTHS_AGO.getTime();
  const PERIOD_END = new Date().getTime();

  while (hasNextPage) {
    const query = {
      query: `
        query($addresses: [Address!], $realtimeInterpretation: Boolean, $isSigner: Boolean, $network: Network!, $first: Int, $after: String) {
          accountsTimeline(addresses: $addresses, realtimeInterpretation: $realtimeInterpretation, isSigner: $isSigner, network: $network, first: $first, after: $after) {
            edges {
              node {
                app {
                  app {
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
                  }
                  fromUser {
                    displayName {
                      value
                    }
                  }
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
        first: 50,
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

async function getFromS3Cache(key: string) {
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
  } catch (error) {
    console.log('Error reading from S3:', error);
    return null;
  }
}

async function saveToS3Cache(key: string, data: unknown) {
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

async function getAnalysisFromOpenAI(transactions: unknown, address: string) {
  let threadId: string | undefined;
  try {
    // Create a thread
    const thread = await openai.beta.threads.create();
    threadId = thread.id;

    // Add a message to the thread
    await openai.beta.threads.messages.create(thread.id, {
      role: "user",
      content: JSON.stringify({
        address,
        transactions
      })
    });

    // Run the assistant
    const run = await openai.beta.threads.runs.create(thread.id, {
      assistant_id: ASSISTANT_ID!,
    });

    // Wait for the run to complete
    let runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    while (runStatus.status !== 'completed') {
      if (runStatus.status === 'failed') {
        throw new Error('Assistant run failed');
      }
      await new Promise(resolve => setTimeout(resolve, 1000));
      runStatus = await openai.beta.threads.runs.retrieve(thread.id, run.id);
    }

    // Get the messages
    const messages = await openai.beta.threads.messages.list(thread.id);
    const lastMessage = messages.data[0];

    // Parse the assistant's response
    console.log(JSON.stringify(lastMessage, null, 2));
    const analysis = JSON.parse(lastMessage.content[0].type === 'text' ? lastMessage.content[0].text.value : '');
    return analysis;
  } catch (error) {
    console.error('Error getting analysis from OpenAI:', error);
    throw error;
  } finally {
    // Clean up the thread
    if (threadId) {
      try {
        await openai.beta.threads.del(threadId);
      } catch (cleanupError) {
        console.error('Error cleaning up thread:', cleanupError);
      }
    }
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

    // Check if we have cached analysis in S3
    const analysisCacheKey = `wrapped-2024-analysis/${address.toLowerCase()}.json`;
    const cachedAnalysis = await getFromS3Cache(analysisCacheKey);
    
    if (cachedAnalysis) {
      console.log('Analysis cache hit for address:', address);
      return NextResponse.json({ analysis: cachedAnalysis });
    }

    // Check if we have cached raw transactions
    const rawCacheKey = `wrapped-2024-raw/${address.toLowerCase()}.json`;
    let transactions = await getFromS3Cache(rawCacheKey);
    
    if (!transactions) {
      // Fetch new data from Zapper
      transactions = await fetchTransactionsFromZapper(address);
      // Store the raw transactions in S3
      await saveToS3Cache(rawCacheKey, transactions);
    }

    // Get analysis from OpenAI
    const analysis = await getAnalysisFromOpenAI(transactions, address);

    // Store the analysis in S3
    await saveToS3Cache(analysisCacheKey, analysis);

    return NextResponse.json({ analysis });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 