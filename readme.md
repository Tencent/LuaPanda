# LuaPanda

LuaPanda 是一个基于 VS Code 的 lua 代码调试器。设计目标是简单易用，支持多种开发框架。它由两部分组成:

- VS Code Extension  调试器 VSCode 插件
- Lua Debugger  调试器的 debugger 部分

Debugger 主体使用 lua 实现，另含一个 C 扩展模块，以保证高速运行。
LuaPanda 支持 lua5.1- 5.3，运行环境要包含 LuaSocket。

LuaPanda 的立项源于潘多拉项目中大量的lua调试需求。`潘多拉`为游戏提供嵌入式跨引擎的运营开发能力，使游戏研发及运营各自独立闭环，在游戏内实现各种营销活动和周边系统，让游戏分工更加专业，团队更加专注，高效产出价值。
潘多拉为游戏提供的服务包括用户生命周期的精细化运营方案、游戏内直播解决方案、游戏内内容社区解决方案、游戏内商城商业化解决方案等，已经在大量腾讯精品游戏中上线、稳定运营。



# Tips

+ 关于VSCode 1.33的兼容

  更新 VScode 1.33 之后调试器可能出现断点无法停止的情况，如遇此问题，请从master分支中拉取最新的`LuaPanda.lua`文件，覆盖原有文件即可。

+ 关于找不到`libpdebug`模块报错

  `libpdebug.so(dll)` 是放置在VSCode插件中的调试器C扩展，会在调试器运行时自动加载，作用是加速调试。

  xlua允许用户重写文件加载函数`CustomLoader`，sluaunreal也提供类似方法`setLoadFileDelegate`。

  发生此问题的原因之一是用户重写了加载函数中没有加入对so/dll的处理，加载so/dll时会报找不到文件，但随后执行lua原生loader能够正确加载libpdebug。
  
  查看libpdebug.so是否加载的方式是在控制台输入`LuaPanda.getInfo()`, 返回信息中有 hookLib Ver 说明libpdebug已经加载。此时可以忽略报错或在文件加载函数函数中正确处理.so/dll.



# 近期更新

+ v2.2.0
  
  增加了`LuaPanda.doctor()` 命令，可以检查环境中的错误(需更新LuaPanda.lua和DebugTools.lua至2.2.0)。
  
  修复了VSCode请求变量信息但在lua中发生错误，导致调试器卡住的问题。
  
  修复了c库在一些框架下无法正常运行，导致程序自动退出的问题。

  

+ v2.1.0
  
  增加真机调试中对替换路径的支持。相关文档 [真机调试说明](./Docs/Manual/debug-on-phone.md)
  
  优化了attach造成运行卡顿的问题。
  
  建议把LuaPanda.lua更新到最新版本。



# 特性

+ 支持单步调试，条件断点，协程调试，支持调试时变量赋值。
+ 支持lua5.1- 5.3, 支持 slua/xlua/slua-unreal 等框架
+ 在断点处可以监视和运行表达式，返回结果
+ 可以根据断点密集程度调整 hook 频率, 有较好高的效率
+ 支持 attach 模式，lua 运行过程中可随时建立连接
+ 使用 lua / C 双调试引擎。lua 部分可动态下发，避免打包后无法调试。C 部分效率高，适合开发期调试。



# 接入和开发指引

接入和使用文档

[项目介绍](./Docs/Manual/feature-introduction.md)	| [快速试用指引](./Docs/Manual/quick-use.md) | [接入指引](./Docs/Manual/access-guidelines.md) |  [真机调试](./Docs/Manual/debug-on-phone.md)  | [单文件调试和运行](./Docs/Manual/debug-file.md) | [升级说明](./Docs/Manual/update.md) | [FAQ](./Docs/Manual/FAQ.md)

调试器开发文档

[工程说明](./Docs/Development-instructions/project-description.md) 	|  [调试器开发指引](./Docs/Development-instructions/how_to_join.md) |  [特性简述](./Docs/Development-instructions/debugger-principle.md) 



# 依赖和适用性

调试器依赖 LuaSocket , 可运行于 slua，slua-unreal ，xlua 等已集成 LuaSocket 的 lua 环境，也可以在 console 中调试。lua 版本支持 5.1- 5.3。



# 参与贡献

我们非常期待您的贡献，无论是完善文档，提出、修复 Bug 或是增加新特性。
如果您在使用过程中发现文档不够完善，欢迎记录下来并提交。
如果发现 Bug，请通过 [issues](https://github.com/Tencent/LuaPanda/issues) 来提交并描述相关的问题，您也可以在这里查看其它的 issue，通过解决这些 issue 来贡献代码。

请将pull request提交在 `dev` 分支上，经过测试后会在下一版本合并到 `master` 分支。更多规范请看[CONTRIBUTING](./CONTRIBUTING.md)

[腾讯开源激励计划](https://opensource.tencent.com/contribution) 鼓励开发者的参与和贡献，期待你的加入。



# 技术支持

如有问题先参阅 [FAQ](./Docs/Manual/FAQ.md) ，如有问题建议使用 [issues](https://github.com/Tencent/LuaPanda/issues) ，我们会关注和回复。

QQ群：974257225

