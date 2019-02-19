## 快速使用

注：VSCode的调试插件机制是: 当使用某个插件调试过一种语言时，会导致该语言的其他调试插件无法生效，请先禁用之前的调试插件并重新启动VSCode。

以下是各框架下快速试用调试器的方法，开始之前请先到 VSCode 扩展商店下载安装 `LuaPanda` 调试插件。

### console

使用console调试请先确认安装了luasocket。windows下调试console中lua进程, 请调整launch.json中useCHook: false(见附录)

验证luasocket方法：console下执行lua，并 `require "socket.core"` 不报错说明已安装luasocket。

1. **安装VSCode插件**：VSCode 商店搜索 LuaPanda，安装插件。
2. **添加被调试文件**：创建一个文件夹，名为`luaDebugTest`，  其中放入被调试lua文件。
3. **在被调试工程中放入调试器文件**：从Git目录下`/Debugger/`文件夹中的获取 `LuaPanda.lua, DebugTools.lua` 两个文件，拷贝到`luaDebugTest`文件夹中，并在被调试lua文件中调用`require("LuaPanda").start("127.0.0.1",8818);`
4. **配置**：使用VSCode 打开 `luaDebugTest` 文件夹，切换到调试页卡（shitf + cmd(ctrl) + D），点击页面内的齿轮符号，选择 LuaPanda，会自动生成一张配置表。配置表默认不用修改。
5. **开始调试**： 点击VScode调试页卡下的绿色箭头。在console中把当前目录切换到`luaDebugTest`，再执行lua脚本即可开始调试。



### slua

1. **下载 slua 工程** 下载 slua 工程源码 https://github.com/pangweiwei/slua
2. **slua 工程设置** 使用 Unity 打开 slua 工程，切换工程平台到 Android/iOS ， 点击菜单 Slua -> All -> Make，选择 `Slua/Editor/example/Circle` 场景。
3. **放入调试文件** 把`/Debugger`中的 `LuaPanda.lua, DebugTools.lua` 两个文件拷贝到slua工程 `Slua/Resources/` 目录下, 并修改文件后缀为 `.txt`
4. **配置工程** VSCode 打开 `Slua/Resources/` 目录，点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。生成的配置表不必修改。
5. **开始调试** 在 `Slua/Resources/circle/circle.txt` 中加入代码 `require("LuaPanda").start("127.0.0.1",8818)`. 点击 VSCode 调试的绿色箭头，再运行Unity，在加入 require 的位置后会自动停止。也可以打断点调试



### xlua

1. **下载 xlua 工程**  https://github.com/Tencent/xLua
2. **放入调试文件** 把/Debugger中的 `LuaPanda.lua, DebugTools.lua` 两个文件拷贝到xlua工程 `\XLua\Examples\07_AsyncTest\Resources` 目录下, 并修改后缀为 `.lua.txt`
3. **配置工程**  把`\XLua\Examples\07_AsyncTest\Resources` 文件夹放入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。把配置项 luaFileExtension 值修改为 "lua.txt"
4. **开始调试** 在`\XLua\Examples\07_AsyncTest\Resources\async_test.lua.txt` 中加入`require("LuaPanda").start("127.0.0.1",8818)` 。 点击 VSCode 的开始调试箭头，运行Unity，在加入 require 的位置后会自动停止。也可以打断点调试。



### slua-unreal

1. **下载slua-unreal工程** https://github.com/Tencent/sluaunreal
2. **放入调试文件** 把/Debugger中的 `LuaPanda.lua, DebugTools.lua` 两个文件拷贝到slua-unreal 工程`sluaunreal/Content/Lua/`目录下
3. **配置工程** 把`sluaunreal/Content`文件夹放入 VSCode , 点击 VSCode 调试选项卡下的齿轮图标，选择 LuaPanda。
4. **开始调试** 在执行的lua代码中加入`require("LuaPanda").start("127.0.0.1",8818)` 。 点击 VSCode 的开始调试箭头，再运行ue4，在加入 require 的位置后会自动停止。之后可以打断点调试。



### 附录：launch.json 配置表

```json
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "lua",
            "request": "launch",
            "name": "LuaPanda",
            "program": "${workspaceFolder}",
            "cwd": "${workspaceFolder}", //工作路径
            "TempFilePath": "${workspaceFolder}",//临时文件存放路径
            "luaFileExtension": "lua",//被调试文件后缀
            "pathCaseSensitivity": true,//路径是否大小写敏感
            "stopOnEntry": true,//是否在开始调试时停止
            "connectionPort": 8818,//连接端口号，默认8818
            "logLevel": 1, //日志等级
            "useCHook":true	//是否使用C lib库
        }
    ]
}
```

