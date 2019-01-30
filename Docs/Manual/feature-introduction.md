# 项目介绍

[TOC]

LuaPanda 是一个基于VSCode扩展的lua调试器，设计目标是简单易用，支持多种开发框架。因当前项目大量使用lua进行开发，为了能够提升定位修复lua问题的效率，我们自己动手开发了这个工具。

LuaPanda 使用了lua + C 双架构。调试器主体使用lua开发（可独立运行），另外有一个高性能的C扩展库，兼顾了C的高效以及lua的灵活性。

lua适合的场景

- 动态下发，避免游戏打包后无法调试的。适合发布后使用。

C扩展适合的场景

- 效率高，适合开发期调试。

调试器的IDE使用VSCode，下面是调试界面。

![debugui](../static/feature-introduction/debugui.png)



LuaPanda由两部分组成，分别是 Debugger Extension 和 debugger 调试器。架构可以参考下图
（图片引自 https://code.visualstudio.com/api/extension-guides/debugger-extension）

![debug-arch2](../static/feature-introduction/debug-arch2.png)

Debugger Extension 是一个 VScode 扩展。Debugger是 Lua 实现的调试器。另外LuaPanda还提供一个可选的C调试库，运行时会自动引用，使用时不必关心。



# 特性

以下是支持的特性

- 支持单步调试，断点调试，协程调试
- 支持lua5.1- 5.3, 支持 win/mac 平台，支持 slua/xlua/slua-unreal 等框架
- 在断点处可以监视和运行表达式，返回结果
- 可以根据断点密集程度调整 hook 频率，有较好的效率
- 支持 attach 模式，lua 运行过程中可随时建立连接
- 使用 lua / C 双调试引擎。lua 部分可动态下发，避免打包后无法调试。C 部分效率高，适合开发期调试。



### 多平台的支持

Mac  console + lua 5.1
![debugon-console](../static/feature-introduction/debugon-console.png)

Win  slua-unreal + lua5.3
![debugon-slua-ue](../static/feature-introduction/debugon-slua-ue.png)



### 展示元表 和 upvalue

可以显示table的成员数目和元表，function的upvalue。
![show-metatable](../static/feature-introduction/show-metatable.png)



### 表达式监控 和 调试控制台

在变量监控区可以输入并监控表达式

![REPL-watch](../static/feature-introduction/REPL-watch.png)

调试控制台，可以在断点处输入表达式

![debug-console](../static/feature-introduction/debug-console.png)

在需要查看的变量或者是表达式前加p , 即可返回输出结果，如上图。

### 支持attach模式

通常的调试流程是先运行vscode端，再开始执行lua工程。
attach模式支持先执行lua工程，在希望调试的时候运行调试器，建立连接，开始调试。

![attach_mode](../static/feature-introduction/attach_mode.GIF)