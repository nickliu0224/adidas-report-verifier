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
    <div className="overflow-x-auto max-h-96">
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
              {isBrandSite && type === 'Shipment' && <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-400 max-w-[120px] truncate" title={row.tsIds}>{row.tsIds || '-'}</td>}
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

  useEffect(() => {
     const unsubscribe = auth.onAuthStateChanged((u) => {
         setUser(u);
         if (!u) setBqToken(null);
     });
     return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) setBqToken(credential.accessToken);
    } catch (e: any) { alert(`Login error: ${e.message}`); }
  };

  const handleRunCheck = async () => {
    if (!bqToken) return alert("Session expired. Please Re-login.");
    setLoading(true);
    setResults(null);
    try {
      const data = await runReconciliation(targetDate, bqToken, (platform, step, total) => {
          setProgress({ platform, step, total });
      });
      setResults(data);
    } catch (e: any) { alert(e.message); }
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
           <div className="w-16 h-16 bg-black text-white rounded-full flex items-center justify-center mx-auto mb-6">
              <svg className="w-10 h-10 fill-current" viewBox="0 0 50 32"><path d="M36.1 4.2L25.3 22.9 22.2 21.1 34.6 0l15.3 26.5h-6.2L36.1 4.2zM21.7 8.3L13.4 22.8 10.3 21 20.2 4.1 33 26.5h-6.2L21.7 8.3zM7.2 12.5L1.5 22.8H8l2.5-4.4L15.3 26.5H9.2l-2-3.4-2.1 3.4H-.9l8.1-14z"/></svg>
           </div>
           <h1 className="text-2xl font-bold mb-2">Adidas Verifier</h1>
           <p className="text-gray-400 mb-8 text-sm">Accessing BigQuery tw dataset...</p>
           <button onClick={handleLogin} className="w-full flex items-center justify-center gap-3 bg-white border border-gray-300 py-3 rounded-lg hover:bg-gray-50 font-medium transition-all">
             <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5" alt=""/>
             Login with Google
           </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-20">
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

      <header className="bg-black text-white px-6 py-4 flex justify-between items-center shadow-lg sticky top-0 z-50">
        <div className="flex items-center gap-3 font-bold text-lg"><span className="bg-white text-black p-1 rounded">AD</span> Verifier</div>
        <div className="flex items-center gap-4">
          <input type="date" value={targetDate} onChange={e => setTargetDate(e.target.value)} className="bg-gray-800 border-none rounded px-3 py-1 text-sm outline-none focus:ring-1 focus:ring-white"/>
          <button onClick={handleRunCheck} disabled={loading} className="bg-white text-black px-4 py-1 rounded text-sm font-bold hover:bg-gray-200 disabled:opacity-50">
            {loading ? 'Running...' : 'Run'}
          </button>
          <button onClick={() => signOut(auth)} className="text-xs text-gray-400 hover:text-white">Logout</button>
        </div>
      </header>

      <main className="max-w-7xl mx-auto p-6 mt-4">
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
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Shipment Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-blue-500">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700">出貨比對 (Shipment)</h3>
                        <Badge status={activeResult.shipment.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-blue-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-blue-600 font-bold uppercase">EOD 筆數</div>
                            <div className="text-xl font-bold text-blue-900">{activeResult.shipment.sourceCounts?.eod}</div>
                        </div>
                        <div className="bg-indigo-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-indigo-600 font-bold uppercase">報表筆數</div>
                            <div className="text-xl font-bold text-indigo-900">{activeResult.shipment.sourceCounts?.report}</div>
                        </div>
                    </div>
                    {activeResult.shipment.sourceCounts?.eod === 0 && activeResult.shipment.sourceCounts?.report === 0 && (
                        <div className="mt-4 p-2 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-100 flex items-center gap-2">
                            ⚠️ 該日期查無出貨數據。
                        </div>
                    )}
                  </Card>
                  <Card><DetailTable details={activeResult.shipment.details} type="Shipment" platform={activePlatform} /></Card>
                </div>

                {/* Return Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-orange-500">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700">退貨比對 (Return)</h3>
                        <Badge status={activeResult.return.status} />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                        <div className="bg-orange-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-orange-600 font-bold uppercase">EOD 筆數</div>
                            <div className="text-xl font-bold text-orange-900">{activeResult.return.sourceCounts?.eod}</div>
                        </div>
                        <div className="bg-red-50 p-3 rounded-lg text-center">
                            <div className="text-xs text-red-600 font-bold uppercase">報表筆數</div>
                            <div className="text-xl font-bold text-red-900">{activeResult.return.sourceCounts?.report}</div>
                        </div>
                    </div>
                    {activeResult.return.sourceCounts?.eod === 0 && activeResult.return.sourceCounts?.report === 0 && (
                        <div className="mt-4 p-2 bg-yellow-50 text-yellow-700 text-xs rounded border border-yellow-100 flex items-center gap-2">
                            ⚠️ 該日期查無退貨數據。
                        </div>
                    )}
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
    </div>
  );
}