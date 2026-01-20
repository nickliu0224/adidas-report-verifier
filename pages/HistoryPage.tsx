
import React, { useEffect, useState } from 'react';
import { getHistory, SavedReport, deleteReport } from '../services/dbService';
import { Card, Badge, DetailTable } from '../components/Shared';
import { PlatformResult, Platform } from '../types';

export default function HistoryPage() {
  const [reports, setReports] = useState<SavedReport[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>(Platform.BRAND_SITE);

  const fetchHistory = async () => {
    setLoading(true);
    try {
        const data = await getHistory();
        setReports(data);
    } catch (e) {
        console.error(e);
    } finally {
        setLoading(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('確定要刪除這筆紀錄嗎？')) {
        await deleteReport(id);
        fetchHistory();
    }
  };

  return (
    <div className="space-y-6">
        <div className="flex justify-between items-center">
            <h2 className="text-2xl font-bold text-gray-800">比對歷史紀錄</h2>
            <button onClick={fetchHistory} className="text-sm text-gray-500 hover:text-black flex items-center gap-1">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                Refresh
            </button>
        </div>

        {loading ? (
            <div className="space-y-4">
                {[1,2,3].map(i => <div key={i} className="h-20 bg-white rounded-xl shadow-sm animate-pulse"></div>)}
            </div>
        ) : reports.length === 0 ? (
             <div className="text-center py-20 text-gray-400 bg-white rounded-xl">尚無歷史紀錄</div>
        ) : (
            <div className="space-y-4">
                {reports.map((report) => (
                    <div key={report.id} className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
                        <div 
                            className="p-4 flex items-center justify-between cursor-pointer hover:bg-gray-50 transition-colors"
                            onClick={() => setExpandedId(expandedId === report.id ? null : report.id)}
                        >
                            <div className="flex items-center gap-6">
                                <div>
                                    <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Target Date</div>
                                    <div className="font-mono font-bold text-lg text-gray-800">{report.targetDate}</div>
                                </div>
                                <div className="hidden sm:block">
                                    <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Run By</div>
                                    <div className="text-sm text-gray-600">{report.runBy.split('@')[0]}</div>
                                </div>
                                <div className="hidden sm:block">
                                    <div className="text-xs text-gray-500 uppercase font-bold tracking-wider mb-1">Run At</div>
                                    <div className="text-sm text-gray-600">{report.runAt?.toDate().toLocaleString()}</div>
                                </div>
                            </div>
                            
                            <div className="flex items-center gap-4">
                                <div className="flex gap-2">
                                    {report.results.map(r => {
                                        const hasErr = r.shipment.status === 'ERROR' || r.return.status === 'ERROR';
                                        const hasWarn = r.shipment.status === 'WARNING' || r.return.status === 'WARNING';
                                        let color = 'bg-green-500';
                                        if (hasErr) color = 'bg-red-500';
                                        else if (hasWarn) color = 'bg-yellow-500';
                                        
                                        return (
                                            <div key={r.platform} className="flex flex-col items-center" title={r.platform}>
                                                <div className={`w-2 h-2 rounded-full ${color}`}></div>
                                            </div>
                                        )
                                    })}
                                </div>
                                <button 
                                    onClick={(e) => handleDelete(report.id, e)}
                                    className="p-2 text-gray-400 hover:text-red-500 rounded-full hover:bg-red-50 transition-colors"
                                >
                                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg>
                                </button>
                                <svg className={`w-5 h-5 text-gray-400 transform transition-transform ${expandedId === report.id ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
                            </div>
                        </div>

                        {expandedId === report.id && (
                            <div className="border-t border-gray-100 bg-gray-50 p-6 animate-in slide-in-from-top-2">
                                <div className="flex gap-2 overflow-x-auto pb-4">
                                    {report.results.map(r => (
                                        <button 
                                            key={r.platform} 
                                            onClick={() => setActivePlatform(r.platform)} 
                                            className={`px-3 py-1.5 rounded-lg text-xs font-bold border transition-all ${activePlatform === r.platform ? 'bg-black text-white border-black' : 'bg-white text-gray-500 border-gray-200'}`}
                                        >
                                            {r.platform}
                                        </button>
                                    ))}
                                </div>
                                {(() => {
                                    const res = report.results.find(r => r.platform === activePlatform);
                                    if (!res) return null;
                                    return (
                                        <div className="space-y-4">
                                            <Card className="p-4">
                                                <div className="flex justify-between mb-2">
                                                    <h4 className="font-bold text-sm">出貨異常 (Shipment)</h4>
                                                    <Badge status={res.shipment.status} />
                                                </div>
                                                <DetailTable details={res.shipment.details} type="Shipment" platform={activePlatform} />
                                            </Card>
                                            <Card className="p-4">
                                                 <div className="flex justify-between mb-2">
                                                    <h4 className="font-bold text-sm">退貨異常 (Return)</h4>
                                                    <Badge status={res.return.status} />
                                                </div>
                                                <DetailTable details={res.return.details} type="Return" platform={activePlatform} />
                                            </Card>
                                        </div>
                                    )
                                })()}
                            </div>
                        )}
                    </div>
                ))}
            </div>
        )}
    </div>
  );
}
