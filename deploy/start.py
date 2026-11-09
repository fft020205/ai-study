"""One container, one stateful API worker; Railway terminates HTTPS."""
import os
from pathlib import Path
import signal
import subprocess
import sys
import time
import urllib.request
from urllib.parse import urlsplit


def production_environment():
    env = os.environ.copy()
    domain = env.get('RAILWAY_PUBLIC_DOMAIN', '')
    origin = env.get('PUBLIC_URL') or (f'https://{domain}' if domain else '')
    parsed = urlsplit(origin)
    if parsed.scheme != 'https' or not parsed.hostname or parsed.path not in ('', '/') or parsed.query or parsed.fragment or parsed.username or parsed.password:
        raise SystemExit('Configure PUBLIC_URL to the exact HTTPS site origin, or generate a Railway public domain.')
    data = Path(env.get('STUDY_DATA_DIR', '/data'))
    if not data.is_dir() or not os.access(data, os.W_OK):
        raise SystemExit('Mount a persistent writable volume at /data before starting the service.')
    if not env.get('AI_API_KEY') or not env.get('AI_MODEL') or not env.get('AI_BASE_URL'):
        raise SystemExit('Configure AI_API_KEY, AI_MODEL, and AI_BASE_URL as server runtime variables.')
    ai_url=urlsplit(env['AI_BASE_URL'])
    if ai_url.scheme!='https' or not ai_url.hostname or ai_url.username or ai_url.password or ai_url.query or ai_url.fragment:
        raise SystemExit('AI_BASE_URL must be an HTTPS API base URL without credentials or query parameters.')
    env.update(AUTH_REQUIRED='true', COOKIE_SECURE='true', AI_SETTINGS_ENABLED='false', AI_PROVIDER='openai',
               ALLOWED_ORIGINS=origin.rstrip('/'), DATABASE_URL=f'sqlite:///{data}/study.db',
               AI_CONFIG_PATH='/app/disabled-ai-connection.json')
    env.setdefault('REGISTRATION_ENABLED', 'true')
    env.setdefault('AI_DAILY_CALLS_PER_USER', '100')
    env.setdefault('AI_DAILY_CALLS_TOTAL', '1000')
    return env


def main():
    os.umask(0o077)
    env = production_environment()
    port = int(env.get('PORT', '8080'))
    if not 1024 <= port <= 65535:
        raise SystemExit('PORT must be between 1024 and 65535.')
    config = Path('/app/deploy/nginx.conf').read_text().replace('__PORT__', str(port))
    Path('/tmp/study-nginx.conf').write_text(config)
    children = []
    stopping = False

    def stop(*_):
        nonlocal stopping
        if stopping:
            return
        stopping = True
        for child in reversed(children):
            if child.poll() is None:
                child.terminate()

    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        children.append(subprocess.Popen([sys.executable, '-m', 'uvicorn', 'study.main:app', '--app-dir', '/app/services/api',
                                         '--host', '127.0.0.1', '--port', '18000', '--workers', '1', '--no-access-log'], env=env))
        children.append(subprocess.Popen(['node', '/app/web/apps/web/server.js'], env={**env, 'PORT': '3000', 'HOSTNAME': '127.0.0.1'}))
        for _ in range(120):
            if stopping or any(c.poll() is not None for c in children):
                raise RuntimeError('A service stopped during startup.')
            try:
                for url in ['http://127.0.0.1:18000/api/health', 'http://127.0.0.1:3000/']:
                    with urllib.request.urlopen(url, timeout=1) as response:
                        if response.status != 200:
                            raise OSError('Service is not ready.')
                break
            except OSError:
                time.sleep(0.5)
        else:
            raise RuntimeError('Services did not become ready.')
        children.append(subprocess.Popen(['nginx', '-c', '/tmp/study-nginx.conf', '-g', 'daemon off;'], env=env))
        while not stopping and all(c.poll() is None for c in children):
            time.sleep(0.5)
        if not stopping:
            raise RuntimeError('A service stopped unexpectedly.')
    finally:
        stop()
        for child in children:
            try:
                child.wait(timeout=10)
            except subprocess.TimeoutExpired:
                child.kill()
                child.wait()


if __name__ == '__main__':
    main()
