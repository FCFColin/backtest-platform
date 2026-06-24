#!/usr/bin/env python3
"""
批量数据引擎 - 每日更新大量股票/ETF数据
覆盖：美股ETF、美股热门股票、A股主要指数ETF、A股热门股票
使用 yfinance 获取美股数据，akshare 获取A股数据
数据存储为JSON文件，按日期分目录
"""

import sys
import json
import os
import time
from datetime import datetime, timedelta
from pathlib import Path

# 数据存储目录
DATA_DIR = Path(__file__).parent.parent.parent / 'data' / 'market'

# ============================================================
# 标的列表 - 覆盖主流ETF和股票
# ============================================================

# 美股ETF - 宽基指数
US_ETF_BROAD = [
    'SPY',   # S&P 500
    'VOO',   # Vanguard S&P 500
    'IVV',   # iShares Core S&P 500
    'VTI',   # Vanguard Total Stock Market
    'ITOT',  # iShares Core S&P Total Market
    'QQQ',   # Nasdaq 100
    'ONEQ',  # Fidelity Nasdaq Composite
    'DIA',   # Dow Jones
    'IWM',   # Russell 2000
    'VT',    # Vanguard Total World Stock
    'VXUS',  # Vanguard Total International Stock
    'BND',   # Vanguard Total Bond Market
    'AGG',   # iShares Core US Aggregate Bond
    'TLT',   # 20+ Year Treasury Bond
    'IEF',   # 7-10 Year Treasury Bond
    'SHV',   # Short Treasury Bond
    'TIP',   # TIPS
    'LQD',   # Investment Grade Corporate Bond
    'HYG',   # High Yield Corporate Bond
    'EMB',   # Emerging Market Bond
    'GLD',   # Gold
    'SLV',   # Silver
    'DBC',   # Commodities
    'USO',   # Crude Oil
    'VNQ',   # Vanguard Real Estate
    'IYR',   # iShares US Real Estate
]

# 美股ETF - 行业/因子
US_ETF_SECTOR = [
    'XLF',   # Financials
    'XLK',   # Technology
    'XLV',   # Health Care
    'XLE',   # Energy
    'XLY',   # Consumer Discretionary
    'XLP',   # Consumer Staples
    'XLI',   # Industrials
    'XLB',   # Materials
    'XLU',   # Utilities
    'XLC',   # Communication Services
    'VGT',   # Vanguard Info Tech
    'VHT',   # Vanguard Health Care
    'VFH',   # Vanguard Financials
    'VDE',   # Vanguard Energy
    'VDC',   # Vanguard Consumer Staples
    'VCR',   # Vanguard Consumer Discretionary
    'VIS',   # Vanguard Industrials
    'VAW',   # Vanguard Materials
    'VPU',   # Vanguard Utilities
    'MTUM',  # Momentum
    'VLUE',  # Value
    'QUAL',  # Quality
    'SIZE',  # Size
    'USMV',  # Minimum Volatility
]

# 美股热门股票
US_STOCKS = [
    'AAPL',  # Apple
    'MSFT',  # Microsoft
    'GOOGL', # Alphabet
    'AMZN',  # Amazon
    'NVDA',  # NVIDIA
    'META',  # Meta
    'TSLA',  # Tesla
    'BRK-B', # Berkshire Hathaway
    'JPM',   # JPMorgan
    'V',     # Visa
    'JNJ',   # Johnson & Johnson
    'WMT',   # Walmart
    'PG',    # Procter & Gamble
    'UNH',   # UnitedHealth
    'HD',    # Home Depot
    'MA',    # Mastercard
    'DIS',   # Disney
    'NFLX',  # Netflix
    'PYPL',  # PayPal
    'INTC',  # Intel
    'AMD',   # AMD
    'CRM',   # Salesforce
    'ORCL',  # Oracle
    'CSCO',  # Cisco
    'ADBE',  # Adobe
    'COIN',  # Coinbase
    'SQ',    # Block
    'SHOP',  # Shopify
    'SE',    # Sea Limited
    'BABA',  # Alibaba
    'JD',    # JD.com
    'PDD',   # PDD Holdings
    'NIO',   # NIO
    'XPEV',  # XPeng
    'LI',    # Li Auto
]

