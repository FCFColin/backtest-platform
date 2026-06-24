//! 回测引擎核心模块。
//!
//! 本模块负责执行投资组合的历史回测，主要职责包括：
//! - 定义回测相关的输入/输出数据结构（组合、参数、结果等）
//! - 计算组合增长曲线、回撤曲线、滚动收益率等时间序列
//! - 计算各类统计指标（收益、风险、风险调整收益、基准对比等）
//! - 处理定期与一次性现金流、再平衡策略、通胀调整等业务逻辑
//! - 提供 [`run_backtest_internal`] 作为回测统一入口，供 HTTP 层调用

use chrono::{NaiveDate, Datelike};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// 默认无风险利率（年化），用于 Sharpe、Sortino、Alpha、M² 等指标计算。
const DEFAULT_RISK_FREE_RATE: f64 = 0.02;

// ===== 数据结构 =====

/// 单个资产的输入配置，包含资产代码与初始权重。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AssetInput {
    pub ticker: String,
    pub weight: f64,
}

/// 投资组合输入，描述一个待回测的组合及其再平衡、滑道等配置。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioInput {
    pub name: String,
    pub assets: Vec<AssetInput>,
    pub rebalance_frequency: String,
    #[serde(default)]
    pub rebalance_threshold: Option<f64>,
    #[serde(default)]
    #[allow(dead_code)]
    pub rebalance_offset: Option<u32>,
    #[serde(default)]
    pub drag: Option<f64>,
    #[serde(default = "default_true")]
    #[allow(dead_code)]
    pub total_return: Option<bool>,
    #[serde(default)]
    pub rebalance_bands: Option<RebalanceBands>,
    #[serde(default)]
    pub glidepath_to_weights: Option<Vec<f64>>,
    #[serde(default)]
    pub glidepath_years: Option<u32>,
}

fn default_true() -> Option<bool> { Some(true) }

/// 再平衡阈值带（Bands）配置，支持绝对/相对两种触发方式。
#[derive(Serialize, Deserialize, Clone, Default)]
#[serde(rename_all = "camelCase")]
pub struct RebalanceBands {
    #[serde(default)]
    pub absolute: Option<f64>,
    #[serde(default)]
    pub relative: Option<f64>,
}

/// 定期现金流的一条腿（leg），描述金额、类型、频率与结束时间。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CashflowLeg {
    pub amount: f64,
    #[serde(rename = "type")]
    pub cf_type: String,
    pub frequency: String,
    #[serde(default)]
    pub offset: u32,
    #[serde(default)]
    pub until: Option<String>,
}

/// 一次性现金流，在指定日期发生。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OneTimeCashflow {
    pub amount: f64,
    #[serde(rename = "type")]
    pub cf_type: String,
    pub date: String,
}

/// 回测全局参数，包括起止日期、初始资金、通胀调整、滚动窗口及基准等。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct BacktestParams {
    pub start_date: String,
    pub end_date: String,
    pub starting_value: f64,
    pub adjust_for_inflation: bool,
    pub rolling_window_months: u32,
    pub benchmark_ticker: String,
    #[serde(default)]
    pub extended_withdrawal_stats: bool,
    #[serde(default)]
    pub cashflow_legs: Vec<CashflowLeg>,
    #[serde(default)]
    pub one_time_cashflows: Vec<OneTimeCashflow>,
}

/// 增长曲线上的一个数据点，记录日期与对应组合价值。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct GrowthPoint {
    pub date: String,
    pub value: f64,
}

/// 回撤曲线上的一个数据点，记录日期与对应的回撤幅度。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DrawdownPoint {
    pub date: String,
    pub drawdown: f64,
}

/// 滚动收益率曲线上的一个数据点，记录日期与对应窗口的收益率。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RollingReturnPoint {
    pub date: String,
    #[serde(rename = "return")]
    pub return_val: f64,
}

/// 年度收益率数据点，记录年份与该年收益率。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AnnualReturnPoint {
    pub year: i32,
    #[serde(rename = "return")]
    pub return_val: f64,
}

/// 月度收益率数据点，记录年份、月份与该月收益率。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonthlyReturnPoint {
    pub year: i32,
    pub month: i32,
    #[serde(rename = "return")]
    pub return_val: f64,
}

fn is_zero(v: &f64) -> bool { *v == 0.0 }

/// 一次完整的回撤事件，从峰值到恢复的全过程统计。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DrawdownEpisode {
    pub peak_date: String,
    pub trough_date: String,
    pub recovery_date: Option<String>,
    pub depth: f64,
    pub time_to_trough: f64,   // years
    pub recovery_time: f64,    // years
    pub total_time: f64,       // years
    pub recovery_factor: f64,  // recovery_gain / depth
    pub cagr_during: f64,      // CAGR during drawdown period
    pub ulcer_during: f64,     // Ulcer Index during drawdown
    pub return_from_peak_to_trough: f64,
    pub return_from_trough_to_recovery: Option<f64>,
}

/// 回测统计指标集合，涵盖收益、风险、风险调整收益、基准对比及提款率等。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Statistics {
    // === 核心收益 ===
    pub cagr: f64,
    pub mwrr: f64,
    pub best_year: f64,
    pub worst_year: f64,
    pub avg_year: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_annual_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_monthly_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_daily_return: Option<f64>,

    // === 波动率 ===
    pub stdev: f64,  // annualized std dev of annual returns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdev_annual: Option<f64>,       // raw std dev of annual returns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdev_monthly: Option<f64>,      // annualized std dev of monthly returns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdev_monthly_raw: Option<f64>,  // raw std dev of monthly returns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdev_daily: Option<f64>,        // annualized std dev of daily returns
    #[serde(skip_serializing_if = "Option::is_none")]
    pub stdev_daily_raw: Option<f64>,    // raw std dev of daily returns

    // === 下行偏差 ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_deviation: Option<f64>,              // annualized, daily
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_deviation_daily_raw: Option<f64>,    // raw, daily
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_deviation_monthly: Option<f64>,      // annualized, monthly
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_deviation_monthly_raw: Option<f64>,  // raw, monthly
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_deviation_annual: Option<f64>,       // annual

    // === 回撤 ===
    pub max_drawdown: f64,
    pub max_drawdown_duration: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_drawdown: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ulcer_index: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub drawdown_recovery_factor: Option<f64>,

    // === 风险调整 ===
    pub sharpe: f64,
    pub sortino: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub calmar: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ulcer_performance_index: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub diversification_ratio: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub m2: Option<f64>,  // Modigliani-Modigliani measure

    // === 基准相关 ===
    #[serde(skip_serializing_if = "is_zero")]
    pub alpha: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub beta: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub r_squared: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub treynor: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub benchmark_correlation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upside_correlation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_correlation: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upside_beta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_beta: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpha_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub alpha_annualized: Option<f64>,

    // === 捕获率 ===
    #[serde(skip_serializing_if = "is_zero")]
    pub upside_capture: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub downside_capture: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upside_capture_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_capture_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub upside_capture_annual: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub downside_capture_annual: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_spread: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_spread_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub capture_spread_annual: Option<f64>,

    // === 主动管理 ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub active_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tracking_error: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub information_ratio: Option<f64>,

    // === VaR / CVaR ===
    #[serde(skip_serializing_if = "is_zero")]
    pub var_5: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub cvar_5: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_daily_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_daily_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_daily_10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_daily_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_daily_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_daily_10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_monthly_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_monthly_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_monthly_10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_monthly_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_monthly_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_monthly_10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_annual_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_annual_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub var_annual_10: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_annual_1: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_annual_5: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub cvar_annual_10: Option<f64>,

    // === 分布特征 ===
    #[serde(skip_serializing_if = "is_zero")]
    pub skewness: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub excess_kurtosis: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skewness_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skewness_monthly: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub skewness_annual: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excess_kurtosis_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excess_kurtosis_monthly: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub excess_kurtosis_annual: Option<f64>,

    // === 正收益比例 ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pct_positive_days: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pct_positive_months: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pct_positive_years: Option<f64>,

    // === 极值收益 ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_daily_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_daily_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_monthly_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_monthly_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub max_annual_return: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub min_annual_return: Option<f64>,

    // === 平均盈亏 & 盈亏比 ===
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_daily_gain: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_daily_loss: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gain_loss_ratio_daily: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_monthly_gain: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_monthly_loss: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gain_loss_ratio_monthly: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_annual_gain: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub avg_annual_loss: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub gain_loss_ratio_annual: Option<f64>,

    // === 提款率 ===
    #[serde(skip_serializing_if = "is_zero")]
    pub swr: f64,
    #[serde(skip_serializing_if = "is_zero")]
    pub pwr: f64,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swr_10y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pwr_10y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swr_20y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pwr_20y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swr_30y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pwr_30y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub swr_40y: Option<f64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub pwr_40y: Option<f64>,
}

/// 某一时点的资产配置快照，记录日期与各资产权重（0-1）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AllocationSnapshot {
    pub date: String,
    pub weights: Vec<f64>,  // 各资产权重(0-1)
}

/// 单个组合的完整回测结果，包含各类时间序列与统计指标。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PortfolioResult {
    pub name: String,
    pub growth_curve: Vec<GrowthPoint>,
    pub drawdown_curve: Vec<DrawdownPoint>,
    pub rolling_returns: Vec<RollingReturnPoint>,
    pub annual_returns: Vec<AnnualReturnPoint>,
    pub monthly_returns: Vec<MonthlyReturnPoint>,
    pub statistics: Statistics,
    #[serde(default)]
    pub drawdown_episodes: Vec<DrawdownEpisode>,
    #[serde(default)]
    pub allocation_history: Vec<AllocationSnapshot>,
}

/// 一次回测请求的最终输出，包含所有组合结果、相关性矩阵及基准曲线等。
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestResult {
    pub portfolios: Vec<PortfolioResult>,
    pub correlations: Vec<Vec<f64>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub benchmark_growth: Option<Vec<GrowthPoint>>,
    #[serde(default)]
    pub asset_tickers: Vec<String>,
    #[serde(default)]
    pub asset_correlations: Vec<Vec<f64>>,
}

/// 回测请求体，包含待回测组合、价格数据、全局参数及 CPI/汇率辅助数据。
#[derive(Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BacktestRequest {
    pub portfolios: Vec<PortfolioInput>,
    pub price_data: HashMap<String, HashMap<String, f64>>,
    pub params: BacktestParams,
    #[serde(default)]
    pub cpi_data: HashMap<String, f64>,  // date -> CPI value
    #[serde(default)]
    pub exchange_rates: HashMap<String, f64>,  // date -> USD/CNY rate
}

// ===== 辅助：查找CPI值 =====

