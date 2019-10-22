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

-- String Manipulation  http://www.lua.org/manual/5.3/manual.html#6.4
-- This library provides generic functions for string manipulation, such as finding and extracting substrings, and pattern matching. When indexing a string in Lua, the first character is at position 1 (not at 0, as in C). Indices are allowed to be negative and are interpreted as indexing backwards, from the end of the string. Thus, the last character is at position -1, and so on.
-- The string library provides all its functions inside the table string. It also sets a metatable for strings where the __index field points to the string table. Therefore, you can use the string functions in object-oriented style. For instance, string.byte(s,i) can be written as s:byte(i).
-- The string library assumes one-byte character encodings.
string = {}

-- Returns the internal numeric codes of the characters s[i], s[i+1], ..., s[j]. The default value for i is 1; the default value for j is i. These indices are corrected following the same rules of function string.sub.
-- Numeric codes are not necessarily portable across platforms.
function string.byte(s, i, j) end

-- Receives zero or more integers. Returns a string with length equal to the number of arguments, in which each character has the internal numeric code equal to its corresponding argument.
-- Numeric codes are not necessarily portable across platforms.
function string.char(...) end

-- Returns a string containing a binary representation (a binary chunk) of the given function, so that a later load on this string returns a copy of the function (but with new upvalues). If strip is a true value, the binary representation may not include all debug information about the function, to save space.
-- Functions with upvalues have only their number of upvalues saved. When (re)loaded, those upvalues receive fresh instances containing nil. (You can use the debug library to serialize and reload the upvalues of a function in a way adequate to your needs.)
function string.dump(func, strip) end

-- Looks for the first match of pattern (see §6.4.1) in the string s. If it finds a match, then find returns the indices of s where this occurrence starts and ends; otherwise, it returns nil. A third, optional numeric argument init specifies where to start the search; its default value is 1 and can be negative. A value of true as a fourth, optional argument plain turns off the pattern matching facilities, so the function does a plain "find substring" operation, with no characters in pattern being considered magic. Note that if plain is given, then init must be given as well.
-- If the pattern has captures, then in a successful match the captured values are also returned, after the two indices.
function string.find(s, pattern, init, plain) end

-- Returns a formatted version of its variable number of arguments following the description given in its first argument (which must be a string). The format string follows the same rules as the ISO C function sprintf. The only differences are that the options/modifiers *, h, L, l, n, and p are not supported and that there is an extra option, q.
-- The q option formats a string between double quotes, using escape sequences when necessary to ensure that it can safely be read back by the Lua interpreter. For instance, the call
--          string.format('%q', 'a string with "quotes" and \n new line')
-- may produce the string:
--          "a string with \"quotes\" and \
--           new line"
-- Options A, a, E, e, f, G, and g all expect a number as argument. Options c, d, i, o, u, X, and x expect an integer. When Lua is compiled with a C89 compiler, options A and a (hexadecimal floats) do not support any modifier (flags, width, length).
-- Option s expects a string; if its argument is not a string, it is converted to one following the same rules of tostring. If the option has any modifier (flags, width, length), the string argument should not contain embedded zeros.
function string.format(formatstring, ...) end

-- Returns an iterator function that, each time it is called, returns the next captures from pattern (see §6.4.1) over the string s. If pattern specifies no captures, then the whole match is produced in each call.
-- As an example, the following loop will iterate over all the words from string s, printing one per line:
--          s = "hello world from Lua"
--          for w in string.gmatch(s, "%a+") do
--            print(w)
--          end
-- The next example collects all pairs key=value from the given string into a table:
--          t = {}
--          s = "from=world, to=Lua"
--          for k, v in string.gmatch(s, "(%w+)=(%w+)") do
--            t[k] = v
--          end
-- For this function, a caret '^' at the start of a pattern does not work as an anchor, as this would prevent the iteration.
function string.gmatch(s, pattern) end

