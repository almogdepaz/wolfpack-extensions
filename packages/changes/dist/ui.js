var __create = Object.create;
var __getProtoOf = Object.getPrototypeOf;
var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
function __accessProp(key2) {
  return this[key2];
}
var __toESMCache_node;
var __toESMCache_esm;
var __toESM = (mod, isNodeMode, target) => {
  var canCache = mod != null && typeof mod === "object";
  if (canCache) {
    var cache = isNodeMode ? __toESMCache_node ??= new WeakMap : __toESMCache_esm ??= new WeakMap;
    var cached = cache.get(mod);
    if (cached)
      return cached;
  }
  target = mod != null ? __create(__getProtoOf(mod)) : {};
  const to = isNodeMode || !mod || !mod.__esModule || !__hasOwnProp.call(mod, "default") ? __defProp(target, "default", { value: mod, enumerable: true }) : target;
  if (mod && typeof mod === "object" || typeof mod === "function") {
    for (let key2 of __getOwnPropNames(mod))
      if (!__hasOwnProp.call(to, key2))
        __defProp(to, key2, {
          get: __accessProp.bind(mod, key2),
          enumerable: true
        });
  }
  if (canCache)
    cache.set(mod, to);
  return to;
};
var __commonJS = (cb, mod) => () => (mod || cb((mod = { exports: {} }).exports, mod), mod.exports);

// ../../node_modules/.bun/@profoundlogic+hogan@3.0.4/node_modules/@profoundlogic/hogan/lib/compiler.js
var require_compiler = __commonJS(function(exports) {
  (function(Hogan2) {
    var rIsWhitespace = /\S/, rQuot = /\"/g, rNewline = /\n/g, rCr = /\r/g, rSlash = /\\/g, rLineSep = /\u2028/, rParagraphSep = /\u2029/;
    Hogan2.tags = {
      "#": 1,
      "^": 2,
      "<": 3,
      $: 4,
      "/": 5,
      "!": 6,
      ">": 7,
      "=": 8,
      _v: 9,
      "{": 10,
      "&": 11,
      _t: 12
    };
    Hogan2.scan = function scan(text, delimiters) {
      var len = text.length, IN_TEXT = 0, IN_TAG_TYPE = 1, IN_TAG = 2, state = IN_TEXT, tagType = null, tag = null, buf = "", tokens = [], seenTag = false, i = 0, lineStart = 0, otag = "{{", ctag = "}}";
      function addBuf() {
        if (buf.length > 0) {
          tokens.push({ tag: "_t", text: new String(buf) });
          buf = "";
        }
      }
      function lineIsWhitespace() {
        var isAllWhitespace = true;
        for (var j = lineStart;j < tokens.length; j++) {
          isAllWhitespace = Hogan2.tags[tokens[j].tag] < Hogan2.tags["_v"] || tokens[j].tag == "_t" && tokens[j].text.match(rIsWhitespace) === null;
          if (!isAllWhitespace) {
            return false;
          }
        }
        return isAllWhitespace;
      }
      function filterLine(haveSeenTag, noNewLine) {
        addBuf();
        if (haveSeenTag && lineIsWhitespace()) {
          for (var j = lineStart, next;j < tokens.length; j++) {
            if (tokens[j].text) {
              if ((next = tokens[j + 1]) && next.tag == ">") {
                next.indent = tokens[j].text.toString();
              }
              tokens.splice(j, 1);
            }
          }
        } else if (!noNewLine) {
          tokens.push({ tag: `
` });
        }
        seenTag = false;
        lineStart = tokens.length;
      }
      function changeDelimiters(text, index) {
        var close = "=" + ctag, closeIndex = text.indexOf(close, index), delimiters = trim(text.substring(text.indexOf("=", index) + 1, closeIndex)).split(" ");
        otag = delimiters[0];
        ctag = delimiters[delimiters.length - 1];
        return closeIndex + close.length - 1;
      }
      if (delimiters) {
        delimiters = delimiters.split(" ");
        otag = delimiters[0];
        ctag = delimiters[1];
      }
      for (i = 0;i < len; i++) {
        if (state == IN_TEXT) {
          if (tagChange(otag, text, i)) {
            --i;
            addBuf();
            state = IN_TAG_TYPE;
          } else {
            if (text.charAt(i) == `
`) {
              filterLine(seenTag);
            } else {
              buf += text.charAt(i);
            }
          }
        } else if (state == IN_TAG_TYPE) {
          i += otag.length - 1;
          tag = Hogan2.tags[text.charAt(i + 1)];
          tagType = tag ? text.charAt(i + 1) : "_v";
          if (tagType == "=") {
            i = changeDelimiters(text, i);
            state = IN_TEXT;
          } else {
            if (tag) {
              i++;
            }
            state = IN_TAG;
          }
          seenTag = i;
        } else {
          if (tagChange(ctag, text, i)) {
            tokens.push({
              tag: tagType,
              n: trim(buf),
              otag,
              ctag,
              i: tagType == "/" ? seenTag - otag.length : i + ctag.length
            });
            buf = "";
            i += ctag.length - 1;
            state = IN_TEXT;
            if (tagType == "{") {
              if (ctag == "}}") {
                i++;
              } else {
                cleanTripleStache(tokens[tokens.length - 1]);
              }
            }
          } else {
            buf += text.charAt(i);
          }
        }
      }
      filterLine(seenTag, true);
      return tokens;
    };
    function cleanTripleStache(token) {
      if (token.n.substr(token.n.length - 1) === "}") {
        token.n = token.n.substring(0, token.n.length - 1);
      }
    }
    function trim(s) {
      if (s.trim) {
        return s.trim();
      }
      return s.replace(/^\s*|\s*$/g, "");
    }
    function tagChange(tag, text, index) {
      if (text.charAt(index) != tag.charAt(0)) {
        return false;
      }
      for (var i = 1, l = tag.length;i < l; i++) {
        if (text.charAt(index + i) != tag.charAt(i)) {
          return false;
        }
      }
      return true;
    }
    var allowedInSuper = { _t: true, "\n": true, $: true, "/": true };
    function buildTree(tokens, kind, stack, customTags) {
      var instructions = [], opener = null, tail = null, token = null;
      tail = stack[stack.length - 1];
      while (tokens.length > 0) {
        token = tokens.shift();
        if (tail && tail.tag == "<" && !(token.tag in allowedInSuper)) {
          throw new Error("Illegal content in < super tag.");
        }
        if (Hogan2.tags[token.tag] <= Hogan2.tags["$"] || isOpener(token, customTags)) {
          stack.push(token);
          token.nodes = buildTree(tokens, token.tag, stack, customTags);
        } else if (token.tag == "/") {
          if (stack.length === 0) {
            throw new Error("Closing tag without opener: /" + token.n);
          }
          opener = stack.pop();
          if (token.n != opener.n && !isCloser(token.n, opener.n, customTags)) {
            throw new Error("Nesting error: " + opener.n + " vs. " + token.n);
          }
          opener.end = token.i;
          return instructions;
        } else if (token.tag == `
`) {
          token.last = tokens.length == 0 || tokens[0].tag == `
`;
        }
        instructions.push(token);
      }
      if (stack.length > 0) {
        throw new Error("missing closing tag: " + stack.pop().n);
      }
      return instructions;
    }
    function isOpener(token, tags) {
      for (var i = 0, l = tags.length;i < l; i++) {
        if (tags[i].o == token.n) {
          token.tag = "#";
          return true;
        }
      }
    }
    function isCloser(close, open, tags) {
      for (var i = 0, l = tags.length;i < l; i++) {
        if (tags[i].c == close && tags[i].o == open) {
          return true;
        }
      }
    }
    function stringifySubstitutions(obj) {
      var items = [];
      for (var key2 in obj) {
        items.push('"' + esc(key2) + '": function(c,p,t,i) {' + obj[key2] + "}");
      }
      return "{ " + items.join(",") + " }";
    }
    function stringifyPartials(codeObj) {
      var partials = [];
      for (var key2 in codeObj.partials) {
        partials.push('"' + esc(key2) + '":{name:"' + esc(codeObj.partials[key2].name) + '", ' + stringifyPartials(codeObj.partials[key2]) + "}");
      }
      return "partials: {" + partials.join(",") + "}, subs: " + stringifySubstitutions(codeObj.subs);
    }
    Hogan2.stringify = function(codeObj, text, options) {
      return "{code: function (c,p,i) { " + Hogan2.wrapMain(codeObj.code) + " }," + stringifyPartials(codeObj) + "}";
    };
    var serialNo = 0;
    Hogan2.generate = function(tree, text, options) {
      serialNo = 0;
      var context = { code: "", subs: {}, partials: {} };
      Hogan2.walk(tree, context);
      if (options.asString) {
        return this.stringify(context, text, options);
      }
      return this.makeTemplate(context, text, options);
    };
    Hogan2.wrapMain = function(code) {
      return 'var t=this;t.b(i=i||"");' + code + "return t.fl();";
    };
    Hogan2.template = Hogan2.Template;
    Hogan2.makeTemplate = function(codeObj, text, options) {
      var template = this.makePartials(codeObj);
      template.code = new Function("c", "p", "i", this.wrapMain(codeObj.code));
      return new this.template(template, text, this, options);
    };
    Hogan2.makePartials = function(codeObj) {
      var key2, template = { subs: {}, partials: codeObj.partials, name: codeObj.name };
      for (key2 in template.partials) {
        template.partials[key2] = this.makePartials(template.partials[key2]);
      }
      for (key2 in codeObj.subs) {
        template.subs[key2] = new Function("c", "p", "t", "i", codeObj.subs[key2]);
      }
      return template;
    };
    function esc(s) {
      return s.replace(rSlash, "\\\\").replace(rQuot, "\\\"").replace(rNewline, "\\n").replace(rCr, "\\r").replace(rLineSep, "\\u2028").replace(rParagraphSep, "\\u2029");
    }
    function chooseMethod(s) {
      return ~s.indexOf(".") ? "d" : "f";
    }
    function createPartial(node, context) {
      var prefix = "<" + (context.prefix || "");
      var sym = prefix + node.n + serialNo++;
      context.partials[sym] = { name: node.n, partials: {} };
      context.code += 't.b(t.rp("' + esc(sym) + '",c,p,"' + (node.indent || "") + '"));';
      return sym;
    }
    Hogan2.codegen = {
      "#": function(node, context) {
        context.code += "if(t.s(t." + chooseMethod(node.n) + '("' + esc(node.n) + '",c,p,1),' + "c,p,0," + node.i + "," + node.end + ',"' + node.otag + " " + node.ctag + '")){' + "t.rs(c,p," + "function(c,p,t){";
        Hogan2.walk(node.nodes, context);
        context.code += "});c.pop();}";
      },
      "^": function(node, context) {
        context.code += "if(!t.s(t." + chooseMethod(node.n) + '("' + esc(node.n) + '",c,p,1),c,p,1,0,0,"")){';
        Hogan2.walk(node.nodes, context);
        context.code += "};";
      },
      ">": createPartial,
      "<": function(node, context) {
        var ctx = { partials: {}, code: "", subs: {}, inPartial: true };
        Hogan2.walk(node.nodes, ctx);
        var template = context.partials[createPartial(node, context)];
        template.subs = ctx.subs;
        template.partials = ctx.partials;
      },
      $: function(node, context) {
        var ctx = { subs: {}, code: "", partials: context.partials, prefix: node.n };
        Hogan2.walk(node.nodes, ctx);
        context.subs[node.n] = ctx.code;
        if (!context.inPartial) {
          context.code += 't.sub("' + esc(node.n) + '",c,p,i);';
        }
      },
      "\n": function(node, context) {
        context.code += write('"\\n"' + (node.last ? "" : " + i"));
      },
      _v: function(node, context) {
        context.code += "t.b(t.v(t." + chooseMethod(node.n) + '("' + esc(node.n) + '",c,p,0)));';
      },
      _t: function(node, context) {
        context.code += write('"' + esc(node.text) + '"');
      },
      "{": tripleStache,
      "&": tripleStache
    };
    function tripleStache(node, context) {
      context.code += "t.b(t.t(t." + chooseMethod(node.n) + '("' + esc(node.n) + '",c,p,0)));';
    }
    function write(s) {
      return "t.b(" + s + ");";
    }
    Hogan2.walk = function(nodelist, context) {
      var func;
      for (var i = 0, l = nodelist.length;i < l; i++) {
        func = Hogan2.codegen[nodelist[i].tag];
        func && func(nodelist[i], context);
      }
      return context;
    };
    Hogan2.parse = function(tokens, text, options) {
      options = options || {};
      return buildTree(tokens, "", [], options.sectionTags || []);
    };
    Hogan2.cache = {};
    Hogan2.cacheKey = function(text, options) {
      return [text, !!options.asString, !!options.disableLambda, options.delimiters, !!options.modelGet].join("||");
    };
    Hogan2.compile = function(text, options) {
      options = options || {};
      var key2 = Hogan2.cacheKey(text, options);
      var template = this.cache[key2];
      if (template) {
        var partials = template.partials;
        for (var name in partials) {
          delete partials[name].instance;
        }
        return template;
      }
      template = this.generate(this.parse(this.scan(text, options.delimiters), text, options), text, options);
      return this.cache[key2] = template;
    };
  })(typeof exports !== "undefined" ? exports : Hogan);
});

// ../../node_modules/.bun/@profoundlogic+hogan@3.0.4/node_modules/@profoundlogic/hogan/lib/template.js
var require_template = __commonJS(function(exports) {
  var Hogan2 = {};
  (function(Hogan2) {
    Hogan2.Template = function(codeObj, text, compiler, options) {
      codeObj = codeObj || {};
      this.r = codeObj.code || this.r;
      this.c = compiler;
      this.options = options || {};
      this.text = text || "";
      this.partials = codeObj.partials || {};
      this.subs = codeObj.subs || {};
      this.buf = "";
    };
    Hogan2.Template.prototype = {
      r: function(context, partials, indent) {
        return "";
      },
      v: hoganEscape,
      t: coerceToString,
      render: function render(context, partials, indent) {
        return this.ri([context], partials || {}, indent);
      },
      ri: function(context, partials, indent) {
        return this.r(context, partials, indent);
      },
      ep: function(symbol, partials) {
        var partial = this.partials[symbol];
        var template = partials[partial.name];
        if (partial.instance && partial.base == template) {
          return partial.instance;
        }
        if (typeof template == "string") {
          if (!this.c) {
            throw new Error("No compiler available.");
          }
          template = this.c.compile(template, this.options);
        }
        if (!template) {
          return null;
        }
        this.partials[symbol].base = template;
        if (partial.subs) {
          if (!partials.stackText)
            partials.stackText = {};
          for (key in partial.subs) {
            if (!partials.stackText[key]) {
              partials.stackText[key] = this.activeSub !== undefined && partials.stackText[this.activeSub] ? partials.stackText[this.activeSub] : this.text;
            }
          }
          template = createSpecializedPartial(template, partial.subs, partial.partials, this.stackSubs, this.stackPartials, partials.stackText);
        }
        this.partials[symbol].instance = template;
        return template;
      },
      rp: function(symbol, context, partials, indent) {
        var partial = this.ep(symbol, partials);
        if (!partial) {
          return "";
        }
        return partial.ri(context, partials, indent);
      },
      rs: function(context, partials, section) {
        var tail = context[context.length - 1];
        if (!isArray(tail)) {
          section(context, partials, this);
          return;
        }
        for (var i = 0;i < tail.length; i++) {
          context.push(tail[i]);
          section(context, partials, this);
          context.pop();
        }
      },
      s: function(val, ctx, partials, inverted, start, end, tags) {
        var pass;
        if (isArray(val) && val.length === 0) {
          return false;
        }
        if (typeof val == "function") {
          val = this.ms(val, ctx, partials, inverted, start, end, tags);
        }
        pass = !!val;
        if (!inverted && pass && ctx) {
          ctx.push(typeof val == "object" ? val : ctx[ctx.length - 1]);
        }
        return pass;
      },
      d: function(key2, ctx, partials, returnFound) {
        var found, names = key2.split("."), val = this.f(names[0], ctx, partials, returnFound), doModelGet = this.options.modelGet, cx = null;
        if (key2 === "." && isArray(ctx[ctx.length - 2])) {
          val = ctx[ctx.length - 1];
        } else {
          for (var i = 1;i < names.length; i++) {
            found = findInScope(names[i], val, doModelGet);
            if (found !== undefined) {
              cx = val;
              val = found;
            } else {
              val = "";
            }
          }
        }
        if (returnFound && !val) {
          return false;
        }
        if (!returnFound && typeof val == "function") {
          ctx.push(cx);
          val = this.mv(val, ctx, partials);
          ctx.pop();
        }
        return val;
      },
      f: function(key2, ctx, partials, returnFound) {
        var val = false, v = null, found = false, doModelGet = this.options.modelGet;
        for (var i = ctx.length - 1;i >= 0; i--) {
          v = ctx[i];
          val = findInScope(key2, v, doModelGet);
          if (val !== undefined) {
            found = true;
            break;
          }
        }
        if (!found) {
          return returnFound ? false : "";
        }
        if (!returnFound && typeof val == "function") {
          val = this.mv(val, ctx, partials);
        }
        return val;
      },
      ls: function(func, cx, ctx, partials, text, tags) {
        var oldTags = this.options.delimiters;
        this.options.delimiters = tags;
        this.b(this.ct(coerceToString(func.call(cx, text, ctx)), cx, partials));
        this.options.delimiters = oldTags;
        return false;
      },
      ct: function(text, cx, partials) {
        if (this.options.disableLambda) {
          throw new Error("Lambda features disabled.");
        }
        return this.c.compile(text, this.options).render(cx, partials);
      },
      b: function(s) {
        this.buf += s;
      },
      fl: function() {
        var r = this.buf;
        this.buf = "";
        return r;
      },
      ms: function(func, ctx, partials, inverted, start, end, tags) {
        var textSource, cx = ctx[ctx.length - 1], result = func.call(cx);
        if (typeof result == "function") {
          if (inverted) {
            return true;
          } else {
            textSource = this.activeSub && this.subsText && this.subsText[this.activeSub] ? this.subsText[this.activeSub] : this.text;
            return this.ls(result, cx, ctx, partials, textSource.substring(start, end), tags);
          }
        }
        return result;
      },
      mv: function(func, ctx, partials) {
        var cx = ctx[ctx.length - 1];
        var result = func.call(cx);
        if (typeof result == "function") {
          return this.ct(coerceToString(result.call(cx)), cx, partials);
        }
        return result;
      },
      sub: function(name, context, partials, indent) {
        var f = this.subs[name];
        if (f) {
          this.activeSub = name;
          f(context, partials, this, indent);
          this.activeSub = false;
        }
      }
    };
    function findInScope(key2, scope, doModelGet) {
      var val;
      if (scope && typeof scope == "object") {
        if (scope[key2] !== undefined) {
          val = scope[key2];
        } else if (doModelGet && scope.get && typeof scope.get == "function") {
          val = scope.get(key2);
        }
      }
      return val;
    }
    function createSpecializedPartial(instance, subs, partials, stackSubs, stackPartials, stackText) {
      function PartialTemplate() {}
      PartialTemplate.prototype = instance;
      function Substitutions() {}
      Substitutions.prototype = instance.subs;
      var key2;
      var partial = new PartialTemplate;
      partial.subs = new Substitutions;
      partial.subsText = {};
      partial.buf = "";
      stackSubs = stackSubs || {};
      partial.stackSubs = stackSubs;
      partial.subsText = stackText;
      for (key2 in subs) {
        if (!stackSubs[key2])
          stackSubs[key2] = subs[key2];
      }
      for (key2 in stackSubs) {
        partial.subs[key2] = stackSubs[key2];
      }
      stackPartials = stackPartials || {};
      partial.stackPartials = stackPartials;
      for (key2 in partials) {
        if (!stackPartials[key2])
          stackPartials[key2] = partials[key2];
      }
      for (key2 in stackPartials) {
        partial.partials[key2] = stackPartials[key2];
      }
      return partial;
    }
    var rAmp = /&/g, rLt = /</g, rGt = />/g, rApos = /\'/g, rQuot = /\"/g, hChars = /[&<>\"\']/;
    function coerceToString(val) {
      return String(val === null || val === undefined ? "" : val);
    }
    function hoganEscape(str) {
      str = coerceToString(str);
      return hChars.test(str) ? str.replace(rAmp, "&amp;").replace(rLt, "&lt;").replace(rGt, "&gt;").replace(rApos, "&#39;").replace(rQuot, "&quot;") : str;
    }
    var isArray = Array.isArray || function(a) {
      return Object.prototype.toString.call(a) === "[object Array]";
    };
  })(typeof exports !== "undefined" ? exports : Hogan2);
});

