#!/usr/bin/env python3
"""
Border Hub — Deploy para GitHub Pages
Uso: python3 deploy.py
Requer Python 3 (pré-instalado no Mac)

Fluxo:
  1. Injeta timestamp no index.html
  2. Faz git commit dos arquivos alterados
  3. Push para GitHub (branch main)
  4. GitHub Pages publica automaticamente

URL do site: https://dupprehelena.github.io/border-board/
"""

import os, sys, re, subprocess, urllib.request, urllib.error, json, base64
from datetime import datetime

BOARD_DIR  = os.path.dirname(os.path.abspath(__file__))
CONFIG_FILE = os.path.join(BOARD_DIR, '.gh_config')
GH_API      = 'https://api.github.com'
SITE_URL    = 'https://dupprehelena.github.io/border-board/'

# ── Ler credenciais ───────────────────────────────────────────────────────────
def read_config():
    cfg = {}
    try:
        with open(CONFIG_FILE) as f:
            for line in f:
                line = line.strip()
                if '=' in line and not line.startswith('#'):
                    k, v = line.split('=', 1)
                    cfg[k.strip()] = v.strip()
    except FileNotFoundError:
        # Tenta ler do ambiente
        cfg['GH_TOKEN'] = os.environ.get('GH_TOKEN', '')
        cfg['GH_REPO']  = os.environ.get('GH_REPO', 'dupprehelena/border-board')
    return cfg

# ── Injetar timestamp no HTML ─────────────────────────────────────────────────
def inject_timestamp(source_dir):
    html_path = os.path.join(source_dir, 'index.html')
    ts = datetime.now().strftime('%d/%m/%Y %H:%M')
    with open(html_path, 'r', encoding='utf-8') as f:
        content = f.read()
    content = re.sub(r'<script>window\.DEPLOY_TIMESTAMP=.*?</script>\n?', '', content)
    content = content.replace('</head>', f'<script>window.DEPLOY_TIMESTAMP="{ts}";</script>\n</head>', 1)
    with open(html_path, 'w', encoding='utf-8') as f:
        f.write(content)
    print(f'  ✓ Timestamp injetado: {ts}')

# ── Git commit local ──────────────────────────────────────────────────────────
def git_commit(board_dir):
    git_dir = os.path.join(board_dir, '.git')
    if not os.path.isdir(git_dir):
        print('  ⚠ Repositório git não encontrado — pulando commit local.')
        return False

    # Remove lock órfão se existir
    for lock in ['index.lock', 'HEAD.lock']:
        lock_path = os.path.join(git_dir, lock)
        if os.path.exists(lock_path):
            try:
                os.remove(lock_path)
                print(f'  ✓ Lock órfão removido: {lock}')
            except OSError:
                print(f'  ⚠ Não foi possível remover {lock} — continuando mesmo assim.')

    try:
        status = subprocess.run(['git', 'status', '--porcelain'],
                                cwd=board_dir, capture_output=True, text=True)
        if not status.stdout.strip():
            print('  ✓ Git: nenhuma mudança local.')
            return True

        changed = [l[3:].strip() for l in status.stdout.strip().splitlines()]
        files_str = ', '.join(changed[:4]) + (f' +{len(changed)-4}' if len(changed) > 4 else '')
        msg = f'deploy: {datetime.now().strftime("%d/%m/%Y %H:%M")} — {files_str}'

        subprocess.run(['git', 'add', '-A'], cwd=board_dir, check=True, capture_output=True)
        subprocess.run(['git', 'commit', '-m', msg], cwd=board_dir, check=True, capture_output=True)
        print(f'  ✓ Git commit: {msg}')
        return True
    except subprocess.CalledProcessError as e:
        print(f'  ⚠ Git erro: {e.stderr.decode().strip() if e.stderr else str(e)}')
        return False

# ── Push via API do GitHub (não depende do git remoto configurado) ────────────
def gh_push_files(board_dir, token, repo):
    SKIP = {'.netlify_config', '.gh_config', 'deploy.py', '__pycache__',
            '.git', 'netlify', 'netlify.toml', '_headers'}

    headers = {
        'Authorization': f'token {token}',
        'Accept': 'application/vnd.github.v3+json',
        'Content-Type': 'application/json',
        'User-Agent': 'border-board-deploy'
    }

    def gh(method, path, data=None):
        url = f'{GH_API}{path}'
        body = json.dumps(data).encode() if data else None
        req = urllib.request.Request(url, data=body, headers=headers, method=method)
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                return json.loads(r.read()), r.status
        except urllib.error.HTTPError as e:
            return json.loads(e.read()), e.code

    def get_sha(path):
        res, status = gh('GET', f'/repos/{repo}/contents/{path}')
        return res.get('sha') if status == 200 else None

    files = []
    for root, dirs, fnames in os.walk(board_dir):
        dirs[:] = [d for d in dirs if d not in SKIP and not d.startswith('.')]
        for fname in fnames:
            if fname in SKIP or fname.startswith('.') or fname.endswith(('.bak', '.zip', '.pyc')):
                continue
            full = os.path.join(root, fname)
            rel = os.path.relpath(full, board_dir)
            if rel.split(os.sep)[0] in SKIP:
                continue
            files.append((rel, full))

    # Garante que .nojekyll existe (desativa Jekyll, essencial para o Pages funcionar)
    nojekyll_sha = get_sha('.nojekyll')
    nj_data = {'message': 'chore: garante .nojekyll', 'content': '', 'branch': 'main'}
    if nojekyll_sha:
        nj_data['sha'] = nojekyll_sha
    gh('PUT', f'/repos/{repo}/contents/.nojekyll', nj_data)

    ts = datetime.now().strftime('%d/%m/%Y %H:%M')
    ok_count = 0
    print(f'  Enviando {len(files)} arquivos para GitHub...')
    for rel, full in sorted(files):
        with open(full, 'rb') as f:
            content = f.read()
        sha = get_sha(rel)
        data = {
            'message': f'deploy: {ts} — {rel}',
            'content': base64.b64encode(content).decode(),
            'branch': 'main'
        }
        if sha:
            data['sha'] = sha
        _, status = gh('PUT', f'/repos/{repo}/contents/{rel}', data)
        ok = status in (200, 201)
        print(f'    {"✓" if ok else "✗"} {rel}')
        if ok:
            ok_count += 1

    return ok_count, len(files)

# ── Main ──────────────────────────────────────────────────────────────────────
def main():
    print('\n── Border Hub — Deploy GitHub Pages ─────────────')
    cfg = read_config()
    token = cfg.get('GH_TOKEN', '')
    repo  = cfg.get('GH_REPO', 'dupprehelena/border-board')

    if not token:
        print('❌  Token do GitHub não encontrado.')
        print('    Crie o arquivo .gh_config com: GH_TOKEN=ghp_...')
        sys.exit(1)

    print(f'Repo: {repo}')

    print('\nInjetando timestamp...')
    inject_timestamp(BOARD_DIR)

    print('\nCommit local...')
    git_commit(BOARD_DIR)

    print('\nEnviando para GitHub:')
    ok, total = gh_push_files(BOARD_DIR, token, repo)

    print(f'\n{"✅" if ok == total else "⚠️ "}  {ok}/{total} arquivos enviados')
    print(f'   GitHub Pages atualiza em ~30 segundos')
    print(f'   URL: {SITE_URL}')
    print('─────────────────────────────────────────────────\n')

if __name__ == '__main__':
    main()
