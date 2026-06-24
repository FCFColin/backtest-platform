//! 资产分析模块。
//!
//! 对每个 ticker 单独计算统计指标（CAGR、波动率、最大回撤等），
//! 复用 engine 模块中的统计计算函数。

use serde::{Deserialize, Serialize};
use std::collections::HashMap;

use crate::engine::{
    BacktestParams, GrowthPoint, DrawdownPoint, RollingReturnPoint,
    AnnualReturnPoint, MonthlyReturnPoint, Statistics,
    calc_cagr, calc_annualized_stdev, calc_sharpe, calc_sortino,
    calc_max_drawdown, calc_daily_returns, calc_skewness, calc_excess_kurtosis,
    calc_drawdown_curve, calc_rolling_returns, calc_annual_returns, calc_monthly_returns,
    calc_calmar, calc_correlation,
};

/// 资产分析请求
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisRequest {
    pub tickers: Vec<String>,
    pub price_data: HashMap<String, HashMap<String, f64>>,
    pub params: BacktestParams,
}

/// 单个资产的分析结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AssetAnalysisItem {
    pub ticker: String,
    pub growth_curve: Vec<GrowthPoint>,
    pub drawdown_curve: Vec<DrawdownPoint>,
    pub daily_returns: Vec<f64>,
    pub annual_returns: Vec<AnnualReturnPoint>,
    pub monthly_returns: Vec<MonthlyReturnPoint>,
    pub rolling_returns: Vec<RollingReturnPoint>,
    pub statistics: Statistics,
}

/// 资产分析结果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct AnalysisResult {
    pub assets: Vec<AssetAnalysisItem>,
    pub correlations: Vec<Vec<f64>>,
}

/// 构建空统计（数据不足时）
fn empty_statistics() -> Statistics {
    Statistics {
        cagr: 0.0, mwrr: 0.0, best_year: 0.0, worst_year: 0.0, avg_year: 0.0,
        avg_annual_return: None, avg_monthly_return: None, avg_daily_return: None,
        stdev: 0.0,
        stdev_annual: None, stdev_monthly: None, stdev_monthly_raw: None,
        stdev_daily: None, stdev_daily_raw: None,
        downside_deviation: None, downside_deviation_daily_raw: None,
        downside_deviation_monthly: None, downside_deviation_monthly_raw: None,
        downside_deviation_annual: None,
        max_drawdown: 0.0, max_drawdown_duration: 0,
        avg_drawdown: None, ulcer_index: None, drawdown_recovery_factor: None,
        sharpe: 0.0, sortino: 0.0, calmar: 0.0,
        ulcer_performance_index: None, diversification_ratio: None, m2: None,
        alpha: 0.0, beta: 0.0, r_squared: 0.0, treynor: 0.0,
        benchmark_correlation: None, upside_correlation: None, downside_correlation: None,
        upside_beta: None, downside_beta: None,
        alpha_daily: None, alpha_annualized: None,
        upside_capture: 0.0, downside_capture: 0.0,
        upside_capture_daily: None, downside_capture_daily: None,
        upside_capture_annual: None, downside_capture_annual: None,
        capture_spread: None, capture_spread_daily: None, capture_spread_annual: None,
        active_return: None, tracking_error: None, information_ratio: None,
        var_5: 0.0, cvar_5: 0.0,
        var_daily_1: None, var_daily_5: None, var_daily_10: None,
        cvar_daily_1: None, cvar_daily_5: None, cvar_daily_10: None,
        var_monthly_1: None, var_monthly_5: None, var_monthly_10: None,
        cvar_monthly_1: None, cvar_monthly_5: None, cvar_monthly_10: None,
        var_annual_1: None, var_annual_5: None, var_annual_10: None,
        cvar_annual_1: None, cvar_annual_5: None, cvar_annual_10: None,
        skewness: 0.0, excess_kurtosis: 0.0,
        skewness_daily: None, skewness_monthly: None, skewness_annual: None,
        excess_kurtosis_daily: None, excess_kurtosis_monthly: None, excess_kurtosis_annual: None,
        pct_positive_days: None, pct_positive_months: None, pct_positive_years: None,
        max_daily_return: None, min_daily_return: None,
        max_monthly_return: None, min_monthly_return: None,
        max_annual_return: None, min_annual_return: None,
        avg_daily_gain: None, avg_daily_loss: None, gain_loss_ratio_daily: None,
        avg_monthly_gain: None, avg_monthly_loss: None, gain_loss_ratio_monthly: None,
        avg_annual_gain: None, avg_annual_loss: None, gain_loss_ratio_annual: None,
        swr: 0.0, pwr: 0.0,
        swr_10y: None, pwr_10y: None, swr_20y: None, pwr_20y: None,
        swr_30y: None, pwr_30y: None, swr_40y: None, pwr_40y: None,
    }
}

