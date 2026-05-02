# Contributing

欢迎提交 Issue 或 Pull Request。提交前请先确认改动聚焦、说明清晰，并尽量附上复现步骤或测试结果。

提交代码前请检查：

- 不包含真实密钥、真实用户数据、真实验证码、真实 token 或数据库运行导出。
- 不提交 `unpackage/`、`node_modules/`、`dist/` 等构建产物。
- 配置示例只使用 `config.example.json` 或占位符。
- 第三方模块保留原作者声明和许可信息。
- App 图标等必须随源码保留的静态资源放在 `static/app-icons/`，不要放回 `unpackage/`。

推荐本地检查命令：

```bash
node tests/run-all-tests.js
```

如果只修改文档，可以在 Pull Request 中说明未运行测试的原因。
