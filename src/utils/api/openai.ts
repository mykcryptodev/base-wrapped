import OpenAI from 'openai';
// Initialize OpenAI client
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

// Assistant ID for Base Wrapped
const ASSISTANT_ID = process.env.OPENAI_ASSISTANT_ID;

export const activeAnalyses = new Set<string>();
export const analysisProgress = new Map<string, {
  currentChunk: number;
  totalChunks: number;
}>();

// New function to chunk transactions
function chunkTransactions(transactions: unknown[], chunkSize = 200) {
  const chunks = [];
  for (let i = 0; i < transactions.length; i += chunkSize) {
    chunks.push(transactions.slice(i, i + chunkSize));
  }
  return chunks;
}

// Modified function to analyze chunks
async function analyzeTransactionChunk(chunk: unknown, index: number, totalChunks: number, retryCount = 0) {
  const MAX_RETRIES = 5;
  const delay = (attempt: number) => Math.min(1000 * Math.pow(2, attempt), 30000);
  let thread;

  try {
    console.log(`
    ====ANALYZING CHUNK ${index} of ${totalChunks} (Attempt ${retryCount + 1}/${MAX_RETRIES})====
    `);
    
    thread = await openai.beta.threads.create();
    
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
  } catch (error) {
    if (retryCount < MAX_RETRIES - 1) {
      console.log(`Chunk ${index} failed, retrying in ${delay(retryCount)}ms...`);
      await new Promise(resolve => setTimeout(resolve, delay(retryCount)));
      return analyzeTransactionChunk(chunk, index, totalChunks, retryCount + 1);
    }
    throw error;
  } finally {
    // Clean up the thread
    if (thread) {
      try {
        await openai.beta.threads.del(thread.id);
      } catch (error) {
        console.error('Error cleaning up chunk thread:', error);
      }
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
    const chunks = chunkTransactions(transactions as unknown[]);
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
    }, {} as unknown);

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
