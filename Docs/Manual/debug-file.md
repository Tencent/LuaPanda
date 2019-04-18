# 单文件运行调试说明

[TOC]

我们在做lua开发时，有时希望在一个独立文件中测试函数执行结果。单文件的执行/调试也是为了方便这种场景。

配置方法：

### 1. 重建launch.json

备份并删除工程现有的launch.json，点击VSCode调试界面的齿轮重新生成配置文件。

新生成的配置文件中新增了单文件执行/调试的选项。

```json
配置文件示例
{
    "version": "0.2.0",
    "configurations": [
        {
            "type": "lua",
            "request": "launch",
            "name": "LuaPanda",	//配置名，正常调试
            "program": "${workspaceFolder}",
            "cwd": "${workspaceFolder}", //工作路径
            "TempFilePath": "${workspaceFolder}",//临时文件存放路径
            "luaFileExtension": "lua",//被调试文件后缀
            "pathCaseSensitivity": true,//路径是否大小写敏感
            "stopOnEntry": true,//是否在开始调试时停止
            "connectionPort": 8818,//连接端口号，默认8818
            "logLevel": 1, //日志等级
        		"useCHook":true, //是否使用C lib库
            "luaPath": ""		//执行lua文件时，lua命令的路径
        },
    		{
            "type": "lua",
            "request": "launch",
            "internalConsoleOptions": "neverOpen",
            "name": "LuaPanda-DebugFile", //配置名，调试单文件
            "program": "${workspaceFolder}",
            "cwd": "${workspaceFolder}",
            "TempFilePath": "${workspaceFolder}",
            "luaFileExtension": "",
            "pathCaseSensitivity": true,
            "connectionPort": 8818,
            "stopOnEntry": true,
            "useCHook": true,
            "logLevel": 1,
            "luaPath": "",	//执行lua文件时，lua命令的路径	
            "packagePath": ["./doc1/?.lua"] //执行lua文件时，加入package.path的路径
        }
    ]
}
```



相对于旧的配置文件，增加了LuaPanda-DebugFile选项，它可以用来调试单文件。

新增的配置项包括
**luaPath**：lua命令路径，如果lua命令已经存在系统path中，可以不填。

**packagePath**：运行起lua文件时，希望加入package.path的路径。



### 2. 运行单文件

把代码编辑窗口切换到待执行文件，如下选择不调试情况下启动。

![nodebug](../static/nodebug.png)

VSCode 会启动一个新终端，执行当前打开的lua代码。



### 3. 调试单文件

把调试选项切换至`LuaPanda-DebugFile`,  代码编辑窗口切换到待调试文件，运行。

![config_select](../static/config-select.png)

此模式下无需加入require("LuaPanda"), 调试器会自动引用。

注意：刚加载文件夹后，VSCode读取当前活动窗口会出错，出现如下错误提示再执行一次就可以了。
```
lua: cannot open extension-output-#5: No such file or directory
```
