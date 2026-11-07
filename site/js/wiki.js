// Task guides from the Gray Zone Warfare Wiki, fetched live through its
// MediaWiki API (which allows cross-origin reads). The API we use for
// everything else only has a task's objectives; the wiki's Guide section
// says where the items actually are, with map screenshots and coordinates.
// Text is CC BY-SA, credited where it is shown.

import { API_CACHE } from './api.js';
import { GUIDE_STOP, findTrigger } from './lib.js';

export const WIKI = 'https://gray-zone-warfare.fandom.com';
export const WIKI_CACHE = API_CACHE; // so "Refresh data" clears guides too
const IMG_HOST = 'https://static.wikia.nocookie.net/';

export const wikiPage = (title) => `${WIKI}/wiki/${encodeURIComponent(title.replace(/ /g, '_'))}`;

const memo = new Map();

// { html, text, trigger, url } for the task's Guide section; html and text
// are '' when the page has no guide. null when the wiki has no such page.
export function loadGuide(title) {
  if (!memo.has(title)) {
    const url = `${WIKI}/api.php?action=parse&format=json&origin=*&redirects=1&prop=text`
      + `&disableeditsection=1&disablelimitreport=1&page=${encodeURIComponent(title)}`;
    memo.set(title, fetch(url)
      .then((res) => {
        if (!res.ok) throw new Error(`The wiki returned ${res.status}`);
        return res.json();
      })
      .then((j) => {
        if (j.error) return null;
        const guide = extractGuide(j.parse.text['*']);
        return { ...guide, trigger: findTrigger(guide.text), url: wikiPage(j.parse.title) };
      })
      .catch((err) => { memo.delete(title); throw err; }));
  }
  return memo.get(title);
}

const headline = (h) => (h.querySelector('.mw-headline')?.textContent || h.textContent).trim();

function extractGuide(pageHtml) {
  const doc = new DOMParser().parseFromString(pageHtml, 'text/html');
  const root = doc.querySelector('.mw-parser-output') || doc.body;
  const start = [...root.querySelectorAll('h2')].find((h) => /^(guide|walkthrough)$/i.test(headline(h)));
  if (!start) return { html: '', text: '' };

  const out = document.createElement('div');
  for (let n = start.nextSibling; n; n = n.nextSibling) {
    if (n.nodeName === 'H2' && GUIDE_STOP.has(headline(n).toLowerCase())) break;
    clean(n, out);
  }
  return { html: out.innerHTML.trim(), text: plainText(out) };
}

// Text for finding the trigger sentence: pictures, tables and block edges
// become line breaks so captions don't run into the prose.
function plainText(el) {
  const copy = el.cloneNode(true);
  copy.querySelectorAll('figure, table, .guide-gallery').forEach((n) => n.replaceWith('\n'));
  copy.querySelectorAll('p, li, h3, h4, div, blockquote, br').forEach((n) => n.after('\n'));
  return copy.textContent.replace(/[ \t]+/g, ' ').trim();
}

// Rebuild the wiki's markup from an allowlist: no scripts, styles, classes
// or event attributes survive, only structure, text, links and images.
const KEEP = new Set(['p', 'ul', 'ol', 'li', 'table', 'thead', 'tbody', 'tr', 'td', 'th', 'b', 'strong', 'i', 'em', 'br', 'blockquote', 'h3', 'h4']);
const RENAME = { h2: 'h3', h3: 'h4', h5: 'h4', h6: 'h4', dl: 'div', dd: 'p', dt: 'p', center: 'div' };
const DROP = 'script, style, noscript, sup.reference, .reference, .mw-editsection, .toc, .navbox, aside, .portable-infobox, .lightbox-caption';

function imageOf(el) {
  const img = el.nodeName === 'IMG' ? el : el.querySelector('img');
  if (!img) return null;
  const src = img.getAttribute('data-src') || img.getAttribute('src') || '';
  if (!src.startsWith(IMG_HOST)) return null;
  return {
    src: src.replace(/\/scale-to-width-down\/\d+/, '/scale-to-width-down/640'),
    full: src.replace(/\/scale-to-width-down\/\d+/, ''),
    alt: img.getAttribute('data-caption') || img.getAttribute('alt') || '',
  };
}

function figure(el, out) {
  const im = imageOf(el);
  if (!im) return;
  const caption = (el.querySelector('.lightbox-caption, .thumbcaption, figcaption')?.textContent || im.alt).trim();
  const fig = document.createElement('figure');
  const a = document.createElement('a');
  a.href = im.full;
  a.target = '_blank';
  a.rel = 'noopener noreferrer';
  const img = document.createElement('img');
  img.src = im.src;
  img.alt = caption;
  img.loading = 'lazy';
  img.decoding = 'async';
  img.referrerPolicy = 'no-referrer';
  a.append(img);
  fig.append(a);
  if (caption) {
    const cap = document.createElement('figcaption');
    cap.textContent = caption;
    fig.append(cap);
  }
  out.append(fig);
}

function clean(node, out) {
  if (node.nodeType === Node.TEXT_NODE) {
    out.append(node.textContent);
    return;
  }
  if (node.nodeType !== Node.ELEMENT_NODE || node.matches(DROP)) return;
  const tag = node.nodeName.toLowerCase();

  // Galleries and thumbnails become plain figures with their caption.
  if (node.matches('.wikia-gallery-item, figure, .thumb, .floatleft, .floatright') || tag === 'img') {
    figure(node, out);
    return;
  }
  if (node.matches('.wikia-gallery, .gallery')) {
    const g = document.createElement('div');
    g.className = 'guide-gallery';
    node.querySelectorAll('.wikia-gallery-item, .gallerybox, figure').forEach((item) => figure(item, g));
    if (g.childElementCount) out.append(g);
    return;
  }

  let el = null;
  if (tag === 'a') {
    const href = node.getAttribute('href') || '';
    const abs = href.startsWith('/wiki/') ? WIKI + href : /^https?:\/\//.test(href) ? href : '';
    if (abs && !node.querySelector('img')) {
      el = document.createElement('a');
      el.href = abs;
      el.target = '_blank';
      el.rel = 'noopener noreferrer';
    }
  } else if (tag === 'li' && !node.parentElement?.matches('ul, ol')) {
    el = document.createElement('p'); // stray <li>s the wiki uses for layout
  } else if (KEEP.has(tag) || RENAME[tag]) {
    el = document.createElement(RENAME[tag] || tag);
    for (const attr of ['colspan', 'rowspan']) if (node.hasAttribute(attr)) el.setAttribute(attr, node.getAttribute(attr));
  }

  const target = el || out; // anything else is unwrapped: children kept
  node.childNodes.forEach((child) => clean(child, target));
  if (el && (el.childNodes.length || tag === 'br')) out.append(el);
}
