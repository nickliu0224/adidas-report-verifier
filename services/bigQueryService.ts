import { PlatformResult, Platform, ComparisonRow } from '../types';

// ==========================================
// ⚙️ 設定區
// ==========================================
const PROJECT_ID = 'eis-prod';
const DATASET_ID = 'tw';
const TARGET_PLATFORMS = [Platform.BRAND_SITE, Platform.SHOPEE, Platform.MOMO, Platform.YAHOO];

// 透過 BigQuery REST API 執行 SQL
const runBigQueryQuery = async (sql: string, accessToken: string) => {
  const url = `https://bigquery.googleapis.com/bigquery/v2/projects/${PROJECT_ID}/queries`;
  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${accessToken}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      query: sql,
      useLegacySql: false,
      timeoutMs: 30000 
    })
  });

  if (!response.ok) {
    const err = await response.json();
    throw new Error(err.error?.message || 'BigQuery Request Failed');
  }

  const data = await response.json();
  
  // BigQuery returns rows as values in a schema-less structure initially or strict structure
  // We need to parse schema and rows to a friendly object array
  if (!data.rows) return [];

  const schema = data.schema.fields;
  return data.rows.map((row: any) => {
    const obj: any = {};
    schema.forEach((field: any, index: number) => {
      obj[field.name] = row.f[index].v;
    });
    return obj;
  });
};

// 模擬 Python 的 pandas merge 和比對邏輯
const runComparison = (
  leftData: any[], 
  rightData: any[], 
  key: string, 
  leftCol: string, 
  rightCol: string, 
  tsCol: string | null = null
): { status: 'OK'|'WARNING'|'ERROR', unmatchedCount: number, diffCount: number, details: ComparisonRow[] } => {
  
  // 建立 Map 以進行 Outer Merge
  const map = new Map<string, any>();

  // 處理 Left Data (EOD)
  leftData.forEach(row => {
    const k = String(row[key]);
    if (!map.has(k)) map.set(k, { key: k });
    const item = map.get(k);
    item.leftValue = parseFloat(row[leftCol] || '0');
    // EOD Data might store TS ID info if needed, but usually it's in Report or we join
  });

  // 處理 Right Data (Report)
  rightData.forEach(row => {
    const k = String(row[key]);
    if (!map.has(k)) map.set(k, { key: k });
    const item = map.get(k);
    item.rightValue = parseFloat(row[rightCol] || '0');
    if (tsCol && row[tsCol]) {
        item.tsIds = row[tsCol];
    }
  });

  const details: ComparisonRow[] = [];

  map.forEach((value, k) => {
    const leftVal = value.leftValue || 0;
    const rightVal = value.rightValue || 0;
    const diff = rightVal - leftVal;

    let status: ComparisonRow['status'] = 'MATCH';

    // 邏輯: 
    // missing in report (Has EOD, No Report) -> MISSING_RIGHT
    // missing in EOD (No EOD, Has Report) -> MISSING_LEFT
    
    if (leftVal !== 0 && rightVal === 0) {
        status = 'MISSING_RIGHT';
    } else if (leftVal === 0 && rightVal !== 0) {
        status = 'MISSING_LEFT';
    } else if (leftVal !== 0 && rightVal !== 0 && Math.abs(diff) > 5) {
        status = 'DIFF';
    }

    if (status !== 'MATCH') {
      details.push({
        key: k,
        leftValue: leftVal,
        rightValue: rightVal,
        diff: diff,
        status: status,
        tsIds: value.tsIds
      });
    }
  });

  const unmatchedCount = details.filter(d => d.status.includes('MISSING')).length;
  const diffCount = details.filter(d => d.status === 'DIFF').length;

  let overallStatus: 'OK'|'WARNING'|'ERROR' = 'OK';
  if (unmatchedCount > 0 || diffCount > 0) overallStatus = 'WARNING';
  if (unmatchedCount > 10 || diffCount > 10) overallStatus = 'ERROR';

  return {
    status: overallStatus,
    unmatchedCount,
    diffCount,
    details
  };
};