// ../../node_modules/.bun/@profoundlogic+hogan@3.0.4/node_modules/@profoundlogic/hogan/lib/hogan.js
var require_hogan = __commonJS(function(exports, module) {
  var Hogan2 = require_compiler();
  Hogan2.Template = require_template().Template;
  Hogan2.template = Hogan2.Template;
  module.exports = Hogan2;
});

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/types.js
var LineType;
(function(LineType) {
  LineType["INSERT"] = "insert";
  LineType["DELETE"] = "delete";
  LineType["CONTEXT"] = "context";
})(LineType || (LineType = {}));
var OutputFormatType = {
  LINE_BY_LINE: "line-by-line",
  SIDE_BY_SIDE: "side-by-side"
};
var LineMatchingType = {
  LINES: "lines",
  WORDS: "words",
  NONE: "none"
};
var DiffStyleType = {
  WORD: "word",
  CHAR: "char"
};
var ColorSchemeType;
(function(ColorSchemeType) {
  ColorSchemeType["AUTO"] = "auto";
  ColorSchemeType["DARK"] = "dark";
  ColorSchemeType["LIGHT"] = "light";
})(ColorSchemeType || (ColorSchemeType = {}));

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/utils.js
var specials = [
  "-",
  "[",
  "]",
  "/",
  "{",
  "}",
  "(",
  ")",
  "*",
  "+",
  "?",
  ".",
  "\\",
  "^",
  "$",
  "|"
];
var regex = RegExp("[" + specials.join("\\") + "]", "g");
function escapeForRegExp(str) {
  return str.replace(regex, "\\$&");
}
function unifyPath(path) {
  return path ? path.replace(/\\/g, "/") : path;
}
function hashCode(text) {
  let i, chr, len;
  let hash = 0;
  for (i = 0, len = text.length;i < len; i++) {
    chr = text.charCodeAt(i);
    hash = (hash << 5) - hash + chr;
    hash |= 0;
  }
  return hash;
}
function max(arr) {
  const length = arr.length;
  let max = -Infinity;
  for (let i = 0;i < length; i++) {
    max = Math.max(max, arr[i]);
  }
  return max;
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/diff-parser.js
function getExtension(filename, language) {
  const filenameParts = filename.split(".");
  return filenameParts.length > 1 ? filenameParts[filenameParts.length - 1] : language;
}
function startsWithAny(str, prefixes) {
  return prefixes.reduce((startsWith, prefix) => startsWith || str.startsWith(prefix), false);
}
var baseDiffFilenamePrefixes = ["a/", "b/", "i/", "w/", "c/", "o/"];
function getFilename(line, linePrefix, extraPrefix) {
  const prefixes = extraPrefix !== undefined ? [...baseDiffFilenamePrefixes, extraPrefix] : baseDiffFilenamePrefixes;
  const FilenameRegExp = linePrefix ? new RegExp(`^${escapeForRegExp(linePrefix)} "?(.+?)"?$`) : new RegExp('^"?(.+?)"?$');
  const [, filename = ""] = FilenameRegExp.exec(line) || [];
  const matchingPrefix = prefixes.find((p) => filename.indexOf(p) === 0);
  const fnameWithoutPrefix = matchingPrefix ? filename.slice(matchingPrefix.length) : filename;
  return fnameWithoutPrefix.replace(/\s+\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}(?:\.\d+)? [+-]\d{4}.*$/, "");
}
function getSrcFilename(line, srcPrefix) {
  return getFilename(line, "---", srcPrefix);
}
function getDstFilename(line, dstPrefix) {
  return getFilename(line, "+++", dstPrefix);
}
function parse(diffInput, config = {}) {
  const files = [];
  let currentFile = null;
  let currentBlock = null;
  let oldLine = null;
  let oldLine2 = null;
  let newLine = null;
  let possibleOldName = null;
  let possibleNewName = null;
  const oldFileNameHeader = "--- ";
  const newFileNameHeader = "+++ ";
  const hunkHeaderPrefix = "@@";
  const oldMode = /^old mode (\d{6})/;
  const newMode = /^new mode (\d{6})/;
  const deletedFileMode = /^deleted file mode (\d{6})/;
  const newFileMode = /^new file mode (\d{6})/;
  const copyFrom = /^copy from "?(.+)"?/;
  const copyTo = /^copy to "?(.+)"?/;
  const renameFrom = /^rename from "?(.+)"?/;
  const renameTo = /^rename to "?(.+)"?/;
  const similarityIndex = /^similarity index (\d+)%/;
  const dissimilarityIndex = /^dissimilarity index (\d+)%/;
  const index = /^index ([\da-z]+)\.\.([\da-z]+)\s*(\d{6})?/;
  const binaryFiles = /^Binary files (.*) and (.*) differ/;
  const binaryDiff = /^GIT binary patch/;
  const combinedIndex = /^index ([\da-z]+),([\da-z]+)\.\.([\da-z]+)/;
  const combinedMode = /^mode (\d{6}),(\d{6})\.\.(\d{6})/;
  const combinedNewFile = /^new file mode (\d{6})/;
  const combinedDeletedFile = /^deleted file mode (\d{6}),(\d{6})/;
  const diffLines = diffInput.replace(/\\ No newline at end of file/g, "").replace(/\r\n?/g, `
`).split(`
`);
  function saveBlock() {
    if (currentBlock !== null && currentFile !== null) {
      currentFile.blocks.push(currentBlock);
      currentBlock = null;
    }
  }
  function saveFile() {
    if (currentFile !== null) {
      if (!currentFile.oldName && possibleOldName !== null) {
        currentFile.oldName = possibleOldName;
      }
      if (!currentFile.newName && possibleNewName !== null) {
        currentFile.newName = possibleNewName;
      }
      if (currentFile.newName) {
        files.push(currentFile);
        currentFile = null;
      }
    }
    possibleOldName = null;
    possibleNewName = null;
  }
  function startFile() {
    saveBlock();
    saveFile();
    currentFile = {
      blocks: [],
      deletedLines: 0,
      addedLines: 0
    };
  }
  function startBlock(line) {
    saveBlock();
    let values;
    if (currentFile !== null) {
      if (values = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@.*/.exec(line)) {
        currentFile.isCombined = false;
        oldLine = parseInt(values[1], 10);
        newLine = parseInt(values[2], 10);
      } else if (values = /^@@@ -(\d+)(?:,\d+)? -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@@.*/.exec(line)) {
        currentFile.isCombined = true;
        oldLine = parseInt(values[1], 10);
        oldLine2 = parseInt(values[2], 10);
        newLine = parseInt(values[3], 10);
      } else {
        if (line.startsWith(hunkHeaderPrefix)) {
          console.error("Failed to parse lines, starting in 0!");
        }
        oldLine = 0;
        newLine = 0;
        currentFile.isCombined = false;
      }
    }
    currentBlock = {
      lines: [],
      oldStartLine: oldLine,
      oldStartLine2: oldLine2,
      newStartLine: newLine,
      header: line
    };
  }
  function createLine(line) {
    if (currentFile === null || currentBlock === null || oldLine === null || newLine === null)
      return;
    const currentLine = {
      content: line
    };
    const addedPrefixes = currentFile.isCombined ? ["+ ", " +", "++"] : ["+"];
    const deletedPrefixes = currentFile.isCombined ? ["- ", " -", "--"] : ["-"];
    if (startsWithAny(line, addedPrefixes)) {
      currentFile.addedLines++;
      currentLine.type = LineType.INSERT;
      currentLine.oldNumber = undefined;
      currentLine.newNumber = newLine++;
    } else if (startsWithAny(line, deletedPrefixes)) {
      currentFile.deletedLines++;
      currentLine.type = LineType.DELETE;
      currentLine.oldNumber = oldLine++;
      currentLine.newNumber = undefined;
    } else {
      currentLine.type = LineType.CONTEXT;
      currentLine.oldNumber = oldLine++;
      currentLine.newNumber = newLine++;
    }
    currentBlock.lines.push(currentLine);
  }
  function existHunkHeader(line, lineIdx) {
    let idx = lineIdx;
    while (idx < diffLines.length - 3) {
      if (line.startsWith("diff")) {
        return false;
      }
      if (diffLines[idx].startsWith(oldFileNameHeader) && diffLines[idx + 1].startsWith(newFileNameHeader) && diffLines[idx + 2].startsWith(hunkHeaderPrefix)) {
        return true;
      }
      idx++;
    }
    return false;
  }
  diffLines.forEach((line, lineIndex) => {
    if (!line || line.startsWith("*")) {
      return;
    }
    let values;
    const prevLine = diffLines[lineIndex - 1];
    const nxtLine = diffLines[lineIndex + 1];
    const afterNxtLine = diffLines[lineIndex + 2];
    if (line.startsWith("diff --git") || line.startsWith("diff --combined")) {
      startFile();
      const gitDiffStart = /^diff --git "?([a-ciow]\/.+)"? "?([a-ciow]\/.+)"?/;
      if (values = gitDiffStart.exec(line)) {
        possibleOldName = getFilename(values[1], undefined, config.dstPrefix);
        possibleNewName = getFilename(values[2], undefined, config.srcPrefix);
      }
      if (currentFile === null) {
        throw new Error("Where is my file !!!");
      }
      currentFile.isGitDiff = true;
      return;
    }
    if (line.startsWith("Binary files") && !(currentFile === null || currentFile === undefined ? undefined : currentFile.isGitDiff)) {
      startFile();
      const unixDiffBinaryStart = /^Binary files "?([a-ciow]\/.+)"? and "?([a-ciow]\/.+)"? differ/;
      if (values = unixDiffBinaryStart.exec(line)) {
        possibleOldName = getFilename(values[1], undefined, config.dstPrefix);
        possibleNewName = getFilename(values[2], undefined, config.srcPrefix);
      }
      if (currentFile === null) {
        throw new Error("Where is my file !!!");
      }
      currentFile.isBinary = true;
      return;
    }
    if (!currentFile || !currentFile.isGitDiff && currentFile && line.startsWith(oldFileNameHeader) && nxtLine.startsWith(newFileNameHeader) && afterNxtLine.startsWith(hunkHeaderPrefix)) {
      startFile();
    }
    if (currentFile === null || currentFile === undefined ? undefined : currentFile.isTooBig) {
      return;
    }
    if (currentFile && (typeof config.diffMaxChanges === "number" && currentFile.addedLines + currentFile.deletedLines > config.diffMaxChanges || typeof config.diffMaxLineLength === "number" && line.length > config.diffMaxLineLength)) {
      currentFile.isTooBig = true;
      currentFile.addedLines = 0;
      currentFile.deletedLines = 0;
      currentFile.blocks = [];
      currentBlock = null;
      const message = typeof config.diffTooBigMessage === "function" ? config.diffTooBigMessage(files.length) : "Diff too big to be displayed";
      startBlock(message);
      return;
    }
    if (line.startsWith(oldFileNameHeader) && nxtLine.startsWith(newFileNameHeader) || line.startsWith(newFileNameHeader) && prevLine.startsWith(oldFileNameHeader)) {
      if (currentFile && !currentFile.oldName && line.startsWith("--- ") && (values = getSrcFilename(line, config.srcPrefix))) {
        currentFile.oldName = values;
        currentFile.language = getExtension(currentFile.oldName, currentFile.language);
        return;
      }
      if (currentFile && !currentFile.newName && line.startsWith("+++ ") && (values = getDstFilename(line, config.dstPrefix))) {
        currentFile.newName = values;
        currentFile.language = getExtension(currentFile.newName, currentFile.language);
        return;
      }
    }
    if (currentFile && (line.startsWith(hunkHeaderPrefix) || currentFile.isGitDiff && currentFile.oldName && currentFile.newName && !currentBlock)) {
      startBlock(line);
      return;
    }
    if (currentBlock && (line.startsWith("+") || line.startsWith("-") || line.startsWith(" "))) {
      createLine(line);
      return;
    }
    const doesNotExistHunkHeader = !existHunkHeader(line, lineIndex);
    if (currentFile === null) {
      throw new Error("Where is my file !!!");
    }
    if (values = oldMode.exec(line)) {
      currentFile.oldMode = values[1];
    } else if (values = newMode.exec(line)) {
      currentFile.newMode = values[1];
    } else if (values = deletedFileMode.exec(line)) {
      currentFile.deletedFileMode = values[1];
      currentFile.isDeleted = true;
    } else if (values = newFileMode.exec(line)) {
      currentFile.newFileMode = values[1];
      currentFile.isNew = true;
    } else if (values = copyFrom.exec(line)) {
      if (doesNotExistHunkHeader) {
        currentFile.oldName = values[1];
      }
      currentFile.isCopy = true;
    } else if (values = copyTo.exec(line)) {
      if (doesNotExistHunkHeader) {
        currentFile.newName = values[1];
      }
      currentFile.isCopy = true;
    } else if (values = renameFrom.exec(line)) {
      if (doesNotExistHunkHeader) {
        currentFile.oldName = values[1];
      }
      currentFile.isRename = true;
    } else if (values = renameTo.exec(line)) {
      if (doesNotExistHunkHeader) {
        currentFile.newName = values[1];
      }
      currentFile.isRename = true;
    } else if (values = binaryFiles.exec(line)) {
      currentFile.isBinary = true;
      currentFile.oldName = getFilename(values[1], undefined, config.srcPrefix);
      currentFile.newName = getFilename(values[2], undefined, config.dstPrefix);
      startBlock("Binary file");
    } else if (binaryDiff.test(line)) {
      currentFile.isBinary = true;
      startBlock(line);
    } else if (values = similarityIndex.exec(line)) {
      currentFile.unchangedPercentage = parseInt(values[1], 10);
    } else if (values = dissimilarityIndex.exec(line)) {
      currentFile.changedPercentage = parseInt(values[1], 10);
    } else if (values = index.exec(line)) {
      currentFile.checksumBefore = values[1];
      currentFile.checksumAfter = values[2];
      if (values[3])
        currentFile.mode = values[3];
    } else if (values = combinedIndex.exec(line)) {
      currentFile.checksumBefore = [values[2], values[3]];
      currentFile.checksumAfter = values[1];
    } else if (values = combinedMode.exec(line)) {
      currentFile.oldMode = [values[2], values[3]];
      currentFile.newMode = values[1];
    } else if (values = combinedNewFile.exec(line)) {
      currentFile.newFileMode = values[1];
      currentFile.isNew = true;
    } else if (values = combinedDeletedFile.exec(line)) {
      currentFile.deletedFileMode = values[1];
      currentFile.isDeleted = true;
    }
  });
  saveBlock();
  saveFile();
  return files;
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/base.js
class Diff {
  diff(oldStr, newStr, options = {}) {
    let callback;
    if (typeof options === "function") {
      callback = options;
      options = {};
    } else if ("callback" in options) {
      callback = options.callback;
    }
    const oldString = this.castInput(oldStr, options);
    const newString = this.castInput(newStr, options);
    const oldTokens = this.removeEmpty(this.tokenize(oldString, options));
    const newTokens = this.removeEmpty(this.tokenize(newString, options));
    return this.diffWithOptionsObj(oldTokens, newTokens, options, callback);
  }
  diffWithOptionsObj(oldTokens, newTokens, options, callback) {
    var _a;
    const done = (value) => {
      value = this.postProcess(value, options);
      if (callback) {
        setTimeout(function() {
          callback(value);
        }, 0);
        return;
      } else {
        return value;
      }
    };
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let editLength = 1;
    let maxEditLength = newLen + oldLen;
    if (options.maxEditLength != null) {
      maxEditLength = Math.min(maxEditLength, options.maxEditLength);
    }
    const maxExecutionTime = (_a = options.timeout) !== null && _a !== undefined ? _a : Infinity;
    const abortAfterTimestamp = Date.now() + maxExecutionTime;
    const bestPath = [{ oldPos: -1, lastComponent: undefined }];
    let newPos = this.extractCommon(bestPath[0], newTokens, oldTokens, 0, options);
    if (bestPath[0].oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
      return done(this.buildValues(bestPath[0].lastComponent, newTokens, oldTokens));
    }
    let minDiagonalToConsider = -Infinity, maxDiagonalToConsider = Infinity;
    const execEditLength = () => {
      for (let diagonalPath = Math.max(minDiagonalToConsider, -editLength);diagonalPath <= Math.min(maxDiagonalToConsider, editLength); diagonalPath += 2) {
        let basePath;
        const removePath = bestPath[diagonalPath - 1], addPath = bestPath[diagonalPath + 1];
        if (removePath) {
          bestPath[diagonalPath - 1] = undefined;
        }
        let canAdd = false;
        if (addPath) {
          const addPathNewPos = addPath.oldPos - diagonalPath;
          canAdd = addPath && 0 <= addPathNewPos && addPathNewPos < newLen;
        }
        const canRemove = removePath && removePath.oldPos + 1 < oldLen;
        if (!canAdd && !canRemove) {
          bestPath[diagonalPath] = undefined;
          continue;
        }
        if (!canRemove || canAdd && removePath.oldPos < addPath.oldPos) {
          basePath = this.addToPath(addPath, true, false, 0, options);
        } else {
          basePath = this.addToPath(removePath, false, true, 1, options);
        }
        newPos = this.extractCommon(basePath, newTokens, oldTokens, diagonalPath, options);
        if (basePath.oldPos + 1 >= oldLen && newPos + 1 >= newLen) {
          return done(this.buildValues(basePath.lastComponent, newTokens, oldTokens)) || true;
        } else {
          bestPath[diagonalPath] = basePath;
          if (basePath.oldPos + 1 >= oldLen) {
            maxDiagonalToConsider = Math.min(maxDiagonalToConsider, diagonalPath - 1);
          }
          if (newPos + 1 >= newLen) {
            minDiagonalToConsider = Math.max(minDiagonalToConsider, diagonalPath + 1);
          }
        }
      }
      editLength++;
    };
    if (callback) {
      (function exec() {
        setTimeout(function() {
          if (editLength > maxEditLength || Date.now() > abortAfterTimestamp) {
            return callback(undefined);
          }
          if (!execEditLength()) {
            exec();
          }
        }, 0);
      })();
    } else {
      while (editLength <= maxEditLength && Date.now() <= abortAfterTimestamp) {
        const ret = execEditLength();
        if (ret) {
          return ret;
        }
      }
    }
  }
  addToPath(path, added, removed, oldPosInc, options) {
    const last = path.lastComponent;
    if (last && !options.oneChangePerToken && last.added === added && last.removed === removed) {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: last.count + 1, added, removed, previousComponent: last.previousComponent }
      };
    } else {
      return {
        oldPos: path.oldPos + oldPosInc,
        lastComponent: { count: 1, added, removed, previousComponent: last }
      };
    }
  }
  extractCommon(basePath, newTokens, oldTokens, diagonalPath, options) {
    const newLen = newTokens.length, oldLen = oldTokens.length;
    let oldPos = basePath.oldPos, newPos = oldPos - diagonalPath, commonCount = 0;
    while (newPos + 1 < newLen && oldPos + 1 < oldLen && this.equals(oldTokens[oldPos + 1], newTokens[newPos + 1], options)) {
      newPos++;
      oldPos++;
      commonCount++;
      if (options.oneChangePerToken) {
        basePath.lastComponent = { count: 1, previousComponent: basePath.lastComponent, added: false, removed: false };
      }
    }
    if (commonCount && !options.oneChangePerToken) {
      basePath.lastComponent = { count: commonCount, previousComponent: basePath.lastComponent, added: false, removed: false };
    }
    basePath.oldPos = oldPos;
    return newPos;
  }
  equals(left, right, options) {
    if (options.comparator) {
      return options.comparator(left, right);
    } else {
      return left === right || !!options.ignoreCase && left.toLowerCase() === right.toLowerCase();
    }
  }
  removeEmpty(array) {
    const ret = [];
    for (let i = 0;i < array.length; i++) {
      if (array[i]) {
        ret.push(array[i]);
      }
    }
    return ret;
  }
  castInput(value, options) {
    return value;
  }
  tokenize(value, options) {
    return Array.from(value);
  }
  join(chars) {
    return chars.join("");
  }
  postProcess(changeObjects, options) {
    return changeObjects;
  }
  get useLongestToken() {
    return false;
  }
  buildValues(lastComponent, newTokens, oldTokens) {
    const components = [];
    let nextComponent;
    while (lastComponent) {
      components.push(lastComponent);
      nextComponent = lastComponent.previousComponent;
      delete lastComponent.previousComponent;
      lastComponent = nextComponent;
    }
    components.reverse();
    const componentLen = components.length;
    let componentPos = 0, newPos = 0, oldPos = 0;
    for (;componentPos < componentLen; componentPos++) {
      const component = components[componentPos];
      if (!component.removed) {
        if (!component.added && this.useLongestToken) {
          let value = newTokens.slice(newPos, newPos + component.count);
          value = value.map(function(value, i) {
            const oldValue = oldTokens[oldPos + i];
            return oldValue.length > value.length ? oldValue : value;
          });
          component.value = this.join(value);
        } else {
          component.value = this.join(newTokens.slice(newPos, newPos + component.count));
        }
        newPos += component.count;
        if (!component.added) {
          oldPos += component.count;
        }
      } else {
        component.value = this.join(oldTokens.slice(oldPos, oldPos + component.count));
        oldPos += component.count;
      }
    }
    return components;
  }
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/character.js
class CharacterDiff extends Diff {
}
var characterDiff = new CharacterDiff;
function diffChars(oldStr, newStr, options) {
  return characterDiff.diff(oldStr, newStr, options);
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/util/string.js
function longestCommonPrefix(str1, str2) {
  let i;
  for (i = 0;i < str1.length && i < str2.length; i++) {
    if (str1[i] != str2[i]) {
      return str1.slice(0, i);
    }
  }
  return str1.slice(0, i);
}
function longestCommonSuffix(str1, str2) {
  let i;
  if (!str1 || !str2 || str1[str1.length - 1] != str2[str2.length - 1]) {
    return "";
  }
  for (i = 0;i < str1.length && i < str2.length; i++) {
    if (str1[str1.length - (i + 1)] != str2[str2.length - (i + 1)]) {
      return str1.slice(-i);
    }
  }
  return str1.slice(-i);
}
function replacePrefix(string, oldPrefix, newPrefix) {
  if (string.slice(0, oldPrefix.length) != oldPrefix) {
    throw Error(`string ${JSON.stringify(string)} doesn't start with prefix ${JSON.stringify(oldPrefix)}; this is a bug`);
  }
  return newPrefix + string.slice(oldPrefix.length);
}
function replaceSuffix(string, oldSuffix, newSuffix) {
  if (!oldSuffix) {
    return string + newSuffix;
  }
  if (string.slice(-oldSuffix.length) != oldSuffix) {
    throw Error(`string ${JSON.stringify(string)} doesn't end with suffix ${JSON.stringify(oldSuffix)}; this is a bug`);
  }
  return string.slice(0, -oldSuffix.length) + newSuffix;
}
function removePrefix(string, oldPrefix) {
  return replacePrefix(string, oldPrefix, "");
}
function removeSuffix(string, oldSuffix) {
  return replaceSuffix(string, oldSuffix, "");
}
function maximumOverlap(string1, string2) {
  return string2.slice(0, overlapCount(string1, string2));
}
function overlapCount(a, b) {
  let startA = 0;
  if (a.length > b.length) {
    startA = a.length - b.length;
  }
  let endB = b.length;
  if (a.length < b.length) {
    endB = a.length;
  }
  const map = Array(endB);
  let k = 0;
  map[0] = 0;
  for (let j = 1;j < endB; j++) {
    if (b[j] == b[k]) {
      map[j] = map[k];
    } else {
      map[j] = k;
    }
    while (k > 0 && b[j] != b[k]) {
      k = map[k];
    }
    if (b[j] == b[k]) {
      k++;
    }
  }
  k = 0;
  for (let i = startA;i < a.length; i++) {
    while (k > 0 && a[i] != b[k]) {
      k = map[k];
    }
    if (a[i] == b[k]) {
      k++;
    }
  }
  return k;
}
function segment(string, segmenter) {
  const parts = [];
  for (const segmentObj of Array.from(segmenter.segment(string))) {
    const segment = segmentObj.segment;
    if (parts.length && /\s/.test(parts[parts.length - 1]) && /\s/.test(segment)) {
      parts[parts.length - 1] += segment;
    } else {
      parts.push(segment);
    }
  }
  return parts;
}
function trailingWs(string, segmenter) {
  if (segmenter) {
    return leadingAndTrailingWs(string, segmenter)[1];
  }
  let i;
  for (i = string.length - 1;i >= 0; i--) {
    if (!string[i].match(/\s/)) {
      break;
    }
  }
  return string.substring(i + 1);
}
function leadingWs(string, segmenter) {
  if (segmenter) {
    return leadingAndTrailingWs(string, segmenter)[0];
  }
  const match = string.match(/^\s*/);
  return match ? match[0] : "";
}
function leadingAndTrailingWs(string, segmenter) {
  if (!segmenter) {
    return [leadingWs(string), trailingWs(string)];
  }
  if (segmenter.resolvedOptions().granularity != "word") {
    throw new Error('The segmenter passed must have a granularity of "word"');
  }
  const segments = segment(string, segmenter);
  const firstSeg = segments[0];
  const lastSeg = segments[segments.length - 1];
  const head = /\s/.test(firstSeg) ? firstSeg : "";
  const tail = /\s/.test(lastSeg) ? lastSeg : "";
  return [head, tail];
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/word.js
var extendedWordChars = "a-zA-Z0-9_\\u{AD}\\u{C0}-\\u{D6}\\u{D8}-\\u{F6}\\u{F8}-\\u{2C6}\\u{2C8}-\\u{2D7}\\u{2DE}-\\u{2FF}\\u{1E00}-\\u{1EFF}";
var tokenizeIncludingWhitespace = new RegExp(`[${extendedWordChars}]+|\\s+|[^${extendedWordChars}]`, "ug");

class WordDiff extends Diff {
  equals(left, right, options) {
    if (options.ignoreCase) {
      left = left.toLowerCase();
      right = right.toLowerCase();
    }
    return left.trim() === right.trim();
  }
  tokenize(value, options = {}) {
    let parts;
    if (options.intlSegmenter) {
      const segmenter = options.intlSegmenter;
      if (segmenter.resolvedOptions().granularity != "word") {
        throw new Error('The segmenter passed must have a granularity of "word"');
      }
      parts = segment(value, segmenter);
    } else {
      parts = value.match(tokenizeIncludingWhitespace) || [];
    }
    const tokens = [];
    let prevPart = null;
    parts.forEach((part) => {
      if (/\s/.test(part)) {
        if (prevPart == null) {
          tokens.push(part);
        } else {
          tokens.push(tokens.pop() + part);
        }
      } else if (prevPart != null && /\s/.test(prevPart)) {
        if (tokens[tokens.length - 1] == prevPart) {
          tokens.push(tokens.pop() + part);
        } else {
          tokens.push(prevPart + part);
        }
      } else {
        tokens.push(part);
      }
      prevPart = part;
    });
    return tokens;
  }
  join(tokens) {
    return tokens.map((token, i) => {
      if (i == 0) {
        return token;
      } else {
        return token.replace(/^\s+/, "");
      }
    }).join("");
  }
  postProcess(changes, options) {
    if (!changes || options.oneChangePerToken) {
      return changes;
    }
    let lastKeep = null;
    let insertion = null;
    let deletion = null;
    changes.forEach((change) => {
      if (change.added) {
        insertion = change;
      } else if (change.removed) {
        deletion = change;
      } else {
        if (insertion || deletion) {
          dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, change, options.intlSegmenter);
        }
        lastKeep = change;
        insertion = null;
        deletion = null;
      }
    });
    if (insertion || deletion) {
      dedupeWhitespaceInChangeObjects(lastKeep, deletion, insertion, null, options.intlSegmenter);
    }
    return changes;
  }
}
var wordDiff = new WordDiff;
function dedupeWhitespaceInChangeObjects(startKeep, deletion, insertion, endKeep, segmenter) {
  if (deletion && insertion) {
    const [oldWsPrefix, oldWsSuffix] = leadingAndTrailingWs(deletion.value, segmenter);
    const [newWsPrefix, newWsSuffix] = leadingAndTrailingWs(insertion.value, segmenter);
    if (startKeep) {
      const commonWsPrefix = longestCommonPrefix(oldWsPrefix, newWsPrefix);
      startKeep.value = replaceSuffix(startKeep.value, newWsPrefix, commonWsPrefix);
      deletion.value = removePrefix(deletion.value, commonWsPrefix);
      insertion.value = removePrefix(insertion.value, commonWsPrefix);
    }
    if (endKeep) {
      const commonWsSuffix = longestCommonSuffix(oldWsSuffix, newWsSuffix);
      endKeep.value = replacePrefix(endKeep.value, newWsSuffix, commonWsSuffix);
      deletion.value = removeSuffix(deletion.value, commonWsSuffix);
      insertion.value = removeSuffix(insertion.value, commonWsSuffix);
    }
  } else if (insertion) {
    if (startKeep) {
      const ws = leadingWs(insertion.value, segmenter);
      insertion.value = insertion.value.substring(ws.length);
    }
    if (endKeep) {
      const ws = leadingWs(endKeep.value, segmenter);
      endKeep.value = endKeep.value.substring(ws.length);
    }
  } else if (startKeep && endKeep) {
    const newWsFull = leadingWs(endKeep.value, segmenter), [delWsStart, delWsEnd] = leadingAndTrailingWs(deletion.value, segmenter);
    const newWsStart = longestCommonPrefix(newWsFull, delWsStart);
    deletion.value = removePrefix(deletion.value, newWsStart);
    const newWsEnd = longestCommonSuffix(removePrefix(newWsFull, newWsStart), delWsEnd);
    deletion.value = removeSuffix(deletion.value, newWsEnd);
    endKeep.value = replacePrefix(endKeep.value, newWsFull, newWsEnd);
    startKeep.value = replaceSuffix(startKeep.value, newWsFull, newWsFull.slice(0, newWsFull.length - newWsEnd.length));
  } else if (endKeep) {
    const endKeepWsPrefix = leadingWs(endKeep.value, segmenter);
    const deletionWsSuffix = trailingWs(deletion.value, segmenter);
    const overlap = maximumOverlap(deletionWsSuffix, endKeepWsPrefix);
    deletion.value = removeSuffix(deletion.value, overlap);
  } else if (startKeep) {
    const startKeepWsSuffix = trailingWs(startKeep.value, segmenter);
    const deletionWsPrefix = leadingWs(deletion.value, segmenter);
    const overlap = maximumOverlap(startKeepWsSuffix, deletionWsPrefix);
    deletion.value = removePrefix(deletion.value, overlap);
  }
}

class WordsWithSpaceDiff extends Diff {
  tokenize(value) {
    const regex = new RegExp(`(\\r?\\n)|[${extendedWordChars}]+|[^\\S\\n\\r]+|[^${extendedWordChars}]`, "ug");
    return value.match(regex) || [];
  }
}
var wordsWithSpaceDiff = new WordsWithSpaceDiff;
function diffWordsWithSpace(oldStr, newStr, options) {
  return wordsWithSpaceDiff.diff(oldStr, newStr, options);
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/line.js
class LineDiff extends Diff {
  constructor() {
    super(...arguments);
    this.tokenize = tokenize;
  }
  equals(left, right, options) {
    if (options.ignoreWhitespace) {
      if (!options.newlineIsToken || !left.includes(`
`)) {
        left = left.trim();
      }
      if (!options.newlineIsToken || !right.includes(`
`)) {
        right = right.trim();
      }
    } else if (options.ignoreNewlineAtEof && !options.newlineIsToken) {
      if (left.endsWith(`
`)) {
        left = left.slice(0, -1);
      }
      if (right.endsWith(`
`)) {
        right = right.slice(0, -1);
      }
    }
    return super.equals(left, right, options);
  }
}
var lineDiff = new LineDiff;
function tokenize(value, options) {
  if (options.stripTrailingCr) {
    value = value.replace(/\r\n/g, `
`);
  }
  const retLines = [], linesAndNewlines = value.split(/(\n|\r\n)/);
  if (!linesAndNewlines[linesAndNewlines.length - 1]) {
    linesAndNewlines.pop();
  }
  for (let i = 0;i < linesAndNewlines.length; i++) {
    const line = linesAndNewlines[i];
    if (i % 2 && !options.newlineIsToken) {
      retLines[retLines.length - 1] += line;
    } else {
      retLines.push(line);
    }
  }
  return retLines;
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/sentence.js
function isSentenceEndPunct(char) {
  return char == "." || char == "!" || char == "?";
}

class SentenceDiff extends Diff {
  tokenize(value) {
    var _a;
    const result = [];
    let tokenStartI = 0;
    for (let i = 0;i < value.length; i++) {
      if (i == value.length - 1) {
        result.push(value.slice(tokenStartI));
        break;
      }
      if (isSentenceEndPunct(value[i]) && value[i + 1].match(/\s/)) {
        result.push(value.slice(tokenStartI, i + 1));
        i = tokenStartI = i + 1;
        while ((_a = value[i + 1]) === null || _a === undefined ? undefined : _a.match(/\s/)) {
          i++;
        }
        result.push(value.slice(tokenStartI, i + 1));
        tokenStartI = i + 1;
      }
    }
    return result;
  }
}
var sentenceDiff = new SentenceDiff;

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/css.js
class CssDiff extends Diff {
  tokenize(value) {
    return value.split(/([{}:;,]|\s+)/);
  }
}
var cssDiff = new CssDiff;

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/json.js
class JsonDiff extends Diff {
  constructor() {
    super(...arguments);
    this.tokenize = tokenize;
  }
  get useLongestToken() {
    return true;
  }
  castInput(value, options) {
    const { undefinedReplacement, stringifyReplacer = (k, v) => typeof v === "undefined" ? undefinedReplacement : v } = options;
    return typeof value === "string" ? value : JSON.stringify(canonicalize(value, null, null, stringifyReplacer), null, "  ");
  }
  equals(left, right, options) {
    return super.equals(left.replace(/,([\r\n])/g, "$1"), right.replace(/,([\r\n])/g, "$1"), options);
  }
}
var jsonDiff = new JsonDiff;
function canonicalize(obj, stack, replacementStack, replacer, key2) {
  stack = stack || [];
  replacementStack = replacementStack || [];
  if (replacer) {
    obj = replacer(key2 === undefined ? "" : key2, obj);
  }
  let i;
  for (i = 0;i < stack.length; i += 1) {
    if (stack[i] === obj) {
      return replacementStack[i];
    }
  }
  let canonicalizedObj;
  if (Object.prototype.toString.call(obj) === "[object Array]") {
    stack.push(obj);
    canonicalizedObj = new Array(obj.length);
    replacementStack.push(canonicalizedObj);
    for (i = 0;i < obj.length; i += 1) {
      canonicalizedObj[i] = canonicalize(obj[i], stack, replacementStack, replacer, String(i));
    }
    stack.pop();
    replacementStack.pop();
    return canonicalizedObj;
  }
  if (obj && obj.toJSON) {
    obj = obj.toJSON();
  }
  if (typeof obj === "object" && obj !== null) {
    stack.push(obj);
    canonicalizedObj = {};
    replacementStack.push(canonicalizedObj);
    const sortedKeys = [];
    let key2;
    for (key2 in obj) {
      if (Object.prototype.hasOwnProperty.call(obj, key2)) {
        sortedKeys.push(key2);
      }
    }
    sortedKeys.sort();
    for (i = 0;i < sortedKeys.length; i += 1) {
      key2 = sortedKeys[i];
      canonicalizedObj[key2] = canonicalize(obj[key2], stack, replacementStack, replacer, key2);
    }
    stack.pop();
    replacementStack.pop();
  } else {
    canonicalizedObj = obj;
  }
  return canonicalizedObj;
}

// ../../node_modules/.bun/diff@8.0.4/node_modules/diff/libesm/diff/array.js
class ArrayDiff extends Diff {
  tokenize(value) {
    return value.slice();
  }
  join(value) {
    return value;
  }
  removeEmpty(value) {
    return value;
  }
}
var arrayDiff = new ArrayDiff;

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/rematch.js
function levenshtein(a, b) {
  if (a.length === 0) {
    return b.length;
  }
  if (b.length === 0) {
    return a.length;
  }
  const matrix = [];
  let i;
  for (i = 0;i <= b.length; i++) {
    matrix[i] = [i];
  }
  let j;
  for (j = 0;j <= a.length; j++) {
    matrix[0][j] = j;
  }
  for (i = 1;i <= b.length; i++) {
    for (j = 1;j <= a.length; j++) {
      if (b.charAt(i - 1) === a.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1];
      } else {
        matrix[i][j] = Math.min(matrix[i - 1][j - 1] + 1, Math.min(matrix[i][j - 1] + 1, matrix[i - 1][j] + 1));
      }
    }
  }
  return matrix[b.length][a.length];
}
function newDistanceFn(str) {
  return (x, y) => {
    const xValue = str(x).trim();
    const yValue = str(y).trim();
    const lev = levenshtein(xValue, yValue);
    return lev / (xValue.length + yValue.length);
  };
}
function newMatcherFn(distance) {
  function findBestMatch(a, b, cache = new Map) {
    let bestMatchDist = Infinity;
    let bestMatch;
    for (let i = 0;i < a.length; ++i) {
      for (let j = 0;j < b.length; ++j) {
        const cacheKey = JSON.stringify([a[i], b[j]]);
        let md;
        if (!(cache.has(cacheKey) && (md = cache.get(cacheKey)))) {
          md = distance(a[i], b[j]);
          cache.set(cacheKey, md);
        }
        if (md < bestMatchDist) {
          bestMatchDist = md;
          bestMatch = { indexA: i, indexB: j, score: bestMatchDist };
        }
      }
    }
    return bestMatch;
  }
  function group(a, b, level = 0, cache = new Map) {
    const bm = findBestMatch(a, b, cache);
    if (!bm || a.length + b.length < 3) {
      return [[a, b]];
    }
    const a1 = a.slice(0, bm.indexA);
    const b1 = b.slice(0, bm.indexB);
    const aMatch = [a[bm.indexA]];
    const bMatch = [b[bm.indexB]];
    const tailA = bm.indexA + 1;
    const tailB = bm.indexB + 1;
    const a2 = a.slice(tailA);
    const b2 = b.slice(tailB);
    const group1 = group(a1, b1, level + 1, cache);
    const groupMatch = group(aMatch, bMatch, level + 1, cache);
    const group2 = group(a2, b2, level + 1, cache);
    let result = groupMatch;
    if (bm.indexA > 0 || bm.indexB > 0) {
      result = group1.concat(result);
    }
    if (a.length > tailA || b.length > tailB) {
      result = result.concat(group2);
    }
    return result;
  }
  return group;
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/render-utils.js
var CSSLineClass = {
  INSERTS: "d2h-ins",
  DELETES: "d2h-del",
  CONTEXT: "d2h-cntx",
  INFO: "d2h-info",
  INSERT_CHANGES: "d2h-ins d2h-change",
  DELETE_CHANGES: "d2h-del d2h-change"
};
var defaultRenderConfig = {
  matching: LineMatchingType.NONE,
  matchWordsThreshold: 0.25,
  maxLineLengthHighlight: 1e4,
  diffStyle: DiffStyleType.WORD,
  colorScheme: ColorSchemeType.LIGHT
};
var separator = "/";
var distance = newDistanceFn((change) => change.value);
var matcher = newMatcherFn(distance);
function isDevNullName(name) {
  return name.indexOf("dev/null") !== -1;
}
function removeInsElements(line) {
  return line.replace(/(<ins[^>]*>((.|\n)*?)<\/ins>)/g, "");
}
function removeDelElements(line) {
  return line.replace(/(<del[^>]*>((.|\n)*?)<\/del>)/g, "");
}
function toCSSClass(lineType) {
  switch (lineType) {
    case LineType.CONTEXT:
      return CSSLineClass.CONTEXT;
    case LineType.INSERT:
      return CSSLineClass.INSERTS;
    case LineType.DELETE:
      return CSSLineClass.DELETES;
  }
}
function colorSchemeToCss(colorScheme) {
  switch (colorScheme) {
    case ColorSchemeType.DARK:
      return "d2h-dark-color-scheme";
    case ColorSchemeType.AUTO:
      return "d2h-auto-color-scheme";
    case ColorSchemeType.LIGHT:
    default:
      return "d2h-light-color-scheme";
  }
}
function prefixLength(isCombined) {
  return isCombined ? 2 : 1;
}
function escapeForHtml(str) {
  return str.slice(0).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#x27;").replace(/\//g, "&#x2F;");
}
function deconstructLine(line, isCombined, escape = true) {
  const indexToSplit = prefixLength(isCombined);
  return {
    prefix: line.substring(0, indexToSplit),
    content: escape ? escapeForHtml(line.substring(indexToSplit)) : line.substring(indexToSplit)
  };
}
function filenameDiff(file) {
  const oldFilename = unifyPath(file.oldName);
  const newFilename = unifyPath(file.newName);
  if (oldFilename !== newFilename && !isDevNullName(oldFilename) && !isDevNullName(newFilename)) {
    const prefixPaths = [];
    const suffixPaths = [];
    const oldFilenameParts = oldFilename.split(separator);
    const newFilenameParts = newFilename.split(separator);
    const oldFilenamePartsSize = oldFilenameParts.length;
    const newFilenamePartsSize = newFilenameParts.length;
    let i = 0;
    let j = oldFilenamePartsSize - 1;
    let k = newFilenamePartsSize - 1;
    while (i < j && i < k) {
      if (oldFilenameParts[i] === newFilenameParts[i]) {
        prefixPaths.push(newFilenameParts[i]);
        i += 1;
      } else {
        break;
      }
    }
    while (j > i && k > i) {
      if (oldFilenameParts[j] === newFilenameParts[k]) {
        suffixPaths.unshift(newFilenameParts[k]);
        j -= 1;
        k -= 1;
      } else {
        break;
      }
    }
    const finalPrefix = prefixPaths.join(separator);
    const finalSuffix = suffixPaths.join(separator);
    const oldRemainingPath = oldFilenameParts.slice(i, j + 1).join(separator);
    const newRemainingPath = newFilenameParts.slice(i, k + 1).join(separator);
    if (finalPrefix.length && finalSuffix.length) {
      return finalPrefix + separator + "{" + oldRemainingPath + " → " + newRemainingPath + "}" + separator + finalSuffix;
    } else if (finalPrefix.length) {
      return finalPrefix + separator + "{" + oldRemainingPath + " → " + newRemainingPath + "}";
    } else if (finalSuffix.length) {
      return "{" + oldRemainingPath + " → " + newRemainingPath + "}" + separator + finalSuffix;
    }
    return oldFilename + " → " + newFilename;
  } else if (!isDevNullName(newFilename)) {
    return newFilename;
  } else {
    return oldFilename;
  }
}
function getHtmlId(file) {
  return `d2h-${hashCode(filenameDiff(file)).toString().slice(-6)}`;
}
function getFileIcon(file) {
  let templateName = "file-changed";
  if (file.isRename) {
    templateName = "file-renamed";
  } else if (file.isCopy) {
    templateName = "file-renamed";
  } else if (file.isNew) {
    templateName = "file-added";
  } else if (file.isDeleted) {
    templateName = "file-deleted";
  } else if (file.newName !== file.oldName) {
    templateName = "file-renamed";
  }
  return templateName;
}
function diffHighlight(diffLine1, diffLine2, isCombined, config = {}) {
  const { matching, maxLineLengthHighlight, matchWordsThreshold, diffStyle } = Object.assign(Object.assign({}, defaultRenderConfig), config);
  const line1 = deconstructLine(diffLine1, isCombined, false);
  const line2 = deconstructLine(diffLine2, isCombined, false);
  if (line1.content.length > maxLineLengthHighlight || line2.content.length > maxLineLengthHighlight) {
    return {
      oldLine: {
        prefix: line1.prefix,
        content: escapeForHtml(line1.content)
      },
      newLine: {
        prefix: line2.prefix,
        content: escapeForHtml(line2.content)
      }
    };
  }
  const diff = diffStyle === "char" ? diffChars(line1.content, line2.content) : diffWordsWithSpace(line1.content, line2.content);
  const changedWords = [];
  if (diffStyle === "word" && matching === "words") {
    const removed = diff.filter((element) => element.removed);
    const added = diff.filter((element) => element.added);
    const chunks = matcher(added, removed);
    chunks.forEach((chunk) => {
      if (chunk[0].length === 1 && chunk[1].length === 1) {
        const dist = distance(chunk[0][0], chunk[1][0]);
        if (dist < matchWordsThreshold) {
          changedWords.push(chunk[0][0]);
          changedWords.push(chunk[1][0]);
        }
      }
    });
  }
  const highlightedLine = diff.reduce((highlightedLine, part) => {
    const elemType = part.added ? "ins" : part.removed ? "del" : null;
    const addClass = changedWords.indexOf(part) > -1 ? ' class="d2h-change"' : "";
    const escapedValue = escapeForHtml(part.value);
    return elemType !== null ? `${highlightedLine}<${elemType}${addClass}>${escapedValue}</${elemType}>` : `${highlightedLine}${escapedValue}`;
  }, "");
  return {
    oldLine: {
      prefix: line1.prefix,
      content: removeInsElements(highlightedLine)
    },
    newLine: {
      prefix: line2.prefix,
      content: removeDelElements(highlightedLine)
    }
  };
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/file-list-renderer.js
var baseTemplatesPath = "file-summary";
var iconsBaseTemplatesPath = "icon";
var defaultFileListRendererConfig = {
  colorScheme: defaultRenderConfig.colorScheme
};

class FileListRenderer {
  constructor(hoganUtils, config = {}) {
    this.hoganUtils = hoganUtils;
    this.config = Object.assign(Object.assign({}, defaultFileListRendererConfig), config);
  }
  render(diffFiles) {
    const files = diffFiles.map((file) => this.hoganUtils.render(baseTemplatesPath, "line", {
      fileHtmlId: getHtmlId(file),
      oldName: file.oldName,
      newName: file.newName,
      fileName: filenameDiff(file),
      deletedLines: "-" + file.deletedLines,
      addedLines: "+" + file.addedLines
    }, {
      fileIcon: this.hoganUtils.template(iconsBaseTemplatesPath, getFileIcon(file))
    })).join(`
`);
    return this.hoganUtils.render(baseTemplatesPath, "wrapper", {
      colorScheme: colorSchemeToCss(this.config.colorScheme),
      filesNumber: diffFiles.length,
      files
    });
  }
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/line-by-line-renderer.js
var defaultLineByLineRendererConfig = Object.assign(Object.assign({}, defaultRenderConfig), { renderNothingWhenEmpty: false, matchingMaxComparisons: 2500, maxLineSizeInBlockForComparison: 200 });
var genericTemplatesPath = "generic";
var baseTemplatesPath2 = "line-by-line";
var iconsBaseTemplatesPath2 = "icon";
var tagsBaseTemplatesPath = "tag";

class LineByLineRenderer {
  constructor(hoganUtils, config = {}) {
    this.hoganUtils = hoganUtils;
    this.config = Object.assign(Object.assign({}, defaultLineByLineRendererConfig), config);
  }
  render(diffFiles) {
    const diffsHtml = diffFiles.map((file) => {
      let diffs;
      if (file.blocks.length) {
        diffs = this.generateFileHtml(file);
      } else {
        diffs = this.generateEmptyDiff();
      }
      return this.makeFileDiffHtml(file, diffs);
    }).join(`
`);
    return this.hoganUtils.render(genericTemplatesPath, "wrapper", {
      colorScheme: colorSchemeToCss(this.config.colorScheme),
      content: diffsHtml
    });
  }
  makeFileDiffHtml(file, diffs) {
    if (this.config.renderNothingWhenEmpty && Array.isArray(file.blocks) && file.blocks.length === 0)
      return "";
    const fileDiffTemplate = this.hoganUtils.template(baseTemplatesPath2, "file-diff");
    const filePathTemplate = this.hoganUtils.template(genericTemplatesPath, "file-path");
    const fileIconTemplate = this.hoganUtils.template(iconsBaseTemplatesPath2, "file");
    const fileTagTemplate = this.hoganUtils.template(tagsBaseTemplatesPath, getFileIcon(file));
    return fileDiffTemplate.render({
      file,
      fileHtmlId: getHtmlId(file),
      diffs,
      filePath: filePathTemplate.render({
        fileDiffName: filenameDiff(file)
      }, {
        fileIcon: fileIconTemplate,
        fileTag: fileTagTemplate
      })
    });
  }
  generateEmptyDiff() {
    return this.hoganUtils.render(genericTemplatesPath, "empty-diff", {
      contentClass: "d2h-code-line",
      CSSLineClass
    });
  }
  generateFileHtml(file) {
    const matcher = newMatcherFn(newDistanceFn((e) => deconstructLine(e.content, file.isCombined).content));
    return file.blocks.map((block) => {
      let lines = this.hoganUtils.render(genericTemplatesPath, "block-header", {
        CSSLineClass,
        blockHeader: file.isTooBig ? block.header : escapeForHtml(block.header),
        lineClass: "d2h-code-linenumber",
        contentClass: "d2h-code-line"
      });
      this.applyLineGroupping(block).forEach(([contextLines, oldLines, newLines]) => {
        if (oldLines.length && newLines.length && !contextLines.length) {
          this.applyRematchMatching(oldLines, newLines, matcher).map(([oldLines, newLines]) => {
            const { left, right } = this.processChangedLines(file, file.isCombined, oldLines, newLines);
            lines += left;
            lines += right;
          });
        } else if (contextLines.length) {
          contextLines.forEach((line) => {
            const { prefix, content } = deconstructLine(line.content, file.isCombined);
            lines += this.generateSingleLineHtml(file, {
              type: CSSLineClass.CONTEXT,
              prefix,
              content,
              oldNumber: line.oldNumber,
              newNumber: line.newNumber
            });
          });
        } else if (oldLines.length || newLines.length) {
          const { left, right } = this.processChangedLines(file, file.isCombined, oldLines, newLines);
          lines += left;
          lines += right;
        } else {
          console.error("Unknown state reached while processing groups of lines", contextLines, oldLines, newLines);
        }
      });
      return lines;
    }).join(`
`);
  }
  applyLineGroupping(block) {
    const blockLinesGroups = [];
    let oldLines = [];
    let newLines = [];
    for (let i = 0;i < block.lines.length; i++) {
      const diffLine = block.lines[i];
      if (diffLine.type !== LineType.INSERT && newLines.length || diffLine.type === LineType.CONTEXT && oldLines.length > 0) {
        blockLinesGroups.push([[], oldLines, newLines]);
        oldLines = [];
        newLines = [];
      }
      if (diffLine.type === LineType.CONTEXT) {
        blockLinesGroups.push([[diffLine], [], []]);
      } else if (diffLine.type === LineType.INSERT && oldLines.length === 0) {
        blockLinesGroups.push([[], [], [diffLine]]);
      } else if (diffLine.type === LineType.INSERT && oldLines.length > 0) {
        newLines.push(diffLine);
      } else if (diffLine.type === LineType.DELETE) {
        oldLines.push(diffLine);
      }
    }
    if (oldLines.length || newLines.length) {
      blockLinesGroups.push([[], oldLines, newLines]);
      oldLines = [];
      newLines = [];
    }
    return blockLinesGroups;
  }
  applyRematchMatching(oldLines, newLines, matcher) {
    const comparisons = oldLines.length * newLines.length;
    const maxLineSizeInBlock = max(oldLines.concat(newLines).map((elem) => elem.content.length));
    const doMatching = comparisons < this.config.matchingMaxComparisons && maxLineSizeInBlock < this.config.maxLineSizeInBlockForComparison && (this.config.matching === "lines" || this.config.matching === "words");
    return doMatching ? matcher(oldLines, newLines) : [[oldLines, newLines]];
  }
  processChangedLines(file, isCombined, oldLines, newLines) {
    const fileHtml = {
      right: "",
      left: ""
    };
    const maxLinesNumber = Math.max(oldLines.length, newLines.length);
    for (let i = 0;i < maxLinesNumber; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      const diff = oldLine !== undefined && newLine !== undefined ? diffHighlight(oldLine.content, newLine.content, isCombined, this.config) : undefined;
      const preparedOldLine = oldLine !== undefined && oldLine.oldNumber !== undefined ? Object.assign(Object.assign({}, diff !== undefined ? {
        prefix: diff.oldLine.prefix,
        content: diff.oldLine.content,
        type: CSSLineClass.DELETE_CHANGES
      } : Object.assign(Object.assign({}, deconstructLine(oldLine.content, isCombined)), { type: toCSSClass(oldLine.type) })), { oldNumber: oldLine.oldNumber, newNumber: oldLine.newNumber }) : undefined;
      const preparedNewLine = newLine !== undefined && newLine.newNumber !== undefined ? Object.assign(Object.assign({}, diff !== undefined ? {
        prefix: diff.newLine.prefix,
        content: diff.newLine.content,
        type: CSSLineClass.INSERT_CHANGES
      } : Object.assign(Object.assign({}, deconstructLine(newLine.content, isCombined)), { type: toCSSClass(newLine.type) })), { oldNumber: newLine.oldNumber, newNumber: newLine.newNumber }) : undefined;
      const { left, right } = this.generateLineHtml(file, preparedOldLine, preparedNewLine);
      fileHtml.left += left;
      fileHtml.right += right;
    }
    return fileHtml;
  }
  generateLineHtml(file, oldLine, newLine) {
    return {
      left: this.generateSingleLineHtml(file, oldLine),
      right: this.generateSingleLineHtml(file, newLine)
    };
  }
  generateSingleLineHtml(file, line) {
    if (line === undefined)
      return "";
    const lineNumberHtml = this.hoganUtils.render(baseTemplatesPath2, "numbers", {
      oldNumber: line.oldNumber || "",
      newNumber: line.newNumber || ""
    });
    return this.hoganUtils.render(genericTemplatesPath, "line", {
      type: line.type,
      lineClass: "d2h-code-linenumber",
      contentClass: "d2h-code-line",
      prefix: line.prefix === " " ? "&nbsp;" : line.prefix,
      content: line.content,
      lineNumber: lineNumberHtml,
      line,
      file
    });
  }
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/side-by-side-renderer.js
var defaultSideBySideRendererConfig = Object.assign(Object.assign({}, defaultRenderConfig), { renderNothingWhenEmpty: false, matchingMaxComparisons: 2500, maxLineSizeInBlockForComparison: 200 });
var genericTemplatesPath2 = "generic";
var baseTemplatesPath3 = "side-by-side";
var iconsBaseTemplatesPath3 = "icon";
var tagsBaseTemplatesPath2 = "tag";

class SideBySideRenderer {
  constructor(hoganUtils, config = {}) {
    this.hoganUtils = hoganUtils;
    this.config = Object.assign(Object.assign({}, defaultSideBySideRendererConfig), config);
  }
  render(diffFiles) {
    const diffsHtml = diffFiles.map((file) => {
      let diffs;
      if (file.blocks.length) {
        diffs = this.generateFileHtml(file);
      } else {
        diffs = this.generateEmptyDiff();
      }
      return this.makeFileDiffHtml(file, diffs);
    }).join(`
`);
    return this.hoganUtils.render(genericTemplatesPath2, "wrapper", {
      colorScheme: colorSchemeToCss(this.config.colorScheme),
      content: diffsHtml
    });
  }
  makeFileDiffHtml(file, diffs) {
    if (this.config.renderNothingWhenEmpty && Array.isArray(file.blocks) && file.blocks.length === 0)
      return "";
    const fileDiffTemplate = this.hoganUtils.template(baseTemplatesPath3, "file-diff");
    const filePathTemplate = this.hoganUtils.template(genericTemplatesPath2, "file-path");
    const fileIconTemplate = this.hoganUtils.template(iconsBaseTemplatesPath3, "file");
    const fileTagTemplate = this.hoganUtils.template(tagsBaseTemplatesPath2, getFileIcon(file));
    return fileDiffTemplate.render({
      file,
      fileHtmlId: getHtmlId(file),
      diffs,
      filePath: filePathTemplate.render({
        fileDiffName: filenameDiff(file)
      }, {
        fileIcon: fileIconTemplate,
        fileTag: fileTagTemplate
      })
    });
  }
  generateEmptyDiff() {
    return {
      right: "",
      left: this.hoganUtils.render(genericTemplatesPath2, "empty-diff", {
        contentClass: "d2h-code-side-line",
        CSSLineClass
      })
    };
  }
  generateFileHtml(file) {
    const matcher = newMatcherFn(newDistanceFn((e) => deconstructLine(e.content, file.isCombined).content));
    return file.blocks.map((block) => {
      const fileHtml = {
        left: this.makeHeaderHtml(block.header, file),
        right: this.makeHeaderHtml("")
      };
      this.applyLineGroupping(block).forEach(([contextLines, oldLines, newLines]) => {
        if (oldLines.length && newLines.length && !contextLines.length) {
          this.applyRematchMatching(oldLines, newLines, matcher).map(([oldLines, newLines]) => {
            const { left, right } = this.processChangedLines(file.isCombined, oldLines, newLines);
            fileHtml.left += left;
            fileHtml.right += right;
          });
        } else if (contextLines.length) {
          contextLines.forEach((line) => {
            const { prefix, content } = deconstructLine(line.content, file.isCombined);
            const { left, right } = this.generateLineHtml({
              type: CSSLineClass.CONTEXT,
              prefix,
              content,
              number: line.oldNumber
            }, {
              type: CSSLineClass.CONTEXT,
              prefix,
              content,
              number: line.newNumber
            });
            fileHtml.left += left;
            fileHtml.right += right;
          });
        } else if (oldLines.length || newLines.length) {
          const { left, right } = this.processChangedLines(file.isCombined, oldLines, newLines);
          fileHtml.left += left;
          fileHtml.right += right;
        } else {
          console.error("Unknown state reached while processing groups of lines", contextLines, oldLines, newLines);
        }
      });
      return fileHtml;
    }).reduce((accomulated, html) => {
      return { left: accomulated.left + html.left, right: accomulated.right + html.right };
    }, { left: "", right: "" });
  }
  applyLineGroupping(block) {
    const blockLinesGroups = [];
    let oldLines = [];
    let newLines = [];
    for (let i = 0;i < block.lines.length; i++) {
      const diffLine = block.lines[i];
      if (diffLine.type !== LineType.INSERT && newLines.length || diffLine.type === LineType.CONTEXT && oldLines.length > 0) {
        blockLinesGroups.push([[], oldLines, newLines]);
        oldLines = [];
        newLines = [];
      }
      if (diffLine.type === LineType.CONTEXT) {
        blockLinesGroups.push([[diffLine], [], []]);
      } else if (diffLine.type === LineType.INSERT && oldLines.length === 0) {
        blockLinesGroups.push([[], [], [diffLine]]);
      } else if (diffLine.type === LineType.INSERT && oldLines.length > 0) {
        newLines.push(diffLine);
      } else if (diffLine.type === LineType.DELETE) {
        oldLines.push(diffLine);
      }
    }
    if (oldLines.length || newLines.length) {
      blockLinesGroups.push([[], oldLines, newLines]);
      oldLines = [];
      newLines = [];
    }
    return blockLinesGroups;
  }
  applyRematchMatching(oldLines, newLines, matcher) {
    const comparisons = oldLines.length * newLines.length;
    const maxLineSizeInBlock = max(oldLines.concat(newLines).map((elem) => elem.content.length));
    const doMatching = comparisons < this.config.matchingMaxComparisons && maxLineSizeInBlock < this.config.maxLineSizeInBlockForComparison && (this.config.matching === "lines" || this.config.matching === "words");
    return doMatching ? matcher(oldLines, newLines) : [[oldLines, newLines]];
  }
  makeHeaderHtml(blockHeader, file) {
    return this.hoganUtils.render(genericTemplatesPath2, "block-header", {
      CSSLineClass,
      blockHeader: (file === null || file === undefined ? undefined : file.isTooBig) ? blockHeader : escapeForHtml(blockHeader),
      lineClass: "d2h-code-side-linenumber",
      contentClass: "d2h-code-side-line"
    });
  }
  processChangedLines(isCombined, oldLines, newLines) {
    const fileHtml = {
      right: "",
      left: ""
    };
    const maxLinesNumber = Math.max(oldLines.length, newLines.length);
    for (let i = 0;i < maxLinesNumber; i++) {
      const oldLine = oldLines[i];
      const newLine = newLines[i];
      const diff = oldLine !== undefined && newLine !== undefined ? diffHighlight(oldLine.content, newLine.content, isCombined, this.config) : undefined;
      const preparedOldLine = oldLine !== undefined && oldLine.oldNumber !== undefined ? Object.assign(Object.assign({}, diff !== undefined ? {
        prefix: diff.oldLine.prefix,
        content: diff.oldLine.content,
        type: CSSLineClass.DELETE_CHANGES
      } : Object.assign(Object.assign({}, deconstructLine(oldLine.content, isCombined)), { type: toCSSClass(oldLine.type) })), { number: oldLine.oldNumber }) : undefined;
      const preparedNewLine = newLine !== undefined && newLine.newNumber !== undefined ? Object.assign(Object.assign({}, diff !== undefined ? {
        prefix: diff.newLine.prefix,
        content: diff.newLine.content,
        type: CSSLineClass.INSERT_CHANGES
      } : Object.assign(Object.assign({}, deconstructLine(newLine.content, isCombined)), { type: toCSSClass(newLine.type) })), { number: newLine.newNumber }) : undefined;
      const { left, right } = this.generateLineHtml(preparedOldLine, preparedNewLine);
      fileHtml.left += left;
      fileHtml.right += right;
    }
    return fileHtml;
  }
  generateLineHtml(oldLine, newLine) {
    return {
      left: this.generateSingleHtml(oldLine),
      right: this.generateSingleHtml(newLine)
    };
  }
  generateSingleHtml(line) {
    const lineClass = "d2h-code-side-linenumber";
    const contentClass = "d2h-code-side-line";
    return this.hoganUtils.render(genericTemplatesPath2, "line", {
      type: (line === null || line === undefined ? undefined : line.type) || `${CSSLineClass.CONTEXT} d2h-emptyplaceholder`,
      lineClass: line !== undefined ? lineClass : `${lineClass} d2h-code-side-emptyplaceholder`,
      contentClass: line !== undefined ? contentClass : `${contentClass} d2h-code-side-emptyplaceholder`,
      prefix: (line === null || line === undefined ? undefined : line.prefix) === " " ? "&nbsp;" : line === null || line === undefined ? undefined : line.prefix,
      content: line === null || line === undefined ? undefined : line.content,
      lineNumber: line === null || line === undefined ? undefined : line.number
    });
  }
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/hoganjs-utils.js
var Hogan3 = __toESM(require_hogan());

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/diff2html-templates.js
var Hogan2 = __toESM(require_hogan());
var defaultTemplates = {};
defaultTemplates["file-summary-line"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<li class="d2h-file-list-line">');
  t.b(`
` + i);
  t.b('    <span class="d2h-file-name-wrapper">');
  t.b(`
` + i);
  t.b(t.rp("<fileIcon0", c, p, "      "));
  t.b('      <a href="#');
  t.b(t.v(t.f("fileHtmlId", c, p, 0)));
  t.b('" class="d2h-file-name">');
  t.b(t.v(t.f("fileName", c, p, 0)));
  t.b("</a>");
  t.b(`
` + i);
  t.b('      <span class="d2h-file-stats">');
  t.b(`
` + i);
  t.b('          <span class="d2h-lines-added">');
  t.b(t.v(t.f("addedLines", c, p, 0)));
  t.b("</span>");
  t.b(`
` + i);
  t.b('          <span class="d2h-lines-deleted">');
  t.b(t.v(t.f("deletedLines", c, p, 0)));
  t.b("</span>");
  t.b(`
` + i);
  t.b("      </span>");
  t.b(`
` + i);
  t.b("    </span>");
  t.b(`
` + i);
  t.b("</li>");
  return t.fl();
}, partials: { "<fileIcon0": { name: "fileIcon", partials: {}, subs: {} } }, subs: {} });
defaultTemplates["file-summary-wrapper"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<div class="d2h-file-list-wrapper ');
  t.b(t.v(t.f("colorScheme", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('    <div class="d2h-file-list-header">');
  t.b(`
` + i);
  t.b('        <span class="d2h-file-list-title">Files changed (');
  t.b(t.v(t.f("filesNumber", c, p, 0)));
  t.b(")</span>");
  t.b(`
` + i);
  t.b('        <a class="d2h-file-switch d2h-hide">hide</a>');
  t.b(`
` + i);
  t.b('        <a class="d2h-file-switch d2h-show">show</a>');
  t.b(`
` + i);
  t.b("    </div>");
  t.b(`
` + i);
  t.b('    <ol class="d2h-file-list">');
  t.b(`
` + i);
  t.b("    ");
  t.b(t.t(t.f("files", c, p, 0)));
  t.b(`
` + i);
  t.b("    </ol>");
  t.b(`
` + i);
  t.b("</div>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["generic-block-header"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b("<tr>");
  t.b(`
` + i);
  t.b('    <td class="');
  t.b(t.v(t.f("lineClass", c, p, 0)));
  t.b(" ");
  t.b(t.v(t.d("CSSLineClass.INFO", c, p, 0)));
  t.b('"></td>');
  t.b(`
` + i);
  t.b('    <td class="');
  t.b(t.v(t.d("CSSLineClass.INFO", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('        <div class="');
  t.b(t.v(t.f("contentClass", c, p, 0)));
  t.b('">');
  if (t.s(t.f("blockHeader", c, p, 1), c, p, 0, 156, 173, "{{ }}")) {
    t.rs(c, p, function(c, p, t) {
      t.b(t.t(t.f("blockHeader", c, p, 0)));
    });
    c.pop();
  }
  if (!t.s(t.f("blockHeader", c, p, 1), c, p, 1, 0, 0, "")) {
    t.b("&nbsp;");
  }
  t.b("</div>");
  t.b(`
` + i);
  t.b("    </td>");
  t.b(`
` + i);
  t.b("</tr>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["generic-empty-diff"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b("<tr>");
  t.b(`
` + i);
  t.b('    <td class="');
  t.b(t.v(t.d("CSSLineClass.INFO", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('        <div class="');
  t.b(t.v(t.f("contentClass", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b("            File without changes");
  t.b(`
` + i);
  t.b("        </div>");
  t.b(`
` + i);
  t.b("    </td>");
  t.b(`
` + i);
  t.b("</tr>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["generic-file-path"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<span class="d2h-file-name-wrapper">');
  t.b(`
` + i);
  t.b(t.rp("<fileIcon0", c, p, "    "));
  t.b('    <span class="d2h-file-name">');
  t.b(t.v(t.f("fileDiffName", c, p, 0)));
  t.b("</span>");
  t.b(`
` + i);
  t.b(t.rp("<fileTag1", c, p, "    "));
  t.b("</span>");
  t.b(`
` + i);
  t.b('<label class="d2h-file-collapse">');
  t.b(`
` + i);
  t.b('    <input class="d2h-file-collapse-input" type="checkbox" name="viewed" value="viewed">');
  t.b(`
` + i);
  t.b("    Viewed");
  t.b(`
` + i);
  t.b("</label>");
  return t.fl();
}, partials: { "<fileIcon0": { name: "fileIcon", partials: {}, subs: {} }, "<fileTag1": { name: "fileTag", partials: {}, subs: {} } }, subs: {} });
defaultTemplates["generic-line"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b("<tr>");
  t.b(`
` + i);
  t.b('    <td class="');
  t.b(t.v(t.f("lineClass", c, p, 0)));
  t.b(" ");
  t.b(t.v(t.f("type", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b("      ");
  t.b(t.t(t.f("lineNumber", c, p, 0)));
  t.b(`
` + i);
  t.b("    </td>");
  t.b(`
` + i);
  t.b('    <td class="');
  t.b(t.v(t.f("type", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('        <div class="');
  t.b(t.v(t.f("contentClass", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  if (t.s(t.f("prefix", c, p, 1), c, p, 0, 162, 238, "{{ }}")) {
    t.rs(c, p, function(c, p, t) {
      t.b('            <span class="d2h-code-line-prefix">');
      t.b(t.t(t.f("prefix", c, p, 0)));
      t.b("</span>");
      t.b(`
` + i);
    });
    c.pop();
  }
  if (!t.s(t.f("prefix", c, p, 1), c, p, 1, 0, 0, "")) {
    t.b('            <span class="d2h-code-line-prefix">&nbsp;</span>');
    t.b(`
` + i);
  }
  if (t.s(t.f("content", c, p, 1), c, p, 0, 371, 445, "{{ }}")) {
    t.rs(c, p, function(c, p, t) {
      t.b('            <span class="d2h-code-line-ctn">');
      t.b(t.t(t.f("content", c, p, 0)));
      t.b("</span>");
      t.b(`
` + i);
    });
    c.pop();
  }
  if (!t.s(t.f("content", c, p, 1), c, p, 1, 0, 0, "")) {
    t.b('            <span class="d2h-code-line-ctn"><br></span>');
    t.b(`
` + i);
  }
  t.b("        </div>");
  t.b(`
` + i);
  t.b("    </td>");
  t.b(`
` + i);
  t.b("</tr>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["generic-wrapper"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<div class="d2h-wrapper ');
  t.b(t.v(t.f("colorScheme", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b("    ");
  t.b(t.t(t.f("content", c, p, 0)));
  t.b(`
` + i);
  t.b("</div>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["icon-file-added"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<svg aria-hidden="true" class="d2h-icon d2h-added" height="16" title="added" version="1.1" viewBox="0 0 14 16"');
  t.b(`
` + i);
  t.b('     width="14">');
  t.b(`
` + i);
  t.b('    <path d="M13 1H1C0.45 1 0 1.45 0 2v12c0 0.55 0.45 1 1 1h12c0.55 0 1-0.45 1-1V2c0-0.55-0.45-1-1-1z m0 13H1V2h12v12zM6 9H3V7h3V4h2v3h3v2H8v3H6V9z"></path>');
  t.b(`
` + i);
  t.b("</svg>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["icon-file-changed"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<svg aria-hidden="true" class="d2h-icon d2h-changed" height="16" title="modified" version="1.1"');
  t.b(`
` + i);
  t.b('     viewBox="0 0 14 16" width="14">');
  t.b(`
` + i);
  t.b('    <path d="M13 1H1C0.45 1 0 1.45 0 2v12c0 0.55 0.45 1 1 1h12c0.55 0 1-0.45 1-1V2c0-0.55-0.45-1-1-1z m0 13H1V2h12v12zM4 8c0-1.66 1.34-3 3-3s3 1.34 3 3-1.34 3-3 3-3-1.34-3-3z"></path>');
  t.b(`
` + i);
  t.b("</svg>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["icon-file-deleted"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<svg aria-hidden="true" class="d2h-icon d2h-deleted" height="16" title="removed" version="1.1"');
  t.b(`
` + i);
  t.b('     viewBox="0 0 14 16" width="14">');
  t.b(`
` + i);
  t.b('    <path d="M13 1H1C0.45 1 0 1.45 0 2v12c0 0.55 0.45 1 1 1h12c0.55 0 1-0.45 1-1V2c0-0.55-0.45-1-1-1z m0 13H1V2h12v12zM11 9H3V7h8v2z"></path>');
  t.b(`
` + i);
  t.b("</svg>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["icon-file-renamed"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<svg aria-hidden="true" class="d2h-icon d2h-moved" height="16" title="renamed" version="1.1"');
  t.b(`
` + i);
  t.b('     viewBox="0 0 14 16" width="14">');
  t.b(`
` + i);
  t.b('    <path d="M6 9H3V7h3V4l5 4-5 4V9z m8-7v12c0 0.55-0.45 1-1 1H1c-0.55 0-1-0.45-1-1V2c0-0.55 0.45-1 1-1h12c0.55 0 1 0.45 1 1z m-1 0H1v12h12V2z"></path>');
  t.b(`
` + i);
  t.b("</svg>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["icon-file"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<svg aria-hidden="true" class="d2h-icon" height="16" version="1.1" viewBox="0 0 12 16" width="12">');
  t.b(`
` + i);
  t.b('    <path d="M6 5H2v-1h4v1zM2 8h7v-1H2v1z m0 2h7v-1H2v1z m0 2h7v-1H2v1z m10-7.5v9.5c0 0.55-0.45 1-1 1H1c-0.55 0-1-0.45-1-1V2c0-0.55 0.45-1 1-1h7.5l3.5 3.5z m-1 0.5L8 2H1v12h10V5z"></path>');
  t.b(`
` + i);
  t.b("</svg>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["line-by-line-file-diff"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<div id="');
  t.b(t.v(t.f("fileHtmlId", c, p, 0)));
  t.b('" class="d2h-file-wrapper" data-lang="');
  t.b(t.v(t.d("file.language", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('    <div class="d2h-file-header">');
  t.b(`
` + i);
  t.b("    ");
  t.b(t.t(t.f("filePath", c, p, 0)));
  t.b(`
` + i);
  t.b("    </div>");
  t.b(`
` + i);
  t.b('    <div class="d2h-file-diff">');
  t.b(`
` + i);
  t.b('        <div class="d2h-code-wrapper">');
  t.b(`
` + i);
  t.b('            <table class="d2h-diff-table">');
  t.b(`
` + i);
  t.b('                <tbody class="d2h-diff-tbody">');
  t.b(`
` + i);
  t.b("                ");
  t.b(t.t(t.f("diffs", c, p, 0)));
  t.b(`
` + i);
  t.b("                </tbody>");
  t.b(`
` + i);
  t.b("            </table>");
  t.b(`
` + i);
  t.b("        </div>");
  t.b(`
` + i);
  t.b("    </div>");
  t.b(`
` + i);
  t.b("</div>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["line-by-line-numbers"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<div class="line-num1">');
  t.b(t.v(t.f("oldNumber", c, p, 0)));
  t.b("</div>");
  t.b(`
` + i);
  t.b('<div class="line-num2">');
  t.b(t.v(t.f("newNumber", c, p, 0)));
  t.b("</div>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["side-by-side-file-diff"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<div id="');
  t.b(t.v(t.f("fileHtmlId", c, p, 0)));
  t.b('" class="d2h-file-wrapper" data-lang="');
  t.b(t.v(t.d("file.language", c, p, 0)));
  t.b('">');
  t.b(`
` + i);
  t.b('    <div class="d2h-file-header">');
  t.b(`
` + i);
  t.b("      ");
  t.b(t.t(t.f("filePath", c, p, 0)));
  t.b(`
` + i);
  t.b("    </div>");
  t.b(`
` + i);
  t.b('    <div class="d2h-files-diff">');
  t.b(`
` + i);
  t.b('        <div class="d2h-file-side-diff">');
  t.b(`
` + i);
  t.b('            <div class="d2h-code-wrapper">');
  t.b(`
` + i);
  t.b('                <table class="d2h-diff-table">');
  t.b(`
` + i);
  t.b('                    <tbody class="d2h-diff-tbody">');
  t.b(`
` + i);
  t.b("                    ");
  t.b(t.t(t.d("diffs.left", c, p, 0)));
  t.b(`
` + i);
  t.b("                    </tbody>");
  t.b(`
` + i);
  t.b("                </table>");
  t.b(`
` + i);
  t.b("            </div>");
  t.b(`
` + i);
  t.b("        </div>");
  t.b(`
` + i);
  t.b('        <div class="d2h-file-side-diff">');
  t.b(`
` + i);
  t.b('            <div class="d2h-code-wrapper">');
  t.b(`
` + i);
  t.b('                <table class="d2h-diff-table">');
  t.b(`
` + i);
  t.b('                    <tbody class="d2h-diff-tbody">');
  t.b(`
` + i);
  t.b("                    ");
  t.b(t.t(t.d("diffs.right", c, p, 0)));
  t.b(`
` + i);
  t.b("                    </tbody>");
  t.b(`
` + i);
  t.b("                </table>");
  t.b(`
` + i);
  t.b("            </div>");
  t.b(`
` + i);
  t.b("        </div>");
  t.b(`
` + i);
  t.b("    </div>");
  t.b(`
` + i);
  t.b("</div>");
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["tag-file-added"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<span class="d2h-tag d2h-added d2h-added-tag">ADDED</span>');
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["tag-file-changed"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<span class="d2h-tag d2h-changed d2h-changed-tag">CHANGED</span>');
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["tag-file-deleted"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<span class="d2h-tag d2h-deleted d2h-deleted-tag">DELETED</span>');
  return t.fl();
}, partials: {}, subs: {} });
defaultTemplates["tag-file-renamed"] = new Hogan2.Template({ code: function(c, p, i) {
  var t = this;
  t.b(i = i || "");
  t.b('<span class="d2h-tag d2h-moved d2h-moved-tag">RENAMED</span>');
  return t.fl();
}, partials: {}, subs: {} });

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/hoganjs-utils.js
class HoganJsUtils {
  constructor({ compiledTemplates = {}, rawTemplates = {} }) {
    const compiledRawTemplates = Object.entries(rawTemplates).reduce((previousTemplates, [name, templateString]) => {
      const compiledTemplate = Hogan3.compile(templateString, { asString: false });
      return Object.assign(Object.assign({}, previousTemplates), { [name]: compiledTemplate });
    }, {});
    this.preCompiledTemplates = Object.assign(Object.assign(Object.assign({}, defaultTemplates), compiledTemplates), compiledRawTemplates);
  }
  static compile(templateString) {
    return Hogan3.compile(templateString, { asString: false });
  }
  render(namespace, view, params, partials, indent) {
    const templateKey = this.templateKey(namespace, view);
    try {
      const template = this.preCompiledTemplates[templateKey];
      return template.render(params, partials, indent);
    } catch (_e) {
      throw new Error(`Could not find template to render '${templateKey}'`);
    }
  }
  template(namespace, view) {
    return this.preCompiledTemplates[this.templateKey(namespace, view)];
  }
  templateKey(namespace, view) {
    return `${namespace}-${view}`;
  }
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/lib-esm/diff2html.js
var defaultDiff2HtmlConfig = Object.assign(Object.assign(Object.assign({}, defaultLineByLineRendererConfig), defaultSideBySideRendererConfig), { outputFormat: OutputFormatType.LINE_BY_LINE, drawFileList: true });
function html(diffInput, configuration = {}) {
  const config = Object.assign(Object.assign({}, defaultDiff2HtmlConfig), configuration);
  const diffJson = typeof diffInput === "string" ? parse(diffInput, config) : diffInput;
  const hoganUtils = new HoganJsUtils(config);
  const { colorScheme } = config;
  const fileListRendererConfig = { colorScheme };
  const fileList = config.drawFileList ? new FileListRenderer(hoganUtils, fileListRendererConfig).render(diffJson) : "";
  const diffOutput = config.outputFormat === "side-by-side" ? new SideBySideRenderer(hoganUtils, config).render(diffJson) : new LineByLineRenderer(hoganUtils, config).render(diffJson);
  return fileList + diffOutput;
}

// ../../node_modules/.bun/diff2html@3.4.56/node_modules/diff2html/bundles/css/diff2html.min.css
var diff2html_min_default = ":host,:root{--d2h-bg-color:#fff;--d2h-border-color:#ddd;--d2h-dim-color:rgba(0,0,0,.3);--d2h-line-border-color:#eee;--d2h-file-header-bg-color:#f7f7f7;--d2h-file-header-border-color:#d8d8d8;--d2h-empty-placeholder-bg-color:#f1f1f1;--d2h-empty-placeholder-border-color:#e1e1e1;--d2h-selected-color:#c8e1ff;--d2h-ins-bg-color:#dfd;--d2h-ins-border-color:#b4e2b4;--d2h-ins-highlight-bg-color:#97f295;--d2h-ins-label-color:#399839;--d2h-del-bg-color:#fee8e9;--d2h-del-border-color:#e9aeae;--d2h-del-highlight-bg-color:#ffb6ba;--d2h-del-label-color:#c33;--d2h-change-del-color:#fdf2d0;--d2h-change-ins-color:#ded;--d2h-info-bg-color:#f8fafd;--d2h-info-border-color:#d5e4f2;--d2h-change-label-color:#d0b44c;--d2h-moved-label-color:#3572b0;--d2h-dark-color:#e6edf3;--d2h-dark-bg-color:#0d1117;--d2h-dark-border-color:#30363d;--d2h-dark-dim-color:#6e7681;--d2h-dark-line-border-color:#21262d;--d2h-dark-file-header-bg-color:#161b22;--d2h-dark-file-header-border-color:#30363d;--d2h-dark-empty-placeholder-bg-color:hsla(215,8%,47%,.1);--d2h-dark-empty-placeholder-border-color:#30363d;--d2h-dark-selected-color:rgba(56,139,253,.1);--d2h-dark-ins-bg-color:rgba(46,160,67,.15);--d2h-dark-ins-border-color:rgba(46,160,67,.4);--d2h-dark-ins-highlight-bg-color:rgba(46,160,67,.4);--d2h-dark-ins-label-color:#3fb950;--d2h-dark-del-bg-color:rgba(248,81,73,.1);--d2h-dark-del-border-color:rgba(248,81,73,.4);--d2h-dark-del-highlight-bg-color:rgba(248,81,73,.4);--d2h-dark-del-label-color:#f85149;--d2h-dark-change-del-color:rgba(210,153,34,.2);--d2h-dark-change-ins-color:rgba(46,160,67,.25);--d2h-dark-info-bg-color:rgba(56,139,253,.1);--d2h-dark-info-border-color:rgba(56,139,253,.4);--d2h-dark-change-label-color:#d29922;--d2h-dark-moved-label-color:#3572b0}.d2h-wrapper{text-align:left}.d2h-file-header{background-color:#f7f7f7;background-color:var(--d2h-file-header-bg-color);border-bottom:1px solid #d8d8d8;border-bottom:1px solid var(--d2h-file-header-border-color);display:-webkit-box;display:-ms-flexbox;display:flex;font-family:Source Sans Pro,Helvetica Neue,Helvetica,Arial,sans-serif;height:35px;padding:5px 10px}.d2h-file-header.d2h-sticky-header{position:sticky;top:0;z-index:1}.d2h-file-stats{display:-webkit-box;display:-ms-flexbox;display:flex;font-size:14px;margin-left:auto}.d2h-lines-added{border:1px solid #b4e2b4;border:1px solid var(--d2h-ins-border-color);border-radius:5px 0 0 5px;color:#399839;color:var(--d2h-ins-label-color);padding:2px;text-align:right;vertical-align:middle}.d2h-lines-deleted{border:1px solid #e9aeae;border:1px solid var(--d2h-del-border-color);border-radius:0 5px 5px 0;color:#c33;color:var(--d2h-del-label-color);margin-left:1px;padding:2px;text-align:left;vertical-align:middle}.d2h-file-name-wrapper{display:-webkit-box;display:-ms-flexbox;display:flex;-webkit-box-align:center;-ms-flex-align:center;align-items:center;font-size:15px;width:100%}.d2h-file-name{overflow-x:hidden;text-overflow:ellipsis;white-space:nowrap}.d2h-file-wrapper{border:1px solid #ddd;border:1px solid var(--d2h-border-color);border-radius:3px;margin-bottom:1em}.d2h-file-collapse{-webkit-box-pack:end;-ms-flex-pack:end;cursor:pointer;display:none;font-size:12px;justify-content:flex-end;-webkit-box-align:center;-ms-flex-align:center;align-items:center;border:1px solid #ddd;border:1px solid var(--d2h-border-color);border-radius:3px;padding:4px 8px}.d2h-file-collapse.d2h-selected{background-color:#c8e1ff;background-color:var(--d2h-selected-color)}.d2h-file-collapse-input{margin:0 4px 0 0}.d2h-diff-table{border-collapse:collapse;font-family:Menlo,Consolas,monospace;font-size:13px;width:100%}.d2h-files-diff{display:-webkit-box;display:-ms-flexbox;display:flex;width:100%}.d2h-file-diff{overflow-y:hidden}.d2h-file-diff.d2h-d-none,.d2h-files-diff.d2h-d-none{display:none}.d2h-file-side-diff{display:inline-block;overflow-x:scroll;overflow-y:hidden;width:50%}.d2h-code-line{padding:0 8em;width:calc(100% - 16em)}.d2h-code-line,.d2h-code-side-line{display:inline-block;-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none;white-space:nowrap}.d2h-code-side-line{padding:0 4.5em;width:calc(100% - 9em)}.d2h-code-line-ctn{background:none;display:inline-block;padding:0;word-wrap:normal;-webkit-user-select:text;-moz-user-select:text;-ms-user-select:text;user-select:text;vertical-align:middle;white-space:pre;width:100%}.d2h-code-line del,.d2h-code-side-line del{background-color:#ffb6ba;background-color:var(--d2h-del-highlight-bg-color)}.d2h-code-line del,.d2h-code-line ins,.d2h-code-side-line del,.d2h-code-side-line ins{border-radius:.2em;display:inline-block;margin-top:-1px;-webkit-text-decoration:none;text-decoration:none}.d2h-code-line ins,.d2h-code-side-line ins{background-color:#97f295;background-color:var(--d2h-ins-highlight-bg-color);text-align:left}.d2h-code-line-prefix{background:none;display:inline;padding:0;word-wrap:normal;white-space:pre}.line-num1{float:left}.line-num1,.line-num2{-webkit-box-sizing:border-box;box-sizing:border-box;overflow:hidden;padding:0 .5em;text-overflow:ellipsis;width:3.5em}.line-num2{float:right}.d2h-code-linenumber{background-color:#fff;background-color:var(--d2h-bg-color);border:solid #eee;border:solid var(--d2h-line-border-color);border-width:0 1px;-webkit-box-sizing:border-box;box-sizing:border-box;color:rgba(0,0,0,.3);color:var(--d2h-dim-color);cursor:pointer;display:inline-block;position:absolute;text-align:right;width:7.5em}.d2h-code-linenumber:after{content:\"\\200b\"}.d2h-code-side-linenumber{background-color:#fff;background-color:var(--d2h-bg-color);border:solid #eee;border:solid var(--d2h-line-border-color);border-width:0 1px;-webkit-box-sizing:border-box;box-sizing:border-box;color:rgba(0,0,0,.3);color:var(--d2h-dim-color);cursor:pointer;display:inline-block;overflow:hidden;padding:0 .5em;position:absolute;text-align:right;text-overflow:ellipsis;width:4em}.d2h-code-side-linenumber:after{content:\"\\200b\"}.d2h-code-side-emptyplaceholder,.d2h-emptyplaceholder{background-color:#f1f1f1;background-color:var(--d2h-empty-placeholder-bg-color);border-color:#e1e1e1;border-color:var(--d2h-empty-placeholder-border-color)}.d2h-code-line-prefix,.d2h-code-linenumber,.d2h-code-side-linenumber,.d2h-emptyplaceholder{-webkit-user-select:none;-moz-user-select:none;-ms-user-select:none;user-select:none}.d2h-code-linenumber,.d2h-code-side-linenumber{direction:rtl}.d2h-del{background-color:#fee8e9;background-color:var(--d2h-del-bg-color);border-color:#e9aeae;border-color:var(--d2h-del-border-color)}.d2h-ins{background-color:#dfd;background-color:var(--d2h-ins-bg-color);border-color:#b4e2b4;border-color:var(--d2h-ins-border-color)}.d2h-info{background-color:#f8fafd;background-color:var(--d2h-info-bg-color);border-color:#d5e4f2;border-color:var(--d2h-info-border-color);color:rgba(0,0,0,.3);color:var(--d2h-dim-color)}.d2h-file-diff .d2h-del.d2h-change{background-color:#fdf2d0;background-color:var(--d2h-change-del-color)}.d2h-file-diff .d2h-ins.d2h-change{background-color:#ded;background-color:var(--d2h-change-ins-color)}.d2h-file-list-wrapper{margin-bottom:10px}.d2h-file-list-wrapper a{-webkit-text-decoration:none;text-decoration:none}.d2h-file-list-wrapper a,.d2h-file-list-wrapper a:visited{color:#3572b0;color:var(--d2h-moved-label-color)}.d2h-file-list-header{text-align:left}.d2h-file-list-title{font-weight:700}.d2h-file-list-line{display:-webkit-box;display:-ms-flexbox;display:flex;text-align:left}.d2h-file-list{display:block;list-style:none;margin:0;padding:0}.d2h-file-list>li{border-bottom:1px solid #ddd;border-bottom:1px solid var(--d2h-border-color);margin:0;padding:5px 10px}.d2h-file-list>li:last-child{border-bottom:none}.d2h-file-switch{cursor:pointer;display:none;font-size:10px}.d2h-icon{fill:currentColor;margin-right:10px;vertical-align:middle}.d2h-deleted{color:#c33;color:var(--d2h-del-label-color)}.d2h-added{color:#399839;color:var(--d2h-ins-label-color)}.d2h-changed{color:#d0b44c;color:var(--d2h-change-label-color)}.d2h-moved{color:#3572b0;color:var(--d2h-moved-label-color)}.d2h-tag{background-color:#fff;background-color:var(--d2h-bg-color);display:-webkit-box;display:-ms-flexbox;display:flex;font-size:10px;margin-left:5px;padding:0 2px}.d2h-deleted-tag{border:1px solid #c33;border:1px solid var(--d2h-del-label-color)}.d2h-added-tag{border:1px solid #399839;border:1px solid var(--d2h-ins-label-color)}.d2h-changed-tag{border:1px solid #d0b44c;border:1px solid var(--d2h-change-label-color)}.d2h-moved-tag{border:1px solid #3572b0;border:1px solid var(--d2h-moved-label-color)}.d2h-dark-color-scheme{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);color:#e6edf3;color:var(--d2h-dark-color)}.d2h-dark-color-scheme .d2h-file-header{background-color:#161b22;background-color:var(--d2h-dark-file-header-bg-color);border-bottom:#30363d;border-bottom:var(--d2h-dark-file-header-border-color)}.d2h-dark-color-scheme .d2h-lines-added{border:1px solid rgba(46,160,67,.4);border:1px solid var(--d2h-dark-ins-border-color);color:#3fb950;color:var(--d2h-dark-ins-label-color)}.d2h-dark-color-scheme .d2h-lines-deleted{border:1px solid rgba(248,81,73,.4);border:1px solid var(--d2h-dark-del-border-color);color:#f85149;color:var(--d2h-dark-del-label-color)}.d2h-dark-color-scheme .d2h-code-line del,.d2h-dark-color-scheme .d2h-code-side-line del{background-color:rgba(248,81,73,.4);background-color:var(--d2h-dark-del-highlight-bg-color)}.d2h-dark-color-scheme .d2h-code-line ins,.d2h-dark-color-scheme .d2h-code-side-line ins{background-color:rgba(46,160,67,.4);background-color:var(--d2h-dark-ins-highlight-bg-color)}.d2h-dark-color-scheme .d2h-diff-tbody{border-color:#30363d;border-color:var(--d2h-dark-border-color)}.d2h-dark-color-scheme .d2h-code-side-linenumber{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);border-color:#21262d;border-color:var(--d2h-dark-line-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-dark-color-scheme .d2h-files-diff .d2h-code-side-emptyplaceholder,.d2h-dark-color-scheme .d2h-files-diff .d2h-emptyplaceholder{background-color:hsla(215,8%,47%,.1);background-color:var(--d2h-dark-empty-placeholder-bg-color);border-color:#30363d;border-color:var(--d2h-dark-empty-placeholder-border-color)}.d2h-dark-color-scheme .d2h-code-linenumber{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);border-color:#21262d;border-color:var(--d2h-dark-line-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-dark-color-scheme .d2h-del{background-color:rgba(248,81,73,.1);background-color:var(--d2h-dark-del-bg-color);border-color:rgba(248,81,73,.4);border-color:var(--d2h-dark-del-border-color)}.d2h-dark-color-scheme .d2h-ins{background-color:rgba(46,160,67,.15);background-color:var(--d2h-dark-ins-bg-color);border-color:rgba(46,160,67,.4);border-color:var(--d2h-dark-ins-border-color)}.d2h-dark-color-scheme .d2h-info{background-color:rgba(56,139,253,.1);background-color:var(--d2h-dark-info-bg-color);border-color:rgba(56,139,253,.4);border-color:var(--d2h-dark-info-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-dark-color-scheme .d2h-file-diff .d2h-del.d2h-change{background-color:rgba(210,153,34,.2);background-color:var(--d2h-dark-change-del-color)}.d2h-dark-color-scheme .d2h-file-diff .d2h-ins.d2h-change{background-color:rgba(46,160,67,.25);background-color:var(--d2h-dark-change-ins-color)}.d2h-dark-color-scheme .d2h-file-wrapper{border:1px solid #30363d;border:1px solid var(--d2h-dark-border-color)}.d2h-dark-color-scheme .d2h-file-collapse{border:1px solid #0d1117;border:1px solid var(--d2h-dark-bg-color)}.d2h-dark-color-scheme .d2h-file-collapse.d2h-selected{background-color:rgba(56,139,253,.1);background-color:var(--d2h-dark-selected-color)}.d2h-dark-color-scheme .d2h-file-list-wrapper a,.d2h-dark-color-scheme .d2h-file-list-wrapper a:visited{color:#3572b0;color:var(--d2h-dark-moved-label-color)}.d2h-dark-color-scheme .d2h-file-list>li{border-bottom:1px solid #0d1117;border-bottom:1px solid var(--d2h-dark-bg-color)}.d2h-dark-color-scheme .d2h-deleted{color:#f85149;color:var(--d2h-dark-del-label-color)}.d2h-dark-color-scheme .d2h-added{color:#3fb950;color:var(--d2h-dark-ins-label-color)}.d2h-dark-color-scheme .d2h-changed{color:#d29922;color:var(--d2h-dark-change-label-color)}.d2h-dark-color-scheme .d2h-moved{color:#3572b0;color:var(--d2h-dark-moved-label-color)}.d2h-dark-color-scheme .d2h-tag{background-color:#0d1117;background-color:var(--d2h-dark-bg-color)}.d2h-dark-color-scheme .d2h-deleted-tag{border:1px solid #f85149;border:1px solid var(--d2h-dark-del-label-color)}.d2h-dark-color-scheme .d2h-added-tag{border:1px solid #3fb950;border:1px solid var(--d2h-dark-ins-label-color)}.d2h-dark-color-scheme .d2h-changed-tag{border:1px solid #d29922;border:1px solid var(--d2h-dark-change-label-color)}.d2h-dark-color-scheme .d2h-moved-tag{border:1px solid #3572b0;border:1px solid var(--d2h-dark-moved-label-color)}@media (prefers-color-scheme:dark){.d2h-auto-color-scheme{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);color:#e6edf3;color:var(--d2h-dark-color)}.d2h-auto-color-scheme .d2h-file-header{background-color:#161b22;background-color:var(--d2h-dark-file-header-bg-color);border-bottom:#30363d;border-bottom:var(--d2h-dark-file-header-border-color)}.d2h-auto-color-scheme .d2h-lines-added{border:1px solid rgba(46,160,67,.4);border:1px solid var(--d2h-dark-ins-border-color);color:#3fb950;color:var(--d2h-dark-ins-label-color)}.d2h-auto-color-scheme .d2h-lines-deleted{border:1px solid rgba(248,81,73,.4);border:1px solid var(--d2h-dark-del-border-color);color:#f85149;color:var(--d2h-dark-del-label-color)}.d2h-auto-color-scheme .d2h-code-line del,.d2h-auto-color-scheme .d2h-code-side-line del{background-color:rgba(248,81,73,.4);background-color:var(--d2h-dark-del-highlight-bg-color)}.d2h-auto-color-scheme .d2h-code-line ins,.d2h-auto-color-scheme .d2h-code-side-line ins{background-color:rgba(46,160,67,.4);background-color:var(--d2h-dark-ins-highlight-bg-color)}.d2h-auto-color-scheme .d2h-diff-tbody{border-color:#30363d;border-color:var(--d2h-dark-border-color)}.d2h-auto-color-scheme .d2h-code-side-linenumber{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);border-color:#21262d;border-color:var(--d2h-dark-line-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-auto-color-scheme .d2h-files-diff .d2h-code-side-emptyplaceholder,.d2h-auto-color-scheme .d2h-files-diff .d2h-emptyplaceholder{background-color:hsla(215,8%,47%,.1);background-color:var(--d2h-dark-empty-placeholder-bg-color);border-color:#30363d;border-color:var(--d2h-dark-empty-placeholder-border-color)}.d2h-auto-color-scheme .d2h-code-linenumber{background-color:#0d1117;background-color:var(--d2h-dark-bg-color);border-color:#21262d;border-color:var(--d2h-dark-line-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-auto-color-scheme .d2h-del{background-color:rgba(248,81,73,.1);background-color:var(--d2h-dark-del-bg-color);border-color:rgba(248,81,73,.4);border-color:var(--d2h-dark-del-border-color)}.d2h-auto-color-scheme .d2h-ins{background-color:rgba(46,160,67,.15);background-color:var(--d2h-dark-ins-bg-color);border-color:rgba(46,160,67,.4);border-color:var(--d2h-dark-ins-border-color)}.d2h-auto-color-scheme .d2h-info{background-color:rgba(56,139,253,.1);background-color:var(--d2h-dark-info-bg-color);border-color:rgba(56,139,253,.4);border-color:var(--d2h-dark-info-border-color);color:#6e7681;color:var(--d2h-dark-dim-color)}.d2h-auto-color-scheme .d2h-file-diff .d2h-del.d2h-change{background-color:rgba(210,153,34,.2);background-color:var(--d2h-dark-change-del-color)}.d2h-auto-color-scheme .d2h-file-diff .d2h-ins.d2h-change{background-color:rgba(46,160,67,.25);background-color:var(--d2h-dark-change-ins-color)}.d2h-auto-color-scheme .d2h-file-wrapper{border:1px solid #30363d;border:1px solid var(--d2h-dark-border-color)}.d2h-auto-color-scheme .d2h-file-collapse{border:1px solid #0d1117;border:1px solid var(--d2h-dark-bg-color)}.d2h-auto-color-scheme .d2h-file-collapse.d2h-selected{background-color:rgba(56,139,253,.1);background-color:var(--d2h-dark-selected-color)}.d2h-auto-color-scheme .d2h-file-list-wrapper a,.d2h-auto-color-scheme .d2h-file-list-wrapper a:visited{color:#3572b0;color:var(--d2h-dark-moved-label-color)}.d2h-auto-color-scheme .d2h-file-list>li{border-bottom:1px solid #0d1117;border-bottom:1px solid var(--d2h-dark-bg-color)}.d2h-dark-color-scheme .d2h-deleted{color:#f85149;color:var(--d2h-dark-del-label-color)}.d2h-auto-color-scheme .d2h-added{color:#3fb950;color:var(--d2h-dark-ins-label-color)}.d2h-auto-color-scheme .d2h-changed{color:#d29922;color:var(--d2h-dark-change-label-color)}.d2h-auto-color-scheme .d2h-moved{color:#3572b0;color:var(--d2h-dark-moved-label-color)}.d2h-auto-color-scheme .d2h-tag{background-color:#0d1117;background-color:var(--d2h-dark-bg-color)}.d2h-auto-color-scheme .d2h-deleted-tag{border:1px solid #f85149;border:1px solid var(--d2h-dark-del-label-color)}.d2h-auto-color-scheme .d2h-added-tag{border:1px solid #3fb950;border:1px solid var(--d2h-dark-ins-label-color)}.d2h-auto-color-scheme .d2h-changed-tag{border:1px solid #d29922;border:1px solid var(--d2h-dark-change-label-color)}.d2h-auto-color-scheme .d2h-moved-tag{border:1px solid #3572b0;border:1px solid var(--d2h-dark-moved-label-color)}}";

// src/ui.ts
var STATUS = {
  added: ["A", "Added"],
  modified: ["M", "Modified"],
  deleted: ["D", "Deleted"],
  renamed: ["R", "Renamed"],
  copied: ["C", "Copied"],
  "type-changed": ["T", "Type changed"],
  unmerged: ["!", "Unmerged"],
  untracked: ["U", "Untracked"]
};
function element(tag, className = "", text = "") {
  const node = document.createElement(tag);
  node.className = className;
  node.textContent = text;
  return node;
}
function text(node, value) {
  if (node.textContent !== value)
    node.textContent = value;
}
function icon(kind) {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 16 16");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  const path = document.createElementNS(svg.namespaceURI, "path");
  path.setAttribute("d", kind === "refresh" ? "M13 7a5 5 0 1 0-1 4M13 3v4H9" : "M4 5v6m8-6v1a4 4 0 0 1-4 4H4M6 3a2 2 0 1 1-4 0 2 2 0 1 1 4 0M14 3a2 2 0 1 1-4 0 2 2 0 1 1 4 0M6 13a2 2 0 1 1-4 0 2 2 0 1 1 4 0");
  svg.append(path);
  return svg;
}
function fileRow(change) {
  const row = element("li"), path = element("span", "path"), kind = element("span", "kind");
  const [letter, label] = STATUS[change.status];
  const fullPath = change.previousPath ? `${change.previousPath} → ${change.path}` : change.path;
  row.dataset.status = change.status;
  row.setAttribute("aria-label", `${label}: ${fullPath}`);
  path.title = fullPath;
  const directory = change.path.endsWith("/"), trimmed = directory ? change.path.slice(0, -1) : change.path;
  const split = trimmed.lastIndexOf("/");
  path.append(element("span", "file-name", trimmed.slice(split + 1) + (directory ? "/" : "")));
  if (split >= 0)
    path.append(element("span", "directory", trimmed.slice(0, split)));
  if (change.previousPath)
    path.append(element("span", "previous-path", `from ${change.previousPath}`));
  kind.textContent = letter;
  kind.title = label;
  kind.setAttribute("role", "img");
  kind.setAttribute("aria-label", label);
  row.append(path, kind);
  return row;
}
function diffRow(change) {
  const row = fileRow(change), details = element("details", "file-diff"), summary = element("summary"), body = element("div", "diff");
  summary.setAttribute("aria-label", row.getAttribute("aria-label"));
  row.removeAttribute("aria-label");
  summary.append(...row.childNodes);
  details.append(summary, body);
  row.append(details);
  row.classList.add("diff-row");
  return { key: JSON.stringify(change), row, details, summary, body, paths: change.previousPath ? [change.previousPath, change.path] : [change.path] };
}
var ESCAPES = { a: 7, b: 8, t: 9, n: 10, v: 11, f: 12, r: 13, '"': 34, "\\": 92 };
function unquote(quoted) {
  const bytes = [], encoder = new TextEncoder;
  for (const [, escape, plain] of quoted.matchAll(/\\([0-7]{3}|.)|([^\\]+)/gs)) {
    if (plain !== undefined)
      bytes.push(...encoder.encode(plain));
    else
      bytes.push(/^[0-7]/.test(escape) ? parseInt(escape, 8) : ESCAPES[escape] ?? escape.charCodeAt(0));
  }
  return new TextDecoder().decode(Uint8Array.from(bytes));
}
var QUOTED = String.raw`((?:[^"\\]|\\.)*)`;
function headerPath(header) {
  const twoWay = /^diff --git (.*)$/.exec(header);
  if (!twoWay) {
    const combined = /^diff --(?:cc|combined) (.*)$/.exec(header)?.[1];
    const quoted = combined && new RegExp(`^"${QUOTED}"$`).exec(combined);
    return quoted ? unquote(quoted[1]) : combined;
  }
  const sides = twoWay[1], quoted = new RegExp(String.raw`^"a/${QUOTED}" "b/\1"$`).exec(sides);
  if (quoted)
    return unquote(quoted[1]);
  const path = sides.slice(2, 2 + (sides.length - 5) / 2);
  return sides === `a/${path} b/${path}` ? path : undefined;
}
function indexDiff(text) {
  const files = new Map;
  for (const section of text.split(/^(?=diff --|\* Unmerged path )/m)) {
    const path = section.startsWith("diff --") ? headerPath(section.split(`
`, 1)[0]) : undefined;
    if (path !== undefined)
      files.set(path, section);
  }
  return files;
}
var DIFF_STYLES = diff2html_min_default.replace(/(^|[{}])([^{}@]+)\{/g, (_, end, selectors) => `${end}${selectors.split(",").map((selector) => /^:(?:host|root)$/.test(selector.trim()) ? ".wolfpack-changes" : `.wolfpack-changes ${selector}`).join(",")}{`);
var DIFF_OPTIONS = { drawFileList: false, outputFormat: "line-by-line", matching: "none", colorScheme: ColorSchemeType.DARK };
var GROUP_KEYS = ["staged", "unstaged", "untracked"];
var isGroupKey = (value) => GROUP_KEYS.some((key2) => key2 === value);
var DISCLOSURE_KEY = "disclosure";
var MAX_COLLAPSED = 256;
var MAX_PATH_LENGTH = 4096;
function parseDisclosure(raw) {
  const state = { closed: new Set, collapsed: { staged: new Set, unstaged: new Set, untracked: new Set } };
  let value;
  try {
    value = raw === null ? null : JSON.parse(raw);
  } catch {
    return state;
  }
  if (!value || typeof value !== "object")
    return state;
  const { closed, collapsed } = value;
  if (Array.isArray(closed)) {
    for (const key2 of closed)
      if (isGroupKey(key2))
        state.closed.add(key2);
  }
  if (collapsed && typeof collapsed === "object")
    for (const key2 of GROUP_KEYS) {
      const paths = collapsed[key2];
      if (Array.isArray(paths))
        for (const path of paths.slice(-MAX_COLLAPSED)) {
          if (typeof path === "string" && path && path.length <= MAX_PATH_LENGTH)
            state.collapsed[key2].add(path);
        }
    }
  return state;
}
function renderPaths(list, changes, directories, collapsed, row) {
  const available = new Set;
  const children = new Map;
  const append = (parent, child) => {
    const rows = children.get(parent) ?? [];
    rows.push(child);
    children.set(parent, rows);
  };
  children.set(list, []);
  for (const change of changes) {
    const segments = (change.path.endsWith("/") ? change.path.slice(0, -1) : change.path).split("/");
    let parent = list;
    for (let index = 1;index < segments.length; index++) {
      const path = segments.slice(0, index).join("/");
      let disclosure = directories.get(path);
      if (!disclosure) {
        const section = element("details"), heading = element("summary"), nested = element("ul");
        section.dataset.directory = path;
        section.open = !collapsed.has(path);
        heading.append(element("span", "directory-label", `${path}/`));
        section.append(heading, nested);
        section.addEventListener("toggle", () => {
          if (section.open)
            collapsed.delete(path);
          else
            collapsed.add(path);
        });
        disclosure = { section, heading, list: nested };
        directories.set(path, disclosure);
      }
      if (!available.has(path)) {
        available.add(path);
        children.set(disclosure.list, []);
        const row = element("li", "directory-row");
        row.append(disclosure.section);
        append(parent, row);
      }
      parent = disclosure.list;
    }
    append(parent, row(change));
  }
  for (const [parent, rows] of children)
    parent.replaceChildren(...rows);
  for (const path of directories.keys())
    if (!available.has(path))
      directories.delete(path);
}
function register(host) {
  host.registerContextView({
    id: "changes",
    title: "Changes",
    mount(container, context) {
      const root = element("section", "wolfpack-changes");
      root.setAttribute("aria-label", "Git changes");
      const diffs = typeof context.project.gitDiff === "function";
      const style = element("style");
      style.textContent = `
.wolfpack-changes{display:flex;flex-direction:column;gap:10px;min-width:0;height:100%;color:var(--text-primary,#dce5df);font:13px/1.5 system-ui}
.wolfpack-changes [hidden]{display:none!important}
.wolfpack-changes header,.wolfpack-changes .branch-heading,.wolfpack-changes .summary-line,.wolfpack-changes footer{display:flex;align-items:center;gap:8px;min-width:0}
.wolfpack-changes header,.wolfpack-changes .summary-line,.wolfpack-changes footer{justify-content:space-between;flex:none}
.wolfpack-changes header{padding:0;min-height:0;background:none;border:0;box-shadow:none;position:static;z-index:auto;transition:none}
.wolfpack-changes .branch-heading{overflow:hidden}
.wolfpack-changes svg{width:16px;height:16px;flex:none;fill:none;stroke:currentColor;stroke-width:1.5;stroke-linecap:round;stroke-linejoin:round}
.wolfpack-changes .branch-heading svg{color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .branch{font:600 12px/1.5 monospace;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.wolfpack-changes .refresh{display:grid;place-items:center;flex:none;width:32px;height:32px;padding:0;border:1px solid transparent;border-radius:6px;background:transparent;color:var(--text-muted,#a4b2a9);cursor:pointer}
.wolfpack-changes .refresh:hover{background:var(--bg-hover,#1b231e);color:var(--text-primary,#dce5df);border-color:var(--border,#28312b)}
.wolfpack-changes .refresh:focus-visible,.wolfpack-changes .refresh-diffs:focus-visible,.wolfpack-changes .d2h-file-diff:focus-visible,.wolfpack-changes summary:focus-visible{outline:2px solid var(--accent,#45ed7e);outline-offset:-2px}
.wolfpack-changes .refresh[aria-busy=true] svg{animation:wolfpack-changes-refresh 1s linear infinite}
@keyframes wolfpack-changes-refresh{to{transform:rotate(360deg)}}
@media(prefers-reduced-motion:reduce){.wolfpack-changes .refresh[aria-busy=true] svg{animation:none}}
.wolfpack-changes .change-count{font-size:12px;font-weight:600}
.wolfpack-changes .read-only{font-size:10px;white-space:nowrap;padding:1px 6px;border:1px solid var(--border,#28312b);border-radius:4px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .files{overflow:auto;min-height:0;flex:1;scrollbar-gutter:stable}
.wolfpack-changes details{margin:0 0 8px}
.wolfpack-changes summary{display:flex;align-items:center;gap:8px;min-height:32px;padding:0 6px;list-style:none;cursor:pointer;border-radius:4px;background:var(--bg-inset,#0d100e);font-size:11px;font-weight:600}
.wolfpack-changes summary::-webkit-details-marker{display:none}
.wolfpack-changes summary::before{content:"";width:5px;height:5px;border-right:1.5px solid currentColor;border-bottom:1.5px solid currentColor;transform:rotate(-45deg);margin-right:3px}
.wolfpack-changes details[open]>summary::before{transform:rotate(45deg)}
.wolfpack-changes .group-count{margin-left:auto;min-width:18px;text-align:center;border-radius:9px;background:var(--bg-elevated,#1c211e);color:var(--text-muted,#a4b2a9);font:11px/18px monospace}
.wolfpack-changes ul{list-style:none;margin:3px 0 0;padding:0}
.wolfpack-changes li{display:flex;gap:10px;align-items:center;min-height:32px;padding:5px 7px;border-radius:4px}
.wolfpack-changes li:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes li.directory-row{display:block;padding:0 0 0 8px;min-width:0}
.wolfpack-changes li.directory-row:hover{background:none}
.wolfpack-changes .directory-row details{margin:3px 0 0}
.wolfpack-changes summary::before{flex:none}
.wolfpack-changes .directory-label{min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;unicode-bidi:plaintext;font-family:monospace}
.wolfpack-changes .path{min-width:0;flex:1;font:12px/1.5 monospace;unicode-bidi:plaintext}
.wolfpack-changes .file-name,.wolfpack-changes .directory,.wolfpack-changes .previous-path{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.wolfpack-changes .directory,.wolfpack-changes .previous-path{font-size:10px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes [data-status=deleted] .file-name{text-decoration:line-through}
.wolfpack-changes .kind{flex:none;width:20px;text-align:center;border-radius:3px;background:color-mix(in srgb,currentColor 8%,transparent);font:600 11px/20px monospace;color:#9dc9f4}
.wolfpack-changes [data-status=modified] .kind,.wolfpack-changes [data-status=type-changed] .kind{color:#f1c576}
.wolfpack-changes [data-status=added] .kind,.wolfpack-changes [data-status=untracked] .kind{color:#7fe5a6}
.wolfpack-changes [data-status=deleted] .kind,.wolfpack-changes [data-status=unmerged] .kind{color:#f49898}
.wolfpack-changes .notice{border:1px solid var(--border,#28312b);border-radius:6px;padding:10px;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .notice p{margin:0}
.wolfpack-changes .notice[data-kind=empty]{padding:24px 10px;text-align:center}
.wolfpack-changes .notice-symbol{display:block;margin-bottom:6px;font-size:22px}
.wolfpack-changes .notice[data-kind=warning]{border-color:#796134;color:#f1c576}
.wolfpack-changes footer{flex-wrap:wrap;border-top:1px solid var(--border,#28312b);padding-top:8px;color:var(--text-muted,#a4b2a9);font-size:10px}
.wolfpack-changes .auto-refresh{display:flex;align-items:center;gap:5px}
.wolfpack-changes .auto-refresh::before{content:"";width:5px;height:5px;border-radius:50%;background:var(--accent,#45ed7e)}
.wolfpack-changes[data-stale=true] .auto-refresh::before{background:#f1c576}
@media(pointer:coarse),(max-width:600px){.wolfpack-changes .refresh{width:44px;height:44px}.wolfpack-changes summary{min-height:44px}}
${diffs ? DIFF_STYLES + `
.wolfpack-changes{--d2h-dark-color:var(--text-primary,#dce5df);--d2h-dark-bg-color:var(--bg-inset,#0d100e);--d2h-dark-border-color:var(--border,#28312b);--d2h-dark-line-border-color:var(--border-subtle,#1f2621);--d2h-dark-dim-color:var(--text-muted,#a4b2a9);--d2h-dark-file-header-bg-color:var(--bg-elevated,#1c211e);--d2h-dark-file-header-border-color:var(--border,#28312b)}
.wolfpack-changes li.diff-row{display:block;padding:0}
.wolfpack-changes li.diff-row:hover{background:none}
.wolfpack-changes details.file-diff{margin:0;min-width:0}
.wolfpack-changes .file-diff>summary{gap:10px;padding:5px 7px;background:none;font-size:inherit;font-weight:400}
.wolfpack-changes .file-diff>summary:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes .diff{min-width:0;margin:2px 0 6px 12px}
.wolfpack-changes .diff-note{margin:0;padding:6px 8px;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .d2h-file-header{display:none}
.wolfpack-changes .d2h-file-wrapper{margin:0 0 4px;border-radius:4px;position:relative}/* containing block for diff2html's absolutely positioned line numbers, so they scroll with .files */
.wolfpack-changes .d2h-file-diff{overflow-x:auto}
.wolfpack-changes .d2h-diff-table{font:12px/1.5 var(--font-mono,monospace)}
.wolfpack-changes .diff-bar{display:flex;align-items:center;gap:8px;flex:none;min-width:0;font-size:12px;color:var(--text-muted,#a4b2a9)}
.wolfpack-changes .diff-bar p{margin:0;min-width:0}
.wolfpack-changes .diff-bar[data-stale=true] p{color:#f1c576}
.wolfpack-changes .refresh-diffs{flex:none;margin-left:auto;min-height:32px;padding:0 10px;border:1px solid var(--border,#28312b);border-radius:6px;background:transparent;color:var(--text-primary,#dce5df);font:inherit;cursor:pointer}
.wolfpack-changes .refresh-diffs:hover{background:var(--bg-hover,#1b231e)}
.wolfpack-changes .refresh-diffs[aria-busy=true]{cursor:progress}
@media(pointer:coarse),(max-width:600px){.wolfpack-changes .refresh-diffs{min-height:44px}}
` : ""}`;
      const header = element("header"), branchHeading = element("div", "branch-heading"), branch = element("span", "branch", "Git"), refresh = element("button", "refresh");
      refresh.type = "button";
      refresh.title = "Refresh Git status";
      refresh.setAttribute("aria-label", "Refresh Git status");
      refresh.append(icon("refresh"));
      branchHeading.append(icon("branch"), branch);
      header.append(branchHeading, refresh);
      const summary = element("div", "summary-line"), count = element("span", "change-count", "Project status");
      summary.append(count, element("span", "read-only", "Read-only"));
      const notice = element("div", "notice"), symbol = element("span", "notice-symbol"), message = element("p");
      symbol.setAttribute("aria-hidden", "true");
      symbol.hidden = true;
      message.setAttribute("role", "status");
      notice.append(symbol, message);
      const showMessage = (value, kind, mark = "") => {
        notice.hidden = !value;
        notice.dataset.kind = kind;
        text(message, value);
        text(symbol, mark);
        symbol.hidden = !mark;
      };
      showMessage("Checking Git…", "loading");
      const diffBar = element("div", "diff-bar"), diffMessage = element("p"), refreshDiffs = element("button", "refresh-diffs", "Refresh diffs");
      diffBar.hidden = true;
      diffMessage.setAttribute("role", "status");
      refreshDiffs.type = "button";
      diffBar.append(diffMessage, refreshDiffs);
      const files = element("div", "files");
      const restored = parseDisclosure((() => {
        try {
          return context.storage.get(DISCLOSURE_KEY);
        } catch {
          return null;
        }
      })());
      const groups = GROUP_KEYS.map((key2) => {
        const title = key2[0].toUpperCase() + key2.slice(1), section = element("details"), heading = element("summary"), badge = element("span", "group-count", "0"), list = element("ul");
        section.dataset.group = key2;
        section.open = !restored.closed.has(key2);
        section.hidden = true;
        list.setAttribute("aria-label", `${title} files`);
        heading.append(element("span", "", title), badge);
        section.append(heading, list);
        files.append(section);
        return { key: key2, section, heading, badge, list, fingerprint: "", directories: new Map, collapsed: restored.collapsed[key2], rows: new Map };
      });
      const snapshot = (group) => {
        for (const [path, directory] of group.directories) {
          if (directory.section.open)
            group.collapsed.delete(path);
          else
            group.collapsed.add(path);
        }
      };
      const serialize = () => JSON.stringify({
        closed: groups.filter((group) => !group.section.open).map((group) => group.key),
        collapsed: Object.fromEntries(groups.filter((group) => group.collapsed.size).map((group) => [group.key, [...group.collapsed].slice(-MAX_COLLAPSED)]))
      });
      let saved = serialize();
      const footer = element("footer"), automatic = element("span", "auto-refresh", "Auto-refresh · 5s"), updated = element("time", "updated", "Not checked yet");
      automatic.title = "Updates every five seconds while visible, and when you return to this window.";
      footer.append(automatic, updated);
      root.append(style, header, summary, notice, ...diffs ? [diffBar] : [], files, footer);
      container.replaceChildren(root);
      let visible = false, disposed = false, timer;
      let request, hasResult = false;
      let diff, diffFingerprint = "", diffRequest, diffFailed = false;
      const active = () => visible && !disposed && !context.signal.aborted && document.visibilityState === "visible";
      const diffGroups = () => groups.filter((group) => group.key !== "untracked");
      const statusFingerprint = () => diffGroups().map((group) => group.fingerprint).join(`
`);
      const openRows = () => diffGroups().flatMap((group) => [...group.rows.values()].filter((row) => row.details.open && row.row.isConnected).map((row) => [group.key, row]));
      const note = (body, value) => {
        body.replaceChildren(element("p", "diff-note", value));
      };
      const renderDiff = (section, row) => {
        if (!row.details.open || diff && row.rendered === diff)
          return;
        row.rendered = diff;
        if (!diff)
          return note(row.body, diffRequest ? "Loading diff…" : diffFailed ? "Diff unavailable." : "");
        if (diff.state === "not-repository")
          return note(row.body, "Not a Git repository.");
        const sections = row.paths.flatMap((path) => diff?.state === "ready" ? diff[section].get(path) ?? [] : []);
        if (!sections.length)
          return note(row.body, diff.truncated ? "Not shown: the host truncated the diff." : "No diff for this file. It may have changed since the last check.");
        row.body.innerHTML = html(sections.join(""), DIFF_OPTIONS);
        for (const scroller of row.body.querySelectorAll(".d2h-file-diff")) {
          scroller.tabIndex = 0;
          scroller.setAttribute("role", "region");
          scroller.setAttribute("aria-label", `Diff of ${row.summary.getAttribute("aria-label")}`);
        }
      };
      const updateDiffs = () => {
        const open = openRows();
        for (const [section, row] of open)
          renderDiff(section, row);
        if (!open.length && diffBar.contains(document.activeElement))
          refresh.focus({ preventScroll: true });
        diffBar.hidden = !open.length;
        text(diffMessage, diffRequest ? diff ? "Updating diffs; showing the previous diff." : "Loading diff…" : diffFailed ? diff ? "Could not refresh diffs; showing the previous diff." : "Diff unavailable. Try Refresh diffs." : diff?.state === "ready" && diff.truncated ? "Diff truncated by the host. Some changes are not shown." : "");
        diffBar.dataset.stale = String(Boolean(diff && (diffRequest || diffFailed)));
      };
      const readDiff = async (force = false) => {
        if (!diffs || !active() || diffRequest || !openRows().length || !force && diff && diffFingerprint === statusFingerprint())
          return updateDiffs();
        const current = new AbortController, fingerprint = statusFingerprint();
        diffRequest = current;
        refreshDiffs.setAttribute("aria-busy", "true");
        updateDiffs();
        try {
          const value = await context.project.gitDiff(current.signal);
          if (diffRequest !== current)
            return;
          diff = value.state === "ready" ? { state: "ready", staged: indexDiff(value.staged), unstaged: indexDiff(value.unstaged), truncated: value.truncated } : value;
          diffFingerprint = fingerprint;
          diffFailed = false;
        } catch {
          if (diffRequest === current)
            diffFailed = true;
        } finally {
          if (diffRequest === current) {
            diffRequest = undefined;
            refreshDiffs.removeAttribute("aria-busy");
            updateDiffs();
          }
        }
      };
      const render = (status) => {
        for (const group of groups) {
          const rowFor = (change) => {
            if (!diffs || group.key === "untracked")
              return fileRow(change);
            const previous = group.rows.get(change.path), key2 = JSON.stringify(change);
            if (previous?.key === key2)
              return previous.row;
            const next = diffRow(change);
            next.details.open = previous?.details.open ?? false;
            group.rows.set(change.path, next);
            return next.row;
          };
          const changes = status.state === "ready" ? status[group.key] : [];
          const fingerprint = JSON.stringify(changes);
          if (!changes.length && group.section.contains(document.activeElement))
            refresh.focus({ preventScroll: true });
          group.section.hidden = !changes.length;
          if (fingerprint === group.fingerprint)
            continue;
          group.fingerprint = fingerprint;
          text(group.badge, String(changes.length));
          const focused = document.activeElement;
          const focusedRow = [...group.rows].find(([, row]) => row.summary === focused);
          const focusedPath = focusedRow ? focusedRow[0].slice(0, Math.max(focusedRow[0].lastIndexOf("/"), 0)) : [...group.directories].find(([, directory]) => directory.heading === focused)?.[0];
          snapshot(group);
          renderPaths(group.list, changes, group.directories, group.collapsed, rowFor);
          for (const [path, row] of group.rows)
            if (!row.row.isConnected)
              group.rows.delete(path);
          if (focusedPath !== undefined && changes.length) {
            const survivor = focusedRow && group.rows.get(focusedRow[0]);
            let path = survivor ? "" : focusedPath, fallback = survivor?.summary ?? group.heading;
            while (path) {
              const directory = group.directories.get(path);
              if (directory) {
                fallback = directory.heading;
                break;
              }
              const split = path.lastIndexOf("/");
              path = split < 0 ? "" : path.slice(0, split);
            }
            let ancestor = fallback.parentElement?.parentElement?.closest("details");
            while (ancestor && ancestor !== group.section) {
              if (!ancestor.open)
                fallback = ancestor.querySelector("summary");
              ancestor = ancestor.parentElement?.closest("details") ?? null;
            }
            fallback.focus({ preventScroll: true });
          }
        }
        text(branch, status.state === "ready" ? status.detached ? "Detached HEAD" : status.branch ?? "Git" : "Git");
        branch.title = branch.textContent;
        const total = status.state === "ready" ? new Set([...status.staged, ...status.unstaged, ...status.untracked].map((file) => file.path)).size : 0;
        text(count, status.state === "not-repository" ? "Local project" : `${total}${status.truncated ? "+" : ""} changed ${total === 1 && !status.truncated ? "file" : "files"}`);
        if (status.state === "not-repository")
          showMessage("Not a Git repository.", "empty", "—");
        else if (status.truncated)
          showMessage("File list truncated. More changes are not shown.", "warning");
        else if (!total)
          showMessage("Working tree clean.", "empty", "✓");
        else
          showMessage("", "empty");
        const now = new Date;
        updated.dateTime = now.toISOString();
        text(updated, now.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" }));
        updated.title = `Last successful check: ${now.toLocaleString()}`;
        root.dataset.stale = "false";
        hasResult = true;
        readDiff();
      };
      const stop = () => {
        clearTimeout(timer);
        timer = undefined;
        request?.abort();
        request = undefined;
        refresh.removeAttribute("aria-busy");
        diffRequest?.abort();
        diffRequest = undefined;
        refreshDiffs.removeAttribute("aria-busy");
      };
      const read = async () => {
        if (!active() || request)
          return;
        clearTimeout(timer);
        timer = undefined;
        const current = new AbortController;
        request = current;
        refresh.setAttribute("aria-busy", "true");
        try {
          const status = await context.project.gitStatus(current.signal);
          if (active() && request === current)
            render(status);
        } catch {
          if (active() && request === current) {
            root.dataset.stale = "true";
            showMessage(hasResult ? "Could not refresh; showing the previous result. Try Refresh." : "Git status unavailable. Try Refresh.", "warning");
          }
        } finally {
          if (request === current) {
            request = undefined;
            refresh.removeAttribute("aria-busy");
            if (active())
              timer = setTimeout(() => {
                read();
              }, 5000);
          }
        }
      };
      const persist = () => {
        if (disposed)
          return;
        for (const group of groups)
          snapshot(group);
        const value = serialize();
        if (value === saved)
          return;
        try {
          context.storage.set(DISCLOSURE_KEY, value);
          saved = value;
        } catch {}
      };
      const onFocus = () => {
        read();
      };
      const onVisibility = () => {
        if (active())
          read();
        else
          stop();
      };
      const dispose = () => {
        if (disposed)
          return;
        persist();
        disposed = true;
        stop();
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
        context.signal.removeEventListener("abort", dispose);
        root.remove();
      };
      files.addEventListener("toggle", persist, true);
      if (diffs)
        files.addEventListener("toggle", (event) => {
          if (event.target.matches(".file-diff"))
            readDiff();
        }, true);
      refreshDiffs.addEventListener("click", () => {
        readDiff(true);
      });
      refresh.addEventListener("click", onFocus);
      window.addEventListener("focus", onFocus);
      document.addEventListener("visibilitychange", onVisibility);
      context.signal.addEventListener("abort", dispose, { once: true });
      if (context.signal.aborted)
        dispose();
      return { setVisible(value) {
        visible = value;
        root.hidden = !value;
        onVisibility();
      }, dispose };
    }
  });
}
export {
  register as default
};
