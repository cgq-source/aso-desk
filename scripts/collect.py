#!/usr/bin/env python3
"""Collect only public Apple data. Retain the last good reading on source errors."""
import argparse
import datetime as dt
import json
import time
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
LAST_REQUEST = 0.0
SOURCE = 'apple-search-api-v1'

def now():
    return dt.datetime.now(dt.timezone.utc).isoformat().replace('+00:00', 'Z')

def get(url):
    global LAST_REQUEST
    for attempt in range(2):
        time.sleep(max(0, 3.8 - (time.monotonic() - LAST_REQUEST)))
        LAST_REQUEST = time.monotonic()
        try:
            req = urllib.request.Request(url, headers={'User-Agent': 'ASODesk/1.0 public-data-collector', 'Accept': 'application/json'})
            with urllib.request.urlopen(req, timeout=18) as response:
                return json.load(response)
        except (urllib.error.URLError, TimeoutError, json.JSONDecodeError) as error:
            if attempt or isinstance(error, urllib.error.HTTPError) and error.code in (400, 401, 403, 404):
                raise
            print('One source retry:', urllib.parse.urlparse(url).hostname, flush=True)

def app(raw):
    return {'id': str(raw['trackId']), 'name': raw.get('trackName', ''), 'subtitle': '',
            'description': raw.get('description', ''), 'category': raw.get('primaryGenreName', ''),
            'genres': raw.get('genres', []), 'developer': raw.get('artistName', raw.get('sellerName', '')),
            'rating': raw.get('averageUserRating'), 'ratingCount': raw.get('userRatingCount'),
            'version': raw.get('version', ''), 'icon': raw.get('artworkUrl100', ''),
            'url': raw.get('trackViewUrl', ''), 'languages': raw.get('languageCodesISO2A', [])}

