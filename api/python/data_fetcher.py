#!/usr/bin/env python3
"""
数据获取服务 - Python 端
使用 akshare 获取 A 股数据，使用 yfinance 获取美股数据
接收命令行参数，输出 JSON 到 stdout
"""

import sys
import json
import argparse
from datetime import datetime


def fetch_history_data(tickers, start_date, end_date):
    """获取历史行情数据"""
    result = {}

    for ticker in tickers:
        try:
            data = fetch_single_ticker(ticker, start_date, end_date)
            if data:
                result[ticker] = data
        except Exception as e:
            print(f"Warning: Failed to fetch {ticker}: {e}", file=sys.stderr)
            continue

    return result


def fetch_single_ticker(ticker, start_date, end_date):
    """获取单个资产的历史数据"""
    # 判断是 A 股还是美股
    if ticker.endswith('.SZ') or ticker.endswith('.SH'):
        return fetch_a_stock(ticker, start_date, end_date)
    else:
        return fetch_us_stock(ticker, start_date, end_date)


def fetch_a_stock(ticker, start_date, end_date):
    """使用 akshare 获取 A 股数据"""
    try:
        import akshare as ak

        # 转换代码格式: 000001.SZ -> 000001
        code = ticker.split('.')[0]

        # 判断沪市还是深市
        if ticker.endswith('.SH'):
            symbol = f"sh{code}"
        else:
            symbol = f"sz{code}"

        df = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start_date.replace('-', ''),
            end_date=end_date.replace('-', ''),
            adjust=""  # 不复权，返回原始收盘价
        )

        if df.empty:
            return None

        # 转换为 { date: close } 格式
        prices = {}
        for _, row in df.iterrows():
            date_str = str(row['日期']) if '日期' in df.columns else str(row['date'])
            close = float(row['收盘']) if '收盘' in df.columns else float(row['close'])
            prices[date_str] = close

        return prices

    except ImportError:
        print("akshare not installed, skipping A stock fetch", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error fetching A stock {ticker}: {e}", file=sys.stderr)
        return None


def fetch_us_stock(ticker, start_date, end_date):
    """使用 yfinance 获取美股数据"""
    try:
        import yfinance as yf

        stock = yf.Ticker(ticker)
        df = stock.history(start=start_date, end=end_date, auto_adjust=False)

        if df.empty:
            return None

        prices = {}
        for date_idx, row in df.iterrows():
            date_str = date_idx.strftime('%Y-%m-%d')
            # 使用 Close（原始收盘价），与 dataService.ts loadFromBatchCache 一致
            prices[date_str] = round(float(row['Close']), 2)

        return prices

    except ImportError:
        print("yfinance not installed, skipping US stock fetch", file=sys.stderr)
        return None
    except Exception as e:
        print(f"Error fetching US stock {ticker}: {e}", file=sys.stderr)
        return None


def search_tickers(query, market=None):
    """搜索资产代码"""
    results = []

    try:
        if market in (None, 'A股', 'A', 'cn', 'CN'):
            results.extend(search_a_stocks(query))
    except Exception as e:
        print(f"Warning: A stock search failed: {e}", file=sys.stderr)

    try:
        if market in (None, '美股', 'US', 'us'):
            results.extend(search_us_stocks(query))
    except Exception as e:
        print(f"Warning: US stock search failed: {e}", file=sys.stderr)

    return results


def search_a_stocks(query):
    """搜索 A 股"""
    try:
        import akshare as ak

        df = ak.stock_zh_a_spot_em()
        matches = df[df['名称'].str.contains(query, na=False) | df['代码'].str.contains(query, na=False)]

        results = []
        for _, row in matches.head(10).iterrows():
            code = str(row['代码'])
            if code.startswith('6'):
                ticker = f"{code}.SH"
            else:
                ticker = f"{code}.SZ"
            results.append({
                'ticker': ticker,
                'name': str(row['名称']),
                'market': 'A股'
            })

        return results

    except ImportError:
        return []
    except Exception:
        return []


def search_us_stocks(query):
    """搜索美股"""
    # yfinance 没有搜索 API，返回常见美股匹配
    common_stocks = [
        {'ticker': 'SPY', 'name': 'S&P 500 ETF', 'market': '美股'},
        {'ticker': 'VTI', 'name': 'Vanguard Total Stock Market ETF', 'market': '美股'},
        {'ticker': 'QQQ', 'name': 'Invesco QQQ Trust', 'market': '美股'},
        {'ticker': 'BND', 'name': 'Vanguard Total Bond Market ETF', 'market': '美股'},
        {'ticker': 'VOO', 'name': 'Vanguard S&P 500 ETF', 'market': '美股'},
        {'ticker': 'AAPL', 'name': 'Apple Inc.', 'market': '美股'},
        {'ticker': 'MSFT', 'name': 'Microsoft Corporation', 'market': '美股'},
        {'ticker': 'GOOGL', 'name': 'Alphabet Inc.', 'market': '美股'},
        {'ticker': 'AMZN', 'name': 'Amazon.com Inc.', 'market': '美股'},
        {'ticker': 'TSLA', 'name': 'Tesla Inc.', 'market': '美股'},
    ]

    q = query.lower()
    return [s for s in common_stocks if q in s['ticker'].lower() or q in s['name'].lower()]


def main():
    parser = argparse.ArgumentParser(description='Data fetcher for backtest platform')
    parser.add_argument('action', choices=['fetch', 'search'], help='Action to perform')
    parser.add_argument('--tickers', type=str, help='Comma-separated ticker list')
    parser.add_argument('--start', type=str, help='Start date (YYYY-MM-DD)')
    parser.add_argument('--end', type=str, help='End date (YYYY-MM-DD)')
    parser.add_argument('--query', type=str, help='Search query')
    parser.add_argument('--market', type=str, help='Market filter')

    args = parser.parse_args()

    try:
        if args.action == 'fetch':
            if not args.tickers or not args.start or not args.end:
                print("Error: --tickers, --start, --end required for fetch", file=sys.stderr)
                sys.exit(1)

            tickers = [t.strip() for t in args.tickers.split(',')]
            data = fetch_history_data(tickers, args.start, args.end)
            print(json.dumps(data))

        elif args.action == 'search':
            if not args.query:
                print("Error: --query required for search", file=sys.stderr)
                sys.exit(1)

            results = search_tickers(args.query, args.market)
            print(json.dumps(results))

    except Exception as e:
        print(f"Error: {e}", file=sys.stderr)
        sys.exit(1)


if __name__ == '__main__':
    main()
