'use client';
import React from 'react'
import { useDropzone } from 'react-dropzone';
import { Inbox, Loader2 } from 'lucide-react';
import { uploadToS3 } from '@/lib/s3';
import { useMutation } from '@tanstack/react-query';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import {useRouter} from 'next/navigation'; 

//hjerererererre
const FileUpload = () => {
    const router = useRouter()
    const [uploading, setUploading] = React.useState(false)
    const {mutate, isLoading} = useMutation({
        mutationFn: async ({file_key, file_name}: {file_key: string, file_name: string}) => {
            const response = await axios.post("/api/create-chat", {file_key, file_name});
            console.log("Response data")
            console.log(response.data)
            return response.data
            
        }
})
    const {getRootProps, getInputProps} = useDropzone({
        accept:{"application/pdf": [".pdf"]},
        maxFiles:1,
        onDrop: async (acceptedFiles) => {
            console.log(acceptedFiles)
            const file = acceptedFiles[0]
            if(file.size > 10 * 1024 * 1024){
                //Bigger than 10 mb
                toast.error("File too large!");
                return
            }
            try{
                setUploading(true)
                const data = await uploadToS3(file)
                if(!data?.file_key || !data.file_name){
                    toast.error("Something went wrong!")
                    return
                }
                mutate(data, {
                    onSuccess: ({chat_id}) => {
                        toast.success("Chat created!");
                        router.push(`/chat/${chat_id}`)
                        console.log(data);
                        // toast.success(data.message)
                    },
                    onError: (err) => {
                        toast.error("Error creating chat!")
                        console.error(err)
                    }
                })
                console.log("data---->", data)

            }catch(error){
                console.log(error);
            } finally {
                setUploading(false)
            }
           
        }
    })
  return (
    <div className='p-2 bg-white rounded-xl'>
        <div {...getRootProps({
            className: 'border-dashed border-2 rounded-xl cursor-pointer bg-gray-50  py-8 flex justify-center items-center flex-col'
        })}>
            <input {...getInputProps()}/>
            {(uploading || isLoading) ? (
                <>
                <Loader2 className='h-10 w-10 text-blue-500 animate-spin'/>
                <p className='mt-2 text-sm text-slate-400'>
                    Feeding to gpt...
                </p>
                </>
            ): (
        <>
        <Inbox className="w-10 h-10 text-gray-300 " />
        <p className='mt-2 text-sm text-slate-400'>DROP PDF HERE!</p>
        </>
            ) }
        
        </div>
    </div>
  )
}

export default FileUpload

//vector return object

// {
//     embedding: [1,3,1],
//     metadata: {textContent: "The most simialar string as per cosine similarity based on our search"}
// }