/// 对于月度CPI数据，找到给定日期对应的CPI值
/// CPI数据格式为 "2024-01-01" -> value，月度频率
/// 对于某天，找到同月或之前最近的CPI值
fn find_cpi_for_date(date: &str, cpi_data: &HashMap<String, f64>) -> f64 {
    // 先尝试精确匹配
    if let Some(&v) = cpi_data.get(date) {
        return v;
    }
    // 尝试同月的第一天
    if date.len() < 7 {
        return 0.0;
    }
    let month_prefix = &date[..7]; // "YYYY-MM"
    let month_start = format!("{}-01", month_prefix);
    if let Some(&v) = cpi_data.get(&month_start) {
        return v;
    }
    // 向前搜索最近月份的CPI值
    if let Ok(d) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
        let mut search_date = d;
        for _ in 0..24 { // 最多回溯24个月
            search_date = match search_date.pred_opt() {
                Some(prev) => prev,
                None => break,
            };
            // 跳到该月1号
            let month_key = format!("{}-01", search_date.format("%Y-%m"));
            if let Some(&v) = cpi_data.get(&month_key) {
                return v;
            }
        }
    }
    0.0
}

// ===== 统计函数 =====

pub fn calc_cagr(start_value: f64, end_value: f64, years: f64) -> f64 {
    if !start_value.is_finite() || !end_value.is_finite() || !years.is_finite() { return 0.0; }
    if start_value <= 0.0 || end_value <= 0.0 || years <= 0.0 { return 0.0; }
    (end_value / start_value).powf(1.0 / years) - 1.0
}

/// MWRR: 二分法近似内部收益率
fn calc_mwrr(cashflows: &[(f64, f64)]) -> f64 {
    if cashflows.is_empty() { return 0.0; }
    let mut low = -0.99;
    let mut high = 10.0;
    for _ in 0..200 {
        let mid = (low + high) / 2.0;
        let npv: f64 = cashflows.iter().map(|(v, t)| v / (1.0_f64 + mid).powf(*t)).sum();
        if npv.abs() < 1e-8 { return mid; }
        if npv > 0.0 { low = mid; } else { high = mid; }
    }
    (low + high) / 2.0
}

pub fn calc_annualized_stdev(returns: &[f64]) -> f64 {
    if returns.len() < 2 { return 0.0; }
    let mean = returns.iter().sum::<f64>() / returns.len() as f64;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (returns.len() - 1) as f64;
    variance.sqrt() * 252.0_f64.sqrt()
}

pub fn calc_sharpe(cagr: f64, stdev: f64, risk_free_rate: f64) -> f64 {
    if stdev == 0.0 { return 0.0; }
    (cagr - risk_free_rate) / stdev
}

pub fn calc_sortino(cagr: f64, daily_returns: &[f64], risk_free_rate: f64) -> f64 {
    if daily_returns.len() < 2 { return 0.0; }
    let daily_rf = (1.0 + risk_free_rate).powf(1.0 / 252.0) - 1.0;
    let downside: Vec<f64> = daily_returns.iter()
        .filter_map(|&r| if r < daily_rf { Some((r - daily_rf).powi(2)) } else { None })
        .collect();
    if downside.is_empty() { return if cagr > risk_free_rate { 999.0 } else { 0.0 }; }
    let dd = (downside.iter().sum::<f64>() / daily_returns.len() as f64).sqrt() * 252.0_f64.sqrt();
    if dd == 0.0 { return 0.0; }
    (cagr - risk_free_rate) / dd
}

pub fn calc_max_drawdown(values: &[f64]) -> (f64, u32) {
    if values.len() < 2 { return (0.0, 0); }
    let mut max_dd = 0.0;
    let mut peak = values[0];
    let mut peak_idx: usize = 0;
    let mut max_dur: u32 = 0;
    for (i, &v) in values.iter().enumerate() {
        if v > peak { peak = v; peak_idx = i; }
        let dd = (peak - v) / peak;
        if dd > max_dd { max_dd = dd; }
        let dur = (i - peak_idx) as u32;
        if dur > max_dur && dd > 0.0 { max_dur = dur; }
    }
    (max_dd, max_dur)
}

pub fn calc_correlation(a: &[f64], b: &[f64]) -> f64 {
    let len = a.len().min(b.len());
    if len < 2 { return 0.0; }
    let ma = a[..len].iter().sum::<f64>() / len as f64;
    let mb = b[..len].iter().sum::<f64>() / len as f64;
    let (mut cov, mut va, mut vb) = (0.0, 0.0, 0.0);
    for i in 0..len {
        let da = a[i] - ma; let db = b[i] - mb;
        cov += da * db; va += da * da; vb += db * db;
    }
    if va == 0.0 || vb == 0.0 { return 0.0; }
    // 使用样本协方差/样本方差（除以 n-1），与 optimizer.rs 保持一致
    let sample_cov = cov / (len - 1) as f64;
    let sample_var_a = va / (len - 1) as f64;
    let sample_var_b = vb / (len - 1) as f64;
    sample_cov / (sample_var_a * sample_var_b).sqrt()
}

pub fn calc_daily_returns(values: &[f64]) -> Vec<f64> {
    let mut returns = Vec::with_capacity(values.len().saturating_sub(1));
    for i in 1..values.len() {
        if values[i - 1] == 0.0 { returns.push(0.0); }
        else { returns.push((values[i] - values[i - 1]) / values[i - 1]); }
    }
    returns
}

fn calc_monthly_return_values(monthly: &[MonthlyReturnPoint]) -> Vec<f64> {
    monthly.iter().map(|m| m.return_val).collect()
}

fn calc_var_5(monthly_returns: &[f64]) -> f64 {
    if monthly_returns.len() < 2 { return 0.0; }
    let mut sorted = monthly_returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (sorted.len() as f64 * 0.05) as usize;
    let idx = if idx == 0 { 1 } else { idx };
    if idx > sorted.len() { return 0.0; }
    -sorted[idx - 1]
}

fn calc_cvar_5(monthly_returns: &[f64], var_5: f64) -> f64 {
    if monthly_returns.is_empty() || var_5 == 0.0 { return 0.0; }
    let threshold = -var_5;
    let below: Vec<f64> = monthly_returns.iter().filter(|&&r| r <= threshold).copied().collect();
    if below.is_empty() { return var_5; }
    -below.iter().sum::<f64>() / below.len() as f64
}

fn calc_beta(port_monthly: &[f64], bench_monthly: &[f64]) -> f64 {
    let len = port_monthly.len().min(bench_monthly.len());
    if len < 2 { return 0.0; }
    let mp = port_monthly[..len].iter().sum::<f64>() / len as f64;
    let mb = bench_monthly[..len].iter().sum::<f64>() / len as f64;
    let mut cov = 0.0;
    let mut var_b = 0.0;
    for i in 0..len {
        let dp = port_monthly[i] - mp;
        let db = bench_monthly[i] - mb;
        cov += dp * db;
        var_b += db * db;
    }
    if var_b == 0.0 { return 0.0; }
    cov / var_b
}

fn calc_alpha(rp: f64, rf: f64, beta: f64, rb: f64) -> f64 {
    rp - (rf + beta * (rb - rf))
}

fn calc_r_squared(beta: f64, port_monthly: &[f64], bench_monthly: &[f64]) -> f64 {
    let len = port_monthly.len().min(bench_monthly.len());
    if len < 2 { return 0.0; }
    let mp = port_monthly[..len].iter().sum::<f64>() / len as f64;
    let mb = bench_monthly[..len].iter().sum::<f64>() / len as f64;
    let mut var_p = 0.0;
    let mut var_b = 0.0;
    for i in 0..len {
        var_p += (port_monthly[i] - mp).powi(2);
        var_b += (bench_monthly[i] - mb).powi(2);
    }
    if var_p == 0.0 || var_b == 0.0 { return 0.0; }
    beta * beta * var_b / var_p
}

pub fn calc_calmar(cagr: f64, max_drawdown: f64) -> f64 {
    if max_drawdown == 0.0 { return 0.0; }
    cagr / max_drawdown
}

fn calc_treynor(cagr: f64, rf: f64, beta: f64) -> f64 {
    if beta == 0.0 { return 0.0; }
    (cagr - rf) / beta
}

fn calc_upside_capture(port_monthly: &[f64], bench_monthly: &[f64]) -> f64 {
    let len = port_monthly.len().min(bench_monthly.len());
    if len < 2 { return 0.0; }
    let pos_bench: Vec<(f64, f64)> = (0..len)
        .filter(|&i| bench_monthly[i] > 0.0)
        .map(|i| (port_monthly[i], bench_monthly[i]))
        .collect();
    if pos_bench.is_empty() { return 0.0; }
    let avg_port = pos_bench.iter().map(|(p, _)| *p).sum::<f64>() / pos_bench.len() as f64;
    let avg_bench = pos_bench.iter().map(|(_, b)| *b).sum::<f64>() / pos_bench.len() as f64;
    if avg_bench == 0.0 { return 0.0; }
    avg_port / avg_bench * 100.0
}

fn calc_downside_capture(port_monthly: &[f64], bench_monthly: &[f64]) -> f64 {
    let len = port_monthly.len().min(bench_monthly.len());
    if len < 2 { return 0.0; }
    let neg_bench: Vec<(f64, f64)> = (0..len)
        .filter(|&i| bench_monthly[i] < 0.0)
        .map(|i| (port_monthly[i], bench_monthly[i]))
        .collect();
    if neg_bench.is_empty() { return 0.0; }
    let avg_port = neg_bench.iter().map(|(p, _)| *p).sum::<f64>() / neg_bench.len() as f64;
    let avg_bench = neg_bench.iter().map(|(_, b)| *b).sum::<f64>() / neg_bench.len() as f64;
    if avg_bench == 0.0 { return 0.0; }
    avg_port / avg_bench * 100.0
}

fn calc_swr(vals: &[f64], _dates: &[String]) -> f64 {
    if vals.is_empty() { return 0.0; }
    let sv = vals[0];
    if sv <= 0.0 { return 0.0; }
    if vals.len() < 360 { return 0.0; }
    let mut lo = 0.0_f64;
    let mut hi = 1.0_f64;
    for _ in 0..100 {
        let mid = (lo + hi) / 2.0;
        let mut balance = sv;
        let mut survived = true;
        for i in 1..vals.len() {
            if vals[i - 1] > 0.0 {
                let growth = vals[i] / vals[i - 1];
                balance = balance * growth - (mid / 252.0) * sv;
            }
            if balance <= 0.0 { survived = false; break; }
        }
        if survived { lo = mid; } else { hi = mid; }
    }
    lo
}

fn calc_pwr(cagr: f64) -> f64 {
    if cagr <= 0.0 { return 0.0; }
    cagr
}

pub fn calc_skewness(returns: &[f64]) -> f64 {
    let n = returns.len() as f64;
    if n < 3.0 { return 0.0; }
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / n;
    if variance == 0.0 { return 0.0; }
    let std_dev = variance.sqrt();
    let m3 = returns.iter().map(|r| ((r - mean) / std_dev).powi(3)).sum::<f64>() / n;
    m3 * (n * (n - 1.0)).sqrt() / (n - 2.0)
}

pub fn calc_excess_kurtosis(returns: &[f64]) -> f64 {
    let n = returns.len() as f64;
    if n < 4.0 { return 0.0; }
    let mean = returns.iter().sum::<f64>() / n;
    let variance = returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / n;
    if variance == 0.0 { return 0.0; }
    let std_dev = variance.sqrt();
    let m4 = returns.iter().map(|r| ((r - mean) / std_dev).powi(4)).sum::<f64>() / n;
    let kurt = m4;
    let correction = (n - 1.0) / ((n - 2.0) * (n - 3.0)) * ((n + 1.0) * kurt - 3.0 * (n - 1.0)) + 3.0;
    correction - 3.0
}

