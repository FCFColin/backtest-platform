"""
后复权/前复权处理模块

核心概念：
- 后复权（backward adjustment）：以最新价格为基准，向前调整历史价格
  adj_close = raw_close * cumulative_factor + cumulative_dividend
  用途：计算真实总收益（含分红再投资）

- 前复权（forward adjustment）：以最早价格为基准，向后调整后续价格
  用途：保持价格连续性，看历史走势

复权因子计算：
- 拆股（split）：1拆N → split_factor = 1/N，价格÷N
- 合股（reverse split）：N合1 → split_factor = N，价格×N
- 现金分红（dividend）：直接从价格中扣除
- 送股（stock dividend）：类似拆股

后复权公式：
  adj_close[i] = raw_close[i] × ∏(j=i+1..latest) split_factor[j]
                 + ∑(j=i+1..latest) dividend[j] × ∏(k=j+1..latest) split_factor[k]

前复权公式：
  adj_close[i] = raw_close[i] × ∏(j=earliest..i-1) split_factor[j]
                 - ∑(j=earliest..i-1) dividend[j] × ∏(k=earliest..j-1) split_factor[k]
"""

import logging
from typing import Dict, List, Optional, Tuple

logger = logging.getLogger(__name__)


# ============================================================
# 数据类型定义
# ============================================================

class PriceEntry:
    """单日价格条目"""
    __slots__ = ("date", "open", "high", "low", "close", "volume",
                 "dividend", "split_factor", "adj_close")

    def __init__(
        self,
        date: str,
        open: float,
        high: float,
        low: float,
        close: float,
        volume: float,
        dividend: float = 0.0,
        split_factor: float = 1.0,
        adj_close: float = 0.0,
    ):
        self.date = date
        self.open = open
        self.high = high
        self.low = low
        self.close = close
        self.volume = volume
        self.dividend = dividend
        self.split_factor = split_factor
        self.adj_close = adj_close

    def to_dict(self) -> Dict:
        return {
            "date": self.date,
            "open": round(self.open, 4),
            "high": round(self.high, 4),
            "low": round(self.low, 4),
            "close": round(self.close, 4),
            "adj_close": round(self.adj_close, 4),
            "volume": int(self.volume) if self.volume else 0,
            "dividend": round(self.dividend, 4),
            "split_factor": round(self.split_factor, 6),
        }


# ============================================================
# 后复权计算
# ============================================================

def calculate_backward_adjustment(
    prices: List[Dict],
    splits: Optional[Dict[str, float]] = None,
    dividends: Optional[Dict[str, float]] = None,
) -> List[Dict]:
    """
    计算后复权价格

    后复权以最新价格为基准，向前调整历史价格。
    这样最近一天的价格就是实际交易价格，历史价格被调高。

    Args:
        prices: 价格列表，每个元素包含 date, open, high, low, close, volume
        splits: 拆股数据 {date: split_factor}，如 {"2024-06-10": 0.25} 表示1拆4
        dividends: 分红数据 {date: dividend_amount}，如 {"2024-03-15": 0.82}
    
    Returns:
        添加了 adj_close, dividend, split_factor 字段的价格列表
    """
    if not prices:
        return []

    splits = splits or {}
    dividends = dividends or {}

    # 按日期排序（升序）
    sorted_prices = sorted(prices, key=lambda x: x["date"])

    # 为每个交易日标注 split 和 dividend
    entries: List[PriceEntry] = []
    for p in sorted_prices:
        date_str = p["date"]
        entry = PriceEntry(
            date=date_str,
            open=float(p.get("open", p.get("Close", 0))),
            high=float(p.get("high", p.get("High", 0))),
            low=float(p.get("low", p.get("Low", 0))),
            close=float(p.get("close", p.get("Close", 0))),
            volume=float(p.get("volume", p.get("Volume", 0))),
            dividend=float(dividends.get(date_str, 0.0)),
            split_factor=float(splits.get(date_str, 1.0)),
        )
        entries.append(entry)

    # 从最新日期向前计算累积复权因子
    # cumulative_split_factor: 从当前日到最新日的累积拆股因子
    # cumulative_dividend: 从当前日到最新日的累积分红（已调整拆股）
    n = len(entries)

    # 从后向前遍历
    cumulative_split = 1.0
    cumulative_dividend = 0.0

    for i in range(n - 1, -1, -1):
        entry = entries[i]

        # 后复权价格 = 原始价格 × 累积拆股因子 + 累积分红
        entry.adj_close = entry.close * cumulative_split + cumulative_dividend

        # 更新累积因子（注意顺序：先处理当日的分红，再处理当日的拆股）
        # 分红在除权日当天已经反映在价格中，需要加回来
        cumulative_dividend = (
            cumulative_dividend * entry.split_factor + entry.dividend * cumulative_split
        )
        cumulative_split *= entry.split_factor

    # 转换为字典列表
    return [e.to_dict() for e in entries]


