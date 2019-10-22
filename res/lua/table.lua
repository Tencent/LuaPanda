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

-- Table Manipulation  http://www.lua.org/manual/5.3/manual.html#6.6
-- This library provides generic functions for table manipulation. It provides all its functions inside the table table.
-- Remember that, whenever an operation needs the length of a table, all caveats about the length operator apply (see §3.4.7). All functions ignore non-numeric keys in the tables given as arguments.
table = {}

-- Given a list where all elements are strings or numbers, returns the string list[i]..sep..list[i+1] ··· sep..list[j]. The default value for sep is the empty string, the default for i is 1, and the default for j is #list. If i is greater than j, returns the empty string.
function table.concat(list, sep, i, j) end

-- Inserts element value at position pos in list, shifting up the elements list[pos], list[pos+1], ···, list[#list]. The default value for pos is #list+1, so that a call table.insert(t,x) inserts x at the end of list t.
function table.insert(list, pos, value) end


-- Moves elements from table a1 to table a2, performing the equivalent to the following multiple assignment: a2[t],··· = a1[f],···,a1[e]. The default for a2 is a1. The destination range can overlap with the source range. The number of elements to be moved must fit in a Lua integer.
-- Returns the destination table a2.
function table.move(a1, f, e, t, a2) end

-- Returns a new table with all arguments stored into keys 1, 2, etc. and with a field "n" with the total number of arguments. Note that the resulting table may not be a sequence.
function table.pack(...) end

-- Removes from list the element at position pos, returning the value of the removed element. When pos is an integer between 1 and #list, it shifts down the elements list[pos+1], list[pos+2], ···, list[#list] and erases element list[#list]; The index pos can also be 0 when #list is 0, or #list + 1; in those cases, the function erases the element list[pos].
-- The default value for pos is #list, so that a call table.remove(l) removes the last element of list l.
function table.remove(list, pos) end

-- Sorts list elements in a given order, in-place, from list[1] to list[#list]. If comp is given, then it must be a function that receives two list elements and returns true when the first element must come before the second in the final order (so that, after the sort, i < j implies not comp(list[j],list[i])). If comp is not given, then the standard Lua operator < is used instead.
-- Note that the comp function must define a strict partial order over the elements in the list; that is, it must be asymmetric and transitive. Otherwise, no valid sort may be possible.
-- The sort algorithm is not stable: elements considered equal by the given order may have their relative positions changed by the sort.
function table.sort(list, comp) end

-- Returns the elements from the given list. This function is equivalent to
--     return list[i], list[i+1], ···, list[j]
-- By default, i is 1 and j is #list.
function table.unpack(list, i, j) end
