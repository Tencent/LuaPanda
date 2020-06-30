# 真机调试

[TOC]

LuaPanda已支持真机调试。我们建议真机调试使用lua库，可以热更下发调试器。

libpdebug.so库默认放置在VSCode插件中，真机调试时可能无法被找到。如果希望使用C库调试，需要把库或是C库源码编译到工程中(Release版本不建议)。

以下是真机调试的两种方法

### 1. 安卓反向代理调试

1. 安装adb命令

如果没有安装过安卓SDK，可以下载Platform Tools，其中包含adb命令

https://developer.android.com/studio/releases/platform-tools.html

2. 设置反向代理

手机通过数据线连接PC，在终端输入

```
adb reverse tcp:8818 tcp:8818
```

如果没有报错，手机的8818端口数据会转发到pc的8818端口，实现内网访问。

VSCode 端 Launch.json中的`connectionPort`也到要是8818（默认），以便接收消息。

3. 开始调试

启动调试器和APP即可正常调试。



**注意**： 如中途拔掉手机，重连手机后需要重新输入`adb reverse tcp:8818 tcp:8818`



### 2. 局域网调试

1. 处于同一网络

保证手机和pc连上同一局域网，相互可以ping通。

2. 修改代码

启动调试器代码，ip改为运行 VSCode 的 pc的 ip 地址。

```
require("LuaPanda").start("pcIP"，8818)
```

3. 开始调试

启动调试器和APP即可正常调试。



### 关于真机调试的说明

+ 安卓手机连接windows开启反向代理后，游戏运行会因为attach连接而卡顿。建议准备进行连接时再开反向代理，不需要调试时拔线或者使用下面命令解除反向代理

  ```
  adb reverse --remove-all
  ```

  mac上无此现象。



### 真机调试时的路径说明

+ 自动路径模式下，无需特别设置。
+ 如使用手动拼接路径，请参阅如下内容决定是否使用路径映射

当调试lua文件时，当前正在执行的文件路径是由lua虚拟机返回给调试器([http://www.lua.org/manual/5.3/manual.html#lua_getinfo](http://www.lua.org/manual/5.3/manual.html#lua_getinfo))。

调试器获得的路径可能是文件的绝对路径，也可能是相对路径。这取决于加载文件时传给lua虚拟机的文件路径。

如果调试器获得的是绝对路径，那么在命中断点时直接把这个路径传给VSCode。

如果是相对路径，调试器使用cwd+getinfo拼出完整路径，再传给VSCode。可以调整cwd，以确保拼出的路径是正确的。

如果调试器获得的绝对路径，或者拼接成的路径有偏差（参见 [issue #18](https://github.com/Tencent/LuaPanda/issues/18)），我们提供路径映射配置 docPathReplace

比如lua文件在pc上路径 		 C:/GameProcect/Assets/script/test.lua
放置在手机里，路径变成了 	/data/data/com.project.test/script/test.lua

在launch.json docPathReplace中设置

```json
"docPathReplace": ["/data/data/com.project.test/"," C:/GameProcect/Assets/"]
```

就可以完成路径映射，把运行环境的/data/data/com.project.test/script/test.lua映射到观察环境C:/GameProcect/Assets/script/test.lua



### 反转 client - server

调试器分为 vscode 插件 和 LuaPanda.lua 两部分。通常情况下VScode插件作为server端，LuaPanda.lua作为client.

这种配置会造成问题，当运行vscode的pc处于内网时，client通过ip是无法连接的（上面的安卓反向代理方法不受影响）。

为了解决在不使用反向代理，pc处理内网导致无法连接的的情况。调试器支持 c-s 反转，具体使用方法是

1. 确认vscode插件 以及 LuaPanda.lua 都升级到3.2.0版本

2. 在 launch.json 中 加入如下配置

```
"VSCodeAsClient": true,
"connectionIP": "127.0.0.1"
```

这里的ip填写要连接的手机ip.   之后尝试在 vscode 中运行一下，会提示

```
[Connecting] 调试器 VSCode Client 已启动，正在尝试连接。  Target:LuaPanda Port:8818
```

3. 修改require调用

```
require("LuaPanda").startServer("0.0.0.0", port)
```

这里的port 要和要上面 Target:LuaPanda Port:8818 这里的port保持一致。

之后正常连接开始调试即可。



