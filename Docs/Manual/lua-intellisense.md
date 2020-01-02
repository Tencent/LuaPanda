# Lua 原生符号感知

在编写lua代码时，分析插件可以感知lua代码中的符号，用作定义跳转和代码补全。但是无法感知c++/c#导出符号，给使用带来不便。

我们尝试分析 c# / c++ 的导出符号文件，提取其中的符号转换为lua代码，并把这部分自动生成的代码放置在一个预读区。插件启动时会读取这些生成的符号，在用户输入时进行代码提示。

预读区设置在用户当前打开文件夹的.vscode/LuaPanda/IntelliSenseRes/路径下。以后用户每次用VSCode打开这个文件夹，都可以自动加载这些预读文件。如果用户不再需要这些文件，直接把.vscode/LuaPanda/IntelliSenseRes/目录下的内容删除就行。

### 使用方法

插件完全启动后可以点击VScode状态栏的LuaPanda按钮，拉起可视化设置界面，在最后一项“用于IntelliSense的文件夹路径”中填入导出符号的文件路径

比如slua-unreal demo工程可以填写 

E:\sluaunreal\Source （E:\sluaunreal替换为sluaunreal所在路径）

或者

D:\Epic Games\UE_4.22\Engine\Source\Runtime\Engine\Public  （D:\Epic Games\UE_4.22\替换为UE所在路径）

点击生成文件按钮，稍后提示成功后。点开 .vscode/LuaPanda/IntelliSenseRes/UECppinterface 就可以看到生成的文件，之后输入代码时即可看到这些新生成的提示。



*slua 对应的原生接口文件在 `项目路径\Assets\Slua\LuaObject` 目录下