/// 计算指定分位数的VaR（Value at Risk）
fn calc_var_at_level(returns: &[f64], level: f64) -> Option<f64> {
    if returns.len() < 3 { return None; }
    let mut sorted: Vec<f64> = returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (sorted.len() as f64 * level).floor() as usize;
    if idx < sorted.len() { Some(sorted[idx]) } else { Some(sorted[0]) }
}

/// 计算指定分位数的CVaR（Conditional Value at Risk / Expected Shortfall）
fn calc_cvar_at_level(returns: &[f64], level: f64) -> Option<f64> {
    if returns.len() < 3 { return None; }
    let mut sorted: Vec<f64> = returns.to_vec();
    sorted.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let idx = (sorted.len() as f64 * level).floor().max(1.0) as usize;
    let tail: Vec<f64> = sorted[..idx].to_vec();
    if tail.is_empty() { None } else { Some(tail.iter().sum::<f64>() / tail.len() as f64) }
}

/// 计算特定期限的SWR（Safe Withdrawal Rate）
/// 找到在该期限内，使得最差滚动窗口期末值>=0的最大提取率
fn calc_swr_for_period(vals: &[f64], _dates: &[String], period_years: i32) -> Option<f64> {
    if vals.len() < 10 { return None; }
    let period_days = (period_years as f64 * 252.0) as usize;
    if vals.len() < period_days { return None; }

    let mut lo = 0.0_f64;
    let mut hi = 1.0_f64;
    for _ in 0..80 {
        let mid = (lo + hi) / 2.0;
        let mut all_survived = true;
        for start in 0..=(vals.len().saturating_sub(period_days)) {
            let sv = vals[start];
            if sv <= 0.0 { continue; }
            let mut balance = sv;
            for i in (start + 1)..(start + period_days) {
                if i >= vals.len() { break; }
                if vals[i - 1] > 0.0 {
                    let growth = vals[i] / vals[i - 1];
                    balance = balance * growth - (mid / 252.0) * sv;
                }
                if balance <= 0.0 { all_survived = false; break; }
            }
            if !all_survived { break; }
        }
        if all_survived { lo = mid; } else { hi = mid; }
    }
    if lo > 0.0 { Some(lo) } else { None }
}

/// 计算特定期限的PWR（Perpetual Withdrawal Rate）
/// PWR = CAGR使得期末值=期初值（通胀调整后）
fn calc_pwr_for_cagr(cagr: f64, _period_years: i32) -> Option<f64> {
    // 简化：PWR = CAGR（长期永续提取率等于实际增长率）
    Some(cagr)
}

/// 计算所有回撤事件（Drawdown Episodes）
fn calc_drawdown_episodes(vals: &[f64], dates: &[String]) -> Vec<DrawdownEpisode> {
    if vals.len() < 2 { return vec![]; }
    let mut episodes: Vec<DrawdownEpisode> = Vec::new();
    let mut peak = vals[0];
    let mut peak_idx: usize = 0;
    let mut in_drawdown = false;
    let mut trough = vals[0];
    let mut trough_idx: usize = 0;

    for (i, &v) in vals.iter().enumerate() {
        if v > peak {
            // 新高点
            if in_drawdown {
                // 回撤恢复，记录episode
                let depth = (peak - trough) / peak;
                if depth >= 0.05 {  // 只记录5%以上的回撤
                    let time_to_trough = (trough_idx - peak_idx) as f64 / 252.0;
                    let recovery_time = (i - trough_idx) as f64 / 252.0;
                    let total_time = (i - peak_idx) as f64 / 252.0;
                    let recovery_factor = if depth > 0.0 {
                        let recovery_gain = (vals[i] - trough) / trough;
                        recovery_gain / depth
                    } else { 0.0 };

                    // 计算回撤期间的CAGR
                    let cagr_during = calc_cagr(peak, trough, time_to_trough);

                    // 计算回撤期间的Ulcer Index
                    let dd_slice = &vals[peak_idx..=i.min(vals.len()-1)];
                    let dd_dates = &dates[peak_idx..=i.min(dates.len()-1)];
                    let dd_curve = calc_drawdown_curve(&dd_slice.to_vec(), &dd_dates.to_vec());
                    let ulcer_during = if dd_curve.is_empty() { 0.0 } else {
                        let mean_dd_sq = dd_curve.iter().map(|d| d.drawdown * d.drawdown).sum::<f64>() / dd_curve.len() as f64;
                        mean_dd_sq.sqrt()
                    };

                    let return_from_peak_to_trough = if peak > 0.0 { (trough - peak) / peak } else { 0.0 };
                    let return_from_trough_to_recovery = if trough > 0.0 { Some((vals[i] - trough) / trough) } else { None };

                    episodes.push(DrawdownEpisode {
                        peak_date: dates[peak_idx].clone(),
                        trough_date: dates[trough_idx].clone(),
                        recovery_date: Some(dates[i].clone()),
                        depth,
                        time_to_trough,
                        recovery_time,
                        total_time,
                        recovery_factor,
                        cagr_during,
                        ulcer_during,
                        return_from_peak_to_trough,
                        return_from_trough_to_recovery,
                    });
                }
                in_drawdown = false;
            }
            peak = v;
            peak_idx = i;
        } else if v < peak {
            let dd = (peak - v) / peak;
            if dd >= 0.05 && !in_drawdown {
                in_drawdown = true;
                trough = v;
                trough_idx = i;
            } else if in_drawdown && v < trough {
                trough = v;
                trough_idx = i;
            }
        }
    }

    // 如果回测结束时仍在回撤中
    if in_drawdown {
        let depth = (peak - trough) / peak;
        if depth >= 0.05 {
            let time_to_trough = (trough_idx - peak_idx) as f64 / 252.0;
            let recovery_time = (vals.len() - 1 - trough_idx) as f64 / 252.0;
            let total_time = (vals.len() - 1 - peak_idx) as f64 / 252.0;
            let recovery_factor = if depth > 0.0 && trough > 0.0 {
                let end_val = *vals.last().unwrap_or(&0.0);
                let recovery_gain = (end_val - trough) / trough;
                recovery_gain / depth
            } else { 0.0 };
            let cagr_during = calc_cagr(peak, trough, time_to_trough);
            let dd_slice = &vals[peak_idx..];
            let dd_dates = &dates[peak_idx..];
            let dd_curve = calc_drawdown_curve(&dd_slice.to_vec(), &dd_dates.to_vec());
            let ulcer_during = if dd_curve.is_empty() { 0.0 } else {
                let mean_dd_sq = dd_curve.iter().map(|d| d.drawdown * d.drawdown).sum::<f64>() / dd_curve.len() as f64;
                mean_dd_sq.sqrt()
            };
            let return_from_peak_to_trough = if peak > 0.0 { (trough - peak) / peak } else { 0.0 };
            let return_from_trough_to_recovery = None; // 未恢复

            episodes.push(DrawdownEpisode {
                peak_date: dates[peak_idx].clone(),
                trough_date: dates[trough_idx].clone(),
                recovery_date: None,  // 未恢复
                depth,
                time_to_trough,
                recovery_time,
                total_time,
                recovery_factor,
                cagr_during,
                ulcer_during,
                return_from_peak_to_trough,
                return_from_trough_to_recovery,
            });
        }
    }

    // 按depth降序排列
    episodes.sort_by(|a, b| b.depth.partial_cmp(&a.depth).unwrap_or(std::cmp::Ordering::Equal));
    episodes
}

// ===== 再平衡判断 =====

fn should_rebalance(freq: &str, prev: &str, curr: &str, threshold: Option<f64>,
    holdings: &[f64], weights: &[f64], pv: f64, rebalance_bands: Option<&RebalanceBands>) -> bool {
    let parse_date = |s: &str| NaiveDate::parse_from_str(s, "%Y-%m-%d").ok();
    // 1. 频率检查
    let freq_trigger = match freq {
        "daily" => true,
        "none" => false,
        "weekly" => {
            let p = parse_date(prev);
            let c = parse_date(curr);
            match (p, c) {
                (Some(pp), Some(cc)) => cc.iso_week().week() != pp.iso_week().week() || cc.year() != pp.year(),
                _ => false,
            }
        }
        "monthly" => {
            match (parse_date(prev), parse_date(curr)) {
                (Some(pp), Some(cc)) => cc.month() != pp.month() || cc.year() != pp.year(),
                _ => false,
            }
        }
        "quarterly" => {
            match (parse_date(prev), parse_date(curr)) {
                (Some(pp), Some(cc)) => {
                    (pp.month() - 1) / 3 != (cc.month() - 1) / 3 || pp.year() != cc.year()
                }
                _ => false,
            }
        }
        "annual" => {
            match (parse_date(prev), parse_date(curr)) {
                (Some(pp), Some(cc)) => pp.year() != cc.year(),
                _ => false,
            }
        }
        "threshold" => {
            if let Some(th) = threshold {
                if th <= 0.0 { return false; }
                for j in 0..holdings.len() {
                    if weights[j] == 0.0 { continue; }
                    let actual = holdings[j] / pv;
                    let dev = (actual - weights[j]).abs() / weights[j].abs() * 100.0;
                    if dev >= th { return true; }
                }
            }
            false
        }
        _ => {
            static WARNED: std::sync::Once = std::sync::Once::new();
            WARNED.call_once(|| {
                eprintln!("[WARN] Unknown rebalance frequency: '{}', skipping rebalance", freq);
            });
            false
        }
    };
    if freq_trigger { return true; }

    // 2. Bands检查：当频率未触发时，检查偏离带
    if let Some(bands) = rebalance_bands {
        for (i, w) in weights.iter().enumerate() {
            let actual = if pv > 0.0 { holdings[i] / pv } else { 0.0 };
            let drift = actual - w;
            // 绝对偏离检查
            if let Some(abs_band) = bands.absolute {
                if drift.abs() > abs_band / 100.0 {
                    return true;
                }
            }
            // 相对偏离检查
            if let Some(rel_band) = bands.relative {
                if *w > 0.0 && (drift.abs() / *w) > rel_band / 100.0 {
                    return true;
                }
            }
        }
    }

    false
}

// ===== 辅助计算 =====

pub fn calc_drawdown_curve(values: &[f64], dates: &[String]) -> Vec<DrawdownPoint> {
    let mut peak = if values.is_empty() { 0.0 } else { values[0] };
    let mut result = Vec::with_capacity(values.len());
    for (i, &v) in values.iter().enumerate() {
        if v > peak { peak = v; }
        let dd = if peak > 0.0 { (peak - v) / peak } else { 0.0 };
        result.push(DrawdownPoint { date: dates[i].clone(), drawdown: dd });
    }
    result
}

pub fn calc_rolling_returns(values: &[f64], dates: &[String], window_months: u32) -> Vec<RollingReturnPoint> {
    let window_days = (window_months as f64 * 252.0 / 12.0).round() as usize;
    let mut result = Vec::new();
    for i in window_days..values.len() {
        if values[i - window_days] > 0.0 {
            result.push(RollingReturnPoint {
                date: dates[i].clone(),
                return_val: values[i] / values[i - window_days] - 1.0,
            });
        }
    }
    result
}

