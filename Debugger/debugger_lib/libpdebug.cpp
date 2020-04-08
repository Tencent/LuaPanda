// Tencent is pleased to support the open source community by making LuaPanda available.
// Copyright (C) 2019 THL A29 Limited, a Tencent company. All rights reserved.
// Licensed under the BSD 3-Clause License (the "License"); you may not use this file except in compliance with the License. You may obtain a copy of the License at
// https://opensource.org/licenses/BSD-3-Clause
// Unless required by applicable law or agreed to in writing, software distributed under the License is distributed on an "AS IS" BASIS, WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied. See the License for the specific language governing permissions and limitations under the License.

#include "libpdebug.h"
#include <ctime>
#include <list>
#include <map>
#include <string>

//using namespace std;
static int cur_run_state = 0;       //当前运行状态， c 和 lua 都可能改变这个状态，要保持同步
static int cur_hook_state = 0;      //当前hook状态， c 和 lua 都可能改变这个状态
static int logLevel = 1;            //日志等级（从lua同步）
static int pathCaseSensitivity = 1; //大小写敏感标志位（从lua同步）
//static int autoPathMode = 0;        //自动路径标是否开启志位
static int BPhit = 0;               //BP命中标志位
static int stackdeep_counter = 0;   //step用的栈深度计数器
static char hookLog[1024] = { 0 };
const char* debug_file_path;             //debugger的文件路径
int debug_file_path_len;
const char* tools_file_path;             //tools的文件路径
int tools_file_path_len;
char config_ext[32] = "";             //后缀（从lua同步）
const char* config_cwd = "";             //cwd(从lua同步)
const char* config_tempfile_path = "";
time_t recvMsgSeconds = 0;
const char* last_source;
int ar_current_line = 0;
int ar_def_line = 0;
int ar_lastdef_line = 0;
int bp_twice_check_res = 1;
int lua_debugger_ver = 0;             // luapanda.lua的版本，便于做向下兼容
struct path_transfer_node;
struct breakpoint;
// 路径缓存队列 getinfo -> format
std::list<path_transfer_node*> getinfo_to_format_cache;
// 存放断点map，key为source
std::map<std::string, std::map<int, breakpoint>> all_breakpoint_map;

enum run_state
{
    DISCONNECT = 0,
    WAIT_CMD = 1,
    STOP_ON_ENTRY = 2,
    RUN = 3,
    STEPOVER = 4,
    STEPIN = 5,
    STEPOUT = 6,
    STEPOVER_STOP = 7,
    STEPIN_STOP = 8,
    STEPOUT_STOP = 9,
    HIT_BREAKPOINT = 10
};

enum hook_state
{
    DISCONNECT_HOOK = 0,
    LITE_HOOK = 1,              //全局无断点
    MID_HOOK = 2,               //全局有断点，本文件无断点
    ALL_HOOK = 3,
};

enum hook_event
{
    CALL = 0,
    RETURN =1,
    LINE =2,
    TAILRET=4
};

enum breakpoint_type
{
    CONDITION_BREAKPOINT = 0,
    LOG_POINT,
    LINE_BREAKPOINT
};

//用来缓存路径的结构体
struct path_transfer_node{
    std::string src;
    std::string dst;
    path_transfer_node(std::string _src, std::string _dst){
        src = _src;
        dst = _dst;
    }
};

// 断点信息
struct breakpoint {
    breakpoint_type type;
    std::string info;
};

struct debug_auto_stack {
    explicit debug_auto_stack(lua_State* l) {
        this->L = l;
        this->top = lua_gettop(L);
    }
    ~debug_auto_stack() {
        lua_settop(this->L, this->top);
    }
    lua_State* L;
    int top;
};

//内部方法声明
void debug_hook_c(lua_State *L, lua_Debug *ar);
void check_hook_state(lua_State *L, const char* source, int current_line, int def_line, int last_line, int event = -1);
void print_to_vscode(lua_State *L, const char* msg, int level = 0);
void load(lua_State* L);

//打印断点信息
void print_all_breakpoint_map(lua_State *L, int print_level = 0) {
    if (print_level < logLevel) {
        return;
    }
    std::map<std::string, std::map<int, breakpoint>>::iterator iter1;
    std::map<int, breakpoint>::iterator iter2;
    std::string log_message = "[breakpoints in chook:]\n";
    for (iter1 = all_breakpoint_map.begin(); iter1 != all_breakpoint_map.end(); ++iter1) {
        log_message += iter1->first;
        log_message += '\n';
        for (iter2 = iter1->second.begin(); iter2 != iter1->second.end(); ++iter2) {
            log_message += std::string("    line: ");
            log_message += std::to_string(iter2->first);
            log_message += std::string("  type: ");
            switch (iter2->second.type) {
                case CONDITION_BREAKPOINT:
                    log_message += std::string("condition breakpoint  info: ");
                    log_message += iter2->second.info;
                    break;

                case LOG_POINT:
                    log_message += std::string("log point  info: ");
                    log_message += iter2->second.info;
                    break;

                case LINE_BREAKPOINT:
                    log_message += std::string("line breakpoint  info: ");
                    log_message += iter2->second.info;
                    break;

                default:
                    log_message += std::string("Invalid breakpoint type!");
                    log_message += std::to_string(iter2->second.type);
                    break;
            }
            log_message += '\n';
        }
    }
    print_to_vscode(L, log_message.c_str(), print_level);
}

