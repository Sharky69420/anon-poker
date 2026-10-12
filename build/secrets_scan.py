#!/usr/bin/env python3
"""Anon Poker secrets scan. usage: python build/secrets_scan.py [folder]   (default: the repo this file lives in)
FAILS (exit 1) on: 64-number JSON byte array, base58 string 80-90 chars (secret key),
HOUSE_SECRET= with a value, private-key PEM block. Skips .git and node_modules.
WARNS (exit 0) on the known Helius devnet key in SOL_CFG (restrict it to your domain)."""
import os, re, sys
ROOT = os.path.abspath(sys.argv[1]) if len(sys.argv) > 1 else os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..'))
B58 = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz'
RULES = [
 ('64-number JSON byte array', re.compile(r'\[\s*(?:\d{1,3}\s*,\s*){63}\d{1,3}\s*\]')),
 ('base58 string 80-90 chars (looks like a secret key)', re.compile(r'(?<![%s])[%s]{80,90}(?![%s])' % (B58, B58, B58))),
 ('HOUSE_SECRET= with a value', re.compile(r'HOUSE_SECRET\s*=\s*[\'"]?[^\s\'"]{4,}')),
 ('private key PEM block', re.compile(r'-----BEGIN [A-Z ]*PRIVATE KEY-----')),
]
WARN = re.compile(r'api-key=[A-Za-z0-9-]{8,}')
fails, warns = [], []
for d, dirs, files in os.walk(ROOT):
    dirs[:] = [x for x in dirs if x not in ('.git', 'node_modules')]
    for f in files:
        p = os.path.join(d, f); rel = os.path.relpath(p, ROOT)
        if rel == os.path.join('build', 'secrets_scan.py'): continue
        try: t = open(p, encoding='utf-8', errors='ignore').read()
        except OSError: continue
        # embedded base64 images/fonts are not keys: blank them out before scanning
        t = re.sub(r'data:[\w/+.-]+;base64,[A-Za-z0-9+/=]+', 'data:BLOB', t)
        for name, rx in RULES:
            for m in rx.finditer(t):
                # a real key is 64 bytes: every number must be 0..255 (rules out e.g. constant tables)
                if name.startswith('64-number') and any(int(n) > 255 for n in re.findall(r'\d+', m.group(0))): continue
                fails.append('%s : %s : line %d' % (rel, name, t.count('\n', 0, m.start()) + 1))
        for m in WARN.finditer(t):
            warns.append('%s : line %d' % (rel, t.count('\n', 0, m.start()) + 1))
for w in sorted(set(warns)):
    print('WARNING  Helius devnet API key found in', w, '\n         Known and allowed. In the Helius dashboard, restrict this key to your site domain.')
if fails:
    for x in fails: print('FAIL    ', x)
    print('\nSECRETS SCAN FAILED: %d finding(s). Do NOT commit.' % len(fails)); sys.exit(1)
print('SECRETS SCAN PASSED (%d warning(s)).' % len(set(warns)))
