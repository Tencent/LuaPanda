# 调试器快速试用

代码辅助工具无需配置，使用VSCode打开含有 lua 的文件夹即可。下面的内容是调试器功能的快速试用。



注：VSCode的调试插件机制是: 当使用某个插件调试过一种语言时，会导致该语言的其他调试插件无法生效，请先禁用之前的调试插件并重新启动VSCode。

以下是各框架下快速试用调试器的方法，开始之前请先到 VSCode 扩展商店下载安装 `LuaPanda` 调试插件。

### console

使用console调试请先确认安装了luasocket。

验证方法：console下执行lua，并 `require "socket.core"` 不报错说明已安装luasocket。

1. **安装VSCode插件**：VSCode 商店搜索 LuaPanda，安装插件。

2. **添加被调试文件**：创建一个文件夹，取名为`LuaPandaTest`，  其中放入被调试lua文件。

3. **配置**：使用 VSCode 打开 `LuaPandaTest` 文件夹，切换到调试页卡（shitf + cmd(ctrl) + D），点击页面内的齿轮符号，选择 LuaPanda，会自动生成一张配置表。

   如果仅在指定目录下可以调用lua命令，需修改配置表中的"luaPath",  填入lua.exe位置。

4. **开始调试**：  **代码编辑面板中点开要调试的文件**，VSCode切换到调试选项卡，配置项选择`LuaPanda-DebugFile`，点击VSCode调试页卡下的绿色箭头，VSCode会拉起terminal ,并执行命令调试运行当前窗口的lua。

   如出现错误，可检查当前激活的窗口是否正确，luaPath配置是否正确。



### slua

1. **下载 slua 工程** 下载 slua 工程源码 https://github.com/pangweiwei/slua
2. **slua 工程设置** 使用 Unity 打开 slua 工程，切换工程平台到 Android/iOS ， 点击菜单 Slua -> All -> Make，选择 `Slua/Editor/example/Circle` 场景。
3. **放入调试文件** 把github中 /Debugger 下的 `LuaPanda.lua` 文件拷贝到slua工程 `Slua/Resources/` 目录下, 并修改文件后缀为 `.txt`
4. **配置工程** VSCode 打开 `Slua/Resources/` 目录，点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。把配置项 luaFileExtension 值修改为 "txt"。
5. **开始调试** 在 `Slua/Resources/circle/circle.txt` 中加入代码 `require("LuaPanda").start("127.0.0.1",8818)`.  VSCode切换到调试选项卡，配置项选择`LuaPanda`，点击 VSCode 调试的绿色箭头，再运行Unity，在加入 require 的位置后会自动停止。也可以打断点调试



### xlua

1. **下载 xlua 工程**  https://github.com/Tencent/xLua
2. **放入调试文件** 把github中 /Debugger 下的 `LuaPanda.lua` 文件拷贝到xlua工程 `\XLua\Examples\07_AsyncTest\Resources` 目录下, 并修改后缀为 `.lua.txt`
3. **配置工程**  把`\XLua\Examples\07_AsyncTest\Resources` 文件夹放入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。把配置项 luaFileExtension 值修改为 "lua.txt"
4. **开始调试** 在`\XLua\Examples\07_AsyncTest\Resources\async_test.lua.txt` 中加入`require("LuaPanda").start("127.0.0.1",8818)` 。VSCode切换到调试选项卡，配置项选择`LuaPanda`, 点击 VSCode 的开始调试箭头，运行Unity，在加入 require 的位置后会自动停止。也可以打断点调试。



### slua-unreal

1. **下载slua-unreal工程** https://github.com/Tencent/sluaunreal
2. **放入调试文件** 把github中 /Debugger 下的 `LuaPanda.lua` 文件拷贝到slua-unreal 工程`sluaunreal/Content/Lua/`目录下
3. **配置工程** 把`sluaunreal/Content`文件夹放入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。
4. **开始调试** 在执行的lua代码中加入`require("LuaPanda").start("127.0.0.1",8818)` 。VSCode切换到调试选项卡，配置项选择`LuaPanda`， 点击 VSCode 的开始调试箭头，再运行ue4，在加入 require 的位置后会自动停止。之后可以打断点调试。



### unlua

目前unlua默认不集成luasocket，需要安装调试依赖的luasocket库，之后再进行调试接入。

1. **安装luasocket** 
   + luasocket源码推荐使用 https://github.com/diegonehab/luasocket 。我们用此源码编译了luasocket库文件并放在项目的/luasocketBin/下。
   + mac下可以选择 **源码编译/插件管理工具安装/拷贝库文件** 的方式，把`socket和mime文件夹`部署到/usr/local/lib/lua/5.3/ 目录下，运行时可以自动被引用到， 部署完成后调用`require("socket.core");` 验证是否有报错。
   + win下可以选择 **源码编译/拷贝库文件** 的方式，把luascoket拷贝到自定义位置，并在lua代码中修改package.cpath，使库文件可以被引用到。比如部署在c:/luasocket下，cpath要修改为`package.cpath = package.cpath .. ";c:/luasocket/?.dll";`, 并用 `require("socket.core");` 验证是否有报错。
2. **放入调试器文件** 把github中 /Debugger 下的 `LuaPanda.lua` 文件拷贝到unlua工程 `unlua/Content/Script/`下，和UnLua.lua 文件同级
3. **配置工程** 把`Script`文件夹放入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。打开生成的 `.vscode/launch.json` 文件,  **调整其中的stopOnEntry为 false。**
4. **开始调试** 在执行的lua代码中加入`require("LuaPanda").start("127.0.0.1",8818)` 。VSCode切换到调试选项卡，配置项选择`LuaPanda`， 点击 VSCode 的开始调试箭头，再运行ue4，在加入 require 的位置后会自动停止。之后可以打断点调试。



### cocos2dx

可能存在的问题：LuaPanda目前支持标准lua虚拟机，cocos2dx集成的是luajit，可能会在调试函数尾调用时出现跳步的情况，后续完整支持luajit后会解决此问题。

1. 下载cocos2dx并创建新工程 

2. **放入调试器文件** 把github中 /Debugger 下的 `LuaPanda.lua` 文件拷贝到cocos2dx工程 /src下，和main.lua 文件同级
3. **配置工程** 把`src`文件夹拖入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。

4. **开始调试** 在main.lua文件 `require "cocos.init"` 行之前加入代码    `require("LuaPanda").start("127.0.0.1",8818)` 。VSCode切换到调试选项卡，配置项选择`LuaPanda`， 点击 VSCode 的开始调试箭头，再运行cocos2dx工程，在加入 require 的位置后会自动停止。之后可以打断点调试。