# ============================================================
# 前复权计算
# ============================================================

def calculate_forward_adjustment(
    prices: List[Dict],
    splits: Optional[Dict[str, float]] = None,
    dividends: Optional[Dict[str, float]] = None,
) -> List[Dict]:
    """
    计算前复权价格

    前复权以最早价格为基准，向后调整后续价格。
    这样最早一天的价格就是实际交易价格，后续价格被调低。

    Args:
        prices: 价格列表
        splits: 拆股数据 {date: split_factor}
        dividends: 分红数据 {date: dividend_amount}
    
    Returns:
        添加了 adj_close, dividend, split_factor 字段的价格列表
    """
    if not prices:
        return []

    splits = splits or {}
    dividends = dividends or {}

    sorted_prices = sorted(prices, key=lambda x: x["date"])

    entries: List[PriceEntry] = []
    for p in sorted_prices:
        date_str = p["date"]
        entry = PriceEntry(
            date=date_str,
            open=float(p.get("open", p.get("Close", 0))),
            high=float(p.get("high", p.get("High", 0))),
            low=float(p.get("low", p.get("Low", 0))),
            close=float(p.get("close", p.get("Close", 0))),
            volume=float(p.get("volume", p.get("Volume", 0))),
            dividend=float(dividends.get(date_str, 0.0)),
            split_factor=float(splits.get(date_str, 1.0)),
        )
        entries.append(entry)

    # 从最早日期向后计算
    cumulative_split = 1.0
    cumulative_dividend = 0.0

    for i in range(len(entries)):
        entry = entries[i]

        # 前复权价格 = 原始价格 × 累积拆股因子 - 累积分红
        entry.adj_close = entry.close * cumulative_split - cumulative_dividend

        # 更新累积因子
        cumulative_dividend = (
            cumulative_dividend * entry.split_factor + entry.dividend * cumulative_split
        )
        cumulative_split *= entry.split_factor

    return [e.to_dict() for e in entries]


# ============================================================
# 公司行动合并
# ============================================================

