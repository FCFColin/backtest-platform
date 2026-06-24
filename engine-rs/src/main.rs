//! Rust 回测引擎的 HTTP 服务入口。
//!
//! 基于 Actix-Web 暴露回测、蒙特卡洛模拟与组合优化等 HTTP 接口，
//! 对内调用 [`engine`]、[`monte_carlo`]、[`optimizer`] 模块完成计算。

mod engine;
mod monte_carlo;
mod optimizer;
mod analysis;

use actix_cors::Cors;
use actix_governor::Governor;
use actix_web::{web, App, HttpServer, HttpResponse, middleware::Logger};
use chrono::NaiveDate;
use engine::BacktestRequest;
use monte_carlo::MonteCarloRequest;
use optimizer::{OptimizeRequest, EfficientFrontierRequest};
use analysis::AnalysisRequest;
use tracing::{info, error, warn};
use opentelemetry::trace::TracerProvider as _;
use opentelemetry::global;
use opentelemetry_otlp::WithExportConfig;
use opentelemetry_sdk::trace::SdkTracerProvider;
use tracing_subscriber::layer::SubscriberExt;
use tracing_subscriber::util::SubscriberInitExt;

fn validate_backtest_request(req: &BacktestRequest) -> Result<(), String> {
    if req.portfolios.is_empty() {
        return Err("portfolios 不能为空".to_string());
    }
    if req.params.starting_value <= 0.0 {
        return Err("starting_value 必须大于 0".to_string());
    }
    validate_dates(&req.params.start_date, &req.params.end_date)?;
    Ok(())
}

fn validate_dates(start: &str, end: &str) -> Result<(), String> {
    // 空字符串视为不限制日期范围
    if !start.is_empty() && NaiveDate::parse_from_str(start, "%Y-%m-%d").is_err() {
        return Err(format!("start_date 格式无效: {}", start));
    }
    if !end.is_empty() && NaiveDate::parse_from_str(end, "%Y-%m-%d").is_err() {
        return Err(format!("end_date 格式无效: {}", end));
    }
    Ok(())
}

fn json_response<T: serde::Serialize>(result: &T, label: &str) -> HttpResponse {
    let start = std::time::Instant::now();
    match serde_json::to_string(result) {
        Ok(json) => {
            let elapsed = start.elapsed();
            info!(module = "rust-engine", label = label, elapsed_ms = elapsed.as_secs_f64() * 1000.0, "序列化完成");
            HttpResponse::Ok()
                .content_type("application/json")
                .body(json)
        }
        Err(e) => {
            error!(module = "rust-engine", error = %e, "序列化错误");
            HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("序列化失败: {}", e)
            }))
        }
    }
}

async fn backtest_handler(body: web::Json<BacktestRequest>) -> HttpResponse {
    if let Err(e) = validate_backtest_request(&body) {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": e }));
    }
    let start = std::time::Instant::now();
    let req = body.into_inner();
    let result = match web::block(move || engine::run_backtest_internal(&req)).await {
        Ok(r) => r,
        Err(e) => {
            error!(module = "rust-engine", error = %e, "回测任务阻塞错误");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("回测任务执行失败: {}", e)
            }));
        }
    };
    let elapsed = start.elapsed();
    info!(module = "rust-engine", elapsed_ms = elapsed.as_secs_f64() * 1000.0, "回测完成");
    json_response(&result, "回测")
}

async fn monte_carlo_handler(body: web::Json<MonteCarloRequest>) -> HttpResponse {
    if let Err(e) = validate_dates(&body.params.start_date, &body.params.end_date) {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": e }));
    }
    let start = std::time::Instant::now();
    let req = body.into_inner();
    let result = match web::block(move || monte_carlo::run_monte_carlo(&req)).await {
        Ok(r) => r,
        Err(e) => {
            error!(module = "rust-engine", error = %e, "蒙特卡洛任务阻塞错误");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("蒙特卡洛任务执行失败: {}", e)
            }));
        }
    };
    let elapsed = start.elapsed();
    info!(module = "rust-engine", elapsed_ms = elapsed.as_secs_f64() * 1000.0, "蒙特卡洛完成");
    json_response(&result, "蒙特卡洛")
}

async fn optimize_handler(body: web::Json<OptimizeRequest>) -> HttpResponse {
    // 输入验证
    if body.tickers.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "tickers 不能为空" }));
    }
    let n = body.tickers.len();
    let min_w = body.constraints.min_weight.unwrap_or(0.0);
    let max_w = body.constraints.max_weight.unwrap_or(1.0);
    if min_w > max_w {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": format!("min_weight ({}) 不能大于 max_weight ({})", min_w, max_w) }));
    }
    if n as f64 * min_w > 1.0 + 1e-6 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": format!("n * min_weight ({} * {} = {}) > 1.0，约束不可行", n, min_w, n as f64 * min_w) }));
    }
    if n as f64 * max_w < 1.0 - 1e-6 {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": format!("n * max_weight ({} * {} = {}) < 1.0，约束不可行", n, max_w, n as f64 * max_w) }));
    }

    let start = std::time::Instant::now();
    let req = body.into_inner();
    let result = match web::block(move || optimizer::optimize_portfolio(&req)).await {
        Ok(r) => r,
        Err(e) => {
            error!(module = "rust-engine", error = %e, "优化任务阻塞错误");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("优化任务执行失败: {}", e)
            }));
        }
    };
    let elapsed = start.elapsed();
    info!(module = "rust-engine", elapsed_ms = elapsed.as_secs_f64() * 1000.0, "优化完成");
    json_response(&result, "优化")
}

