"""
标的宇宙发现 - 自动发现全市场标的列表

覆盖：
- 美股全量股票 (NYSE + NASDAQ + AMEX ~8000+)
- 美股全量 ETF (~3000+)
- A股全量股票 (~5000+)
- A股全量 ETF (~800+)
- 全球主要指数
"""

import json
import logging
import time
from datetime import datetime
from typing import Dict, List, Optional, Set

from .config import (
    CONFIG, UNIVERSE_FILE, STATE_DIR, MARKET_US, MARKET_CN,
    TYPE_ETF, TYPE_STOCK, TYPE_INDEX, CN_SUFFIX_SH, CN_SUFFIX_SZ,
    MAJOR_INDICES, ensure_dirs,
)

logger = logging.getLogger(__name__)


# ============================================================
# 美股全量股票发现
# ============================================================

def discover_us_stocks() -> List[Dict[str, str]]:
    """
    发现美股全量股票（NYSE + NASDAQ + AMEX）
    
    策略：
    1. 从 NASDAQ FTP 获取完整股票列表（官方数据源）
    2. 备选：从 stockanalysis.com 抓取
    3. 备选：yfinance 批量验证
    4. 兜底：内置主要指数成分股
    """
    stocks: List[Dict[str, str]] = []
    
    # 方法1: NASDAQ FTP 官方列表
    try:
        stocks = _discover_us_stocks_nasdaq_ftp()
        if len(stocks) > 1000:
            logger.info(f"NASDAQ FTP 发现 {len(stocks)} 个美股股票")
            return stocks
    except Exception as e:
        logger.warning(f"NASDAQ FTP 获取失败: {e}")
    
    # 方法2: 从 stockanalysis.com 抓取
    try:
        stocks = _discover_us_stocks_stockanalysis()
        if len(stocks) > 1000:
            logger.info(f"stockanalysis.com 发现 {len(stocks)} 个美股股票")
            return stocks
    except Exception as e:
        logger.warning(f"stockanalysis.com 获取失败: {e}")
    
    # 方法3: 从 yfinance 获取各交易所列表
    try:
        stocks = _discover_us_stocks_yfinance()
        if len(stocks) > 500:
            logger.info(f"yfinance 发现 {len(stocks)} 个美股股票")
            return stocks
    except Exception as e:
        logger.warning(f"yfinance 股票发现失败: {e}")
    
    # 兜底：指数成分股
    stocks = _discover_us_stocks_indices()
    logger.info(f"使用指数成分股: {len(stocks)} 个美股股票")
    return stocks


def _discover_us_stocks_nasdaq_ftp() -> List[Dict[str, str]]:
    """从 NASDAQ Trader 获取完整股票列表（官方数据源，含NYSE/NASDAQ/AMEX）"""
    import pandas as pd
    
    stocks: List[Dict[str, str]] = []
    
    # NASDAQ listed stocks (包含股票和ETF)
    try:
        df_nasdaq = pd.read_csv(
            "https://www.nasdaqtrader.com/dynamic/SymDir/nasdaqlisted.txt",
            sep="|",
            dtype=str,
        )
        # 去掉最后一行（File Creation Time）
        df_nasdaq = df_nasdaq[df_nasdaq["Symbol"].notna()]
        df_nasdaq = df_nasdaq[~df_nasdaq["Symbol"].str.contains("File Creation Time", na=False)]
        
        for _, row in df_nasdaq.iterrows():
            ticker = str(row["Symbol"]).strip()
            name = str(row.get("Security Name", "")).strip()
            etf_flag = str(row.get("ETF", "N")).strip().upper()
            test_flag = str(row.get("Test Issue", "N")).strip().upper()
            
            # 跳过测试股票和空行
            if not ticker or test_flag == "Y":
                continue
            
            stocks.append({
                "ticker": ticker,
                "name": name,
                "market": MARKET_US,
                "type": TYPE_ETF if etf_flag == "Y" else TYPE_STOCK,
                "currency": "USD",
                "exchange": "NASDAQ",
            })
        logger.info(f"NASDAQ listed: {len(stocks)} 个")
    except Exception as e:
        logger.warning(f"NASDAQ listed 文件下载失败: {e}")
    
    # Other listed (NYSE, AMEX, ARCA等)
    try:
        df_other = pd.read_csv(
            "https://www.nasdaqtrader.com/dynamic/SymDir/otherlisted.txt",
            sep="|",
            dtype=str,
        )
        df_other = df_other[df_other["ACT Symbol"].notna()]
        df_other = df_other[~df_other["ACT Symbol"].str.contains("File Creation Time", na=False)]
        
        for _, row in df_other.iterrows():
            ticker = str(row["ACT Symbol"]).strip()
            name = str(row.get("Security Name", "")).strip()
            exchange = str(row.get("Exchange", "")).strip()
            etf_flag = str(row.get("ETF", "N")).strip().upper()
            test_flag = str(row.get("Test Issue", "N")).strip().upper()
            
            if not ticker or test_flag == "Y":
                continue
            
            exchange_map = {"N": "NYSE", "A": "AMEX", "P": "ARCA", "Z": "BATS", "V": "IEX"}
            exchange_name = exchange_map.get(exchange, exchange)
            
            stocks.append({
                "ticker": ticker,
                "name": name,
                "market": MARKET_US,
                "type": TYPE_ETF if etf_flag == "Y" else TYPE_STOCK,
                "currency": "USD",
                "exchange": exchange_name,
            })
        logger.info(f"Other listed: 累计 {len(stocks)} 个")
    except Exception as e:
        logger.warning(f"Other listed 文件下载失败: {e}")
    
    return stocks


