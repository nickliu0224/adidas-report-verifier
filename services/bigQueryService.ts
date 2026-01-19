import { PlatformResult, Platform, ComparisonRow } from '../types';

const PROJECT_ID = 'eis-prod';
const DATASET_ID = 'tw';
const TARGET_PLATFORMS = [Platform.BRAND_SITE, Platform.SHOPEE, Platform.MOMO, Platform.YAHOO];

const runBigQueryQuery = async (sql: string, accessToken: string) => {
  console.log("%c[BigQuery SQL]", "color: #2563eb; font-weight: bold;", sql);
  
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
      timeoutMs: 60000 
    })
  });

  if (!response.ok) {
    const err = await response.json();
    console.error("[BigQuery API Error]", err);
    throw new Error(err.error?.message || 'BigQuery Request Failed');
  }

  const data = await response.json();
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

const runComparison = (
  leftData: any[], 
  rightData: any[], 
  key: string, 
  leftCol: string, 
  rightCol: string, 
  tsCol: string | null = null
): { status: 'OK'|'WARNING'|'ERROR', unmatchedCount: number, diffCount: number, details: ComparisonRow[], sourceCounts: {eod: number, report: number} } => {
  
  const map = new Map<string, any>();

  leftData.forEach(row => {
    const k = String(row[key]);
    if (!map.has(k)) map.set(k, { key: k });
    const item = map.get(k);
    item.leftValue = parseFloat(row[leftCol] || '0');
  });

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
    const diff = Math.round(rightVal - leftVal);

    let status: ComparisonRow['status'] = 'MATCH';

    if (leftVal !== 0 && rightVal === 0) {
        status = 'MISSING_RIGHT';
    } else if (leftVal === 0 && rightVal !== 0) {
        status = 'MISSING_LEFT';
    } else if (leftVal !== 0 && rightVal !== 0 && Math.abs(diff) > 5) { // 同步 Python: abs > 5
        status = 'DIFF';
    }

    if (status !== 'MATCH') {
      details.push({
        key: k,
        leftValue: Math.round(leftVal),
        rightValue: Math.round(rightVal),
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
  if (unmatchedCount > 5 || diffCount > 5) overallStatus = 'ERROR';

  return {
    status: overallStatus,
    unmatchedCount,
    diffCount,
    details,
    sourceCounts: { eod: leftData.length, report: rightData.length }
  };
};

export const runReconciliation = async (
    date: string, 
    accessToken: string, 
    onProgress?: (platform: string, step: number, total: number) => void
): Promise<PlatformResult[]> => {
  const targetDate = new Date(date);
  const nextDate = new Date(targetDate);
  nextDate.setDate(targetDate.getDate() + 1);
  const nextDayStr = nextDate.toISOString().split('T')[0];

  const results: PlatformResult[] = [];

  for (let i = 0; i < TARGET_PLATFORMS.length; i++) {
    const platform = TARGET_PLATFORMS[i];
    if (onProgress) onProgress(platform, i + 1, TARGET_PLATFORMS.length);

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
    } else { // BRAND_SITE (品牌官網)
        id_expr = "ShipData.TgOrderCode";
        eod_id_expr = "SalesOrderCode";
        ship_join = `(ShipData.Platform = '品牌官網' AND ShipData.TotalPayment = EODData.Qty * EODData.RRP - EODData.DiscountPrice)`;
    }

    // --- 出貨 SQL (同步 Python main() 中的語法) ---
    const ship_sales_sql = `
    WITH ShipData_Agg AS (
        SELECT ShopId, Platform, SalesOrderCode, TgOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
               SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
        FROM \`${PROJECT_ID}.${DATASET_ID}.ShipData_ht\`
        WHERE ShopId = 41571 AND Platform = '${platform}'
            AND EXTRACT(DATE FROM ShippingDatetime) = DATE('${date}')
            AND SalesOrderStatus = '已出貨' AND TotalPayment != 0 
        GROUP BY 1,2,3,4,5,6,7,8
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

    // --- 退貨 SQL (同步 Python main() 中的語法) ---
    const ret_join = platform !== Platform.BRAND_SITE 
        ? ship_join 
        : `(ShipData.Platform = '品牌官網' AND (ShipData.TransactionCode = REPLACE(IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode), 'R', '') OR ShipData.TransactionCode = IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode)) AND ABS(ShipData.TotalPayment - (EODData.Qty * EODData.RRP + EODData.DiscountPrice)) < 1)`;
    
    const ret_sales_sql = `
    WITH ShipData_Ret AS (
        SELECT ShopId, Platform, SalesOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
               SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
        FROM \`${PROJECT_ID}.${DATASET_ID}.ShipData_ht\`
        WHERE ShopId = 41571 AND Platform = '${platform}'
            AND EXTRACT(DATE FROM ReturnStatusUpdatedDateTime) = DATE('${date}')
            AND SalesOrderStatus IN ('退貨結案', '出貨失敗結案') AND TotalPayment != 0 
        GROUP BY 1,2,3,4,5,6,7
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

    // --- EOD 基礎 SQL ---
    const ship_eod_sql = `SELECT ${eod_id_expr} AS TG_ID, CAST(ROUND(SUM(Qty * RRP - DiscountPrice) / 1.05) AS INT64) AS EOD_Amount FROM \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` WHERE BQUpdatedDateTime >= TIMESTAMP('${date}') AND BQUpdatedDateTime < TIMESTAMP('${nextDayStr}') AND Platform = '${platform}' AND Qty > 0 GROUP BY 1`;
    const ret_eod_sql = `SELECT ${platform !== Platform.BRAND_SITE ? eod_id_expr : 'SalesOrderCode'} AS TS_ID, CAST(ROUND(SUM(Qty * RRP + DiscountPrice) / 1.05) AS INT64) AS EOD_RetAmount FROM \`${PROJECT_ID}.${DATASET_ID}.Adidas_EOD_Data_ht\` WHERE BQUpdatedDateTime >= TIMESTAMP('${date}') AND BQUpdatedDateTime < TIMESTAMP('${nextDayStr}') AND Platform = '${platform}' AND Qty < 0 GROUP BY 1`;

    try {
        const [shipSales, shipEod, retSales, retEod] = await Promise.all([
            runBigQueryQuery(ship_sales_sql, accessToken),
            runBigQueryQuery(ship_eod_sql, accessToken),
            runBigQueryQuery(ret_sales_sql, accessToken),
            runBigQueryQuery(ret_eod_sql, accessToken)
        ]);

        results.push({
            platform: platform as Platform,
            shipment: runComparison(shipEod, shipSales, 'TG_ID', 'EOD_Amount', 'OrderAmount', 'TS_IDs'),
            return: runComparison(retEod, retSales, 'TS_ID', 'EOD_RetAmount', 'RetAmount'),
            processedAt: new Date().toISOString()
        });
    } catch (e: any) {
        console.error(`Error processing ${platform}:`, e);
        results.push({
            platform: platform as Platform,
            shipment: { status: 'ERROR', unmatchedCount: 0, diffCount: 0, details: [], sourceCounts: {eod: 0, report: 0} },
            return: { status: 'ERROR', unmatchedCount: 0, diffCount: 0, details: [], sourceCounts: {eod: 0, report: 0} },
            processedAt: new Date().toISOString()
        });
    }
  }
  return results;
};