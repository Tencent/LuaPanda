# LuaPanda

LuaPanda 是一个基于 VS Code 的 lua 代码工具，设计目标是简单易用。它支持多种开发框架，主要提供以下功能：

- 自动补全（auto completion）
- 代码片段（snippet completion）
- 定义跳转（definition）
- 生成注释（comment generation）
- 类型推断（limited type inference）
- 代码格式化（formatting）: 依赖 [lua-fmt](https://github.com/trixnz/lua-fmt)
- 代码诊断（linting）：依赖 [luacheck](https://github.com/mpeterv/luacheck)
- 调试器（debugger）

功能详情可以参考[项目介绍](./Docs/Manual/feature-introduction.md)。LuaPanda 支持 lua5.1- 5.4，调试器运行环境需要包含 LuaSocket。


# 文档

接入和使用文档

[项目介绍](./Docs/Manual/feature-introduction.md)	| [快速试用指引](./Docs/Manual/quick-use.md) | [调试器接入指引](./Docs/Manual/access-guidelines.md) |  [真机调试](./Docs/Manual/debug-on-phone.md)  | [单文件调试和运行](./Docs/Manual/debug-file.md) | [升级说明](./Docs/Manual/update.md) | [FAQ](./Docs/Manual/FAQ.md)

调试器开发文档

[工程说明](./Docs/Development-instructions/project-description.md) 	|  [调试器开发指引](./Docs/Development-instructions/how_to_join.md) |  [特性简述](./Docs/Development-instructions/debugger-principle.md) 


# 特性

+ 支持常用的代码补全，代码片段，定义跳转，生成注释，符号列表等功能
+ 支持单步调试，条件断点，协程调试，支持调试时变量赋值。
+ 支持lua5.1- 5.4, 支持 slua/xlua/slua-unreal 等框架
+ 在断点处可以监视和运行表达式，返回结果
+ 可以根据断点密集程度调整 hook 频率, 有较高的效率
+ 支持 attach 模式，lua 运行过程中可随时建立连接
+ 使用 lua / C 双调试引擎。lua 部分可动态下发，避免打包后无法调试。C 部分效率高，适合开发期调试

+ 可以提供代码补全，代码片段，定义跳转，生成注释，符号列表等功能


# 近期更新

+ V3.2.0
  + 代码提示支持大小写不敏感，无论输入大小写都能提示对应的符号。
  + 支持多端调试(multi target)， 在一个VSCode面板中可以启动多个不同port的调试端，连接多个lua进程。
  + 支持反转client-server。目前 vscode 插件作为 server , lua 进程作为 client。支持通过设置反转，方便真机调试。
  + 支持require 路径中含有 . , 目前只支持require("A/B"), 后续支持require("A.B")的形式，无需设置
  + 在autoPath模式支持同名文件
  + 重新测试和优化真机调试，修复真机调试socket连接可能存在的问题

+ V3.1.0
  
  + 新增了导出 slua 符号用于代码提示。  [使用说明](https://github.com/Tencent/LuaPanda/blob/master/Docs/Manual/lua-intellisense.md)
  + 重构了定义跳转和代码提示框架，提升了分析效率。自测修复了 #49 大量lua工程下无法工作的问题。
  + 修复了 #47 table 成员展示问题。
  + 修复了 #46 配置 program 后 , attach 启动拉起新进程的问题。增加了一个attach启动项。
  + 实现了 #44 提出的 terminal 复用的建议。
  
  
+ [更多更新记录](https://github.com/Tencent/LuaPanda/blob/master/CHANGELOG.md)

# 依赖和适用性

调试器功能依赖 LuaSocket , 可运行于 slua，slua-unreal ，xlua 等已集成 LuaSocket 的 lua 环境，也可以在 console 中调试。lua 版本支持 5.1- 5.3。

其他依赖项目（插件中已包含，无需用户手动安装）：

+  [**luaparse**](https://github.com/oxyc/luaparse)

+  [**luacheck**](https://github.com/mpeterv/luacheck)

+  [**lua-fmt**](https://github.com/trixnz/lua-fmt)

+  [**path-reader**](https://github.com/ackerapple/path-reader)



# 参与贡献

我们非常期待您的贡献，无论是完善文档，提出、修复 Bug 或是增加新特性。
如果您在使用过程中发现文档不够完善，欢迎记录下来并提交。
如果发现 bug，请通过 [issues](https://github.com/Tencent/LuaPanda/issues) 来提交并描述相关的问题，您也可以在这里查看其它的 issue，通过解决这些 issue 来贡献代码。

请将pull request提交在 `dev` 分支上，经过测试后会在下一版本合并到 `master` 分支。更多规范请看[CONTRIBUTING](./CONTRIBUTING.md)

[腾讯开源激励计划](https://opensource.tencent.com/contribution) 鼓励开发者的参与和贡献，期待你的加入。



# 技术支持

如有问题可以先参阅 [文档](./Docs)， 或使用 [issues](https://github.com/Tencent/LuaPanda/issues) ，我们会关注和回复。

QQ群：974257225

