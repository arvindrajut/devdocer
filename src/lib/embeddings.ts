import { OpenAI } from 'openai';

const openai = new OpenAI(({
  apiKey: process.env.OPENAI_API_KEY,
}));

export async function getEmbeddings(text: string) {
  try {
   
    const response = await openai.embeddings.create({
      model: "text-embedding-ada-002",
      input: [text.replace(/\n/g, " ")]  
    });
    if (!response) {
      console.error(`API call failed `);
      return;
    }

    if (response && response && response.data.length > 0) {
      return response.data[0].embedding as number[];
    } else {
      console.error('Unexpected API response format', response);
      return;
    }
  } catch (error) {
    console.error('Error calling OpenAI embeddings API', error);
    throw error;
  }
}