def _discover_us_stocks_stockanalysis() -> List[Dict[str, str]]:
    """从 stockanalysis.com 抓取全量股票列表"""
    import pandas as pd
    
    stocks: List[Dict[str, str]] = []
    
    # 各交易所股票列表页
    urls = [
        ("https://stockanalysis.com/stocks/", "NYSE"),
        ("https://stockanalysis.com/stocks/?f=NASDAQ", "NASDAQ"),
        ("https://stockanalysis.com/stocks/?f=AMEX", "AMEX"),
    ]
    
    for url, exchange in urls:
        try:
            tables = pd.read_html(url)
            for table in tables:
                if "Symbol" in table.columns or "Ticker" in table.columns:
                    col = "Symbol" if "Symbol" in table.columns else "Ticker"
                    for _, row in table.iterrows():
                        ticker = str(row[col]).strip()
                        name = str(row.get("Company", row.get("Name", ""))).strip()
                        if ticker and len(ticker) <= 5:
                            stocks.append({
                                "ticker": ticker,
                                "name": name,
                                "market": MARKET_US,
                                "type": TYPE_STOCK,
                                "currency": "USD",
                                "exchange": exchange,
                            })
                    break
        except Exception as e:
            logger.warning(f"stockanalysis.com {exchange} 抓取失败: {e}")
    
    return stocks


def _discover_us_stocks_yfinance() -> List[Dict[str, str]]:
    """使用 yfinance 获取各交易所股票列表"""
    import yfinance as yf
    
    stocks: List[Dict[str, str]] = []
    
    # yfinance 的 download 可以获取交易所信息
    # 但没有直接的列表API，使用指数成分股扩展
    index_tickers = {
        "^GSPC": "S&P 500",
        "^NDX": "NASDAQ 100",
        "^DJI": "Dow Jones 30",
        "^RUT": "Russell 2000",
        "^MID": "S&P MidCap 400",
    }
    
    # 获取指数成分股
    for idx_ticker, idx_name in index_tickers.items():
        try:
            idx = yf.Ticker(idx_ticker)
            # 尝试获取成分股
            if hasattr(idx, 'info') and 'components' in idx.info:
                for comp in idx.info['components']:
                    stocks.append({
                        "ticker": comp,
                        "name": "",
                        "market": MARKET_US,
                        "type": TYPE_STOCK,
                        "currency": "USD",
                        "exchange": "",
                    })
        except Exception:
            pass
    
    # 如果指数成分股不够，用Wikipedia
    if len(stocks) < 500:
        stocks = _discover_us_stocks_wikipedia()
    
    return stocks