export const runReconciliation = async (date: string, accessToken: string): Promise<PlatformResult[]> => {
  // Calculate next day for SQL
  const targetDate = new Date(date);
  const nextDate = new Date(targetDate);
  nextDate.setDate(targetDate.getDate() + 1);
  const nextDayStr = nextDate.toISOString().split('T')[0]; // YYYY-MM-DD

  const results: PlatformResult[] = [];

  for (const platform of TARGET_PLATFORMS) {
    // --- SQL Construction (Ported from Python) ---
    let id_expr = "", eod_id_expr = "", ship_join = "";
    
    if (platform === Platform.YAHOO) {
        id_expr = "LEFT(ShipData.SalesOrderCode, 15)";
        eod_id_expr = "LEFT(SalesOrderCode, 15)";
        ship_join = `(ShipData.Platform = 'YAHOO' AND LEFT(ShipData.SalesOrderCode, 15) = LEFT(EODData.SalesOrderCode, 15))`;
    } else if (platform === Platform.MOMO) {
        id_expr = "LEFT(ShipData.SalesOrderCode, 18)";
        eod_id_expr = "LEFT(SalesOrderCode, 18)";
        ship_join = `(ShipData.Platform = 'MOMO' AND LEFT(ShipData.SalesOrderCode, 18) = LEFT(EODData.SalesOrderCode, 18))`;
    } else if (platform === Platform.SHOPEE) {
        id_expr = "ShipData.SalesOrderCode";
        eod_id_expr = "SalesOrderCode";
        ship_join = `(ShipData.Platform = 'SHOPEE' AND ShipData.SalesOrderCode = EODData.SalesOrderCode)`;
    } else { // BRAND_SITE
        id_expr = "ShipData.TgOrderCode";
        eod_id_expr = "SalesOrderCode";
        ship_join = `(ShipData.Platform = '品牌官網' AND ShipData.TotalPayment = EODData.Qty * EODData.RRP - EODData.DiscountPrice)`;
    }

    // 1. Ship SQL
    const ship_sales_sql = `
    WITH ShipData_Agg AS (
        SELECT ShopId, Platform, SalesOrderCode, TgOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
               SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
        FROM \`${PROJECT_ID}.${DATASET_ID}.ShipData_ht\`
        WHERE ShopId = 41571 AND Platform = '${platform}'
            AND EXTRACT(DATE FROM ShippingDatetime) = DATE('${date}')
            AND SalesOrderStatus = '已出貨' AND TotalPayment != 0 GROUP BY 1,2,3,4,5,6,7,8
    )
    SELECT ${id_expr} AS TG_ID, STRING_AGG(DISTINCT ShipData.SalesOrderCode, ', ') AS TS_IDs,
        CAST(ROUND(SUM(CASE WHEN CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) < 0
            THEN CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) * -1
            ELSE CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) END) / 1.05) AS INT64) AS OrderAmount
    FROM ShipData_Agg AS ShipData
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` AS EODData
    ON ShipData.SkuId = CONCAT(EODData.ArticleNo, EODData.SizeIndex) AND ShipData.Platform = EODData.Platform
       AND EODData.Qty > 0 AND EODData.BQUpdatedDateTime >= TIMESTAMP('${date}') AND EODData.BQUpdatedDateTime < TIMESTAMP('${nextDayStr}')
       AND ${ship_join}
    AND ShipData.TransactionCode = IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode)
    GROUP BY 1
    `;

    // 2. Return SQL
    let ret_join = ship_join;
    if (platform === Platform.BRAND_SITE) {
        ret_join = `(ShipData.Platform = '品牌官網' AND (ShipData.TransactionCode = REPLACE(IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode), 'R', '') OR ShipData.TransactionCode = IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode)) AND ABS(ShipData.TotalPayment - (EODData.Qty * EODData.RRP + EODData.DiscountPrice)) < 1)`;
    }

    const ret_sales_sql = `
    WITH ShipData_Ret AS (
        SELECT ShopId, Platform, SalesOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
               SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
        FROM \`${PROJECT_ID}.${DATASET_ID}.ShipData_ht\`
        WHERE ShopId = 41571 AND Platform = '${platform}'
            AND EXTRACT(DATE FROM ReturnStatusUpdatedDateTime) = DATE('${date}')
            AND SalesOrderStatus IN ('退貨結案', '出貨失敗結案') AND TotalPayment != 0 GROUP BY 1,2,3,4,5,6,7
    )
    SELECT ${platform !== Platform.BRAND_SITE ? id_expr : 'ShipData.SalesOrderCode'} AS TS_ID,
        CAST(ROUND(SUM(EODData.Qty * EODData.RRP + EODData.DiscountPrice) / 1.05) AS INT64) AS RetAmount
    FROM ShipData_Ret AS ShipData
    LEFT JOIN \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` AS EODData
    ON ShipData.SkuId = CONCAT(EODData.ArticleNo, EODData.SizeIndex) AND ShipData.Platform = EODData.Platform
       AND EODData.Qty < 0 AND EODData.BQUpdatedDateTime >= TIMESTAMP('${date}') AND EODData.BQUpdatedDateTime < TIMESTAMP('${nextDayStr}')
       AND ${ret_join}
    GROUP BY 1
    `;

    // 3. EOD SQLs
    const ship_eod_sql = `SELECT ${eod_id_expr} AS TG_ID, CAST(ROUND(SUM(Qty * RRP - DiscountPrice) / 1.05) AS INT64) AS EOD_Amount FROM \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` WHERE BQUpdatedDateTime >= TIMESTAMP('${date}') AND BQUpdatedDateTime < TIMESTAMP('${nextDayStr}') AND Platform = '${platform}' AND Qty > 0 GROUP BY 1`;
    
    const ret_eod_sql = `SELECT ${platform !== Platform.BRAND_SITE ? eod_id_expr : 'SalesOrderCode'} AS TS_ID, CAST(ROUND(SUM(Qty * RRP + DiscountPrice) / 1.05) AS INT64) AS EOD_RetAmount FROM \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` WHERE BQUpdatedDateTime >= TIMESTAMP('${date}') AND BQUpdatedDateTime < TIMESTAMP('${nextDayStr}') AND Platform = '${platform}' AND Qty < 0 GROUP BY 1`;

    try {
        // Execute Queries in Parallel to save time
        const [shipSales, shipEod, retSales, retEod] = await Promise.all([
            runBigQueryQuery(ship_sales_sql, accessToken),
            runBigQueryQuery(ship_eod_sql, accessToken),
            runBigQueryQuery(ret_sales_sql, accessToken),
            runBigQueryQuery(ret_eod_sql, accessToken)
        ]);

        const shipRes = runComparison(shipEod, shipSales, 'TG_ID', 'EOD_Amount', 'OrderAmount', 'TS_IDs');
        const retRes = runComparison(retEod, retSales, 'TS_ID', 'EOD_RetAmount', 'RetAmount');

        results.push({
            platform: platform as Platform,
            shipment: shipRes,
            return: retRes,
            processedAt: new Date().toISOString()
        });

    } catch (e) {
        console.error(`Error processing ${platform}:`, e);
        // Add error result
        results.push({
            platform: platform as Platform,
            shipment: { status: 'ERROR', unmatchedCount: 0, diffCount: 0, details: [] },
            return: { status: 'ERROR', unmatchedCount: 0, diffCount: 0, details: [] },
            processedAt: new Date().toISOString()
        });
    }
  }

  return results;
};