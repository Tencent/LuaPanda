# 升级说明

调试器框架分为三部分

+ VSCode 扩展。 下载地址 : https://marketplace.visualstudio.com/items?itemName=stuartwang.luapanda

  如有更新，VSCode 会主动提示。

+ lua文件。 下载地址：https://github.com/Tencent/LuaPanda/releases 

  LuaPanda.lua

  需要用户手动下载最新的文件，替换工程中原有文件。

+ 调试器c库 ： plibdebug

  plibdebug默认放置在VSCode 扩展中，无需用户手动更新。如果使用源码编译的方式，需要更新代码重新编译。



通常用户只要手动更新lua文件即可。