# A股主要指数ETF（用yfinance获取，代码格式：代码.SS/代码.SZ）
CN_ETF = [
    '510050.SS',  # 上证50ETF
    '510300.SS',  # 沪深300ETF
    '510500.SS',  # 中证500ETF
    '512100.SS',  # 中证1000ETF
    '159919.SZ',  # 沪深300ETF（深市）
    '159915.SZ',  # 创业板ETF
    '512880.SS',  # 证券ETF
    '512010.SS',  # 医药ETF
    '512660.SS',  # 军工ETF
    '512690.SS',  # 酒ETF
    '515030.SS',  # 新能源车ETF
    '516160.SS',  # 新能源ETF
    '512480.SS',  # 半导体ETF
    '515000.SS',  # 科技ETF
    '512200.SS',  # 房地产ETF
    '511010.SS',  # 国债ETF
    '511260.SS',  # 十年国债ETF
    '518880.SS',  # 黄金ETF
    '162411.SZ',  # 华宝油气
    '164906.SZ',  # 交银中证海外中国互联网
]

# A股热门股票
CN_STOCKS = [
    '600519.SS',  # 贵州茅台
    '000858.SZ',  # 五粮液
    '601318.SS',  # 中国平安
    '600036.SS',  # 招商银行
    '000001.SZ',  # 平安银行
    '600900.SS',  # 长江电力
    '601012.SS',  # 隆基绿能
    '300750.SZ',  # 宁德时代
    '002594.SZ',  # 比亚迪
    '600276.SS',  # 恒瑞医药
    '000333.SZ',  # 美的集团
    '600887.SS',  # 伊利股份
    '601888.SS',  # 中国中免
    '002475.SZ',  # 立讯精密
    '600030.SS',  # 中信证券
    '601166.SS',  # 兴业银行
    '601398.SS',  # 工商银行
    '600000.SS',  # 浦发银行
    '601288.SS',  # 农业银行
    '600016.SS',  # 民生银行
]

# 所有标的
ALL_TICKERS = US_ETF_BROAD + US_ETF_SECTOR + US_STOCKS + CN_ETF + CN_STOCKS


def ensure_dir():
    """确保数据目录存在"""
    DATA_DIR.mkdir(parents=True, exist_ok=True)


def fetch_yfinance(ticker, start_date, end_date):
    """使用 yfinance 获取数据"""
    import yfinance as yf
    try:
        stock = yf.Ticker(ticker)
        df = stock.history(start=start_date, end=end_date, auto_adjust=True)
        if df.empty:
            return None
        prices = {}
        for date_idx, row in df.iterrows():
            date_str = date_idx.strftime('%Y-%m-%d')
            prices[date_str] = round(float(row['Close']), 2)
        return prices
    except Exception as e:
        print(f"  yfinance error for {ticker}: {e}", file=sys.stderr)
        return None


def fetch_akshare(ticker, start_date, end_date):
    """使用 akshare 获取A股数据"""
    try:
        import akshare as ak
        code = ticker.split('.')[0]
        df = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start_date.replace('-', ''),
            end_date=end_date.replace('-', ''),
            adjust="qfq"
        )
        if df.empty:
            return None
        prices = {}
        for _, row in df.iterrows():
            date_str = str(row['日期']) if '日期' in df.columns else str(row['date'])
            close = float(row['收盘']) if '收盘' in df.columns else float(row['close'])
            prices[date_str] = close
        return prices
    except ImportError:
        return None
    except Exception as e:
        print(f"  akshare error for {ticker}: {e}", file=sys.stderr)
        return None


def fetch_ticker_data(ticker, start_date, end_date):
    """获取单个标的数据，自动选择数据源"""
    # A股用akshare优先
    if ticker.endswith('.SS') or ticker.endswith('.SZ'):
        data = fetch_akshare(ticker, start_date, end_date)
        if data:
            return data
        # akshare失败，尝试yfinance
        return fetch_yfinance(ticker, start_date, end_date)
    else:
        return fetch_yfinance(ticker, start_date, end_date)


