#!/usr/bin/env python3
"""Provision/inspect this GitHub deployment using an existing git credential helper.

Credentials stay in process memory and are sent only to api.github.com.
No credential values are printed, persisted, or passed as command arguments.
"""
import argparse
import base64
import json
import os
import subprocess
import urllib.error
import urllib.request

OWNER = 'cgq-source'
REPO = 'aso-desk'
BASE = f'/repos/{OWNER}/{REPO}'

def credential():
    p = subprocess.run(['git', 'credential', 'fill'], input=f'protocol=https\nhost=github.com\nusername={OWNER}\n\n', text=True, capture_output=True, timeout=20,
                       env={**os.environ, 'GIT_TERMINAL_PROMPT': '0', 'GIT_ASKPASS': '/usr/bin/false'})
    if p.returncode:
        raise RuntimeError('Existing GitHub credential unavailable.')
    values = dict(line.split('=', 1) for line in p.stdout.splitlines() if '=' in line)
    if not values.get('password'):
        raise RuntimeError('Existing GitHub credential unavailable.')
    return values['password']

def api(token, path, method='GET', body=None):
    data = json.dumps(body).encode() if body is not None else None
    req = urllib.request.Request('https://api.github.com' + path, data=data, method=method,
                                 headers={'Authorization': 'Bearer ' + token, 'Accept': 'application/vnd.github+json', 'Content-Type': 'application/json', 'X-GitHub-Api-Version': '2022-11-28'})
    with urllib.request.urlopen(req, timeout=20) as response:
        b = response.read()
        return json.loads(b) if b else {}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('command', choices=['prepare', 'pages', 'status', 'dispatch', 'jobs'])
    p.add_argument('--run-id')
    args = p.parse_args()
    token = credential()
    user = api(token, '/user')
    if user['login'].lower() != OWNER:
        raise RuntimeError('Authenticated GitHub account does not match the deployment owner.')
    if args.command == 'prepare':
        try:
            r = api(token, BASE)
            if r.get('size', 0):
                package = api(token, BASE + '/contents/package.json')
                content = json.loads(base64.b64decode(package['content']))
                if content.get('name') != REPO:
                    raise RuntimeError('Target repository has unrelated content; it was not changed.')
            print(json.dumps({'created': False, 'repository': r['html_url'], 'default_branch': r['default_branch']}))
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            r = api(token, '/user/repos', 'POST', {'name': REPO, 'description': 'Personal ASO workbench: public Apple data, keyword evidence, competitor coverage and local store drafts.', 'private': False, 'auto_init': False})
            print(json.dumps({'created': True, 'repository': r['html_url']}))
    elif args.command == 'pages':
        try:
            pages = api(token, BASE + '/pages')
            if pages.get('build_type') != 'workflow':
                pages = api(token, BASE + '/pages', 'PUT', {'build_type': 'workflow'})
        except urllib.error.HTTPError as error:
            if error.code != 404:
                raise
            pages = api(token, BASE + '/pages', 'POST', {'build_type': 'workflow'})
        print(json.dumps({'site': pages.get('html_url'), 'build_type': pages.get('build_type'), 'status': pages.get('status')}))
    elif args.command == 'dispatch':
        api(token, BASE + '/actions/workflows/pages.yml/dispatches', 'POST', {'ref': 'main'})
        print('{"deployment_dispatched":true}')
    elif args.command == 'status':
        r = api(token, BASE + '/actions/workflows/pages.yml/runs?per_page=3')
        print(json.dumps([{'id': x['id'], 'status': x['status'], 'conclusion': x['conclusion'], 'commit': x['head_sha'], 'url': x['html_url']} for x in r.get('workflow_runs', [])]))
    elif args.command == 'jobs':
        if not args.run_id or not args.run_id.isdigit():
            raise ValueError('A numeric run ID is required.')
        r = api(token, BASE + '/actions/runs/' + args.run_id + '/jobs')
        print(json.dumps([{'name': j['name'], 'conclusion': j['conclusion'], 'check_run_url': j['check_run_url'], 'steps': [{'name': s['name'], 'conclusion': s['conclusion']} for s in j.get('steps', [])]} for j in r.get('jobs', [])]))

if __name__ == '__main__':
    try:
        main()
    except urllib.error.HTTPError as error:
        try:
            message = json.load(error).get('message', 'Request failed')
        except Exception:
            message = 'Request failed'
        print(json.dumps({'error': 'GitHub HTTP ' + str(error.code), 'message': message}))
        raise SystemExit(1)
    except Exception as error:
        print(json.dumps({'error': str(error)}))
        raise SystemExit(1)
