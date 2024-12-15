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


export async function fetchTransactionsFromZapper(address: string) {
  console.log(`Fetching transactions from Zapper for ${address}`);
  const GRAPHQL_ENDPOINT = 'https://public.zapper.xyz/graphql';

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
        first: 75,
        after: cursor
      }
    };

    try {
      const response = await fetch(GRAPHQL_ENDPOINT, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Basic ${Buffer.from(process.env.ZAPPER_API_KEY!).toString('base64')}`,
        },
        body: JSON.stringify(query),
      });
  
      if (!response.ok) {
        console.error(`Zapper request failed: ${response.statusText}`);
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
    } catch (error) {
      console.error('Error fetching transactions from Zapper:', error);
      throw error;
    }
  }

  return allTransactions;
}
