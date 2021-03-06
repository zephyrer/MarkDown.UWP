// CodeMirror, copyright (c) by Marijn Haverbeke and others
// Distributed under an MIT license: http://codemirror.net/LICENSE

// Define search commands. Depends on dialog.js or another
// implementation of the openDialog method.

// Replace works a little oddly -- it will do the replace on the next
// Ctrl-G (or whatever is bound to findNext) press. You prevent a
// replace by making sure the match is no longer selected when hitting
// Ctrl-G.

(function(mod) {
  if (typeof exports == "object" && typeof module == "object") // CommonJS
    mod(require("../../lib/codemirror"), require("./searchcursor"), require("../dialog/dialog"));
  else if (typeof define == "function" && define.amd) // AMD
    define(["../../lib/codemirror", "./searchcursor", "../dialog/dialog"], mod);
  else // Plain browser env
    mod(CodeMirror);
})(function(CodeMirror) {
  "use strict";

  function searchOverlay(query, caseInsensitive) {
    if (typeof query == "string")
      query = new RegExp(query.replace(/[\-\[\]\/\{\}\(\)\*\+\?\.\\\^\$\|]/g, "\\$&"), caseInsensitive ? "gi" : "g");
    else if (!query.global)
      query = new RegExp(query.source, query.ignoreCase ? "gi" : "g");

    return {token: function(stream) {
      query.lastIndex = stream.pos;
      var match = query.exec(stream.string);
      if (match && match.index == stream.pos) {
        stream.pos += match[0].length || 1;
        return "searching";
      } else if (match) {
        stream.pos = match.index;
      } else {
        stream.skipToEnd();
      }
    }};
  }

  function SearchState() {
    this.posFrom = this.posTo = this.lastQuery = this.query = null;
    this.overlay = null;
  }

  function getSearchState(cm) {
    return cm.state.search || (cm.state.search = new SearchState());
  }

  function queryCaseInsensitive(cm, query) {
      //return typeof query == "string" && query == query.toLowerCase();
      return !cm.getOption('matchWordCase');
  }

  function getSearchCursor(cm, query, pos) {
    // Heuristic: if the query string is all lowercase, do a case insensitive search.
    return cm.getSearchCursor(query, pos, queryCaseInsensitive(cm, query));
  }

  function persistentDialog(cm, text, deflt, f) {
    cm.openDialog(text, f, {
      value: deflt,
      selectValueOnOpen: true,
      closeOnEnter: false,
      onClose: function() { clearSearch(cm); }
    });
  }

  function dialog(cm, text, shortText, deflt, f, userInput) {
    if (cm.openDialog) cm.openDialog(text, f, {value: deflt, selectValueOnOpen: true});
    else f(userInput);
//else f(window.prompt(shortText, deflt));
  }

  function confirmDialog(cm, text, shortText, fs) {
    if (cm.openConfirm) cm.openConfirm(text, fs);
    else if (confirm(shortText)) fs[0]();
  }

  function parseString(string) {
    return string.replace(/\\(.)/g, function(_, ch) {
      if (ch == "n") return "\n"
      if (ch == "r") return "\r"
      return ch
    })
  }

  function parseQuery(query) {
    var isRE = query.match(/^\/(.*)\/([a-z]*)$/);
    if (isRE) {
      try { query = new RegExp(isRE[1], isRE[2].indexOf("i") == -1 ? "" : "i"); }
      catch(e) {} // Not a regular expression after all, do a string search
    } else {
      query = parseString(query)
    }
    if (typeof query == "string" ? query == "" : query.test(""))
      query = /x^/;
    return query;
  }


  var searchText = navigator.language == "zh-CN" ? "查找" : "Search";
  var searchForText = navigator.language == "zh-CN" ? "查找:" : "Search For:";
  var useRegexText = navigator.language == "zh-CN" ?"使用 /re/ 语法进行正则表达式查询":'Use /re/ syntax for regexp search';
  var replaceText = navigator.language == "zh-CN" ? "替换" : "Replace";
  var replaceAllText = navigator.language == "zh-CN" ? "替换全部" : "Replace all";
  var replaceWithText = navigator.language == "zh-CN" ? "替换为" : "Replace with:";
  var withText = navigator.language == "zh-CN" ? "替换为" : "with:";
  var yesText = navigator.language == "zh-CN" ? "是" : "Yes";
  var noText = navigator.language == "zh-CN" ? "否" : "No";
  var allText = navigator.language == "zh-CN" ? "全部" : "All";
  var stopText = navigator.language == "zh-CN" ? "停止" : "Stop";

  var queryDialog = searchText + ': <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint">(' + useRegexText + ')</span>' 

  function startSearch(cm, state, query) {
    state.queryText = query;
    state.query = parseQuery(query);
    cm.removeOverlay(state.overlay, queryCaseInsensitive(cm,state.query));
    state.overlay = searchOverlay(state.query, queryCaseInsensitive(cm,state.query));
    cm.addOverlay(state.overlay);
    if (cm.showMatchesOnScrollbar) {
      if (state.annotate) { state.annotate.clear(); state.annotate = null; }
      state.annotate = cm.showMatchesOnScrollbar(state.query, queryCaseInsensitive(cm,state.query));
    }
  }

  function doSearch(cm, rev, persistent) {
    var state = getSearchState(cm);
    if (state.query) return findNext(cm, rev);
    var q = cm.getSelection() || state.lastQuery;
    if (persistent && cm.openDialog) {
      var hiding = null
      persistentDialog(cm, queryDialog, q, function(query, event) {
        CodeMirror.e_stop(event);
        if (!query) return;
        if (query != state.queryText) startSearch(cm, state, query);
        if (hiding) hiding.style.opacity = 1
        findNext(cm, event.shiftKey, function(_, to) {
          var dialog
          if (to.line < 3 && document.querySelector &&
              (dialog = cm.display.wrapper.querySelector(".CodeMirror-dialog")) &&
              dialog.getBoundingClientRect().bottom - 4 > cm.cursorCoords(to, "window").top)
            (hiding = dialog).style.opacity = .4
        })
      });
    } else {
        dialog(cm, queryDialog, searchForText, q, function (query) {
        if (query && !state.query) cm.operation(function() {
          startSearch(cm, state, query);
          state.posFrom = state.posTo = cm.getCursor();
          findNext(cm, rev);
        });
      }, cm.getOption("searchText"));
    }
  }

  function findNext(cm, rev, callback) {cm.operation(function() {
    var state = getSearchState(cm);
    var cursor = getSearchCursor(cm, state.query, rev ? state.posFrom : state.posTo);
    if (!cursor.find(rev)) {
      cursor = getSearchCursor(cm, state.query, rev ? CodeMirror.Pos(cm.lastLine()) : CodeMirror.Pos(cm.firstLine(), 0));
      if (!cursor.find(rev)) return;
    }
    cm.setSelection(cursor.from(), cursor.to());
    cm.scrollIntoView({from: cursor.from(), to: cursor.to()}, 20);
    state.posFrom = cursor.from(); state.posTo = cursor.to();
    if (callback) callback(cursor.from(), cursor.to())
  });}

  function clearSearch(cm) {cm.operation(function() {
    var state = getSearchState(cm);
    state.lastQuery = state.query;
    if (!state.query) return;
    state.query = state.queryText = null;
    cm.removeOverlay(state.overlay);
    if (state.annotate) { state.annotate.clear(); state.annotate = null; }
  });}

  var replaceQueryDialog =
    ' <input type="text" style="width: 10em" class="CodeMirror-search-field"/> <span style="color: #888" class="CodeMirror-search-hint">('+useRegexText+')</span>';
  var replacementQueryDialog = withText + ' <input type="text" style="width: 10em" class="CodeMirror-search-field"/>';
  var doReplaceConfirm = replaceText + "? <button>" + yesText + "</button> <button>" + noText + "</button> <button>" + allText + "</button> <button>" + stopText +"</button>";

  function replaceAll(cm, query, text) {
    cm.operation(function() {
      for (var cursor = getSearchCursor(cm, query); cursor.findNext();) {
        if (typeof query != "string") {
          var match = cm.getRange(cursor.from(), cursor.to()).match(query);
          cursor.replace(text.replace(/\$(\d)/g, function(_, i) {return match[i];}));
        } else cursor.replace(text);
      }
    });
  }

  function replace(cm, all) {
    if (cm.getOption("readOnly")) return;
    var query = cm.getSelection() || getSearchState(cm).lastQuery;
    var dialogText = (all ? replaceAllText : replaceText) + ":"
    dialog(cm, dialogText + replaceQueryDialog, dialogText, query, function(query) {
      if (!query) return;
      query = parseQuery(query);
      dialog(cm, replacementQueryDialog, replaceWithText, "", function (text) {
        text = parseString(text)
        if (all) {
            replaceAll(cm, query, text)
        } else {
            clearSearch(cm);
            var cursor = getSearchCursor(cm, query, cm.getCursor());
            var advance = function () {
                var start = cursor.from(), match;
                if (!(match = cursor.findNext())) {
                    cursor = getSearchCursor(cm, query);
                    if (!(match = cursor.findNext()) ||
                        (start && cursor.from().line == start.line && cursor.from().ch == start.ch)) return;
                }
                cm.setSelection(cursor.from(), cursor.to());
                cm.scrollIntoView({ from: cursor.from(), to: cursor.to() });
                //confirmDialog(cm, doReplaceConfirm, replaceText + "?",
                //              [function () { doReplace(match); }, advance,
                //               function () { replaceAll(cm, query, text) }]);
                cursor.replace(typeof query == "string" ? text :
                               text.replace(/\$(\d)/g, function (_, i) { return match[i]; }));
            };
            //var doReplace = function (match) {
            //    cursor.replace(typeof query == "string" ? text :
            //                   text.replace(/\$(\d)/g, function (_, i) { return match[i]; }));
            //    advance();
            //};
            advance();
        }
        

      }, cm.getOption("replaceText"));
    }, cm.getOption("searchText"));
  }

  CodeMirror.commands.find = function(cm) {clearSearch(cm); doSearch(cm);};
  CodeMirror.commands.findPersistent = function(cm) {clearSearch(cm); doSearch(cm, false, true);};
  CodeMirror.commands.findNext = doSearch;
  CodeMirror.commands.findPrev = function(cm) {doSearch(cm, true);};
  CodeMirror.commands.clearSearch = clearSearch;
  CodeMirror.commands.replace = replace;
  CodeMirror.commands.replaceAll = function(cm) {replace(cm, true);};
});