//push_arg Template
template <typename T>
void push_arg(lua_State *L, T value);

template <>
void push_arg(lua_State *L, int value){
    lua_pushnumber(L, value);
}

template <>
void push_arg(lua_State *L, double value){
    lua_pushnumber(L, value);
}

template <>
void push_arg(lua_State *L, const char * value){
    lua_pushstring(L, value);
}

void push_args(lua_State *L){}
//push_arg Template End

template <typename T>
void push_arg(lua_State *L, T value){
    push_arg<T>(L, value);
}

template <typename T, typename ... ARGS>
void push_args(lua_State *L, T value ,ARGS... args){
    push_arg<T>(L, value);
    push_args(L, std::forward<ARGS>(args) ...);
}
//push_args End

template <typename ... ARGS>
int call_lua_function(lua_State *L, const char * lua_function_name, int retCount , ARGS... args){
    lua_getglobal(L, LUA_DEBUGGER_NAME);
    if (!lua_istable(L, -1)) {
        const char *err_msg = "[C Module Error]:call_lua_function Get LUA_DEBUGGER_NAME error.\n";
        print_to_vscode(L, err_msg, 2);
        return -1;
    }

    lua_getfield(L, -1, lua_function_name);
    if (!lua_isfunction(L, -1)) {
        char err_msg[100];
        snprintf(err_msg, sizeof(err_msg), "[C Module Error]:call_lua_function Get lua function '%s' error\n.", lua_function_name);
        print_to_vscode(L, err_msg, 2);
        return -1;
    }

    push_args(L, args...);
    int err_code = lua_pcall(L, sizeof...(args), retCount, 0);
    if (err_code) {
        char err_msg[1024];
        const char *lua_error = lua_tostring(L, -1);
        snprintf(err_msg, sizeof(err_msg), "[C Module Error]:call_lua_function Call '%s' error. ErrorCode: %d, ErrorMessage: %s.\n", lua_function_name, err_code, lua_error);
        print_to_vscode(L, err_msg, 2);
        lua_pop(L, 1);
        return err_code;
    }

    return 0;
}


//------------Lua同步数据接口------------
//lua层主动清除路径缓存
extern "C" int clear_pathcache(lua_State *L)
{
    getinfo_to_format_cache.clear();
    return 0;
}

//lua主动调用从c获取current_hook_state状态
extern "C" int get_libhook_state(lua_State *L)
{
    lua_pushnumber(L, cur_hook_state);
    return 1;
}

//lua主动调用从c获取last_source
extern "C" int get_last_source(lua_State *L)
{
    lua_pushstring(L, last_source);
    return 1;
}

//同步luapanda.lua的版本号
extern "C" int sync_lua_debugger_ver(lua_State *L)
{
    lua_debugger_ver = static_cast<int>(luaL_checkinteger(L, 1));
    return 0;
}

//同步断点命中标识
extern "C" int sync_bp_hit(lua_State *L) {
    if(cur_hook_state == DISCONNECT_HOOK){
        //返回参数个数
        return 0;
    }

    BPhit = static_cast<int>(luaL_checkinteger(L, 1));
    return 0;
}

//同步设置 -- 日志等级, 是否debug代码段, 是否使用忽略大小写
extern "C" int sync_config(lua_State *L) {
    logLevel = static_cast<int>(luaL_checkinteger(L, 1));
    pathCaseSensitivity = static_cast<int>(luaL_checkinteger(L, 2));
//    autoPathMode = static_cast<int>(luaL_optinteger(L, 3, 0));
    return 0;
}

//同步临时文件路径
extern "C" int sync_tempfile_path(lua_State *L) {
    config_tempfile_path = luaL_checkstring(L, 1);
    return 0;
}


//同步临时文件路径
extern "C" int set_bp_twice_check_res(lua_State *L) {
    bp_twice_check_res = luaL_checknumber(L, 1);
    return 0;
}

//lua 获取版本号
extern "C" int sync_getLibVersion(lua_State *L) {
    lua_pushstring(L, HOOK_LIB_VERSION);
	lua_pushnumber(L, LUA_VERSION_NUM);
    return 2;
}

//同步文件后缀
extern "C" int sync_file_ext(lua_State *L) {
    const char *ext = luaL_checkstring(L, 1);
    snprintf(config_ext, sizeof(config_ext), ".%s", ext);
    return 0;
}

//debugger路径
extern "C" int sync_debugger_path(lua_State *L) {
    debug_file_path = luaL_checkstring(L, 1);
	debug_file_path_len = strlen(debug_file_path);
    return 0;
}

//tools路径
extern "C" int sync_tools_path(lua_State *L) {
    tools_file_path = luaL_checkstring(L, 1);
	tools_file_path_len = strlen(tools_file_path);
    return 0;
}

//cwd
extern "C" int sync_cwd(lua_State *L) {
    config_cwd = luaL_checkstring(L, 1);
    return 0;
}

