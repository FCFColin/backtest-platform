"""
更新调度器 - 管理全量/增量更新、断点续传、进度跟踪

功能：
- run_full_update(): 全量更新（首次运行或定期）
- run_incremental_update(): 增量更新（只获取新日期数据）
- resume_interrupted(): 断点续传
- get_progress(): 查看当前进度
- 进度持久化到 progress.json
- 每个标的数据保存为独立 JSON 文件
"""

import json
import logging
import time
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any, Callable, Dict, List, Optional, Tuple

from .config import (
    CONFIG, TICKERS_DIR, INDICES_DIR, STATE_DIR, PROGRESS_FILE,
    UNIVERSE_FILE, ensure_dirs,
)
from .universe import get_full_universe, get_ticker_market, get_ticker_type, TYPE_INDEX
from .fetcher import fetch_ticker, fetch_tickers_parallel, fetch_batch_yfinance, fetch_cn_ticker, clear_yfinance_cache

logger = logging.getLogger(__name__)


# ============================================================
# 进度管理
# ============================================================

class ProgressTracker:
    """进度跟踪器 - 持久化到 progress.json"""

    def __init__(self, progress_file: Path = PROGRESS_FILE):
        self.progress_file = progress_file
        self._data: Dict = self._load()

    def _load(self) -> Dict:
        """加载进度文件"""
        if self.progress_file.exists():
            try:
                with open(self.progress_file, "r", encoding="utf-8") as f:
                    return json.load(f)
            except Exception as e:
                logger.warning(f"加载进度文件失败: {e}")
        return {
            "mode": "",
            "started_at": "",
            "updated_at": "",
            "total": 0,
            "completed": 0,
            "failed": 0,
            "skipped": 0,
            "tickers": {},
        }

    def save(self) -> None:
        """保存进度文件"""
        self._data["updated_at"] = datetime.now().isoformat()
        try:
            with open(self.progress_file, "w", encoding="utf-8") as f:
                json.dump(self._data, f, ensure_ascii=False, indent=2)
        except Exception as e:
            logger.warning(f"保存进度文件失败: {e}")

    def init_run(self, mode: str, total: int) -> None:
        """初始化一次运行"""
        self._data = {
            "mode": mode,
            "started_at": datetime.now().isoformat(),
            "updated_at": datetime.now().isoformat(),
            "total": total,
            "completed": 0,
            "failed": 0,
            "skipped": 0,
            "tickers": {},
        }
        self.save()

    def mark_ticker(
        self,
        ticker: str,
        status: str,
        message: str = "",
        prices_count: int = 0,
    ) -> None:
        """
        标记单个标的的状态

        Args:
            ticker: 标的代码
            status: "completed" | "failed" | "skipped"
            message: 状态消息
            prices_count: 获取的价格条目数
        """
        self._data["tickers"][ticker] = {
            "status": status,
            "message": message,
            "prices_count": prices_count,
            "updated_at": datetime.now().isoformat(),
        }

        # 更新计数
        self._data["completed"] = sum(
            1 for t in self._data["tickers"].values() if t["status"] == "completed"
        )
        self._data["failed"] = sum(
            1 for t in self._data["tickers"].values() if t["status"] == "failed"
        )
        self._data["skipped"] = sum(
            1 for t in self._data["tickers"].values() if t["status"] == "skipped"
        )

    def get_ticker_status(self, ticker: str) -> Optional[str]:
        """获取标的当前状态"""
        info = self._data.get("tickers", {}).get(ticker)
        return info.get("status") if info else None

    def get_pending_tickers(self, all_tickers: List[str]) -> List[str]:
        """获取尚未完成的标的列表"""
        done = set(
            t for t, info in self._data.get("tickers", {}).items()
            if info.get("status") in ("completed", "skipped")
        )
        return [t for t in all_tickers if t not in done]

    @property
    def total(self) -> int:
        return self._data.get("total", 0)

    @property
    def completed(self) -> int:
        return self._data.get("completed", 0)

    @property
    def failed(self) -> int:
        return self._data.get("failed", 0)

    @property
    def skipped(self) -> int:
        return self._data.get("skipped", 0)

    @property
    def mode(self) -> str:
        return self._data.get("mode", "")

    @property
    def started_at(self) -> str:
        return self._data.get("started_at", "")

    def summary(self) -> Dict:
        """返回进度摘要"""
        return {
            "mode": self.mode,
            "started_at": self.started_at,
            "total": self.total,
            "completed": self.completed,
            "failed": self.failed,
            "skipped": self.skipped,
            "progress_pct": round(
                (self.completed + self.skipped) / max(self.total, 1) * 100, 1
            ),
        }


