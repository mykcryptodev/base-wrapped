export interface Transaction {
  hash: string;
  timestamp: number;
  description: string;
  category: string;
  tags: string[];
  fromUser?: string;
  toUser?: string;
  value?: string;
  [key: string]: unknown;
}

export interface ZapperTransaction {
  node: {
    key: string;
    timestamp: number;
    transaction: {
      toUser: { displayName: { value: string } };
      fromUser: { displayName: { value: string } };
      value: string;
      hash?: string;
    };
    app: {
      tags: string[];
      app: {
        imgUrl: string;
        category: { name: string; description: string };
      };
    };
    interpretation: { processedDescription: string };
    interpreter: { category: string };
  };
}

export interface GraphQLResponse {
  data: {
    accountsTimeline: {
      edges: Array<{
        node: ZapperTransaction['node'];
      }>;
      pageInfo: {
        startCursor: string;
        hasNextPage: boolean;
        endCursor: string;
      };
    };
  };
} 