pub fn calc_annual_returns(values: &[f64], dates: &[String]) -> Vec<AnnualReturnPoint> {
    if values.is_empty() || dates.is_empty() { return vec![]; }
    // 按年分组，记录每年最后一个交易日的值
    // 第一年使用第一个可用值作为起始值，后续年份使用上一年最后一个交易日的值
    let mut year_last: HashMap<i32, (f64, usize)> = HashMap::new(); // year -> (value, index)
    for (i, d) in dates.iter().enumerate() {
        if i >= values.len() { break; }
        if let Ok(nd) = NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            let year = nd.year();
            let entry = year_last.entry(year).or_insert((values[i], i));
            entry.0 = values[i];
            entry.1 = i;
        }
    }
    let mut sorted_years: Vec<i32> = year_last.keys().copied().collect();
    sorted_years.sort();
    if sorted_years.is_empty() { return vec![]; }
    let mut result: Vec<AnnualReturnPoint> = Vec::new();
    // 第一年：使用第一个可用值（values[0]）作为起始值
    let first_year = sorted_years[0];
    if let Some(&(first_val, _)) = year_last.get(&first_year) {
        if values[0] > 0.0 {
            result.push(AnnualReturnPoint { year: first_year, return_val: first_val / values[0] - 1.0 });
        }
    }
    // 后续年份：使用上一年最后一个交易日的值作为起始值
    for i in 1..sorted_years.len() {
        let year = sorted_years[i];
        let prev_year = sorted_years[i - 1];
        if let (Some(&(prev_val, _)), Some(&(curr_val, _))) = (year_last.get(&prev_year), year_last.get(&year)) {
            if prev_val > 0.0 {
                result.push(AnnualReturnPoint { year, return_val: curr_val / prev_val - 1.0 });
            }
        }
    }
    result
}

pub fn calc_monthly_returns(values: &[f64], dates: &[String]) -> Vec<MonthlyReturnPoint> {
    let mut month_map: HashMap<(i32, i32), (f64, f64)> = HashMap::new();
    for (i, d) in dates.iter().enumerate() {
        if i >= values.len() { break; }
        let nd = match NaiveDate::parse_from_str(d, "%Y-%m-%d") {
            Ok(nd) => nd,
            Err(_) => continue,
        };
        let year = nd.year();
        let month = nd.month() as i32;
        let key = (year, month);
        let entry = month_map.entry(key).or_insert((values[i], values[i]));
        entry.1 = values[i];
    }
    let mut result: Vec<MonthlyReturnPoint> = month_map.iter()
        .filter_map(|(&(year, month), (first, last))| {
            if *first > 0.0 {
                Some(MonthlyReturnPoint { year, month, return_val: last / first - 1.0 })
            } else { None }
        })
        .collect();
    result.sort_by(|a, b| a.year.cmp(&b.year).then(a.month.cmp(&b.month)));
    result
}

// ===== 辅助：构建周期性现金流日期映射 =====

fn build_periodic_cashflow_map(legs: &[CashflowLeg], dates: &[String]) -> HashMap<String, f64> {
    let mut map: HashMap<String, f64> = HashMap::new();
    for leg in legs {
        if leg.amount == 0.0 { continue; }
        let amt = if leg.cf_type == "withdrawal" { -leg.amount } else { leg.amount };
        let freq_days = match leg.frequency.as_str() {
            "weekly" => 5,     // 5个交易日
            "monthly" => 21,   // ~21个交易日
            "quarterly" => 63, // ~63个交易日
            "yearly" => 252,   // ~252个交易日
            _ => { eprintln!("[WARN] Unknown cashflow frequency: {}, treating as annual", leg.frequency); 252 },
        };
        let until_date = leg.until.clone().unwrap_or_else(|| "9999-99-99".to_string());
        let mut next_idx = 0usize;
        while next_idx < dates.len() {
            let idx = next_idx;
            next_idx = if idx + freq_days < dates.len() { idx + freq_days } else { break };
            if dates[next_idx] > until_date { break; }
            *map.entry(dates[next_idx].clone()).or_insert(0.0) += amt;
        }
    }
    map
}

// ===== 核心回测 =====