async fn efficient_frontier_handler(body: web::Json<EfficientFrontierRequest>) -> HttpResponse {
    // 输入验证
    if body.tickers.is_empty() {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": "tickers 不能为空" }));
    }

    let start = std::time::Instant::now();
    let req = body.into_inner();
    let result = match web::block(move || optimizer::calc_efficient_frontier(&req)).await {
        Ok(r) => r,
        Err(e) => {
            error!(module = "rust-engine", error = %e, "有效前沿任务阻塞错误");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("有效前沿任务执行失败: {}", e)
            }));
        }
    };
    let elapsed = start.elapsed();
    info!(module = "rust-engine", elapsed_ms = elapsed.as_secs_f64() * 1000.0, "有效前沿完成");
    json_response(&result, "有效前沿")
}

async fn analysis_handler(body: web::Json<AnalysisRequest>) -> HttpResponse {
    if let Err(e) = validate_dates(&body.params.start_date, &body.params.end_date) {
        return HttpResponse::BadRequest().json(serde_json::json!({ "error": e }));
    }
    let start = std::time::Instant::now();
    let req = body.into_inner();
    let result = match web::block(move || analysis::run_analysis(&req)).await {
        Ok(r) => r,
        Err(e) => {
            error!(module = "rust-engine", error = %e, "分析任务阻塞错误");
            return HttpResponse::InternalServerError().json(serde_json::json!({
                "error": format!("分析任务执行失败: {}", e)
            }));
        }
    };
    let elapsed = start.elapsed();
    info!(module = "rust-engine", elapsed_ms = elapsed.as_secs_f64() * 1000.0, "分析完成");
    json_response(&result, "分析")
}

async fn health_handler() -> HttpResponse {
    HttpResponse::Ok().json(serde_json::json!({
        "status": "ok",
        "engine": "rust",
        "version": "0.2.0",
        "modules": ["backtest", "monte-carlo", "optimizer", "analysis"]
    }))
}

/// 初始化 OpenTelemetry TracerProvider。
///
/// 企业理由：Rust 引擎是 Node.js API 的下游，接收 Node.js 传播的 traceparent。
/// 无 OTel SDK 时，Rust 引擎无法解析 traceparent 头，链路在此断裂，
/// 跨服务排障只能靠时间戳人工关联，P99 问题定位耗时从分钟级退化到小时级。
///
/// 配置：
/// - OTEL_EXPORTER_OTLP_ENDPOINT：OTel Collector 地址，默认 "http://localhost:4317"
/// - 服务名：engine-rs，用于在 Jaeger/Tempo 中标识来源
///
/// 权衡：OTel SDK 增加约 15MB 内存开销，但相比链路追踪带来的排障效率提升可忽略。
fn init_tracer() -> Result<SdkTracerProvider, Box<dyn std::error::Error + Send + Sync + 'static>> {
    let endpoint = std::env::var("OTEL_EXPORTER_OTLP_ENDPOINT")
        .unwrap_or_else(|_| "http://localhost:4317".to_string());

    let exporter = opentelemetry_otlp::SpanExporter::builder()
        .with_tonic()
        .with_endpoint(endpoint)
        .build()?;

    let provider = SdkTracerProvider::builder()
        .with_simple_exporter(exporter)
        .with_resource(
            opentelemetry_sdk::Resource::builder()
                .with_service_name("engine-rs")
                .build(),
        )
        .build();

    Ok(provider)
}

