import { GraphQLResponse, Transaction, ZapperTransaction } from '../types/transactions';

// Helper function to normalize transactions
function normalizeTransaction(zapperTx: ZapperTransaction): Transaction {
  return {
    hash: zapperTx.node.transaction.hash || zapperTx.node.key,
    timestamp: zapperTx.node.timestamp,
    description: zapperTx.node.interpretation.processedDescription || '',
    category: zapperTx.node.interpreter.category || '',
    tags: zapperTx.node.app?.tags || [],
    fromUser: zapperTx.node.transaction.fromUser?.displayName?.value || '',
    toUser: zapperTx.node.transaction.toUser?.displayName?.value || '',
    value: zapperTx.node.transaction.value || '0',
    raw: zapperTx
  };
}

export async function fetchTransactionsFromZapper(address: string) {
  console.log(`Fetching transactions from Zapper for ${address}`);
  const GRAPHQL_ENDPOINT = 'https://public.zapper.xyz/graphql';

  const allTransactions = [];
  let hasNextPage = true;
  let cursor = null;
  const PERIOD_START = new Date('2024-01-01').getTime();
  const now = new Date().getTime();
  // if now is before 2025-01-01, set PERIOD_END to 2025-01-01
  const PERIOD_END = now < new Date('2025-01-01').getTime() 
    ? new Date('2025-01-01').getTime()
    : now;

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
                  }
                  fromUser {
                    displayName {
                      value
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
        realtimeInterpretation: true,
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

      const result = await response.json() as GraphQLResponse;
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

      // Update pagination using pageInfo
      hasNextPage = pageInfo.hasNextPage;
      if (hasNextPage) {
        cursor = pageInfo.endCursor;
      }
    } catch (error) {
      console.error('Error fetching transactions from Zapper:', error);
      throw error;
    }
  }

  return allTransactions.map(tx => normalizeTransaction({ node: tx.node }));
} 