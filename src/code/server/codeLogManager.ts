// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

export enum LogLevel{
    DEBUG = 0,
    INFO = 1 ,
    ERROR = 2,
    RELEASE = 3
}
export class Logger {
    public static currentLevel = LogLevel.DEBUG;
    public static connection;
    public static init() {
    }

    public static log(str: string, level?) {
        if(! level){
            level = LogLevel.DEBUG;
        }

        if (str != "" && str != null) {
            if(level == LogLevel.ERROR) this.ErrorLog(str);
            if(level == LogLevel.INFO)  this.InfoLog(str);
            if(level == LogLevel.DEBUG)  this.DebugLog(str);
        }
    }

    public static DebugLog(str: string){
        if( this.currentLevel <= LogLevel.DEBUG){
            this.connection.console.log(str);
        }
    }

    public static InfoLog(str: string){
        if( this.currentLevel <= LogLevel.INFO){
            this.connection.console.log(str);
        }
    }

    public static ErrorLog(str: string){
        if( this.currentLevel <= LogLevel.ERROR){
            this.connection.console.log(str);
        }
    }

}
