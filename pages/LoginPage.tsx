
import React, { useState } from 'react';
import { signInWithPopup, signOut, GoogleAuthProvider } from 'firebase/auth';
import { auth, googleProvider } from '../services/firebase';
import { useNavigate } from 'react-router-dom';

export default function LoginPage() {
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const navigate = useNavigate();

  const handleLogin = async () => {
    setErrorMsg(null);
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const email = result.user.email;
      
      if (!email?.endsWith('@91app.com') && !email?.endsWith('@nine-yi.com')) {
        await signOut(auth);
        setErrorMsg("抱歉，你的帳號不屬於 @91app.com 或 @nine-yi.com 網域，無法登入啦");
        return;
      }

      // Important: We need to temporarily store the token to pass it to the Dashboard.
      // Since we are decoupling, we'll store it in sessionStorage for this session.
      // This allows the App component (or Dashboard) to retrieve it.
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
          sessionStorage.setItem('bq_access_token', credential.accessToken);
      }

      navigate('/');
    } catch (e: any) { 
        setErrorMsg(e.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="bg-white p-10 rounded-2xl shadow-xl max-w-sm w-full text-center border border-gray-100">
         <div className="w-20 h-20 bg-[#007cc2] rounded-2xl flex items-center justify-center mx-auto mb-6 shadow-lg overflow-hidden">
            <img 
              src="https://upload.wikimedia.org/wikipedia/commons/thumb/2/20/Adidas_Logo.svg/1024px-Adidas_Logo.svg.png" 
              className="w-14 h-14 object-contain brightness-0 invert" 
              alt="Adidas Logo" 
            />
         </div>
         <h1 className="text-2xl font-bold mb-2">ADS Report Verifier</h1>
         <p className="text-gray-400 mb-4 text-sm">登入前請確認你有 BQ 權限</p>
         
         {errorMsg && (
           <div className="mb-6 p-3 bg-red-50 border border-red-100 text-red-600 text-xs rounded-lg font-medium">
             {errorMsg}
           </div>
         )}

         <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 py-3 rounded-lg hover:bg-gray-50 font-medium transition-all">
           <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt=""/>
           Login with Google
         </button>
      </div>
      <footer className="mt-8 text-gray-400 text-xs text-center">
        <p>Made by IS PM Nick</p>
        <p className="mt-1 opacity-50">僅限 @91app.com / @nine-yi.com 員工登入</p>
      </footer>
    </div>
  );
}