def _discover_us_stocks_wikipedia() -> List[Dict[str, str]]:
    """从 Wikipedia 获取主要指数成分股"""
    import pandas as pd
    
    stocks: List[Dict[str, str]] = []
    seen: Set[str] = set()
    
    # S&P 500
    try:
        tables = pd.read_html(
            "https://en.wikipedia.org/wiki/List_of_S%26P_500_companies"
        )
        df = tables[0]
        for _, row in df.iterrows():
            ticker = str(row["Symbol"]).replace(".", "-")
            if ticker not in seen:
                stocks.append({
                    "ticker": ticker,
                    "name": str(row.get("Security", "")),
                    "market": MARKET_US,
                    "type": TYPE_STOCK,
                    "currency": "USD",
                    "exchange": str(row.get("Exchange", "")),
                })
                seen.add(ticker)
        logger.info(f"S&P 500: 发现 {len(seen)} 个成分股")
    except Exception as e:
        logger.warning(f"Wikipedia S&P 500 抓取失败: {e}")
    
    # NASDAQ 100
    try:
        tables = pd.read_html(
            "https://en.wikipedia.org/wiki/Nasdaq-100"
        )
        for table in tables:
            col = None
            if "Ticker" in table.columns:
                col = "Ticker"
            elif "Symbol" in table.columns:
                col = "Symbol"
            if col:
                for _, row in table.iterrows():
                    ticker = str(row[col]).replace(".", "-")
                    if ticker not in seen:
                        stocks.append({
                            "ticker": ticker,
                            "name": str(row.get("Company", row.get("Name", ""))),
                            "market": MARKET_US,
                            "type": TYPE_STOCK,
                            "currency": "USD",
                            "exchange": "NASDAQ",
                        })
                        seen.add(ticker)
                break
        logger.info(f"NASDAQ 100: 累计 {len(seen)} 个")
    except Exception as e:
        logger.warning(f"Wikipedia NASDAQ 100 抓取失败: {e}")
    
    # Dow Jones 30
    dow_tickers = [
        "AAPL", "AMGN", "AXP", "BA", "CAT", "CRM", "CSCO", "CVX", "DIS",
        "DOW", "GS", "HD", "HON", "IBM", "INTC", "JNJ", "JPM", "KO",
        "MCD", "MMM", "MRK", "MSFT", "NKE", "PG", "TRV", "UNH", "V",
        "VZ", "WBA", "WMT",
    ]
    for t in dow_tickers:
        if t not in seen:
            stocks.append({
                "ticker": t, "name": "", "market": MARKET_US,
                "type": TYPE_STOCK, "currency": "USD", "exchange": "NYSE",
            })
            seen.add(t)
    
    return stocks


def _discover_us_stocks_indices() -> List[Dict[str, str]]:
    """兜底：内置主要指数成分股"""
    return _discover_us_stocks_wikipedia()


# ============================================================
# 美股全量 ETF 发现
# ============================================================

def discover_us_etfs() -> List[Dict[str, str]]:
    """
    发现全美 ETF 列表 (~3000+)
    
    策略：
    1. 从 NASDAQ Trader 获取完整 ETF 列表
    2. 备选：从 stockanalysis.com 抓取
    3. 备选：内置列表
    """
    etfs: List[Dict[str, str]] = []
    
    # 方法1: NASDAQ Trader ETF 列表
    try:
        etfs = _discover_us_etfs_nasdaq()
        if len(etfs) > 500:
            logger.info(f"NASDAQ 发现 {len(etfs)} 个美股 ETF")
            return etfs
    except Exception as e:
        logger.warning(f"NASDAQ ETF 发现失败: {e}")
    
    # 方法2: stockanalysis.com ETF 列表
    try:
        etfs = _discover_us_etfs_stockanalysis()
        if len(etfs) > 500:
            logger.info(f"stockanalysis.com 发现 {len(etfs)} 个美股 ETF")
            return etfs
    except Exception as e:
        logger.warning(f"stockanalysis.com ETF 发现失败: {e}")
    
    # 方法3: 内置列表
    etfs = _get_builtin_us_etfs()
    logger.info(f"使用内置列表: {len(etfs)} 个美股 ETF")
    return etfs


def _discover_us_etfs_nasdaq() -> List[Dict[str, str]]:
    """从 NASDAQ Trader 获取 ETF 列表（复用股票列表中的ETF标记）"""
    # NASDAQ Trader 的 nasdaqlisted.txt 和 otherlisted.txt 中
    # ETF 列字段标记了 "Y"，直接复用 _discover_us_stocks_nasdaq_ftp 的结果
    all_items = _discover_us_stocks_nasdaq_ftp()
    return [item for item in all_items if item.get("type") == TYPE_ETF]


