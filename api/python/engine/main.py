"""
市场数据引擎 - CLI 入口

用法:
    python -m engine.main full           # 全量更新
    python -m engine.main incremental    # 增量更新
    python -m engine.main resume         # 断点续传
    python -m engine.main status         # 查看进度
    python -m engine.main universe       # 刷新标的宇宙
    python -m engine.main fetch TICKER   # 抓取单个标的
    python -m engine.main info TICKER    # 查看标的信息
    python -m engine.main clear-cache    # 清理yfinance缓存
"""

import argparse
import json
import logging
import sys
import time
from datetime import datetime
from typing import Optional

from .config import CONFIG, ensure_dirs, TICKERS_DIR, INDICES_DIR, DATA_DIR
from .scheduler import Scheduler, load_ticker_data
from .universe import get_full_universe


# ============================================================
# 日志配置
# ============================================================

def setup_logging(level: str = "INFO") -> None:
    """配置日志"""
    logging.basicConfig(
        level=getattr(logging, level.upper(), logging.INFO),
        format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
        handlers=[
            logging.StreamHandler(sys.stdout),
        ],
    )


# ============================================================
# CLI 命令
# ============================================================

def cmd_full(args: argparse.Namespace) -> None:
    """全量更新"""
    scheduler = Scheduler()

    # 进度回调
    def on_complete(ticker: str, current: int, total: int) -> None:
        pct = current / max(total, 1) * 100
        print(
            f"  进度: {current}/{total} ({pct:.1f}%) - {ticker}",
            end="\r",
        )

    result = scheduler.run_full_update(
        start_date=args.start,
        end_date=args.end,
        on_ticker_complete=on_complete,
    )
    print()  # 换行
    _print_result(result)


def cmd_incremental(args: argparse.Namespace) -> None:
    """增量更新"""
    scheduler = Scheduler()

    def on_complete(ticker: str, current: int, total: int) -> None:
        pct = current / max(total, 1) * 100
        print(
            f"  进度: {current}/{total} ({pct:.1f}%) - {ticker}",
            end="\r",
        )

    result = scheduler.run_incremental_update(
        on_ticker_complete=on_complete,
    )
    print()
    _print_result(result)


def cmd_resume(args: argparse.Namespace) -> None:
    """断点续传"""
    scheduler = Scheduler()

    def on_complete(ticker: str, current: int, total: int) -> None:
        pct = current / max(total, 1) * 100
        print(
            f"  进度: {current}/{total} ({pct:.1f}%) - {ticker}",
            end="\r",
        )

    result = scheduler.resume_interrupted(
        on_ticker_complete=on_complete,
    )
    print()
    _print_result(result)


def cmd_status(args: argparse.Namespace) -> None:
    """查看进度"""
    scheduler = Scheduler()
    progress = scheduler.get_progress()

    print("=" * 60)
    print("市场数据引擎 - 进度状态")
    print("=" * 60)
    print(f"  模式:     {progress.get('mode', 'N/A')}")
    print(f"  开始时间: {progress.get('started_at', 'N/A')}")
    print(f"  总标的数: {progress.get('total', 0)}")
    print(f"  已完成:   {progress.get('completed', 0)}")
    print(f"  已失败:   {progress.get('failed', 0)}")
    print(f"  已跳过:   {progress.get('skipped', 0)}")
    print(f"  进度:     {progress.get('progress_pct', 0)}%")
    print()

    # 统计本地数据
    ticker_files = list(TICKERS_DIR.glob("*.json")) if TICKERS_DIR.exists() else []
    index_files = list(INDICES_DIR.glob("*.json")) if INDICES_DIR.exists() else []
    print(f"  本地标的数据: {len(ticker_files)} 个文件")
    print(f"  本地指数数据: {len(index_files)} 个文件")
    print()

    # 显示失败标的
    if progress.get("failed", 0) > 0:
        failed_tickers = [
            t for t, info in scheduler.progress._data.get("tickers", {}).items()
            if info.get("status") == "failed"
        ]
        if failed_tickers:
            print(f"  失败标的 ({min(len(failed_tickers), 20)} 个):")
            for t in failed_tickers[:20]:
                info = scheduler.progress._data["tickers"][t]
                print(f"    - {t}: {info.get('message', '未知错误')}")
            if len(failed_tickers) > 20:
                print(f"    ... 还有 {len(failed_tickers) - 20} 个")


