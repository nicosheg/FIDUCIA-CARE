// pages/signup.js
import { useEffect } from 'react';
import { useRouter } from 'next/router';

export default function Signup() {
    const router = useRouter();
    useEffect(() => {
        router.replace('/login?mode=signup');
    }, []);
    return null;
}