/// 执行单个投资组合的完整回测。
///
/// 该函数是回测引擎的核心，按日推进组合净值，处理再平衡、现金流（定期/一次性）、
/// 通胀调整与汇率换算，并汇总增长曲线、回撤、滚动/年度/月度收益率及全部统计指标。
///
/// # 参数
/// - `p`: 待回测的投资组合配置（资产、权重、再平衡策略等）
/// - `pd`: 价格数据，结构为 `ticker -> (date -> price)`
/// - `params`: 回测全局参数（起止日期、初始资金、通胀调整等）
/// - `cpi_data`: CPI 数据，`date -> CPI 值`，用于通胀调整
/// - `exchange_rates`: 汇率数据，`date -> USD/CNY`，用于多币种换算
///
/// # 返回值
/// 返回该组合的完整 [`PortfolioResult`]，包含各类时间序列与统计指标。
fn run_single(p: &PortfolioInput, pd: &HashMap<String, HashMap<String, f64>>, params: &BacktestParams, cpi_data: &HashMap<String, f64>, exchange_rates: &HashMap<String, f64>) -> PortfolioResult {
    let sv = params.starting_value;
    let weights: Vec<f64> = {
        let raw: Vec<f64> = p.assets.iter().map(|a| a.weight / 100.0).collect();
        let sum: f64 = raw.iter().sum();
        let n = raw.len();
        if sum == 0.0 {
            // 所有权重为零时使用等权重
            vec![1.0 / n as f64; n]
        } else if sum > 0.0 {
            raw.iter().map(|&w| w / sum).collect()
        } else {
            raw
        }
    };
    let empty_stats = Statistics { cagr: 0.0, mwrr: 0.0, best_year: 0.0, worst_year: 0.0, avg_year: 0.0,
        avg_annual_return: None, avg_monthly_return: None, avg_daily_return: None,
        stdev: 0.0, stdev_annual: None, stdev_monthly: None, stdev_monthly_raw: None, stdev_daily: None, stdev_daily_raw: None,
        downside_deviation: None, downside_deviation_daily_raw: None, downside_deviation_monthly: None, downside_deviation_monthly_raw: None, downside_deviation_annual: None,
        max_drawdown: 0.0, max_drawdown_duration: 0, avg_drawdown: None, ulcer_index: None, drawdown_recovery_factor: None,
        sharpe: 0.0, sortino: 0.0, calmar: 0.0, ulcer_performance_index: None, diversification_ratio: None, m2: None,
        alpha: 0.0, beta: 0.0, r_squared: 0.0, treynor: 0.0,
        benchmark_correlation: None, upside_correlation: None, downside_correlation: None,
        upside_beta: None, downside_beta: None, alpha_daily: None, alpha_annualized: None,
        upside_capture: 0.0, downside_capture: 0.0,
        upside_capture_daily: None, downside_capture_daily: None, upside_capture_annual: None, downside_capture_annual: None,
        capture_spread: None, capture_spread_daily: None, capture_spread_annual: None,
        active_return: None, tracking_error: None, information_ratio: None,
        var_5: 0.0, cvar_5: 0.0,
        var_daily_1: None, var_daily_5: None, var_daily_10: None, cvar_daily_1: None, cvar_daily_5: None, cvar_daily_10: None,
        var_monthly_1: None, var_monthly_5: None, var_monthly_10: None, cvar_monthly_1: None, cvar_monthly_5: None, cvar_monthly_10: None,
        var_annual_1: None, var_annual_5: None, var_annual_10: None, cvar_annual_1: None, cvar_annual_5: None, cvar_annual_10: None,
        skewness: 0.0, excess_kurtosis: 0.0,
        skewness_daily: None, skewness_monthly: None, skewness_annual: None,
        excess_kurtosis_daily: None, excess_kurtosis_monthly: None, excess_kurtosis_annual: None,
        pct_positive_days: None, pct_positive_months: None, pct_positive_years: None,
        max_daily_return: None, min_daily_return: None, max_monthly_return: None, min_monthly_return: None,
        max_annual_return: None, min_annual_return: None,
        avg_daily_gain: None, avg_daily_loss: None, gain_loss_ratio_daily: None,
        avg_monthly_gain: None, avg_monthly_loss: None, gain_loss_ratio_monthly: None,
        avg_annual_gain: None, avg_annual_loss: None, gain_loss_ratio_annual: None,
        swr: 0.0, pwr: 0.0,
        swr_10y: None, pwr_10y: None, swr_20y: None, pwr_20y: None,
        swr_30y: None, pwr_30y: None, swr_40y: None, pwr_40y: None,
    };

    if p.assets.is_empty() {
        return PortfolioResult {
            name: p.name.clone(), growth_curve: vec![], drawdown_curve: vec![],
            rolling_returns: vec![], annual_returns: vec![], monthly_returns: vec![],
            statistics: empty_stats, drawdown_episodes: vec![], allocation_history: vec![],
        };
    }

    // 收集日期（仅使用组合内资产的日期，不包含基准的日期）
    // 基准可能有更早的数据（如 SPY 从 1993 开始），但组合资产可能更晚（如 VTI 从 2001 开始）
    // 如果包含基准独有的日期，组合资产在该日期价格为 0，会导致组合被"清盘"
    let start_limit = if params.start_date.is_empty() { String::new() } else { params.start_date.clone() };
    let end_limit = if params.end_date.is_empty() { "9999-12-31".to_string() } else { params.end_date.clone() };
    let mut dates: Vec<String> = Vec::new();
    for a in &p.assets {
        if let Some(prices) = pd.get(&a.ticker) {
            for d in prices.keys() {
                if d >= &start_limit && d <= &end_limit { dates.push(d.clone()); }
            }
        }
    }
    dates.sort(); dates.dedup();

    if dates.is_empty() {
        return PortfolioResult {
            name: p.name.clone(), growth_curve: vec![], drawdown_curve: vec![],
            rolling_returns: vec![], annual_returns: vec![], monthly_returns: vec![],
            statistics: empty_stats, drawdown_episodes: vec![], allocation_history: vec![],
        };
    }

    let gp = |ticker: &str, date: &str| -> f64 {
        let raw = pd.get(ticker).and_then(|m| m.get(date)).copied().unwrap_or(0.0);
        if raw <= 0.0 { return 0.0; }
        // 如果有汇率数据，将USD价格转为CNY
        if !exchange_rates.is_empty() {
            if let Some(&rate) = exchange_rates.get(date) {
                return raw * rate;
            }
            // 回溯查找最近日期的汇率
            if let Ok(d) = NaiveDate::parse_from_str(date, "%Y-%m-%d") {
                let mut search = d;
                for _ in 0..10 {
                    search = match search.pred_opt() { Some(p) => p, None => break };
                    if let Some(&rate) = exchange_rates.get(&search.format("%Y-%m-%d").to_string()) {
                        return raw * rate;
                    }
                }
            }
        }
        raw
    };

    let mut holdings: Vec<f64> = weights.iter().map(|&w| sv * w).collect();
    let mut last_prices: Vec<f64> = vec![0.0; p.assets.len()];
    let mut liquidated = false;
    let mut gc: Vec<GrowthPoint> = Vec::with_capacity(dates.len());
    let mut vals: Vec<f64> = Vec::with_capacity(dates.len());
    let mut prev = dates[0].clone();

    // Drag: 年化拖累百分比转为日拖累因子
    let daily_drag = if let Some(drag) = p.drag {
        if drag > 0.0 { (1.0 - drag / 100.0).powf(1.0 / 252.0) } else { 1.0 }
    } else { 1.0 };

    // Glidepath: 目标权重和渐变年数
    // 验证 glidepath_to_weights 长度与 assets 长度一致
    let glidepath_to: Option<&Vec<f64>> = if let Some(ref gp_w) = p.glidepath_to_weights {
        if !gp_w.is_empty() && gp_w.len() != p.assets.len() {
            eprintln!("[WARN] glidepath_to_weights length ({}) != assets length ({}), ignoring glidepath", gp_w.len(), p.assets.len());
            None
        } else if gp_w.is_empty() {
            None
        } else {
            Some(gp_w)
        }
    } else {
        None
    };
    let glidepath_years = p.glidepath_years.unwrap_or(10) as f64;

    // 预处理一次性现金流：按日期索引
    let otc_map: HashMap<String, f64> = params.one_time_cashflows.iter()
        .filter_map(|cf| {
            let amt = if cf.cf_type == "withdrawal" { -cf.amount } else { cf.amount };
            if amt != 0.0 { Some((cf.date.clone(), amt)) } else { None }
        })
        .collect();

    // 预处理周期性现金流：计算每个日期的现金流
    let cf_map: HashMap<String, f64> = build_periodic_cashflow_map(&params.cashflow_legs, &dates);

    let init_prices: Vec<f64> = p.assets.iter().map(|a| gp(&a.ticker, &dates[0])).collect();
    let mut shares: Vec<f64> = holdings.iter().zip(init_prices.iter())
        .map(|(&h, &pr)| if pr > 0.0 { h / pr } else { 0.0 }).collect();

    // 逐日权重记录（采样策略：每20个交易日 + 调仓日）
    let mut alloc_hist: Vec<AllocationSnapshot> = Vec::new();
    let mut last_rebalance_di: usize = 0;

    // MWRR: 收集所有现金流 (amount, time_in_years)
    let mut mwrr_cashflows: Vec<(f64, f64)> = Vec::new();
    mwrr_cashflows.push((-sv, 0.0)); // 初始投资

    for (di, date) in dates.iter().enumerate() {
        if liquidated {
            gc.push(GrowthPoint { date: date.clone(), value: 0.0 });
            vals.push(0.0); prev = date.clone(); continue;
        }
        for (i, a) in p.assets.iter().enumerate() {
            let pr = gp(&a.ticker, date);
            if pr > 0.0 { last_prices[i] = pr; }
            let effective_pr = if pr > 0.0 { pr } else { last_prices[i] };
            if effective_pr > 0.0 { holdings[i] = shares[i] * effective_pr; }
        }
        let mut pv: f64 = holdings.iter().sum();

        // 应用年化拖累
        if daily_drag != 1.0 {
            for h in holdings.iter_mut() { *h *= daily_drag; }
            pv = holdings.iter().sum();
        }

        // 计算当前日期的目标权重（Glidepath线性插值）
        let current_weights: Vec<f64> = if let Some(to_w) = glidepath_to {
            let years_elapsed = di as f64 / 252.0;
            let progress = (years_elapsed / glidepath_years).min(1.0);
            weights.iter().zip(to_w.iter())
                .map(|(&from, &to)| from + (to - from) * progress)
                .collect()
        } else {
            weights.clone()
        };

        // 应用现金流（周期性 + 一次性）
        let cf_amount = cf_map.get(date).copied().unwrap_or(0.0)
            + otc_map.get(date).copied().unwrap_or(0.0);
        if cf_amount != 0.0 {
            // 记录现金流用于MWRR计算
            let cf_time = di as f64 / 252.0;
            mwrr_cashflows.push((cf_amount, cf_time));
            pv += cf_amount;
            if pv <= 0.0 {
                liquidated = true; pv = 0.0;
                holdings.iter_mut().for_each(|h| *h = 0.0);
                gc.push(GrowthPoint { date: date.clone(), value: 0.0 });
                vals.push(0.0); prev = date.clone(); continue;
            }
            // 按当前权重分配现金流到各资产
            for (i, _) in p.assets.iter().enumerate() {
                holdings[i] = pv * current_weights[i];
            }
            // 重新计算份额
            for (i, a) in p.assets.iter().enumerate() {
                let pr = gp(&a.ticker, date);
                if pr > 0.0 { last_prices[i] = pr; }
                let effective_pr = if pr > 0.0 { pr } else { last_prices[i] };
                shares[i] = if effective_pr > 0.0 { holdings[i] / effective_pr } else { 0.0 };
            }
        }

        if pv <= 0.0 {
            liquidated = true; pv = 0.0;
            holdings.iter_mut().for_each(|h| *h = 0.0);
            gc.push(GrowthPoint { date: date.clone(), value: 0.0 });
            vals.push(0.0); prev = date.clone(); continue;
        }
        if di > 0 && should_rebalance(&p.rebalance_frequency, &prev, date, p.rebalance_threshold, &holdings, &current_weights, pv, p.rebalance_bands.as_ref()) {
            for (i, _) in p.assets.iter().enumerate() { holdings[i] = pv * current_weights[i]; }
            for (i, a) in p.assets.iter().enumerate() {
                let pr = gp(&a.ticker, date);
                if pr > 0.0 { last_prices[i] = pr; }
                let effective_pr = if pr > 0.0 { pr } else { last_prices[i] };
                shares[i] = if effective_pr > 0.0 { holdings[i] / effective_pr } else { 0.0 };
            }
            last_rebalance_di = di;
        }
        gc.push(GrowthPoint { date: date.clone(), value: pv });
        vals.push(pv);

        // 记录权重快照：每20个交易日 或 调仓日 必定记录
        let is_sample_day = di % 20 == 0;
        let is_rebalance_day = di == last_rebalance_di && di > 0;
        if is_sample_day || is_rebalance_day {
            let current_weights: Vec<f64> = holdings.iter().map(|&h| if pv > 0.0 { h / pv } else { 0.0 }).collect();
            alloc_hist.push(AllocationSnapshot { date: date.clone(), weights: current_weights });
        }

        prev = date.clone();
    }

    // 通胀调整：将名义值转为实际值
    if params.adjust_for_inflation && !cpi_data.is_empty() {
        // 找到起始日期的CPI值
        let start_cpi = find_cpi_for_date(&dates[0], cpi_data);
        if start_cpi > 0.0 {
            for (i, date) in dates.iter().enumerate() {
                let date_cpi = find_cpi_for_date(date, cpi_data);
                if date_cpi > 0.0 {
                    let real_value = vals[i] * (start_cpi / date_cpi);
                    gc[i].value = real_value;
                    vals[i] = real_value;
                }
            }
        }
    }

    // 统计
    let fv = *vals.last().unwrap_or(&0.0);
    let last_date = dates.last().map(|s| s.as_str()).unwrap_or("");
    let years = match (NaiveDate::parse_from_str(&dates[0], "%Y-%m-%d"), NaiveDate::parse_from_str(last_date, "%Y-%m-%d")) {
        (Ok(d1), Ok(d2)) => (d2 - d1).num_days() as f64 / 365.25,
        _ => dates.len() as f64 / 252.0,
    };
    let cagr = if fv > 0.0 && !liquidated { calc_cagr(sv, fv, years) } else if liquidated {
        // 清算时使用清算时刻的实际值计算CAGR
        // 找到清算发生的时间点
        let liquidation_idx = vals.iter().rposition(|&v| v > 0.0).unwrap_or(0);
        let liquidation_value = vals.get(liquidation_idx).copied().unwrap_or(0.0);
        if liquidation_value > 0.0 && liquidation_idx > 0 {
            let liq_years = liquidation_idx as f64 / 252.0;
            calc_cagr(sv, liquidation_value, liq_years)
        } else {
            -1.0
        }
    } else { 0.0 };
    let mwrr = if fv > 0.0 && !liquidated {
        mwrr_cashflows.push((fv, years)); // 最终价值
        calc_mwrr(&mwrr_cashflows)
    } else { -1.0 };
    let dr = calc_daily_returns(&vals);
    let stdev = calc_annualized_stdev(&dr);
    let sharpe = calc_sharpe(cagr, stdev, DEFAULT_RISK_FREE_RATE);
    let sortino = calc_sortino(cagr, &dr, DEFAULT_RISK_FREE_RATE);
    let (mdd, mdd_dur) = calc_max_drawdown(&vals);

    // 回撤曲线
    let dd_curve = calc_drawdown_curve(&vals, &dates);

    // 滚动收益
    let rolling = calc_rolling_returns(&vals, &dates, params.rolling_window_months);

    // 年度收益
    let annual = calc_annual_returns(&vals, &dates);
    let best = if annual.is_empty() { 0.0 } else { annual.iter().map(|a| a.return_val).fold(f64::NEG_INFINITY, f64::max) };
    let worst = if annual.is_empty() { 0.0 } else { annual.iter().map(|a| a.return_val).fold(f64::INFINITY, f64::min) };
    let avg = if annual.is_empty() { 0.0 } else { annual.iter().map(|a| a.return_val).sum::<f64>() / annual.len() as f64 };

    // 月度收益
    let monthly = calc_monthly_returns(&vals, &dates);
    let monthly_ret = calc_monthly_return_values(&monthly);

    let var_5 = calc_var_5(&monthly_ret);
    let cvar_5 = calc_cvar_5(&monthly_ret, var_5);
    let calmar = calc_calmar(cagr, mdd);
    let pwr = calc_pwr(cagr);
    let swr = calc_swr(&vals, &dates);
    let skewness = calc_skewness(&monthly_ret);
    let excess_kurtosis = calc_excess_kurtosis(&monthly_ret);

    // ===== 扩展指标计算 =====

    // 年度收益值列表
    let annual_ret: Vec<f64> = annual.iter().map(|a| a.return_val).collect();

    // avg returns
    let avg_annual_return = if annual_ret.is_empty() { None } else { Some(annual_ret.iter().sum::<f64>() / annual_ret.len() as f64) };
    let avg_monthly_return = if monthly_ret.is_empty() { None } else { Some(monthly_ret.iter().sum::<f64>() / monthly_ret.len() as f64) };
    let avg_daily_return = if dr.is_empty() { None } else { Some(dr.iter().sum::<f64>() / dr.len() as f64) };

    // === 波动率 ===
    // stdev_annual: raw std dev of annual returns
    let stdev_annual = if annual_ret.len() < 2 { None } else {
        let mean = annual_ret.iter().sum::<f64>() / annual_ret.len() as f64;
        let variance = annual_ret.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (annual_ret.len() - 1) as f64;
        Some(variance.sqrt())
    };

    // stdev_monthly: annualized
    let stdev_monthly = if monthly_ret.len() < 2 { None } else {
        let mean = monthly_ret.iter().sum::<f64>() / monthly_ret.len() as f64;
        let variance = monthly_ret.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (monthly_ret.len() - 1) as f64;
        Some(variance.sqrt() * 12.0_f64.sqrt())
    };
    // stdev_monthly_raw
    let stdev_monthly_raw = if monthly_ret.len() < 2 { None } else {
        let mean = monthly_ret.iter().sum::<f64>() / monthly_ret.len() as f64;
        let variance = monthly_ret.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (monthly_ret.len() - 1) as f64;
        Some(variance.sqrt())
    };

    // stdev_daily: annualized
    let stdev_daily = if dr.len() < 2 { None } else {
        let mean = dr.iter().sum::<f64>() / dr.len() as f64;
        let variance = dr.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (dr.len() - 1) as f64;
        Some(variance.sqrt() * 252.0_f64.sqrt())
    };
    // stdev_daily_raw
    let stdev_daily_raw = if dr.len() < 2 { None } else {
        let mean = dr.iter().sum::<f64>() / dr.len() as f64;
        let variance = dr.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (dr.len() - 1) as f64;
        Some(variance.sqrt())
    };

    // === 下行偏差 ===
    // 使用日无风险利率作为阈值，与 Sortino 计算保持一致
    let daily_rf = (1.0 + DEFAULT_RISK_FREE_RATE).powf(1.0 / 252.0) - 1.0;
    let monthly_rf = (1.0 + DEFAULT_RISK_FREE_RATE).powf(1.0 / 12.0) - 1.0;
    let annual_rf = DEFAULT_RISK_FREE_RATE;
    let downside_deviation = if dr.is_empty() { None } else {
        let dd_sq: Vec<f64> = dr.iter().filter_map(|&r| if r < daily_rf { Some((r - daily_rf).powi(2)) } else { None }).collect();
        if dd_sq.is_empty() { None } else {
            let mean_dd_sq = dd_sq.iter().sum::<f64>() / dr.len() as f64;
            Some(mean_dd_sq.sqrt() * 252.0_f64.sqrt())
        }
    };
    let downside_deviation_daily_raw = if dr.is_empty() { None } else {
        let dd_sq: Vec<f64> = dr.iter().filter_map(|&r| if r < daily_rf { Some((r - daily_rf).powi(2)) } else { None }).collect();
        if dd_sq.is_empty() { None } else {
            Some(dd_sq.iter().sum::<f64>() / dr.len() as f64)
        }
    };
    let downside_deviation_monthly = if monthly_ret.is_empty() { None } else {
        let dd_sq: Vec<f64> = monthly_ret.iter().filter_map(|&r| if r < monthly_rf { Some((r - monthly_rf).powi(2)) } else { None }).collect();
        if dd_sq.is_empty() { None } else {
            let mean_dd_sq = dd_sq.iter().sum::<f64>() / monthly_ret.len() as f64;
            Some(mean_dd_sq.sqrt() * 12.0_f64.sqrt())
        }
    };
    let downside_deviation_monthly_raw = if monthly_ret.is_empty() { None } else {
        let dd_sq: Vec<f64> = monthly_ret.iter().filter_map(|&r| if r < monthly_rf { Some((r - monthly_rf).powi(2)) } else { None }).collect();
        if dd_sq.is_empty() { None } else {
            Some(dd_sq.iter().sum::<f64>() / monthly_ret.len() as f64)
        }
    };
    let downside_deviation_annual = if annual_ret.is_empty() { None } else {
        let dd_sq: Vec<f64> = annual_ret.iter().filter_map(|&r| if r < annual_rf { Some((r - annual_rf).powi(2)) } else { None }).collect();
        if dd_sq.is_empty() { None } else {
            let mean_dd_sq = dd_sq.iter().sum::<f64>() / annual_ret.len() as f64;
            Some(mean_dd_sq.sqrt())
        }
    };

    // === 回撤 ===
    let avg_drawdown = if dd_curve.is_empty() { None } else {
        let sum: f64 = dd_curve.iter().map(|d| d.drawdown).sum();
        Some(sum / dd_curve.len() as f64)
    };
    let ulcer_index = if dd_curve.is_empty() { None } else {
        let mean_dd_sq = dd_curve.iter().map(|d| d.drawdown * d.drawdown).sum::<f64>() / dd_curve.len() as f64;
        Some(mean_dd_sq.sqrt())
    };
    let ulcer_performance_index = match ulcer_index {
        Some(ui) if ui > 0.0 => Some(cagr / ui),
        _ => None,
    };
    let drawdown_recovery_factor = if mdd == 0.0 || vals.is_empty() { None } else {
        let mut peak = vals[0];
        let mut max_dd_val = 0.0;
        let mut trough_val = vals[0];
        for &v in vals.iter() {
            if v > peak { peak = v; }
            let dd = (peak - v) / peak;
            if dd > max_dd_val { max_dd_val = dd; trough_val = v; }
        }
        if trough_val <= 0.0 { None } else {
            let end_val = *vals.last().unwrap_or(&0.0);
            if end_val <= 0.0 { None } else {
                let recovery_gain = (end_val - trough_val) / trough_val;
                Some(recovery_gain.abs() / mdd.abs())
            }
        }
    };

    // === 分散化比率 ===
    // 使用组合回测的 dates 序列计算各资产波动率，确保日期对齐
    let diversification_ratio = if p.assets.len() < 2 || stdev == 0.0 { None } else {
        let mut individual_stdevs: Vec<f64> = Vec::new();
        for a in &p.assets {
            if let Some(prices) = pd.get(&a.ticker) {
                let mut asset_vals: Vec<f64> = Vec::new();
                let mut last_pr: f64 = 0.0;
                for d in &dates {
                    if let Some(&pr) = prices.get(d) {
                        if pr > 0.0 { last_pr = pr; }
                        asset_vals.push(last_pr);
                    } else if last_pr > 0.0 {
                        asset_vals.push(last_pr);
                    }
                }
                if asset_vals.len() >= 3 {
                    let asset_dr = calc_daily_returns(&asset_vals);
                    individual_stdevs.push(calc_annualized_stdev(&asset_dr));
                }
            }
        }
        if individual_stdevs.len() == p.assets.len() && !individual_stdevs.is_empty() {
            let w_sum: f64 = weights.iter().sum::<f64>();
            if w_sum > 0.0 {
                let weighted_avg = weights.iter().zip(individual_stdevs.iter())
                    .map(|(&w, &s)| (w / w_sum) * s).sum::<f64>();
                if weighted_avg > 0.0 { Some(weighted_avg / stdev) } else { None }
            } else { None }
        } else { None }
    };

    // === 正收益比例 ===
    let pct_positive_days = if dr.is_empty() { None } else {
        Some(dr.iter().filter(|&&r| r > 0.0).count() as f64 / dr.len() as f64)
    };
    let pct_positive_months = if monthly_ret.is_empty() { None } else {
        Some(monthly_ret.iter().filter(|&&r| r > 0.0).count() as f64 / monthly_ret.len() as f64)
    };
    let pct_positive_years = if annual_ret.is_empty() { None } else {
        Some(annual_ret.iter().filter(|&&r| r > 0.0).count() as f64 / annual_ret.len() as f64)
    };

    // === 极值收益 ===
    let max_daily_return = if dr.is_empty() { None } else { Some(dr.iter().cloned().fold(f64::NEG_INFINITY, f64::max)) };
    let min_daily_return = if dr.is_empty() { None } else { Some(dr.iter().cloned().fold(f64::INFINITY, f64::min)) };
    let max_monthly_return = if monthly_ret.is_empty() { None } else { Some(monthly_ret.iter().cloned().fold(f64::NEG_INFINITY, f64::max)) };
    let min_monthly_return = if monthly_ret.is_empty() { None } else { Some(monthly_ret.iter().cloned().fold(f64::INFINITY, f64::min)) };
    let max_annual_return = if annual_ret.is_empty() { None } else { Some(annual_ret.iter().cloned().fold(f64::NEG_INFINITY, f64::max)) };
    let min_annual_return = if annual_ret.is_empty() { None } else { Some(annual_ret.iter().cloned().fold(f64::INFINITY, f64::min)) };

    // === VaR / CVaR 多频率多级别 ===
    let var_daily_1 = calc_var_at_level(&dr, 0.01);
    let var_daily_5 = calc_var_at_level(&dr, 0.05);
    let var_daily_10 = calc_var_at_level(&dr, 0.10);
    let cvar_daily_1 = calc_cvar_at_level(&dr, 0.01);
    let cvar_daily_5 = calc_cvar_at_level(&dr, 0.05);
    let cvar_daily_10 = calc_cvar_at_level(&dr, 0.10);
    let var_monthly_1 = calc_var_at_level(&monthly_ret, 0.01);
    let var_monthly_5 = calc_var_at_level(&monthly_ret, 0.05);
    let var_monthly_10 = calc_var_at_level(&monthly_ret, 0.10);
    let cvar_monthly_1 = calc_cvar_at_level(&monthly_ret, 0.01);
    let cvar_monthly_5 = calc_cvar_at_level(&monthly_ret, 0.05);
    let cvar_monthly_10 = calc_cvar_at_level(&monthly_ret, 0.10);
    let var_annual_1 = calc_var_at_level(&annual_ret, 0.01);
    let var_annual_5 = calc_var_at_level(&annual_ret, 0.05);
    let var_annual_10 = calc_var_at_level(&annual_ret, 0.10);
    let cvar_annual_1 = calc_cvar_at_level(&annual_ret, 0.01);
    let cvar_annual_5 = calc_cvar_at_level(&annual_ret, 0.05);
    let cvar_annual_10 = calc_cvar_at_level(&annual_ret, 0.10);

    // === 偏度/峰度 多频率 ===
    let skewness_daily = calc_skewness(&dr);
    let skewness_monthly = calc_skewness(&monthly_ret);
    let skewness_annual = calc_skewness(&annual_ret);
    let excess_kurtosis_daily = calc_excess_kurtosis(&dr);
    let excess_kurtosis_monthly = calc_excess_kurtosis(&monthly_ret);
    let excess_kurtosis_annual = calc_excess_kurtosis(&annual_ret);

    // === 平均盈亏 & 盈亏比 ===
    let avg_daily_gain = if dr.is_empty() { None } else {
        let gains: Vec<f64> = dr.iter().filter(|&&r| r > 0.0).cloned().collect();
        if gains.is_empty() { None } else { Some(gains.iter().sum::<f64>() / gains.len() as f64) }
    };
    let avg_daily_loss = if dr.is_empty() { None } else {
        let losses: Vec<f64> = dr.iter().filter(|&&r| r < 0.0).cloned().collect();
        if losses.is_empty() { None } else { Some(losses.iter().sum::<f64>() / losses.len() as f64) }
    };
    let gain_loss_ratio_daily = match (avg_daily_gain, avg_daily_loss) {
        (Some(g), Some(l)) if l.abs() > 0.0 => Some(g / l.abs()),
        _ => None,
    };
    let avg_monthly_gain = if monthly_ret.is_empty() { None } else {
        let gains: Vec<f64> = monthly_ret.iter().filter(|&&r| r > 0.0).cloned().collect();
        if gains.is_empty() { None } else { Some(gains.iter().sum::<f64>() / gains.len() as f64) }
    };
    let avg_monthly_loss = if monthly_ret.is_empty() { None } else {
        let losses: Vec<f64> = monthly_ret.iter().filter(|&&r| r < 0.0).cloned().collect();
        if losses.is_empty() { None } else { Some(losses.iter().sum::<f64>() / losses.len() as f64) }
    };
    let gain_loss_ratio_monthly = match (avg_monthly_gain, avg_monthly_loss) {
        (Some(g), Some(l)) if l.abs() > 0.0 => Some(g / l.abs()),
        _ => None,
    };
    let avg_annual_gain = if annual_ret.is_empty() { None } else {
        let gains: Vec<f64> = annual_ret.iter().filter(|&&r| r > 0.0).cloned().collect();
        if gains.is_empty() { None } else { Some(gains.iter().sum::<f64>() / gains.len() as f64) }
    };
    let avg_annual_loss = if annual_ret.is_empty() { None } else {
        let losses: Vec<f64> = annual_ret.iter().filter(|&&r| r < 0.0).cloned().collect();
        if losses.is_empty() { None } else { Some(losses.iter().sum::<f64>() / losses.len() as f64) }
    };
    let gain_loss_ratio_annual = match (avg_annual_gain, avg_annual_loss) {
        (Some(g), Some(l)) if l.abs() > 0.0 => Some(g / l.abs()),
        _ => None,
    };

    // === 多期限SWR/PWR ===
    let swr_10y = calc_swr_for_period(&vals, &dates, 10);
    let pwr_10y = calc_pwr_for_cagr(cagr, 10);
    let swr_20y = calc_swr_for_period(&vals, &dates, 20);
    let pwr_20y = calc_pwr_for_cagr(cagr, 20);
    let swr_30y = calc_swr_for_period(&vals, &dates, 30);
    let pwr_30y = calc_pwr_for_cagr(cagr, 30);
    let swr_40y = calc_swr_for_period(&vals, &dates, 40);
    let pwr_40y = calc_pwr_for_cagr(cagr, 40);

    // === Drawdown Episodes ===
    let drawdown_episodes = calc_drawdown_episodes(&vals, &dates);

    PortfolioResult {
        name: p.name.clone(), growth_curve: gc, drawdown_curve: dd_curve,
        rolling_returns: rolling, annual_returns: annual, monthly_returns: monthly,
        statistics: Statistics {
            cagr, mwrr, best_year: best, worst_year: worst, avg_year: avg,
            avg_annual_return, avg_monthly_return, avg_daily_return,
            stdev, stdev_annual, stdev_monthly, stdev_monthly_raw, stdev_daily, stdev_daily_raw,
            downside_deviation, downside_deviation_daily_raw, downside_deviation_monthly, downside_deviation_monthly_raw, downside_deviation_annual,
            max_drawdown: mdd, max_drawdown_duration: mdd_dur,
            avg_drawdown, ulcer_index, drawdown_recovery_factor,
            sharpe, sortino, calmar,
            ulcer_performance_index, diversification_ratio, m2: None,
            alpha: 0.0, beta: 0.0, r_squared: 0.0, treynor: 0.0,
            benchmark_correlation: None, upside_correlation: None, downside_correlation: None,
            upside_beta: None, downside_beta: None, alpha_daily: None, alpha_annualized: None,
            upside_capture: 0.0, downside_capture: 0.0,
            upside_capture_daily: None, downside_capture_daily: None,
            upside_capture_annual: None, downside_capture_annual: None,
            capture_spread: None, capture_spread_daily: None, capture_spread_annual: None,
            active_return: None, tracking_error: None, information_ratio: None,
            var_5, cvar_5,
            var_daily_1, var_daily_5, var_daily_10, cvar_daily_1, cvar_daily_5, cvar_daily_10,
            var_monthly_1, var_monthly_5, var_monthly_10, cvar_monthly_1, cvar_monthly_5, cvar_monthly_10,
            var_annual_1, var_annual_5, var_annual_10, cvar_annual_1, cvar_annual_5, cvar_annual_10,
            skewness, excess_kurtosis,
            skewness_daily: Some(skewness_daily), skewness_monthly: Some(skewness_monthly), skewness_annual: Some(skewness_annual),
            excess_kurtosis_daily: Some(excess_kurtosis_daily), excess_kurtosis_monthly: Some(excess_kurtosis_monthly), excess_kurtosis_annual: Some(excess_kurtosis_annual),
            pct_positive_days, pct_positive_months, pct_positive_years,
            max_daily_return, min_daily_return, max_monthly_return, min_monthly_return,
            max_annual_return, min_annual_return,
            avg_daily_gain, avg_daily_loss, gain_loss_ratio_daily,
            avg_monthly_gain, avg_monthly_loss, gain_loss_ratio_monthly,
            avg_annual_gain, avg_annual_loss, gain_loss_ratio_annual,
            swr, pwr, swr_10y, pwr_10y, swr_20y, pwr_20y, swr_30y, pwr_30y, swr_40y, pwr_40y,
        },
        drawdown_episodes,
        allocation_history: alloc_hist,
    }
}

