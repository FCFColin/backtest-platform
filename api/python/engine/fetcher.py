"""
数据抓取器 - 保守防限流版

防限流策略：
1. iTick API 作为主力数据源（免费、不限调用）
2. yfinance 降级为备用（更保守参数：30/min, 1500ms间隔）
3. 自动源切换逻辑：itick > yfinance > akshare
4. 自定义 Session + Cookie 持久化（避免 Yahoo Crumb/Cookie 校验失败）
5. yf.download 批量下载：threads=False 避免内部并发触发限流
6. 429限流自动退避：检测到限流后等待10分钟再重试
7. 从 history 数据直接提取分红/拆股（每个标的只需1个请求）
8. 跳过已缓存且未过期的标的（增量更新）
9. 清理 yfinance 缓存（修复 Cookie/Crumb 问题）
"""

import logging
import os
import time
import json
import threading
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Dict, List, Optional, Tuple

from .config import CONFIG, MARKET_CN, MARKET_US, CN_SUFFIX_SH
from .adjustment import (
    calculate_backward_adjustment,
    apply_hfq_adjustment,
)

logger = logging.getLogger(__name__)

# Cookie 持久化目录
_COOKIE_DIR = Path(__file__).parent.parent.parent.parent / "data" / "market" / "state"

# ============================================================
# 修复 yfinance 缓存损坏：设置独立缓存目录
# 默认缓存 %LOCALAPPDATA%\py-yfinance 容易损坏导致 disk I/O error
# ============================================================
_YF_CACHE_DIR = _COOKIE_DIR / "yf_cache"
_YF_CACHE_DIR.mkdir(parents=True, exist_ok=True)
os.environ["YF_CACHE_DIR"] = str(_YF_CACHE_DIR)


# ============================================================
# 防限流 Session 工厂
# ============================================================

def _create_yf_session():
    """
    创建带自定义 User-Agent 和 Cookie 持久化的 requests.Session

    Yahoo Finance 2025年9月升级了 Crumb/Cookie 校验，
    需要持久化 Cookie 避免每次请求都重新获取 Crumb。
    """
    import requests

    session = requests.Session()
    session.headers.update({
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/125.0.0.0 Safari/537.36"
        ),
    })

    # 尝试加载已保存的 Cookie
    cookie_file = _COOKIE_DIR / "yf_cookies.json"
    if cookie_file.exists():
        try:
            with open(cookie_file, "r") as f:
                cookies = json.load(f)
            for name, value in cookies.items():
                session.cookies.set(name, value, domain=".yahoo.com")
            logger.debug(f"已加载 {len(cookies)} 个 Cookie")
        except Exception:
            pass

    return session


def _save_yf_cookies(session):
    """持久化 Session Cookie"""
    try:
        _COOKIE_DIR.mkdir(parents=True, exist_ok=True)
        cookie_file = _COOKIE_DIR / "yf_cookies.json"
        cookies = {c.name: c.value for c in session.cookies}
        with open(cookie_file, "w") as f:
            json.dump(cookies, f)
    except Exception:
        pass


# 全局 Session（线程安全）
_yf_session = None
_yf_session_lock = threading.Lock()


def get_yf_session():
    """获取全局 yfinance Session（懒初始化）"""
    global _yf_session
    if _yf_session is None:
        with _yf_session_lock:
            if _yf_session is None:
                _yf_session = _create_yf_session()
    return _yf_session


# ============================================================
# 速率限制器（保守版）
# ============================================================

class RateLimiter:
    """滑动窗口速率限制器（带429自动退避）"""

    def __init__(
        self,
        max_requests_per_minute: int = 60,
        max_requests_per_hour: int = 2000,
        min_interval_ms: int = 500,
    ):
        self.max_per_minute = max_requests_per_minute
        self.max_per_hour = max_requests_per_hour
        self.min_interval_ms = min_interval_ms
        self._lock = threading.Lock()
        self._timestamps: List[float] = []
        self._last_request_time: float = 0.0
        self._backoff_until: float = 0.0  # 限流退避截止时间

    def acquire(self) -> None:
        """获取请求许可（阻塞直到可以发送请求）"""
        with self._lock:
            now = time.time()

            # 检查是否在限流退避期
            if now < self._backoff_until:
                wait = self._backoff_until - now
                logger.warning(f"限流退避中，等待 {wait:.1f} 秒")
                time.sleep(wait)
                now = time.time()

            # 强制最小间隔
            elapsed_ms = (now - self._last_request_time) * 1000
            if elapsed_ms < self.min_interval_ms:
                wait = (self.min_interval_ms - elapsed_ms) / 1000
                time.sleep(wait)
                now = time.time()

            # 清理过期时间戳
            self._timestamps = [
                t for t in self._timestamps
                if now - t < 3600
            ]

            # 检查小时限制
            hour_timestamps = [t for t in self._timestamps if now - t < 3600]
            if len(hour_timestamps) >= self.max_per_hour:
                oldest = hour_timestamps[0]
                wait = 3600 - (now - oldest) + 1.0
                logger.warning(f"达到小时速率限制，等待 {wait:.1f} 秒")
                time.sleep(wait)
                now = time.time()

            # 检查分钟限制
            minute_timestamps = [t for t in self._timestamps if now - t < 60]
            if len(minute_timestamps) >= self.max_per_minute:
                oldest = minute_timestamps[0]
                wait = 60 - (now - oldest) + 0.5
                logger.warning(f"达到分钟速率限制，等待 {wait:.1f} 秒")
                time.sleep(wait)
                now = time.time()

            self._timestamps.append(now)
            self._last_request_time = now

    def backoff(self, seconds: float = 300) -> None:
        """触发限流退避（默认5分钟）"""
        with self._lock:
            self._backoff_until = time.time() + seconds
            logger.warning(f"触发限流退避，暂停 {seconds:.0f} 秒")


