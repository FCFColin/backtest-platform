use crate::engine::{PortfolioInput, BacktestParams};
use serde::{Deserialize, Serialize};
use std::collections::HashMap;
use rand::Rng;
use rayon::prelude::*;

// ===== 数据结构 =====

/// 蒙特卡洛模拟参数，控制模拟次数、年限、分块策略及成功阈值等。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloParams {
    #[serde(default = "default_num_simulations")]
    pub num_simulations: usize,
    #[serde(default = "default_num_years")]
    pub num_years: usize,
    #[serde(default = "default_min_block_years")]
    pub min_block_years: usize,
    #[serde(default = "default_max_block_years")]
    pub max_block_years: usize,
    #[serde(default = "default_with_replacement")]
    pub with_replacement: bool,
    #[serde(default = "default_block_size")]
    pub block_size: usize,
    #[serde(default = "default_success_threshold")]
    pub success_threshold: f64,
}

fn default_num_simulations() -> usize { 1000 }
fn default_num_years() -> usize { 20 }
fn default_min_block_years() -> usize { 1 }
fn default_max_block_years() -> usize { 5 }
fn default_with_replacement() -> bool { true }
fn default_block_size() -> usize { 5 }
fn default_success_threshold() -> f64 { 1.0 }

impl Default for MonteCarloParams {
    fn default() -> Self {
        Self {
            num_simulations: 1000,
            num_years: 20,
            min_block_years: 1,
            max_block_years: 5,
            with_replacement: true,
            block_size: 5,
            success_threshold: 1.0,
        }
    }
}

/// 蒙特卡洛模拟请求体，包含组合、价格数据、回测参数及模拟参数。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloRequest {
    pub portfolio: PortfolioInput,
    pub price_data: HashMap<String, HashMap<String, f64>>,
    pub params: BacktestParams,
    #[serde(default)]
    pub mc_params: MonteCarloParams,
}

/// 各百分位对应的路径价值序列（p5~p95）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Percentiles {
    pub p5: Vec<f64>,
    pub p10: Vec<f64>,
    pub p25: Vec<f64>,
    pub p50: Vec<f64>,
    pub p75: Vec<f64>,
    pub p90: Vec<f64>,
    pub p95: Vec<f64>,
}

/// 蒙特卡洛模拟的汇总统计量（中位终值、均值终值、成功率等）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloStatistics {
    pub median_final_value: f64,
    pub mean_final_value: f64,
    pub success_rate: f64,
}

/// 单条模拟路径的指标（终值、CAGR、最大回撤、波动率及夏普等）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PerPathMetrics {
    pub final_value: f64,
    pub cagr: f64,
    pub max_drawdown: f64,
    pub volatility: f64,
    pub sharpe: f64,
    pub sortino: f64,
}

/// 具有代表性的模拟路径集合（最优、p25、中位、p75、最差）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RepresentativePaths {
    pub best: Vec<f64>,
    pub p25: Vec<f64>,
    pub median: Vec<f64>,
    pub p75: Vec<f64>,
    pub worst: Vec<f64>,
}

/// 各年度的成功概率序列（存活、保本、盈利三种口径）。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct SuccessProbabilities {
    pub survival: Vec<f64>,
    pub capital_preservation: Vec<f64>,
    pub profit: Vec<f64>,
}

/// 蒙特卡洛模拟的最终输出结果，聚合百分位路径、统计量及成功概率等。
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MonteCarloResult {
    pub percentiles: Percentiles,
    pub success_probability: Vec<f64>,
    pub final_distribution: Vec<f64>,
    pub statistics: MonteCarloStatistics,
    pub per_path_metrics: Vec<PerPathMetrics>,
    pub representative_paths: RepresentativePaths,
    pub success_probabilities: SuccessProbabilities,
}

// ===== 核心逻辑 =====

