/**@license
 * LIPS is Pretty Simple - version {{VER}}
 *
 * Copyright (c) 2018 Jakub Jankiewicz <http://jcubic.pl/me>
 * Released under the MIT license
 *
 * build: {{DATE}}
 */
/*
 * TODO: Pair.prototype.toObject = alist to Object
 */
"use strict";
/* global define, module, setTimeout, jQuery */
(function(root, factory) {
    if (typeof define === 'function' && define.amd) {
        // AMD. Register as an anonymous module.
        define([], function() {
            return (root.lips = factory());
        });
    } else if (typeof module === 'object' && module.exports) {
        // Node/CommonJS
        module.exports = factory();
    } else {
        root.lips = factory();
    }
})(typeof self !== 'undefined' ? self : this, function(undefined) {
    // parse_argument based on function from jQuery Terminal
    var re_re = /^\/((?:\\\/|[^/]|\[[^\]]*\/[^\]]*\])+)\/([gimy]*)$/;
    var float_re = /^[-+]?[0-9]*\.?[0-9]+([eE][-+]?[0-9]+)?$/;
    // ----------------------------------------------------------------------
    function parse_argument(arg) {
        function parse_string(string) {
            // remove quotes if before are even number of slashes
            // we don't remove slases becuase they are handled by JSON.parse
            //string = string.replace(/([^\\])['"]$/, '$1');
            if (string.match(/^['"]/)) {
                if (string === '""' || string === "''") {
                    return '';
                }
                var quote = string[0];
                var re = new RegExp("((^|[^\\\\])(?:\\\\\\\\)*)" + quote, "g");
                string = string.replace(re, "$1");
            }
            // use build in function to parse rest of escaped characters
            return JSON.parse('"' + string + '"');
        }
        var regex = arg.match(re_re);
        if (regex) {
            return new RegExp(regex[1], regex[2]);
        } else if (arg.match(/['"]/)) {
            return parse_string(arg);
        } else if (arg.match(/^-?[0-9]+$/)) {
            return parseInt(arg, 10);
        } else if (arg.match(float_re)) {
            return parseFloat(arg);
        } else if (arg === 'nil') {
            return nil;
        } else {
            return new Symbol(arg);
        }
    }
    // ----------------------------------------------------------------------
    /* eslint-disable */
    var tokens_re = /("[^"\\]*(?:\\[\S\s][^"\\]*)*"|\/[^\/\\]*(?:\\[\S\s][^\/\\]*)*\/[gimy]*(?=\s|\(|\)|$)|;.*|\(|\)|'|\.|,@|,|`|[^(\s)]+)/gi;
    /* eslint-enable */
    // ----------------------------------------------------------------------
    function tokenize(str) {
        return str.split('\n').map(function(line) {
            return line.split(tokens_re).map(function(token) {
                if (token.match(/^;/)) {
                    return null;
                }
                return token.trim();
            }).filter(Boolean);
        }).reduce(function(arr, tokens) {
            return arr.concat(tokens);
        }, []);
    }
    // ----------------------------------------------------------------------
    var specials = {
        "'": new Symbol('quote'),
        '`': new Symbol('quasiquote'),
        ',': new Symbol('unquote'),
        ',@': new Symbol('unquote-splicing')
    };
    // ----------------------------------------------------------------------
    // :: tokens are the array of strings from tokenizer
    // :: the return value is lisp code created out of Pair class
    // ----------------------------------------------------------------------
    function parse(tokens) {
        var stack = [];
        var result = [];
        var special = null;
        var special_tokens = Object.keys(specials);
        var special_forms = special_tokens.map(s => specials[s].name);
        var parents = 0;
        var first_value = false;
        tokens.forEach(function(token) {
            var top = stack[stack.length - 1];
            if (special_tokens.indexOf(token) !== -1) {
                special = token;
            } else if (token === '(') {
                first_value = true;
                parents++;
                if (special) {
                    stack.push([specials[special]]);
                    special = null;
                }
                stack.push([]);
            } else if (token === '.' && !first_value) {
                stack[stack.length - 1] = Pair.fromArray(top);
            } else if (token === ')') {
                parents--;
                if (!stack.length) {
                    throw new Error('Unbalanced parenthesis');
                }
                if (stack.length === 1) {
                    result.push(stack.pop());
                } else if (stack.length > 1) {
                    var list = stack.pop();
                    top = stack[stack.length - 1];
                    if (top instanceof Array) {
                        top.push(list);
                    } else if (top instanceof Pair) {
                        top.append(Pair.fromArray(list));
                    }
                    if (top instanceof Array && top[0] instanceof Symbol &&
                        special_forms.includes(top[0].name) &&
                        stack.length > 1) {
                        stack.pop();
                        if (stack[stack.length - 1].length === 0) {
                            stack[stack.length - 1] = top;
                        } else if (stack[stack.length - 1] instanceof Pair) {
                            if (stack[stack.length - 1].cdr instanceof Pair) {
                                stack[stack.length - 1] = new Pair(
                                    stack[stack.length - 1],
                                    Pair.fromArray(top)
                                );
                            } else {
                                stack[stack.length - 1].cdr = Pair.fromArray(top);
                            }
                        } else {
                            stack[stack.length - 1].push(top);
                        }
                    }
                }
                if (parents === 0 && stack.length) {
                    result.push(stack.pop());
                }
            } else {
                first_value = false;
                var value = parse_argument(token);
                if (special) {
                    value = [specials[special], value];
                    special = false;
                }
                if (top instanceof Pair) {
                    var node = top;
                    while (true) {
                        if (node.cdr === nil) {
                            node.cdr = value;
                            break;
                        } else {
                            node = node.cdr;
                        }
                    }
                } else if (!stack.length) {
                    result.push(value);
                } else {
                    top.push(value);
                }
            }
        });
        if (stack.length) {
            throw new Error('Unbalanced parenthesis');
        }
        return result.map((arg) => {
            if (arg instanceof Array) {
                return Pair.fromArray(arg);
            }
            return arg;
        });
    }
    // ----------------------------------------------------------------------
    // :: Symbol constructor
    // ----------------------------------------------------------------------
    function Symbol(name) {
        this.name = name;
    }
    Symbol.is = function(symbol, name) {
        return symbol instanceof Symbol &&
            typeof name === 'string' &&
            symbol.name === name;
    };
    Symbol.prototype.toJSON = Symbol.prototype.toString = function() {
        //return '<#symbol \'' + this.name + '\'>';
        return this.name;
    };
    // ----------------------------------------------------------------------
    // :: Nil constructor with only once instance
    // ----------------------------------------------------------------------
    function Nil() {}
    Nil.prototype.toString = function() {
        return 'nil';
    };
    var nil = new Nil();
    // ----------------------------------------------------------------------
    // :: Pair constructor
    // ----------------------------------------------------------------------
    function Pair(car, cdr) {
        this.car = car;
        this.cdr = cdr;
    }
    Pair.prototype.length = function() {
        var len = 0;
        var node = this;
        while (true) {
            if (node === nil) {
                break;
            }
            len++;
            node = node.cdr;
        }
        return len;
    };
    Pair.prototype.clone = function() {
        var cdr;
        if (this.cdr === nil) {
            cdr = nil;
        } else {
            cdr = this.cdr.clone();
        }
        return new Pair(this.car, cdr);
    };
    Pair.prototype.toArray = function() {
        if (this.cdr === nil && this.car === nil) {
            return [];
        }
        var result = [];
        if (this.car instanceof Pair) {
            result.push(this.car.toArray());
        } else {
            result.push(this.car);
        }
        if (this.cdr instanceof Pair) {
            result = result.concat(this.cdr.toArray());
        }
        return result;
    };
    Pair.fromArray = function(array) {
        if (array instanceof Pair) {
            return array;
        }
        if (array.length && !array instanceof Array) {
            array = [...array];
        }
        if (array.length === 0) {
            return new Pair(nil, nil);
        } else {
            var car;
            if (array[0] instanceof Array) {
                car = Pair.fromArray(array[0]);
            } else {
                car = array[0];
            }
            if (array.length === 1) {
                return new Pair(car, nil);
            } else {
                return new Pair(car, Pair.fromArray(array.slice(1)));
            }
        }
    };
    Pair.prototype.toObject = function() {
        var node = this;
        var result = {};
        while (true) {
            if (node instanceof Pair && node.car instanceof Pair) {
                var pair = node.car;
                var name = pair.car;
                if (name instanceof Symbol) {
                    name = name.name;
                }
                result[name] = pair.cdr;
                node = node.cdr;
            } else {
                break;
            }
        }
        return result;
    };
    Pair.fromPairs = function(array) {
        return array.reduce((list, pair) => {
            return new Pair(
                new Pair(
                    new Symbol(pair[0]),
                    pair[1]
                ),
                list
            );
        }, nil);
    };
    Pair.fromObject = function(obj) {
        var array = Object.keys(obj).map((key) => [key, obj[key]]);
        return Pair.fromPairs(array);
    };
    Pair.prototype.reduce = function(fn) {
        var node = this;
        var result = nil;
        while (true) {
            if (node !== nil) {
                result = fn(result, node.car);
                node = node.cdr;
            } else {
                break;
            }
        }
        return result;
    };
    Pair.prototype.reverse = function() {
        var node = this;
        var prev = nil;
        while (node !== nil) {
            var next = node.cdr;
            node.cdr = prev;
            prev = node;
            node = next;
        }
        return prev;
    };
    Pair.prototype.transform = function(fn) {
        var visited = [];
        function recur(pair) {
            if (pair instanceof Pair) {
                if (pair.replace) {
                    delete pair.replace;
                    return pair;
                }
                var car = fn(pair.car);
                if (car instanceof Pair) {
                    car = recur(car);
                    visited.push(car);
                }
                var cdr = fn(pair.cdr);
                if (cdr instanceof Pair) {
                    cdr = recur(cdr);
                    visited.push(cdr);
                }
                return new Pair(car, cdr);
            }
            return pair;
        }
        return recur(this);
    };
    Pair.prototype.toString = function() {
        var arr = ['('];
        if (typeof this.car === 'string') {
            arr.push(JSON.stringify(this.car));
        } else if (typeof this.car !== 'undefined') {
            arr.push(this.car);
        }
        if (this.cdr instanceof Pair) {
            arr.push(' ');
            arr.push(this.cdr.toString().replace(/^\(|\)$/g, ''));
        } else if (typeof this.cdr !== 'undefined' && this.cdr !== nil) {
            if (typeof this.cdr === 'string') {
                arr = arr.concat([' . ', JSON.stringify(this.cdr)]);
            } else {
                arr = arr.concat([' . ', this.cdr]);
            }
        }
        arr.push(')');
        return arr.join('');
    };
    Pair.prototype.append = function(pair) {
        if (pair instanceof Array) {
            return this.append(Pair.fromArray(pair));
        }
        var p = this;
        while (true) {
            if (p instanceof Pair && p.cdr !== nil) {
                p = p.cdr;
            } else {
                break;
            }
        }
        p.cdr = pair;
        return this;
    };

    // ----------------------------------------------------------------------
    // :: Macro constructor
    // ----------------------------------------------------------------------
    function Macro(fn) {
        this.fn = fn;
    }
    Macro.prototype.invoke = function(code, env) {
        return this.fn.call(env, code);
    };

    // ----------------------------------------------------------------------
    // :: Environment constructor (parent argument is optional)
    // ----------------------------------------------------------------------
    function Environment(obj, parent) {
        this.env = obj;
        this.parent = parent;
    }
    Environment.prototype.get = function(symbol) {
        if (symbol instanceof Symbol) {
            if (typeof this.env[symbol.name] !== 'undefined') {
                return this.env[symbol.name];
            }
        } else if (typeof symbol === 'string') {
            if (typeof this.env[symbol] !== 'undefined') {
                return this.env[symbol];
            }
        }

        if (this.parent instanceof Environment) {
            return this.parent.get(symbol);
        } else if (symbol instanceof Symbol) {
            if (typeof window[symbol.name] !== 'undefined') {
                return window[symbol.name];
            }
        } else if (typeof symbol === 'string') {
            if (typeof window[symbol] !== 'undefined') {
                return window[symbol];
            }
        }
    };
    Environment.prototype.set = function(name, value) {
        this.env[name] = value;
    };
    // ----------------------------------------------------------------------
    // :: Quote constructor used to pause evaluation from Macro
    // ----------------------------------------------------------------------
    function Quote(value) {
        this.value = value;
    }
    // ----------------------------------------------------------------------
    // :: function that return macro for let and let*
    // ----------------------------------------------------------------------
    function let_macro(asterisk) {
        return new Macro(function(code) {
            var args = this.get('list->array')(code.car);
            var env = new Environment({}, this);
            args.forEach((pair) => {
                env.set(pair.car, evaluate(pair.cdr.car, asterisk ? env : this));
            });
            var output = new Pair(new Symbol('begin'), code.cdr);
            return new Quote(evaluate(output, env));
        });
    }
    var gensym = (function() {
        var count = 0;
        return function() {
            count++;
            return new Symbol('#' + count);
        };
    })();
    function request(url, method = 'GET', headers = {}, data = null) {
        var xhr = new XMLHttpRequest();
        xhr.open(method, url, true);
        Object.keys(headers).forEach(name => {
            xhr.setRequestHeader(name, headers[name]);
        });
        return new Promise((resolve) => {
            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4 && xhr.status === 200) {
                    resolve(xhr.responseText);
                }
            };
            if (data !== null) {
                xhr.send(data);
            } else {
                xhr.send();
            }
        });
    }
    var global_env = new Environment({
        nil: nil,
        window: window,
        'true': true,
        'false': false,
        stdout: {
            write: function(...args) {
                console.log(...args);
            }
        },
        stdin: {
            read: function() {
                return new Promise((resolve) => {
                    resolve(prompt(''));
                });
            }
        },
        cons: function(car, cdr) {
            return new Pair(car, cdr);
        },
        car: function(list) {
            if (list instanceof Pair) {
                return list.car;
            } else {
                throw new Error('argument to car need to be a list');
            }
        },
        cdr: function(list) {
            if (list instanceof Pair) {
                return list.cdr;
            } else {
                throw new Error('argument to cdr need to be a list');
            }
        },
        'set-car': function(slot, value) {
            slot.car = value;
        },
        'set-cdr': function(slot, value) {
            slot.cdr = value;
        },
        assoc: function(list, key) {
            var node = list;
            var name = key instanceof Symbol ? key.name : key;
            while (true) {
                var car = node.car.car;
                if (car instanceof Symbol &&
                    car.name === name || car.name === name) {
                    return node.car;
                } else {
                    node = node.cdr;
                }
            }
        },
        gensym: gensym,
        load: function(file) {
            request(file).then((code) => {
                this.get('eval')(this.get('read')(code));
            });
        },
        'while': new Macro(function(code) {
            var self = this;
            var begin = new Pair(
                new Symbol('begin'),
                code.cdr
            );
            return new Promise((resolve) => {
                var result;
                (function loop() {
                    function next(cond) {
                        if (cond) {
                            var value = evaluate(begin, self);
                            if (value instanceof Promise) {
                                value.then((value) => {
                                    result = value;
                                    loop();
                                });
                            } else {
                                result = value;
                                loop();
                            }
                        } else {
                            resolve(result);
                        }
                    }
                    var cond = evaluate(code.car, self);
                    if (cond instanceof Promise) {
                        cond.then(next);
                    } else {
                        next(cond);
                    }
                })();
            });
        }),
        'if': new Macro(function(code) {
            var resolve = (cond) => {
                if (cond) {
                    var true_value = evaluate(code.cdr.car, this);
                    if (typeof true_value === 'undefined') {
                        return;
                    }
                    return true_value;
                } else if (code.cdr.cdr.car instanceof Pair) {
                    var false_value = evaluate(code.cdr.cdr.car, this);
                    if (typeof false_value === 'undefined') {
                        return false;
                    }
                    return false_value;
                } else {
                    return false;
                }
            };
            var cond = evaluate(code.car, this);
            if (cond instanceof Promise) {
                return cond.then(resolve);
            } else {
                return resolve(cond);
            }
        }),
        'let*': let_macro(true),
        'let': let_macro(false),
        'begin': new Macro(function(code) {
            var arr = this.get('list->array')(code);
            return arr.reduce((_, code) => evaluate(code, this), 0);
        }),
        timer: new Macro(function(code) {
            return new Promise((resolve) => {
                setTimeout(() => {
                    resolve(new Quote(evaluate(code.cdr, this)));
                }, code.car);
            });
        }),
        define: new Macro(function(code) {
            if (code.car instanceof Pair &&
                code.car.car instanceof Symbol) {
                var new_code = new Pair(
                    new Symbol("define"),
                    new Pair(
                        code.car.car,
                        new Pair(
                            new Pair(
                                new Symbol("lambda"),
                                new Pair(
                                    code.car.cdr,
                                    code.cdr
                                )
                            )
                        )
                    )
                );
                return new_code;
            }
            var value = code.cdr.car;
            if (value instanceof Pair) {
                value = evaluate(value, this);
            }
            if (code.car instanceof Symbol) {
                this.env[code.car.name] = value;
            }
        }),
        set: function(obj, key, value) {
            obj[key] = value;
        },
        'eval': function(code) {
            if (code instanceof Pair) {
                return evaluate(code, this);
            }
            if (code instanceof Array) {
                var result;
                code.forEach((code) => {
                    result = evaluate(code, this);
                });
                return result;
            }
        },
        lambda: new Macro(function(code) {
            return (...args) => {
                var env = new Environment({}, this);
                var name = code.car;
                var i = 0;
                var value;
                while (true) {
                    if (name.car !== nil) {
                        if (typeof args[i] === 'undefined') {
                            value = nil;
                        } else {
                            value = args[i];
                        }
                        env.env[name.car.name] = value;
                    }
                    if (name.cdr === nil) {
                        break;
                    }
                    i++;
                    name = name.cdr;
                }
                return evaluate(code.cdr.car, env);
            };
        }),
        defmacro: new Macro(function(macro) {
            if (macro.car.car instanceof Symbol) {
                this.env[macro.car.car.name] = new Macro(function(code) {
                    var env = new Environment({}, this);
                    var name = macro.car.cdr;
                    var arg = code;
                    while (true) {
                        if (name.car !== nil && arg.car !== nil) {
                            env.env[name.car.name] = arg.car;
                        }
                        if (name.cdr === nil) {
                            break;
                        }
                        arg = arg.cdr;
                        name = name.cdr;
                    }
                    return evaluate(macro.cdr.car, env);
                });
            }
        }),
        quote: new Macro(function(arg) {
            return new Quote(arg.car);
        }),
        quasiquote: new Macro(function(arg) {
            var self = this;
            function recur(pair) {
                if (pair instanceof Pair) {
                    var eval_pair;
                    if (Symbol.is(pair.car.car, 'unquote-splicing')) {
                        eval_pair = evaluate(pair.car.cdr.car, self);
                        if (!eval_pair instanceof Pair) {
                            throw new Error('Value of unquote-splicing need' +
                                            ' to be pair');
                        }
                        if (pair.cdr instanceof Pair) {
                            if (eval_pair instanceof Pair) {
                                eval_pair.cdr.append(recur(pair.cdr));
                            } else {
                                eval_pair = new Pair(
                                    eval_pair,
                                    recur(pair.cdr)
                                );
                            }
                        }
                        return eval_pair;
                    }
                    if (Symbol.is(pair.car, 'unquote-splicing')) {
                        eval_pair = evaluate(pair.cdr.car, self);
                        if (!eval_pair instanceof Pair) {
                            throw new Error('Value of unquote-splicing' +
                                            ' need to be pair');
                        }
                        return eval_pair;
                    }
                    if (Symbol.is(pair.car, 'unquote')) {
                        if (pair.cdr.cdr !== nil) {
                            return new Pair(
                                evaluate(pair.cdr.car, self),
                                pair.cdr.cdr
                            );
                        } else {
                            return evaluate(pair.cdr.car, self);
                        }
                    }
                    var car = pair.car;
                    if (car instanceof Pair) {
                        car = recur(car);
                    }
                    var cdr = pair.cdr;
                    if (cdr instanceof Pair) {
                        cdr = recur(cdr);
                    }
                    return new Pair(car, cdr);
                }
                return pair;
            }
            return new Quote(recur(arg.car));
        }),
        clone: function(list) {
            return list.clone();
        },
        append: function(list, item) {
            return this.get('append!')(list.clone(), item);
        },
        'append!': function(list, item) {
            var node = list;
            while (true) {
                if (node.cdr === nil) {
                    node.cdr = item;
                    break;
                }
                node = node.cdr;
            }
            return list;
        },
        list: function() {
            return Pair.fromArray([].slice.call(arguments));
        },
        concat: function() {
            return [].join.call(arguments, '');
        },
        string: function(obj) {
            if (typeof jQuery !== 'undefined' &&
                obj instanceof jQuery.fn.init) {
                return '<#jQuery>';
            }
            if (obj instanceof Macro) {
                //return '<#Macro>';
            }
            if (typeof obj === 'undefined') {
                return '<#undefined>';
            }
            if (typeof obj === 'function') {
                return '<#function>';
            }
            if (obj === nil) {
                return 'nil';
            }
            if (obj instanceof Array || obj === null) {
                return JSON.stringify(obj);
            }
            if (obj instanceof Pair) {
                return obj.toString();
            }
            if (typeof obj === 'object') {
                var name = obj.constructor.name;
                if (name !== '') {
                    return '<#' + name + '>';
                }
                return '<#Object>';
            }
            if (typeof obj !== 'string') {
                return obj.toString();
            }
            return obj;
        },
        env: function(env) {
            env = env || this;
            var names = Object.keys(env.env);
            var result;
            if (names.length) {
                result = Pair.fromArray(names);
            } else {
                result = nil;
            }
            if (env.parent !== undefined) {
                return this.get('env').call(this, env.parent).append(result);
            }
            return result;
        },
        '.': function(obj, arg) {
            var name = arg instanceof Symbol ? arg.name : arg;
            var value = obj[name];
            if (typeof value === 'function') {
                return value.bind(obj);
            }
            return value;
        },
        read: function(arg) {
            if (typeof arg === 'string') {
                return parse(tokenize(arg));
            }
            return this.get('stdin').read().then((text) => {
                return this.get('read').call(this, text);
            });
        },
        print: function(...args) {
            this.get('stdout').write(...args.map((arg) => {
                return this.get('string')(arg);
            }));
        },
        'array->list': function(array) {
            return Pair.fromArray(array);
        },
        'list->array': function(list) {
            var result = [];
            var node = list;
            while (true) {
                if (node instanceof Pair) {
                    result.push(node.car);
                    node = node.cdr;
                } else {
                    break;
                }
            }
            return result;
        },
        filter: function(fn, list) {
            return Pair.fromArray(this.get('list->array')(list).filter(fn));
        },
        odd: function(num) {
            return num % 2 === 1;
        },
        even: function(num) {
            return num % 2 === 0;
        },
        apply: function(fn, list) {
            var args = this.get('list->array')(list);
            return fn.apply(null, args);
        },
        map: function(fn, list) {
            var result = this.get('list->array')(list).map(fn);
            if (result.length) {
                return Pair.fromArray(result);
            } else {
                return nil;
            }
        },
        reduce: function(fn, list) {
            var arr = this.get('list->array')(list);
            return arr.reduce((list, item) => {
                return fn(list, item);
            }, nil);
        },
        // math functions
        '*': function(...args) {
            return args.reduce(function(a, b) {
                return a * b;
            });
        },
        '+': function(...args) {
            return args.reduce(function(a, b) {
                return a + b;
            });
        },
        '-': function(...args) {
            return args.reduce(function(a, b) {
                return a - b;
            });
        },
        '/': function(...args) {
            return args.reduce(function(a, b) {
                return a / b;
            });
        },
        '%': function(a, b) {
            return a % b;
        },
        // Booleans
        "==": function(a, b) {
            return a === b;
        },
        '>': function(a, b) {
            return a > b;
        },
        '<': function(a, b) {
            return a < b;
        },
        '<=': function(a, b) {
            return a <= b;
        },
        '>=': function(a, b) {
            return a >= b;
        },
        or: new Macro(function(code) {
            var args = this.get('list->array')(code);
            var self = this;
            return new Promise(function(resolve) {
                var result;
                (function loop() {
                    function next(value) {
                        result = value;
                        if (result) {
                            resolve(value);
                        }
                        loop();
                    }
                    var arg = args.shift();
                    if (typeof arg === 'undefined') {
                        if (result) {
                            resolve(result);
                        } else {
                            resolve(false);
                        }
                    } else {
                        var value = evaluate(arg, self);
                        if (value instanceof Promise) {
                            value.then(next);
                        } else {
                            next(value);
                        }
                    }
                })();
            });
        }),
        and: new Macro(function(code) {
            var args = this.get('list->array')(code);
            var self = this;
            return new Promise(function(resolve) {
                var result;
                (function loop() {
                    function next(value) {
                        result = value;
                        if (!result) {
                            resolve(false);
                        }
                        loop();
                    }
                    var arg = args.shift();
                    if (typeof arg === 'undefined') {
                        if (result) {
                            resolve(result);
                        } else {
                            resolve(false);
                        }
                    } else {
                        var value = evaluate(arg, self);
                        if (value instanceof Promise) {
                            value.then(next);
                        } else {
                            next(value);
                        }
                    }
                })();
            });
        }),
        '++': new Macro(function(code) {
            var value = this.get(code.car) + 1;
            this.set(code.car, value);
            return value;
        }),
        '--': new Macro(function(code) {
            var value = this.get(code.car) - 1;
            this.set(code.car, value);
            return value;
        })
    });

    // ----------------------------------------------------------------------
    // source: https://stackoverflow.com/a/4331218/387194
    function allPossibleCases(arr) {
        if (arr.length === 1) {
            return arr[0];
        } else {
            var result = [];
            // recur with the rest of array
            var allCasesOfRest = allPossibleCases(arr.slice(1));
            for (var i = 0; i < allCasesOfRest.length; i++) {
                for (var j = 0; j < arr[0].length; j++) {
                    result.push(arr[0][j] + allCasesOfRest[i]);
                }
            }
            return result;
        }
    }

    // ----------------------------------------------------------------------
    function combinations(input, start, end) {
        var result = [];
        for (var i = start; i <= end; ++i) {
            var input_arr = [];
            for (var j = 0; j < i; ++j) {
                input_arr.push(input);
            }
            result = result.concat(allPossibleCases(input_arr));
        }
        return result;
    }
    // ----------------------------------------------------------------------
    // cadr caddr cadadr etc.
    combinations(['d', 'a'], 2, 5).forEach((spec) => {
        var chars = spec.split('').reverse();
        global_env.set('c' + spec + 'r', function(arg) {
            return chars.reduce(function(list, type) {
                if (type === 'a') {
                    return list.car;
                } else {
                    return list.cdr;
                }
            }, arg);
        });
    });

    // ----------------------------------------------------------------------
    function evaluate(code, env) {
        env = env || global_env;
        var value;
        if (typeof code === 'undefined') {
            return;
        }
        var first = code.car;
        var rest = code.cdr;
        if (first instanceof Pair) {
            value = evaluate(first, env);
            if (typeof value !== 'function') {
                throw new Error(
                    env.get('string')(value) + ' is not a function'
                );
            }
        }
        if (typeof first === 'function') {
            value = first;
        }
        if (first instanceof Symbol) {
            value = env.get(first);
            if (value instanceof Macro) {
                value = value.invoke(rest, env);
                if (value instanceof Quote) {
                    return value.value;
                }
                return evaluate(value, env);
            } else if (typeof value !== 'function') {
                throw new Error('Unknown function `' + first.name + '\'');
            }
        }
        if (typeof value === 'function') {
            var args = [];
            var node = rest;
            while (true) {
                if (node instanceof Pair) {
                    args.push(evaluate(node.car, env));
                    node = node.cdr;
                } else {
                    break;
                }
            }
            var promises = args.filter((arg) => arg instanceof Promise);
            if (promises.length) {
                return Promise.all(args).then((args) => {
                    return value.apply(env, args);
                });
            }
            return value.apply(env, args);
        } else if (code instanceof Symbol) {
            value = env.get(code);
            if (value === 'undefined') {
                throw new Error('Unbound variable `' + code.name + '\'');
            }
            return value;
        } else {
            return code;
        }
    }
    // ----------------------------------------------------------------------

    function balanced(code) {
        var re = /[()]/;
        var parenthesis = tokenize(code).filter((token) => token.match(re));
        var open = parenthesis.filter(p => p === ')');
        var close = parenthesis.filter(p => p === '(');
        return open.length === close.length;
    }
    // --------------------------------------
    Pair.unDry = function(value) {
        return new Pair(value.car, value.cdr);
    };
    Pair.prototype.toDry = function() {
        return {
            value: {
                car: this.car,
                cdr: this.cdr
            }
        };
    };
    Nil.prototype.toDry = function() {
        return {
            value: null
        };
    };
    Nil.unDry = function() {
        return nil;
    };
    Symbol.prototype.toDry = function() {
        return {
            value: {
                name: this.name
            }
        };
    };
    Symbol.unDry = function(value) {
        return new Symbol(value.name);
    };
    return {
        version: '{{VER}}',
        parse: parse,
        tokenize: tokenize,
        evaluate: evaluate,
        Environment: Environment,
        global_environment: global_env,
        balanced_parenthesis: balanced,
        Macro: Macro,
        Quote: Quote,
        Pair: Pair,
        nil: nil,
        Symbol: Symbol
    };
});