//同步运行状态给Lua C->lua
void sync_runstate_toLua(lua_State *L, int state) {
    debug_auto_stack _tt(L);
    cur_run_state = state;
    call_lua_function(L, "changeRunState", 0, state, 1);
    return;
}

//这个接口给lua调用，用来同步状态 lua->C
extern "C" int lua_set_runstate(lua_State *L) {
    cur_run_state = static_cast<int>(luaL_checkinteger(L, 1));
    return 0;
}

//根据运行状态修改hook状态
void sethookstate(lua_State *L, int state){
    cur_hook_state = state;
    switch(state){
        case DISCONNECT_HOOK:
            lua_sethook(L, debug_hook_c, LUA_MASKRET , 1000000);
            break;
        case LITE_HOOK:
            lua_sethook(L, debug_hook_c, LUA_MASKRET , 0);
            break;
        case MID_HOOK:
            lua_sethook(L, debug_hook_c, LUA_MASKCALL | LUA_MASKRET  , 0);
            break;
        case ALL_HOOK:
            lua_sethook(L, debug_hook_c, LUA_MASKCALL | LUA_MASKRET | LUA_MASKLINE, 0);
            break;
    }
}

//这个接口给lua调用，用来同步hook状态 lua->C
extern "C" int lua_set_hookstate(lua_State *L) {
    cur_hook_state = static_cast<int>(luaL_checkinteger(L, 1));
    sethookstate(L, cur_hook_state);
    return 0;
}

void print_to_vscode(lua_State *L, const char* msg, int level) {
    if ( DISCONNECT != cur_run_state && level >= logLevel) {
        //打印
        call_lua_function(L, "printToVSCode", 0, msg,  level);
    }
}

//获取路径(带缓存)
const char* getPath(lua_State *L,const char* source){
    debug_auto_stack _tt(L);

    if(source == nullptr){
        print_to_vscode(L, "[C Module Error]: getPath Exception: source == nullptr", 2);
        return "";
    }

    //检查缓存
    for(auto iter = getinfo_to_format_cache.begin();iter != getinfo_to_format_cache.end();iter++)
    {
        if(!strcmp((*iter)->src.c_str(), source)){
            return (*iter)->dst.c_str();
        }
    }

    //若缓存中没有，到lua中转换
    int lua_ret = call_lua_function(L, "getPath", 1 , source);
    if (lua_ret != 0) {
        return "";
    }
    const char* retSource = lua_tostring(L, -1);
    //加入缓存,返回
    path_transfer_node *nd = new path_transfer_node(source, retSource );
    getinfo_to_format_cache.push_back(nd);

    return retSource;
}

// 向 lua 中 checkRealHitBreakpoint 查询是否在缓存中，以判断是否真正命中断点
const int checkRealHitBreakpoint(lua_State *L,const char* source, int line){
    debug_auto_stack _tt(L);

    if(source == nullptr){
        print_to_vscode(L, "[C Module Error]: checkRealHitBreakpoint Exception: source == nullptr", 2);
        return 0;
    }

    //若缓存中没有，到lua中转换
    int lua_ret = call_lua_function(L, "checkRealHitBreakpoint", 1 , source, line);
    if (lua_ret != 0) {
        return 0;
    }
    int realHit = lua_toboolean(L, -1);
    return realHit;
}

