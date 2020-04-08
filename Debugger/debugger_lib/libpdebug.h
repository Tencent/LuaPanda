#ifndef LIBPDEBUG_H
#define LIBPDEBUG_H

//1.使用源码编译，要打开宏USE_SOURCE_CODE.  win下要设置LUA_INTEGER和lua版本号
#define LUA_DEBUGGER_NAME     "LuaPanda"    //debugger's name in LuaDebug.lua
#define HOOK_LIB_VERSION      "3.2.0"       //lib version
//#define USE_SOURCE_CODE                        //using source code to build
#if !defined(USE_SOURCE_CODE) && defined(_WIN32)
#define LUA_INTEGER         long long      //set LUA_INTEGER. In 501 is ptrdiff_t. 503 can set longlong(64bit) or int(32bit)
#define LUA_VERSION_NUM        503              //lua version used by WIN32 build lib. eg. 501,503
#endif
//setting end

#if !defined(USE_SOURCE_CODE) && defined(_WIN32)
#include <Windows.h>
#include <Tlhelp32.h>
#else
//2.如果lua源码是C++形式，注释掉下面extern "C"
extern "C"{
#include "lua.h"
#include "lualib.h"
#include "lauxlib.h"
#include "luaconf.h"
}
#endif

//3.如果lua代码在命名空间中，要设置用户命名空间. 防止找不到lua方法
//using namespace slua;

#ifdef USE_SOURCE_CODE
extern "C" void pdebug_init(lua_State* L);
#endif

#if !defined(USE_SOURCE_CODE) && defined(_WIN32)
/*
** Lua - An Extensible Extension Language
** Lua.org, PUC-Rio, Brazil (http://www.lua.org)
** See Copyright Notice at the end of this file
*/
#if LUA_VERSION_NUM == 501
#define lua_getglobal(L,s)    lua_getfield(L, LUA_GLOBALSINDEX, (s))
#endif

#define LUA_TNONE        (-1)
#define LUA_TNIL        0
#define LUA_TBOOLEAN        1
#define LUA_TLIGHTUSERDATA    2
#define LUA_TNUMBER        3
#define LUA_TSTRING        4
#define LUA_TTABLE        5
#define LUA_TFUNCTION        6
#define LUA_TUSERDATA        7
#define LUA_TTHREAD        8
#define LUA_NUMBER    double
#define LUA_REGISTRYINDEX    (-10000)
#define LUA_ENVIRONINDEX    (-10001)
#define LUA_GLOBALSINDEX    (-10002)
#define lua_upvalueindex(i)    (LUA_GLOBALSINDEX-(i))
#define LUA_IDSIZE    60
#define LUA_HOOKCALL    0
#define LUA_HOOKRET    1
#define LUA_HOOKLINE    2
#define LUA_HOOKCOUNT    3
#define LUA_HOOKTAILRET 4
#define LUA_MASKCALL    (1 << LUA_HOOKCALL)
#define LUA_MASKRET    (1 << LUA_HOOKRET)
#define LUA_MASKLINE    (1 << LUA_HOOKLINE)
#define LUA_MASKCOUNT    (1 << LUA_HOOKCOUNT)
#define luaL_checkstring(L,n)    (luaL_checklstring(L, (n), NULL))
#define lua_tostring(L,i)    lua_tolstring(L, (i), NULL)
#define lua_istable(L,n)    (lua_type(L, (n)) == LUA_TTABLE)
#define lua_isfunction(L,n)    (lua_type(L, (n)) == LUA_TFUNCTION)
#define lua_pop(L,n)        lua_settop(L, -(n)-1)
#define lua_newtable(L)        lua_createtable(L, 0, 0)

struct lua_State;
struct lua_Debug {
    int event;
    const char *name;    /* (n) */
    const char *namewhat;    /* (n) `global', `local', `field', `method' */
    const char *what;    /* (S) `Lua', `C', `main', `tail' */
    const char *source;    /* (S) */
    int currentline;    /* (l) */
    int nups;        /* (u) number of upvalues */
    int linedefined;    /* (S) */
    int lastlinedefined;    /* (S) */
    char short_src[LUA_IDSIZE]; /* (S) */
    /* private part */
    int i_ci;  /* active function */
};

typedef LUA_INTEGER lua_Integer;
typedef LUA_NUMBER lua_Number;
typedef int (*lua_CFunction) (lua_State *L);
typedef struct luaL_Reg {
    const char *name;
    lua_CFunction func;
} luaL_Reg;

#define LUA_KCONTEXT	ptrdiff_t
typedef LUA_KCONTEXT lua_KContext;

