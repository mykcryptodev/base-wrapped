import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";

const BUCKET_NAME = process.env.S3_BUCKET_NAME!;
// Initialize S3 client
const s3Client = new S3Client({
  region: process.env.AWS_REGION!,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

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
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
  } catch (e) {
    // ts ignore that we arent using the error
    return null;
  }
}


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