def update_all(start_date=None, end_date=None, batch_size=5, delay=0.5):
    """批量更新所有标的数据"""
    ensure_dir()

    if not end_date:
        end_date = datetime.now().strftime('%Y-%m-%d')
    if not start_date:
        start_date = (datetime.now() - timedelta(days=365*5)).strftime('%Y-%m-%d')

    print(f"开始批量更新 {len(ALL_TICKERS)} 个标的 ({start_date} ~ {end_date})")

    success = 0
    failed = 0
    skipped = 0

    # 按批次处理
    for i in range(0, len(ALL_TICKERS), batch_size):
        batch = ALL_TICKERS[i:i+batch_size]
        print(f"\n批次 {i//batch_size + 1}/{(len(ALL_TICKERS)-1)//batch_size + 1}: {batch}")

        for ticker in batch:
            # 检查是否已有今日数据
            ticker_file = DATA_DIR / f"{ticker.replace('.', '_')}.json"
            if ticker_file.exists():
                try:
                    with open(ticker_file, 'r', encoding='utf-8') as f:
                        existing = json.load(f)
                    last_date = max(existing.keys()) if existing else ''
                    if last_date >= end_date:
                        print(f"  {ticker}: 已是最新，跳过")
                        skipped += 1
                        continue
                    # 增量更新：从最后日期开始
                    if last_date:
                        update_start = (datetime.strptime(last_date, '%Y-%m-%d') + timedelta(days=1)).strftime('%Y-%m-%d')
                        data = fetch_ticker_data(ticker, update_start, end_date)
                        if data:
                            existing.update(data)
                            with open(ticker_file, 'w', encoding='utf-8') as f:
                                json.dump(existing, f)
                            print(f"  {ticker}: 增量更新 {len(data)} 天")
                            success += 1
                            continue
                except Exception:
                    pass

            # 全量获取
            data = fetch_ticker_data(ticker, start_date, end_date)
            if data:
                with open(ticker_file, 'w', encoding='utf-8') as f:
                    json.dump(data, f)
                print(f"  {ticker}: 获取 {len(data)} 天数据")
                success += 1
            else:
                print(f"  {ticker}: 获取失败")
                failed += 1

        # 批次间延迟，避免请求过快
        if i + batch_size < len(ALL_TICKERS):
            time.sleep(delay)

    print(f"\n更新完成: 成功 {success}, 失败 {failed}, 跳过 {skipped}")
    return {'success': success, 'failed': failed, 'skipped': skipped}


def get_ticker_list():
    """获取所有支持的标的列表"""
    result = []
    for t in US_ETF_BROAD:
        result.append({'ticker': t, 'category': '美股宽基ETF', 'market': '美股'})
    for t in US_ETF_SECTOR:
        result.append({'ticker': t, 'category': '美股行业ETF', 'market': '美股'})
    for t in US_STOCKS:
        result.append({'ticker': t, 'category': '美股热门股票', 'market': '美股'})
    for t in CN_ETF:
        result.append({'ticker': t, 'category': 'A股ETF', 'market': 'A股'})
    for t in CN_STOCKS:
        result.append({'ticker': t, 'category': 'A股热门股票', 'market': 'A股'})
    return result


def load_ticker_data(ticker):
    """从本地加载标的数据"""
    ticker_file = DATA_DIR / f"{ticker.replace('.', '_')}.json"
    if ticker_file.exists():
        with open(ticker_file, 'r', encoding='utf-8') as f:
            return json.load(f)
    return None


if __name__ == '__main__':
    import argparse
    parser = argparse.ArgumentParser(description='批量数据引擎')
    parser.add_argument('action', choices=['update', 'list', 'load'], help='操作: update=更新数据, list=列出标的, load=加载数据')
    parser.add_argument('--start', type=str, help='开始日期')
    parser.add_argument('--end', type=str, help='结束日期')
    parser.add_argument('--ticker', type=str, help='加载指定标的数据')
    parser.add_argument('--batch-size', type=int, default=5, help='每批处理数量')
    parser.add_argument('--delay', type=float, default=0.5, help='批次间延迟(秒)')

    args = parser.parse_args()

    if args.action == 'update':
        result = update_all(args.start, args.end, args.batch_size, args.delay)
        print(json.dumps(result))
    elif args.action == 'list':
        tickers = get_ticker_list()
        print(json.dumps(tickers, ensure_ascii=False))
    elif args.action == 'load':
        if not args.ticker:
            print("Error: --ticker required for load", file=sys.stderr)
            sys.exit(1)
        data = load_ticker_data(args.ticker)
        if data:
            print(json.dumps(data))
        else:
            print(json.dumps({}))
