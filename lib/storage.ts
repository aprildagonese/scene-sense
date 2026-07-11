import { S3Client, PutObjectCommand, GetObjectCommand, HeadObjectCommand } from "@aws-sdk/client-s3";
import type { Readable } from "stream";

const region = process.env.SPACES_REGION ?? "nyc3";
const endpoint = process.env.SPACES_ENDPOINT ?? `https://${region}.digitaloceanspaces.com`;
const bucket = process.env.SPACES_BUCKET ?? "scene-sense-media";

let cached: S3Client | null = null;

function client(): S3Client {
  if (cached) return cached;
  const accessKeyId = process.env.SPACES_ACCESS_KEY;
  const secretAccessKey = process.env.SPACES_SECRET_KEY;
  if (!accessKeyId || !secretAccessKey) {
    throw new Error("Spaces credentials missing — set SPACES_ACCESS_KEY and SPACES_SECRET_KEY");
  }
  cached = new S3Client({ endpoint, region, forcePathStyle: false, credentials: { accessKeyId, secretAccessKey } });
  return cached;
}

export async function uploadObject(key: string, body: Buffer, contentType: string): Promise<void> {
  await client().send(new PutObjectCommand({ Bucket: bucket, Key: key, Body: body, ContentType: contentType }));
}

export interface RangeResult {
  body: Readable;
  contentLength: number;
  contentRange?: string;
  status: 200 | 206;
}

// Streams an object, honoring an optional HTTP Range header for video seeking.
export async function getObjectRange(key: string, range: string | null): Promise<RangeResult> {
  const res = await client().send(new GetObjectCommand({ Bucket: bucket, Key: key, Range: range ?? undefined }));
  return {
    body: res.Body as Readable,
    contentLength: res.ContentLength ?? 0,
    contentRange: res.ContentRange,
    status: range ? 206 : 200,
  };
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await client().send(new HeadObjectCommand({ Bucket: bucket, Key: key }));
    return true;
  } catch {
    return false;
  }
}