//供lua调用,把断点列表同步给c端
extern "C" int sync_breakpoints(lua_State *L) {
    debug_auto_stack _tt(L);
    //取数组
    lua_getglobal(L, LUA_DEBUGGER_NAME);     //-1 LuaPanda
    if (!lua_istable(L, -1)) {
        print_to_vscode(L, "[C Module Error] debug_ishit_bk get LUA_DEBUGGER_NAME error", 2);
        return -1;
    }

    lua_getfield(L, -1, "breaks");
    if (!lua_istable(L, -1)) {
        print_to_vscode(L, "[C Module Error] debug_ishit_bk get breaks error", 2);
        return -1;
    }

    //遍历breaks
    all_breakpoint_map.clear();
    lua_pushnil(L);//breaks nil
    while (lua_next(L, -2)) {
        //breaks   k（string）   v(table)
        const char* source = luaL_checkstring(L, -2);

        std::map<int, breakpoint> file_breakpoint_map;
        lua_pushnil(L);//k，v, nil
        while (lua_next(L, -2)) {
            if(lua_debugger_ver >= 30150){
                lua_pushnil(L);//k，v, nil
                while (lua_next(L, -2)) {
                    //k,v,k,v
                    lua_getfield(L, -1, "line");            //k,v,k,v,line
                    int line = (int)lua_tointeger(L, -1);
                    lua_pop(L, 1); // line
                    
                    lua_getfield(L, -1, "type");
                    int type = (int)lua_tointeger(L, -1);
                    lua_pop(L, 1); // type
                    
                    struct breakpoint bp;
                    switch (type) {
                        case CONDITION_BREAKPOINT: {
                            bp.type = CONDITION_BREAKPOINT;
                            
                            lua_getfield(L, -1, "condition");
                            const char* condition = luaL_checkstring(L, -1);
                            lua_pop(L, 1); // condition
                            bp.info = condition;
                            break;
                        }
                            
                        case LOG_POINT: {
                            bp.type = LOG_POINT;
                            
                            lua_getfield(L, -1, "logMessage");
                            const char* log_message = luaL_checkstring(L, -1);
                            lua_pop(L, 1); // logMessage
                            bp.info = log_message;
                            break;
                        }
                            
                        case LINE_BREAKPOINT:
                            bp.type = LINE_BREAKPOINT;
                            
                            bp.info = std::to_string(line);
                            break;
                            
                        default:
                            print_to_vscode(L, "[C Module Error] Invalid breakpoint type!", 2);
                            return -1;
                    }
                    
                    file_breakpoint_map[line] = bp;
                    
                    lua_pop(L, 1);//value
                    //k,v,k
                }
                lua_pop(L, 1);//value
            }else{
                // 兼容 < 3.1.5 版本的luapanda.lua
                
                //k,v,k,v
                lua_getfield(L, -1, "line");            //k,v,k,v,line
                int line = (int)lua_tointeger(L, -1);
                lua_pop(L, 1); // line
                
                lua_getfield(L, -1, "type");
                int type = (int)lua_tointeger(L, -1);
                lua_pop(L, 1); // type
                
                struct breakpoint bp;
                switch (type) {
                    case CONDITION_BREAKPOINT: {
                        bp.type = CONDITION_BREAKPOINT;
                        
                        lua_getfield(L, -1, "condition");
                        const char* condition = luaL_checkstring(L, -1);
                        lua_pop(L, 1); // condition
                        bp.info = condition;
                        break;
                    }
                        
                    case LOG_POINT: {
                        bp.type = LOG_POINT;
                        
                        lua_getfield(L, -1, "logMessage");
                        const char* log_message = luaL_checkstring(L, -1);
                        lua_pop(L, 1); // logMessage
                        bp.info = log_message;
                        break;
                    }
                        
                    case LINE_BREAKPOINT:
                        bp.type = LINE_BREAKPOINT;
                        
                        bp.info = std::to_string(line);
                        break;
                        
                    default:
                        print_to_vscode(L, "[C Module Error] Invalid breakpoint type!", 2);
                        return -1;
                }
                
                file_breakpoint_map[line] = bp;
                
                lua_pop(L, 1);//value
 
            }
        }
        all_breakpoint_map[std::string(source)] = file_breakpoint_map;
        //k,v
        lua_pop(L, 1);//外部每次循环
        //k
    }
    lua_pop(L, 1);//外部每次循环

    print_all_breakpoint_map(L);
    check_hook_state(L, last_source, ar_current_line ,ar_def_line, ar_lastdef_line);
    return 0;
}

//断点命中判断
int debug_ishit_bk(lua_State *L, const char * curPath, int current_line) {
    debug_auto_stack _tt(L);
    // 获取标准路径[文件名.后缀]
    const char *standardPath = getPath(L, curPath);
    // 判断是否存在同名文件
    std::map<std::string, std::map<int, struct breakpoint>>::const_iterator const_iter1 = all_breakpoint_map.find(std::string(standardPath));
    if (const_iter1 == all_breakpoint_map.end()) {
        return 0;
    }

    // c++ all_breakpoint_map 的数据结构保持不变，和lua不一样
    // 根据是否存在相同行号
    std::map<int, struct breakpoint>::const_iterator const_iter2 = const_iter1->second.find(current_line);
    if (const_iter2 == const_iter1->second.end()) {
        return 0;
    }

    if(lua_debugger_ver >= 30160){
        // luapanda.lua >= 3.1.6 才会调用
        // 初步命中，到lua层中检测是否真正命中，以及断点类型
        int lua_ret = call_lua_function(L, "isHitBreakpoint", 1, standardPath, curPath, current_line);
        if (lua_ret != 0) {
            // 调用出错时，按命中处理
            return 1;
        }
        
        int realHit = lua_toboolean(L, -1);
        return realHit;
    }else{
        // 兼容旧版本
        // 条件断点
        if (const_iter2->second.type == CONDITION_BREAKPOINT) {
            std::string condition = const_iter2->second.info;
            int lua_ret = call_lua_function(L, "IsMeetCondition", 1, condition.c_str());
            if (lua_ret != 0) {
                return 0;
            }
            // if (!lua_isboolean(L, -1)) {
            //     print_to_vscode(L, "[Debug Lib Error] debug_ishit_bk process condition expression result error!", 2);
            //     return 0;
            // }
            int is_meet_condition = lua_toboolean(L, -1);
            lua_pop(L, 1);
            return is_meet_condition;
        }
        
        // 记录点
        if (const_iter2->second.type == LOG_POINT) {
            std::string log_message = "[log point output]: ";
            log_message.append(const_iter2->second.info);
            print_to_vscode(L, log_message.c_str() , 1);
            return 0;
        }
        return 1;
    }
}

//判断字符串是否匹配[string "
int isCodeSection(char *str) {
    if (strlen(str) > 9) {
        if (str[0] == '[' && str[7] == ' ' && str[8] == '"') {
            return 1;
        }
    }
    return 0;
}

