import { NextResponse } from 'next/server';
import { put, getDownloadUrl } from '@vercel/blob';

const GRAPHQL_ENDPOINT = 'https://public.zapper.xyz/graphql';

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

async function fetchTransactionsFromZapper(address: string) {
  let allTransactions = [];
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

    // Check if we have cached data in blob storage
    const blobKey = `wrapped-2024/${address.toLowerCase()}.json`;
    try {
      const url = await getDownloadUrl(blobKey);
      if (url) {
        const response = await fetch(url);
        if (response.ok) {
          const cachedData = await response.json();
          return NextResponse.json({ transactions: cachedData });
        }
      }
    } catch (error) {
      // If blob doesn't exist or there's an error, continue with fetching new data
      console.log('No cached data found, fetching from API');
    }

    // Fetch new data from Zapper
    const transactions = await fetchTransactionsFromZapper(address);

    // Store the results in blob storage
    await put(
      blobKey,
      JSON.stringify(transactions),
      {
        access: 'public',
        contentType: 'application/json',
        addRandomSuffix: false // Ensure we use exact blobKey
      }
    );

    return NextResponse.json({ transactions });
  } catch (error) {
    console.error('Error processing request:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
} 