//lua function
typedef lua_Integer(*luaDLL_checkinteger) (lua_State *L, int numArg);
typedef void (*lua_Hook) (lua_State *L, lua_Debug *ar);
typedef int (*lua_KFunction) (lua_State *L, int status, lua_KContext ctx);
typedef const lua_Number *(*luaDLL_version)(lua_State *L);
typedef void (*luaLDLL_register)(lua_State *L, const char *libname, const luaL_Reg *l);
typedef int (*luaDLL_gettop)(lua_State *L);
typedef const char *(*luaDLL_pushstring)(lua_State *L, const char *s);
typedef int (*luaDLL_settop)(lua_State *L, int idx);
typedef int (*luaDLL_tointeger)(lua_State *L, int idx);
typedef int (*luaDLL_next)(lua_State *L, int idx);
typedef int (*luaDLL_pcall)(lua_State *L, int nargs, int nresults, int errfunc);
typedef void (*luaDLL_pushnil)(lua_State *L);
typedef void (*luaDLL_getfield)(lua_State *L, int idx, const char *k);
typedef int (*luaDLL_getinfo)(lua_State *L, const char *what, void *ar);
typedef void  (*luaDLL_pushinteger) (lua_State *L, lua_Integer n);
#if LUA_VERSION_NUM == 501
typedef int(*luaDLL_sethook)(lua_State *L, void* func, int mask, int count);
#else
typedef	void (*luaDLL_sethook)(lua_State *L, lua_Hook f, int mask, int count);
#endif
typedef void (*luaDLL_pushnumber)(lua_State *L, lua_Number n);
typedef lua_Number (*luaDLL_checknumber)(lua_State *L, int narg);
typedef const char *(*luaDLL_checklstring)(lua_State *L, int narg, size_t *len);
typedef const char *(*luaDLL_tolstring)(lua_State *L, int idx, size_t *len);
typedef int (*luaDLL_type)(lua_State *L, int idx);
//5.3
typedef void (*luaDLL_createtable)(lua_State *L, int narray, int nrec);
typedef void (*luaDLL_setfuncs)(lua_State *L, const luaL_Reg *l, int nup);
typedef lua_Integer(*luaDLL_tointegerx)(lua_State *L, int idx, int *pisnum);
typedef int (*luaDLL_getglobal)(lua_State *L, const char *name);
typedef int (*luaDLL_pcallk)(lua_State *L, int nargs, int nresults, int msgh, lua_KContext ctx, lua_KFunction k);
typedef int (*luaDLL_toboolean)(lua_State *L, int index);

luaDLL_checkinteger luaL_checkinteger;
luaDLL_version lua_version;
luaDLL_gettop lua_gettop;
luaDLL_pushstring lua_pushstring;
luaLDLL_register luaL_register;
luaDLL_settop lua_settop;
luaDLL_pcall lua_pcall;
luaDLL_pushnumber lua_pushnumber;
luaDLL_checklstring luaL_checklstring;
luaDLL_tointeger lua_tointeger;
luaDLL_pushnil lua_pushnil;
luaDLL_getfield lua_getfield;
luaDLL_next lua_next;
luaDLL_getinfo lua_getinfo;
luaDLL_sethook lua_sethook;
luaDLL_checknumber luaL_checknumber;
luaDLL_type lua_type;
luaDLL_tolstring lua_tolstring;
luaDLL_pushinteger lua_pushinteger;
luaDLL_toboolean lua_toboolean;
//
HMODULE hInstLibrary;

//slua-ue header
#if LUA_VERSION_NUM > 501
//5.3
luaDLL_createtable lua_createtable;
luaDLL_setfuncs luaL_setfuncs;
luaDLL_tointegerx lua_tointegerx;
luaDLL_getglobal lua_getglobal;
luaDLL_pcallk lua_pcallk;
#define lua_pcall(L,n,r,f)	lua_pcallk(L, (n), (r), (f), 0, NULL)
#define lua_tointeger(L,i) lua_tointegerx(L,(i),NULL);

#define PURE_API =0
namespace slua {
	struct LuaInterface {
		virtual const lua_Number *lua_version(lua_State *L) PURE_API;
		virtual const char *lua_pushstring(lua_State *L, const char *s) PURE_API;
		virtual int lua_gettop(lua_State *L) PURE_API;
		virtual void lua_settop(lua_State *L, int index) PURE_API;
		virtual int lua_pcallk(lua_State *L, int nargs, int nresults, int msgh, lua_KContext ctx, lua_KFunction k) PURE_API;
		virtual void lua_pushnumber(lua_State *L, lua_Number n) PURE_API;
		virtual const char *luaL_checklstring(lua_State *L, int arg, size_t *l) PURE_API;
		virtual const char *lua_tolstring(lua_State *L, int index, size_t *len) PURE_API;
		virtual int lua_type(lua_State *L, int index) PURE_API;
		virtual lua_Integer lua_tointegerx(lua_State *L, int index, int *isnum) PURE_API;
		virtual void lua_pushnil(lua_State *L) PURE_API;
		virtual int lua_getfield(lua_State *L, int index, const char *k) PURE_API;
		virtual int lua_next(lua_State *L, int index) PURE_API;
		virtual int lua_getinfo(lua_State *L, const char *what, lua_Debug *ar) PURE_API;
		virtual void lua_sethook(lua_State *L, lua_Hook f, int mask, int count) PURE_API;
		virtual lua_Number luaL_checknumber(lua_State *L, int arg) PURE_API;
		virtual void lua_createtable(lua_State *L, int narr, int nrec) PURE_API;
		virtual void luaL_setfuncs(lua_State *L, const luaL_Reg *l, int nup) PURE_API;
		virtual int lua_getglobal(lua_State *L, const char *name) PURE_API;
		virtual int lua_toboolean(lua_State *L, int index) PURE_API;
	};
}
typedef  slua::LuaInterface* (*dll_GetLuaInterface)();
dll_GetLuaInterface getInter;
#endif //LUA_VERSION_NUM > 501
#endif //_WIN32
#endif //LIBPDEBUG_H
/******************************************************************************
* Copyright (C) 1994-2008 Lua.org, PUC-Rio.  All rights reserved.
*
* Permission is hereby granted, free of charge, to any person obtaining
* a copy of this software and associated documentation files (the
* "Software"), to deal in the Software without restriction, including
* without limitation the rights to use, copy, modify, merge, publish,
* distribute, sublicense, and/or sell copies of the Software, and to
* permit persons to whom the Software is furnished to do so, subject to
* the following conditions:
*
* The above copyright notice and this permission notice shall be
* included in all copies or substantial portions of the Software.
*
* THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
* EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
* MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
* IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
* CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
* TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
* SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
******************************************************************************/