//断点命中判断 retuen : is_hit
int breakpoint_process(lua_State *L, lua_Debug *ar){
    int is_hit = 0;
    if (ar->event == LINE) {
        is_hit = debug_ishit_bk(L, ar->source, ar->currentline);
        // 同名文件可能会命中假断点 folder1/a.lua 和 folder2/a.lua 截取文件名都是 a.lua, 可能导致命中混淆
        if(is_hit && lua_debugger_ver >= 30160){
            // luapanda.lua >= 3.1.6 版本才会调用
            is_hit = checkRealHitBreakpoint(L, ar->source, ar->currentline);
        }

        if (is_hit == 1 || BPhit) {
            print_to_vscode(L, "[C Module] Breakpoint hit!");
            int record_stackdeep_counter = stackdeep_counter;
            int record_cur_run_state = cur_run_state;
            stackdeep_counter = 0;
            sync_runstate_toLua(L, HIT_BREAKPOINT);
            bp_twice_check_res = 1;
            //c层掌握 STEPOVER 计数器，状态机放在lua层，c主要去读（毕竟C作为lua的扩展）
            //通知lua层,lua层阻塞，发消息
            if(BPhit){
                BPhit = 0;
                call_lua_function(L, "SendMsgWithStack", 0, "stopOnCodeBreakpoint");
            }else{
                call_lua_function(L, "SendMsgWithStack", 0, "stopOnBreakpoint");
                if( bp_twice_check_res == 0 ){
                    is_hit = 0;
                    stackdeep_counter = record_stackdeep_counter;
                    sync_runstate_toLua(L, record_cur_run_state);
                }
            }
        }
    }
    return is_hit;
}

//单步处理
void step_process(lua_State *L, lua_Debug *ar){
    //目前没有判断jump flag
    if (cur_run_state == STEPOVER) {
        if (ar->event == LINE && stackdeep_counter <= 0) {
            sync_runstate_toLua(L, STEPOVER_STOP);
            call_lua_function(L, "SendMsgWithStack", 0,"stopOnStep");
        }
        else if (ar->event == CALL) {
            stackdeep_counter++;
        }
        //5.3 的tailcall暂时不需要处理。
        else if (ar->event == RETURN) {
            if (stackdeep_counter != 0) {
                stackdeep_counter--;
            }
        }
    }
    else if (cur_run_state == STEPIN) {
        if (ar->event == LINE) {
            sync_runstate_toLua(L, STEPIN_STOP);
            call_lua_function(L, "SendMsgWithStack", 0,"stopOnStepIn");
        }

    }
    else if (cur_run_state == STEPOUT) {
        if (ar->event == LINE) {
            if (stackdeep_counter <= -1) {
                stackdeep_counter = 0;
                sync_runstate_toLua(L, STEPOUT_STOP);
                call_lua_function(L, "SendMsgWithStack", 0,"stopOnStepOut");
            }
        }
        else if (ar->event == CALL) {
            stackdeep_counter++;
        }
        //5.3 的tailcall暂时不需要处理。
        else if (ar->event == RETURN) {
            stackdeep_counter--;
        }
    }
}

// 无需reconnect返回1 ，需要重连时返回0
int hook_process_reconnect(lua_State *L){
    time_t currentSecs = time(static_cast<time_t*>(NULL));
    if(cur_hook_state == DISCONNECT_HOOK){
        if (currentSecs - recvMsgSeconds > 1) {
            call_lua_function(L, "reConnect", 0);
            recvMsgSeconds = currentSecs;
        }
        return 0;
    }
    return 1;
}

void litehook_recv_message(lua_State *L){
    time_t currentSecs = time(static_cast<time_t*>(NULL));
    //2.定时接收消息 -- 这里的状态不只是run
    if (cur_hook_state == LITE_HOOK && currentSecs - recvMsgSeconds > 1) {
        call_lua_function(L, "debugger_wait_msg", 0);
        recvMsgSeconds = currentSecs;
    }
}

void hook_process_recv_message(lua_State *L){
    time_t currentSecs = time(static_cast<time_t*>(NULL));
    if ((cur_run_state == RUN ||
         cur_run_state == STEPOVER ||
         cur_run_state == STEPIN ||
         cur_run_state == STEPOUT)
        && currentSecs - recvMsgSeconds > 1) {
        call_lua_function(L, "debugger_wait_msg", 0);
        recvMsgSeconds = currentSecs;
    }
}

int hook_process_cfunction(lua_State *L, lua_Debug *ar){
    if (!(strcmp(ar->what, "C")) || ar->currentline < 0) {
        //Lua5.1 tail return会走到这里
        if(!(strcmp(ar->source, "=(tail call)")) && ar -> event == TAILRET && (cur_run_state == STEPOVER || cur_run_state == STEPOUT )){
            stackdeep_counter --;
        }
        //5.1
        return 0;
    }
    return 1;
}

int hook_process_code_section(lua_State *L, lua_Debug *ar){
    //测试[string ...]形式的路径
    int isCodeSec = isCodeSection(ar->short_src);
    if (isCodeSec == 1) {
        //short_src是[string ]开头
        if(strchr(ar->source, '\n') || strchr(ar->source, ';') || strchr(ar->source, '=')){
            print_to_vscode(L, "hook jump Code String");
            return 0;
        }
    }
    return 1;
}

