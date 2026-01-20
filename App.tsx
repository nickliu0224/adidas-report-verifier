import React, { useState, useEffect } from 'react';
import { runReconciliation } from './services/bigQueryService';
import { PlatformResult, Platform, ComparisonRow } from './types';
import { auth, googleProvider } from './services/firebase';
import { signInWithPopup, signOut, GoogleAuthProvider, User } from 'firebase/auth';
import { saveReport, getHistory, deleteReport, updateReportNote, SavedReport } from './services/dbService';

// --- UI Components ---
const Card = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ status }: { status: string }) => {
  const styles: any = {
    MATCH: 'bg-green-100 text-green-800',
    MISSING_LEFT: 'bg-red-100 text-red-800',
    MISSING_RIGHT: 'bg-orange-100 text-orange-800',
    DIFF: 'bg-yellow-100 text-yellow-800',
    OK: 'bg-green-100 text-green-800',
    WARNING: 'bg-yellow-100 text-yellow-800',
    ERROR: 'bg-red-100 text-red-800',
    OPEN: 'bg-blue-100 text-blue-800',
    REVIEWED: 'bg-purple-100 text-purple-800',
    RESOLVED: 'bg-gray-100 text-gray-800'
  };
  const label: any = {
    MATCH: '一致',
    MISSING_LEFT: '僅報表',
    MISSING_RIGHT: '僅 EOD',
    DIFF: '金額差異',
    OK: 'Pass',
    WARNING: 'Check',
    ERROR: 'Fail'
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{label[status] || status}</span>;
};

const DetailTable = ({ details, type, platform }: { details: ComparisonRow[]; type: 'Shipment' | 'Return'; platform: Platform }) => {
  if (details.length === 0) return <div className="p-4 text-gray-500 text-sm italic">✅ 完全一致 (無異常)</div>;
  const isBrandSite = platform === Platform.BRAND_SITE;
  let idLabel = '訂單編號';
  if (isBrandSite) idLabel = type === 'Shipment' ? 'TG 單號' : 'TS 單號';

  return (
    <div className="overflow-x-auto max-h-[500px]">
      <table className="min-w-full divide-y divide-gray-200 relative">
        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{idLabel}</th>
            {isBrandSite && type === 'Shipment' && <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">對應 TS</th>}
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">EOD</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">報表</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">差異</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {details.map((row) => (
            <tr key={row.key} className="hover:bg-gray-50 font-mono text-sm">
              <td className="px-6 py-4 whitespace-nowrap text-gray-900">{row.key}</td>
              {isBrandSite && type === 'Shipment' && (
                <td className="px-6 py-4 text-xs text-gray-500 break-all font-sans">
                  {row.tsIds || '-'}
                </td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500">{row.leftValue?.toLocaleString()}</td>
              <td className="px-6 py-4 whitespace-nowrap text-right text-gray-500">{row.rightValue?.toLocaleString()}</td>
              <td className={`px-6 py-4 whitespace-nowrap text-right font-bold ${row.diff !== 0 ? 'text-red-600' : 'text-gray-400'}`}>{row.diff}</td>
              <td className="px-6 py-4 whitespace-nowrap"><Badge status={row.status} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [bqToken, setBqToken] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ platform: string, step: number, total: number } | null>(null);
  const [results, setResults] = useState<PlatformResult[] | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>(Platform.BRAND_SITE);
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
     const unsubscribe = auth.onAuthStateChanged((u) => {
         if (u && u.email) {
           const email = u.email;
           if (!email.endsWith('@91app.com') && !email.endsWith('@nine-yi.com')) {
             signOut(auth);
             setErrorMsg("抱歉，你的帳號不屬於 @91app.com 或 @nine-yi.com 網域，無法登入啦");
             return;
           }
         }
         setUser(u);
         if (!u) setBqToken(null);
     });
     return () => unsubscribe();
  }, []);

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

      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) setBqToken(credential.accessToken);
    } catch (e: any) { alert(`Login error: ${e.message}`); }
  };

  const handleRunCheck = async () => {
    if (!bqToken) return alert("Session expired. Please Re-login.");
    setLoading(true);
    setResults(null);
    setErrorMsg(null);
    try {
      const data = await runReconciliation(targetDate, bqToken, (platform, step, total) => {
          setProgress({ platform, step, total });
      });
      setResults(data);
    } catch (e: any) { 
      setErrorMsg(e.message);
      alert(e.message); 
    }
    finally { 
        setLoading(false); 
        setProgress(null);
    }
  };

  const activeResult = results?.find(r => r.platform === activePlatform);

  if (!user) {
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

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* Loading Overlay */}
      {loading && (
          <div className="fixed inset-0 z-[100] bg-black/60 backdrop-blur-sm flex items-center justify-center text-white px-4">
              <div className="bg-zinc-900 p-8 rounded-2xl shadow-2xl max-w-xs w-full text-center border border-zinc-700 animate-in zoom-in-95 duration-200">
                  <div className="relative w-16 h-16 mx-auto mb-6">
                      <div className="absolute inset-0 border-4 border-zinc-800 rounded-full"></div>
                      <div className="absolute inset-0 border-4 border-white rounded-full border-t-transparent animate-spin"></div>
                  </div>
                  <h3 className="text-lg font-bold mb-1">正在比對數據...</h3>
                  {progress && (
                      <div className="space-y-4">
                          <p className="text-zinc-400 text-sm">Step {progress.step} of {progress.total}: <span className="text-white font-medium">{progress.platform}</span></p>
                          <div className="w-full bg-zinc-800 h-1.5 rounded-full overflow-hidden">
                              <div 
                                  className="bg-white h-full transition-all duration-300 ease-out" 
                                  style={{ width: `${(progress.step / progress.total) * 100}%` }}
                              ></div>
                          </div>
                      </div>
                  )}
                  <p className="mt-6 text-[10px] text-zinc-500 uppercase tracking-widest font-mono">Fetching BigQuery raw logs</p>
              </div>
          </div>
      )}

      <header className="bg-black text-white px-6 py-4 flex items-center shadow-lg sticky top-0 z-50">
        {/* Left: Brand & Title */}
        <div className="w-1/4 flex items-center gap-3">
          <span className="bg-white text-black p-1 rounded font-bold text-lg">ADS</span>
          <span className="font-bold text-sm tracking-wide whitespace-nowrap">Report Verifier</span>
        </div>

        {/* Center: Controls */}
        <div className="w-2/4 flex justify-center items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-gray-300">資料日期</span>
            <input 
              type="date" 
              value={targetDate} 
              onChange={e => setTargetDate(e.target.value)} 
              className="bg-gray-800 border-none rounded px-3 py-1.5 text-sm outline-none focus:ring-1 focus:ring-white min-w-[150px]"
            />
          </div>
          <button 
            onClick={handleRunCheck} 
            disabled={loading} 
            className="bg-white text-black px-6 py-1.5 rounded text-sm font-bold hover:bg-gray-200 disabled:opacity-50 transition-colors"
          >
            {loading ? 'Running...' : 'Run'}
          </button>
        </div>

        {/* Right: Account Info */}
        <div className="w-1/4 flex flex-col items-end gap-0.5">
          <div className="text-xs text-gray-400 font-medium truncate max-w-full">
            {user.email}
          </div>
          <button 
            onClick={() => signOut(auth)} 
            className="text-xs text-gray-500 hover:text-white underline transition-colors"
          >
            Logout
          </button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 mt-4 flex-grow w-full">
        {errorMsg && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <span className="font-bold">{errorMsg}</span>
          </div>
        )}

        {results ? (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2">
              {results.map(r => (
                <button key={r.platform} onClick={() => setActivePlatform(r.platform)} className={`px-4 py-2 rounded-full text-xs font-bold border transition-all whitespace-nowrap ${activePlatform === r.platform ? 'bg-black text-white border-black shadow-md' : 'bg-white text-gray-500 border-gray-200'}`}>
                  {r.platform}
                </button>
              ))}
            </div>

            {activeResult && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Shipment Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-blue-500 bg-blue-50/20">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700 text-lg">出貨比對 (Shipment)</h3>
                        <Badge status={activeResult.shipment.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        <div className="bg-blue-50 p-3 rounded-lg text-center border border-blue-100">
                            <div className="text-xs text-blue-600 font-bold uppercase mb-1">EOD</div>
                            <div className="text-2xl font-bold text-blue-900">{activeResult.shipment.sourceCounts?.eod} <span className="text-sm text-blue-600/70 font-normal">筆</span></div>
                            <div className="text-sm font-semibold text-blue-800 mt-1 pt-1 border-t border-blue-200">
                                ${activeResult.shipment.sourceAmounts?.eod?.toLocaleString()}
                            </div>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-lg text-center border border-indigo-100">
                            <div className="text-xs text-indigo-600 font-bold uppercase mb-1">報表</div>
                            <div className="text-2xl font-bold text-indigo-900">{activeResult.shipment.sourceCounts?.report} <span className="text-sm text-indigo-600/70 font-normal">筆</span></div>
                            <div className="text-sm font-semibold text-indigo-800 mt-1 pt-1 border-t border-indigo-200">
                                ${activeResult.shipment.sourceAmounts?.report?.toLocaleString()}
                            </div>
                        </div>
                    </div>
                  </Card>
                  <Card><DetailTable details={activeResult.shipment.details} type="Shipment" platform={activePlatform} /></Card>
                </div>

                {/* Return Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-red-500 bg-red-50/20">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700 text-lg">退貨比對 (Return)</h3>
                        <Badge status={activeResult.return.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        <div className="bg-red-50 p-3 rounded-lg text-center border border-red-100">
                            <div className="text-xs text-red-600 font-bold uppercase mb-1">EOD</div>
                            <div className="text-2xl font-bold text-red-900">{activeResult.return.sourceCounts?.eod} <span className="text-sm text-red-600/70 font-normal">筆</span></div>
                            <div className="text-sm font-semibold text-red-800 mt-1 pt-1 border-t border-red-200">
                                ${activeResult.return.sourceAmounts?.eod?.toLocaleString()}
                            </div>
                        </div>
                        <div className="bg-rose-50 p-3 rounded-lg text-center border border-rose-100">
                            <div className="text-xs text-rose-600 font-bold uppercase mb-1">報表</div>
                            <div className="text-2xl font-bold text-rose-900">{activeResult.return.sourceCounts?.report} <span className="text-sm text-rose-600/70 font-normal">筆</span></div>
                            <div className="text-sm font-semibold text-rose-800 mt-1 pt-1 border-t border-rose-200">
                                ${activeResult.return.sourceAmounts?.report?.toLocaleString()}
                            </div>
                        </div>
                    </div>
                  </Card>
                  <Card><DetailTable details={activeResult.return.details} type="Return" platform={activePlatform} /></Card>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="text-center py-20 text-gray-400">
            <svg className="w-16 h-16 mx-auto mb-4 opacity-20" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            選擇日期並點擊 Run 開始比對
          </div>
        )}
      </main>

      <footer className="w-full py-8 text-center text-gray-400 text-sm border-t border-gray-100 mt-auto bg-white">
        Made by IS PM Nick
      </footer>
    </div>
  );
}