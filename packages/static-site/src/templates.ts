import Handlebars from "handlebars";

/*
 * The site's pages. Handlebars escapes every `{{value}}`; the only
 * triple-stash `{{{…}}}` outputs are HTML this package made itself — a
 * rendered page body, markdown through `markdownToHtml` (safe by default),
 * and the index page's own filter script. Templates stay logic-light: the
 * view models in `build-site.ts` arrive with every string already worked
 * out, links included, so a template never builds a URL.
 *
 * Every link is relative (`root` is "" or "../"), so the site works opened
 * from `file://` and from any subfolder of a web server.
 */

const hbs = Handlebars.create();

/** Superscript links to a fact's footnotes. */
hbs.registerPartial(
  "cites",
  `{{#if cites.length}}<sup class="cites">{{#each cites}}<a href="#cite-{{this}}">[{{this}}]</a>{{/each}}</sup>{{/if}}`,
);

/** A list of people in the family section. */
hbs.registerPartial(
  "relatives",
  `{{#if people.length}}<section class="relatives"><h3>{{heading}}</h3><ul>{{#each people}}<li><a href="{{href}}">{{name}}</a>{{#if lifespan}} <span class="lifespan">{{lifespan}}</span>{{/if}}{{#if note}} <span class="muted">({{note}})</span>{{/if}}{{#if details.length}}<div class="relative-details">{{#each details}}<span>{{this}}</span>{{/each}}{{> cites}}</div>{{/if}}{{#if notesHtml}}<div class="notes">{{{notesHtml}}}</div>{{/if}}</li>{{/each}}</ul></section>{{/if}}`,
);

const layout = hbs.compile(`<!doctype html>
<html lang="{{lang}}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="generator" content="Genealogy">
<title>{{pageTitle}}</title>
<link rel="stylesheet" href="{{root}}assets/site.css">
<link rel="stylesheet" href="{{root}}assets/theme.css">
</head>
<body class="{{bodyClass}}">
<a class="skip-link" href="#main">{{skipLabel}}</a>
<header class="site-header">
<a class="site-title" href="{{root}}index.html">{{siteTitle}}</a>
<nav class="site-nav">{{#each nav}}<a href="{{href}}"{{#if current}} aria-current="page"{{/if}}>{{label}}</a>{{/each}}</nav>
</header>
{{{body}}}
<footer class="site-footer"><p>{{exportedOn}}</p></footer>
{{#each scripts}}<script src="{{this}}"></script>
{{/each}}
</body>
</html>
`);

const indexBody = hbs.compile(`<main id="main" class="site-main">
<h1>{{title}}</h1>
<p class="lead">{{counts}}</p>
<p class="privacy-note">{{privacyNote}}</p>
<p><a class="button" href="tree.html">{{openTree}}</a></p>
{{#if groups.length}}
<section aria-labelledby="surnames-heading">
<h2 id="surnames-heading">{{surnamesHeading}}</h2>
<ul class="surname-index">{{#each groups}}<li><a href="#{{anchor}}">{{label}}</a> <span class="count">{{people.length}}</span></li>{{/each}}</ul>
</section>
<section aria-labelledby="everyone-heading">
<h2 id="everyone-heading">{{everyoneHeading}}</h2>
<p class="filter"><label for="person-filter">{{filterLabel}}</label> <input id="person-filter" type="search" placeholder="{{filterPlaceholder}}" autocomplete="off"></p>
{{#each groups}}
<section class="surname-group" id="{{anchor}}">
<h3>{{label}}</h3>
<ul class="people-list">{{#each people}}<li data-search="{{search}}"><a href="people/{{id}}.html">{{name}}</a>{{#if lifespan}} <span class="lifespan">{{lifespan}}</span>{{/if}}</li>{{/each}}</ul>
</section>
{{/each}}
<p id="no-matches" class="muted" hidden>{{noMatches}}</p>
</section>
{{/if}}
</main>
<script>{{{filterScript}}}</script>
`);