-- Returns a copy of s in which all (or the first n, if given) occurrences of the pattern (see §6.4.1) have been replaced by a replacement string specified by repl, which can be a string, a table, or a function. gsub also returns, as its second value, the total number of matches that occurred. The name gsub comes from Global SUBstitution.
-- If repl is a string, then its value is used for replacement. The character % works as an escape character: any sequence in repl of the form %d, with d between 1 and 9, stands for the value of the d-th captured substring. The sequence %0 stands for the whole match. The sequence %% stands for a single %.  
-- If repl is a table, then the table is queried for every match, using the first capture as the key.
-- If repl is a function, then this function is called every time a match occurs, with all captured substrings passed as arguments, in order.
-- In any case, if the pattern specifies no captures, then it behaves as if the whole pattern was inside a capture.
-- If the value returned by the table query or by the function call is a string or a number, then it is used as the replacement string; otherwise, if it is false or nil, then there is no replacement (that is, the original match is kept in the string).
-- Here are some examples:
--          x = string.gsub("hello world", "(%w+)", "%1 %1")
--          --> x="hello hello world world"
--         
--          x = string.gsub("hello world", "%w+", "%0 %0", 1)
--          --> x="hello hello world"
--         
--          x = string.gsub("hello world from Lua", "(%w+)%s*(%w+)", "%2 %1")
--          --> x="world hello Lua from"
--        
--          x = string.gsub("home = $HOME, user = $USER", "%$(%w+)", os.getenv)
--          --> x="home = /home/roberto, user = roberto"
--        
--          x = string.gsub("4+5 = $return 4+5$", "%$(.-)%$", function (s)
--                return load(s)()
--              end)
--          --> x="4+5 = 9"
--        
--          local t = {name="lua", version="5.3"}
--          x = string.gsub("$name-$version.tar.gz", "%$(%w+)", t)
--          --> x="lua-5.3.tar.gz"  
function string.gsub(s, pattern, repl, n) end


-- Receives a string and returns its length. The empty string "" has length 0. Embedded zeros are counted, so "a\000bc\000" has length 5.
function string.len(s) end

--- Receives a string and returns a copy of this string with all uppercase letters changed to lowercase. All other characters are left unchanged. The definition of what an uppercase letter is depends on the current locale.
function string.lower(s) end


-- Looks for the first match of pattern (see §6.4.1) in the string s. If it finds one, then match returns the captures from the pattern; otherwise it returns nil. If pattern specifies no captures, then the whole match is returned. A third, optional numeric argument init specifies where to start the search; its default value is 1 and can be negative.
function string.match(s, pattern, init) end


-- Returns a binary string containing the values v1, v2, etc. packed (that is, serialized in binary form) according to the format string fmt (see §6.4.2).
function string.pack(fmt, v1, v2, ...) end

-- Returns the size of a string resulting from string.pack with the given format. The format string cannot have the variable-length options 's' or 'z' 
function string.packsize(fmt) end

-- Returns a string that is the concatenation of n copies of the string s separated by the string sep. The default value for sep is the empty string (that is, no separator). Returns the empty string if n is not positive.
-- (Note that it is very easy to exhaust the memory of your machine with a single call to this function.)
function string.rep(s, n, sep) end

-- Returns a string that is the string s reversed.
function string.reverse(s) end

-- Returns the substring of s that starts at i and continues until j; i and j can be negative. If j is absent, then it is assumed to be equal to -1 (which is the same as the string length). In particular, the call string.sub(s,1,j) returns a prefix of s with length j, and string.sub(s, -i) (for a positive i) returns a suffix of s with length i.
-- If, after the translation of negative indices, i is less than 1, it is corrected to 1. If j is greater than the string length, it is corrected to that length. If, after these corrections, i is greater than j, the function returns the empty string.
function string.sub(s, i, j) end

-- Returns the values packed in string s (see string.pack) according to the format string fmt (see §6.4.2). An optional pos marks where to start reading in s (default is 1). After the read values, this function also returns the index of the first unread byte in s.
function string.unpack(fmt, s, pos) end

-- Receives a string and returns a copy of this string with all lowercase letters changed to uppercase. All other characters are left unchanged. The definition of what a lowercase letter is depends on the current locale.
function string.upper(s) end
