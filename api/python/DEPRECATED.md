# Python 数据获取模块 - 已弃用

> 本目录已根据 ADR-008（语言精简决策）标记为弃用。
> 数据获取功能已迁移到 Go data-service（`data-fetcher/`）。
>
> 迁移原因：
> - Python 子进程每次启动 200ms，信号量=3 成为并发瓶颈
> - 双运行时（Node+Python）增加 Docker 镜像体积和依赖维护成本
> - Go 的 baostock/akshare/yfinance HTTP 客户端已满足核心需求
>
> 过渡期保留本目录，待 Go 数据服务稳定后删除。