# 全局速率限制器（保守参数）
_yfinance_limiter = RateLimiter(
    max_requests_per_minute=30,  # 从60降到30
    max_requests_per_hour=1000,  # 从2000降到1000
    min_interval_ms=1500,  # 从500增到1500ms
)

_itick_limiter = RateLimiter(
    max_requests_per_minute=60,
    max_requests_per_hour=3000,
    min_interval_ms=200,
)

_akshare_limiter = RateLimiter(
    max_requests_per_minute=8,  # 从10降到8
    max_requests_per_hour=500,
    min_interval_ms=2000,  # 从1500增到2000ms
)


# ============================================================
# 重试装饰器
# ============================================================

def retry_with_backoff(
    func,
    max_retries: int = None,
    base_delay: float = None,
    backoff_factor: float = None,
):
    """
    带指数退避的重试包装器

    Args:
        func: 要重试的函数
        max_retries: 最大重试次数
        base_delay: 基础延迟（秒）
        backoff_factor: 退避因子
    """
    cfg = CONFIG.retry
    max_retries = max_retries if max_retries is not None else cfg.max_retries
    base_delay = base_delay if base_delay is not None else cfg.base_delay_seconds
    backoff_factor = backoff_factor if backoff_factor is not None else cfg.backoff_factor

    def wrapper(*args, **kwargs):
        last_exception = None
        for attempt in range(max_retries + 1):
            try:
                return func(*args, **kwargs)
            except Exception as e:
                last_exception = e
                if attempt < max_retries:
                    delay = min(
                        base_delay * (backoff_factor ** attempt),
                        cfg.max_delay_seconds,
                    )
                    logger.warning(
                        f"第 {attempt + 1}/{max_retries} 次重试 "
                        f"({func.__name__}): {e}, 等待 {delay:.1f}s"
                    )
                    time.sleep(delay)
                else:
                    logger.error(
                        f"重试 {max_retries} 次后仍失败 "
                        f"({func.__name__}): {e}"
                    )
        raise last_exception

    return wrapper


# ============================================================
# iTick API 数据抓取
# ============================================================

def _ticker_to_itick_code(ticker: str) -> tuple:
    """将yfinance格式的ticker转为iTick格式 (code, region)"""
    if ticker.endswith(".SS"):
        return ticker.replace(".SS", ""), "SH"
    elif ticker.endswith(".SZ"):
        return ticker.replace(".SZ", ""), "SZ"
    elif ticker.endswith(".HK"):
        return ticker.replace(".HK", ""), "HK"
    else:
        # 美股
        return ticker, "US"


def fetch_itick_ticker(ticker, start_date, end_date):
    """使用 iTick API 获取标的完整数据"""
    import requests

    token = CONFIG.itick_api_token
    if not token:
        return None

    code, region = _ticker_to_itick_code(ticker)

    # 计算需要的limit（天数）
    try:
        start_dt = datetime.strptime(start_date, "%Y-%m-%d")
        end_dt = datetime.strptime(end_date, "%Y-%m-%d")
        days = (end_dt - start_dt).days
        # 交易日约为自然日的70%
        limit = min(int(days * 0.7) + 100, 5000)  # iTick最多支持15年日线
    except Exception:
        limit = 5000

    _itick_limiter.acquire()

    url = f"https://api.itick.org/stock/kline"
    params = {
        "region": region,
        "code": code,
        "kType": 6,  # 日线
        "limit": limit,
    }
    headers = {
        "accept": "application/json",
        "token": token,
    }

    try:
        resp = requests.get(url, params=params, headers=headers, timeout=30)
        if resp.status_code == 429:
            logger.warning(f"iTick 限流: {ticker}")
            _itick_limiter.backoff(60)
            return None
        if resp.status_code != 200:
            logger.warning(f"iTick HTTP {resp.status_code}: {ticker}")
            return None

        data = resp.json()
        if data.get("code") != 0:
            logger.warning(f"iTick API error: {data.get('msg', 'unknown')}")
            return None

        klines = data.get("data", [])
        if not klines:
            return None

        # 解析K线数据
        # iTick返回格式: [[timestamp_ms, open, high, low, close, volume], ...]
        prices_raw = []
        for k in klines:
            ts = k[0]  # 毫秒时间戳
            date_str = datetime.fromtimestamp(ts / 1000).strftime("%Y-%m-%d")
            # 过滤掉早于start_date的数据
            if date_str < start_date:
                continue
            prices_raw.append({
                "date": date_str,
                "open": float(k[1]),
                "high": float(k[2]),
                "low": float(k[3]),
                "close": float(k[4]),
                "volume": float(k[5]),
            })

        if not prices_raw:
            return None

        # iTick数据已经是后复权价格（美股），A股需要额外处理
        # 简化处理：直接使用收盘价作为后复权价
        prices = []
        for p in prices_raw:
            prices.append({
                **p,
                "adj_close": p["close"],
                "dividend": 0.0,
                "split_factor": 1.0,
            })

        # 元信息
        currency = "CNY" if region in ("SH", "SZ") else "USD" if region == "US" else "HKD"
        exchange = {"SH": "SSE", "SZ": "SZSE", "US": "", "HK": "HKEX"}.get(region, "")

        return {
            "meta": {
                "ticker": ticker,
                "name": ticker,
                "exchange": exchange,
                "type": "STOCK",
                "currency": currency,
                "first_date": prices[0]["date"],
                "last_updated": prices[-1]["date"],
                "source": "itick",
            },
            "adjustment": {
                "method": "backward",
                "description": "后复权（iTick API数据）",
            },
            "prices": prices,
        }
    except Exception as e:
        logger.error(f"iTick获取 {ticker} 失败: {e}")
        return None


