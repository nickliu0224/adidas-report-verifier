import React, { useState, useEffect } from 'react';
import { runReconciliation } from './services/bigQueryService';
import { PlatformResult, Platform, ComparisonRow } from './types';
import { auth, googleProvider } from './services/firebase';
import { signInWithPopup, signOut, GoogleAuthProvider, User } from 'firebase/auth';
import { saveReport, getHistory, deleteReport, updateReportNote, SavedReport } from './services/dbService';

// --- RBAC Logic ---
type Role = 'ADMIN' | 'VIEWER';

const getRole = (user: User | null): Role => {
    if (!user) return 'VIEWER';
    return 'ADMIN'; 
};

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
  
  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>
      {label[status] || status}
    </span>
  );
};

const DetailTable = ({ details, type, platform }: { details: ComparisonRow[]; type: 'Shipment' | 'Return'; platform: Platform }) => {
  if (details.length === 0) return <div className="p-4 text-gray-500 text-sm italic">✅ 完全一致</div>;

  const isBrandSite = platform === Platform.BRAND_SITE;
  let idLabel = '訂單編號';
  if (isBrandSite) idLabel = type === 'Shipment' ? 'TG 單號' : 'TS 單號';

  return (
    <div className="overflow-x-auto max-h-96">
      <table className="min-w-full divide-y divide-gray-200 relative">
        <thead className="bg-gray-50 sticky top-0 z-10 shadow-sm">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{idLabel}</th>
            {isBrandSite && type === 'Shipment' && (
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">對應 TS 明細</th>
            )}
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">EOD</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">報表</th>
            <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">差異</th>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">狀態</th>
          </tr>
        </thead>
        <tbody className="bg-white divide-y divide-gray-200">
          {details.map((row) => (
            <tr key={row.key} className="hover:bg-gray-50">
              <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 font-mono">{row.key}</td>
              {isBrandSite && type === 'Shipment' && (
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs max-w-xs truncate" title={row.tsIds}>{row.tsIds || '-'}</td>
              )}
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{row.leftValue?.toLocaleString() ?? '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{row.rightValue?.toLocaleString() ?? '-'}</td>
              <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${row.diff !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {row.diff > 0 ? `+${row.diff}` : row.diff}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm"><Badge status={row.status} /></td>
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
  const [role, setRole] = useState<Role>('VIEWER');
  
  const [view, setView] = useState<'DASHBOARD' | 'HISTORY' | 'DETAIL'>('DASHBOARD');
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  
  const [results, setResults] = useState<PlatformResult[] | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>(Platform.BRAND_SITE);
  
  const [history, setHistory] = useState<SavedReport[]>([]);
  const [selectedReport, setSelectedReport] = useState<SavedReport | null>(null);

  useEffect(() => {
     const unsubscribe = auth.onAuthStateChanged((u) => {
         setUser(u);
         setRole(getRole(u));
         if (!u) {
             setBqToken(null);
             setResults(null);
         }
     });
     return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    try {
      const result = await signInWithPopup(auth, googleProvider);
      const credential = GoogleAuthProvider.credentialFromResult(result);
      if (credential?.accessToken) {
        setBqToken(credential.accessToken);
      }
    } catch (error: any) {
      console.error("Login failed", error);
      // 顯示具體的 Firebase 錯誤訊息，這對除錯非常有幫助
      alert(`Login failed: ${error.message} (${error.code})`);
    }
  };

  const handleLogout = () => {
      signOut(auth);
      setView('DASHBOARD');
  };

  const handleRunCheck = async () => {
    if (!bqToken) {
        alert("Session expired. Please login again.");
        return;
    }
    setLoading(true);
    setResults(null);
    try {
      const data = await runReconciliation(targetDate, bqToken);
      setResults(data);
    } catch (e: any) {
      console.error(e);
      alert(`Error: ${e.message}`);
    } finally {
      setLoading(false);
    }
  };

  const handleSaveReport = async () => {
      if (!user || !results) return;
      if (role !== 'ADMIN') return alert("Only Admins can save reports.");
      const confirm = window.confirm("Save this report to history?");
      if (!confirm) return;
      setLoading(true);
      try {
          await saveReport(targetDate, user.email || 'Unknown', results);
          alert("Report saved!");
          fetchHistory();
      } catch (e) {
          alert("Failed to save report.");
      } finally {
          setLoading(false);
      }
  };

  const fetchHistory = async () => {
      setLoading(true);
      try {
          const data = await getHistory();
          setHistory(data);
      } catch (e) {
          console.error(e);
      } finally {
          setLoading(false);
      }
  };

  const handleDeleteReport = async (id: string, e: React.MouseEvent) => {
      e.stopPropagation();
      if (role !== 'ADMIN') return;
      if (!window.confirm("Delete this report?")) return;
      try {
          await deleteReport(id);
          setHistory(prev => prev.filter(h => h.id !== id));
      } catch(e) {
          alert("Failed to delete.");
      }
  };

  const openHistory = () => {
      setView('HISTORY');
      fetchHistory();
  };
  
  const openDashboard = () => {
      setView('DASHBOARD');
      setResults(null);
  };

  const openDetail = (report: SavedReport) => {
      setSelectedReport(report);
      setResults(report.results);
      setTargetDate(report.targetDate);
      setView('DETAIL');
  };

  const handleUpdateNote = async (id: string, newNote: string, newStatus: SavedReport['status']) => {
      try {
          await updateReportNote(id, newNote, newStatus);
          setHistory(prev => prev.map(h => h.id === id ? { ...h, note: newNote, status: newStatus } : h));
          if (selectedReport && selectedReport.id === id) {
              setSelectedReport({ ...selectedReport, note: newNote, status: newStatus });
          }
      } catch (e) {
          alert("Failed to update.");
      }
  };

  if (!user) {
      return (
          <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
              <div className="bg-white p-8 rounded-2xl shadow-lg max-w-md w-full text-center">
                  <div className="mx-auto h-16 w-16 bg-black text-white rounded-full flex items-center justify-center mb-6">
                    <svg className="h-8 w-8 fill-current" viewBox="0 0 50 32"><path d="M36.1 4.2L25.3 22.9 22.2 21.1 34.6 0l15.3 26.5h-6.2L36.1 4.2zM21.7 8.3L13.4 22.8 10.3 21 20.2 4.1 33 26.5h-6.2L21.7 8.3zM7.2 12.5L1.5 22.8H8l2.5-4.4L15.3 26.5H9.2l-2-3.4-2.1 3.4H-.9l8.1-14z"/></svg>
                  </div>
                  <h1 className="text-2xl font-bold text-gray-900 mb-2">Adidas Data Verifier</h1>
                  <p className="text-gray-500 mb-8">請先登入 Google 帳號以存取數據</p>
                  <button onClick={handleLogin} className="w-full flex items-center justify-center space-x-2 bg-white border border-gray-300 hover:bg-gray-50 text-gray-700 font-medium py-3 px-4 rounded-lg transition-colors">
                      <svg className="h-5 w-5" viewBox="0 0 24 24"><path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/><path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/><path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/><path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/></svg>
                      <span>Sign in with Google</span>
                  </button>
              </div>
          </div>
      )
  }

  const activeResult = results?.find(r => r.platform === activePlatform);

  return (
    <div className="min-h-screen pb-20 bg-gray-50">
      <header className="bg-black text-white py-4 shadow-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-4 cursor-pointer" onClick={openDashboard}>
            <svg className="h-6 w-6 text-white fill-current" viewBox="0 0 50 32"><path d="M36.1 4.2L25.3 22.9 22.2 21.1 34.6 0l15.3 26.5h-6.2L36.1 4.2zM21.7 8.3L13.4 22.8 10.3 21 20.2 4.1 33 26.5h-6.2L21.7 8.3zM7.2 12.5L1.5 22.8H8l2.5-4.4L15.3 26.5H9.2l-2-3.4-2.1 3.4H-.9l8.1-14z"/></svg>
            <span className="font-bold tracking-tight">Data Verifier</span>
          </div>
          <div className="flex items-center space-x-4">
             <nav className="hidden md:flex space-x-2">
                 <button onClick={openDashboard} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === 'DASHBOARD' ? 'bg-gray-800 text-white' : 'text-gray-300 hover:text-white'}`}>New Check</button>
                 <button onClick={openHistory} className={`px-3 py-1.5 rounded-md text-sm font-medium ${view === 'HISTORY' || view === 'DETAIL' ? 'bg-gray-800 text-white' : 'text-gray-300 hover:text-white'}`}>History (CMS)</button>
             </nav>
             <div className="flex items-center space-x-3 pl-4 border-l border-gray-700">
                 <div className="text-right hidden sm:block">
                     <div className="text-sm font-medium">{user.displayName}</div>
                     <div className="text-xs text-gray-400 font-mono">{role}</div>
                 </div>
                 <img src={user.photoURL || ''} alt="" className="h-8 w-8 rounded-full bg-gray-700" />
                 <button onClick={handleLogout} className="text-gray-400 hover:text-white"><svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg></button>
             </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {view === 'DASHBOARD' && (
            <div className="space-y-6">
                 <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-200 flex flex-col md:flex-row items-center justify-between gap-4">
                    <div>
                        <h2 className="text-lg font-semibold text-gray-900">Run New Reconciliation</h2>
                        <p className="text-sm text-gray-500">Query BigQuery live data to find discrepancies.</p>
                    </div>
                    <div className="flex items-center space-x-3 w-full md:w-auto">
                        <input 
                            type="date" 
                            value={targetDate}
                            onChange={(e) => setTargetDate(e.target.value)}
                            className="bg-gray-50 border border-gray-300 text-gray-900 rounded-lg px-4 py-2 focus:ring-black focus:border-black outline-none w-full md:w-auto"
                        />
                        <button 
                            onClick={handleRunCheck}
                            disabled={loading || !bqToken}
                            className="bg-black text-white hover:bg-gray-800 px-6 py-2 rounded-lg font-medium shadow-sm disabled:opacity-50 transition-all w-full md:w-auto whitespace-nowrap"
                        >
                        {loading ? 'Running...' : 'Run Comparison'}
                        </button>
                    </div>
                </div>
            </div>
        )}

        {view === 'HISTORY' && (
            <div className="space-y-6">
                <div className="flex justify-between items-center">
                    <h2 className="text-xl font-bold text-gray-900">Saved Reports</h2>
                    <button onClick={fetchHistory} className="text-sm text-gray-500 hover:text-black flex items-center gap-1">刷新</button>
                </div>
                <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                    <table className="min-w-full divide-y divide-gray-200">
                        <thead className="bg-gray-50">
                            <tr>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Date</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Run By</th>
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">Status</th>
                                <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">Actions</th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {history.map((item) => (
                                <tr key={item.id} className="hover:bg-gray-50 cursor-pointer" onClick={() => openDetail(item)}>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">{item.targetDate}</td>
                                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">{item.runBy}</td>
                                    <td className="px-6 py-4 whitespace-nowrap"><Badge status={item.status} /></td>
                                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                        <button onClick={(e) => handleDeleteReport(item.id, e)} className="text-red-600 hover:text-red-900">Delete</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        )}

        {results && (
          <div className="space-y-6 pb-10">
            {view === 'DETAIL' && selectedReport && (
                <div className="flex items-center justify-between bg-white p-4 rounded-xl border border-gray-200 mb-4 animate-fade-in">
                    <div>
                        <div className="text-sm text-gray-500 uppercase font-semibold">Report Detail</div>
                        <h2 className="text-2xl font-bold">{selectedReport.targetDate}</h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <select 
                        value={selectedReport.status}
                        onChange={(e) => handleUpdateNote(selectedReport.id, selectedReport.note || '', e.target.value as any)}
                        className="border-gray-300 rounded-md text-sm"
                        >
                            <option value="OPEN">Open</option>
                            <option value="REVIEWED">Reviewed</option>
                            <option value="RESOLVED">Resolved</option>
                        </select>
                    </div>
                </div>
            )}
            
            <div className="flex space-x-4 overflow-x-auto pb-2">
              {results.map((res) => (
                <button
                  key={res.platform}
                  onClick={() => { setActivePlatform(res.platform); }}
                  className={`px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    activePlatform === res.platform ? 'bg-black text-white border-black' : 'bg-white text-gray-600 border-gray-200'
                  }`}
                >
                  {res.platform}
                </button>
              ))}
            </div>

            {activeResult && (
              <div className="space-y-6 animate-fade-in">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   <Card className="border-l-4 border-l-blue-500 p-5">
                      <h3 className="text-lg font-bold mb-4">出貨 (Shipment)</h3>
                      <div className="grid grid-cols-2 gap-4 text-center">
                          <div className="bg-gray-50 p-3 rounded-lg"><div className="text-2xl font-bold">{activeResult.shipment.unmatchedCount}</div><div className="text-xs text-gray-500">單邊遺漏</div></div>
                          <div className="bg-gray-50 p-3 rounded-lg"><div className="text-2xl font-bold">{activeResult.shipment.diffCount}</div><div className="text-xs text-gray-500">金額差異</div></div>
                      </div>
                   </Card>
                   <Card className="border-l-4 border-l-orange-500 p-5">
                      <h3 className="text-lg font-bold mb-4">退貨 (Return)</h3>
                      <div className="grid grid-cols-2 gap-4 text-center">
                          <div className="bg-gray-50 p-3 rounded-lg"><div className="text-2xl font-bold">{activeResult.return.unmatchedCount}</div><div className="text-xs text-gray-500">單邊遺漏</div></div>
                          <div className="bg-gray-50 p-3 rounded-lg"><div className="text-2xl font-bold">{activeResult.return.diffCount}</div><div className="text-xs text-gray-500">金額差異</div></div>
                      </div>
                   </Card>
                </div>
                <Card>
                    <DetailTable details={activeResult.shipment.details} type="Shipment" platform={activePlatform} />
                </Card>
                <Card>
                    <DetailTable details={activeResult.return.details} type="Return" platform={activePlatform} />
                </Card>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}