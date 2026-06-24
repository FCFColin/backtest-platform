"""
引擎配置 - 集中管理所有可调参数

包括：路径、速率限制、批次大小、重试策略、调度时间等
"""

from pathlib import Path
from dataclasses import dataclass, field
from typing import Dict, List


# ============================================================
# 项目根目录与数据路径
# ============================================================

PROJECT_ROOT = Path(__file__).parent.parent.parent.parent
DATA_DIR = PROJECT_ROOT / "data" / "market"

TICKERS_DIR = DATA_DIR / "tickers"
INDICES_DIR = DATA_DIR / "indices"
STATE_DIR = DATA_DIR / "state"
CACHE_DIR = DATA_DIR / "cache"

UNIVERSE_FILE = STATE_DIR / "universe.json"
PROGRESS_FILE = STATE_DIR / "progress.json"
SCHEDULE_FILE = STATE_DIR / "schedule.json"


# ============================================================
# 引擎配置数据类
# ============================================================

@dataclass
class RateLimitConfig:
    """速率限制配置（保守版，避免触发限流）"""
    # yfinance: 大幅降低（之前60/min太激进）
    yfinance_requests_per_minute: int = 30  # 从60降到30
    yfinance_requests_per_hour: int = 1000  # 从2000降到1000
    yfinance_min_interval_ms: int = 1500  # 从500ms增到1500ms

    # iTick: 免费版无明确限制，但保守起见
    itick_requests_per_minute: int = 60
    itick_min_interval_ms: int = 200

    # akshare: QPS > 10 会被封IP
    akshare_requests_per_minute: int = 8  # 从10降到8
    akshare_min_interval_ms: int = 2000  # 从1500增到2000

    # 并发工作线程数（更保守）
    max_workers: int = 1  # 从2降到1


@dataclass
class RetryConfig:
    """重试配置"""
    max_retries: int = 3
    base_delay_seconds: float = 2.0
    max_delay_seconds: float = 60.0
    backoff_factor: float = 2.0  # 指数退避因子


@dataclass
class BatchConfig:
    """批次处理配置"""
    # 每批处理的标的数量
    batch_size: int = 15  # 从30降到15（更保守）
    # 批次间延迟(秒)
    batch_delay_seconds: float = 3.0  # 从0.5增到3秒（批次间更长延迟）
    # 每处理N个标的保存一次进度
    progress_save_interval: int = 10  # 从20降到10（更频繁保存）


@dataclass
class DataConfig:
    """数据存储配置"""
    # 默认历史数据起始日期 - 尽可能获取全部历史
    default_start_date: str = "1970-01-01"
    # A股历史起始
    cn_start_date: str = "1990-01-01"
    # 单个标的JSON文件最大价格条目数（超过则分片）
    max_prices_per_file: int = 100000


@dataclass
class ScheduleConfig:
    """调度配置"""
    # 每日增量更新时间 (cron)
    daily_update_cron: str = "0 18 * * 1-5"  # 工作日18:00
    # 宇宙刷新周期（天）
    universe_refresh_days: int = 7
    # 全量更新周期（天），0表示不自动全量更新
    full_update_days: int = 0


@dataclass
class EngineConfig:
    """引擎总配置"""
    rate_limit: RateLimitConfig = field(default_factory=RateLimitConfig)
    retry: RetryConfig = field(default_factory=RetryConfig)
    batch: BatchConfig = field(default_factory=BatchConfig)
    data: DataConfig = field(default_factory=DataConfig)
    schedule: ScheduleConfig = field(default_factory=ScheduleConfig)

    # 日志级别
    log_level: str = "INFO"

    # 是否跳过已完成的标的（增量更新时）
    skip_completed: bool = True

    # iTick API Token（从环境变量读取，或直接设置）
    itick_api_token: str = ""

    # 数据源优先级：itick > yfinance > akshare
    source_priority: list = field(default_factory=lambda: ["itick", "yfinance", "akshare"])


# ============================================================
# 全局配置实例
# ============================================================

CONFIG = EngineConfig()


# ============================================================
# 市场标识
# ============================================================

MARKET_US = "US"
MARKET_CN = "CN"

# A股代码后缀映射
CN_SUFFIX_SH = ".SS"  # 上海
CN_SUFFIX_SZ = ".SZ"  # 深圳

# 标的类型
TYPE_ETF = "ETF"
TYPE_STOCK = "STOCK"
TYPE_INDEX = "INDEX"

# 主要指数代码
MAJOR_INDICES: Dict[str, Dict[str, str]] = {
    "^GSPC": {"name": "S&P 500", "currency": "USD", "exchange": "NYSE"},
    "^DJI": {"name": "Dow Jones Industrial Average", "currency": "USD", "exchange": "NYSE"},
    "^IXIC": {"name": "NASDAQ Composite", "currency": "USD", "exchange": "NASDAQ"},
    "^RUT": {"name": "Russell 2000", "currency": "USD", "exchange": "NYSE"},
    "^VIX": {"name": "CBOE Volatility Index", "currency": "USD", "exchange": "CBOE"},
    "^TNX": {"name": "10-Year Treasury Yield", "currency": "USD", "exchange": "CBOT"},
    "000001.SH": {"name": "上证指数", "currency": "CNY", "exchange": "SSE"},
    "399001.SZ": {"name": "深证成指", "currency": "CNY", "exchange": "SZSE"},
    "399006.SZ": {"name": "创业板指", "currency": "CNY", "exchange": "SZSE"},
    "000300.SH": {"name": "沪深300", "currency": "CNY", "exchange": "SSE"},
    "000905.SH": {"name": "中证500", "currency": "CNY", "exchange": "SSE"},
    "000852.SH": {"name": "中证1000", "currency": "CNY", "exchange": "SSE"},
}


def ensure_dirs() -> None:
    """确保所有数据目录存在"""
    for d in [TICKERS_DIR, INDICES_DIR, STATE_DIR, CACHE_DIR]:
        d.mkdir(parents=True, exist_ok=True)
