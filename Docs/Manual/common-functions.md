# 其他功能说明



## 多目标调试 (multi-target)

有时我们希望同时调试多个lua虚拟机。最简单的办法是启动多个vscode窗口，打开不同的项目，分别和各虚拟机建立连接，唯一要注意的是不同的虚拟机需要设置不同的端口通信（ 同时修改launch.json和 `require("LuaPanda").start(ip, port) `中的端口即可 ）

如果希望在一个VSCode窗口中连接多个lua虚拟机，就要用到多目标调试。如下图，一个 VSCode 窗口同时和两个虚拟机建立了连接，Project1 和 Project2 分别独立运行，通过切换堆栈可以分别观察它们的状态。

![multi-target](../Res/Manual/common-functions/multi-target.png)



要如何进行多目标调试呢？ LuaPanda支持两种方式：

#### 1.  多个项目放在同一个workspace中

![workspace](../Res/Manual/common-functions/workspace.png)

+ 打开workspace, 发现存在两个项目 project1 和  project2.  切换到调试选项卡，可以分别给两个项目增加配置。

![workspace-config](../Res/Manual/common-functions/workspace-config.png)



+ 如果两个项目之前单独调试过，那么配置文件应该是已存在的。分别创建两个项目的配置后，修改他们的配置名和端口号，使之不同，避免相互干扰。

![change-name-port](../Res/Manual/common-functions/change-name-port.png)

+ 在vscode窗口中运行两个目标。分别在两个lua虚拟机的代码中引用调试器（**注意保持端口一致**），之后启动虚拟机，即可分别建立连接，开始调试。



#### 2. 多个项目放置在同一个工程中

这种情况下，一个文件夹中的 lua 代码分别运行在两个虚拟机，配置方法如下

+ 打开上层公共文件夹 

+ 建立launch.json文件: 切换到debug选项卡，创建一份launch.json 配置文件

+ 修改 launch.json。 复制一份 LuaPanda 配置，并修改name和port, 使之不同，如下图

![one-folder](../Res/Manual/common-functions/one-folder.png)



+ 在VScode中启动两个目标，在两个lua虚拟机运行的lua代码中分别引用调试器（**注意设置端口**），运行各lua虚拟机，即可开始调试。





## 独立文件调试说明(debugging independent file)

### 什么是独立文件

我们这里的 **独立文件** 指的是不依赖于 `其他模块/特定运行环境/特定框架` 的 lua 文件。

即存在一个文件 a.lua 用户执行

```
lua a.lua
```

注意：此模式下无需加入require("LuaPanda"), 调试器会自动引用。

![config_select](file:///Users/stuartwang/LuaPanda2020/Docs/Res/config-select.png?lastModify=1605749769)

把调试选项切换至`LuaPanda-DebugIndependentFile`,  **代码编辑窗口切换到待调试文件**，点击下图绿色箭头或按F5运行。

### 调试独立文件



VSCode 会启动一个新终端，调用 lua 命令来执行当前打开的lua代码。

![nodebug](file:///Users/stuartwang/LuaPanda2020/Docs/Res/nodebug.png?lastModify=1605749769)

把代码编辑窗口切换到待执行文件（让待执行文件的窗口处于激活状态），然后如下图操作。

### 快速运行独立文件



如果希望使用运行独立文件，第一步是建立 launch.json ，可以[参阅文档](launch-json-introduction.md)，这里不再重复。

就可以正确运行，并输出运行结果的文件。调试器执行独立文件也正是调用了上面的命令，这些被执行的命令可以从vscode的终端里看到。



## VSCode ssh远程调试

Vscode 有非常强大的远程插件机制，通过 Remote-SSH 插件就可以实现。远程插件这里不做详细介绍，LuaPanda 支持远程调试，唯一要注意的是打开的文件夹中不要包含中文或异常符号，在一些平台上（如 linux）会因为这些符号导致问题。