def _discover_us_etfs_stockanalysis() -> List[Dict[str, str]]:
    """从 stockanalysis.com 抓取 ETF 列表"""
    import pandas as pd
    
    etfs: List[Dict[str, str]] = []
    
    try:
        tables = pd.read_html("https://stockanalysis.com/etf/")
        for table in tables:
            col = None
            if "Symbol" in table.columns:
                col = "Symbol"
            elif "Ticker" in table.columns:
                col = "Ticker"
            if col:
                for _, row in table.iterrows():
                    ticker = str(row[col]).strip()
                    name = str(row.get("ETF Name", row.get("Name", ""))).strip()
                    if ticker:
                        etfs.append({
                            "ticker": ticker,
                            "name": name,
                            "market": MARKET_US,
                            "type": TYPE_ETF,
                            "currency": "USD",
                            "exchange": "",
                        })
                break
    except Exception as e:
        logger.warning(f"stockanalysis.com ETF 抓取失败: {e}")
    
    return etfs


def _get_builtin_us_etfs() -> List[Dict[str, str]]:
    """内置美股 ETF 列表"""
    tickers = [
        # 宽基
        "SPY", "VOO", "IVV", "VTI", "ITOT", "QQQ", "ONEQ", "DIA", "IWM",
        "VT", "VXUS", "BND", "AGG", "TLT", "IEF", "SHV", "TIP", "LQD",
        "HYG", "EMB", "GLD", "SLV", "DBC", "USO", "VNQ", "IYR",
        "SCHB", "SCHX", "SCHA", "SCHF", "SCHE", "SCHZ", "SCHP",
        "SGOV", "BIL", "JPST", "VGK", "VPL", "VWO", "EFA", "EEM",
        "IJR", "IJS", "IJH", "BNDX", "VWOB",
        # 行业
        "XLF", "XLK", "XLV", "XLE", "XLY", "XLP", "XLI", "XLB", "XLU", "XLC",
        "VGT", "VHT", "VFH", "VDE", "VDC", "VCR", "VIS", "VAW", "VPU",
        "MTUM", "VLUE", "QUAL", "SIZE", "USMV",
        "SOXX", "SMH", "IBB", "XBI", "HACK", "PJP", "IHI",
        "XOP", "XES", "XME", "COPX", "LIT", "URA",
        "ICLN", "TAN", "QCLN", "FAN", "PBW",
        "VIG", "SCHD", "VYM", "HDV", "DVY", "NOBL", "SDY",
        "PFF", "PGX", "MUB",
        # 国际
        "FXI", "MCHI", "KWEB", "CQQQ", "EWJ", "EWY", "EWT", "EWS", "EWH",
        "EWM", "EPI", "INDA", "EWZ", "EWW", "EWU", "EWG", "EWQ", "EWL",
        "EWI", "EWP", "EWD", "HEFA", "HEDJ", "DXJ",
    ]
    return [
        {"ticker": t, "name": "", "market": MARKET_US, "type": TYPE_ETF, "currency": "USD", "exchange": ""}
        for t in tickers
    ]


# ============================================================
# A股全量股票发现
# ============================================================

def discover_cn_stocks() -> List[Dict[str, str]]:
    """
    发现A股全量股票 (~5000+)
    
    策略：
    1. akshare 获取沪深两市全部股票
    2. 备选：yfinance 获取（需要代码列表）
    3. 兜底：内置列表
    """
    stocks: List[Dict[str, str]] = []
    
    try:
        stocks = _discover_cn_stocks_akshare()
        if len(stocks) > 1000:
            logger.info(f"akshare 发现 {len(stocks)} 个A股股票")
            return stocks
    except Exception as e:
        logger.warning(f"akshare A股发现失败: {e}")
    
    # 备选：yfinance
    try:
        stocks = _discover_cn_stocks_yfinance()
        if len(stocks) > 500:
            logger.info(f"yfinance 发现 {len(stocks)} 个A股股票")
            return stocks
    except Exception as e:
        logger.warning(f"yfinance A股发现失败: {e}")
    
    stocks = _get_builtin_cn_stocks()
    logger.info(f"使用内置列表: {len(stocks)} 个A股股票")
    return stocks


