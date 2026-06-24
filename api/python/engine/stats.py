#!/usr/bin/env python3
"""
数据引擎统计工具
扫描本地缓存数据，生成详细统计报告
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime
from collections import defaultdict

DATA_DIR = Path(__file__).parent.parent.parent.parent / "data" / "market"
TICKERS_DIR = DATA_DIR / "tickers"
STATE_DIR = DATA_DIR / "state"
STATS_CACHE_FILE = STATE_DIR / "stats_cache.json"
STATS_CACHE_TTL = 300  # 5分钟缓存


def scan_tickers(force: bool = False):
    """扫描所有已缓存的标的，生成详细统计（带5分钟缓存）"""
    # 检查缓存
    if not force and STATS_CACHE_FILE.exists():
        try:
            with open(STATS_CACHE_FILE, "r", encoding="utf-8") as f:
                cached = json.load(f)
            cache_age = time.time() - os.path.getmtime(STATS_CACHE_FILE)
            if cache_age < STATS_CACHE_TTL:
                return cached
        except Exception:
            pass

    stats = {
        "generated_at": datetime.now().isoformat(),
        "total_cached": 0,
        "by_market": defaultdict(lambda: {"count": 0, "stocks": 0, "etfs": 0, "indices": 0}),
        "by_type": defaultdict(int),
        "by_exchange": defaultdict(int),
        "date_ranges": {
            "earliest": None,
            "latest": None,
        },
        "by_decade": defaultdict(int),  # 按数据起始年代分布
        "by_year_count": defaultdict(int),  # 按数据年数分布
        "coverage": {
            "tickers_with_5y_plus": 0,
            "tickers_with_10y_plus": 0,
            "tickers_with_20y_plus": 0,
            "avg_data_points": 0,
            "median_data_points": 0,
        },
        "data_quality": {
            "with_adj_close": 0,
            "with_dividends": 0,
            "with_splits": 0,
            "total_data_points": 0,
            "total_size_mb": 0,
        },
        "recent_updates": [],  # 最近更新的10个标的
        "sample_tickers": {  # 每类各5个样本
            "us_stock": [],
            "us_etf": [],
            "cn_stock": [],
            "cn_etf": [],
            "index": [],
        },
    }

    if not TICKERS_DIR.exists():
        return stats

    all_points = []
    all_sizes = []
    all_updates = []

    for fname in os.listdir(TICKERS_DIR):
        if not fname.endswith(".json"):
            continue

        fpath = TICKERS_DIR / fname
        try:
            fsize = os.path.getsize(fpath)
            all_sizes.append(fsize)
            stats["data_quality"]["total_size_mb"] += fsize

            with open(fpath, "r", encoding="utf-8") as f:
                data = json.load(f)

            meta = data.get("meta", {})
            prices = data.get("prices", [])
            ticker = meta.get("ticker", fname.replace(".json", ""))
            market = meta.get("market", "US" if not ticker.endswith((".SS", ".SZ")) else "CN")
            ttype = meta.get("type", "STOCK")
            exchange = meta.get("exchange", "")
            last_updated = meta.get("last_updated", "")

            n_points = len(prices)
            stats["total_cached"] += 1
            stats["by_type"][ttype] += 1
            stats["by_market"][market]["count"] += 1
            stats["by_exchange"][exchange] += 1

            if ttype == "STOCK":
                stats["by_market"][market]["stocks"] += 1
            elif ttype == "ETF":
                stats["by_market"][market]["etfs"] += 1
            elif ttype == "INDEX":
                stats["by_market"][market]["indices"] += 1

            if prices:
                first_date = prices[0].get("date", "")
                last_date = prices[-1].get("date", "")

                if first_date:
                    # 时间范围
                    if stats["date_ranges"]["earliest"] is None or first_date < stats["date_ranges"]["earliest"]:
                        stats["date_ranges"]["earliest"] = first_date
                    if stats["date_ranges"]["latest"] is None or last_date > stats["date_ranges"]["latest"]:
                        stats["date_ranges"]["latest"] = last_date

                    # 按年代分布
                    decade = first_date[:3] + "0s"
                    stats["by_decade"][decade] += 1

                    # 按数据年数分布
                    try:
                        start_y = int(first_date[:4])
                        end_y = int(last_date[:4])
                        years = end_y - start_y
                        bucket = f"{(years // 5) * 5}-{(years // 5) * 5 + 4}年"
                        stats["by_year_count"][bucket] += 1

                        if years >= 5:
                            stats["coverage"]["tickers_with_5y_plus"] += 1
                        if years >= 10:
                            stats["coverage"]["tickers_with_10y_plus"] += 1
                        if years >= 20:
                            stats["coverage"]["tickers_with_20y_plus"] += 1
                    except (ValueError, IndexError):
                        pass

                all_points.append(n_points)
                stats["data_quality"]["total_data_points"] += n_points

                # 数据质量
                has_adj = any(p.get("adj_close") for p in prices)
                has_div = any(p.get("dividend", 0) > 0 for p in prices)
                has_split = any(p.get("split_factor", 1) != 1 for p in prices)
                if has_adj:
                    stats["data_quality"]["with_adj_close"] += 1
                if has_div:
                    stats["data_quality"]["with_dividends"] += 1
                if has_split:
                    stats["data_quality"]["with_splits"] += 1

            # 样本
            sample_key = None
            if market == "US" and ttype == "STOCK":
                sample_key = "us_stock"
            elif market == "US" and ttype == "ETF":
                sample_key = "us_etf"
            elif market == "CN" and ttype == "STOCK":
                sample_key = "cn_stock"
            elif market == "CN" and ttype == "ETF":
                sample_key = "cn_etf"
            elif ttype == "INDEX":
                sample_key = "index"

            if sample_key and len(stats["sample_tickers"][sample_key]) < 5:
                stats["sample_tickers"][sample_key].append({
                    "ticker": ticker,
                    "name": meta.get("name", ""),
                    "first_date": prices[0].get("date", "") if prices else "",
                    "last_date": prices[-1].get("date", "") if prices else "",
                    "data_points": n_points,
                })

            # 最近更新
            if last_updated:
                all_updates.append({"ticker": ticker, "name": meta.get("name", ""), "updated": last_updated})

        except Exception as e:
            continue

    # 计算统计量
    if all_points:
        stats["coverage"]["avg_data_points"] = round(sum(all_points) / len(all_points))
        sorted_points = sorted(all_points)
        n = len(sorted_points)
        stats["coverage"]["median_data_points"] = sorted_points[n // 2]

    stats["data_quality"]["total_size_mb"] = round(stats["data_quality"]["total_size_mb"] / 1024 / 1024, 1)

    # 最近更新排序
    all_updates.sort(key=lambda x: x["updated"], reverse=True)
    stats["recent_updates"] = all_updates[:20]

    # 转换 defaultdict 为普通 dict
    stats["by_market"] = dict(stats["by_market"])
    stats["by_type"] = dict(stats["by_type"])
    stats["by_exchange"] = dict(stats["by_exchange"])
    stats["by_decade"] = dict(stats["by_decade"])
    stats["by_year_count"] = dict(stats["by_year_count"])

    # 保存缓存
    try:
        STATE_DIR.mkdir(parents=True, exist_ok=True)
        with open(STATS_CACHE_FILE, "w", encoding="utf-8") as f:
            json.dump(stats, f, ensure_ascii=False)
    except Exception:
        pass

    return stats


def get_universe_stats():
    """获取标的宇宙统计（从 universe.json）"""
    universe_file = STATE_DIR / "universe.json"
    if universe_file.exists():
        with open(universe_file, "r", encoding="utf-8") as f:
            data = json.load(f)
        return {
            "total": data.get("total_count", 0),
            "updated_at": data.get("updated_at", ""),
            "stats": data.get("stats", {}),
        }
    return {"total": 0, "updated_at": "", "stats": {}}


def get_progress():
    """获取更新进度"""
    progress_file = STATE_DIR / "progress.json"
    if progress_file.exists():
        with open(progress_file, "r", encoding="utf-8") as f:
            return json.load(f)
    return {}


if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "stats"
    if action == "stats":
        result = scan_tickers()
        print(json.dumps(result, ensure_ascii=False))
    elif action == "universe":
        result = get_universe_stats()
        print(json.dumps(result, ensure_ascii=False))
    elif action == "progress":
        result = get_progress()
        print(json.dumps(result, ensure_ascii=False))