/// 获取组合日收益率序列
fn get_portfolio_daily_returns(
    portfolio: &PortfolioInput,
    price_data: &HashMap<String, HashMap<String, f64>>,
    params: &BacktestParams,
) -> Vec<f64> {
    let tickers: Vec<&str> = portfolio.assets.iter().map(|a| a.ticker.as_str()).collect();
    let raw: Vec<f64> = portfolio.assets.iter().map(|a| a.weight / 100.0).collect();
    let sum: f64 = raw.iter().sum();
    let weights: Vec<f64> = if sum > 0.0 { raw.iter().map(|&w| w / sum).collect() } else { raw };

    // 收集日期（空字符串视为不限制）
    let start_limit = if params.start_date.is_empty() { String::new() } else { params.start_date.clone() };
    let end_limit = if params.end_date.is_empty() { "9999-12-31".to_string() } else { params.end_date.clone() };
    let mut date_set: Vec<String> = Vec::new();
    for ticker in &tickers {
        if let Some(prices) = price_data.get(*ticker) {
            for d in prices.keys() {
                if d >= &start_limit && d <= &end_limit {
                    date_set.push(d.clone());
                }
            }
        }
    }
    date_set.sort();
    date_set.dedup();

    if date_set.len() < 2 { return Vec::new(); }

    let mut last_prices: Vec<f64> = vec![0.0; tickers.len()];
    let mut daily_returns: Vec<f64> = Vec::with_capacity(date_set.len() - 1);
    for i in 1..date_set.len() {
        let mut portfolio_return = 0.0;
        for j in 0..tickers.len() {
            let prev_raw = price_data.get(tickers[j]).and_then(|m| m.get(&date_set[i - 1])).copied();
            if let Some(p) = prev_raw { if p > 0.0 { last_prices[j] = p; } }
            let prev = prev_raw.unwrap_or(if last_prices[j] > 0.0 { last_prices[j] } else { continue });
            let curr_raw = price_data.get(tickers[j]).and_then(|m| m.get(&date_set[i])).copied();
            if let Some(c) = curr_raw { if c > 0.0 { last_prices[j] = c; } }
            let curr = curr_raw.unwrap_or(if last_prices[j] > 0.0 { last_prices[j] } else { continue });
            if prev > 0.0 {
                portfolio_return += weights[j] * (curr - prev) / prev;
            }
        }
        daily_returns.push(portfolio_return);
    }
    daily_returns
}

/// 区块自举法模拟一条路径（支持变长区块）
fn simulate_path(
    historical_returns: &[f64],
    total_days: usize,
    min_block_days: usize,
    max_block_days: usize,
    _with_replacement: bool,
    rng: &mut impl Rng,
) -> Vec<f64> {
    let n = historical_returns.len();
    let mut path = Vec::with_capacity(total_days + 1);
    path.push(1.0);

    let mut day = 0;
    while day < total_days {
        // 随机选择区块长度（在 min_block_days..=max_block_days 之间）
        let block_size = if max_block_days > min_block_days {
            rng.random_range(min_block_days..=max_block_days)
        } else {
            min_block_days
        };
        let start_idx = rng.random_range(0..n);
        for b in 0..block_size {
            if day >= total_days { break; }
            let idx = start_idx + b;
            if idx >= n { break; } // 截断而非回绕，避免人为引入自相关
            let last = *path.last().unwrap_or(&1.0);
            path.push(last * (1.0 + historical_returns[idx]));
            day += 1;
        }
    }
    path
}

/// 计算单条路径的指标
fn calc_path_metrics(path: &[f64], num_years: usize) -> PerPathMetrics {
    let final_value = *path.last().unwrap_or(&1.0);

    // CAGR
    let cagr = if final_value > 0.0 && num_years > 0 {
        final_value.powf(1.0 / num_years as f64) - 1.0
    } else {
        0.0
    };

    // 日收益率
    let mut daily_returns: Vec<f64> = Vec::with_capacity(path.len() - 1);
    for i in 1..path.len() {
        if path[i - 1] > 0.0 {
            daily_returns.push((path[i] - path[i - 1]) / path[i - 1]);
        }
    }

    // 最大回撤
    let mut max_drawdown = 0.0_f64;
    let mut peak = path[0];
    for &v in path {
        if v > peak {
            peak = v;
        }
        if peak > 0.0 {
            let dd = (peak - v) / peak;
            if dd > max_drawdown {
                max_drawdown = dd;
            }
        }
    }

    // 波动率（年化）
    let n = daily_returns.len() as f64;
    let volatility = if n > 1.0 {
        let mean = daily_returns.iter().sum::<f64>() / n;
        let variance = daily_returns.iter().map(|r| (r - mean).powi(2)).sum::<f64>() / (n - 1.0);
        variance.sqrt() * (252.0_f64).sqrt()
    } else {
        0.0
    };

    // 夏普比率（无风险利率=2%）
    let sharpe = if volatility > 0.0 {
        (cagr - 0.02) / volatility
    } else {
        0.0
    };

    // Sortino 比率
    let sortino = if n > 1.0 {
        let daily_rf = (1.0_f64).powf(1.0 / 252.0) - 1.0;
        let downside: f64 = daily_returns.iter()
            .filter(|&&r| r < daily_rf)
            .map(|&r| (r - daily_rf).powi(2))
            .sum::<f64>() / n;
        let downside_dev = downside.sqrt() * (252.0_f64).sqrt();
        if downside_dev > 0.0 {
            (cagr - 0.02) / downside_dev
        } else {
            0.0
        }
    } else {
        0.0
    };

    PerPathMetrics {
        final_value,
        cagr,
        max_drawdown,
        volatility,
        sharpe,
        sortino,
    }
}