def _discover_cn_stocks_akshare() -> List[Dict[str, str]]:
    """使用 akshare 获取A股全部股票列表"""
    import akshare as ak
    
    stocks: List[Dict[str, str]] = []
    
    # 方法1: stock_info_a_code_name (更稳定，不需要代理)
    try:
        df = ak.stock_info_a_code_name()
        for _, row in df.iterrows():
            code = str(row["code"]).zfill(6)
            name = str(row["name"])
            
            # 跳过 ST、退市
            if "ST" in name or "退" in name:
                continue
            
            # 判断交易所
            if code.startswith(("6", "9")):
                suffix = CN_SUFFIX_SH
                exchange = "SSE"
            else:
                suffix = CN_SUFFIX_SZ
                exchange = "SZSE"
            
            ticker = f"{code}{suffix}"
            stocks.append({
                "ticker": ticker, "name": name, "market": MARKET_CN,
                "type": TYPE_STOCK, "currency": "CNY", "exchange": exchange,
            })
        return stocks
    except Exception as e:
        logger.warning(f"stock_info_a_code_name 失败: {e}")
    
    # 方法2: stock_zh_a_spot_em (需要东方财富接口)
    try:
        df = ak.stock_zh_a_spot_em()
        for _, row in df.iterrows():
            code = str(row["代码"])
            name = str(row["名称"])
            
            if "ST" in name or "退" in name:
                continue
            
            suffix = CN_SUFFIX_SH if code.startswith(("6", "9")) else CN_SUFFIX_SZ
            ticker = f"{code}{suffix}"
            
            stocks.append({
                "ticker": ticker, "name": name, "market": MARKET_CN,
                "type": TYPE_STOCK, "currency": "CNY",
                "exchange": "SSE" if suffix == CN_SUFFIX_SH else "SZSE",
            })
        return stocks
    except Exception as e:
        logger.warning(f"stock_zh_a_spot_em 失败: {e}")
    
    return stocks


def _discover_cn_stocks_yfinance() -> List[Dict[str, str]]:
    """使用 yfinance 获取A股股票（通过已知代码范围）"""
    stocks: List[Dict[str, str]] = []
    
    # A股代码范围
    # 上海主板: 600000-689999
    # 深圳主板: 000001-004999
    # 创业板: 300001-301999
    # 科创板: 688001-689999
    
    # 只生成常见代码范围（不可能全部验证）
    # 实际生产中应从akshare或其他数据源获取
    code_ranges = [
        # 沪深300成分股代码（常见）
        (600000, 600999, CN_SUFFIX_SH),
        (601000, 601999, CN_SUFFIX_SH),
        (603000, 603999, CN_SUFFIX_SH),
        (1, 4999, CN_SUFFIX_SZ),
        (300001, 301999, CN_SUFFIX_SZ),
    ]
    
    for start, end, suffix in code_ranges:
        for code in range(start, min(start + 100, end + 1)):  # 每个范围取前100
            ticker = f"{code}{suffix}"
            stocks.append({
                "ticker": ticker,
                "name": "",
                "market": MARKET_CN,
                "type": TYPE_STOCK,
                "currency": "CNY",
                "exchange": "SSE" if suffix == CN_SUFFIX_SH else "SZSE",
            })
    
    return stocks


