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

-- Mathematical Functions  http://www.lua.org/manual/5.3/manual.html#6.7
-- This library provides basic mathematical functions. It provides all its functions and constants inside the table math. Functions with the annotation "integer/float" give integer results for integer arguments and float results for float (or mixed) arguments. Rounding functions (math.ceil, math.floor, and math.modf) return an integer when the result fits in the range of an integer, or a float otherwise.
math = {}

-- The value of π.
math.pi = 3.1415

-- An integer with the minimum value for an integer.
math.mininteger = nil

-- Returns the absolute value of x. (integer/float)
function math.abs(x) return 0 end

-- Returns the arc cosine of x (in radians).
function math.acos(x) return 0 end

-- Returns the arc sine of x (in radians).
function math.asin(x) return 0 end

-- Returns the arc tangent of y/x (in radians), but uses the signs of both arguments to find the quadrant of the result. (It also handles correctly the case of x being zero.)
-- The default value for x is 1, so that the call math.atan(y) returns the arc tangent of y.
function math.atan(y, x) return 0 end

-- Returns the smallest integral value larger than or equal to x.
function math.ceil(x) return 0 end

-- Returns the cosine of x (assumed to be in radians).
function math.cos(x) return 0 end

-- Converts the angle x from radians to degrees.
function math.deg(x) return 0 end

--- Returns the value e^x (where e is the base of natural logarithms).
function math.exp(x) end

-- Returns the largest integral value smaller than or equal to x.
function math.floor(x) end

-- Returns the remainder of the division of x by y that rounds the quotient towards zero. (integer/float)
function math.fmod(x, y) end

-- The float value HUGE_VAL, a value larger than any other numeric value.
math.huge = nil

-- Returns the logarithm of x in the given base. The default for base is e (so that the function returns the natural logarithm of x).
function math.log(x, base) end

-- Returns the argument with the maximum value, according to the Lua operator <. (integer/float)
function math.max(x, ...) end

-- An integer with the maximum value for an integer.
math.maxinteger = nil

-- Returns the argument with the minimum value, according to the Lua operator <. (integer/float)
function math.min(x, ...) end

-- Returns the integral part of x and the fractional part of x. Its second result is always a float.
function math.modf(x) end

-- Converts the angle x from degrees to radians.
function math.rad(x) end

-- When called without arguments, returns a pseudo-random float with uniform distribution in the range [0,1). When called with two integers m and n, math.random returns a pseudo-random integer with uniform distribution in the range [m, n]. (The value n-m cannot be negative and must fit in a Lua integer.) The call math.random(n) is equivalent to math.random(1,n).
-- This function is an interface to the underling pseudo-random generator function provided by C.
function math.random(m, n) end

-- Sets x as the "seed" for the pseudo-random generator: equal seeds produce equal sequences of numbers.
function math.randomseed(x) end

-- Returns the sine of x (assumed to be in radians).
function math.sin(x) return 0 end

-- Returns the square root of x. (You can also use the expression x^0.5 to compute this value.)
function math.sqrt(x) return 0 end

-- Returns the tangent of x (assumed to be in radians).
function math.tan(x) return 0 end

-- If the value x is convertible to an integer, returns that integer. Otherwise, returns nil.
function math.tointeger(x) end

-- Returns "integer" if x is an integer, "float" if it is a float, or nil if x is not a number.
function math.type(x) end

-- Returns a boolean, true if and only if integer m is below integer n when they are compared as unsigned integers.
function math.ult(m, n) end