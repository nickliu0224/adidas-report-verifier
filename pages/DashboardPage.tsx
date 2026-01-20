
import React, { useState, useEffect } from 'react';
import { runReconciliation } from '../services/bigQueryService';
import { PlatformResult, Platform } from '../types';
import { saveReport } from '../services/dbService';
import { Card, Badge, DetailTable } from '../components/Shared';

export default function DashboardPage({ user }: { user: any, bqToken?: string | null }) {
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{ platform: string, step: number, total: number } | null>(null);
  const [results, setResults] = useState<PlatformResult[] | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>(Platform.BRAND_SITE);
  const [targetDate, setTargetDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  const handleRunCheck = async () => {
    // Retrieve token from storage (set by LoginPage) or prop
    const token = sessionStorage.getItem('bq_access_token');
    
    if (!token) {
        alert("Session expired or invalid. Please Logout and Login again.");
        return;
    }

    setLoading(true);
    setResults(null);
    setErrorMsg(null);
    try {
      const data = await runReconciliation(targetDate, token, (platform, step, total) => {
          setProgress({ platform, step, total });
      });
      setResults(data);

      // Auto Save to Firestore History
      if (user && user.email) {
          try {
            await saveReport(targetDate, user.email, data);
            console.log("Report saved to history");
          } catch(err) {
              console.error("Failed to save report", err);
          }
      }

    } catch (e: any) { 
      setErrorMsg(e.message);
    }
    finally { 
        setLoading(false); 
        setProgress(null);
    }
  };

  const activeResult = results?.find(r => r.platform === activePlatform);

  return (
    <>
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

        <div className="mb-6 flex flex-col sm:flex-row justify-between items-center bg-white p-4 rounded-xl shadow-sm border border-gray-100 gap-4">
          <div className="flex items-center gap-2 w-full sm:w-auto">
            <span className="text-sm font-medium text-gray-500">比對日期</span>
            <input 
              type="date" 
              value={targetDate} 
              onChange={e => setTargetDate(e.target.value)} 
              className="bg-gray-50 border border-gray-300 rounded px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-black w-full sm:w-auto"
            />
          </div>
          <button 
            onClick={handleRunCheck} 
            disabled={loading} 
            className="w-full sm:w-auto bg-black text-white px-8 py-2.5 rounded-lg text-sm font-bold hover:bg-gray-800 disabled:opacity-50 transition-all shadow-lg hover:shadow-xl"
          >
            {loading ? 'Running Analysis...' : 'Start Verification'}
          </button>
        </div>

        {errorMsg && (
          <div className="mb-6 p-4 bg-red-100 border border-red-200 text-red-700 rounded-lg flex items-center gap-3 animate-in fade-in slide-in-from-top-2">
            <svg className="w-5 h-5 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M18 10a8 8 0 11-16 0 8 8 0 0116 0zm-7 4a1 1 0 11-2 0 1 1 0 012 0zm-1-9a1 1 0 00-1 1v4a1 1 0 102 0V6a1 1 0 00-1-1z" clipRule="evenodd" /></svg>
            <span className="font-bold">{errorMsg}</span>
          </div>
        )}

        {results ? (
          <div className="space-y-6">
            <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
              {results.map(r => (
                <button key={r.platform} onClick={() => setActivePlatform(r.platform)} className={`px-5 py-2.5 rounded-full text-sm font-bold border transition-all whitespace-nowrap ${activePlatform === r.platform ? 'bg-black text-white border-black shadow-lg scale-105' : 'bg-white text-gray-500 border-gray-200 hover:bg-gray-50'}`}>
                  {r.platform}
                </button>
              ))}
            </div>

            {activeResult && (
              <div className="flex flex-col gap-8 animate-in fade-in slide-in-from-bottom-2 duration-500">
                {/* Shipment Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-blue-500 bg-gradient-to-br from-blue-50/50 to-white">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700 text-lg flex items-center gap-2">
                            <span className="w-2 h-6 bg-blue-500 rounded-full"></span>
                            出貨比對 (Shipment)
                        </h3>
                        <Badge status={activeResult.shipment.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-blue-100 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-16 h-16 bg-blue-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="text-xs text-blue-600 font-bold uppercase mb-1 tracking-wider">EOD Data</div>
                                <div className="text-3xl font-black text-blue-900 tracking-tight">{activeResult.shipment.sourceCounts?.eod} <span className="text-sm text-blue-600/70 font-normal">筆</span></div>
                                <div className="text-sm font-semibold text-blue-700 mt-2 pt-2 border-t border-dashed border-blue-200">
                                    ${activeResult.shipment.sourceAmounts?.eod?.toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-indigo-100 relative overflow-hidden group">
                            <div className="absolute right-0 top-0 w-16 h-16 bg-indigo-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="text-xs text-indigo-600 font-bold uppercase mb-1 tracking-wider">Report Data</div>
                                <div className="text-3xl font-black text-indigo-900 tracking-tight">{activeResult.shipment.sourceCounts?.report} <span className="text-sm text-indigo-600/70 font-normal">筆</span></div>
                                <div className="text-sm font-semibold text-indigo-700 mt-2 pt-2 border-t border-dashed border-indigo-200">
                                    ${activeResult.shipment.sourceAmounts?.report?.toLocaleString()}
                                </div>
                            </div>
                        </div>
                    </div>
                  </Card>
                  <Card><DetailTable details={activeResult.shipment.details} type="Shipment" platform={activePlatform} /></Card>
                </div>

                {/* Return Section */}
                <div className="space-y-4">
                  <Card className="p-5 border-t-4 border-t-red-500 bg-gradient-to-br from-red-50/50 to-white">
                    <div className="flex justify-between items-start mb-4">
                        <h3 className="font-bold text-gray-700 text-lg flex items-center gap-2">
                             <span className="w-2 h-6 bg-red-500 rounded-full"></span>
                             退貨比對 (Return)
                        </h3>
                        <Badge status={activeResult.return.status} />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 max-w-2xl">
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-red-100 relative overflow-hidden group">
                             <div className="absolute right-0 top-0 w-16 h-16 bg-red-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="text-xs text-red-600 font-bold uppercase mb-1 tracking-wider">EOD Data</div>
                                <div className="text-3xl font-black text-red-900 tracking-tight">{activeResult.return.sourceCounts?.eod} <span className="text-sm text-red-600/70 font-normal">筆</span></div>
                                <div className="text-sm font-semibold text-red-700 mt-2 pt-2 border-t border-dashed border-red-200">
                                    ${activeResult.return.sourceAmounts?.eod?.toLocaleString()}
                                </div>
                            </div>
                        </div>
                        <div className="bg-white p-4 rounded-xl shadow-sm border border-rose-100 relative overflow-hidden group">
                             <div className="absolute right-0 top-0 w-16 h-16 bg-rose-50 rounded-bl-full -mr-4 -mt-4 transition-transform group-hover:scale-110"></div>
                            <div className="relative z-10">
                                <div className="text-xs text-rose-600 font-bold uppercase mb-1 tracking-wider">Report Data</div>
                                <div className="text-3xl font-black text-rose-900 tracking-tight">{activeResult.return.sourceCounts?.report} <span className="text-sm text-rose-600/70 font-normal">筆</span></div>
                                <div className="text-sm font-semibold text-rose-700 mt-2 pt-2 border-t border-dashed border-rose-200">
                                    ${activeResult.return.sourceAmounts?.report?.toLocaleString()}
                                </div>
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
          <div className="flex flex-col items-center justify-center py-20 text-gray-400 bg-white rounded-2xl border border-dashed border-gray-300">
            <div className="w-20 h-20 bg-gray-50 rounded-full flex items-center justify-center mb-4">
                <svg className="w-10 h-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" /></svg>
            </div>
            <p className="font-medium text-gray-500">尚無資料</p>
            <p className="text-sm mt-1">請選擇上方日期並點擊 "Start Verification" 開始比對</p>
          </div>
        )}
    </>
  );
}