//检查函数中是否有断点。int check_has_breakpoint  0:全局无断点  , 1:全局有断点但本文件中无断点 , 2:本文件中有断点 , 3:函数中有断点
int checkHasBreakpoint(lua_State *L, const char * src1, int current_line, int sline , int eline){
    debug_auto_stack tt(L);

	const char *src = getPath(L, src1);
    if(!strcmp(src,"")){
		// 路径完全一致
        return ALL_HOOK;
    }

    if(all_breakpoint_map.empty() == true) {
        // 全局没有断点
        return LITE_HOOK;
    }

    std::map<std::string, std::map<int, breakpoint>>::iterator iter1;
    for (iter1 = all_breakpoint_map.begin(); iter1 != all_breakpoint_map.end(); ++iter1) {
        if (iter1->first == std::string(src)) {
            // compare()
            return ALL_HOOK;
        }
    }
    
    //文件没有断点,MIDHOOK
    return MID_HOOK;
}

void check_hook_state(lua_State *L, const char* source ,  int current_line, int def_line, int last_line ,int event){
    if (source == NULL) {
        return;
    }
    if(cur_run_state == RUN && cur_hook_state != DISCONNECT_HOOK){
        int stats = checkHasBreakpoint(L, source, current_line, def_line, last_line);
        if(stats == LITE_HOOK){
            sethookstate(L, LITE_HOOK);
        }else if(stats == MID_HOOK){
            sethookstate(L, MID_HOOK);
        }else if (stats == ALL_HOOK){
            sethookstate(L, ALL_HOOK);
        }

        if( (event == RETURN || event == TAILRET) && cur_hook_state == MID_HOOK){
            sethookstate(L, ALL_HOOK);
        }
    }
}

//这个函数要获取的消息  当前状态，断点列表
void debug_hook_c(lua_State *L, lua_Debug *ar) {
    debug_auto_stack _tt(L);
    if(!hook_process_reconnect(L)) return;
    if(cur_hook_state == LITE_HOOK) {
        litehook_recv_message(L);
        return;
    }

    hook_process_recv_message(L);

    if (lua_getinfo(L, "Slf", ar) != 0) {
        //if in c function , return
        if(!hook_process_cfunction(L, ar)) return;
        //if in debugger , return	
		int source_len = strlen(ar->source);
		if (debug_file_path_len == source_len) {
			if (!strcmp(debug_file_path, ar->source))	return;
		}
		if (tools_file_path_len == source_len) {
			if (!strcmp(tools_file_path, ar->source))	return;
		}
		//slua "temp buffer"
		if (11 == source_len) {
			if (!strcmp("temp buffer", ar->source))	return;
		}
		//xlua "chunk"
		if (5 == source_len) {
			if (!strcmp("chunk", ar->source))	return;
		}

        //code section
        if(!hook_process_code_section(L, ar)) return;

        //output debug info
        if (logLevel == 0) {
            snprintf(hookLog, sizeof(hookLog), "[hook state] event:%d | source: %s | short_src: %s | line:%d | defined:%d | laseDefined:%d | currentState:%d | currentHookState:%d \n", ar->event, ar->source, ar->short_src, ar->currentline, ar->linedefined, ar->lastlinedefined, cur_run_state, cur_hook_state);
            print_to_vscode(L, hookLog);
        }

        //hook_state
        last_source = ar->source;
        ar_def_line = ar->linedefined;
        ar_lastdef_line = ar->lastlinedefined;
        ar_current_line = ar->currentline;

        int is_hit = breakpoint_process(L, ar);  //断点命中标记位 //line + 预判

        //STOP_ON_ENTRY
        int stop_on_entry = 0;
        if (cur_run_state == STOP_ON_ENTRY && is_hit != 1) {
            //STOP_ON_ENTRY
            if (ar->event == LINE) {
                //命中
                stop_on_entry = 1;
                stackdeep_counter = 0;
                call_lua_function(L, "SendMsgWithStack", 0,"stopOnEntry");
            }
        }
        if (is_hit == 1 || stop_on_entry == 1) {
            return;
        }
        step_process(L, ar);
        check_hook_state(L, last_source, ar_current_line,  ar_def_line, ar_lastdef_line, ar->event);
    }
}

//结束hook
extern "C" int endHook(lua_State *L)
{
    cur_hook_state = DISCONNECT_HOOK;
    lua_sethook(L, NULL, 0, 0);
    all_breakpoint_map.clear();
    return 0;
}

static luaL_Reg libpdebug[] = {
    { "sync_breakpoints", sync_breakpoints },     //lua同步断点给c，同步发生在新增、删除断点，连接开始时
    { "lua_set_hookstate", lua_set_hookstate },   //lua设置hook状态。lua中发生状态切换时，同步到C
    { "lua_set_runstate", lua_set_runstate },     //同步运行状态
    { "sync_debugger_path", sync_debugger_path }, //同步debugger文件路径
    { "sync_tools_path", sync_tools_path }, //同步debugger文件路径
    { "sync_config", sync_config },               //同步日志等级
    { "sync_cwd", sync_cwd },                     //同步cwd
    { "sync_file_ext", sync_file_ext },           //同步文件后缀
    { "sync_getLibVersion", sync_getLibVersion },   //hook version
    { "sync_bp_hit", sync_bp_hit },                 //set BP lua向C同步状态
    { "sync_tempfile_path", sync_tempfile_path },   //sync_tempfile_path
    { "endHook", endHook },                       //结束hook，停止调试
    { "get_libhook_state", get_libhook_state },
    { "get_last_source", get_last_source },
    { "clear_pathcache", clear_pathcache },
    { "set_bp_twice_check_res", set_bp_twice_check_res },
    { "sync_lua_debugger_ver", sync_lua_debugger_ver },
    { NULL, NULL }
};