/// 将路径降采样为月度数据
fn downsample_monthly(path: &[f64]) -> Vec<f64> {
    if path.is_empty() { return vec![]; }
    let mut result = Vec::new();
    result.push(path[0]);
    let mut day = 21; // 约1个月
    while day < path.len() {
        result.push(path[day]);
        day += 21;
    }
    // 确保最后一个点包含
    if let Some(&last) = path.last() {
        if result.last().map_or(true, |&v| (v - last).abs() > 1e-10) {
            result.push(last);
        }
    }
    result
}

/// 计算百分位路径
fn calc_percentiles(paths: &[Vec<f64>], total_days: usize) -> Percentiles {
    let percentile_values = [0.05, 0.1, 0.25, 0.5, 0.75, 0.9, 0.95];

    let results: Vec<[f64; 7]> = (0..=total_days)
        .into_par_iter()
        .map(|day| {
            let mut day_values: Vec<f64> = paths.iter()
                .map(|p| p.get(day).copied().unwrap_or(*p.last().unwrap_or(&0.0)))
                .collect();
            day_values.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
            percentile_values.map(|pv| {
                let idx = (day_values.len() as f64 * pv) as usize;
                day_values[idx.min(day_values.len() - 1)]
            })
        })
        .collect();

    let mut result = Percentiles {
        p5: Vec::with_capacity(results.len()),
        p10: Vec::with_capacity(results.len()),
        p25: Vec::with_capacity(results.len()),
        p50: Vec::with_capacity(results.len()),
        p75: Vec::with_capacity(results.len()),
        p90: Vec::with_capacity(results.len()),
        p95: Vec::with_capacity(results.len()),
    };
    for vals in results {
        result.p5.push(vals[0]);
        result.p10.push(vals[1]);
        result.p25.push(vals[2]);
        result.p50.push(vals[3]);
        result.p75.push(vals[4]);
        result.p90.push(vals[5]);
        result.p95.push(vals[6]);
    }
    result
}

/// 计算成功概率（每日，阈值>=threshold）
fn calc_success_probability(paths: &[Vec<f64>], threshold: f64) -> Vec<f64> {
    if paths.is_empty() { return Vec::new(); }
    let total_days = paths[0].len();

    (0..total_days)
        .into_par_iter()
        .map(|day| {
            let count = paths.iter()
                .filter(|p| p.get(day).copied().unwrap_or(0.0) >= threshold)
                .count();
            count as f64 / paths.len() as f64
        })
        .collect()
}

/// 计算三种成功概率（按年采样）
fn calc_success_probabilities(paths: &[Vec<f64>], num_years: usize) -> SuccessProbabilities {
    if paths.is_empty() {
        return SuccessProbabilities {
            survival: vec![0.0; num_years],
            capital_preservation: vec![0.0; num_years],
            profit: vec![0.0; num_years],
        };
    }

    let n = paths.len() as f64;
    let mut survival = Vec::with_capacity(num_years);
    let mut capital_preservation = Vec::with_capacity(num_years);
    let mut profit = Vec::with_capacity(num_years);

    for year in 1..=num_years {
        let day_idx = (year as f64 * 252.0).round() as usize;
        let day_idx = day_idx.min(paths[0].len() - 1);

        let mut surv_count = 0usize;
        let mut cap_count = 0usize;
        let mut prof_count = 0usize;

        for p in paths {
            let val = p.get(day_idx).copied().unwrap_or(0.0);
            if val > 0.0 { surv_count += 1; }
            if val >= 1.0 { cap_count += 1; }
            if val > 1.0 { prof_count += 1; }
        }

        survival.push(surv_count as f64 / n);
        capital_preservation.push(cap_count as f64 / n);
        profit.push(prof_count as f64 / n);
    }

    SuccessProbabilities {
        survival,
        capital_preservation,
        profit,
    }
}

/// 创建直方图
fn create_histogram(values: &[f64], bins: usize) -> Vec<f64> {
    if values.is_empty() { return vec![0.0; bins]; }
    let min = values.iter().cloned().fold(f64::INFINITY, f64::min);
    let max = values.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let bin_width = if max > min { (max - min) / bins as f64 } else { 1.0 };

    let mut histogram = vec![0.0_f64; bins];
    for &v in values {
        let bin = ((v - min) / bin_width).floor() as usize;
        let bin = bin.min(bins - 1);
        histogram[bin] += 1.0;
    }
    histogram
}

