本目录下的luasocket二进制文件使用 https://github.com/diegonehab/luasocket 源码编译，区分win和mac平台。

1. 部署时把socket和mime两个文件夹拷贝到用户指定的文件夹下，如 `c:/luasocket`。如果这个文件夹中的库不能被lua自动引用，要修改package.cpath，比如 `package.cpath = package.cpath .. ";c:/luasocket/?.dll"`.

2. 最后在lua中用 `require("socket.core");` 验证，如无module 'socket.core' not found: 报错，则部署成功。

注意调试最好部署在开发环境，不要发布到正式环境。