def _get_builtin_cn_stocks() -> List[Dict[str, str]]:
    """内置A股热门股票列表"""
    tickers = [
        ("600519", "贵州茅台", CN_SUFFIX_SH), ("000858", "五粮液", CN_SUFFIX_SZ),
        ("601318", "中国平安", CN_SUFFIX_SH), ("600036", "招商银行", CN_SUFFIX_SH),
        ("000001", "平安银行", CN_SUFFIX_SZ), ("600900", "长江电力", CN_SUFFIX_SH),
        ("300750", "宁德时代", CN_SUFFIX_SZ), ("002594", "比亚迪", CN_SUFFIX_SZ),
        ("600276", "恒瑞医药", CN_SUFFIX_SH), ("000333", "美的集团", CN_SUFFIX_SZ),
        ("600887", "伊利股份", CN_SUFFIX_SH), ("601888", "中国中免", CN_SUFFIX_SH),
        ("002475", "立讯精密", CN_SUFFIX_SZ), ("600030", "中信证券", CN_SUFFIX_SH),
        ("601398", "工商银行", CN_SUFFIX_SH), ("601288", "农业银行", CN_SUFFIX_SH),
        ("601988", "中国银行", CN_SUFFIX_SH), ("600028", "中国石化", CN_SUFFIX_SH),
        ("601857", "中国石油", CN_SUFFIX_SH), ("000002", "万科A", CN_SUFFIX_SZ),
        ("600048", "保利发展", CN_SUFFIX_SH), ("002714", "牧原股份", CN_SUFFIX_SZ),
        ("600309", "万华化学", CN_SUFFIX_SH), ("000568", "泸州老窖", CN_SUFFIX_SZ),
        ("002304", "洋河股份", CN_SUFFIX_SZ), ("600809", "山西汾酒", CN_SUFFIX_SH),
        ("000725", "京东方A", CN_SUFFIX_SZ), ("002415", "海康威视", CN_SUFFIX_SZ),
        ("300059", "东方财富", CN_SUFFIX_SZ), ("601688", "华泰证券", CN_SUFFIX_SH),
        ("600585", "海螺水泥", CN_SUFFIX_SH), ("601668", "中国建筑", CN_SUFFIX_SH),
        ("002352", "顺丰控股", CN_SUFFIX_SZ), ("300015", "爱尔眼科", CN_SUFFIX_SZ),
        ("601012", "隆基绿能", CN_SUFFIX_SH), ("600346", "恒力石化", CN_SUFFIX_SH),
        ("601166", "兴业银行", CN_SUFFIX_SH), ("600000", "浦发银行", CN_SUFFIX_SH),
        ("600016", "民生银行", CN_SUFFIX_SH), ("601601", "中国太保", CN_SUFFIX_SH),
    ]
    return [
        {"ticker": f"{code}{suffix}", "name": name, "market": MARKET_CN,
         "type": TYPE_STOCK, "currency": "CNY",
         "exchange": "SSE" if suffix == CN_SUFFIX_SH else "SZSE"}
        for code, name, suffix in tickers
    ]


# ============================================================
# A股全量 ETF 发现
# ============================================================

def discover_cn_etfs() -> List[Dict[str, str]]:
    """
    发现A股全量 ETF (~800+)
    
    策略：
    1. akshare 获取全市场 ETF
    2. 备选：内置列表
    """
    etfs: List[Dict[str, str]] = []
    
    try:
        etfs = _discover_cn_etfs_akshare()
        if etfs:
            logger.info(f"akshare 发现 {len(etfs)} 个A股 ETF")
            return etfs
    except Exception as e:
        logger.warning(f"akshare A股 ETF 发现失败: {e}")
    
    etfs = _get_builtin_cn_etfs()
    logger.info(f"使用内置列表: {len(etfs)} 个A股 ETF")
    return etfs


def _discover_cn_etfs_akshare() -> List[Dict[str, str]]:
    """使用 akshare 获取A股 ETF 列表"""
    import akshare as ak
    
    etfs: List[Dict[str, str]] = []
    df = ak.fund_etf_spot_em()
    
    for _, row in df.iterrows():
        code = str(row["代码"])
        name = str(row["名称"])
        
        if code.startswith("5"):
            suffix = CN_SUFFIX_SH
            exchange = "SSE"
        elif code.startswith(("1", "2")):
            suffix = CN_SUFFIX_SZ
            exchange = "SZSE"
        else:
            continue
        
        ticker = f"{code}{suffix}"
        etfs.append({
            "ticker": ticker, "name": name, "market": MARKET_CN,
            "type": TYPE_ETF, "currency": "CNY", "exchange": exchange,
        })
    
    return etfs


