import { Pinecone, Vector} from '@pinecone-database/pinecone';
import { downloadFromS3 } from './s3-server';
import {PDFLoader} from 'langchain/document_loaders/fs/pdf';
import {Document, RecursiveCharacterTextSplitter} from '@pinecone-database/doc-splitter'
import { getEmbeddings } from './embeddings';
import md5 from 'md5'
import { convertToAscii } from './utils';
// const client = new QdrantClient({
//     url: 'https://81340e62-8564-4f0d-8fd1-c3cf6a0655fe.us-east-1-0.aws.cloud.qdrant.io:6333',
//     apiKey: 'vesaaToXPxik-jkmkSUSJB2gYHan57I6PFtYN8he0XrLdiQXfR3xcg',
// });
// const result = await client.getCollections();
// console.log('List of collections:', result.collections);

type PDFPage = {
    pageContent: string;
    metadata: {
        loc: {pageNumber:number}
    }
}


export async function loadS3IntoPinecone(fileKey: string){
    try{
    // Obtain the pdf - Download and read from pdf
    console.log('downloading s3 into file system')
    const file_name = await downloadFromS3(fileKey);
    if(!file_name)
    {
        throw new Error("could not download from s3")
    }
    const loader = new PDFLoader(file_name);
    const pages = (await loader.load()) as PDFPage[];

    //Spltting array of pages into smaller docs for vectorization
    const documents = await Promise.all(pages.map(prepareDocument))

    //vecorise and embed individual documents
    // console.log("DOCUMENT array-------->")
    // console.log(documents)
    const vectors = await Promise.all(documents.flat().map(embedDocument))
    console.log("Vector definition")
    console.log(vectors)
    console.log(typeof vectors)
    //Restructuring vectors to remove metadata
    type vectorArray = [
        id: string,
        values: Vector[]
    ]
   // const vectors: vectorArray = vectorOutput.map(({ metadata, ...rest }) => rest);

    //Upload to pinecone
    const pinecone = new Pinecone();
    //Index refers to table in pinecone
    //const indexes = await pinecone.listIndexes()
   
    const pineconeIndex =  pinecone.index('devdocer');
   
   const namespace = convertToAscii(fileKey)

console.log("Namespace: ", namespace);


// const index = pinecone.index('example-index');

// const records = [
//   { id: '1', values: [0.1, 0.2, 0.3] },
//   { id: '2', values: [0.4, 0.5, 0.6] }
// ]
const vectorsObjectArray = vectors.map(({ metadata, ...rest }) => rest);

// Upsert a record in the default namespace
// await pineconeIndex.upsert(records);
await pineconeIndex.upsert(vectorsObjectArray);
// await ns.upsert(vectorsObjectArray);
  
//   const stats = await pineconeIndex.describeIndexStats();
//   console.log("<----------------------STATS--------------------->")
//   console.log(stats)
  
  //await PineConeUtils.Chunkedupsert(pineconeIndex,vectors, namespace, 10)
    return documents[0]
}
catch(error){
    console.error(error)
}
}

//embedding 

//Takes in document and returns promise of a vector
async function embedDocument(doc: Document) {
    try{
        console.log("PAGE CONTENT of the docc")
        console.log(doc.pageContent)
        const embeddings = await getEmbeddings(doc.pageContent)
        console.log('EMBEDDINGS!!!')
        console.log(embeddings)
        const hash = md5(doc.pageContent)
        return {
            id: hash,
            values: embeddings,
            metadata: {
                text: doc.metadata.text,
                pageNumber: doc.metadata.pageNumber
            }
        } as Vector

    } catch(error){
        console.log('error embedding document', error)
        throw error
    }
}

export const truncateStringByBytes = (str: string, bytes: number) => {
    const enc = new TextEncoder()
    return new TextDecoder('utf-8').decode(enc.encode(str).slice(0,bytes))
}

async function prepareDocument(page: PDFPage){

    let {pageContent, metadata} = page

    pageContent = pageContent.replace(/\n/g,'')

    const splitter = new RecursiveCharacterTextSplitter()
    const docs = await splitter.splitDocuments([
        new Document({
            pageContent,
            metadata: {
                pageNumber: metadata.loc.pageNumber,
                text: truncateStringByBytes(pageContent, 36000)
            }
        })
    ])
    return docs
}