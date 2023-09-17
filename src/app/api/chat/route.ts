import {Configuration, OpenAIApi} from 'openai-edge'
import {Message, OpenAIStream, StreamingTextResponse} from 'ai'
import { getContext } from '@/lib/context'
import { db } from '@/lib/db'
import { chats, messages as _messages } from '@/lib/db/schema'
import {NextResponse} from 'next/server'
import { eq } from 'drizzle-orm'
import { Content } from 'next/font/google'
export const runtime = 'edge'


const config = new Configuration({
    apiKey: process.env.OPENAI_API_KEY,
})
const openai = new OpenAIApi(config)

export async function POST(req: Request){
        //streaming true to generate tokens and start streaming them here
        const { messages, chatId } = await req.json();
    const _chats = await db.select().from(chats).where(eq(chats.id, chatId));
    if (_chats.length != 1) {
      return NextResponse.json({ error: "chat not found" }, { status: 404 });
    }
    // const fileKey = _chats[0].fileKey;
        const lastMessage = messages[messages.length - 1];
        console.log(lastMessage)
        // const context = await getContext(lastMessage.content)
        // console.log(context)
        
       
        const prompt = {
            role: "system",
            content: `AI assistant is a brand new, powerful, human-like artificial intelligence.
            The traits of AI include expert knowledge, helpfulness, cleverness, and articulateness.
            AI is a well-behaved and well-mannered individual.
            AI is always friendly, kind, and inspiring, and he is eager to provide vivid and thoughtful responses to the user.
            AI has the sum of all knowledge in their brain, and is able to accurately answer nearly any question about any topic in conversation.
            AI assistant is a big fan of Pinecone and Vercel.
            START CONTEXT BLOCK
            
            END OF CONTEXT BLOCK
            AI assistant will take into account any CONTEXT BLOCK that is provided in a conversation.
            If the context does not provide the answer to question, the AI assistant will say, "I'm sorry, but I don't know the answer to that question".
            AI assistant will not apologize for previous responses, but instead will indicated new information was gained.
            AI assistant will not invent anything that is not drawn directly from the context.
            `,
          };
        const response = await openai.createChatCompletion({
            model: "gpt-3.5-turbo",
            messages: [
                prompt, ...messages.filter((message: Message) => message.role === "user")
                
            ],
            stream: true
        })
        const stream = OpenAIStream(response, {
            onStart: async() => {
                //saving user message into db
                await db.insert(_messages).values({
                    chatId,
                    content: lastMessage.content,
                    role: 'user'
                })
            },
            onCompletion: async(completion) => {
                await db.insert(_messages).values({
                    chatId,
                    content: completion,
                    role: "system"
                })
                //saving ai message into db

            }
        })
        return new StreamingTextResponse(stream)
  
}

