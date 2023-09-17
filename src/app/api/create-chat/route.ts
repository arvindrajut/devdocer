// /api/create-chat

import { db } from "@/lib/db";
import { chats } from "@/lib/db/schema";
import { loadS3IntoPinecone } from "@/lib/pinecone";
import { getS3Url } from "@/lib/s3";
import { auth } from "@clerk/nextjs";
import { NextResponse } from "next/server"

export async function POST(req: Request, res: Response){
    const {userId} = await auth();
    if(!userId){
        return NextResponse.json({error: "User not authorised!!!"}, {status: 401})
    }
    try{
        const body = await req.json();
        console.log("CHECKING BODY")
        console.log(body)
        const {file_key, file_name} = body
        console.log(file_key, file_name);
        await loadS3IntoPinecone(file_key);
        const chat_id = await db.insert(chats).values({
            fileKey: file_key,
            pdfName: file_name,
            pdfUrl: getS3Url(file_key),
            userId,
        }).returning({
            insertedId: chats.id,
        });

        return NextResponse.json({
            chat_id: chat_id[0].insertedId
        },
        {
            status: 200
        })

    } catch(error){
        console.error(error)
        return NextResponse.json({error: "Failing to create chat!"}, {status: 500})
    }

}
// export async function POST(req: Request, res: Response) {
//     try {
//         console.log("POST function called");

//         console.log("Parsing request body");
//         console.log(req.body); // Raw body
//         const body = await req.json();
//         console.log("Parsed request body", body);

//         const { file_key, file_name } = body;
//         console.log(`Extracted file_key: ${file_key}, file_name: ${file_name}`);

//         console.log("Calling loadS3IntoPinecone");
//         const pages = await loadS3IntoPinecone(file_key);
//         console.log("loadS3IntoPinecone returned", pages);

//         console.log("Sending response", pages);
//         return NextResponse.json({ pages });
//     } catch (error) {
//         console.log("Error caught", error.resp);
//         return NextResponse.json({ error: "internal server error" }, { status: 500 });
//     }
// }