def cmd_universe(args: argparse.Namespace) -> None:
    """刷新标的宇宙"""
    print("正在刷新标的宇宙...")
    universe = get_full_universe(force_refresh=True)

    # 统计
    markets = {}
    types = {}
    for item in universe:
        m = item.get("market", "UNKNOWN")
        t = item.get("type", "UNKNOWN")
        markets[m] = markets.get(m, 0) + 1
        types[t] = types.get(t, 0) + 1

    print(f"\n标的宇宙刷新完成: {len(universe)} 个标的")
    print("\n按市场:")
    for market, count in sorted(markets.items()):
        print(f"  {market}: {count}")
    print("\n按类型:")
    for type_name, count in sorted(types.items()):
        print(f"  {type_name}: {count}")


def cmd_fetch(args: argparse.Namespace) -> None:
    """抓取单个标的"""
    ticker = args.ticker
    print(f"正在抓取 {ticker}...")

    scheduler = Scheduler()
    result = scheduler.fetch_single(
        ticker=ticker,
        start_date=args.start,
        end_date=args.end,
    )

    if result["status"] == "success":
        print(f"✓ {ticker}: {result.get('prices_count', 0)} 条数据")
        print(f"  首个交易日: {result.get('first_date', 'N/A')}")
        print(f"  最后更新:   {result.get('last_updated', 'N/A')}")
    else:
        print(f"✗ {ticker}: {result.get('message', '未知错误')}")


def cmd_info(args: argparse.Namespace) -> None:
    """查看标的信息"""
    ticker = args.ticker
    data = load_ticker_data(ticker)

    if not data:
        print(f"未找到 {ticker} 的数据")
        return

    meta = data.get("meta", {})
    prices = data.get("prices", [])
    adj = data.get("adjustment", {})

    print("=" * 60)
    print(f"标的信息: {ticker}")
    print("=" * 60)
    print(f"  名称:     {meta.get('name', 'N/A')}")
    print(f"  交易所:   {meta.get('exchange', 'N/A')}")
    print(f"  类型:     {meta.get('type', 'N/A')}")
    print(f"  币种:     {meta.get('currency', 'N/A')}")
    print(f"  首交易日: {meta.get('first_date', 'N/A')}")
    print(f"  最后更新: {meta.get('last_updated', 'N/A')}")
    print(f"  复权方式: {adj.get('method', 'N/A')} - {adj.get('description', '')}")
    print(f"  数据条数: {len(prices)}")

    if prices:
        print(f"\n  最新数据:")
        latest = prices[-1]
        print(f"    日期:   {latest.get('date', 'N/A')}")
        print(f"    收盘:   {latest.get('close', 'N/A')}")
        print(f"    后复权: {latest.get('adj_close', 'N/A')}")
        print(f"    成交量: {latest.get('volume', 'N/A')}")
        print(f"    分红:   {latest.get('dividend', 0)}")
        print(f"    拆股:   {latest.get('split_factor', 1)}")

        # 计算总收益
        if len(prices) > 1:
            first_adj = prices[0].get("adj_close", 0)
            last_adj = prices[-1].get("adj_close", 0)
            if first_adj > 0:
                total_return = (last_adj / first_adj - 1) * 100
                first_date = prices[0].get("date", "")
                last_date = prices[-1].get("date", "")
                try:
                    d1 = datetime.strptime(first_date, "%Y-%m-%d")
                    d2 = datetime.strptime(last_date, "%Y-%m-%d")
                    years = (d2 - d1).days / 365.25
                    cagr = ((last_adj / first_adj) ** (1 / max(years, 0.01)) - 1) * 100 if years > 0 else 0
                except ValueError:
                    years = 0
                    cagr = 0
                print(f"\n  总收益率: {total_return:.2f}%")
                print(f"  年化收益: {cagr:.2f}% ({years:.1f}年)")


def cmd_refetch(args: argparse.Namespace) -> None:
    """重新获取已有标的的完整历史数据"""
    scheduler = Scheduler()

    def on_complete(ticker: str, current: int, total: int) -> None:
        pct = current / max(total, 1) * 100
        print(
            f"  进度: {current}/{total} ({pct:.1f}%) - {ticker}",
            end="\r",
        )

    result = scheduler.refetch_existing(on_ticker_complete=on_complete)
    print()
    _print_result(result)


