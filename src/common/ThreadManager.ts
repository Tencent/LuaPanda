import { DebugLogger } from './logManager';

export class ThreadManager {
    static THREAD_ID = 1;
    private _CUR_THREAD_ID = 0;
    get CUR_THREAD_ID(){   
        if (this._CUR_THREAD_ID <= 0) {
            DebugLogger.showTips("获取线程号错误! ", 2);
            return 0; 
        }
        return this._CUR_THREAD_ID;
    }

    public constructor() {
        this._CUR_THREAD_ID = ThreadManager.THREAD_ID;
        ThreadManager.THREAD_ID ++;
    }
}
