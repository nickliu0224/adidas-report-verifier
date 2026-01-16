export enum Platform {
    BRAND_SITE = '品牌官網',
    SHOPEE = 'SHOPEE',
    MOMO = 'MOMO',
    YAHOO = 'YAHOO'
}

export interface ComparisonRow {
    key: string;          // The join key (TG Code for Brand Ship, TS Code for Brand Return, OrderCode for others)
    leftValue?: number;   // EOD Amount (Qty * RRP - Discount)
    rightValue?: number;  // Report Amount (TotalPayment)
    diff: number;         // rightValue - leftValue
    tsIds?: string;       // For Brand Site Shipment: List of TS IDs
    status: 'MATCH' | 'MISSING_LEFT' | 'MISSING_RIGHT' | 'DIFF';
}

export interface PlatformResult {
    platform: Platform;
    shipment: {
        status: 'OK' | 'WARNING' | 'ERROR';
        unmatchedCount: number;
        diffCount: number;
        details: ComparisonRow[];
    };
    return: {
        status: 'OK' | 'WARNING' | 'ERROR';
        unmatchedCount: number;
        diffCount: number;
        details: ComparisonRow[];
    };
    processedAt: string;
}

// Data structures for the Mock Service simulation
export interface EODRow {
    id: string; // TG_ID or SalesOrderCode
    amount: number;
    platform: Platform;
}

export interface ReportRow {
    id: string; // TG_ID or SalesOrderCode
    amount: number;
    platform: Platform;
    tsIds?: string; // Only for Brand Site Shipment
}