/// 执行一次完整的回测请求，是回测引擎对外暴露的统一入口。
///
/// 该函数遍历请求中的所有组合，分别调用 [`run_single`] 完成单组合回测，
/// 随后计算各组合之间的相关性矩阵；若指定了基准，还会计算基准增长曲线及
/// 各组合相对基准的 Alpha/Beta、上行/下行捕获等对比指标。
///
/// # 参数
/// - `req`: 回测请求 [`BacktestRequest`]，包含：
///   - `portfolios`: 待回测的投资组合列表
///   - `price_data`: 价格数据 `ticker -> (date -> price)`
///   - `params`: 回测全局参数（起止日期、初始资金、基准等）
///   - `cpi_data`: CPI 数据，用于通胀调整
///   - `exchange_rates`: 汇率数据，用于多币种换算
///
/// # 返回值
/// 返回 [`BacktestResult`]，包含所有组合结果、组合间相关性矩阵、
/// 基准增长曲线及资产级相关性等。
///
/// # 示例
/// ```ignore
/// use engine::{BacktestRequest, run_backtest_internal};
///
/// let req: BacktestRequest = serde_json::from_str(&json_str).unwrap();
/// let result = run_backtest_internal(&req);
/// println!("组合数量: {}", result.portfolios.len());
/// ```
pub fn run_backtest_internal(req: &BacktestRequest) -> BacktestResult {
    let mut results: Vec<PortfolioResult> = req.portfolios.iter().map(|p| run_single(p, &req.price_data, &req.params, &req.cpi_data, &req.exchange_rates)).collect();

    let dr: Vec<Vec<f64>> = results.iter().map(|r| {
        calc_daily_returns(&r.growth_curve.iter().map(|g| g.value).collect::<Vec<_>>())
    }).collect();

    let n = results.len();
    let corr: Vec<Vec<f64>> = (0..n).map(|i| {
        (0..n).map(|j| if i == j { 1.0 } else { calc_correlation(&dr[i], &dr[j]) }).collect()
    }).collect();

    let bench_start = if req.params.start_date.is_empty() { String::new() } else { req.params.start_date.clone() };
    let bench_end = if req.params.end_date.is_empty() { "9999-12-31".to_string() } else { req.params.end_date.clone() };
    let bench = if !req.params.benchmark_ticker.is_empty() {
        req.price_data.get(&req.params.benchmark_ticker).and_then(|prices| {
            let mut ds: Vec<&String> = prices.keys().filter(|d| **d >= bench_start && **d <= bench_end).collect();
            ds.sort();
            if ds.is_empty() { return None; }
            let fp = prices[ds[0]];
            if fp <= 0.0 { return None; }
            Some(ds.iter().map(|d| GrowthPoint { date: (*d).clone(), value: req.params.starting_value * prices[*d] / fp }).collect::<Vec<_>>())
        })
    } else { None };

    if let Some(ref bench_growth) = bench {
        let bench_vals: Vec<f64> = bench_growth.iter().map(|g| g.value).collect();
        let bench_dates: Vec<String> = bench_growth.iter().map(|g| g.date.clone()).collect();
        let bench_monthly = calc_monthly_returns(&bench_vals, &bench_dates);
        let bench_monthly_ret = calc_monthly_return_values(&bench_monthly);

        let bench_fv = *bench_vals.last().unwrap_or(&0.0);
        let bench_last_date = bench_dates.last().map(|s| s.as_str()).unwrap_or("");
        let bench_years = match (NaiveDate::parse_from_str(&bench_dates[0], "%Y-%m-%d"),
            NaiveDate::parse_from_str(bench_last_date, "%Y-%m-%d")) {
            (Ok(d1), Ok(d2)) => (d2 - d1).num_days() as f64 / 365.25,
            _ => bench_vals.len() as f64 / 252.0,
        };
        let bench_cagr = if bench_fv > 0.0 { calc_cagr(req.params.starting_value, bench_fv, bench_years) } else { 0.0 };
        let rf = DEFAULT_RISK_FREE_RATE;

        for result in results.iter_mut() {
            let port_monthly_ret = calc_monthly_return_values(&result.monthly_returns);
            let beta = calc_beta(&port_monthly_ret, &bench_monthly_ret);
            let alpha = calc_alpha(result.statistics.cagr, rf, beta, bench_cagr);
            let r_squared = calc_r_squared(beta, &port_monthly_ret, &bench_monthly_ret);
            let treynor = calc_treynor(result.statistics.cagr, rf, beta);
            let upside_capture = calc_upside_capture(&port_monthly_ret, &bench_monthly_ret);
            let downside_capture = calc_downside_capture(&port_monthly_ret, &bench_monthly_ret);

            result.statistics.alpha = alpha;
            result.statistics.beta = beta;
            result.statistics.r_squared = r_squared;
            result.statistics.treynor = treynor;
            result.statistics.upside_capture = upside_capture;
            result.statistics.downside_capture = downside_capture;

            // capture_spread
            result.statistics.capture_spread = Some(upside_capture - downside_capture);

            // active_return = portfolio_cagr - benchmark_cagr
            result.statistics.active_return = Some(result.statistics.cagr - bench_cagr);

            // tracking_error = sqrt(252) * std(daily_portfolio_return - daily_benchmark_return)
            let port_vals: Vec<f64> = result.growth_curve.iter().map(|g| g.value).collect();
            let port_dr = calc_daily_returns(&port_vals);
            let bench_dr = calc_daily_returns(&bench_vals);
            let len = port_dr.len().min(bench_dr.len());
            if len >= 2 {
                let diffs: Vec<f64> = (0..len).map(|i| port_dr[i] - bench_dr[i]).collect();
                let diff_mean = diffs.iter().sum::<f64>() / diffs.len() as f64;
                let diff_var = diffs.iter().map(|d| (d - diff_mean).powi(2)).sum::<f64>() / (diffs.len() - 1) as f64;
                let te = diff_var.sqrt() * 252.0_f64.sqrt();
                result.statistics.tracking_error = Some(te);
                // information_ratio = active_return / tracking_error
                if te > 0.0 {
                    result.statistics.information_ratio = Some(result.statistics.active_return.unwrap_or(0.0) / te);
                }
            }

            // benchmark_correlation
            let bench_dr_full = calc_daily_returns(&bench_vals);
            let port_dr_full = calc_daily_returns(&port_vals);
            let len = port_dr_full.len().min(bench_dr_full.len());
            if len >= 2 {
                let port_slice = &port_dr_full[..len];
                let bench_slice = &bench_dr_full[..len];
                result.statistics.benchmark_correlation = Some(calc_correlation(port_slice, bench_slice));

                // upside/downside correlation
                let up_port: Vec<f64> = port_slice.iter().zip(bench_slice.iter())
                    .filter(|(_, &br)| br > 0.0).map(|(&pr, _)| pr).collect();
                let up_bench: Vec<f64> = bench_slice.iter().zip(port_slice.iter())
                    .filter(|(&br, _)| br > 0.0).map(|(br, _)| *br).collect();
                result.statistics.upside_correlation = if up_port.len() >= 3 { Some(calc_correlation(&up_port, &up_bench)) } else { None };

                let dn_port: Vec<f64> = port_slice.iter().zip(bench_slice.iter())
                    .filter(|(_, &br)| br < 0.0).map(|(&pr, _)| pr).collect();
                let dn_bench: Vec<f64> = bench_slice.iter().zip(port_slice.iter())
                    .filter(|(&br, _)| br < 0.0).map(|(br, _)| *br).collect();
                result.statistics.downside_correlation = if dn_port.len() >= 3 { Some(calc_correlation(&dn_port, &dn_bench)) } else { None };

                // upside/downside beta
                let bench_var = bench_slice.iter().map(|r| (r - bench_slice.iter().sum::<f64>() / bench_slice.len() as f64).powi(2)).sum::<f64>() / (bench_slice.len() - 1) as f64;
                if bench_var > 0.0 {
                    let cov_up: f64 = {
                        let pairs: Vec<(f64, f64)> = port_slice.iter().zip(bench_slice.iter())
                            .filter(|(_, &br)| br > 0.0).map(|(&pr, &br)| (pr, br)).collect();
                        if pairs.len() >= 3 {
                            let mean_p = pairs.iter().map(|(p, _)| *p).sum::<f64>() / pairs.len() as f64;
                            let mean_b = pairs.iter().map(|(_, b)| *b).sum::<f64>() / pairs.len() as f64;
                            pairs.iter().map(|(p, b)| (p - mean_p) * (b - mean_b)).sum::<f64>() / (pairs.len() - 1) as f64
                        } else { 0.0 }
                    };
                    let up_bench_var = {
                        let up_rets: Vec<f64> = bench_slice.iter().filter(|&&r| r > 0.0).cloned().collect();
                        if up_rets.len() >= 3 {
                            let mean = up_rets.iter().sum::<f64>() / up_rets.len() as f64;
                            up_rets.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (up_rets.len() - 1) as f64
                        } else { 0.0 }
                    };
                    result.statistics.upside_beta = if up_bench_var > 0.0 { Some(cov_up / up_bench_var) } else { None };

                    let cov_dn: f64 = {
                        let pairs: Vec<(f64, f64)> = port_slice.iter().zip(bench_slice.iter())
                            .filter(|(_, &br)| br < 0.0).map(|(&pr, &br)| (pr, br)).collect();
                        if pairs.len() >= 3 {
                            let mean_p = pairs.iter().map(|(p, _)| *p).sum::<f64>() / pairs.len() as f64;
                            let mean_b = pairs.iter().map(|(_, b)| *b).sum::<f64>() / pairs.len() as f64;
                            pairs.iter().map(|(p, b)| (p - mean_p) * (b - mean_b)).sum::<f64>() / (pairs.len() - 1) as f64
                        } else { 0.0 }
                    };
                    let dn_bench_var = {
                        let dn_rets: Vec<f64> = bench_slice.iter().filter(|&&r| r < 0.0).cloned().collect();
                        if dn_rets.len() >= 3 {
                            let mean = dn_rets.iter().sum::<f64>() / dn_rets.len() as f64;
                            dn_rets.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (dn_rets.len() - 1) as f64
                        } else { 0.0 }
                    };
                    result.statistics.downside_beta = if dn_bench_var > 0.0 { Some(cov_dn / dn_bench_var) } else { None };
                }

                // alpha_daily and alpha_annualized
                let port_daily_mean = port_slice.iter().sum::<f64>() / port_slice.len() as f64;
                let bench_daily_mean = bench_slice.iter().sum::<f64>() / bench_slice.len() as f64;
                let rf_daily = (1.0 + DEFAULT_RISK_FREE_RATE).powf(1.0/252.0) - 1.0;
                result.statistics.alpha_daily = Some(port_daily_mean - rf_daily - result.statistics.beta * (bench_daily_mean - rf_daily));
                result.statistics.alpha_annualized = Some(result.statistics.alpha_daily.unwrap_or(0.0) * 252.0);

                // daily capture ratios
                let up_port_daily: Vec<f64> = port_slice.iter().zip(bench_slice.iter())
                    .filter(|(_, &br)| br > 0.0).map(|(&pr, _)| pr).collect();
                let up_bench_daily: Vec<f64> = bench_slice.iter().filter(|&&r| r > 0.0).cloned().collect();
                if !up_port_daily.is_empty() && !up_bench_daily.is_empty() {
                    let up_port_mean = up_port_daily.iter().sum::<f64>() / up_port_daily.len() as f64;
                    let up_bench_mean = up_bench_daily.iter().sum::<f64>() / up_bench_daily.len() as f64;
                    result.statistics.upside_capture_daily = if up_bench_mean > 0.0 { Some(up_port_mean / up_bench_mean) } else { None };
                }
                let dn_port_daily: Vec<f64> = port_slice.iter().zip(bench_slice.iter())
                    .filter(|(_, &br)| br < 0.0).map(|(&pr, _)| pr).collect();
                let dn_bench_daily: Vec<f64> = bench_slice.iter().filter(|&&r| r < 0.0).cloned().collect();
                if !dn_port_daily.is_empty() && !dn_bench_daily.is_empty() {
                    let dn_port_mean = dn_port_daily.iter().sum::<f64>() / dn_port_daily.len() as f64;
                    let dn_bench_mean = dn_bench_daily.iter().sum::<f64>() / dn_bench_daily.len() as f64;
                    result.statistics.downside_capture_daily = if dn_bench_mean < 0.0 { Some(dn_port_mean / dn_bench_mean) } else { None };
                }

                // annual capture ratios
                let port_dates: Vec<String> = result.growth_curve.iter().map(|g| g.date.clone()).collect();
                let port_annual = calc_annual_returns(&port_vals, &port_dates);
                let bench_annual = calc_annual_returns(&bench_vals, &bench_dates);
                let port_annual_ret: Vec<f64> = port_annual.iter().map(|a| a.return_val).collect();
                let bench_annual_ret: Vec<f64> = bench_annual.iter().map(|a| a.return_val).collect();
                if !port_annual_ret.is_empty() && !bench_annual_ret.is_empty() {
                    let up_port_a: Vec<f64> = port_annual_ret.iter().zip(bench_annual_ret.iter()).filter(|(_, &br)| br > 0.0).map(|(&pr, _)| pr).collect();
                    let up_bench_a: Vec<f64> = bench_annual_ret.iter().filter(|&&r| r > 0.0).cloned().collect();
                    if !up_port_a.is_empty() && !up_bench_a.is_empty() {
                        let up_port_mean = up_port_a.iter().sum::<f64>() / up_port_a.len() as f64;
                        let up_bench_mean = up_bench_a.iter().sum::<f64>() / up_bench_a.len() as f64;
                        result.statistics.upside_capture_annual = if up_bench_mean > 0.0 { Some(up_port_mean / up_bench_mean) } else { None };
                    }
                    let dn_port_a: Vec<f64> = port_annual_ret.iter().zip(bench_annual_ret.iter()).filter(|(_, &br)| br < 0.0).map(|(&pr, _)| pr).collect();
                    let dn_bench_a: Vec<f64> = bench_annual_ret.iter().filter(|&&r| r < 0.0).cloned().collect();
                    if !dn_port_a.is_empty() && !dn_bench_a.is_empty() {
                        let dn_port_mean = dn_port_a.iter().sum::<f64>() / dn_port_a.len() as f64;
                        let dn_bench_mean = dn_bench_a.iter().sum::<f64>() / dn_bench_a.len() as f64;
                        result.statistics.downside_capture_annual = if dn_bench_mean < 0.0 { Some(dn_port_mean / dn_bench_mean) } else { None };
                    }
                }

                // capture spreads
                result.statistics.capture_spread_daily = match (result.statistics.upside_capture_daily, result.statistics.downside_capture_daily) {
                    (Some(uc), Some(dc)) => Some(uc - dc),
                    _ => None,
                };
                result.statistics.capture_spread_annual = match (result.statistics.upside_capture_annual, result.statistics.downside_capture_annual) {
                    (Some(uc), Some(dc)) => Some(uc - dc),
                    _ => None,
                };

                // M² = rf + sharpe_port * stdev_bench
                let bench_stdev = {
                    let mean = bench_dr_full.iter().sum::<f64>() / bench_dr_full.len() as f64;
                    let var = bench_dr_full.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (bench_dr_full.len() - 1) as f64;
                    var.sqrt() * 252.0_f64.sqrt()
                };
                if bench_stdev > 0.0 {
                    result.statistics.m2 = Some(DEFAULT_RISK_FREE_RATE + result.statistics.sharpe * bench_stdev);
                }
            }
        }
    }

    // 计算所有资产间的相关性
    let mut seen = std::collections::HashSet::new();
    let mut all_tickers: Vec<String> = Vec::new();
    for p in &req.portfolios {
        for a in &p.assets {
            if seen.insert(a.ticker.clone()) {
                all_tickers.push(a.ticker.clone());
            }
        }
    }
    let corr_start = if req.params.start_date.is_empty() { String::new() } else { req.params.start_date.clone() };
    let corr_end = if req.params.end_date.is_empty() { "9999-12-31".to_string() } else { req.params.end_date.clone() };
    let asset_corr: Vec<Vec<f64>> = if all_tickers.len() >= 2 {
        let asset_dr: Vec<Vec<f64>> = all_tickers.iter().map(|t| {
            if let Some(prices) = req.price_data.get(t) {
                let mut ds: Vec<(&String, &f64)> = prices.iter()
                    .filter(|(d, _)| **d >= corr_start && **d <= corr_end)
                    .collect();
                ds.sort_by_key(|(d, _)| *d);
                let vals: Vec<f64> = ds.iter().map(|(_, &v)| v).collect();
                calc_daily_returns(&vals)
            } else {
                vec![]
            }
        }).collect();
        let n = all_tickers.len();
        (0..n).map(|i| {
            (0..n).map(|j| {
                if i == j { 1.0 }
                else if asset_dr[i].len() < 5 || asset_dr[j].len() < 5 { 0.0 }
                else {
                    let len = asset_dr[i].len().min(asset_dr[j].len());
                    calc_correlation(&asset_dr[i][..len], &asset_dr[j][..len])
                }
            }).collect()
        }).collect()
    } else {
        vec![]
    };

    BacktestResult { portfolios: results, correlations: corr, benchmark_growth: bench, asset_tickers: all_tickers, asset_correlations: asset_corr }
}
