# LuaPanda

LuaPanda 是一个基于 VS Code 的 lua 代码调试器。设计目标是简单易用，支持多种开发框架。它由两部分组成:

- VS Code Extension  调试器 VSCode 插件
- Lua Debugger  调试器的 debugger 部分

Debugger 主体使用 lua 实现，另含一个 C 扩展模块，以保证高速运行。
LuaPanda 支持 lua5.1- 5.3，运行环境要包含 LuaSocket。

LuaPanda 的立项源于潘多拉项目中大量的lua调试需求。`潘多拉`为游戏提供嵌入式跨引擎的运营开发能力，使游戏研发及运营各自独立闭环，在游戏内实现各种营销活动和周边系统，让游戏分工更加专业，团队更加专注，高效产出价值。
潘多拉为游戏提供的服务包括用户生命周期的精细化运营方案、游戏内直播解决方案、游戏内内容社区解决方案、游戏内商城商业化解决方案等，已经在大量腾讯精品游戏中上线、稳定运营。



# 关于VSCode 1.33的兼容

我们注意到更新了 VScode 1.33 之后调试器可能出现断点无法停止的情况，并已进行了修复。
如遇此问题，请从master分支中拉取最新的`LuaPanda.lua`文件，覆盖原有文件即可。也可从tag v2.0.1中获取该文件。



# 更新说明

本次更新主要支持了条件断点和记录点，支持调试中变量赋值操作，并做了bug修复（修复详情请查看 [change log](https://github.com/Tencent/LuaPanda/blob/master/CHANGELOG.md) ）。

+ 条件断点和记录点

  在 VSCode 代码行号前点击鼠标右键可选择普通断点，条件断点和记录点。

  若用户输入的条件是 `a == 2` , 在断点行执行为真时断点生效。注意 lua 中 nil 和 false 为假，其他结果都为真。

  记录点在被执行时会打印日志。日志输出在：DebugConsole - OUTPUT - Debugger/log ， 如下图。

  ![](https://github.com/Tencent/LuaPanda/blob/dev/Docs/static/feature-introduction/logpoint-log.png?raw=true)



+ 变量赋值

  断点处允许用户修改变量的值， 用户也可以通过调试控制台给变量赋值。

  ![企业微信截图_84fc8535-8733-4b04-9518-64cee91b2439](https://github.com/Tencent/LuaPanda/blob/dev/Docs/static/feature-introduction/set-var-value.gif?raw=true)





更新方法

1. 使用新版 LuaPanda.lua 和 DebugTools.lua 替换原文件即可。如果使用了源码编译请更新 C 库源码。
2. 若不更新lua文件仍可继续使用调试功能，但以上新功能无法体验。
3. useHighSpeedModule 配置项改名。如果工程 launch.json 文件中设置过 `"useHighSpeedModule"` ，请改为 `"useCHook"`。 如无则忽略。 



# 特性

+ 支持单步调试，断点调试，协程调试，支持调试时变量赋值。
+ 支持lua5.1- 5.3, 支持 slua/xlua/slua-unreal 等框架
+ 在断点处可以监视和运行表达式，返回结果
+ 可以根据断点密集程度调整 hook 频率, 有较好高的效率
+ 支持 attach 模式，lua 运行过程中可随时建立连接
+ 使用 lua / C 双调试引擎。lua 部分可动态下发，避免打包后无法调试。C 部分效率高，适合开发期调试。



# 项目介绍和接入文档

[项目介绍](./Docs/Manual/feature-introduction.md)	| [快速开始](./Docs/Manual/quick-use.md) | [接入指引](./Docs/Manual/access-guidelines.md) | [FAQ](./Docs/Manual/FAQ.md) 

我们正在补全文档，以方便接入和开发，我们也非常欢迎您可以帮助完善文档。

更多文档请看[这里](./Docs/README.md)




# 快速开始

试用LuaPanda请 [参阅快速开始文档](./Docs/Manual/quick-use.md) ，其中包含 slua , xlua ,slua-unreal 的快速使用方法



# 依赖和适用性

调试器依赖 LuaSocket , 可运行于 slua，slua-unreal ，xlua 等已集成 LuaSocket 的 lua 环境，也可以在 console 中调试。lua 版本支持 5.1- 5.3。



# 参与贡献

我们非常期待您的贡献，无论是完善文档，提出、修复 Bug 或是增加新特性。
如果您在使用过程中发现文档不够完善，欢迎记录下来并提交。
如果发现 Bug，请通过 [issues](https://github.com/Tencent/LuaPanda/issues) 来提交并描述相关的问题，您也可以在这里查看其它的 issue，通过解决这些 issue 来贡献代码。

请将pull request提交在 `dev` 分支上，经过测试后会在下一版本合并到 `master` 分支。更多规范请看[CONTRIBUTING](./CONTRIBUTING.md)

[腾讯开源激励计划](https://opensource.tencent.com/contribution) 鼓励开发者的参与和贡献，期待你的加入。



# 技术支持

如有问题先参阅 [FAQ](./Docs/Manual/FAQ.md) 

QQ群：974257225
