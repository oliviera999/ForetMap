var e=[],t=0,n=!1,r={active:!1,budget:0,fallbackId:null};function i(){r.fallbackId!=null&&(clearTimeout(r.fallbackId),r.fallbackId=null)}function a(){r.active=!1,r.budget=0,i()}function o(){typeof window>`u`||(a(),r.active=!0,r.budget=12,r.fallbackId=window.setTimeout(()=>a(),1e4))}function s(){if(r.active&&r.budget>0){--r.budget;return}if(t>0){--t;return}let n=e.pop();if(typeof n==`function`)try{n()}catch{}}function c(){n||(n=!0,window.addEventListener(`popstate`,s))}function l(t){typeof window>`u`||typeof t!=`function`||(c(),window.history.pushState({foretmapOverlay:!0},``,window.location.href),e.push(t))}function u(n){if(typeof window>`u`||typeof n!=`function`)return;let r=e.lastIndexOf(n);r!==-1&&r===e.length-1&&(e.pop(),t=1,window.history.back())}function d(){if(typeof window>`u`)return;let n=e.length;n!==0&&(e=[],t=n,window.history.go(-n))}function f(e){for(var t=1;t<arguments.length;t++){var n=arguments[t];for(var r in n)Object.prototype.hasOwnProperty.call(n,r)&&(e[r]=n[r])}return e}function p(e,t){return Array(t+1).join(e)}function m(e){return e.replace(/^\n*/,``)}function h(e){for(var t=e.length;t>0&&e[t-1]===`
`;)t--;return e.substring(0,t)}function g(e){return h(m(e))}var _=`ADDRESS.ARTICLE.ASIDE.AUDIO.BLOCKQUOTE.BODY.CANVAS.CENTER.DD.DIR.DIV.DL.DT.FIELDSET.FIGCAPTION.FIGURE.FOOTER.FORM.FRAMESET.H1.H2.H3.H4.H5.H6.HEADER.HGROUP.HR.HTML.ISINDEX.LI.MAIN.MENU.NAV.NOFRAMES.NOSCRIPT.OL.OUTPUT.P.PRE.SECTION.TABLE.TBODY.TD.TFOOT.TH.THEAD.TR.UL`.split(`.`);function v(e){return w(e,_)}var y=[`AREA`,`BASE`,`BR`,`COL`,`COMMAND`,`EMBED`,`HR`,`IMG`,`INPUT`,`KEYGEN`,`LINK`,`META`,`PARAM`,`SOURCE`,`TRACK`,`WBR`];function b(e){return w(e,y)}function ee(e){return T(e,y)}var x=[`A`,`TABLE`,`THEAD`,`TBODY`,`TFOOT`,`TH`,`TD`,`IFRAME`,`SCRIPT`,`AUDIO`,`VIDEO`];function S(e){return w(e,x)}function C(e){return T(e,x)}function w(e,t){return t.indexOf(e.nodeName)>=0}function T(e,t){return e.getElementsByTagName&&t.some(function(t){return e.getElementsByTagName(t).length})}var E=[[/\\/g,`\\\\`],[/\*/g,`\\*`],[/^-/g,`\\-`],[/^\+ /g,`\\+ `],[/^(=+)/g,`\\$1`],[/^(#{1,6}) /g,`\\$1 `],[/`/g,"\\`"],[/^~~~/g,`\\~~~`],[/\[/g,`\\[`],[/\]/g,`\\]`],[/^>/g,`\\>`],[/_/g,`\\_`],[/^(\d+)\. /g,`$1\\. `]];function D(e){return E.reduce(function(e,t){return e.replace(t[0],t[1])},e)}var O={};O.paragraph={filter:`p`,replacement:function(e){return`

`+e+`

`}},O.lineBreak={filter:`br`,replacement:function(e,t,n){return n.br+`
`}},O.heading={filter:[`h1`,`h2`,`h3`,`h4`,`h5`,`h6`],replacement:function(e,t,n){var r=Number(t.nodeName.charAt(1));if(n.headingStyle===`setext`&&r<3){var i=p(r===1?`=`:`-`,e.length);return`

`+e+`
`+i+`

`}else return`

`+p(`#`,r)+` `+e+`

`}},O.blockquote={filter:`blockquote`,replacement:function(e){return e=g(e).replace(/^/gm,`> `),`

`+e+`

`}},O.list={filter:[`ul`,`ol`],replacement:function(e,t){var n=t.parentNode;return n.nodeName===`LI`&&n.lastElementChild===t?`
`+e:`

`+e+`

`}},O.listItem={filter:`li`,replacement:function(e,t,n){var r=n.bulletListMarker+`   `,i=t.parentNode;if(i.nodeName===`OL`){var a=i.getAttribute(`start`),o=Array.prototype.indexOf.call(i.children,t);r=(a?Number(a)+o:o+1)+`.  `}var s=/\n$/.test(e);return e=g(e)+(s?`
`:``),e=e.replace(/\n/gm,`
`+` `.repeat(r.length)),r+e+(t.nextSibling?`
`:``)}},O.indentedCodeBlock={filter:function(e,t){return t.codeBlockStyle===`indented`&&e.nodeName===`PRE`&&e.firstChild&&e.firstChild.nodeName===`CODE`},replacement:function(e,t,n){return`

    `+t.firstChild.textContent.replace(/\n/g,`
    `)+`

`}},O.fencedCodeBlock={filter:function(e,t){return t.codeBlockStyle===`fenced`&&e.nodeName===`PRE`&&e.firstChild&&e.firstChild.nodeName===`CODE`},replacement:function(e,t,n){for(var r=((t.firstChild.getAttribute(`class`)||``).match(/language-(\S+)/)||[null,``])[1],i=t.firstChild.textContent,a=n.fence.charAt(0),o=3,s=RegExp(`^`+a+`{3,}`,`gm`),c;c=s.exec(i);)c[0].length>=o&&(o=c[0].length+1);var l=p(a,o);return`

`+l+r+`
`+i.replace(/\n$/,``)+`
`+l+`

`}},O.horizontalRule={filter:`hr`,replacement:function(e,t,n){return`

`+n.hr+`

`}},O.inlineLink={filter:function(e,t){return t.linkStyle===`inlined`&&e.nodeName===`A`&&e.getAttribute(`href`)},replacement:function(e,t){var n=A(t.getAttribute(`href`)),r=j(k(t.getAttribute(`title`))),i=r?` "`+r+`"`:``;return`[`+e+`](`+n+i+`)`}},O.referenceLink={filter:function(e,t){return t.linkStyle===`referenced`&&e.nodeName===`A`&&e.getAttribute(`href`)},replacement:function(e,t,n){var r=A(t.getAttribute(`href`)),i=k(t.getAttribute(`title`));i&&=` "`+j(i)+`"`;var a,o;switch(n.linkReferenceStyle){case`collapsed`:a=`[`+e+`][]`,o=`[`+e+`]: `+r+i;break;case`shortcut`:a=`[`+e+`]`,o=`[`+e+`]: `+r+i;break;default:var s=this.references.length+1;a=`[`+e+`][`+s+`]`,o=`[`+s+`]: `+r+i}return this.references.push(o),a},references:[],append:function(e){var t=``;return this.references.length&&(t=`

`+this.references.join(`
`)+`

`,this.references=[]),t}},O.emphasis={filter:[`em`,`i`],replacement:function(e,t,n){return e.trim()?n.emDelimiter+e+n.emDelimiter:``}},O.strong={filter:[`strong`,`b`],replacement:function(e,t,n){return e.trim()?n.strongDelimiter+e+n.strongDelimiter:``}},O.code={filter:function(e){var t=e.previousSibling||e.nextSibling,n=e.parentNode.nodeName===`PRE`&&!t;return e.nodeName===`CODE`&&!n},replacement:function(e){if(!e)return``;e=e.replace(/\r?\n|\r/g,` `);for(var t=/^`|^ .*?[^ ].* $|`$/.test(e)?` `:``,n="`",r=e.match(/`+/gm)||[];r.indexOf(n)!==-1;)n+="`";return n+t+e+t+n}},O.image={filter:`img`,replacement:function(e,t){var n=D(k(t.getAttribute(`alt`))),r=A(t.getAttribute(`src`)||``),i=k(t.getAttribute(`title`)),a=i?` "`+j(i)+`"`:``;return r?`![`+n+`](`+r+a+`)`:``}};function k(e){return e?e.replace(/(\n+\s*)+/g,`
`):``}function A(e){var t=e.replace(/([<>()])/g,`\\$1`);return t.indexOf(` `)>=0?`<`+t+`>`:t}function j(e){return e.replace(/"/g,`\\"`)}function M(e){for(var t in this.options=e,this._keep=[],this._remove=[],this.blankRule={replacement:e.blankReplacement},this.keepReplacement=e.keepReplacement,this.defaultRule={replacement:e.defaultReplacement},this.array=[],e.rules)this.array.push(e.rules[t])}M.prototype={add:function(e,t){this.array.unshift(t)},keep:function(e){this._keep.unshift({filter:e,replacement:this.keepReplacement})},remove:function(e){this._remove.unshift({filter:e,replacement:function(){return``}})},forNode:function(e){if(e.isBlank)return this.blankRule;var t;return(t=N(this.array,e,this.options))||(t=N(this._keep,e,this.options))||(t=N(this._remove,e,this.options))?t:this.defaultRule},forEach:function(e){for(var t=0;t<this.array.length;t++)e(this.array[t],t)}};function N(e,t,n){for(var r=0;r<e.length;r++){var i=e[r];if(te(i,t,n))return i}}function te(e,t,n){var r=e.filter;if(typeof r==`string`){if(r===t.nodeName.toLowerCase())return!0}else if(Array.isArray(r)){if(r.indexOf(t.nodeName.toLowerCase())>-1)return!0}else if(typeof r==`function`){if(r.call(e,t,n))return!0}else throw TypeError("`filter` needs to be a string, array, or function")}function ne(e){var t=e.element,n=e.isBlock,r=e.isVoid,i=e.isPre||function(e){return e.nodeName===`PRE`};if(!(!t.firstChild||i(t))){for(var a=null,o=!1,s=null,c=F(s,t,i);c!==t;){if(c.nodeType===3||c.nodeType===4){var l=c.data.replace(/[ \r\n\t]+/g,` `);if((!a||/ $/.test(a.data))&&!o&&l[0]===` `&&(l=l.substr(1)),!l){c=P(c);continue}c.data=l,a=c}else if(c.nodeType===1)n(c)||c.nodeName===`BR`?(a&&(a.data=a.data.replace(/ $/,``)),a=null,o=!1):r(c)||i(c)?(a=null,o=!0):a&&(o=!1);else{c=P(c);continue}var u=F(s,c,i);s=c,c=u}a&&(a.data=a.data.replace(/ $/,``),a.data||P(a))}}function P(e){var t=e.nextSibling||e.parentNode;return e.parentNode.removeChild(e),t}function F(e,t,n){return e&&e.parentNode===t||n(t)?t.nextSibling||t.parentNode:t.firstChild||t.nextSibling||t.parentNode}var I=typeof window<`u`?window:{};function L(){var e=I.DOMParser,t=!1;try{new e().parseFromString(``,`text/html`)&&(t=!0)}catch{}return t}function R(){var e=function(){};return z()?e.prototype.parseFromString=function(e){var t=new window.ActiveXObject(`htmlfile`);return t.designMode=`on`,t.open(),t.write(e),t.close(),t}:e.prototype.parseFromString=function(e){var t=document.implementation.createHTMLDocument(``);return t.open(),t.write(e),t.close(),t},e}function z(){var e=!1;try{document.implementation.createHTMLDocument(``).open()}catch{I.ActiveXObject&&(e=!0)}return e}var B=L()?I.DOMParser:R();function V(e,t){var n=typeof e==`string`?U().parseFromString(`<x-turndown id="turndown-root">`+e+`</x-turndown>`,`text/html`).getElementById(`turndown-root`):e.cloneNode(!0);return ne({element:n,isBlock:v,isVoid:b,isPre:t.preformattedCode?W:null}),n}var H;function U(){return H||=new B,H}function W(e){return e.nodeName===`PRE`||e.nodeName===`CODE`}function G(e,t){return e.isBlock=v(e),e.isCode=e.nodeName===`CODE`||e.parentNode.isCode,e.isBlank=K(e),e.flankingWhitespace=q(e,t),e}function K(e){return!b(e)&&!S(e)&&/^\s*$/i.test(e.textContent)&&!ee(e)&&!C(e)}function q(e,t){if(e.isBlock||t.preformattedCode&&e.isCode)return{leading:``,trailing:``};var n=J(e.textContent);return n.leadingAscii&&Y(`left`,e,t)&&(n.leading=n.leadingNonAscii),n.trailingAscii&&Y(`right`,e,t)&&(n.trailing=n.trailingNonAscii),{leading:n.leading,trailing:n.trailing}}function J(e){var t=e.match(/^(([ \t\r\n]*)(\s*))(?:(?=\S)[\s\S]*\S)?((\s*?)([ \t\r\n]*))$/);return{leading:t[1],leadingAscii:t[2],leadingNonAscii:t[3],trailing:t[4],trailingNonAscii:t[5],trailingAscii:t[6]}}function Y(e,t,n){var r,i,a;return e===`left`?(r=t.previousSibling,i=/ $/):(r=t.nextSibling,i=/^ /),r&&(r.nodeType===3?a=i.test(r.nodeValue):n.preformattedCode&&r.nodeName===`CODE`?a=!1:r.nodeType===1&&!v(r)&&(a=i.test(r.textContent))),a}var X=Array.prototype.reduce;function Z(e){if(!(this instanceof Z))return new Z(e);var t={rules:O,headingStyle:`setext`,hr:`* * *`,bulletListMarker:`*`,codeBlockStyle:`indented`,fence:"```",emDelimiter:`_`,strongDelimiter:`**`,linkStyle:`inlined`,linkReferenceStyle:`full`,br:`  `,preformattedCode:!1,blankReplacement:function(e,t){return t.isBlock?`

`:``},keepReplacement:function(e,t){return t.isBlock?`

`+t.outerHTML+`

`:t.outerHTML},defaultReplacement:function(e,t){return t.isBlock?`

`+e+`

`:e}};this.options=f({},t,e),this.rules=new M(this.options)}Z.prototype={turndown:function(e){if(!ae(e))throw TypeError(e+` is not a string, or an element/document/fragment node.`);if(e===``)return``;var t=Q.call(this,new V(e,this.options));return re.call(this,t)},use:function(e){if(Array.isArray(e))for(var t=0;t<e.length;t++)this.use(e[t]);else if(typeof e==`function`)e(this);else throw TypeError(`plugin must be a Function or an Array of Functions`);return this},addRule:function(e,t){return this.rules.add(e,t),this},keep:function(e){return this.rules.keep(e),this},remove:function(e){return this.rules.remove(e),this},escape:function(e){return D(e)}};function Q(e){var t=this;return X.call(e.childNodes,function(e,n){n=new G(n,t.options);var r=``;return n.nodeType===3?r=n.isCode?n.nodeValue:t.escape(n.nodeValue):n.nodeType===1&&(r=ie.call(t,n)),$(e,r)},``)}function re(e){var t=this;return this.rules.forEach(function(n){typeof n.append==`function`&&(e=$(e,n.append(t.options)))}),e.replace(/^[\t\r\n]+/,``).replace(/[\t\r\n\s]+$/,``)}function ie(e){var t=this.rules.forNode(e),n=Q.call(this,e),r=e.flankingWhitespace;return(r.leading||r.trailing)&&(n=n.trim()),r.leading+t.replacement(n,e,this.options)+r.trailing}function $(e,t){var n=h(e),r=m(t),i=Math.max(e.length-n.length,t.length-r.length);return n+`

`.substring(0,i)+r}function ae(e){return e!=null&&(typeof e==`string`||e.nodeType&&(e.nodeType===1||e.nodeType===9||e.nodeType===11))}export{l as a,a as i,d as n,u as o,o as r,Z as t};