import { S3Client, GetObjectCommand } from "@aws-sdk/client-s3";
import fs from 'fs'
import { Readable } from 'stream';
import { pipeline } from 'stream/promises';

export async function downloadFromS3(file_key: string) {
    try {
        const s3Client = new S3Client({
            region: "us-east-2",
            credentials: {
                accessKeyId: process.env.NEXT_PUBLIC_S3_ACCESS_KEY_ID!,
                secretAccessKey: process.env.NEXT_PUBLIC_S3_SECRET_ACCESS_KEY!,
            }
        });

        const params = {
            Bucket: process.env.NEXT_PUBLIC_S3_BUCKET_NAME!,
            Key: file_key,
        };

        const command = new GetObjectCommand(params);

        const response = await s3Client.send(command);
        const file_name = `/tmp/pdf-${Date.now()}.pdf`;
        
        if (response.Body) {
            await pipeline(response.Body as Readable, fs.createWriteStream(file_name));
            console.log("THIS SHITT")
        } else {
            throw new Error("No body in response");
        }

        return file_name;

    } catch (error) {
        console.error("An error occurred:", error);
        return null;
    }
}