def _get_builtin_cn_etfs() -> List[Dict[str, str]]:
    """内置A股 ETF 列表"""
    etf_list = [
        ("510050", "上证50ETF", CN_SUFFIX_SH), ("510300", "沪深300ETF", CN_SUFFIX_SH),
        ("510500", "中证500ETF", CN_SUFFIX_SH), ("512100", "中证1000ETF", CN_SUFFIX_SH),
        ("159919", "沪深300ETF", CN_SUFFIX_SZ), ("159915", "创业板ETF", CN_SUFFIX_SZ),
        ("512880", "证券ETF", CN_SUFFIX_SH), ("512010", "医药ETF", CN_SUFFIX_SH),
        ("512660", "军工ETF", CN_SUFFIX_SH), ("512690", "酒ETF", CN_SUFFIX_SH),
        ("515030", "新能源车ETF", CN_SUFFIX_SH), ("516160", "新能源ETF", CN_SUFFIX_SH),
        ("512480", "半导体ETF", CN_SUFFIX_SH), ("515000", "科技ETF", CN_SUFFIX_SH),
        ("511010", "国债ETF", CN_SUFFIX_SH), ("518880", "黄金ETF", CN_SUFFIX_SH),
        ("588000", "科创50ETF", CN_SUFFIX_SH), ("159901", "深证100ETF", CN_SUFFIX_SZ),
        ("510880", "红利ETF", CN_SUFFIX_SH), ("515880", "通信ETF", CN_SUFFIX_SH),
    ]
    return [
        {"ticker": f"{code}{suffix}", "name": name, "market": MARKET_CN,
         "type": TYPE_ETF, "currency": "CNY",
         "exchange": "SSE" if suffix == CN_SUFFIX_SH else "SZSE"}
        for code, name, suffix in etf_list
    ]


# ============================================================
# 指数发现
# ============================================================

def discover_indices() -> List[Dict[str, str]]:
    """获取主要指数列表"""
    indices = []
    for ticker, info in MAJOR_INDICES.items():
        market = MARKET_CN if ticker.endswith((".SH", ".SZ")) else MARKET_US
        indices.append({
            "ticker": ticker, "name": info["name"], "market": market,
            "type": TYPE_INDEX, "currency": info.get("currency", "USD"),
            "exchange": info.get("exchange", ""),
        })
    return indices


# ============================================================
# 完整宇宙
# ============================================================

