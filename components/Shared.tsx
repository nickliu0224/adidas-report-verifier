
import React from 'react';
import { Platform, ComparisonRow } from '../types';

export const Card = ({ children, className = '' }: { children?: React.ReactNode; className?: string }) => (
  <div className={`bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden ${className}`}>
    {children}
  </div>
);

export const Badge = ({ status }: { status: string }) => {
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
    ERROR: 'Fail',
    OPEN: '未處理',
    REVIEWED: '已查看',
    RESOLVED: '已解決'
  };
  return <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${styles[status] || 'bg-gray-100 text-gray-800'}`}>{label[status] || status}</span>;
};

export const DetailTable = ({ details, type, platform }: { details: ComparisonRow[]; type: 'Shipment' | 'Return'; platform: Platform }) => {
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
