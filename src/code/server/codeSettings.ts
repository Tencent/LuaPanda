// 在这个文件中进行调试器的相关配置

export enum LogLevel{
    DEBUG = 0,
    INFO = 1 ,
    ERROR = 2,
    RELEASE = 3
}

export class CodeSettings{
    public static logLevel = LogLevel.RELEASE;
    // 调试的时候，为了方便查看信息，这里设置true . 发布版本改为 false
    public static isOpenDebugInfo = false;
}