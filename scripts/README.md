# 脚本索引

常规命令从项目根目录运行。当前路径配置见 `config/project-layout.json`。

| 类别 | 入口 |
| --- | --- |
| Windows 构建 | `build-windows.cjs`：服务、客户端、管理器及四个 Windows 程序 |
| 打包准备 | `prepare-desktop.cjs`、`prepare-host-manager.cjs` |
| 新批次交付 | `assemble-storage-release.ps1`：拒绝覆盖已交付批次 |
| 目录与版本检查 | `verify-project-layout.cjs` |
| 客户端回归 | `test-collaboration-full.cjs`、`test-package-071.cjs` |
| 员工接入 | `test-employee-access.cjs` |
| 容量与界面 | `test-storage-http.cjs`、`test-manager-storage.cjs` |
| 管理器维护 | `test-host-manager-ui.cjs`、`test-host-manager-maintenance.ps1` |
| 自启与卸载 | `test-manager-startup.ps1`、`test-uninstall-choice.ps1` |
| 说明书 | `generate-guide-071.py`、`generate-host-manager-guide.py` |
| 历史交付 | `history/` |
| 一次性整理审计 | `maintenance/`，例行开发无需执行 |

`*-window.cjs`、`create-access-fixture.ps1` 和 `export-access-fixture.ps1` 是测试夹具，不是员工部署入口。

原生图形测试通过 `CF_PLAYWRIGHT_PATH` 指定本机 Playwright；`CF_TEST_CLIENT_EXE` 和 `CF_MANAGER_ASAR` 可选择待测构建。测试结果写入当前 QA 目录。
