export interface BaseResponse {
  status: 'success' | 'error';
  jobId: string;
  error?: string;
}

export interface JobStatus {
  jobId: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  currentStep: 'fetching' | 'analyzing' | 'consolidating';
  progress?: {
    current: number;
    total: number;
  };
  error?: string;
  result?: any;
}

export interface S3Paths {
  RAW_TRANSACTIONS: 'wrapped-2024-raw';
  ANALYSIS_CHUNKS: 'wrapped-2024-analysis-chunks';
  FINAL_ANALYSIS: 'wrapped-2024-analysis';
}

export const S3_PATHS: S3Paths = {
  RAW_TRANSACTIONS: 'wrapped-2024-raw',
  ANALYSIS_CHUNKS: 'wrapped-2024-analysis-chunks',
  FINAL_ANALYSIS: 'wrapped-2024-analysis'
}; 