def cmd_clear_cache(args: argparse.Namespace) -> None:
    """清理 yfinance 缓存"""
    from .fetcher import clear_yfinance_cache
    n = clear_yfinance_cache()
    print(f"已清理 {n} 个缓存目录")


# ============================================================
# 辅助函数
# ============================================================

def _print_result(result: dict) -> None:
    """打印更新结果"""
    print("\n" + "=" * 60)
    print("更新结果")
    print("=" * 60)
    print(f"  模式:     {result.get('mode', 'N/A')}")
    print(f"  总标的数: {result.get('total', 0)}")
    print(f"  已完成:   {result.get('completed', 0)}")
    print(f"  已失败:   {result.get('failed', 0)}")
    print(f"  已跳过:   {result.get('skipped', 0)}")
    print(f"  进度:     {result.get('progress_pct', 0)}%")


# ============================================================
# 主入口
# ============================================================

def main() -> None:
    """CLI 主入口"""
    parser = argparse.ArgumentParser(
        description="市场数据引擎 - 大规模行情数据获取与管理",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
示例:
  python -m engine.main full                    # 全量更新所有标的
  python -m engine.main full --start 2020-01-01 # 全量更新（指定起始日期）
  python -m engine.main incremental             # 增量更新
  python -m engine.main resume                  # 断点续传
  python -m engine.main refetch                 # 重新获取已有标的的完整历史
  python -m engine.main status                  # 查看进度
  python -m engine.main universe                # 刷新标的宇宙
  python -m engine.main fetch SPY               # 抓取单个标的
  python -m engine.main fetch 600519.SS         # 抓取A股标的
  python -m engine.main info SPY                # 查看标的信息
  python -m engine.main clear-cache             # 清理yfinance缓存
        """,
    )

    parser.add_argument(
        "--log-level",
        default="INFO",
        choices=["DEBUG", "INFO", "WARNING", "ERROR"],
        help="日志级别",
    )

    subparsers = parser.add_subparsers(dest="command", help="可用命令")

    # full - 全量更新
    full_parser = subparsers.add_parser("full", help="全量更新")
    full_parser.add_argument("--start", type=str, help="起始日期 (YYYY-MM-DD)")
    full_parser.add_argument("--end", type=str, help="结束日期 (YYYY-MM-DD)")

    # incremental - 增量更新
    inc_parser = subparsers.add_parser("incremental", help="增量更新")

    # resume - 断点续传
    subparsers.add_parser("resume", help="断点续传")

    # status - 查看进度
    subparsers.add_parser("status", help="查看进度")

    # universe - 刷新标的宇宙
    subparsers.add_parser("universe", help="刷新标的宇宙")

    # fetch - 抓取单个标的
    fetch_parser = subparsers.add_parser("fetch", help="抓取单个标的")
    fetch_parser.add_argument("ticker", type=str, help="标的代码")
    fetch_parser.add_argument("--start", type=str, help="起始日期")
    fetch_parser.add_argument("--end", type=str, help="结束日期")

    # info - 查看标的信息
    info_parser = subparsers.add_parser("info", help="查看标的信息")
    info_parser.add_argument("ticker", type=str, help="标的代码")

    # refetch - 重新获取已有标的完整历史
    subparsers.add_parser("refetch", help="重新获取已有标的完整历史（用新的起始日期）")

    # clear-cache - 清理yfinance缓存
    subparsers.add_parser("clear-cache", help="清理yfinance缓存（修复Cookie/Crumb问题）")

    args = parser.parse_args()

    # 配置日志
    setup_logging(args.log_level)

    # 确保目录存在
    ensure_dirs()

    # 分发命令
    commands = {
        "full": cmd_full,
        "incremental": cmd_incremental,
        "resume": cmd_resume,
        "status": cmd_status,
        "universe": cmd_universe,
        "fetch": cmd_fetch,
        "info": cmd_info,
        "refetch": cmd_refetch,
        "clear-cache": cmd_clear_cache,
    }

    if args.command in commands:
        commands[args.command](args)
    else:
        parser.print_help()


if __name__ == "__main__":
    main()
