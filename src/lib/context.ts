import { Pinecone} from "@pinecone-database/pinecone";
import { toast } from "react-hot-toast";
import { getEmbeddings } from "./embeddings"

export async function getSimilarEmbeddings(embeddings: number[]){
   const pinecone = new Pinecone()
    const index = pinecone.index('devdocer')
    if(!index){
       console.log("Not receiving index!")
    }
    console.log("INDEX")
    console.log(index)
    try{
        const queryResult = await index.query({topK: 5, vector: embeddings, includeMetadata:true})
        return queryResult.matches || []

    } catch(error){
        console.log("Error: Embeddings not found!", error)
        throw error
    }
}
export async function getContext(query: string){
    try{
    const queryEmbeddings = await getEmbeddings(query)
    console.log("QUERY EMBEDDINGS!!!")
    console.log(queryEmbeddings)
    const matches = await getSimilarEmbeddings(queryEmbeddings!)
    console.log("getting matcehs?????")
    console.log(matches)
    const qualifyingDocs = matches.filter((match) => match.score && match.score > 0.7);
    console.log(qualifyingDocs)
    console.log(qualifyingDocs)
    type Metadata = {
        text: string,
        pageNumber: number
    }
    let docs = qualifyingDocs.map(match => (match.metadata as Metadata).text)
    console.log("CLEANING UP OUR CONTEXT")
    console.log(docs.join('\n').substring(0,3000))
    return docs.join('\n').substring(0,3000);
}catch(error){
    toast.error("Error getting context from pdf")
}


}