#ifdef USE_SOURCE_CODE
extern "C" void pdebug_init(lua_State* L) {
    debug_auto_stack _tt(L);
    //把libhook压入_G，里面方法填上
    lua_newtable(L);
    for (size_t i = 0; i < sizeof(libpdebug) / sizeof(luaL_Reg); i++) {
        if (libpdebug[i].name == NULL) {
            break;
        }
        lua_pushcfunction(L, libpdebug[i].func);
        lua_setfield(L, -2, libpdebug[i].name);
    }
    lua_setglobal(L, "luapanda_chook");
}
#else // !USE_SOURCE_CODE

#ifdef _WIN32
#define DEBUG_API extern "C" __declspec(dllexport)
#else
#define DEBUG_API extern "C"
#endif

DEBUG_API int luaopen_libpdebug(lua_State* L)
{
#ifdef _WIN32
    load(L);
#endif

#ifdef _WIN32

#if LUA_VERSION_NUM == 501
    // 在windows平台编译时，luaL_register等是函数指针，运行时查找。
    if(luaL_register != NULL){
        luaL_register(L, "libpdebug", libpdebug);
    }
#elif LUA_VERSION_NUM > 501
    if(lua_createtable != NULL && luaL_setfuncs != NULL){
        lua_newtable(L);
        luaL_setfuncs(L, libpdebug, 0);
    }
#endif // LUA_VERSION_NUM

#else // !defined(_WIN32))

#if LUA_VERSION_NUM == 501
    // 在macOS编译时，luaL_register等是函数，定义在lua.h中。
    luaL_register(L, "libpdebug", libpdebug);
#elif LUA_VERSION_NUM > 501
    lua_newtable(L);
    luaL_setfuncs(L, libpdebug, 0);
#endif // LUA_VERSION_NUM

#endif // ifdef _WIN32

    return 1;
}

#endif // USE_SOURCE_CODE

//WIN32下函数处理方法
#if !defined(USE_SOURCE_CODE) && defined(_WIN32)
//slua-ue template function
#if LUA_VERSION_NUM > 501
template<typename T, typename RET>
RET callLuaFunction(lua_State *L) {
    return getInter()->T(L);
}

template<typename T, T>
struct Invoker;

template<typename T, typename RET, typename... ARGS, RET(T::*F)(ARGS...)>
struct Invoker<RET(T::*)(ARGS...), F> {

    static RET invoke(const ARGS&... args) {
        return (getInter()->*F)(args...);
    }

};

template<typename T, typename... ARGS, void(T::*F)(ARGS...)>
struct Invoker<void(T::*)(ARGS...), F> {

    static void invoke(const ARGS&... args) {
        return (getInter()->*F)(args...);
    }

};

template<typename T, T t>
struct LuaCppBinding;

template<typename T, typename RET, typename... ARGS, RET(T::*F)(ARGS...)>
struct LuaCppBinding<RET(T::*)(ARGS...), F> {
    static RET luaCFunction(ARGS... args) {
        return Invoker<decltype(F), F>::invoke(args...);
    }
};

template<typename T, typename... ARGS, void(T::*F)(ARGS...)>
struct LuaCppBinding<void(T::*)(ARGS...), F> {

    static void luaCFunction(ARGS... args) {
        return Invoker<decltype(F), F>::invoke(args...);
    }
};
#endif // LUA_VERSION_NUM > 501

void Slua_UE_find_function()
{		//slua - ue Lua 5.3
#if LUA_VERSION_NUM > 501
#define SLUABINDING(f) LuaCppBinding<decltype(f), f>::luaCFunction;
    lua_version = SLUABINDING(&slua::LuaInterface::lua_version);
    lua_pushstring = SLUABINDING(&slua::LuaInterface::lua_pushstring);
    lua_gettop = (luaDLL_gettop)SLUABINDING(&slua::LuaInterface::lua_gettop);
    lua_settop = (luaDLL_settop)SLUABINDING(&slua::LuaInterface::lua_settop);
    lua_pcallk = SLUABINDING(&slua::LuaInterface::lua_pcallk);
    lua_pushnumber = (luaDLL_pushnumber)SLUABINDING(&slua::LuaInterface::lua_pushnumber);
    luaL_checklstring = SLUABINDING(&slua::LuaInterface::luaL_checklstring);
    lua_tolstring = (luaDLL_tolstring)SLUABINDING(&slua::LuaInterface::lua_tolstring);
    lua_type = (luaDLL_type)SLUABINDING(&slua::LuaInterface::lua_type);
    lua_tointegerx = (luaDLL_tointegerx)SLUABINDING(&slua::LuaInterface::lua_tointegerx);
    lua_pushnil = (luaDLL_pushnil)SLUABINDING(&slua::LuaInterface::lua_pushnil);
    lua_getfield = (luaDLL_getfield)SLUABINDING(&slua::LuaInterface::lua_getfield);
    lua_next = (luaDLL_next)SLUABINDING(&slua::LuaInterface::lua_next);
    lua_getinfo = (luaDLL_getinfo)SLUABINDING(&slua::LuaInterface::lua_getinfo);
    lua_sethook = (luaDLL_sethook)SLUABINDING(&slua::LuaInterface::lua_sethook);
    luaL_checknumber = SLUABINDING(&slua::LuaInterface::luaL_checknumber);
    lua_createtable = (luaDLL_createtable)SLUABINDING(&slua::LuaInterface::lua_createtable);
    luaL_setfuncs = SLUABINDING(&slua::LuaInterface::luaL_setfuncs);
    lua_getglobal = SLUABINDING(&slua::LuaInterface::lua_getglobal);
    lua_toboolean = (luaDLL_toboolean)SLUABINDING(&slua::LuaInterface::lua_toboolean);
#endif
}

