from flask import Flask, request, jsonify
from flask_cors import CORS
from google.cloud import bigquery
import pandas as pd
import os
from datetime import datetime, timedelta

app = Flask(__name__)
CORS(app)  # Allow frontend to call this API

# Configuration
PROJECT_ID = os.environ.get('PROJECT_ID', 'eis-prod')
DATASET_ID = os.environ.get('DATASET_ID', 'tw')
TARGET_PLATFORMS = ['品牌官網', 'SHOPEE', 'MOMO', 'YAHOO']

def process_comparison(df_left, df_right, key, left_col, right_col, label, platform, ts_col=None):
    """
    Transforms the pandas comparison logic into the JSON format required by the frontend.
    """
    comparison = pd.merge(df_left, df_right, on=key, how='outer')
    
    # Fill NaN for calculation safety
    comparison[left_col] = comparison[left_col].fillna(0)
    comparison[right_col] = comparison[right_col].fillna(0)
    
    details = []
    
    for _, row in comparison.iterrows():
        left_val = row[left_col] # EOD
        right_val = row[right_col] # Report
        row_key = str(row[key])
        ts_ids = str(row[ts_col]) if ts_col and pd.notna(row[ts_col]) else None
        
        status = "MATCH"
        diff = right_val - left_val
        
        # Logic matching original script
        is_missing_in_report = (left_val != 0) and (right_val == 0) # Has EOD, No Report
        is_missing_in_eod = (left_val == 0) and (right_val != 0)    # No EOD, Has Report
        is_diff = (left_val != 0) and (right_val != 0) and abs(diff) > 5

        if is_missing_in_report:
            status = "MISSING_RIGHT" # Missing in Report (Right side)
        elif is_missing_in_eod:
            status = "MISSING_LEFT"  # Missing in EOD (Left side is EOD in frontend logic)
        elif is_diff:
            status = "DIFF"

        if status != "MATCH":
            details.append({
                "key": row_key,
                "leftValue": int(left_val),
                "rightValue": int(right_val),
                "diff": int(diff),
                "status": status,
                "tsIds": ts_ids
            })

    unmatched_count = len([d for d in details if "MISSING" in d['status']])
    diff_count = len([d for d in details if d['status'] == "DIFF"])
    
    overall_status = "OK"
    if unmatched_count > 0 or diff_count > 0:
        overall_status = "WARNING"
    if unmatched_count > 10 or diff_count > 10:
        overall_status = "ERROR"

    return {
        "status": overall_status,
        "unmatchedCount": unmatched_count,
        "diffCount": diff_count,
        "details": details
    }

