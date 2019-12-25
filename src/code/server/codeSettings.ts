// 在这个文件中进行调试器的相关配置

export enum LogLevel{
    DEBUG = 0,
    INFO = 1 ,
    ERROR = 2,
    RELEASE = 3
}

export class CodeSettings{
    //DEV SETTINGS
    public static logLevel = LogLevel.DEBUG;
    public static isOpenDebugCode = true;  //是否打开debug代码段
    public static isAllowDefJumpPreload = true; //是否允许定义跳转到预置文件

    //RELEASE SETTINGS
    // public static logLevel = LogLevel.RELEASE;
    // public static isOpenDebugCode = false;  //是否打开debug代码段
    // public static isAllowDefJumpPreload = true; //是否允许定义跳转到预置文件 
}