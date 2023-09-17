import { S3Client, PutObjectCommand } from "@aws-sdk/client-s3";

export async function uploadToS3(file: File) {
  try {
    const s3 = new S3Client({
      credentials: {
        accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID!,
        secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY!,
      },
      region: 'us-east-2'
    });

    const fileKey = 'uploads/' + Date.now().toString() + file.name.replace(' ','-');

    const params = {
      Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
      Key: fileKey,
      Body: file
    };

    const putObjectCommand = new PutObjectCommand(params);

    const upload = s3.send(putObjectCommand);

    // Monitor upload progress (if desired)
    // For this, you might want to use a separate upload progress monitoring solution
    // The old SDK's 'httpUploadProgress' is not directly available in the new SDK

    const data = await upload;

    console.log("Uploaded to S3!", fileKey);

    return Promise.resolve({
      file_key: fileKey,
      file_name: file.name,
    });

  } catch (error) {
    console.error("Error uploading to S3:", error);
    // Handle error appropriately here
  }
}

export function getS3Url(file_key: string) {
  const url = `https://${process.env.NEXT_PUBLIC_S3_BUCKET_NAME}.s3.us-east-2.amazonaws.com/${file_key}`;
  return url;
}