@app.route('/api/reconcile', methods=['GET'])
def reconcile():
    target_date = request.args.get('date')
    if not target_date:
        return jsonify({"error": "Date parameter is required"}), 400

    try:
        # Initialize BQ Client
        client = bigquery.Client(project=PROJECT_ID)
        
        target_dt = datetime.strptime(target_date, "%Y-%m-%d")
        next_day = (target_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        
        results = []

        for platform in TARGET_PLATFORMS:
            # --- SQL Construction ---
            if platform == 'YAHOO':
                id_expr, eod_id_expr = "LEFT(ShipData.SalesOrderCode, 15)", "LEFT(SalesOrderCode, 15)"
                ship_join = f"(ShipData.Platform = 'YAHOO' AND LEFT(ShipData.SalesOrderCode, 15) = LEFT(EODData.SalesOrderCode, 15))"
            elif platform == 'MOMO':
                id_expr, eod_id_expr = "LEFT(ShipData.SalesOrderCode, 18)", "LEFT(SalesOrderCode, 18)"
                ship_join = f"(ShipData.Platform = 'MOMO' AND LEFT(ShipData.SalesOrderCode, 18) = LEFT(EODData.SalesOrderCode, 18))"
            elif platform == 'SHOPEE':
                id_expr, eod_id_expr = "ShipData.SalesOrderCode", "SalesOrderCode"
                ship_join = f"(ShipData.Platform = 'SHOPEE' AND ShipData.SalesOrderCode = EODData.SalesOrderCode)"
            else: # 品牌官網
                id_expr, eod_id_expr = "ShipData.TgOrderCode", "SalesOrderCode"
                ship_join = f"(ShipData.Platform = '品牌官網' AND ShipData.TotalPayment = EODData.Qty * EODData.RRP - EODData.DiscountPrice)"

            # 1. Ship SQL
            ship_sales_sql = f"""
            WITH ShipData_Agg AS (
                SELECT ShopId, Platform, SalesOrderCode, TgOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
                       SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
                FROM `{PROJECT_ID}.{DATASET_ID}.ShipData_ht`
                WHERE ShopId = 41571 AND Platform = '{platform}'
                    AND EXTRACT(DATE FROM ShippingDatetime) = DATE('{target_date}')
                    AND SalesOrderStatus = '已出貨' AND TotalPayment != 0 GROUP BY 1,2,3,4,5,6,7,8
            )
            SELECT {id_expr} AS TG_ID, STRING_AGG(DISTINCT ShipData.SalesOrderCode, ', ') AS TS_IDs,
                CAST(ROUND(SUM(CASE WHEN CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) < 0
                    THEN CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) * -1
                    ELSE CAST((EODData.Qty * EODData.RRP - EODData.DiscountPrice) AS INT64) END) / 1.05) AS INT64) AS OrderAmount
            FROM ShipData_Agg AS ShipData
            LEFT JOIN `{PROJECT_ID}.{DATASET_ID}.Adidas_EOD_Data_ht` AS EODData
            ON ShipData.SkuId = CONCAT(EODData.ArticleNo, EODData.SizeIndex) AND ShipData.Platform = EODData.Platform
               AND EODData.Qty > 0 AND EODData.BQUpdatedDateTime >= TIMESTAMP('{target_date}') AND EODData.BQUpdatedDateTime < TIMESTAMP('{next_day}')
               AND {ship_join}
            AND ShipData.TransactionCode = IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode)
            GROUP BY 1
            """

            # 2. Return SQL
            ret_join = ship_join if platform != '品牌官網' else f"(ShipData.Platform = '品牌官網' AND (ShipData.TransactionCode = REPLACE(IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode), 'R', '') OR ShipData.TransactionCode = IF(INSTR(EODData.TransactionCode, '-') > 0, SPLIT(EODData.TransactionCode, '-')[OFFSET(0)], EODData.TransactionCode)) AND ABS(ShipData.TotalPayment - (EODData.Qty * EODData.RRP + EODData.DiscountPrice)) < 1)"
            ret_sales_sql = f"""
            WITH ShipData_Ret AS (
                SELECT ShopId, Platform, SalesOrderCode, TransactionCode, SkuId, ShippingDateTime, OrderCode,
                       SUM(TotalPayment) as TotalPayment, SUM(Qty) as Qty 
                FROM `{PROJECT_ID}.{DATASET_ID}.ShipData_ht`
                WHERE ShopId = 41571 AND Platform = '{platform}'
                    AND EXTRACT(DATE FROM ReturnStatusUpdatedDateTime) = DATE('{target_date}')
                    AND SalesOrderStatus IN ('退貨結案', '出貨失敗結案') AND TotalPayment != 0 GROUP BY 1,2,3,4,5,6,7
            )
            SELECT {id_expr if platform != '品牌官網' else 'ShipData.SalesOrderCode'} AS TS_ID,
                CAST(ROUND(SUM(EODData.Qty * EODData.RRP + EODData.DiscountPrice) / 1.05) AS INT64) AS RetAmount
            FROM ShipData_Ret AS ShipData
            LEFT JOIN `{PROJECT_ID}.{DATASET_ID}.Adidas_EOD_Data_ht` AS EODData
            ON ShipData.SkuId = CONCAT(EODData.ArticleNo, EODData.SizeIndex) AND ShipData.Platform = EODData.Platform
               AND EODData.Qty < 0 AND EODData.BQUpdatedDateTime >= TIMESTAMP('{target_date}') AND EODData.BQUpdatedDateTime < TIMESTAMP('{next_day}')
               AND {ret_join}
            GROUP BY 1
            """

            # 3. EOD Validation Queries
            ship_eod_sql = f"SELECT {eod_id_expr} AS TG_ID, CAST(ROUND(SUM(Qty * RRP - DiscountPrice) / 1.05) AS INT64) AS EOD_Amount FROM `{PROJECT_ID}.{DATASET_ID}.Adidas_EOD_Data_ht` WHERE BQUpdatedDateTime >= TIMESTAMP('{target_date}') AND BQUpdatedDateTime < TIMESTAMP('{next_day}') AND Platform = '{platform}' AND Qty > 0 GROUP BY 1"
            ret_eod_sql = f"SELECT {eod_id_expr if platform != '品牌官網' else 'SalesOrderCode'} AS TS_ID, CAST(ROUND(SUM(Qty * RRP + DiscountPrice) / 1.05) AS INT64) AS EOD_RetAmount FROM `{PROJECT_ID}.{DATASET_ID}.Adidas_EOD_Data_ht` WHERE BQUpdatedDateTime >= TIMESTAMP('{target_date}') AND BQUpdatedDateTime < TIMESTAMP('{next_day}') AND Platform = '{platform}' AND Qty < 0 GROUP BY 1"

            # Execute Queries
            df_ship_eod = client.query(ship_eod_sql).to_dataframe()
            df_ship_sales = client.query(ship_sales_sql).to_dataframe()
            ship_res = process_comparison(df_ship_eod, df_ship_sales, 'TG_ID', 'EOD_Amount', 'OrderAmount', '出貨', platform, ts_col='TS_IDs')

            df_ret_eod = client.query(ret_eod_sql).to_dataframe()
            df_ret_sales = client.query(ret_sales_sql).to_dataframe()
            ret_res = process_comparison(df_ret_eod, df_ret_sales, 'TS_ID', 'EOD_RetAmount', 'RetAmount', '退貨', platform)
            
            results.append({
                "platform": platform,
                "shipment": ship_res,
                "return": ret_res,
                "processedAt": datetime.now().isoformat()
            })

        return jsonify(results)

    except Exception as e:
        print(f"Error: {str(e)}")
        return jsonify({"error": str(e)}), 500

if __name__ == '__main__':
    # Use PORT env var for Cloud Run, default to 5000 locally
    port = int(os.environ.get('PORT', 5000))
    app.run(host='0.0.0.0', port=port)
