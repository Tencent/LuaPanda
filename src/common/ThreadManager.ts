// import { DebugLogger } from './logManager';

export class ThreadManager {
    static THREAD_ID_COUNTER = 0; // 线程计数器
    static NEXT_THREAD_ID = 0;  // 指示下一个待分配 thread id
    private _CUR_THREAD_ID; // 当前线程号，从 0 开始
    get CUR_THREAD_ID(){
        return this._CUR_THREAD_ID;
    }

    public constructor() {
        this._CUR_THREAD_ID = ThreadManager.NEXT_THREAD_ID;
        ThreadManager.NEXT_THREAD_ID ++;
        ThreadManager.THREAD_ID_COUNTER ++;
    }

    // 析构函数 如果线程数为0, 待分配线程号也置0
    public destructor() {
        ThreadManager.THREAD_ID_COUNTER--;
        if(ThreadManager.THREAD_ID_COUNTER === 0){
            ThreadManager.NEXT_THREAD_ID = 0;
        }
    }
}