void general_find_function() {
    //slua, xlua
#if LUA_VERSION_NUM == 501
    luaL_register = (luaLDLL_register)GetProcAddress(hInstLibrary, "luaL_register");//501
    lua_pcall = (luaDLL_pcall)GetProcAddress(hInstLibrary, "lua_pcall");//501
    lua_tointeger = (luaDLL_tointeger)GetProcAddress(hInstLibrary, "lua_tointeger");//501
#endif
	luaL_checkinteger = (luaDLL_checkinteger)GetProcAddress(hInstLibrary, "luaL_checkinteger");
    lua_version = (luaDLL_version)GetProcAddress(hInstLibrary, "lua_version");
    lua_pushstring = (luaDLL_pushstring)GetProcAddress(hInstLibrary, "lua_pushstring");
    lua_gettop = (luaDLL_gettop)GetProcAddress(hInstLibrary, "lua_gettop");
    lua_settop = (luaDLL_settop)GetProcAddress(hInstLibrary, "lua_settop");
    lua_pushnumber = (luaDLL_pushnumber)GetProcAddress(hInstLibrary, "lua_pushnumber");
    luaL_checklstring = (luaDLL_checklstring)GetProcAddress(hInstLibrary, "luaL_checklstring");
    lua_tolstring = (luaDLL_tolstring)GetProcAddress(hInstLibrary, "lua_tolstring");
    lua_type = (luaDLL_type)GetProcAddress(hInstLibrary, "lua_type");
    lua_pushnil = (luaDLL_pushnil)GetProcAddress(hInstLibrary, "lua_pushnil");
    lua_getfield = (luaDLL_getfield)GetProcAddress(hInstLibrary, "lua_getfield");
    lua_next = (luaDLL_next)GetProcAddress(hInstLibrary, "lua_next");
    lua_getinfo = (luaDLL_getinfo)GetProcAddress(hInstLibrary, "lua_getinfo");
    lua_sethook = (luaDLL_sethook)GetProcAddress(hInstLibrary, "lua_sethook");
    luaL_checknumber = (luaDLL_checknumber)GetProcAddress(hInstLibrary, "luaL_checknumber");
    lua_pushinteger = (luaDLL_pushinteger)GetProcAddress(hInstLibrary, "lua_pushinteger");
    lua_toboolean = (luaDLL_toboolean)GetProcAddress(hInstLibrary, "lua_toboolean");
    //5.3
#if LUA_VERSION_NUM > 501
    lua_pcallk = (luaDLL_pcallk)GetProcAddress(hInstLibrary, "lua_pcallk");
    lua_tointegerx = (luaDLL_tointegerx)GetProcAddress(hInstLibrary, "lua_tointegerx");
    lua_createtable = (luaDLL_createtable)GetProcAddress(hInstLibrary, "lua_createtable");
    luaL_setfuncs = (luaDLL_setfuncs)GetProcAddress(hInstLibrary, "luaL_setfuncs");
    lua_getglobal = (luaDLL_getglobal)GetProcAddress(hInstLibrary, "lua_getglobal");
#endif
}

void load(lua_State* L) {

    HANDLE hSnapshot = CreateToolhelp32Snapshot(TH32CS_SNAPMODULE, 0);
    if (INVALID_HANDLE_VALUE == hSnapshot)
    {
        //load fail
        return;
    }
    MODULEENTRY32 mi;
    mi.dwSize = sizeof(MODULEENTRY32);
    BOOL bRet = Module32First(hSnapshot, &mi);
    while (bRet)
    {
#if LUA_VERSION_NUM > 501
        // find slua-ue dll
		dll_GetLuaInterface interPtr = (dll_GetLuaInterface)GetProcAddress(mi.hModule, "GetLuaInterface");
        if (interPtr != NULL) {
            hInstLibrary = mi.hModule;
            getInter = interPtr;
            Slua_UE_find_function();
            break;
        }
#endif
		// find general lua dll
        void* versionPtr = (luaDLL_sethook)GetProcAddress(mi.hModule, "lua_sethook");
        if (versionPtr != NULL) {
            hInstLibrary = mi.hModule;
            general_find_function();
            break;
        }

        //travel next dll
        bRet = Module32Next(hSnapshot, &mi);
    }
}
#endif
