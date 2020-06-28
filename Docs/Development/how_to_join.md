

# 开发指引

[TOC]

## 通常的修改位置

调试器由三部分组成: 

adapter 

+ VScode扩展
+ 语言：typescript(javascript的超集) 约1000行
+ 核心代码: `src/luaDebug.ts`

 debugger

+ lua脚本 / c lib
+ 语言 lua 1300行 / c 1000行
+ 核心代码: `Debugger/LuaPanda.lua`  以及 `Debugger/debugger_lib/libpdebug.cpp`

debugger 由两部分组成，分别是 lua 调试主体和 c 扩展库。使用 c 扩展的目的是弥补lua效率低的缺陷。修改时主要关注核心代码即可。



## 搭建开发环境调试ts代码

1. 从Git上下载整个工程代码，解压
2. 打开终端切换到工程根目录， 执行`npm install`， 安装依赖插件（内网需代理）安装完成后，工程目录下会多出一个`node_modules`文件夹
3. 开新的VSCode窗口，把工程根目录拖入其中打开。按住`ctrl(cmd) + shitf + B`进行编译。如果编译时提示
  `can‘t find module 'xxx'` ,  说明依赖库没有安装完成，请再次执行第二步。
4. 把VSCode切换到调试界面，点击绿色的箭头，开始运行工程中代码。会弹出一个新的VSCode窗口，标题是[扩展开发主机]。这个扩展开发机中已经预制了编译出的插件(尽管没有在插件列表中显示)。
5. 参照[快速使用](../Manual/quick-use.md)在扩展开发机中进行lua调试。同时可以在原VSCode的ts代码中打断点，以观察执行流程。
6. 修改了ts代码需要验证，要重新编译`ctrl(cmd) + shitf + B`之后再次运行。



## 利用日志追踪debugger运行状态

调试器的debugger端无法调试自身，但我们建立了日志系统，以便从日志分析执行状态。

1. VSCode打开一个待调试工程，切换到调试界面，点击界面上的齿轮创建/查看配置。
2. 配置文件中有一项`logLevel` ， 它表示日志级别。默认是1，为了展示所有日志现在改为0。
3. 正常开始lua调试流程, 点击输出(OUTPUT), 其中 Debugger/log 日志选项卡可以查看Debugger打出的日志。
4. 如果需要在debugger中增加新日志，使用`LuaPanda.printToVSCode()`，但建立网络连接(vscode底部颜色条变为橙色)之后debugger日志才会打印在vscode中。
5. 可以使用日志跟踪运行状态。但因为VSCode的异步打印机制，日志可能无法保证严格顺序。也可以参考`Adapter/log` ，日志信息也会在这里打印，这里的日志是严格排序的，可以对照[运行流程图](../Res/work-flow.png)了解交互过程。

![debug_log](../Res/debug_log.png)