def collect(root=ROOT):
    config = json.loads((root / 'data/collection-config.json').read_text())
    dest = root / 'data/public.json'
    old = json.loads(dest.read_text()) if dest.exists() else {'schema': 1, 'apps': [], 'searches': [], 'charts': [], 'reviews': [], 'histories': {}}
    old.setdefault('histories', {})
    searches = {(r['appId'], r['country'], r['term']): r for r in old['searches']}
    charts = {(r['country'], r['type']): r for r in old['charts']}
    reviews = {(r['appId'], r['country']): r for r in old['reviews']}
    apps = {a['id']: a for a in old['apps']}
    errors = []
    def failed(kind, url, error):
        errors.append({'kind': kind, 'sourceURL': url, 'checkedAt': now(), 'error': type(error).__name__, 'status': 'error'})
        print('Source unavailable; retained last good reading:', kind, type(error).__name__, flush=True)
    for item in config['apps']:
        ident = str(item['id'])
        for country in item['countries']:
            base = 'https://itunes.apple.com/'
            url = base + 'lookup?' + urllib.parse.urlencode({'id': ident, 'country': country})
            previous = apps.get(ident, {}).get('storefronts', {}).get(country, apps.get(ident, {}))
            try:
                data = get(url)
                raw = next(r for r in data['results'] if str(r['trackId']) == ident)
                meta = app(raw)
                meta.update({'subtitle': previous.get('subtitle', ''), 'subtitleSource': previous.get('subtitleSource', 'not returned by Lookup API'), 'checkedAt': now(), 'sourceURL': url})
                entry = apps.setdefault(ident, dict(meta))
                entry.setdefault('storefronts', {})[country] = meta
                if country == 'us':
                    entry.update({k: v for k, v in meta.items() if k != 'storefronts'})
                print('App lookup:', ident, country, meta['version'], flush=True)
            except (urllib.error.URLError, TimeoutError, ValueError, StopIteration, KeyError) as error:
                failed('lookup', url, error)
                meta = previous
            for term in item['keywords']:
                url = base + 'search?' + urllib.parse.urlencode({'term': term, 'country': country, 'media': 'software', 'entity': 'software', 'limit': 200})
                try:
                    data = get(url)
                    results = data['results']
                    pos = next((i+1 for i, r in enumerate(results) if str(r.get('trackId')) == ident), None)
                    record = {'appId': ident, 'country': country, 'term': term.lower().strip(), 'source': SOURCE, 'sourceURL': url,
                              'status': 'ok', 'checkedAt': now(), 'position': pos, 'returned': len(results), 'limit': 200,
                              'topResults': [app(r) for r in results[:20]]}
                    searches[(ident, country, record['term'])] = record
                    hk = '|'.join([ident, country, record['term']])
                    hist = old['histories'].get(hk, [])
                    point = {k: record[k] for k in ['checkedAt', 'position', 'returned', 'source']}
                    point['date'] = record['checkedAt'][:10]
                    old['histories'][hk] = ([p for p in hist if not (p['date'] == point['date'] and p['source'] == SOURCE)] + [point])[-365:]
                    print('Keyword:', country, term, 'position', pos, 'returned', len(results), flush=True)
                except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                    failed('search', url, error)
                    # Stop this source batch after one failed request/fallback pair.
                    break
            url = f'{base}{country}/rss/customerreviews/id={ident}/sortby=mostrecent/json'
            try:
                data = get(url)
                result = []
                for r in data.get('feed', {}).get('entry', []):
                    if 'im:rating' not in r:
                        continue
                    result.append({'id': r.get('id', {}).get('label'), 'title': r.get('title', {}).get('label', ''),
                                   'body': r.get('content', {}).get('label', ''), 'rating': int(r['im:rating']['label']),
                                   'author': r.get('author', {}).get('name', {}).get('label'),
                                   'version': r.get('im:version', {}).get('label'), 'date': r.get('updated', {}).get('label')})
                reviews[(ident, country)] = {'appId': ident, 'country': country, 'sourceURL': url, 'checkedAt': now(), 'results': result}
                print('Reviews:', country, len(result), flush=True)
            except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
                failed('reviews', url, error)
    for item in config.get('charts', []):
        country, kind = item['country'], item['type']
        url = f'https://rss.marketingtools.apple.com/api/v2/{country}/apps/top-free/100/apps.json' if kind == 'apps-free' else f'https://itunes.apple.com/{country}/rss/topfreeapplications/limit=100/genre=6014/json'
        try:
            data = get(url)
            results = []
            for r in data['feed'].get('results', data['feed'].get('entry', [])):
                if isinstance(r.get('id'), dict):
                    results.append({'id': r['id']['attributes']['im:id'], 'name': r['im:name']['label'], 'developer': r.get('im:artist', {}).get('label', ''), 'icon': r['im:image'][-1]['label'], 'url': r['id']['label'], 'category': r.get('category', {}).get('attributes', {}).get('label', '')})
                else:
                    results.append({'id': str(r['id']), 'name': r['name'], 'developer': r.get('artistName', ''), 'icon': r.get('artworkUrl100', ''), 'url': r.get('url', ''), 'category': (r.get('genres') or [{}])[0].get('name', '')})
            charts[(country, kind)] = {'country': country, 'type': kind, 'sourceURL': url, 'checkedAt': now(), 'results': results}
            print('Chart:', country, kind, len(results), flush=True)
        except (urllib.error.URLError, TimeoutError, ValueError, KeyError) as error:
            failed('chart', url, error)
    output = {'schema': 1, 'checkedAt': now(), 'apps': list(apps.values()), 'searches': list(searches.values()), 'charts': list(charts.values()), 'reviews': list(reviews.values()), 'histories': old['histories'], 'collectionErrors': errors,
              'notice': 'Public Apple data only. API positions are not device-specific App Store ranks. Unknown popularity is not estimated.'}
    if not output['apps']:
        raise RuntimeError('No app metadata is available; no output was written.')
    tmp = dest.with_suffix('.tmp')
    tmp.write_text(json.dumps(output, ensure_ascii=False, indent=2) + '\n')
    tmp.replace(dest)
    print('Collection saved. Source errors:', len(errors), flush=True)

if __name__ == '__main__':
    p = argparse.ArgumentParser()
    p.add_argument('--root', type=Path, default=ROOT)
    args = p.parse_args()
    collect(args.root)