def get_full_universe(force_refresh: bool = False) -> List[Dict[str, str]]:
    """
    获取完整标的宇宙
    
    合并所有市场的 ETF、股票、指数，去重后返回。
    结果缓存到 universe.json，按配置周期刷新。
    """
    ensure_dirs()
    
    # 检查缓存
    if not force_refresh and UNIVERSE_FILE.exists():
        try:
            with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cached_time = cached.get("updated_at", "")
            if cached_time:
                cached_dt = datetime.fromisoformat(cached_time)
                age_days = (datetime.now() - cached_dt).days
                if age_days < CONFIG.schedule.universe_refresh_days:
                    count = len(cached.get("tickers", []))
                    logger.info(f"使用缓存的标的宇宙 ({count} 个, {age_days}天前更新)")
                    return cached.get("tickers", [])
        except Exception as e:
            logger.warning(f"读取缓存失败: {e}")
    
    # 刷新宇宙
    logger.info("开始刷新标的宇宙...")
    all_tickers: List[Dict[str, str]] = []
    seen: Set[str] = set()
    
    # 第1步：从 NASDAQ Trader 获取美股全量（股票+ETF，一次下载）
    logger.info("步骤1: 获取美股全量标的（NASDAQ Trader）...")
    try:
        us_all = _discover_us_stocks_nasdaq_ftp()
        us_etfs = [item for item in us_all if item.get("type") == TYPE_ETF]
        us_stocks = [item for item in us_all if item.get("type") == TYPE_STOCK]
        
        for item in us_all:
            if item["ticker"] not in seen:
                all_tickers.append(item)
                seen.add(item["ticker"])
        
        logger.info(f"美股全量: {len(us_stocks)} 股票 + {len(us_etfs)} ETF = {len(us_all)} 个")
    except Exception as e:
        logger.warning(f"美股全量获取失败: {e}")
        # Fallback: 分别获取
        try:
            for item in discover_us_stocks():
                if item["ticker"] not in seen:
                    all_tickers.append(item)
                    seen.add(item["ticker"])
        except Exception:
            pass
        try:
            for item in discover_us_etfs():
                if item["ticker"] not in seen:
                    all_tickers.append(item)
                    seen.add(item["ticker"])
        except Exception:
            pass
    
    # 第2步：获取A股ETF
    logger.info("步骤2: 获取A股 ETF...")
    try:
        cn_etfs = discover_cn_etfs()
        new_count = 0
        for item in cn_etfs:
            if item["ticker"] not in seen:
                all_tickers.append(item)
                seen.add(item["ticker"])
                new_count += 1
        logger.info(f"A股 ETF: {len(cn_etfs)} 个 (新增 {new_count})")
    except Exception as e:
        logger.warning(f"A股 ETF 获取失败: {e}")
    
    # 第3步：获取A股股票
    logger.info("步骤3: 获取A股股票...")
    try:
        cn_stocks = discover_cn_stocks()
        new_count = 0
        for item in cn_stocks:
            if item["ticker"] not in seen:
                all_tickers.append(item)
                seen.add(item["ticker"])
                new_count += 1
        logger.info(f"A股股票: {len(cn_stocks)} 个 (新增 {new_count})")
    except Exception as e:
        logger.warning(f"A股股票获取失败: {e}")
    
    # 第4步：获取指数
    logger.info("步骤4: 获取指数...")
    try:
        indices = discover_indices()
        for item in indices:
            if item["ticker"] not in seen:
                all_tickers.append(item)
                seen.add(item["ticker"])
        logger.info(f"指数: {len(indices)} 个")
    except Exception as e:
        logger.warning(f"指数获取失败: {e}")
    
    # 统计
    stock_count = sum(1 for t in all_tickers if t.get("type") == TYPE_STOCK)
    etf_count = sum(1 for t in all_tickers if t.get("type") == TYPE_ETF)
    index_count = sum(1 for t in all_tickers if t.get("type") == TYPE_INDEX)
    us_count = sum(1 for t in all_tickers if t.get("market") == MARKET_US)
    cn_count = sum(1 for t in all_tickers if t.get("market") == MARKET_CN)
    
    logger.info(f"标的宇宙汇总: {len(all_tickers)} 个")
    logger.info(f"  美股: {us_count} (股票 {sum(1 for t in all_tickers if t.get('market')==MARKET_US and t.get('type')==TYPE_STOCK)}, ETF {sum(1 for t in all_tickers if t.get('market')==MARKET_US and t.get('type')==TYPE_ETF)})")
    logger.info(f"  A股: {cn_count} (股票 {sum(1 for t in all_tickers if t.get('market')==MARKET_CN and t.get('type')==TYPE_STOCK)}, ETF {sum(1 for t in all_tickers if t.get('market')==MARKET_CN and t.get('type')==TYPE_ETF)})")
    logger.info(f"  指数: {index_count}")
    
    # 保存
    universe_data = {
        "updated_at": datetime.now().isoformat(),
        "total_count": len(all_tickers),
        "stats": {
            "total": len(all_tickers),
            "stocks": stock_count,
            "etfs": etf_count,
            "indices": index_count,
            "us": us_count,
            "cn": cn_count,
        },
        "tickers": all_tickers,
    }
    try:
        with open(UNIVERSE_FILE, "w", encoding="utf-8") as f:
            json.dump(universe_data, f, ensure_ascii=False)
        logger.info(f"标的宇宙已保存: {len(all_tickers)} 个标的")
    except Exception as e:
        logger.warning(f"保存宇宙缓存失败: {e}")
    
    return all_tickers


def get_ticker_market(ticker: str) -> str:
    """判断标的市场"""
    if ticker.endswith((".SS", ".SZ", ".SH")):
        return MARKET_CN
    return MARKET_US


def get_ticker_type(ticker: str) -> str:
    """判断标的类型"""
    if UNIVERSE_FILE.exists():
        try:
            with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            for item in cached.get("tickers", []):
                if item["ticker"] == ticker:
                    return item.get("type", TYPE_STOCK)
        except Exception:
            pass
    
    if ticker.startswith("^"):
        return TYPE_INDEX
    
    code = ticker.split(".")[0]
    cn_etf_prefixes = ("5", "15", "16", "51", "52", "56", "58")
    if any(code.startswith(p) for p in cn_etf_prefixes) and ticker.endswith((".SS", ".SZ")):
        return TYPE_ETF
    return TYPE_STOCK
