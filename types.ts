export enum Platform {
    BRAND_SITE = '品牌官網',
    SHOPEE = 'SHOPEE',
    MOMO = 'MOMO',
    YAHOO = 'YAHOO'
}

export interface ComparisonRow {
    key: string;          // The join key
    leftValue?: number;   // EOD Amount
    rightValue?: number;  // Report Amount
    diff: number;         // rightValue - leftValue
    tsIds?: string;       
    status: 'MATCH' | 'MISSING_LEFT' | 'MISSING_RIGHT' | 'DIFF';
}

export interface PlatformResult {
    platform: Platform;
    shipment: {
        status: 'OK' | 'WARNING' | 'ERROR';
        unmatchedCount: number;
        diffCount: number;
        details: ComparisonRow[];
        sourceCounts?: { eod: number; report: number }; // 新增統計
    };
    return: {
        status: 'OK' | 'WARNING' | 'ERROR';
        unmatchedCount: number;
        diffCount: number;
        details: ComparisonRow[];
        sourceCounts?: { eod: number; report: number }; // 新增統計
    };
    processedAt: string;
}

export interface EODRow {
    id: string;
    amount: number;
    platform: Platform;
}

export interface ReportRow {
    id: string;
    amount: number;
    platform: Platform;
    tsIds?: string;
}