/// 对单个 ticker 执行分析
fn analyze_single_ticker(
    ticker: &str,
    prices_map: &HashMap<String, f64>,
    params: &BacktestParams,
) -> AssetAnalysisItem {
    // 空字符串视为不限制
    let start_limit = if params.start_date.is_empty() { String::new() } else { params.start_date.clone() };
    let end_limit = if params.end_date.is_empty() { "9999-12-31".to_string() } else { params.end_date.clone() };
    let mut dates: Vec<&String> = prices_map.keys().filter(|d| **d >= start_limit && **d <= end_limit).collect();
    dates.sort();

    let prices: Vec<f64> = dates.iter().map(|d| prices_map[*d]).collect();
    let date_strings: Vec<String> = dates.iter().map(|d| d.to_string()).collect();

    if prices.len() < 2 {
        return AssetAnalysisItem {
            ticker: ticker.to_string(),
            growth_curve: vec![],
            drawdown_curve: vec![],
            daily_returns: vec![],
            annual_returns: vec![],
            monthly_returns: vec![],
            rolling_returns: vec![],
            statistics: empty_statistics(),
        };
    }

    let base_price = prices[0];
    let values: Vec<f64> = prices.iter().map(|p| p / base_price).collect();
    let growth_curve: Vec<GrowthPoint> = date_strings.iter().zip(values.iter())
        .map(|(d, v)| GrowthPoint { date: d.clone(), value: v * params.starting_value })
        .collect();

    let drawdown_curve = calc_drawdown_curve(&values, &date_strings);
    let daily_returns = calc_daily_returns(&prices);
    let rolling_returns = calc_rolling_returns(&values.iter().map(|v| v * params.starting_value).collect::<Vec<_>>(), &date_strings, params.rolling_window_months);
    let annual_returns = calc_annual_returns(&values.iter().map(|v| v * params.starting_value).collect::<Vec<_>>(), &date_strings);
    let monthly_returns = calc_monthly_returns(&values.iter().map(|v| v * params.starting_value).collect::<Vec<_>>(), &date_strings);

    let years = prices.len() as f64 / 252.0;
    let cagr = calc_cagr(prices[0], *prices.last().unwrap(), years);
    let stdev = calc_annualized_stdev(&daily_returns);
    let (max_drawdown, max_drawdown_duration) = calc_max_drawdown(&prices);
    let avg_drawdown = if drawdown_curve.is_empty() { None } else {
        let sum: f64 = drawdown_curve.iter().map(|d| d.drawdown).sum();
        Some(sum / drawdown_curve.len() as f64)
    };
    let ulcer_index = if drawdown_curve.is_empty() { None } else {
        let mean_dd_sq = drawdown_curve.iter().map(|d| d.drawdown * d.drawdown).sum::<f64>() / drawdown_curve.len() as f64;
        Some(mean_dd_sq.sqrt())
    };
    let calmar = calc_calmar(cagr, max_drawdown);
    let upi = ulcer_index.and_then(|ui| if ui > 0.0 { Some(cagr / ui) } else { None });
    let sortino = calc_sortino(cagr, &daily_returns, 0.02);
    let skewness = calc_skewness(&daily_returns);
    let excess_kurtosis = calc_excess_kurtosis(&daily_returns);
    let sharpe = calc_sharpe(cagr, stdev, 0.02);

    let mut stats = empty_statistics();
    stats.cagr = cagr;
    stats.mwrr = cagr;
    stats.best_year = if annual_returns.is_empty() { 0.0 } else { annual_returns.iter().map(|a| a.return_val).fold(f64::NEG_INFINITY, f64::max) };
    stats.worst_year = if annual_returns.is_empty() { 0.0 } else { annual_returns.iter().map(|a| a.return_val).fold(f64::INFINITY, f64::min) };
    stats.avg_year = if annual_returns.is_empty() { 0.0 } else { annual_returns.iter().map(|a| a.return_val).sum::<f64>() / annual_returns.len() as f64 };
    stats.stdev = stdev;
    stats.max_drawdown = max_drawdown;
    stats.max_drawdown_duration = max_drawdown_duration;
    stats.avg_drawdown = avg_drawdown;
    stats.ulcer_index = ulcer_index;
    stats.sharpe = sharpe;
    stats.sortino = sortino;
    stats.calmar = calmar;
    stats.ulcer_performance_index = upi;
    stats.skewness = skewness;
    stats.excess_kurtosis = excess_kurtosis;

    AssetAnalysisItem {
        ticker: ticker.to_string(),
        growth_curve,
        drawdown_curve,
        daily_returns,
        annual_returns,
        monthly_returns,
        rolling_returns,
        statistics: stats,
    }
}

/// 执行资产分析
pub fn run_analysis(req: &AnalysisRequest) -> AnalysisResult {
    let assets: Vec<AssetAnalysisItem> = req.tickers.iter()
        .filter_map(|ticker| {
            let prices_map = req.price_data.get(ticker)?;
            Some(analyze_single_ticker(ticker, prices_map, &req.params))
        })
        .collect();

    // 计算资产间相关性矩阵
    let daily_returns_list: Vec<Vec<f64>> = assets.iter().map(|a| a.daily_returns.clone()).collect();
    let n = assets.len();
    let correlations: Vec<Vec<f64>> = (0..n).map(|i| {
        (0..n).map(|j| {
            if i == j { 1.0 } else { calc_correlation(&daily_returns_list[i], &daily_returns_list[j]) }
        }).collect()
    }).collect();

    AnalysisResult { assets, correlations }
}