def merge_corporate_actions(
    prices: List[Dict],
    actions: List[Dict],
) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    将公司行动（拆股、分红）合并到价格序列中

    Args:
        prices: 价格列表
        actions: 公司行动列表，每个元素包含:
            - date: 日期
            - action: "split" 或 "dividend"
            - value: 拆股比例（如 0.25 表示1拆4）或分红金额

    Returns:
        (splits, dividends) 两个字典
    """
    splits: Dict[str, float] = {}
    dividends: Dict[str, float] = {}

    for action in actions:
        date_str = action.get("date", "")
        action_type = action.get("action", "")
        value = float(action.get("value", 0))

        if not date_str:
            continue

        if action_type == "split":
            splits[date_str] = value
        elif action_type == "dividend":
            dividends[date_str] = value

    return splits, dividends


def parse_yfinance_actions(actions_df) -> Tuple[Dict[str, float], Dict[str, float]]:
    """
    解析 yfinance 返回的 actions DataFrame

    yfinance Ticker.actions 返回包含 Stock Splits 和 Dividends 列的 DataFrame

    Args:
        actions_df: yfinance 返回的 actions DataFrame

    Returns:
        (splits, dividends) 两个字典
    """
    splits: Dict[str, float] = {}
    dividends: Dict[str, float] = {}

    if actions_df is None or actions_df.empty:
        return splits, dividends

    for date_idx, row in actions_df.iterrows():
        date_str = date_idx.strftime("%Y-%m-%d")

        # 分红
        if "Dividends" in actions_df.columns:
            div = float(row.get("Dividends", 0))
            if div != 0:
                dividends[date_str] = div

        # 拆股
        if "Stock Splits" in actions_df.columns:
            split = float(row.get("Stock Splits", 0))
            if split != 0 and split != 1.0:
                splits[date_str] = split

    return splits, dividends


def parse_yfinance_splits(splits_series) -> Dict[str, float]:
    """解析 yfinance 返回的 splits Series"""
    result: Dict[str, float] = {}
    if splits_series is None or splits_series.empty:
        return result

    for date_idx, value in splits_series.items():
        if value != 0 and value != 1.0:
            date_str = date_idx.strftime("%Y-%m-%d")
            result[date_str] = float(value)

    return result


def parse_yfinance_dividends(dividends_series) -> Dict[str, float]:
    """解析 yfinance 返回的 dividends Series"""
    result: Dict[str, float] = {}
    if dividends_series is None or dividends_series.empty:
        return result

    for date_idx, value in dividends_series.items():
        if value != 0:
            date_str = date_idx.strftime("%Y-%m-%d")
            result[date_str] = float(value)

    return result


# ============================================================
# 从 akshare 后复权数据中提取复权因子
# ============================================================

def compute_adjustment_factor_from_hfq(
    raw_close: Dict[str, float],
    hfq_close: Dict[str, float],
) -> Dict[str, float]:
    """
    通过比较原始收盘价和后复权收盘价，计算每日复权因子

    adj_factor = hfq_close / raw_close

    这用于 akshare 场景：akshare 直接提供后复权价格，
    我们可以通过比值反推复权因子。

    Args:
        raw_close: {date: raw_close_price}
        hfq_close: {date: hfq_close_price}

    Returns:
        {date: adjustment_factor}
    """
    factors: Dict[str, float] = {}
    for date_str in raw_close:
        raw = raw_close.get(date_str, 0)
        hfq = hfq_close.get(date_str, 0)
        if raw > 0 and hfq > 0:
            factors[date_str] = hfq / raw
    return factors


def apply_hfq_adjustment(
    raw_prices: List[Dict],
    hfq_close_map: Dict[str, float],
) -> List[Dict]:
    """
    将 akshare 的后复权收盘价应用到价格列表

    对于 akshare 数据，后复权价格由服务端直接计算，
    我们只需要将后复权收盘价填入 adj_close 字段。

    Args:
        raw_prices: 原始价格列表（含 open, high, low, close, volume）
        hfq_close_map: {date: hfq_close_price} 后复权收盘价映射

    Returns:
        添加了 adj_close 字段的价格列表
    """
    result = []
    for p in raw_prices:
        date_str = p["date"]
        raw_close = float(p.get("close", 0))
        hfq_close = hfq_close_map.get(date_str, raw_close)

        # 计算复权因子
        adj_factor = hfq_close / raw_close if raw_close > 0 else 1.0

        entry = dict(p)
        entry["adj_close"] = round(hfq_close, 4)
        entry["adj_factor"] = round(adj_factor, 6)

        # 同时调整 OHLC（按相同比例）
        if adj_factor != 1.0:
            entry["adj_open"] = round(float(p.get("open", 0)) * adj_factor, 4)
            entry["adj_high"] = round(float(p.get("high", 0)) * adj_factor, 4)
            entry["adj_low"] = round(float(p.get("low", 0)) * adj_factor, 4)
        else:
            entry["adj_open"] = round(float(p.get("open", 0)), 4)
            entry["adj_high"] = round(float(p.get("high", 0)), 4)
            entry["adj_low"] = round(float(p.get("low", 0)), 4)

        result.append(entry)

    return result


# ============================================================
# 总收益率计算
# ============================================================

def calculate_total_return(prices: List[Dict]) -> float:
    """
    基于后复权价格计算总收益率

    total_return = (adj_close_last / adj_close_first) - 1

    Args:
        prices: 包含 adj_close 字段的价格列表（已排序）

    Returns:
        总收益率
    """
    if not prices or len(prices) < 2:
        return 0.0

    first = prices[0].get("adj_close", 0)
    last = prices[-1].get("adj_close", 0)

    if first <= 0:
        return 0.0

    return (last / first) - 1.0


def calculate_daily_returns(prices: List[Dict]) -> List[float]:
    """
    基于后复权价格计算日收益率序列

    Args:
        prices: 包含 adj_close 字段的价格列表（已排序）

    Returns:
        日收益率列表
    """
    if not prices or len(prices) < 2:
        return []

    returns = []
    for i in range(1, len(prices)):
        prev = prices[i - 1].get("adj_close", 0)
        curr = prices[i].get("adj_close", 0)
        if prev > 0:
            returns.append(curr / prev - 1.0)
        else:
            returns.append(0.0)

    return returns
