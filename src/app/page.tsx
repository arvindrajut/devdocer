// Importing into a JavaScript file
import { Button } from '@/components/ui/button';
import { UserButton, auth } from '@clerk/nextjs';
import 'animate.css';
import Link from 'next/link';
import {LogIn} from 'lucide-react'
import FileUpload from '@/components/fileUpload';

export default async function Home() {
  const {userId} = await auth()
  const isAuth = !! userId
  return (
    <div className="w-screen min-h-screen 
    bg-[radial-gradient(ellipse_at_bottom,_var(--tw-gradient-stops))] from-blue-900 via-emerald-500 to-sky-900 animate__fadeIn animate__delay-1s">
      <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2">
        <div className="flex flex-col items-center text-center">
          <div className="flex items-center">
            <h1 className="text-white text-4xl font-extrabold tracking-wide animate__animated animate__fadeIn animate__delay-2s pr-4 ">Welcome to DevDocer</h1>
             <UserButton afterSignOutUrl='/'/>
            
          </div>
          <div className='flex mt-2'>
            {isAuth && <Button>Go to Chats</Button>}
          </div>
          <p className='max-w-xl mt-1 text-lg'>
            Search latest docs with the power of gpt
          </p>

          <div className='w-full mt-4'>
            {isAuth ? (<FileUpload />):(
              <Link href='/sign-in'>
              <Button>
                Login to get started
                <LogIn className='w-4 h-4 ml-2'/>
              </Button>
              </Link>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
