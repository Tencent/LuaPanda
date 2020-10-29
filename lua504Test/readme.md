# Lua5.4 测试用例

本文件夹中提供 win / mac 下 lua 5.4 测试用例，其中的 lua 可执行程序及对应的 luasocket 使用 [Lua 5.4.1](https://www.lua.org/ftp/lua-5.4.1.tar.gz) ， [luasocket](https://github.com/diegonehab/luasocket) 源码编译出的。

win 和 mac 都是x64版本 , 如果需要x86后续我再补充。



测试方法：

vscode 安装好 LuaPanda 插件，把 win 或 mac 文件夹拖入 vscode 。如下图点击 Run，之后打开终端

windows 输入 `./lua504.exe ./test.lua`

mac 输入`./lua504 ./test.lua`

即可开始调试，可自行在 test.lua 加入测试代码，如有问题，欢迎 issue 反馈



![test504-1](./res/test504-1.png)



注意：5.4 版本调试时请在 launch.json中关闭 useCHook 选项（本测试用例中已关闭）