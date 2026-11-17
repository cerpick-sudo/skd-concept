"""Validate and stage a fixed static site; verify downloaded Pages bytes."""
import hashlib
import json
import os
import re
import shutil
import sys
import time
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parent.parent
FILES = json.loads((ROOT / 'site-manifest.json').read_text(encoding='utf-8'))
SITE_URL = 'https://cerpick-sudo.github.io/skd-concept/'


def verify_folder(folder):
    paths = list(folder.rglob('*'))
    assert not any(p.is_symlink() for p in paths), 'Symbolic link in payload'
    actual = sorted(p.relative_to(folder).as_posix() for p in paths if p.is_file())
    assert actual == sorted(FILES), f'Unexpected payload files: {actual}'
    for name, digest in FILES.items():
        assert hashlib.sha256((folder / name).read_bytes()).hexdigest() == digest, name
    print(f'PASS: {len(FILES)} files match the reviewed SHA-256 manifest')


class References(HTMLParser):
    def __init__(self):
        super().__init__()
        self.urls = []
        self.ids = set()

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if 'id' in attrs:
            assert attrs['id'] not in self.ids, f'Duplicate ID: {attrs["id"]}'
            self.ids.add(attrs['id'])
        self.urls.extend(attrs[key] for key in ('src', 'href') if key in attrs)


def check():
    verify_folder(ROOT / 'site')
    parser = References()
    parser.feed((ROOT / 'site/index.html').read_text(encoding='utf-8'))
    css = (ROOT / 'site/style.css').read_text(encoding='utf-8')
    urls = parser.urls + [u.strip(' \"\'') for u in re.findall(r'url\(([^)]+)\)', css)]
    for value in urls:
        url = urlsplit(value)
        assert not url.scheme and not url.netloc, f'External resource: {value}'
        assert not url.path.startswith('/'), f'Root-relative resource: {value}'
        if url.path:
            relative = url.path.removeprefix('./')
            assert relative in FILES, f'Missing or unapproved resource: {value}'
        if url.fragment and not url.path:
            assert url.fragment in parser.ids, f'Missing anchor: {value}'
    print('PASS: local resources and anchors resolve under /skd-concept/')


def build():
    check()
    stage = ROOT / '_site'
    stage.mkdir(exist_ok=False)
    for name in FILES:
        destination = stage / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(ROOT / 'site' / name, destination)
    verify_folder(stage)
    print('PASS: build contains only the seven site files')


def verify_http():
    nonce = os.environ.get('GITHUB_SHA', 'manual')
    failures = []
    for attempt in range(1, 19):
        failures = []
        for name, digest in FILES.items():
            url = SITE_URL + name + '?verify=' + nonce
            try:
                request = Request(url, headers={'Cache-Control': 'no-cache'})
                with urlopen(request, timeout=20) as response:
                    assert response.status == 200, response.status
                    actual = hashlib.sha256(response.read()).hexdigest()
                assert actual == digest, f'SHA-256 mismatch: {name}'
            except Exception as error:
                failures.append(f'{name}: {error}')
        if not failures:
            print('PASS: all seven published files downloaded and match SHA-256')
            return
        print(f'Propagation check {attempt}/18: ' + '; '.join(failures), flush=True)
        if attempt < 18:
            time.sleep(10)
    raise RuntimeError('\n'.join(failures))


if __name__ == '__main__':
    commands = {'check': check, 'build': build, 'verify-http': verify_http}
    if len(sys.argv) != 2 or sys.argv[1] not in commands:
        raise SystemExit('Usage: python tools/site.py check|build|verify-http')
    commands[sys.argv[1]]()