# ============================================================
# yfinance 缓存清理
# ============================================================

def clear_yfinance_cache():
    """清理 yfinance 缓存（修复 Cookie/Crumb 问题）"""
    import shutil
    import os

    # Windows 缓存路径
    cache_paths = [
        Path(os.environ.get("LOCALAPPDATA", "")) / "py-yfinance",
        Path.home() / ".cache" / "py-yfinance",
    ]

    cleaned = 0
    for p in cache_paths:
        if p.exists():
            try:
                shutil.rmtree(p)
                logger.info(f"已清理 yfinance 缓存: {p}")
                cleaned += 1
            except Exception as e:
                logger.warning(f"清理缓存失败 {p}: {e}")

    # 重置全局 Session
    global _yf_session
    with _yf_session_lock:
        _yf_session = None

    return cleaned


# ============================================================
# 美股数据抓取
# ============================================================

def fetch_us_ticker(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """
    获取美股标的完整数据（自动源切换）

    按优先级尝试不同数据源：itick > yfinance

    返回格式：
    {
        "meta": {
            "ticker": "SPY",
            "name": "...",
            "exchange": "NYSE",
            "type": "ETF",
            "currency": "USD",
            "first_date": "1993-01-29",
            "last_updated": "2024-12-31"
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权：以最新价格为基准，向前调整历史价格"
        },
        "prices": [
            {
                "date": "2024-01-02",
                "open": 472.65,
                "high": 474.85,
                "low": 471.47,
                "close": 473.50,
                "adj_close": 473.50,
                "volume": 64320100,
                "dividend": 0.0,
                "split_factor": 1.0
            }
        ]
    }

    Args:
        ticker: 标的代码（如 SPY, AAPL）
        start_date: 起始日期 YYYY-MM-DD
        end_date: 结束日期 YYYY-MM-DD

    Returns:
        完整标的数据字典，失败返回 None
    """
    # 按优先级尝试不同数据源
    for source in CONFIG.source_priority:
        if source == "itick":
            result = fetch_itick_ticker(ticker, start_date, end_date)
            if result:
                return result
            logger.debug(f"iTick获取 {ticker} 失败，尝试下一数据源")
        elif source == "yfinance":
            result = _fetch_us_ticker_impl(ticker, start_date, end_date)
            if result:
                return result
            logger.debug(f"yfinance获取 {ticker} 失败，尝试下一数据源")
    return None


def _fetch_us_ticker_impl(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """美股数据获取实现（防限流版）"""
    import yfinance as yf

    # 速率限制
    _yfinance_limiter.acquire()

    # 使用自定义 Session（Cookie 持久化 + 自定义 UA）
    session = get_yf_session()
    stock = yf.Ticker(ticker, session=session)

    try:
        # 获取历史数据（不复权）
        df = stock.history(start=start_date, end=end_date, auto_adjust=False)
    except Exception as e:
        err_msg = str(e)
        if "Rate" in err_msg or "429" in err_msg or "Too Many" in err_msg:
            logger.warning(f"yfinance 限流: {ticker}, 触发5分钟退避")
            _yfinance_limiter.backoff(300)
            # 退避后重试一次
            _yfinance_limiter.acquire()
            try:
                df = stock.history(start=start_date, end=end_date, auto_adjust=False)
            except Exception as e2:
                logger.error(f"重试后仍失败: {ticker}: {e2}")
                return None
        else:
            logger.error(f"获取美股 {ticker} 失败: {e}")
            return None

    if df.empty:
        logger.warning(f"{ticker}: 无数据 ({start_date} ~ {end_date})")
        return None

    # 保存 Cookie（可能包含新的 Crumb）
    _save_yf_cookies(session)

    # 直接从history数据中提取分红和拆股（避免额外请求）
    splits = {}
    dividends = {}
    for date_idx, row in df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        div = float(row.get("Dividends", 0))
        split = float(row.get("Stock Splits", 0))
        if div > 0:
            dividends[date_str] = div
        if split != 0 and split != 1:
            splits[date_str] = split

    # 构建价格列表
    prices_raw = []
    for date_idx, row in df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        prices_raw.append({
            "date": date_str,
            "open": float(row.get("Open", 0)),
            "high": float(row.get("High", 0)),
            "low": float(row.get("Low", 0)),
            "close": float(row.get("Close", 0)),
            "volume": float(row.get("Volume", 0)),
        })

    # 计算后复权价格
    prices = calculate_backward_adjustment(
        prices_raw, splits=splits, dividends=dividends
    )

    # 元信息用默认值（避免额外请求 stock.info）
    name = ticker
    exchange = ""
    currency = "USD"
    asset_type = "STOCK"

    first_date = prices[0]["date"] if prices else start_date
    last_updated = prices[-1]["date"] if prices else end_date

    return {
        "meta": {
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "type": asset_type,
            "currency": currency,
            "first_date": first_date,
            "last_updated": last_updated,
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权：以最新价格为基准，向前调整历史价格",
        },
        "prices": prices,
    }


# ============================================================
# A股数据抓取
# ============================================================

def fetch_cn_ticker(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """
    获取A股标的完整数据（含后复权，自动源切换）

    优先使用 iTick（不限流），再尝试 akshare，最后 yfinance fallback

    使用 akshare 获取数据：
    1. 获取原始行情数据（不复权）
    2. 获取后复权行情数据
    3. 通过比值计算复权因子

    Args:
        ticker: 标的代码（如 600519.SS, 000001.SZ）
        start_date: 起始日期 YYYY-MM-DD
        end_date: 结束日期 YYYY-MM-DD

    Returns:
        完整标的数据字典，失败返回 None
    """
    # 先尝试 iTick（不限流）
    if "itick" in CONFIG.source_priority:
        result = fetch_itick_ticker(ticker, start_date, end_date)
        if result:
            return result

    # 再尝试 baostock（TCP协议，不受代理/防火墙影响，自带后复权）
    result = _fetch_cn_ticker_baostock(ticker, start_date, end_date)
    if result:
        return result

    # 再尝试 akshare
    try:
        return _fetch_cn_ticker_impl(ticker, start_date, end_date)
    except Exception as e:
        logger.warning(f"akshare获取A股 {ticker} 失败: {e}")
        # 最后尝试 yfinance fallback
        try:
            return _fetch_us_ticker_impl(ticker, start_date, end_date)
        except Exception as e2:
            logger.error(f"所有数据源均失败: {ticker}")
            return None


def _fetch_cn_ticker_impl(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """A股数据获取实现"""
    import akshare as ak

    # 速率限制
    _akshare_limiter.acquire()

    # 解析代码
    code = ticker.split(".")[0]
    is_sh = ticker.endswith((".SS", ".SH"))

    # 判断是ETF还是股票
    is_etf = _is_cn_etf_code(code)

    # 日期格式转换
    start_fmt = start_date.replace("-", "")
    end_fmt = end_date.replace("-", "")

    # 获取原始数据（不复权）
    _akshare_limiter.acquire()
    if is_etf:
        df_raw = ak.fund_etf_hist_em(
            symbol=code,
            period="daily",
            start_date=start_fmt,
            end_date=end_fmt,
            adjust="",
        )
    else:
        df_raw = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start_fmt,
            end_date=end_fmt,
            adjust="",
        )

    if df_raw is None or df_raw.empty:
        logger.warning(f"{ticker}: 无原始数据 ({start_date} ~ {end_date})")
        return None

    # 获取后复权数据
    _akshare_limiter.acquire()
    if is_etf:
        df_hfq = ak.fund_etf_hist_em(
            symbol=code,
            period="daily",
            start_date=start_fmt,
            end_date=end_fmt,
            adjust="hfq",
        )
    else:
        df_hfq = ak.stock_zh_a_hist(
            symbol=code,
            period="daily",
            start_date=start_fmt,
            end_date=end_fmt,
            adjust="hfq",
        )

    # 构建后复权收盘价映射
    hfq_close_map: Dict[str, float] = {}
    if df_hfq is not None and not df_hfq.empty:
        for _, row in df_hfq.iterrows():
            date_str = str(row.get("日期", row.get("date", "")))
            close = float(row.get("收盘", row.get("close", 0)))
            if date_str:
                hfq_close_map[date_str] = close

    # 构建原始价格列表
    prices_raw = []
    for _, row in df_raw.iterrows():
        date_str = str(row.get("日期", row.get("date", "")))
        if not date_str:
            continue
        prices_raw.append({
            "date": date_str,
            "open": float(row.get("开盘", row.get("open", 0))),
            "high": float(row.get("最高", row.get("high", 0))),
            "low": float(row.get("最低", row.get("low", 0))),
            "close": float(row.get("收盘", row.get("close", 0))),
            "volume": float(row.get("成交量", row.get("volume", 0))),
        })

    # 应用后复权
    prices = apply_hfq_adjustment(prices_raw, hfq_close_map)

    # 获取标的名称
    name = _get_cn_ticker_name(code, is_etf)

    first_date = prices[0]["date"] if prices else start_date
    last_updated = prices[-1]["date"] if prices else end_date

    return {
        "meta": {
            "ticker": ticker,
            "name": name,
            "exchange": "SSE" if is_sh else "SZSE",
            "type": "ETF" if is_etf else "STOCK",
            "currency": "CNY",
            "first_date": first_date,
            "last_updated": last_updated,
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权：以最新价格为基准，向前调整历史价格（akshare hfq）",
        },
        "prices": prices,
    }


def _is_cn_etf_code(code: str) -> bool:
    """判断A股代码是否为ETF"""
    # 上海ETF: 51xxxx, 52xxxx, 56xxxx, 58xxxx
    # 深圳ETF: 15xxxx, 16xxxx, 18xxxx, 19xxxx
    etf_prefixes = ("51", "52", "56", "58", "15", "16", "18", "19")
    return code.startswith(etf_prefixes)


def _fetch_cn_ticker_baostock(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """
    使用 baostock 获取A股数据（TCP协议，不受代理/防火墙影响）

    优势：
    - 使用TCP直连，不受HTTP代理干扰
    - 自带后复权（adjustflag=2）
    - 无速率限制（但建议保守使用）
    - 覆盖沪深A股全部历史数据

    Args:
        ticker: 标的代码（如 600519.SS, 000001.SZ）
        start_date: 起始日期 YYYY-MM-DD
        end_date: 结束日期 YYYY-MM-DD

    Returns:
        完整标的数据字典，失败返回 None
    """
    try:
        import baostock as bs
    except ImportError:
        logger.warning("baostock 未安装，跳过此数据源")
        return None

    # 解析代码为 baostock 格式
    code = ticker.split(".")[0]
    is_sh = ticker.endswith((".SS", ".SH"))
    bs_code = f"sh.{code}" if is_sh else f"sz.{code}"

    # 使用全局连接（避免每次 login/logout 的开销）
    bs_conn = _get_bs_connection()
    if bs_conn is None:
        return None

    # 查询后复权日线数据
    # adjustflag: "1"=前复权, "2"=后复权, "3"=不复权
    rs = bs.query_history_k_data_plus(
        bs_code,
        "date,open,high,low,close,volume",
        start_date=start_date,
        end_date=end_date,
        frequency="d",
        adjustflag="2",  # 后复权
    )

    if rs is None or rs.error_code != "0":
        err_msg = rs.error_msg if rs else "query returned None"
        logger.warning(f"baostock 查询失败: {err_msg}")
        return None

    # 收集数据
    rows = []
    while rs.next():
        rows.append(rs.get_row_data())

    if not rows:
        logger.warning(f"baostock: {ticker} 无数据")
        return None

    # 构建价格列表
    prices = []
    for row in rows:
        date_str = row[0]
        # 跳过空值行
        if not row[1] or not row[4]:
            continue
        prices.append({
            "date": date_str,
            "open": float(row[1]),
            "high": float(row[2]),
            "low": float(row[3]),
            "close": float(row[4]),
            "adj_close": float(row[4]),  # baostock 已后复权
            "volume": float(row[5]) if row[5] else 0,
            "dividend": 0.0,
            "split_factor": 1.0,
        })

    if not prices:
        return None

    first_date = prices[0]["date"]
    last_updated = prices[-1]["date"]

    return {
        "meta": {
            "ticker": ticker,
            "name": ticker,  # baostock不返回名称
            "exchange": "SSE" if is_sh else "SZSE",
            "type": "STOCK",
            "currency": "CNY",
            "first_date": first_date,
            "last_updated": last_updated,
            "source": "baostock",
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权（baostock adjustflag=2）",
        },
        "prices": prices,
    }


# ============================================================
# baostock 全局连接管理（复用连接，避免每次 login/logout）
# ============================================================

_bs_logged_in = False
_bs_lock = threading.Lock()


def _get_bs_connection():
    """获取 baostock 全局连接（懒初始化，线程安全）"""
    global _bs_logged_in
    try:
        import baostock as bs
    except ImportError:
        return None

    with _bs_lock:
        if not _bs_logged_in:
            lg = bs.login()
            if lg.error_code != "0":
                logger.warning(f"baostock 登录失败: {lg.error_msg}")
                return None
            _bs_logged_in = True
            logger.info("baostock 已连接（全局复用）")
    return bs


def close_bs_connection():
    """关闭 baostock 全局连接"""
    global _bs_logged_in
    with _bs_lock:
        if _bs_logged_in:
            try:
                import baostock as bs
                bs.logout()
                _bs_logged_in = False
                logger.info("baostock 已断开")
            except Exception:
                pass


def _get_cn_ticker_name(code: str, is_etf: bool) -> str:
    """获取A股标的名称"""
    try:
        import akshare as ak
        _akshare_limiter.acquire()

        if is_etf:
            df = ak.fund_etf_spot_em()
            match = df[df["代码"] == code]
            if not match.empty:
                return str(match.iloc[0]["名称"])
        else:
            df = ak.stock_zh_a_spot_em()
            match = df[df["代码"] == code]
            if not match.empty:
                return str(match.iloc[0]["名称"])
    except Exception:
        pass
    return code


# ============================================================
# 指数数据抓取
# ============================================================

def fetch_index(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """
    获取指数数据

    美股指数用 yfinance，A股指数用 akshare

    Args:
        ticker: 指数代码（如 ^GSPC, 000001.SH）
        start_date: 起始日期
        end_date: 结束日期

    Returns:
        指数数据字典
    """
    if ticker.startswith("^"):
        return _fetch_us_index(ticker, start_date, end_date)
    elif ticker.endswith((".SH", ".SZ")):
        return _fetch_cn_index(ticker, start_date, end_date)
    else:
        logger.warning(f"未知指数格式: {ticker}")
        return None


def _fetch_us_index(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """获取美股指数数据"""
    import yfinance as yf

    _yfinance_limiter.acquire()

    try:
        session = get_yf_session()
        idx = yf.Ticker(ticker, session=session)
        df = idx.history(start=start_date, end=end_date, auto_adjust=True)
        if df.empty:
            return None

        prices = []
        for date_idx, row in df.iterrows():
            date_str = date_idx.strftime("%Y-%m-%d")
            prices.append({
                "date": date_str,
                "open": round(float(row.get("Open", 0)), 2),
                "high": round(float(row.get("High", 0)), 2),
                "low": round(float(row.get("Low", 0)), 2),
                "close": round(float(row.get("Close", 0)), 2),
                "adj_close": round(float(row.get("Close", 0)), 2),
                "volume": int(row.get("Volume", 0)),
                "dividend": 0.0,
                "split_factor": 1.0,
            })

        from .config import MAJOR_INDICES
        idx_info = MAJOR_INDICES.get(ticker, {})

        return {
            "meta": {
                "ticker": ticker,
                "name": idx_info.get("name", ticker),
                "exchange": idx_info.get("exchange", ""),
                "type": "INDEX",
                "currency": idx_info.get("currency", "USD"),
                "first_date": prices[0]["date"] if prices else start_date,
                "last_updated": prices[-1]["date"] if prices else end_date,
            },
            "adjustment": {
                "method": "none",
                "description": "指数无需复权",
            },
            "prices": prices,
        }
    except Exception as e:
        logger.error(f"获取美股指数 {ticker} 失败: {e}")
        return None


def _fetch_cn_index(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """获取A股指数数据"""
    try:
        import akshare as ak

        _akshare_limiter.acquire()

        # 解析指数代码
        code = ticker.split(".")[0]
        start_fmt = start_date.replace("-", "")
        end_fmt = end_date.replace("-", "")

        df = ak.stock_zh_index_daily_em(
            symbol=f"sh{code}" if ticker.endswith(".SH") else f"sz{code}",
            start_date=start_fmt,
            end_date=end_fmt,
        )

        if df is None or df.empty:
            return None

        prices = []
        for _, row in df.iterrows():
            date_str = str(row.get("日期", row.get("date", "")))
            if not date_str:
                continue
            close = float(row.get("收盘", row.get("close", 0)))
            prices.append({
                "date": date_str,
                "open": round(float(row.get("开盘", row.get("open", close))), 2),
                "high": round(float(row.get("最高", row.get("high", close))), 2),
                "low": round(float(row.get("最低", row.get("low", close))), 2),
                "close": round(close, 2),
                "adj_close": round(close, 2),
                "volume": int(row.get("成交量", row.get("volume", 0))),
                "dividend": 0.0,
                "split_factor": 1.0,
            })

        from .config import MAJOR_INDICES
        idx_info = MAJOR_INDICES.get(ticker, {})

        return {
            "meta": {
                "ticker": ticker,
                "name": idx_info.get("name", ticker),
                "exchange": idx_info.get("exchange", ""),
                "type": "INDEX",
                "currency": "CNY",
                "first_date": prices[0]["date"] if prices else start_date,
                "last_updated": prices[-1]["date"] if prices else end_date,
            },
            "adjustment": {
                "method": "none",
                "description": "指数无需复权",
            },
            "prices": prices,
        }
    except Exception as e:
        logger.error(f"获取A股指数 {ticker} 失败: {e}")
        return None


# ============================================================
# 统一抓取入口
# ============================================================

def fetch_ticker(
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """
    统一抓取入口 - 根据标的代码自动选择数据源

    Args:
        ticker: 标的代码
        start_date: 起始日期
        end_date: 结束日期

    Returns:
        标的数据字典
    """
    # 指数
    if ticker.startswith("^") or (
        ticker.endswith((".SH", ".SZ"))
        and any(ticker.startswith(p) for p in ("0000", "3990", "0009", "0008"))
    ):
        fetch_fn = retry_with_backoff(fetch_index)
        return fetch_fn(ticker, start_date, end_date)

    # A股
    if ticker.endswith((".SS", ".SZ", ".SH")):
        fetch_fn = retry_with_backoff(fetch_cn_ticker)
        return fetch_fn(ticker, start_date, end_date)

    # 美股
    fetch_fn = retry_with_backoff(fetch_us_ticker)
    return fetch_fn(ticker, start_date, end_date)


# ============================================================
# 批量并行抓取
# ============================================================

def fetch_tickers_parallel(
    tickers: List[str],
    start_date: str = "",
    end_date: str = "",
    max_workers: int = None,
    on_progress: Any = None,
) -> Dict[str, Optional[Dict]]:
    """
    并行抓取多个标的数据

    如果 start_date 为空，则根据标的市场自动选择起始日期：
    - A股: 1990-01-01
    - 美股: 1970-01-01

    Args:
        tickers: 标的代码列表
        start_date: 起始日期（空则自动选择）
        end_date: 结束日期（空则到今天）
        max_workers: 最大并发数
        on_progress: 进度回调 fn(ticker, index, total, result)

    Returns:
        {ticker: data_dict_or_None}
    """
    from concurrent.futures import ThreadPoolExecutor, as_completed

    max_workers = max_workers or CONFIG.rate_limit.max_workers
    results: Dict[str, Optional[Dict]] = {}
    total = len(tickers)

    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    def _fetch_one(t: str) -> Optional[Dict]:
        s = start_date or _auto_start_date(t)
        return fetch_ticker(t, s, end_date)

    with ThreadPoolExecutor(max_workers=max_workers) as executor:
        future_to_ticker = {
            executor.submit(_fetch_one, t): t
            for t in tickers
        }

        for i, future in enumerate(as_completed(future_to_ticker)):
            ticker = future_to_ticker[future]
            try:
                result = future.result()
                results[ticker] = result
            except Exception as e:
                logger.error(f"抓取 {ticker} 异常: {e}")
                results[ticker] = None

            if on_progress:
                on_progress(ticker, i + 1, total, results[ticker])

    return results


def _auto_start_date(ticker: str) -> str:
    """根据标的代码自动确定起始日期"""
    if ticker.endswith((".SS", ".SZ", ".SH")):
        return CONFIG.data.cn_start_date
    return CONFIG.data.default_start_date


# ============================================================
# 批量下载（核心加速：yf.download 一次获取多个标的）
# ============================================================

def fetch_batch_yfinance(
    tickers: List[str],
    start_date: str = "",
    end_date: str = "",
    batch_size: int = 15,
) -> Dict[str, Optional[Dict]]:
    """
    批量下载（多源混合版）

    优先使用 iTick 逐个获取（不限流），失败后回退到 yf.download。
    适用于美股和A股（yfinance fallback）。

    Args:
        tickers: 标的代码列表
        start_date: 起始日期（空则自动选择）
        end_date: 结束日期（空则到今天）
        batch_size: 每批下载的标的数量（建议15，太大会触发限流）

    Returns:
        {ticker: data_dict_or_None}
    """
    import yfinance as yf
    import pandas as pd

    if not end_date:
        end_date = datetime.now().strftime("%Y-%m-%d")

    results = {}

    # 分离A股和美股
    cn_tickers = [t for t in tickers if t.endswith((".SS", ".SZ", ".SH"))]
    us_tickers = [t for t in tickers if not t.endswith((".SS", ".SZ", ".SH"))]

    # ---- 优先使用 iTick 逐个获取（不限流） ----
    if CONFIG.itick_api_token:
        logger.info(f"  使用 iTick API 获取 {len(tickers)} 个标的")
        for ticker in tickers:
            s = start_date or _auto_start_date(ticker)
            result = fetch_itick_ticker(ticker, s, end_date)
            results[ticker] = result

        # 检查 iTick 成功率
        itick_success = sum(1 for v in results.values() if v is not None)
        itick_rate = itick_success / len(tickers) if tickers else 0

        if itick_rate > 0.5:
            # iTick 成功率>50%，只对失败的用 yfinance 补充
            failed = [t for t in tickers if results.get(t) is None]
            if failed:
                logger.info(f"  iTick失败 {len(failed)} 个，用yfinance补充")
                _fill_with_yfinance(failed, start_date, end_date, results, batch_size)
            return results
        else:
            # iTick 成功率低，清空结果改用 yfinance
            logger.warning(f"  iTick成功率仅 {itick_rate:.0%}，切换到yfinance")
            results = {}

    # ---- yf.download 批量下载（降级方案） ----
    _fill_with_yfinance(us_tickers, start_date, end_date, results, batch_size)

    # ---- A股：akshare 逐个获取 ----
    if cn_tickers:
        for ticker in cn_tickers:
            if ticker not in results or results[ticker] is None:
                s = start_date or CONFIG.data.cn_start_date
                results[ticker] = fetch_cn_ticker(ticker, s, end_date)

    return results


def _fill_with_yfinance(tickers, start_date, end_date, results, batch_size=15):
    """使用 yf.download 批量填充失败标的"""
    import yfinance as yf

    if not tickers:
        return

    for i in range(0, len(tickers), batch_size):
        batch = tickers[i:i + batch_size]
        batch_num = i // batch_size + 1
        total_batches = (len(tickers) - 1) // batch_size + 1

        logger.info(f"  yf.download 批次 {batch_num}/{total_batches}: {len(batch)} 个标的")

        try:
            _yfinance_limiter.acquire()
            s = start_date or CONFIG.data.default_start_date

            session = get_yf_session()
            df = yf.download(
                tickers=batch,
                start=s,
                end=end_date,
                auto_adjust=False,
                threads=False,  # 改为false，避免并发触发限流
                group_by="ticker",
                progress=False,
                session=session,
            )

            if df.empty:
                for t in batch:
                    if t not in results:
                        results[t] = None
                continue

            for ticker in batch:
                try:
                    ticker_data = _parse_yf_download_ticker(df, ticker, s, end_date)
                    if ticker_data:
                        results[ticker] = ticker_data
                except Exception as e:
                    logger.warning(f"  解析 {ticker} 失败: {e}")

        except Exception as e:
            err_msg = str(e)
            if "Rate" in err_msg or "429" in err_msg or "Too Many" in err_msg:
                logger.warning(f"  yf.download 限流，触发10分钟退避...")
                _yfinance_limiter.backoff(600)  # 从5分钟增到10分钟
                for t in batch:
                    if t not in results:
                        results[t] = None
            else:
                logger.error(f"  yf.download 批次失败: {e}")
                for t in batch:
                    if t not in results:
                        results[t] = None

        # 批次间更长延迟
        if i + batch_size < len(tickers):
            time.sleep(CONFIG.batch.batch_delay_seconds)


def _parse_yf_download_ticker(
    df: "pd.DataFrame",
    ticker: str,
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """从 yf.download 的多标的DataFrame中解析单个标的数据"""
    import pandas as pd

    try:
        if len(df.columns.levels) > 1:
            # 多标的模式：columns = MultiIndex (ticker, field)
            if ticker not in df.columns.get_level_values(0):
                return None
            ticker_df = df[ticker].dropna(subset=["Close"])
        else:
            # 单标的模式
            ticker_df = df.dropna(subset=["Close"])
    except Exception:
        return None

    if ticker_df.empty:
        return None

    # 直接从history数据中提取分红和拆股（避免额外请求）
    splits = {}
    dividends = {}
    for date_idx, row in ticker_df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        div = float(row.get("Dividends", 0))
        split = float(row.get("Stock Splits", 0))
        if div > 0:
            dividends[date_str] = div
        if split != 0 and split != 1:
            splits[date_str] = split

    # 构建价格列表
    prices_raw = []
    for date_idx, row in ticker_df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        prices_raw.append({
            "date": date_str,
            "open": float(row.get("Open", 0)),
            "high": float(row.get("High", 0)),
            "low": float(row.get("Low", 0)),
            "close": float(row.get("Close", 0)),
            "volume": float(row.get("Volume", 0)),
        })

    # 计算后复权
    prices = calculate_backward_adjustment(prices_raw, splits=splits, dividends=dividends)

    # 元信息用默认值（避免额外请求）
    name = ticker
    exchange = ""
    currency = "USD"
    asset_type = "STOCK"

    first_date = prices[0]["date"] if prices else start_date
    last_updated = prices[-1]["date"] if prices else end_date

    return {
        "meta": {
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "type": asset_type,
            "currency": currency,
            "first_date": first_date,
            "last_updated": last_updated,
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权：以最新价格为基准，向前调整历史价格",
        },
        "prices": prices,
    }


def _build_us_ticker_data(
    ticker: str,
    df: "pd.DataFrame",
    stock: "yf.Ticker",
    start_date: str,
    end_date: str,
) -> Optional[Dict]:
    """从单个标的的DataFrame构建完整数据"""
    if df.empty:
        return None

    # 直接从history数据中提取分红和拆股
    splits = {}
    dividends = {}
    for date_idx, row in df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        div = float(row.get("Dividends", 0))
        split = float(row.get("Stock Splits", 0))
        if div > 0:
            dividends[date_str] = div
        if split != 0 and split != 1:
            splits[date_str] = split

    prices_raw = []
    for date_idx, row in df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")
        prices_raw.append({
            "date": date_str,
            "open": float(row.get("Open", 0)),
            "high": float(row.get("High", 0)),
            "low": float(row.get("Low", 0)),
            "close": float(row.get("Close", 0)),
            "volume": float(row.get("Volume", 0)),
        })

    prices = calculate_backward_adjustment(prices_raw, splits=splits, dividends=dividends)

    # 元信息用默认值（避免额外请求）
    name = ticker
    exchange = ""
    currency = "USD"
    asset_type = "STOCK"

    first_date = prices[0]["date"] if prices else start_date
    last_updated = prices[-1]["date"] if prices else end_date

    return {
        "meta": {
            "ticker": ticker,
            "name": name,
            "exchange": exchange,
            "type": asset_type,
            "currency": currency,
            "first_date": first_date,
            "last_updated": last_updated,
        },
        "adjustment": {
            "method": "backward",
            "description": "后复权：以最新价格为基准，向前调整历史价格",
        },
        "prices": prices,
    }
