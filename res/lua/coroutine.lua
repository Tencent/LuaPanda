------------------------------------------------------------------------
-- Copyright (C) 1994-2008 Lua.org, PUC-Rio.  All rights reserved.
--
-- Permission is hereby granted, free of charge, to any person obtaining
-- a copy of this software and associated documentation files (the
-- "Software"), to deal in the Software without restriction, including
-- without limitation the rights to use, copy, modify, merge, publish,
-- distribute, sublicense, and/or sell copies of the Software, and to
-- permit persons to whom the Software is furnished to do so, subject to
-- the following conditions:
--
-- The above copyright notice and this permission notice shall be
-- included in all copies or substantial portions of the Software.
--
-- THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND,
-- EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF
-- MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT.
-- IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY
-- CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT,
-- TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE
-- SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
------------------------------------------------------------------------

-- Coroutine Manipulation  http://www.lua.org/manual/5.3/manual.html#6.2
-- This library comprises the operations to manipulate coroutines, which come inside the table coroutine. See §2.6 for a general description of coroutines.
coroutine = {}

-- Creates a new coroutine, with body f. f must be a function. Returns this new coroutine, an object with type "thread".
function coroutine.create(f) end

-- Returns true when the running coroutine can yield.
-- A running coroutine is yieldable if it is not the main thread and it is not inside a non-yieldable C function.
function coroutine.isyieldable() end

-- Starts or continues the execution of coroutine co. The first time you resume a coroutine, it starts running its body. The values val1, ... are passed as the arguments to the body function. If the coroutine has yielded, resume restarts it; the values val1, ... are passed as the results from the yield.
-- If the coroutine runs without any errors, resume returns true plus any values passed to yield (when the coroutine yields) or any values returned by the body function (when the coroutine terminates). If there is any error, resume returns false plus the error message.
function coroutine.resume(co, val1, ...) end

-- Returns the running coroutine plus a boolean, true when the running coroutine is the main one.
function coroutine.running() end

-- Returns the status of coroutine co, as a string: "running", if the coroutine is running (that is, it called status); "suspended", if the coroutine is suspended in a call to yield, or if it has not started running yet; "normal" if the coroutine is active but not running (that is, it has resumed another coroutine); and "dead" if the coroutine has finished its body function, or if it has stopped with an error.
function coroutine.status(co) end

-- Creates a new coroutine, with body f. f must be a function. Returns a function that resumes the coroutine each time it is called. Any arguments passed to the function behave as the extra arguments to resume. Returns the same values returned by resume, except the first boolean. In case of error, propagates the error.
function coroutine.wrap(f) end

-- Suspends the execution of the calling coroutine. Any arguments to yield are passed as extra results to resume.
function coroutine.yield(...) end