#[actix_web::main]
async fn main() -> std::io::Result<()> {
    // 企业理由：初始化 OTel TracerProvider，使 Rust 引擎能接收上游 traceparent
    // 并向下游传播。无此初始化时，链路在 Rust 引擎处断裂。
    let tracer_provider = match init_tracer() {
        Ok(provider) => {
            let tracer = provider.tracer("engine-rs");
            global::set_tracer_provider(provider.clone());
            // 企业理由：将 tracing 日志桥接到 OTel，使 span 自动上报到 Collector。
            // 无此桥接时，tracing 日志与 OTel span 是两个独立系统，无法关联。
            let otel_layer = tracing_opentelemetry::layer().with_tracer(tracer);

            let env_filter = tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("info".parse().unwrap());

            // 企业理由：使用 Registry + Layer 方式初始化 subscriber，
            // 确保 tracing 结构化日志语法（module = "xxx", error = %e）正常工作。
            // 直接用 fmt().finish().with(layer) 会导致格式化参数解析失败。
            tracing_subscriber::registry()
                .with(env_filter)
                .with(tracing_subscriber::fmt::layer().json())
                .with(otel_layer)
                .init();

            info!(module = "rust-engine", "OTel TracerProvider 初始化成功");
            Some(provider)
        }
        Err(e) => {
            // 企业理由：OTel 初始化失败不应阻止服务启动，降级到纯日志模式。
            // 链路追踪是可观测性增强，不是核心业务功能。
            // 权衡：降级后无法跨服务追踪，但服务仍可正常处理请求。
            let env_filter = tracing_subscriber::EnvFilter::from_default_env()
                .add_directive("info".parse().unwrap());
            tracing_subscriber::fmt()
                .json()
                .with_env_filter(env_filter)
                .init();
            warn!(module = "rust-engine", error = %e, "OTel 初始化失败，链路追踪不可用");
            None
        }
    };

    let addr = std::env::var("ENGINE_ADDR").unwrap_or_else(|_| "127.0.0.1:5002".to_string());
    // 基本地址格式验证
    if !addr.contains(':') {
        error!(module = "rust-engine", addr = %addr, "ENGINE_ADDR 格式无效（缺少端口）");
        return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("ENGINE_ADDR 格式无效（缺少端口）: {}", addr)));
    }
    let parts: Vec<&str> = addr.rsplitn(2, ':').collect();
    if parts.len() == 2 {
        if let Ok(port) = parts[0].parse::<u16>() {
            if port == 0 {
                error!(module = "rust-engine", addr = %addr, "ENGINE_ADDR 端口不能为 0");
                return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("ENGINE_ADDR 端口不能为 0: {}", addr)));
            }
        } else {
            error!(module = "rust-engine", addr = %addr, "ENGINE_ADDR 端口格式无效");
            return Err(std::io::Error::new(std::io::ErrorKind::InvalidInput, format!("ENGINE_ADDR 端口格式无效: {}", addr)));
        }
    }
    info!(module = "rust-engine", version = "0.2.0", addr = %addr, "Rust回测引擎启动");
    info!(module = "rust-engine",
        backtest = "POST /api/engine/backtest",
        monte_carlo = "POST /api/engine/monte-carlo",
        optimize = "POST /api/engine/optimize",
        efficient_frontier = "POST /api/engine/efficient-frontier",
        analysis = "POST /api/engine/analysis",
        health = "GET /api/engine/health",
        "可用接口"
    );
    let result = HttpServer::new(move || {
        App::new()
            .wrap(build_cors())
            .wrap(Logger::default())
            // 企业理由：Rust 引擎端口暴露到主机，无认证且无限流，
            // CPU 密集型回测计算可被恶意调用耗尽资源。
            .wrap(
                Governor::new(
                    &actix_governor::GovernorConfigBuilder::default()
                        .seconds_per_request(1)  // 每秒1个请求基准（配合burst_size实现每秒2个）
                        .burst_size(10) // 突发10个
                        .finish()
                        .unwrap()
                )
            )
            .route("/api/engine/backtest", web::post().to(backtest_handler))
            .route("/api/engine/monte-carlo", web::post().to(monte_carlo_handler))
            .route("/api/engine/optimize", web::post().to(optimize_handler))
            .route("/api/engine/efficient-frontier", web::post().to(efficient_frontier_handler))
            .route("/api/engine/analysis", web::post().to(analysis_handler))
            .route("/api/engine/health", web::get().to(health_handler))
    })
    .bind(&addr)?
    .run()
    .await;

    // 企业理由：优雅关闭 OTel TracerProvider，确保剩余 span 全部上报到 Collector。
    // 无此关闭时，进程退出时缓冲区中的 span 会丢失，导致链路不完整。
    if let Some(provider) = tracer_provider {
        if let Err(e) = provider.shutdown() {
            error!(module = "rust-engine", error = %e, "OTel TracerProvider shutdown 失败");
        }
    }

    result
}

/// 构建 CORS 中间件。
///
/// - 开发环境（`NODE_ENV` 未设置或为 `development`）：使用 `Cors::permissive()` 允许全部来源
/// - 其他环境：读取 `CORS_ORIGINS` 环境变量（逗号分隔），未设置时默认允许 `http://localhost:5173`
fn build_cors() -> Cors {
    let node_env = std::env::var("NODE_ENV").unwrap_or_default();
    if node_env == "development" || node_env.is_empty() {
        return Cors::permissive();
    }

    let raw = std::env::var("CORS_ORIGINS").unwrap_or_default();
    let origins: Vec<String> = if raw.trim().is_empty() {
        vec!["http://localhost:5173".to_string()]
    } else {
        raw.split(',')
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty())
            .collect()
    };

    let mut cors = Cors::default()
        .allowed_methods(vec!["GET", "POST", "PUT", "DELETE", "OPTIONS"])
        .allowed_headers(vec!["Origin", "Content-Type", "Accept", "Authorization"])
        .max_age(3600);
    for origin in &origins {
        cors = cors.allowed_origin(origin);
    }
    cors
}