# ============================================================
# 数据存储
# ============================================================

def save_ticker_data(ticker: str, data: Dict) -> None:
    """
    保存标的数据到 JSON 文件

    指数保存到 indices/ 目录，其他保存到 tickers/ 目录

    Args:
        ticker: 标的代码
        data: 标的数据字典
    """
    ensure_dirs()

    ticker_type = get_ticker_type(ticker)
    if ticker_type == TYPE_INDEX:
        file_path = INDICES_DIR / f"{_safe_filename(ticker)}.json"
    else:
        file_path = TICKERS_DIR / f"{_safe_filename(ticker)}.json"

    try:
        with open(file_path, "w", encoding="utf-8") as f:
            json.dump(data, f, ensure_ascii=False)
    except Exception as e:
        logger.error(f"保存 {ticker} 数据失败: {e}")
        raise


def load_ticker_data(ticker: str) -> Optional[Dict]:
    """
    加载标的数据

    Args:
        ticker: 标的代码

    Returns:
        标的数据字典，不存在返回 None
    """
    ticker_type = get_ticker_type(ticker)
    if ticker_type == TYPE_INDEX:
        file_path = INDICES_DIR / f"{_safe_filename(ticker)}.json"
    else:
        file_path = TICKERS_DIR / f"{_safe_filename(ticker)}.json"

    if not file_path.exists():
        return None

    try:
        with open(file_path, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception as e:
        logger.warning(f"加载 {ticker} 数据失败: {e}")
        return None


def get_ticker_last_date(ticker: str) -> Optional[str]:
    """获取标的最后更新日期"""
    data = load_ticker_data(ticker)
    if data and "meta" in data:
        return data["meta"].get("last_updated")
    return None


def _safe_filename(ticker: str) -> str:
    """将 ticker 转为安全文件名"""
    return ticker.replace("^", "IDX_").replace(".", "_")


# ============================================================
# 增量更新逻辑
# ============================================================

def _get_incremental_date_range(ticker: str) -> Tuple[str, str]:
    """
    获取增量更新的日期范围

    如果标的数据已存在，从最后日期+1开始
    否则从默认起始日期开始

    Returns:
        (start_date, end_date)
    """
    end_date = datetime.now().strftime("%Y-%m-%d")

    # 检查已有数据
    last_date = get_ticker_last_date(ticker)
    if last_date:
        # 从最后日期的下一天开始
        try:
            last_dt = datetime.strptime(last_date, "%Y-%m-%d")
            start_date = (last_dt + timedelta(days=1)).strftime("%Y-%m-%d")
        except ValueError:
            start_date = CONFIG.data.default_start_date
    else:
        # 无数据，使用默认起始日期
        market = get_ticker_market(ticker)
        if market == "CN":
            start_date = CONFIG.data.cn_start_date
        else:
            start_date = CONFIG.data.default_start_date

    return start_date, end_date


def _merge_ticker_data(ticker: str, new_data: Dict) -> Dict:
    """
    合并增量数据到已有数据

    如果标的数据已存在，将新数据追加到已有价格列表末尾
    如果不存在，直接使用新数据

    Args:
        ticker: 标的代码
        new_data: 新获取的数据

    Returns:
        合并后的数据
    """
    existing = load_ticker_data(ticker)

    if not existing:
        return new_data

    # 合并价格列表
    existing_prices = existing.get("prices", [])
    new_prices = new_data.get("prices", [])

    if not new_prices:
        return existing

    # 去重：按日期合并，新数据覆盖旧数据
    price_map = {p["date"]: p for p in existing_prices}
    for p in new_prices:
        price_map[p["date"]] = p

    # 按日期排序
    merged_prices = sorted(price_map.values(), key=lambda x: x["date"])

    # 更新元信息
    merged = dict(existing)
    merged["prices"] = merged_prices
    merged["meta"]["last_updated"] = new_data["meta"].get(
        "last_updated", merged_prices[-1]["date"]
    )

    # 如果新数据的 first_date 更早，更新
    new_first = new_data["meta"].get("first_date", "")
    old_first = existing["meta"].get("first_date", "")
    if new_first and (not old_first or new_first < old_first):
        merged["meta"]["first_date"] = new_first

    # 重新计算后复权（因为新增数据可能影响复权因子）
    # 对于美股：需要基于完整的 splits/dividends 重新计算
    # 对于A股：akshare 的 hfq 已经是后复权，直接拼接即可
    # 这里简化处理：如果增量数据较少，直接拼接即可

    return merged


# ============================================================
# 调度器主类
# ============================================================

class Scheduler:
    """更新调度器"""

    def __init__(self):
        self.progress = ProgressTracker()

    def run_full_update(
        self,
        tickers: Optional[List[str]] = None,
        start_date: Optional[str] = None,
        end_date: Optional[str] = None,
        on_ticker_complete: Optional[Callable] = None,
    ) -> Dict:
        """
        全量更新（批量下载版）

        使用 yf.download 批量下载，一次获取80个标的，
        比逐个请求快10-50倍。

        Args:
            tickers: 指定标的列表（None则使用完整宇宙）
            start_date: 起始日期
            end_date: 结束日期
            on_ticker_complete: 单个标的完成回调

        Returns:
            更新结果摘要
        """
        ensure_dirs()

        # 清理 yfinance 缓存（修复 Cookie/Crumb 问题）
        clear_yfinance_cache()

        # 获取标的列表
        if tickers is None:
            universe = get_full_universe()
            ticker_list = [u["ticker"] for u in universe]
        else:
            ticker_list = tickers

        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")

        logger.info(f"全量更新: {len(ticker_list)} 个标的 (批量下载模式)")

        # 初始化进度
        self.progress.init_run("full", len(ticker_list))

        # 分离A股和美股
        cn_tickers = [t for t in ticker_list if t.endswith((".SS", ".SZ", ".SH"))]
        us_tickers = [t for t in ticker_list if not t.endswith((".SS", ".SZ", ".SH"))]

        processed = 0
        total = len(ticker_list)

        # ---- 美股：yf.download 批量下载 ----
        dl_batch_size = CONFIG.batch.batch_size  # 使用配置值(15)
        for i in range(0, len(us_tickers), dl_batch_size):
            batch = us_tickers[i:i + dl_batch_size]
            batch_num = i // dl_batch_size + 1
            total_batches = (len(us_tickers) - 1) // dl_batch_size + 1

            logger.info(f"美股批次 {batch_num}/{total_batches}: {len(batch)} 个标的")

            try:
                results = fetch_batch_yfinance(
                    batch,
                    start_date=start_date or "",
                    end_date=end_date,
                    batch_size=dl_batch_size,
                )

                for ticker, data in results.items():
                    if data:
                        save_ticker_data(ticker, data)
                        prices_count = len(data.get("prices", []))
                        self.progress.mark_ticker(
                            ticker, "completed",
                            f"获取 {prices_count} 条数据",
                            prices_count,
                        )
                    else:
                        self.progress.mark_ticker(ticker, "failed", "无数据")

                    processed += 1
                    if on_ticker_complete:
                        on_ticker_complete(ticker, processed, total)

            except Exception as e:
                logger.error(f"美股批次 {batch_num} 失败: {e}")
                for t in batch:
                    self.progress.mark_ticker(t, "failed", str(e))
                    processed += 1

            self.progress.save()

            # 批次间短暂延迟
            if i + dl_batch_size < len(us_tickers):
                time.sleep(CONFIG.batch.batch_delay_seconds)

        # ---- A股：逐个获取（akshare不支持批量） ----
        if cn_tickers:
            logger.info(f"开始获取 {len(cn_tickers)} 个A股标的")
            cn_start = start_date or CONFIG.data.cn_start_date

            for idx, ticker in enumerate(cn_tickers):
                try:
                    data = fetch_cn_ticker(ticker, cn_start, end_date)
                    if data:
                        save_ticker_data(ticker, data)
                        prices_count = len(data.get("prices", []))
                        self.progress.mark_ticker(
                            ticker, "completed",
                            f"获取 {prices_count} 条数据",
                            prices_count,
                        )
                    else:
                        self.progress.mark_ticker(ticker, "failed", "无数据")
                except Exception as e:
                    self.progress.mark_ticker(ticker, "failed", str(e))

                processed += 1
                if on_ticker_complete:
                    on_ticker_complete(ticker, processed, total)

                # 定期保存进度
                if idx % 20 == 0:
                    self.progress.save()

            self.progress.save()

        # 最终保存进度
        self.progress.save()

        summary = self.progress.summary()
        logger.info(
            f"全量更新完成: "
            f"成功 {summary['completed']}, "
            f"失败 {summary['failed']}, "
            f"跳过 {summary['skipped']}"
        )
        return summary

    def run_incremental_update(
        self,
        tickers: Optional[List[str]] = None,
        on_ticker_complete: Optional[Callable] = None,
    ) -> Dict:
        """
        增量更新

        只获取自上次更新以来的新数据。

        Args:
            tickers: 指定标的列表
            on_ticker_complete: 回调

        Returns:
            更新结果摘要
        """
        ensure_dirs()

        # 获取标的列表
        if tickers is None:
            universe = get_full_universe()
            ticker_list = [u["ticker"] for u in universe]
        else:
            ticker_list = tickers

        logger.info(f"增量更新: {len(ticker_list)} 个标的")

        # 初始化进度
        self.progress.init_run("incremental", len(ticker_list))

        batch_size = CONFIG.batch.batch_size
        total = len(ticker_list)
        processed = 0

        for batch_start in range(0, total, batch_size):
            batch = ticker_list[batch_start:batch_start + batch_size]

            for ticker in batch:
                start_date, end_date = _get_incremental_date_range(ticker)

                # 如果起始日期 >= 结束日期，说明已是最新
                if start_date >= end_date:
                    self.progress.mark_ticker(
                        ticker, "skipped", "已是最新"
                    )
                    logger.debug(f"  = {ticker}: 已是最新")
                    processed += 1
                    continue

                try:
                    data = fetch_ticker(ticker, start_date, end_date)
                    if data and data.get("prices"):
                        # 合并增量数据
                        merged = _merge_ticker_data(ticker, data)
                        save_ticker_data(ticker, merged)
                        new_count = len(data.get("prices", []))
                        self.progress.mark_ticker(
                            ticker, "completed",
                            f"增量 {new_count} 条",
                            new_count,
                        )
                        logger.info(f"  ↑ {ticker}: +{new_count} 条")
                    elif data and not data.get("prices"):
                        # 无新数据
                        self.progress.mark_ticker(
                            ticker, "skipped", "无新数据"
                        )
                        logger.debug(f"  = {ticker}: 无新数据")
                    else:
                        self.progress.mark_ticker(
                            ticker, "failed", "获取失败"
                        )
                        logger.warning(f"  ✗ {ticker}: 获取失败")
                except Exception as e:
                    self.progress.mark_ticker(
                        ticker, "failed", str(e)
                    )
                    logger.error(f"  ✗ {ticker}: {e}")

                processed += 1

                if processed % CONFIG.batch.progress_save_interval == 0:
                    self.progress.save()

                if on_ticker_complete:
                    on_ticker_complete(ticker, processed, total)

            if batch_start + batch_size < total:
                time.sleep(CONFIG.batch.batch_delay_seconds)

        self.progress.save()

        summary = self.progress.summary()
        logger.info(
            f"增量更新完成: "
            f"成功 {summary['completed']}, "
            f"失败 {summary['failed']}, "
            f"跳过 {summary['skipped']}"
        )
        return summary

    def resume_interrupted(
        self,
        on_ticker_complete: Optional[Callable] = None,
    ) -> Dict:
        """
        断点续传

        从 progress.json 中读取上次中断的位置，继续处理。

        Args:
            on_ticker_complete: 回调

        Returns:
            更新结果摘要
        """
        # 读取宇宙
        if not UNIVERSE_FILE.exists():
            logger.error("无标的宇宙数据，请先运行 universe 命令")
            return {"error": "无标的宇宙数据"}

        try:
            with open(UNIVERSE_FILE, "r", encoding="utf-8") as f:
                universe_data = json.load(f)
            all_tickers = [u["ticker"] for u in universe_data.get("tickers", [])]
        except Exception as e:
            logger.error(f"读取宇宙数据失败: {e}")
            return {"error": str(e)}

        # 获取待处理标的
        pending = self.progress.get_pending_tickers(all_tickers)

        if not pending:
            logger.info("无待处理标的，无需续传")
            return self.progress.summary()

        logger.info(
            f"断点续传: {len(pending)}/{len(all_tickers)} 个待处理"
        )

        # 根据上次模式继续
        mode = self.progress.mode
        if mode == "full":
            return self.run_full_update(
                tickers=pending,
                on_ticker_complete=on_ticker_complete,
            )
        elif mode == "incremental":
            return self.run_incremental_update(
                tickers=pending,
                on_ticker_complete=on_ticker_complete,
            )
        else:
            # 未知模式，默认增量更新
            logger.warning(f"未知模式 '{mode}'，使用增量更新")
            return self.run_incremental_update(
                tickers=pending,
                on_ticker_complete=on_ticker_complete,
            )

    def get_progress(self) -> Dict:
        """获取当前进度"""
        return self.progress.summary()

    def fetch_single(self, ticker: str, start_date: str = None, end_date: str = None) -> Dict:
        """
        抓取单个标的

        Args:
            ticker: 标的代码
            start_date: 起始日期
            end_date: 结束日期

        Returns:
            结果字典
        """
        if not end_date:
            end_date = datetime.now().strftime("%Y-%m-%d")
        if not start_date:
            market = get_ticker_market(ticker)
            start_date = CONFIG.data.cn_start_date if market == "CN" else CONFIG.data.default_start_date

        try:
            data = fetch_ticker(ticker, start_date, end_date)
            if data:
                save_ticker_data(ticker, data)
                return {
                    "status": "success",
                    "ticker": ticker,
                    "prices_count": len(data.get("prices", [])),
                    "first_date": data["meta"].get("first_date"),
                    "last_updated": data["meta"].get("last_updated"),
                }
            else:
                return {
                    "status": "failed",
                    "ticker": ticker,
                    "message": "无数据",
                }
        except Exception as e:
            return {
                "status": "failed",
                "ticker": ticker,
                "message": str(e),
            }

    def refetch_existing(self, on_ticker_complete: Optional[Callable] = None) -> Dict:
        """
        重新获取所有已有标的的完整历史数据

        用新的起始日期（1970/1990）重新下载已有标的，
        替换旧的时间范围不够长的数据。

        Args:
            on_ticker_complete: 回调

        Returns:
            更新结果摘要
        """
        ensure_dirs()

        # 收集已有标的
        existing_tickers = []
        for d in [TICKERS_DIR, INDICES_DIR]:
            if d.exists():
                for f in d.glob("*.json"):
                    try:
                        with open(f, "r", encoding="utf-8") as fh:
                            data = json.load(fh)
                        ticker = data.get("meta", {}).get("ticker", "")
                        if ticker:
                            existing_tickers.append(ticker)
                    except Exception:
                        continue

        if not existing_tickers:
            logger.info("无已有标的数据需要重新获取")
            return {"mode": "refetch", "total": 0, "completed": 0, "failed": 0}

        logger.info(f"重新获取 {len(existing_tickers)} 个已有标的的完整历史")

        # 使用全量更新逻辑
        return self.run_full_update(
            tickers=existing_tickers,
            on_ticker_complete=on_ticker_complete,
        )