/// 创建空响应
fn create_empty_response(num_years: usize) -> MonteCarloResult {
    let total_days = (num_years as f64 * 252.0).round() as usize;
    let zeros = vec![0.0; total_days + 1];
    MonteCarloResult {
        percentiles: Percentiles {
            p5: zeros.clone(), p10: zeros.clone(), p25: zeros.clone(), p50: zeros.clone(),
            p75: zeros.clone(), p90: zeros.clone(), p95: zeros,
        },
        success_probability: vec![0.0; total_days + 1],
        final_distribution: vec![0.0; 50],
        statistics: MonteCarloStatistics {
            median_final_value: 0.0, mean_final_value: 0.0, success_rate: 0.0,
        },
        per_path_metrics: Vec::new(),
        representative_paths: RepresentativePaths {
            best: Vec::new(), p25: Vec::new(), median: Vec::new(),
            p75: Vec::new(), worst: Vec::new(),
        },
        success_probabilities: SuccessProbabilities {
            survival: vec![0.0; num_years],
            capital_preservation: vec![0.0; num_years],
            profit: vec![0.0; num_years],
        },
    }
}

/// 运行蒙特卡洛模拟（主入口）
pub fn run_monte_carlo(req: &MonteCarloRequest) -> MonteCarloResult {
    let mc = &req.mc_params;
    let daily_returns = get_portfolio_daily_returns(&req.portfolio, &req.price_data, &req.params);

    // 计算区块天数范围（将年转为交易日）
    let min_block_days = mc.min_block_years * 252;
    let max_block_days = mc.max_block_years * 252;
    // 兼容旧的 block_size 参数：如果 min/max 都为默认值但 block_size 不是，则使用 block_size
    let (effective_min, effective_max) = if mc.min_block_years == 1 && mc.max_block_years == 5 && mc.block_size != 5 {
        (mc.block_size, mc.block_size)
    } else {
        (min_block_days, max_block_days)
    };

    if daily_returns.len() < effective_min {
        return create_empty_response(mc.num_years);
    }

    let total_days = (mc.num_years as f64 * 252.0).round() as usize;

    let paths: Vec<Vec<f64>> = (0..mc.num_simulations)
        .into_par_iter()
        .map(|_| {
            let mut rng = rand::rng();
            simulate_path(&daily_returns, total_days, effective_min, effective_max, mc.with_replacement, &mut rng)
        })
        .collect();

    // 百分位
    let percentiles = calc_percentiles(&paths, total_days);

    // 成功概率（每日，向后兼容）
    let success_probability = calc_success_probability(&paths, mc.success_threshold);

    // 最终价值分布
    let final_values: Vec<f64> = paths.iter().map(|p| *p.last().unwrap_or(&0.0)).collect();
    let final_distribution = create_histogram(&final_values, 50);

    // 统计
    let mut sorted_final = final_values.clone();
    sorted_final.sort_by(|a, b| a.partial_cmp(b).unwrap_or(std::cmp::Ordering::Equal));
    let mid = sorted_final.len() / 2;
    let median_final_value = if sorted_final.len() % 2 == 0 {
        (sorted_final[mid - 1] + sorted_final[mid]) / 2.0
    } else {
        sorted_final[mid]
    };
    let mean_final_value = final_values.iter().sum::<f64>() / final_values.len() as f64;
    let success_count = final_values.iter().filter(|&&v| v >= mc.success_threshold).count();
    let success_rate = success_count as f64 / final_values.len() as f64;

    // 每条路径的指标
    let per_path_metrics: Vec<PerPathMetrics> = paths.iter()
        .map(|p| calc_path_metrics(p, mc.num_years))
        .collect();

    // 代表性路径（按终值排序，选择5条，降采样为月度）
    let mut indexed_finals: Vec<(usize, f64)> = final_values.iter().cloned().enumerate().collect();
    indexed_finals.sort_by(|a, b| a.1.partial_cmp(&b.1).unwrap_or(std::cmp::Ordering::Equal));
    let n = indexed_finals.len();

    let pick = |frac: f64| -> Vec<f64> {
        let idx = ((n as f64 * frac) as usize).min(n - 1);
        downsample_monthly(&paths[indexed_finals[idx].0])
    };

    let representative_paths = RepresentativePaths {
        worst: pick(0.0),
        p25: pick(0.25),
        median: pick(0.5),
        p75: pick(0.75),
        best: pick(1.0 - 1.0 / n as f64),
    };

    // 三种成功概率
    let success_probabilities = calc_success_probabilities(&paths, mc.num_years);

    MonteCarloResult {
        percentiles,
        success_probability,
        final_distribution,
        statistics: MonteCarloStatistics {
            median_final_value,
            mean_final_value,
            success_rate,
        },
        per_path_metrics,
        representative_paths,
        success_probabilities,
    }
}