const personBody = hbs.compile(`<main id="main" class="site-main person-page">
<header class="person-header">
{{#if photo}}<img class="person-photo" src="{{photo}}" alt="{{photoAlt}}">{{else}}<div class="person-initials gender-{{genderClass}}" aria-hidden="true">{{initials}}</div>{{/if}}
<div>
<h1>{{name}}</h1>
{{#if lifespan}}<p class="lifespan">{{lifespan}}</p>{{/if}}
<p><a href="{{treeHref}}">{{viewInTree}}</a></p>
</div>
</header>
{{#if redacted}}<p class="privacy-note">{{livingPrivate}}</p>{{/if}}
{{#if vitals.length}}<dl class="facts">{{#each vitals}}<dt>{{label}}</dt><dd>{{text}}{{> cites}}</dd>{{/each}}</dl>{{/if}}
{{#if names.length}}
<section><h2>{{alsoKnownAs}}</h2>
<ul class="names">{{#each names}}<li><span class="muted">{{typeLabel}}:</span> {{name}}{{#if since}} <span class="muted">({{since}})</span>{{/if}}{{> cites}}{{#if notesHtml}}<div class="notes">{{{notesHtml}}}</div>{{/if}}</li>{{/each}}</ul>
</section>
{{/if}}
{{#if hasFamily}}
<section><h2>{{familyHeading}}</h2>
<div class="family">{{#each family}}{{> relatives}}{{/each}}</div>
</section>
{{/if}}
{{#if events.length}}
<section><h2>{{lifeEvents}}</h2>
<ol class="events">{{#each events}}<li><div class="event-date">{{date}}</div><div><p class="event-title">{{title}}{{> cites}}</p>{{#if place}}<p class="muted">{{place}}</p>{{/if}}{{#if details}}<p class="muted">{{details}}</p>{{/if}}{{#if notesHtml}}<div class="notes">{{{notesHtml}}}</div>{{/if}}</div></li>{{/each}}</ol>
</section>
{{/if}}
{{#if notesHtml}}
<section><h2>{{notesHeading}}{{> cites}}</h2><div class="notes">{{{notesHtml}}}</div></section>
{{/if}}
{{#if citations.length}}
<section><h2>{{sourcesHeading}}</h2>
<ol class="citations">{{#each citations}}<li id="cite-{{n}}"><a href="{{href}}">{{title}}</a>{{#if detail}}, {{detail}}{{/if}}. <span class="muted">{{confidence}}</span>{{#if noteHtml}}<div class="notes">{{{noteHtml}}}</div>{{/if}}</li>{{/each}}</ol>
</section>
{{/if}}
</main>
`);

const sourcesBody = hbs.compile(`<main id="main" class="site-main">
<h1>{{heading}}</h1>
{{#unless sources.length}}<p class="muted">{{noSources}}</p>{{/unless}}
{{#each sources}}
<section class="source" id="{{anchor}}">
<h2>{{title}}</h2>
{{#if fields.length}}<dl class="facts">{{#each fields}}<dt>{{label}}</dt><dd>{{value}}</dd>{{/each}}</dl>{{/if}}
{{#if people.length}}<p><span class="muted">{{../citedFor}}:</span> {{#each people}}<a href="{{href}}">{{name}}</a>{{#unless @last}}, {{/unless}}{{/each}}</p>{{/if}}
</section>
{{/each}}
</main>
`);

const treeBody = hbs.compile(`<main id="main" class="tree-main">
<div class="tree-toolbar">
<label>{{chartLabel}} <select id="tree-kind">{{#each charts}}<option value="{{value}}">{{label}}</option>{{/each}}</select></label>
<label>{{orientationLabel}} <select id="tree-orientation">{{#each orientations}}<option value="{{value}}">{{label}}</option>{{/each}}</select></label>
<p class="tree-selected" aria-live="polite"><strong id="tree-selected-name"></strong> <span id="tree-selected-lifespan" class="lifespan"></span> <a id="tree-selected-open" href="#">{{openPage}}</a> <button id="tree-selected-center" type="button">{{centerHere}}</button></p>
</div>
<div class="tree-canvas-wrap">
<div id="tree-chart"></div>
<div class="tree-zoom">
<button type="button" id="tree-zoom-in" aria-label="{{zoomIn}}" title="{{zoomIn}}">+</button>
<button type="button" id="tree-zoom-out" aria-label="{{zoomOut}}" title="{{zoomOut}}">−</button>
<button type="button" id="tree-fit" aria-label="{{fitToView}}" title="{{fitToView}}">⤢</button>
</div>
<noscript><p class="tree-noscript">{{noScript}}</p></noscript>
</div>
</main>
`);

export const templates = { layout, indexBody, personBody, sourcesBody, treeBody };
