// pages/signup.js
// Signup entry point. Authentication UI lives in pages/login.js.

import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Signup(){
  const router=useRouter();

  useEffect(()=>{
    router.replace('/login?mode=signup');
  },[router]);

  return null;
}
