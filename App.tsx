import React, { useState } from 'react';
import { fetchReconciliationData } from './services/mockBigQueryService';
import { PlatformResult, Platform, ComparisonRow } from './types';

// --- UI Components ---

const Card = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

const Badge = ({ status }: { status: string }) => {
  const styles = {
    MATCH: 'bg-green-100 text-green-800',
    MISSING_LEFT: 'bg-red-100 text-red-800', // Only in Report
    MISSING_RIGHT: 'bg-orange-100 text-orange-800', // Only in EOD
    DIFF: 'bg-yellow-100 text-yellow-800',
    OK: 'bg-green-100 text-green-800',
    WARNING: 'bg-yellow-100 text-yellow-800',
    ERROR: 'bg-red-100 text-red-800',
  };
  const label = {
    MATCH: '一致',
    MISSING_LEFT: '僅報表 (Missing EOD)',
    MISSING_RIGHT: '僅 EOD (Missing Report)',
    DIFF: '金額差異',
    OK: 'Pass',
    WARNING: 'Check',
    ERROR: 'Fail'
  };
  
  // @ts-ignore
  const className = styles[status] || 'bg-gray-100 text-gray-800';
  // @ts-ignore
  const text = label[status] || status;

  return (
    <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${className}`}>
      {text}
    </span>
  );
};

const DetailTable = ({ 
  details, 
  type, 
  platform 
}: { 
  details: ComparisonRow[]; 
  type: 'Shipment' | 'Return'; 
  platform: Platform 
}) => {
  if (details.length === 0) return <div className="p-4 text-gray-500 text-sm italic">✅ 完全一致 (No discrepancies found)</div>;

  const isBrandSite = platform === Platform.BRAND_SITE;
  
  // Logic from Python script:
  // Brand Site Ship: 'TG 單號'
  // Brand Site Return: 'TS 單號'
  // Others: '訂單編號'
  let idLabel = '訂單編號';
  if (isBrandSite) {
      idLabel = type === 'Shipment' ? 'TG 單號' : 'TS 單號';
  }

  return (
    <div className="overflow-x-auto">
      <table className="min-w-full divide-y divide-gray-200">
        <thead className="bg-gray-50">
          <tr>
            <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">{idLabel}</th>
            
            {/* Logic: Brand Site Shipment shows TS Details column */}
            {isBrandSite && type === 'Shipment' && (
               <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">對應 TS 明細 (物流單)</th>
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
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 font-mono text-xs max-w-xs truncate" title={row.tsIds}>
                    {row.tsIds || '-'}
                </td>
              )}
              
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{row.leftValue?.toLocaleString() ?? '-'}</td>
              <td className="px-6 py-4 whitespace-nowrap text-sm text-right text-gray-500">{row.rightValue?.toLocaleString() ?? '-'}</td>
              <td className={`px-6 py-4 whitespace-nowrap text-sm text-right font-bold ${row.diff !== 0 ? 'text-red-600' : 'text-gray-400'}`}>
                {row.diff > 0 ? `+${row.diff}` : row.diff}
              </td>
              <td className="px-6 py-4 whitespace-nowrap text-sm">
                <Badge status={row.status} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

// --- Main App ---

export default function App() {
  // Default date set to match Python script example for convenience
  const [targetDate, setTargetDate] = useState<string>('2026-01-12');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<PlatformResult[] | null>(null);
  const [activePlatform, setActivePlatform] = useState<Platform>(Platform.BRAND_SITE);

  const handleRunCheck = async () => {
    setLoading(true);
    setResults(null);
    try {
      const data = await fetchReconciliationData(targetDate);
      setResults(data);
    } catch (e) {
      console.error(e);
      alert("Error fetching data");
    } finally {
      setLoading(false);
    }
  };

  const activeResult = results?.find(r => r.platform === activePlatform);

  return (
    <div className="min-h-screen pb-20">
      {/* Header */}
      <header className="bg-black text-white py-6 shadow-md">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex justify-between items-center">
          <div className="flex items-center space-x-4">
             {/* Adidas Logo SVG */}
            <svg className="h-8 w-8 text-white fill-current" viewBox="0 0 50 32" xmlns="http://www.w3.org/2000/svg">
                <path d="M36.1 4.2L25.3 22.9 22.2 21.1 34.6 0l15.3 26.5h-6.2L36.1 4.2zM21.7 8.3L13.4 22.8 10.3 21 20.2 4.1 33 26.5h-6.2L21.7 8.3zM7.2 12.5L1.5 22.8H8l2.5-4.4L15.3 26.5H9.2l-2-3.4-2.1 3.4H-.9l8.1-14z"/>
            </svg>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">Data Reconciliation</h1>
              <p className="text-xs text-gray-400 font-mono">v2.0 | BigQuery x EOD</p>
            </div>
          </div>
          <div className="flex items-center space-x-2 bg-gray-900 rounded-lg p-1">
             <input 
                type="date" 
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="bg-gray-800 text-white border-none rounded px-3 py-1.5 focus:ring-1 focus:ring-white outline-none font-mono"
             />
             <button 
                onClick={handleRunCheck}
                disabled={loading}
                className="bg-white text-black hover:bg-gray-200 px-4 py-1.5 rounded font-medium text-sm disabled:opacity-50 transition-colors"
             >
               {loading ? 'Processing...' : 'Run Comparison'}
             </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-8">
        {!results && !loading && (
          <div className="text-center py-20 bg-white rounded-xl shadow-sm border border-gray-200">
            <div className="mx-auto h-16 w-16 text-gray-300 mb-4">
               <svg fill="none" viewBox="0 0 24 24" stroke="currentColor">
                   <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
               </svg>
            </div>
            <h3 className="text-lg font-medium text-gray-900">Ready to Reconcile</h3>
            <p className="mt-1 text-sm text-gray-500">Select a date above and click "Run Comparison" to verify sales data.</p>
          </div>
        )}

        {loading && (
           <div className="flex flex-col items-center justify-center py-20">
               <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-black mb-4"></div>
               <p className="text-gray-600 animate-pulse">Querying BigQuery (Simulated)...</p>
           </div>
        )}

        {results && (
          <div className="space-y-6">
            {/* Platform Tabs */}
            <div className="flex space-x-4 overflow-x-auto pb-2">
              {results.map((res) => (
                <button
                  key={res.platform}
                  onClick={() => { setActivePlatform(res.platform); }}
                  className={`flex items-center space-x-2 px-4 py-3 rounded-lg border text-sm font-medium transition-all ${
                    activePlatform === res.platform 
                    ? 'bg-black text-white border-black shadow-lg scale-105' 
                    : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'
                  }`}
                >
                  <span>{res.platform}</span>
                  {(res.shipment.status !== 'OK' || res.return.status !== 'OK') && (
                     <span className="flex h-2 w-2 relative">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
                     </span>
                  )}
                </button>
              ))}
            </div>

            {/* Dashboard Content */}
            {activeResult && (
              <div className="space-y-6 animate-fade-in">
                {/* Summary Cards */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                   {/* Shipment Card */}
                   <Card className="border-l-4 border-l-blue-500">
                      <div className="p-5">
                          <div className="flex justify-between items-start mb-4">
                              <div>
                                  <h3 className="text-lg font-bold text-gray-900">出貨 (Shipment)</h3>
                                  <p className="text-sm text-gray-500">Sales Order Status: 已出貨</p>
                              </div>
                              <Badge status={activeResult.shipment.status} />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-center">
                              <div className="bg-gray-50 p-3 rounded-lg">
                                  <div className="text-2xl font-bold text-gray-900">{activeResult.shipment.unmatchedCount}</div>
                                  <div className="text-xs text-gray-500 uppercase">單邊遺漏</div>
                              </div>
                              <div className="bg-gray-50 p-3 rounded-lg">
                                  <div className="text-2xl font-bold text-gray-900">{activeResult.shipment.diffCount}</div>
                                  <div className="text-xs text-gray-500 uppercase">金額差異</div>
                              </div>
                          </div>
                      </div>
                   </Card>

                   {/* Return Card */}
                   <Card className="border-l-4 border-l-orange-500">
                      <div className="p-5">
                          <div className="flex justify-between items-start mb-4">
                              <div>
                                  <h3 className="text-lg font-bold text-gray-900">退貨 (Return)</h3>
                                  <p className="text-sm text-gray-500">Sales Order Status: 退貨結案</p>
                              </div>
                              <Badge status={activeResult.return.status} />
                          </div>
                          <div className="grid grid-cols-2 gap-4 text-center">
                              <div className="bg-gray-50 p-3 rounded-lg">
                                  <div className="text-2xl font-bold text-gray-900">{activeResult.return.unmatchedCount}</div>
                                  <div className="text-xs text-gray-500 uppercase">單邊遺漏</div>
                              </div>
                              <div className="bg-gray-50 p-3 rounded-lg">
                                  <div className="text-2xl font-bold text-gray-900">{activeResult.return.diffCount}</div>
                                  <div className="text-xs text-gray-500 uppercase">金額差異</div>
                              </div>
                          </div>
                      </div>
                   </Card>
                </div>

                {/* Detailed Tables */}
                <div className="space-y-6">
                    <Card>
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="text-base font-semibold text-gray-900">出貨異常明細 (Shipment Discrepancies)</h3>
                        </div>
                        <DetailTable details={activeResult.shipment.details} type="Shipment" platform={activePlatform} />
                    </Card>

                    <Card>
                        <div className="px-6 py-4 border-b border-gray-100 bg-gray-50">
                            <h3 className="text-base font-semibold text-gray-900">退貨異常明細 (Return Discrepancies)</h3>
                        </div>
                        <DetailTable details={activeResult.return.details} type="Return" platform={activePlatform} />
                    </Card>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
    </div>
  );
}
