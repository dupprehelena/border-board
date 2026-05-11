// ══════════════════════════════════════════════════════════════════════
// BORDER BI — board.js
// Desenvolvido para Helena Duppre | Border Ltd
// Última revisão: 28/04/2026
//
// ESTRUTURA DO ARQUIVO:
//   1. Store (persistência local)          → linha ~1
//   2. System Prompts (contexto da IA)     → linha ~70
//   3. Utilitários gerais                  → linha ~100
//   4. Chamadas à API Anthropic            → linha ~140
//   5. Funções de IA por painel            → linha ~285
//   6. Scan do Site (CORS + análise)       → linha ~365
//   7. SWOT, Concorrentes, Planejador      → linha ~610
//   8. Tendências                          → linha ~1020
//   9. Sistema de timestamps/automação     → linha ~1132
//  10. Navegação e sidebar mobile          → linha ~1214
//  11. Influencers Discovery               → linha ~1243
//  12. Tags, Métricas, Content Log         → linha ~1526
//  13. Decisão da semana, Testes, Aprend.  → linha ~1652
//  14. Log semanal, Theme, Versionamento   → linha ~1763
//  15. Banco de Referências                → linha ~1958
//  16. Followers editor                    → linha ~2029
//  17. Monitoring data loader (data.json)  → linha ~2065
//  18. Business Model Canvas               → linha ~2326
//  19. Meta Ads · Guia                     → linha ~2495
// ══════════════════════════════════════════════════════════════════════

// ── CONFIGURAÇÃO DO MODELO ──────────────────────────────────────────
// Para atualizar o modelo da IA em todos os lugares, mude APENAS esta constante.
// Modelos disponíveis (abril 2026):
//   claude-opus-4-7    → mais capaz, ideal para análises complexas (SWOT, estratégia)
//   claude-sonnet-4-6  → mais rápido e barato, bom para copy e geração de conteúdo
//   claude-haiku-4-5   → mais leve, para tarefas simples
const AI_MODEL = 'claude-opus-4-7';

// ══════════════════════════════════════════════════════════════════════
// SYNC COM GITHUB — PERSISTÊNCIA REAL DO HISTÓRICO DE ANÁLISES
// ══════════════════════════════════════════════════════════════════════
// O histórico de análises (VER_KEY) é sincronizado com o data.json do
// repositório GitHub. Isso garante que o histórico persiste entre
// dispositivos, limpezas de cache e sessões.
//
// Fluxo:
//   1. Na inicialização: puxa data.json do GitHub e faz merge com localStorage
//   2. A cada nova análise salva: envia o histórico atualizado para o GitHub
//
// Configuração (feita uma vez em Configurações):
//   GH_TOKEN — Personal Access Token com permissão "repo"
//   GH_REPO  — ex: "dupprehelena/border-board"
//
// As funções são assíncronas e silenciosas: nunca bloqueiam a UI.

const GH_API = 'https://api.github.com';
const GH_HISTORY_PATH = 'data.json'; // arquivo no repo onde o histórico fica

async function ghHeaders() {
  const token = store.ghToken;
  if (!token) return null;
  return {
    'Authorization': `token ${token}`,
    'Accept': 'application/vnd.github.v3+json',
    'Content-Type': 'application/json'
  };
}

// Lê o data.json do GitHub e retorna o objeto parsed (ou null se falhar)
async function ghReadDataJson() {
  const repo = store.ghRepo;
  const hdrs = await ghHeaders();
  if (!repo || !hdrs) return null;
  try {
    const res = await fetch(`${GH_API}/repos/${repo}/contents/${GH_HISTORY_PATH}`, { headers: hdrs });
    if (!res.ok) return null;
    const meta = await res.json();
    const content = atob(meta.content.replace(/\n/g, ''));
    return { data: JSON.parse(content), sha: meta.sha };
  } catch(e) { return null; }
}

// Escreve o data.json no GitHub (merge do histórico)
async function ghWriteDataJson(newHistorico) {
  const repo = store.ghRepo;
  const hdrs = await ghHeaders();
  if (!repo || !hdrs) return false;
  try {
    // Lê SHA atual (necessário para update)
    const current = await ghReadDataJson();
    const dataAtual = current?.data || {};
    // Merge: une histórico remoto com o novo, sem duplicar por id
    const merged = { ...dataAtual };
    merged.historico = merged.historico || {};
    Object.keys(newHistorico).forEach(painel => {
      const remotos = merged.historico[painel] || [];
      const idsRemotos = new Set(remotos.map(v => v.id));
      const novos = (newHistorico[painel] || []).filter(v => !idsRemotos.has(v.id));
      merged.historico[painel] = [...novos, ...remotos].slice(0, 20);
    });
    merged.lastSync = new Date().toLocaleString('pt-BR');

    const body = { message: `sync: análise salva — ${new Date().toLocaleString('pt-BR')}`,
                   content: btoa(unescape(encodeURIComponent(JSON.stringify(merged, null, 2)))),
                   branch: 'main' };
    if (current?.sha) body.sha = current.sha;

    const res = await fetch(`${GH_API}/repos/${repo}/contents/${GH_HISTORY_PATH}`,
      { method: 'PUT', headers: hdrs, body: JSON.stringify(body) });
    return res.ok;
  } catch(e) { return false; }
}

// Puxa histórico do GitHub e faz merge no localStorage (chamado na inicialização)
async function ghSyncDown() {
  const result = await ghReadDataJson();
  if (!result?.data?.historico) return;
  const remoto = result.data.historico;
  const local = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
  let adicionadas = 0;
  Object.keys(remoto).forEach(painel => {
    if (!local[painel]) local[painel] = [];
    const idsLocais = new Set(local[painel].map(v => v.id));
    const novas = (remoto[painel] || []).filter(v => !idsLocais.has(v.id));
    local[painel] = [...novas, ...local[painel]].slice(0, 20);
    adicionadas += novas.length;
  });
  localStorage.setItem(VER_KEY, JSON.stringify(local));
  if (adicionadas > 0) console.log(`[GitHub Sync] ${adicionadas} análises importadas do repositório.`);
  updateHistoricoStats();
}

// Envia o histórico atual para o GitHub (chamado após saveVersionFull)
async function ghSyncUp() {
  const all = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
  const ok = await ghWriteDataJson(all);
  if (ok) {
    const badge = document.getElementById('gh-sync-badge');
    if (badge) { badge.textContent = '↑ sincronizado'; badge.style.color = 'var(--green)'; setTimeout(()=>{badge.textContent='';},3000); }
  }
}

// ── STORE — PERSISTÊNCIA LOCAL ──────────────────────────────────────
// Todos os dados do usuário são salvos no localStorage com a chave SK.
// O sessionStorage serve como backup caso o localStorage seja limpo.
// O objeto `store` é carregado na inicialização e salvo a cada modificação.
const SK = 'border_hub_v5';
function loadStore(){try{const r=localStorage.getItem(SK);if(r)return JSON.parse(r);}catch(e){}return{};}
function saveStore(){try{localStorage.setItem(SK,JSON.stringify(store));sessionStorage.setItem(SK+'_bk',JSON.stringify(store));}catch(e){}}
let store = loadStore();
// Se o store principal estiver vazio, tenta recuperar do backup de sessão
if(!store||Object.keys(store).length===0){try{const bk=sessionStorage.getItem(SK+'_bk');if(bk)store=JSON.parse(bk);}catch(e){}}

// ── SYSTEM PROMPTS ───────────────────────────────────────────────────
// SYSTEM: usado em funções analíticas (SWOT, análise de concorrentes, métricas)
// SYSTEM_CRIATIVO: usado em funções de criação de conteúdo (brief, copy, roteiro, caption)
// Separar os dois prompts permite ajustar o tom sem afetar a análise estratégica.

// ── SYSTEM PROMPT (análise estratégica e dados) ──
const SYSTEM = `Você é o estrategista de marca da Border Ltd, uma marca de street alfaiataria brasileira independente.

IDENTIDADE:
- Nome: Border — Unbound Garments
- Posicionamento: street alfaiataria sem gênero, Brasil
- Princípio: "não explica — mostra". A identidade emerge pela imagem, não pela declaração.
- Público primário: mulheres com estética forte e autoral, 20-32 anos, SP/RJ/BH
- Públicos secundários: homens street+alfaiataria, mulheres street que chegam pela estética
- Produtos Drop N.01: Costela de Adão (boxy R$289), Jibóia (boxy R$289), Border—Crew (oversized R$209), Border Basic (street R$159)
- Tom: sério, econômico, direto. Nunca hype. Nunca explica identidade — a imagem comunica.
- Referências: about:blank, Aime Leon Dore, Obey, Soleil Passionnés
- Concorrentes BR: Class Official (170K), Bolovo (214K), Welcome Sunny Garments (120K), Back to Eden (22K), The Dust Company (154K · CONCORRENTE DIRETO · modelagem próxima · mesmo público · omnichannel), HIST / How I See Things (~15K est · maior sobreposição de linguagem · street alfaiataria SP · loja física Pinheiros · ticket R$144–R$645), Desgosto (~28K · nicho alternativo · ameaça direta), Piet (~85K · streetwear conceitual SP · monitorar), Pace (~42K · street independente · monitorar)
- Site: borderltd.com.br · Instagram/TikTok: @border.ltd

ESTRATÉGIA DE LINGUAGEM (3 camadas):
- Camada 1 — Marca (implícita): sem declaração de identidade. Casting e imagem comunicam.
- Camada 2 — Conteúdo (semi-explícita): termos de identidade podem aparecer em storytelling e bastidores de forma natural
- Camada 3 — Distribuição (explícita): hashtags e segmentação de ads usam termos de nicho para descoberta

DADOS DE PERFORMANCE REAIS (fev–mai 2026):

RESUMOS MENSAIS:
- Fevereiro: 2 mil views (+9% vs jan), 43% views de não-seguidores, 46 seguidores (+8 vs jan)
- Março: 4.900 views (+138% vs fev), 53% não-seguidores (+195% vs fev), 206 seguidores (+160 vs fev)
- Abril (parcial 18 mar–16 abr): 15.194 views totais (51% ads), 405 interações, 56 novos seguidores, base total 246 (+29,5%)
- Maio (últimos 30 dias até 01/05): 21.551 views totais, 415 interações, base total 289 seguidores

PAINEL PROFISSIONAL (últimos 30 dias — referência 01/05/2026):
- Visualizações: 21.551 · Seguidores: 20,5% · Não-seguidores: 79,5%
- Contas alcançadas: 20.221
- Interações: 415 · Seguidores: 57,8% · Não-seguidores: 42,2%
- Contas com engajamento: 224
- Por tipo de visualização: Stories 41,8%, Reels 33,3%, Posts 25,0%
- Por tipo de interação: Posts 58,8%, Reels 38,3%, Stories 2,9%

ATIVIDADE DO PERFIL (últimos 30 dias):
- Total: 695 · Visitas ao perfil: 649 · Toques em links externos: 46

SEGUIDORES (últimos 30 dias):
- Total: 289 · Crescimento vs abril: +43 (+17,5%)
- Horários mais ativos (seg): 15h (124), 12h (122), 9h (122), 6h (115), 3h (97), 18h (86), 0h (37), 21h (27)

HISTÓRICO DE SEGUIDORES:
- Jan 2026: ~38 · Fev 2026: ~46 · Mar 2026: 206 · Abr 2026 (base): 246 · Mai 2026: 289

PROBLEMAS IDENTIFICADOS:
1. Crescimento orgânico de seguidores ainda lento — +43 em 30 dias, base pequena (289)
2. Stories lideram visualizações (41,8%) mas geram apenas 2,9% das interações — gap de engajamento
3. Posts geram 58,8% das interações mas apenas 25% das views — conteúdo de alta conversão
4. Reels equilibrados: 33,3% views + 38,3% interações — formato mais eficiente em engajamento/alcance

Responda em português brasileiro. Seja direto, sem floreios. Sem emojis. Sem hype. Linguagem de profissional de moda/branding. Use os dados reais ao argumentar — não generalize.`;

// ── SYSTEM PROMPT CRIATIVO (voz-helena — usado em brief, copy, roteiro, caption) ──
const SYSTEM_CRIATIVO = `Você é a voz criativa da Border Ltd. Escreve como a marca fala — e a marca tem posição.

A Border é street alfaiataria brasileira independente. Sem gênero declarado. Sem didatismo. A identidade emerge pela imagem — casting, styling, direção de arte. O texto apoia. Nunca define.

TOM DE VOZ DA MARCA (e como você escreve):
- Sério. Econômico. Poético quando necessário — não por ornamento, por precisão.
- Sem hype. Sem "chegou o drop dos sonhos". Sem exclamações de efeito.
- Sem explicar a identidade da marca. Quem reconhece, reconhece.
- Frases curtas quando a ideia é forte. Pausa intencional. Ritmo.
- Pergunta retórica quando serve pra virar o raciocínio — não como muleta.
- Vocabulário do universo: desfem, queer masc, tomboy, genderless — sem tradução forçada, sem didatismo.
- Nunca: "no cenário atual", "é importante ressaltar", "tendo em vista", "certamente", conclusões motivacionais genéricas.

IDENTIDADE DA MARCA:
- Nome: Border — Unbound Garments
- Posicionamento: street alfaiataria sem gênero, Brasil. Caimento masculino, tecidos diferenciados, rigor construtivo.
- Princípio: não explica — mostra.
- Público primário: mulheres desfem, estética forte e autoral, 20–32 anos, SP/RJ/BH.
- Produtos Drop N.01: Costela de Adão (boxy fit · off white · R$289), Jibóia (boxy fit · off white · R$289), Border—Crew (oversized · preto · R$209), Border Basic (street fit · off white · R$159)
- Referências: about:blank, Aime Leon Dore, Obey, Soleil Passionnés
- Site: borderltd.com.br · Instagram/TikTok: @border.ltd

ESTRATÉGIA DE LINGUAGEM (3 camadas — respeite sempre):
- Camada 1 — Marca (implícita): sem declaração de identidade em materiais institucionais. Casting e imagem comunicam.
- Camada 2 — Conteúdo (semi-explícita): termos como queer, queer masc, tomboy, desfem aparecem de forma natural em storytelling e bastidores.
- Camada 3 — Distribuição (explícita): hashtags e segmentação de ads usam termos de nicho para descoberta precisa.

Escreva em português brasileiro. Sem emojis. Sem hype. Sem floreio desnecessário. O texto que você entrega deve soar como alguém que vive esse universo — não como uma IA descrevendo uma marca.`;

// ── UTILITÁRIOS ─────────────────────────────────────────────────────

// Retorna a API Key atual — prioriza o campo input (permite troca sem recarregar)
function getKey() { return document.getElementById('api-key-input').value || store.apiKey || ''; }

function saveKey(val) {
  store.apiKey = val;
  saveStore();
  const badge = document.getElementById('api-status-badge');
  const dot = document.getElementById('status-dot');
  const txt = document.getElementById('status-text');
  if(val && val.startsWith('sk-ant-')) {
    badge.className='api-status ok'; badge.textContent='chave salva';
    dot.style.background='var(--green)'; txt.textContent='IA pronta · border.ltd';
    if(document.getElementById('settings-key')) document.getElementById('settings-key').value=val;
  } else {
    badge.className='api-status empty'; badge.textContent='sem chave';
    dot.style.background='#444'; txt.textContent='sem chave de IA';
  }
}

function clearKey() {
  store.apiKey=''; saveStore();
  document.getElementById('api-key-input').value='';
  document.getElementById('settings-key').value='';
  saveKey('');
}

/**
 * Converte Markdown básico em HTML com classes CSS reutilizáveis.
 * Não usa bibliotecas externas — parser manual leve.
 * ⚠️ Não suporta Markdown aninhado complexo (tabelas, code blocks, etc.)
 *
 * Padrão Markdown:
 *   **texto**  → <strong>texto</strong>
 *   *texto*    → <em>texto</em>
 *   ## Título → <div class="md-heading">Título</div>
 *   ### Sub   → <div class="md-subheading">Sub</div>
 *   1. Item   → <div class="md-numbered">Item</div>
 *   - Item    → <div class="md-bullet">Item</div>
 */
function mdToHtml(text) {
  return text
    // Sanitização: escapar HTML antes de processar Markdown
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')

    // Formatação inline
    .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
    .replace(/\*(.+?)\*/g,'<em>$1</em>')

    // Headings (H1, H2 → .md-heading)
    .replace(/^#{1,2}\s+(.+)$/gm,'<div class="md-heading">$1</div>')

    // Subheadings (H3 → .md-subheading)
    .replace(/^###\s+(.+)$/gm,'<div class="md-subheading">$1</div>')

    // Numbered lists (1. → .md-numbered)
    .replace(/^\d+\.\s+(.+)$/gm,'<div class="md-numbered">$1</div>')

    // Bullet lists (-, • → .md-bullet)
    .replace(/^[-•]\s+(.+)$/gm,'<div class="md-bullet">$1</div>')

    // Quebras de parágrafo
    .replace(/\n\n/g,'<br><br>')
    .replace(/\n/g,'<br>');
}

// ── CHAMADA PRINCIPAL À API ANTHROPIC ────────────────────────────────
// Função reutilizada por todos os painéis de IA.
// Parâmetros:
//   userMsg       — pergunta/instrução para a IA
//   loadId        — ID do elemento de loading (spinner)
//   outId         — ID do elemento onde o output é exibido
//   btnId         — ID do botão que disparou (desabilitado durante a chamada)
//   systemOverride — usa SYSTEM por padrão; passe SYSTEM_CRIATIVO para conteúdo de marca
async function callAI(userMsg, loadId, outId, btnId, systemOverride, panelIdForHistory) {
  const key = getKey();
  if(!key){alert('Adicione sua Anthropic API Key na barra superior ou em Configurações.');return;}
  const load=document.getElementById(loadId), out=document.getElementById(outId), btn=btnId?document.getElementById(btnId):null;
  load.classList.add('visible'); out.classList.remove('visible');
  if(btn) btn.disabled=true;
  const systemPrompt = systemOverride || SYSTEM;
  try {
    const res = await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:1000,system:systemPrompt,messages:[{role:'user',content:userMsg}]})
    });
    const data=await res.json();
    const raw = data.content?.map(b=>b.text||'').join('')||JSON.stringify(data.error||'Erro desconhecido');
    out.innerHTML = mdToHtml(raw);
    out.classList.add('visible');
    // Salva no histórico se panelIdForHistory foi fornecido
    if(panelIdForHistory) {
      saveVersionFull(panelIdForHistory, out.innerHTML, 'ia');
      showVersoes(panelIdForHistory);
    }
  } catch(e){out.innerHTML='Erro: '+e.message;out.classList.add('visible');}
  load.classList.remove('visible');
  if(btn) btn.disabled=false;
}

// ── CHAMADA À API COM IMAGEM (visão) ─────────────────────────────────
// Usada exclusivamente pela ferramenta "Copy de Imagem" no painel adcopy/imgcopy.
// Envia a imagem em base64 junto com o prompt — o modelo analisa o conteúdo visual.
// Retorna o texto da resposta (string) ou uma mensagem de erro.
async function callAIWithImage(imageBase64, mediaType, userMsg, systemOverride) {
  const key = getKey();
  if(!key){alert('Adicione sua Anthropic API Key na barra superior ou em Configurações.');return null;}
  const systemPrompt = systemOverride || SYSTEM_CRIATIVO;
  const res = await fetch('https://api.anthropic.com/v1/messages',{
    method:'POST',
    headers:{'Content-Type':'application/json','x-api-key':key,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
    body:JSON.stringify({
      model:AI_MODEL,
      max_tokens:1200,
      system:systemPrompt,
      messages:[{role:'user',content:[
        {type:'image',source:{type:'base64',media_type:mediaType,data:imageBase64}},
        {type:'text',text:userMsg}
      ]}]
    })
  });
  const data = await res.json();
  return data.content?.map(b=>b.text||'').join('') || JSON.stringify(data.error||'Erro desconhecido');
}

async function generateImageCopy() {
  const fileInput = document.getElementById('imgcopy-upload');
  const platforms = [...document.querySelectorAll('.imgcopy-plat:checked')].map(el=>el.value);
  const btn = document.getElementById('btn-imgcopy');
  const load = document.getElementById('load-imgcopy');
  const out = document.getElementById('out-imgcopy');

  if(!fileInput.files[0]){alert('Selecione uma imagem primeiro.');return;}
  if(platforms.length===0){alert('Selecione ao menos uma plataforma.');return;}

  const file = fileInput.files[0];
  const mediaType = file.type || 'image/jpeg';

  const reader = new FileReader();
  reader.onload = async function(e) {
    const base64 = e.target.result.split(',')[1];
    btn.disabled=true;
    load.classList.add('visible');
    out.classList.remove('visible');
    out.innerHTML='';

    const platLabels = {instagram:'Instagram',tiktok:'TikTok',pinterest:'Pinterest'};
    const tomLabels = {serio:'Sério',inspirador:'Inspirador',engracado:'Engraçado',vendedor:'Vendedor'};
    const goalLabels = {awareness:'Awareness (alcance e reconhecimento)',trafego:'Tráfego para o site',conversao:'Conversão / venda',remarketing:'Remarketing',engajamento:'Engajamento'};
    const audienceLabels = {primario:'Público primário — estética forte / desfem',street:'Público secundário — street geral',frio:'Público frio'};

    // Contexto opcional
    const imgGoal = document.getElementById('imgcopy-goal')?.value || '';
    const imgAudience = document.getElementById('imgcopy-audience')?.value || '';
    const imgPeca = document.getElementById('imgcopy-peca')?.value?.trim() || '';

    const ctxLines = [];
    if(imgPeca) ctxLines.push(`Peça: ${imgPeca}`);
    if(imgGoal) ctxLines.push(`Objetivo: ${goalLabels[imgGoal]||imgGoal}`);
    if(imgAudience) ctxLines.push(`Público: ${audienceLabels[imgAudience]||imgAudience}`);
    const ctxBlock = ctxLines.length ? `\n\nContexto fornecido:\n${ctxLines.map(l=>'- '+l).join('\n')}` : '';

    const conversionNote = (imgGoal==='conversao'||imgGoal==='remarketing') ? '\n- Copy com foco em conversão: mencione o produto, crie urgência real, direcione para ação.' : '';
    const coldAudienceNote = imgAudience==='frio' ? '\n- Público frio: a copy precisa capturar atenção sem pressupor conhecimento da marca.' : '';

    try {
      const results = await Promise.all(platforms.map(async plat=>{
        const tom = document.getElementById(`tom-${plat}`).value;
        const platPromptSingle = `Analise esta imagem com olhar de diretor de arte e copywriter da Border.

Observe: o produto, o estilo, cores, mood, contexto visual, composição. Não descreva — interprete.${ctxBlock}

Gere copy de publicação para ${platLabels[plat]} com tom ${tomLabels[tom]}.

Entregue:
→ Legenda pronta (${plat==='instagram'?'150-220 chars':plat==='tiktok'?'até 150 chars':plat==='pinterest'?'até 250 chars':'até 200 chars'})
→ Hashtags: 5-8 tags certas para ${platLabels[plat]}

Regras invariáveis da Border:
- Sem hype. Sem exclamação de efeito. Sem explicar a marca.
- Tom ${tomLabels[tom]}: ${tom==='serio'?'econômico, poético quando necessário, frases curtas com peso':tom==='inspirador'?'evocativo, território de desejo sem clichê motivacional':tom==='engracado'?'inteligente, irônico — nunca forçado ou genérico':'direto ao produto, urgência real, benefício concreto, sem hype.'}.${conversionNote}${coldAudienceNote}

Entregue a copy pronta, sem introdução.`;
        const text = await callAIWithImage(base64, mediaType, platPromptSingle);
        return {plat, tom, text};
      }));

      const platColors = {instagram:'#E1306C',tiktok:'#010101',pinterest:'#E60023'};
      const platIcons = {instagram:'◈',tiktok:'▶',pinterest:'⊕'};

      out.innerHTML = results.map(({plat,tom,text})=>`
        <div style="border:1px solid var(--border);border-radius:6px;overflow:hidden;margin-bottom:12px">
          <div style="display:flex;align-items:center;justify-content:space-between;padding:10px 14px;background:var(--hover);border-bottom:1px solid var(--border)">
            <div style="display:flex;align-items:center;gap:8px">
              <span style="color:${platColors[plat]};font-size:15px">${platIcons[plat]}</span>
              <span style="font-size:12px;letter-spacing:.08em;font-weight:600;color:var(--text)">${platLabels[plat].toUpperCase()}</span>
              <span style="font-size:11px;color:var(--dim);background:var(--border);padding:1px 7px;border-radius:10px">${tomLabels[tom]}</span>
            </div>
            <button onclick="navigator.clipboard.writeText(this.closest('.imgcopy-card-inner')?.textContent||'')" style="font-size:11px;color:var(--dim);background:none;border:1px solid var(--border2);padding:2px 8px;cursor:pointer;font-family:var(--sans)">copiar</button>
          </div>
          <div class="imgcopy-card-inner" style="padding:14px;font-size:13px;line-height:1.7;color:var(--text);white-space:pre-wrap">${text}</div>
        </div>
      `).join('');

      // fix copy buttons to grab correct text
      out.querySelectorAll('[style*="copiar"]').forEach((btn,i)=>{
        btn.onclick=()=>{
          const inner=out.querySelectorAll('.imgcopy-card-inner')[i];
          navigator.clipboard.writeText(inner.textContent.trim());
          btn.textContent='copiado ✓';
          setTimeout(()=>btn.textContent='copiar',1500);
        };
      });

      out.classList.add('visible');
      // Salva no histórico de versões
      saveVersionFull('imgcopy', out.innerHTML, 'ia');
      showVersoes('imgcopy');
    } catch(e){
      out.innerHTML='Erro: '+e.message;
      out.classList.add('visible');
    }
    load.classList.remove('visible');
    btn.disabled=false;
  };
  reader.readAsDataURL(file);
}

// ── FUNÇÕES DE IA — FERRAMENTAS DO PAINEL ────────────────────────────
// Cada função monta um prompt específico e chama callAI() ou callAIWithImage().
// Para adicionar uma nova ferramenta: copie o padrão de qualquer função abaixo,
// adicione o botão no index.html e registre o painel na navegação (sidebar).

function analyzeCaption(){
  const cap=document.getElementById('cap-input').value.trim();
  if(!cap)return;
  const plat=document.getElementById('cap-platform').value,type=document.getElementById('cap-type').value;
  callAI(`Analise esta legenda para ${plat}, tipo de conteúdo: ${type}.\n\nLegenda: "${cap}"\n\nO que eu quero saber:\n1. Tom de voz — soa como Border ou soa como qualquer marca? O que quebra?\n2. O que tá funcionando (se tiver alguma coisa)\n3. O que mudar — seja específico, não genérico\n4. Reescreve a legenda com a voz real da marca\n\nSem elogios de protocolo. Se tiver errado, fala que tá errado.`,'load-analyzer','out-analyzer','btn-analyze', SYSTEM_CRIATIVO, 'analyzer');
}

function generateBrief(){
  const type=document.getElementById('brief-type').value,aud=document.getElementById('brief-audience').value,ctx=document.getElementById('brief-context').value;
  callAI(`Monta um brief para a Border.\n\nTipo: ${type}\nPúblico: ${aud}\n${ctx?'Contexto adicional: '+ctx:''}\n\nQuero:\n— Conceito central (uma frase que ancora tudo)\n— Direção criativa (o que a imagem precisa comunicar sem explicar)\n— Casting (perfil, comportamento, estética — não identidade declarada)\n— Styling e referências visuais\n— Copy de apoio — econômico, sem hype. O texto apoia a imagem, não define a marca.\n— Hashtags por camada: conteúdo (vai na legenda) e distribuição (vai no comentário ou rodapé)\n\nNão enrola. Vai direto ao que importa.`,'load-brief','out-brief','btn-brief', SYSTEM_CRIATIVO, 'brief');
}

function generateHashtags(){
  const desc=document.getElementById('hgen-input').value.trim();
  if(!desc)return;
  callAI(`Gere set de 12-15 hashtags para este post da Border:\n\n"${desc}"\n\nDividir em 3 grupos:\n- Marca e identidade (2-3 tags)\n- Nicho e comunidade (4-5 tags)\n- Alcance e descoberta (4-5 tags)\n\nNão explicar cada uma. Liste separadas por espaço.`,'load-hgen','out-hgen','btn-hgen', SYSTEM_CRIATIVO, 'hashgen');
}

function generateAdCopy(){
  const prod=document.getElementById('ad-product').value,goal=document.getElementById('ad-goal').value,aud=document.getElementById('ad-audience').value;
  callAI(`3 variações de copy para Meta Ads da Border.\n\nProduto: "${prod||'coleção Border'}"\nObjetivo: ${goal}\nPúblico: ${aud}\n\nCada variação:\n→ Headline (máx 40 chars)\n→ Texto principal (máx 125 chars)\n→ CTA\n\nLembra: a peça comunica — o texto apoia. Econômico, direto, sem hype. Sem exclamação de efeito. A legenda não explica a identidade da marca — deixa isso pra imagem.`,'load-ad','out-ad','btn-ad', SYSTEM_CRIATIVO, 'adcopy');
}

function imgcopyPreview(input){
  if(!input.files[0])return;
  const file=input.files[0];
  if(file.size>5*1024*1024){alert('Imagem muito grande. Máximo 5MB.');input.value='';return;}
  const url=URL.createObjectURL(file);
  document.getElementById('imgcopy-preview').src=url;
  document.getElementById('imgcopy-preview-wrap').style.display='block';
  document.getElementById('imgcopy-dropzone').style.display='none';
}

function imgcopyClear(){
  document.getElementById('imgcopy-upload').value='';
  document.getElementById('imgcopy-preview').src='';
  document.getElementById('imgcopy-preview-wrap').style.display='none';
  document.getElementById('imgcopy-dropzone').style.display='block';
  document.getElementById('out-imgcopy').classList.remove('visible');
  document.getElementById('out-imgcopy').innerHTML='';
}

function generateRoteiro(){
  const tema=document.getElementById('rot-tema').value.trim();
  const formato=document.getElementById('rot-formato').value;
  const duracao=document.getElementById('rot-duracao').value;
  const tom=document.getElementById('rot-tom').value;
  const objetivo=document.getElementById('rot-objetivo').value;
  const extra=document.getElementById('rot-extra').value.trim();
  if(!tema){alert('Descreva o tema do vídeo antes de gerar.');return;}
  const formatoLabel={reels:'Instagram Reels',tiktok:'TikTok',
    'youtube-short':'YouTube Shorts','youtube-longo':'YouTube longo',stories:'Stories sequenciais'}[formato]||formato;
  const tomLabel={autentico:'Autêntico / bastidor',editorial:'Editorial / estético',
    educativo:'Educativo / informativo',provocador:'Provocador / opinião forte',
    storytelling:'Storytelling / história',trending:'Trend / viral'}[tom]||tom;
  const objLabel={engajamento:'Engajamento e novos seguidores',venda:'Venda / conversão',
    branding:'Branding e posicionamento',alcance:'Alcance e viralização'}[objetivo]||objetivo;
  const prompt=`Crie um roteiro para a Border Ltd.

TEMA: ${tema}
FORMATO: ${formatoLabel}
DURAÇÃO: ${duracao}
TOM: ${tomLabel}
OBJETIVO: ${objLabel}
${extra?`DETALHES EXTRAS: ${extra}`:''}

ESTRUTURA DO ROTEIRO:
1. GANCHO — os primeiros 3 segundos. O que para o polegar.
2. DESENVOLVIMENTO — cena a cena, com narração ou legenda sugerida quando necessário
3. VIRADA — o momento que muda o peso do vídeo
4. FECHAMENTO / CTA — como sair. Sem forçar.
5. TRILHA — mood musical (referência de artista ou gênero)
6. LEGENDA — texto pronto pra postagem, no tom da Border
7. HASHTAGS — 5 específicas pra esse vídeo

O roteiro precisa soar como a Border faz conteúdo: sem explicar, sem hype, sem didatismo. A câmera e o contexto comunicam. O texto apoia quando necessário — não narra o óbvio.`;
  callAI(prompt,'load-roteiro','out-roteiro','btn-roteiro', SYSTEM_CRIATIVO, 'roteiro');
}


// ══════════════════════════════════════
// PINTEREST EXPLORER
// ══════════════════════════════════════
function openPin(query){
  window.open('https://www.pinterest.com/search/pins/?q='+encodeURIComponent(query),'_blank');
}

// ══════════════════════════════════════════════════════════════════════
// SWOT — HISTÓRICO E GERAÇÃO IA
// ══════════════════════════════════════════════════════════════════════
// renderSWOTHistory(): renderiza o accordion com análises anteriores salvas
// runSWOT(): chama a IA, parseia o JSON retornado e preenche os quadrantes
//
// O SWOT é salvo separadamente em 'bi_swot_history' (até 10 entradas),
// diferente do sistema de versionamento genérico (VER_KEY) usado pelos
// outros painéis. Isso permite exibição estruturada por quadrante S/W/O/T.

// ── SWOT — RENDERIZA HISTÓRICO ──────────────────────────────────────
function renderSWOTHistory(){

  const hist = JSON.parse(localStorage.getItem('bi_swot_history')||'[]');
  const el = document.getElementById('swot-history');
  if(!el) return;
  if(hist.length === 0){ el.innerHTML='<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma análise salva ainda.</div>'; return; }
  const fmt = arr => (arr||[]).map(i=>`<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:13px;color:var(--sub)">${i}</div>`).join('');
  el.innerHTML = '<div style="border-top:1px solid var(--border)">' + hist.map((h,i)=>`
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('swot',${i})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${h.ts}</span>
          ${i===0?`<span style="font-size:11px;padding:2px 8px;border:1px solid var(--border2);color:var(--dim);letter-spacing:.08em;text-transform:uppercase">mais recente</span>`:''}
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${(h.forcas||[]).slice(0,2).join(' · ')}</span>
        </div>
        <span id="acc-arrow-swot-${i}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-swot-${i}" style="display:none;padding:0 0 16px 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:12px">
          <div style="padding:12px 14px;border:1px solid rgba(46,125,94,.25);background:var(--green-bg)">
            <div style="font-size:11px;letter-spacing:.18em;color:var(--green);text-transform:uppercase;margin-bottom:8px">S — Forças</div>
            <div>${fmt(h.forcas)}</div>
          </div>
          <div style="padding:12px 14px;border:1px solid rgba(184,134,11,.25);background:var(--warn-bg)">
            <div style="font-size:11px;letter-spacing:.18em;color:var(--warn);text-transform:uppercase;margin-bottom:8px">W — Fraquezas</div>
            <div>${fmt(h.fraquezas)}</div>
          </div>
          <div style="padding:12px 14px;border:1px solid rgba(112,144,208,.3);background:rgba(112,144,208,.04)">
            <div style="font-size:11px;letter-spacing:.18em;color:#7090d0;text-transform:uppercase;margin-bottom:8px">O — Oportunidades</div>
            <div>${fmt(h.oportunidades)}</div>
          </div>
          <div style="padding:12px 14px;border:1px solid rgba(192,57,43,.25);background:var(--red-bg)">
            <div style="font-size:11px;letter-spacing:.18em;color:var(--red);text-transform:uppercase;margin-bottom:8px">T — Ameaças</div>
            <div>${fmt(h.ameacas)}</div>
          </div>
        </div>
        ${h.narrativa?`<div style="padding:14px 16px;border:1px solid var(--border);background:var(--bg2);font-size:14px;color:var(--sub);line-height:1.85">${h.narrativa.replace(/\n/g,'<br>')}</div>`:''}
      </div>
    </div>
  `).join('') + '</div>';
}

// ── HISTÓRICO — TENDÊNCIAS (usa VER_KEY genérico) ───────────────────
function renderTendenciasHistory(){
  const el = document.getElementById('tendencias-versoes-list');
  if(!el) return;
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  const vers = all['tendencias'] || [];
  if(!vers.length){
    el.innerHTML='<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma versão salva ainda.</div>';
    return;
  }
  el.innerHTML = '<div style="border-top:1px solid var(--border)">' + vers.map((v,i)=>`
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('ver_tendencias',${i})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${v.date}</span>
          ${i===0?`<span style="font-size:11px;padding:2px 8px;border:1px solid var(--border2);color:var(--dim);letter-spacing:.08em;text-transform:uppercase">mais recente</span>`:''}
          <span style="font-size:11px;padding:2px 8px;border:1px solid ${v.tipo==='ia'?'var(--text)':'var(--border2)'};color:${v.tipo==='ia'?'var(--text)':'var(--dim)'};letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${v.tipo==='ia'?'IA':'Auto'}</span>
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${v.preview}</span>
        </div>
        <span id="acc-arrow-ver_tendencias-${i}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-ver_tendencias-${i}" style="display:none;padding:0 0 16px 0">
        <div style="background:var(--bg2);border:1px solid var(--border);padding:16px;font-size:14px;color:var(--sub);line-height:1.85;max-height:360px;overflow-y:auto">${v.content||v.preview}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="restoreVersion('tendencias',${i})" style="font-size:13px;padding:6px 14px">Restaurar</button>
          <button class="btn" onclick="deleteVersion('tendencias',${i});renderTendenciasHistory()" style="font-size:13px;padding:6px 14px;color:var(--red);border-color:var(--red)">Remover</button>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

// ── HISTÓRICO — CONCORRENTES (lançamentos IA, usa VER_KEY genérico) ─
function renderCompetidoresHistory(){
  const el = document.getElementById('competidores-versoes-list');
  if(!el) return;
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  const vers = all['competidores'] || [];
  if(!vers.length){
    el.innerHTML='<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma análise salva ainda.</div>';
    return;
  }
  el.innerHTML = '<div style="border-top:1px solid var(--border)">' + vers.map((v,i)=>`
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('ver_competidores',${i})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${v.date}</span>
          ${i===0?`<span style="font-size:11px;padding:2px 8px;border:1px solid var(--border2);color:var(--dim);letter-spacing:.08em;text-transform:uppercase">mais recente</span>`:''}
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${v.preview}</span>
        </div>
        <span id="acc-arrow-ver_competidores-${i}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-ver_competidores-${i}" style="display:none;padding:0 0 16px 0">
        <div style="background:var(--bg2);border:1px solid var(--border);padding:16px;font-size:14px;color:var(--sub);line-height:1.85;max-height:360px;overflow-y:auto">${v.content||v.preview}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="restoreVersion('competidores',${i})" style="font-size:13px;padding:6px 14px">Restaurar</button>
          <button class="btn" onclick="deleteVersion('competidores',${i});renderCompetidoresHistory()" style="font-size:13px;padding:6px 14px;color:var(--red);border-color:var(--red)">Remover</button>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

// ── SWOT — GERA ANÁLISE IA ───────────────────────────────────────────
// A IA retorna JSON estruturado com os 4 quadrantes + narrativa.
// O JSON é extraído via regex (a IA pode retornar texto antes/depois do JSON).
// ⚠️ Se a IA retornar JSON mal formado, a análise cai no catch e exibe erro.
async function runSWOT(){
  const btn=document.getElementById('btn-swot');
  const loading=document.getElementById('load-swot');
  const output=document.getElementById('swot-output');
  if(!store.apiKey){alert('Configure sua API key nas Configurações primeiro.');return;}
  loading.style.display='flex';
  if(btn){btn.disabled=true;btn.textContent='⏳ Analisando...';}
  const prompt=`Você é um estrategista de negócios especializado em moda e marcas D2C.

Faça uma análise SWOT detalhada da Border Ltd em comparação com seus concorrentes diretos e indiretos.

DADOS DA BORDER:
- Marca de moda masculina (Brasil, NuvemShop)
- Nicho: desfeminino, queer masc, streetwear conceitual
- Tom: econômico, autêntico, estética forte, sem hype
- Canal principal: Instagram + e-commerce

CONCORRENTES:
- Class Official (170K seg, streetwear premium acessível, mais comercial)
- Bolovo (214K seg, streetwear cult, irreverente, comunidade engajada)
- Welcome Sunny Garments (120K seg, indie garments, público queer/desfem)
- Back to Eden (22K seg, slow fashion conceitual, artesanal)

Retorne APENAS no seguinte formato JSON (sem markdown, só JSON):
{
  "forcas": ["item 1", "item 2", "item 3", "item 4", "item 5"],
  "fraquezas": ["item 1", "item 2", "item 3", "item 4"],
  "oportunidades": ["item 1", "item 2", "item 3", "item 4"],
  "ameacas": ["item 1", "item 2", "item 3", "item 4"],
  "narrativa": "Análise estratégica em 3 parágrafos comparando Border com o mercado, identificando o espaço único que a Border pode ocupar e as 3 ações estratégicas mais urgentes. Seja específico, cite os concorrentes."
}`;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':store.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:2000,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const raw=data?.content?.[0]?.text||'{}';
    // extrai JSON
    const jsonMatch=raw.match(/\{[\s\S]*\}/);
    const parsed=jsonMatch?JSON.parse(jsonMatch[0]):{};
    // preenche quadrantes
    const fmt=arr=>(arr||[]).map(i=>`<div style="padding:3px 0;border-bottom:1px solid rgba(255,255,255,.05)">${i}</div>`).join('');
    document.getElementById('swot-s').innerHTML=fmt(parsed.forcas)||'—';
    document.getElementById('swot-w').innerHTML=fmt(parsed.fraquezas)||'—';
    document.getElementById('swot-o').innerHTML=fmt(parsed.oportunidades)||'—';
    document.getElementById('swot-t').innerHTML=fmt(parsed.ameacas)||'—';
    if(parsed.narrativa){
      output.innerHTML=`<div class="card" style="margin-top:4px"><div class="card-label" style="margin-bottom:10px">Análise Estratégica Narrativa</div><div style="font-size:13px;color:var(--sub);line-height:1.9">${parsed.narrativa.replace(/\n/g,'<br>')}</div></div>`;
    }
    // salva no histórico
    const entry = {
      ts: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
      forcas: parsed.forcas,
      fraquezas: parsed.fraquezas,
      oportunidades: parsed.oportunidades,
      ameacas: parsed.ameacas,
      narrativa: parsed.narrativa||''
    };
    const hist = JSON.parse(localStorage.getItem('bi_swot_history')||'[]');
    hist.unshift(entry);
    if(hist.length > 10) hist.pop();
    localStorage.setItem('bi_swot_history', JSON.stringify(hist));
    renderSWOTHistory();
    loading.style.display='none';
    markPanelUpdated('swot');
    if(btn){btn.disabled=false;btn.textContent='↻ Gerar análise SWOT';}
  }catch(e){
    loading.style.display='none';
    output.innerHTML=`<div class="alert" style="border-color:var(--red);background:var(--red-bg);color:var(--red)">❌ ${e.message}</div>`;
    if(btn){btn.disabled=false;btn.textContent='↻ Gerar análise SWOT';}
  }
}

// ══════════════════════════════════════
// CONCORRENTES IA
// ══════════════════════════════════════
async function analisaConcorrente(nome,descricao){
  const output=document.getElementById('out-comp-analise');
  const loading=document.getElementById('load-comp-analise');
  if(!store.apiKey){alert('Configure sua API key nas Configurações primeiro.');return;}
  loading.style.display='flex';
  output.innerHTML='';
  const prompt=`Analise o concorrente "${nome}" (${descricao}) em relação à Border Ltd.

Estruture em:
## Como a Border se diferencia do ${nome}
## O que a Border pode aprender com o ${nome}
## Oportunidade de mercado que o ${nome} não cobre e a Border pode capturar
## Risco que o ${nome} representa para a Border nos próximos 6 meses

Seja direto, específico e estratégico. Máx 300 palavras.`;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':store.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:800,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const text=data?.content?.[0]?.text||'Erro.';
    const formattedHtml=`<div class="ai-output" style="display:block">${text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/##\s+(.+)/g,'<div style="font-size:12px;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;margin:14px 0 6px;padding-top:10px;border-top:1px solid var(--border)">$1</div>').replace(/\n/g,'<br>')}</div>`;
    output.innerHTML=formattedHtml;
    loading.style.display='none';
    // Salva no histórico de versões
    saveVersionFull('competidores', formattedHtml, 'ia');
    showVersoes('competidores');
  }catch(e){
    loading.style.display='none';
    output.innerHTML=`<div class="alert" style="border-color:var(--red);background:var(--red-bg);color:var(--red)">❌ ${e.message}</div>`;
  }
}

async function analisaLancamentos(){
  const btn=document.getElementById('btn-lancamentos');
  const loading=document.getElementById('load-lancamentos');
  const output=document.getElementById('out-lancamentos');
  if(!store.apiKey){alert('Configure sua API key nas Configurações primeiro.');return;}
  loading.style.display='flex';
  if(btn){btn.disabled=true;btn.textContent='Analisando...';}
  output.innerHTML='';
  const prompt=`Você é um analista de moda especialista em streetwear brasileiro.

Com base no que você sabe sobre estas marcas até 2025, descreva os movimentos recentes e últimos lançamentos de cada uma:

1. **Class Official** — últimas campanhas, drops, estratégias de conteúdo
2. **Bolovo** — últimas campanhas, drops, estratégias de conteúdo
3. **Welcome Sunny Garments** — últimas campanhas, drops, estratégias de conteúdo
4. **Back to Eden** — últimas campanhas, drops, estratégias de conteúdo

Para cada uma: uma descrição concisa (2-3 frases) sobre os movimentos mais recentes que você conhece. Se não tiver dados recentes específicos, aponte a direção estratégica que a marca vinha tomando.

Finalize com: **O que a Border deveria fazer diante desse cenário** — 3 ações concretas.`;
  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':store.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:1200,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const text=data?.content?.[0]?.text||'Erro.';
    const htmlContent=text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>').replace(/##\s+(.+)/g,'<div style="font-size:12px;letter-spacing:.12em;color:var(--dim);text-transform:uppercase;margin:14px 0 6px;padding-top:10px;border-top:1px solid var(--border)">$1</div>').replace(/\n/g,'<br>');
    output.innerHTML=`<div class="ai-output" style="display:block">${htmlContent}</div>`;
    output.style.display='block';
    loading.style.display='none';
    markPanelUpdated('competidores');
    saveVersionFull('competidores', output.innerHTML, 'ia');
    renderCompetidoresHistory();
    if(btn){btn.disabled=false;btn.textContent='Analisar →';}
  }catch(e){
    loading.style.display='none';
    output.innerHTML=`<div class="alert" style="border-color:var(--red);background:var(--red-bg);color:var(--red)">❌ ${e.message}</div>`;
    if(btn){btn.disabled=false;btn.textContent='Analisar →';}
  }
}

// ══════════════════════════════════════════════════════════════════════
// PLANEJADOR EDITORIAL IA
// ══════════════════════════════════════════════════════════════════════
// O planejador usa dois estados globais para modo e intenção:
//   _pautaModo    — 'simples' | 'intermediario' | 'completo'
//   _pautaIntencao — 'desejo' | 'identificacao' | 'estranhamento' | 'pertencimento'
//
// setModo() e setIntencao() atualizam esses estados E o estilo visual dos botões.
// gerarPauta() usa os estados atuais na hora de montar o prompt — nunca lê o DOM
// diretamente para isso, o que evita bugs quando o usuário muda a opção depois.

let _pautaModo = 'intermediario';
let _pautaIntencao = 'identificacao';

function setModo(v) {
  _pautaModo = v;
  ['simples','intermediario','completo'].forEach(m => {
    const lbl = document.getElementById('modo-'+m+'-lbl');
    if(lbl) lbl.style.border = m===v ? '2px solid var(--text)' : '1px solid var(--border2)';
  });
  const el = document.getElementById('pauta-modo-'+v);
  if(el) el.checked = true;
}

function setIntencao(v) {
  _pautaIntencao = v;
  ['desejo','identificacao','estranhamento','pertencimento'].forEach(i => {
    const lbl = document.getElementById('int-'+i+'-lbl');
    if(lbl) lbl.style.border = i===v ? '2px solid var(--text)' : '1px solid var(--border2)';
  });
  const el = document.querySelector(`input[name="pauta-intencao"][value="${v}"]`);
  if(el) el.checked = true;
}

async function gerarPauta(){
  const btn=document.getElementById('btn-pauta');
  const loading=document.getElementById('load-pauta');
  const output=document.getElementById('out-pauta');
  const placeholder=document.getElementById('pauta-placeholder');
  if(!store.apiKey){alert('Configure sua API key nas Configurações primeiro.');return;}

  const semana=document.getElementById('pauta-semana').value;
  const freq=document.getElementById('pauta-freq').value;
  const objetivo=document.getElementById('pauta-objetivo').value;
  const produto=document.getElementById('pauta-produto').value.trim();
  const modo=_pautaModo;
  const intencao=_pautaIntencao;

  const objetivoLabel={
    branding:'Branding e identidade de marca',
    venda:'Conversão e venda direta',
    engajamento:'Crescimento orgânico e engajamento',
    posicionamento:'Posicionamento e autoridade de nicho',
    lancamento:'Lançamento de produto'
  }[objetivo]||objetivo;

  const modoConfig = {
    simples: {
      label:'Simples (produção leve)',
      instrucao:'Priorize conteúdo espontâneo: bastidores, making of, selfie da peça, texto direto. Sem produção elaborada. 1 pessoa, luz natural, formato vertical. Formatos ideais: Stories, Reels curtos (15-30s), fotos casuais no feed.',
      tom:'Cru, honesto, real. Como se fosse mandar para um amigo.'
    },
    intermediario: {
      label:'Intermediário (híbrido)',
      instrucao:'Misture produção planejada com momentos espontâneos. Feed tratado, Reels com corte limpo, Stories mais soltos. Uma ou duas peças de conteúdo com direção clara, o resto mais leve.',
      tom:'Autoral e curado, mas sem rigidez. Econômico na legenda.'
    },
    completo: {
      label:'Produção Completa (campanha)',
      instrucao:'Conteúdo com direção de arte completa: locação, moodboard, referências visuais, look book, editorial fotográfico ou de vídeo. Cada post deve ter briefing técnico: cenário, iluminação, referência visual, casting. Formatos: editorial Feed (carrossel), Reel de campanha, lançamento.',
      tom:'Silencioso, editorial, autoridade. A peça no centro.'
    }
  }[modo];

  const intencaoLabel = {
    desejo:'Desejo — fazer o público querer ter a peça',
    identificacao:'Identificação — "isso sou eu"',
    estranhamento:'Estranhamento — algo diferente, que para o scroll',
    pertencimento:'Pertencimento — nossa tribo, nossa estética'
  }[intencao]||intencao;

  // Referências do banco para enriquecer a pauta
  const refs = store.referencias || [];
  const marcasRef = refs.filter(r=>r.tipo==='marca').map(r=>r.conteudo).join(', ');
  const hashtagsRef = refs.filter(r=>r.tipo==='hashtag').map(r=>r.conteudo).join(' ');

  placeholder.style.display='none';
  loading.style.display='flex';
  if(btn){btn.disabled=true;btn.textContent='Gerando...';}
  output.innerHTML='';

  const prompt=`Você é um estrategista de conteúdo editorial para marcas de moda independente autorais.

Crie um planejador editorial para a Border Ltd:

PERÍODO: ${semana?`Semana de ${semana}`:'Próxima semana'}
QUANTIDADE: ${freq} posts
OBJETIVO: ${objetivoLabel}
MODO DE PRODUÇÃO: ${modoConfig.label}
INTENÇÃO CRIATIVA: ${intencaoLabel}
${produto?`PRODUTO/TEMA: ${produto}`:''}
${marcasRef?`MARCAS REFERÊNCIA: ${marcasRef}`:''}
${hashtagsRef?`HASHTAGS DO BANCO: ${hashtagsRef}`:''}

SOBRE A BORDER:
- Street alfaiataria brasileira. Peças sem gênero, caimento masculino.
- Público: mulheres desfem + queer masc + homens street/alfaiataria · 20-32 · SP/RJ/BH
- Tom: econômico, autêntico, sem hype. A peça fala por si.
- Tagline: "Unbound Garments"
- Plataformas: Instagram + TikTok

INSTRUÇÃO DE FORMATO (${modoConfig.label}):
${modoConfig.instrucao}
Tom das legendas: ${modoConfig.tom}

Para cada post:
**Dia X — [Formato]**
- Ideia: o que mostrar e como
- Intenção: como isso serve à intenção de "${intencaoLabel.split('—')[0].trim()}"
- Referência visual: 1 imagem ou link de Pinterest como base
- Hook (primeiros 3s)
- Legenda: 2-3 linhas no tom Border
- Hashtags: 3 específicas alinhadas com o nicho

Ao final: **Coerência da semana** — como esses posts formam uma narrativa visual e emocional coerente para o objetivo de ${objetivoLabel.toLowerCase()}.`;

  try{
    const res=await fetch('https://api.anthropic.com/v1/messages',{
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':store.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:2500,messages:[{role:'user',content:prompt}]})
    });
    const data=await res.json();
    const text=data?.content?.[0]?.text||'Erro.';
    const html=text
      .replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
      .replace(/##\s+(.+)/g,'<div style="font-size:11px;letter-spacing:.18em;color:var(--dim);text-transform:uppercase;margin:20px 0 10px;padding-top:16px;border-top:1px solid var(--border);font-weight:700">$1</div>')
      .replace(/\n/g,'<br>');
    output.innerHTML=`<div class="ai-output" style="display:block">${html}</div>`;
    loading.style.display='none';
    markPanelUpdated('planejador');
    saveVersionFull('planejador', output.innerHTML, 'ia');
    showVersoes('planejador');
    if(btn){btn.disabled=false;btn.textContent='Gerar pauta →';}
  }catch(e){
    loading.style.display='none';
    output.innerHTML=`<div class="alert fix">❌ ${e.message}</div>`;
    if(btn){btn.disabled=false;btn.textContent='Gerar pauta →';}
  }
}

// ══════════════════════════════════════════════════════════════════════
// TENDÊNCIAS — MODA MASCULINA
// ══════════════════════════════════════════════════════════════════════
// O termômetro de keywords usa scores base (TEND_KEYWORDS_BASE) com uma
// variação aleatória pequena (±4 pts) a cada carga — simula "atualização"
// visual sem chamadas externas de API de busca.
//
// loadTendencias() faz a chamada real à IA para o relatório completo.
// O resultado é salvo no histórico de versões (VER_KEY).

const TEND_KEYWORDS_BASE = [
  {word:'moda masculina',score:98},{word:'streetwear',score:91},{word:'look masculino',score:88},
  {word:'calça cargo',score:85},{word:'oversized',score:83},{word:'moda desfeminina',score:79},
  {word:'roupa de trabalho masculino',score:75},{word:'minimalismo masculino',score:72},
  {word:'tendências 2025',score:70},{word:'estilo urbano',score:67},{word:'camiseta boxy',score:65},
  {word:'alfaiataria masculina',score:62},{word:'cores neutras',score:59},{word:'looks inverno masculino',score:55}
];

function renderTermometro(keywords) {
  const bars = document.getElementById('tend-bars');
  if (!bars) return;
  const max = keywords[0].score;
  bars.innerHTML = keywords.map((k,i) => {
    const pct = Math.round((k.score / max) * 100);
    const color = pct > 80 ? 'var(--accent)' : pct > 60 ? 'var(--sub)' : 'var(--dim)';
    const heat = pct > 80 ? '🔥' : pct > 60 ? '📈' : '·';
    return `<div style="display:flex;align-items:center;gap:10px;cursor:pointer" onclick="openPin('${k.word}')" title="Abrir no Pinterest">
      <div style="width:160px;flex-shrink:0;font-size:12px;color:var(--text);text-align:right;transition:color .15s" onmouseover="this.style.color='var(--accent)'" onmouseout="this.style.color='var(--text)'">${k.word}</div>
      <div style="flex:1;background:var(--bg3);border-radius:4px;height:8px;overflow:hidden">
        <div style="width:${pct}%;height:100%;background:${color};border-radius:4px;transition:width .6s ease"></div>
      </div>
      <div style="width:32px;font-size:11px;color:var(--dim)">${k.score}</div>
      <div style="width:16px;font-size:13px">${heat}</div>
    </div>`;
  }).join('');
}

async function loadTendencias() {
  const btn = document.getElementById('btn-tend');
  const loading = document.getElementById('load-tend');
  const placeholder = document.getElementById('tend-placeholder');
  const cardsEl = document.getElementById('tend-cards');
  const inspEl = document.getElementById('tend-inspiracoes');
  const aiOut = document.getElementById('tend-ai-output');

  if (!store.apiKey) { alert('Configure sua API key nas Configurações primeiro.'); return; }

  placeholder.style.display = 'none';
  loading.style.display = 'flex';
  if (btn) { btn.disabled = true; btn.textContent = '⏳ Carregando...'; }

  // Renderiza termômetro com base + variação aleatória pequena para parecer atualizado
  const keywords = TEND_KEYWORDS_BASE.map(k => ({
    ...k, score: Math.max(30, Math.min(100, k.score + Math.floor(Math.random()*8 - 4)))
  })).sort((a,b) => b.score - a.score);
  renderTermometro(keywords);

  const prompt = `Você é um especialista em tendências de moda masculina e comportamento de consumidor no Brasil, 2025–2026.

Gere um relatório de tendências atual para a Border Ltd (marca de moda masculina com estética forte, streetwear conceitual, público que valoriza autenticidade e referências visuais únicas).

Estruture a resposta em:

## 🌊 5 Tendências da Temporada
Para cada tendência:
- **Nome da tendência** — descrição de 2-3 linhas
- Como a Border pode se apropriar dela

## 🖼️ 5 Referências Visuais / Inspirações
Descrições visuais detalhadas (locação, luz, paleta, silhueta, mood) que a Border poderia usar como referência para conteúdo

## 📰 3 Novidades do Mercado de Moda Masculina
Acontecimentos, lançamentos de marcas, movimentos culturais relevantes (global e Brasil) que impactam o mercado em que a Border atua

## 🎯 Oportunidade Estratégica para a Border
Uma oportunidade específica baseada nas tendências listadas — como a Border pode sair na frente agora

Seja específico, visual e estratégico. Calibre tudo para o DNA da Border: econômico, autêntico, forte.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method:'POST',
      headers:{'Content-Type':'application/json','x-api-key':store.apiKey,'anthropic-version':'2023-06-01','anthropic-dangerous-direct-browser-access':'true'},
      body:JSON.stringify({model:AI_MODEL,max_tokens:2500,messages:[{role:'user',content:prompt}]})
    });
    const data = await res.json();
    const text = data?.content?.[0]?.text || 'Erro ao carregar tendências.';

    // Monta cards de tendências (parse simples das seções)
    const sections = text.split(/##\s+/);
    let tendSection = sections.find(s => s.includes('Tendências da Temporada'));
    let inspSection = sections.find(s => s.includes('Referências Visuais'));

    // Renderiza análise completa formatada
    aiOut.innerHTML = `<div class="ai-output" style="display:block;margin-top:0">${
      text.replace(/\*\*(.+?)\*\*/g,'<strong>$1</strong>')
          .replace(/##\s+(.+)/g,'<div style="font-size:13px;letter-spacing:.1em;color:var(--dim);text-transform:uppercase;margin:20px 0 8px;padding-top:16px;border-top:1px solid var(--border)">$1</div>')
          .replace(/\n/g,'<br>')
    }</div>`;

    cardsEl.innerHTML = '';
    inspEl.innerHTML = '';
    loading.style.display = 'none';
    markPanelUpdated('tendencias');
    // salva no histórico de versões
    const tendHtml = aiOut.innerHTML;
    saveVersionFull('tendencias', tendHtml, 'ia');
    renderTendenciasHistory();
    if (btn) { btn.disabled = false; btn.textContent = '↻ Atualizar tendências'; }

  } catch(e) {
    loading.style.display = 'none';
    aiOut.innerHTML = `<div class="alert" style="border-color:var(--red);background:var(--red-bg);color:var(--red)">❌ ${e.message}</div>`;
    if (btn) { btn.disabled = false; btn.textContent = '↻ Atualizar tendências'; }
  }
}

function setAssist(txt){document.getElementById('assist-input').value=txt;}
function runAssist(){const q=document.getElementById('assist-input').value.trim();if(!q)return;callAI(q,'load-assist','out-assist','btn-assist', SYSTEM, 'iaassist');}
async function testKey(){callAI('Responda apenas: "Conexão OK — Border Hub v5 pronto."','load-test','out-test',null);}

// ══════════════════════════════════════
// SISTEMA DE TIMESTAMPS E AUTOMAÇÃO
// ══════════════════════════════════════

// Mapa de automações por painel
const PANEL_AUTOMATION = {
  'monitor-concorrentes': {label:'Auto · toda segunda-feira', on:true},
  'monitor-crescimento':  {label:'Auto · toda segunda-feira', on:true},
  'swot':       {label:'Manual · pode ser automatizado (semanal)', on:false},
  'tendencias': {label:'Manual · pode ser automatizado (quinzenal)', on:false},
  'planejador': {label:'Manual · pode ser automatizado (toda sexta)', on:false},
};

function fmtTs(ts){
  if(!ts) return '—';
  const d=new Date(ts);
  return d.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'})
    +' '+d.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
}

function markPanelUpdated(id){
  const ups = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
  ups[id] = Date.now();
  localStorage.setItem('bi_panel_updates', JSON.stringify(ups));
  renderPanelFooter(id);
}

function renderPanelFooter(id){
  const panel = document.getElementById('p-'+id);
  if(!panel) return;
  let footer = panel.querySelector('.panel-update-footer');
  if(!footer){
    footer = document.createElement('div');
    footer.className='panel-update-footer';
    panel.appendChild(footer);
  }
  const ups = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
  const auto = PANEL_AUTOMATION[id];
  const ts = ups[id] ? fmtTs(ups[id]) : '—';
  footer.innerHTML=`
    <div class="panel-update-label">Última atualização: <span class="panel-update-time">${ts}</span></div>
    ${auto ? `<span class="panel-auto-badge ${auto.on?'on':''}">${auto.label}</span>` : ''}
  `;
}

function initAllFooters(){
  // injeta footer em todos os painéis
  document.querySelectorAll('.panel[id]').forEach(p=>{
    const id=p.id.replace('p-','');
    renderPanelFooter(id);
  });
}

// Relógio em tempo real no header
function startHeaderClock(){
  const el=document.getElementById('header-clock');
  if(!el) return;
  function tick(){
    const now=new Date();
    el.textContent=now.toLocaleDateString('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit',year:'numeric'})
      +' · '+now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit',second:'2-digit'});
  }
  tick();
  setInterval(tick,1000);
}

// Timestamp de deploy (injetado pelo deploy.py ou salvo na primeira carga)
function initDeployTs(){
  const el=document.getElementById('deploy-ts');
  if(!el) return;
  // window.DEPLOY_TIMESTAMP é injetado pelo deploy.py
  if(window.DEPLOY_TIMESTAMP){
    el.textContent=window.DEPLOY_TIMESTAMP;
    localStorage.setItem('bi_last_deploy',window.DEPLOY_TIMESTAMP);
  } else {
    // fallback: mostra o que estava salvo do último deploy
    const saved=localStorage.getItem('bi_last_deploy');
    el.textContent=saved||'local';
  }
}

// ── ROTEAMENTO POR URL ────────────────────────────────────────────────
// Mapa bidirecional: panelId → path e path → panelId.
// Para adicionar um novo painel, registre aqui.
const ROUTE_MAP = {
  // id do painel → path da URL
  'home':                  '/',
  'dna':                   '/marca/dna',
  'linguagem':             '/marca/linguagem',
  'hashtags':              '/marca/hashtags',
  'competitors':           '/marca/concorrentes',
  'decisao':               '/estrategia/decisao',
  'testes':                '/estrategia/testes',
  'aprendizados':          '/estrategia/aprendizados',
  'insights':              '/performance/insights',
  'organico':              '/performance/organico',
  'pago':                  '/performance/pago',
  'publico':               '/performance/publico',
  'metrics':               '/performance/metricas',
  'metaads':               '/performance/meta-ads',
  'analise-cruzada':       '/relatorios/analise-cruzada',
  'canvas':                '/negocios/canvas',
  'personas':              '/negocios/personas',
  'swot':                  '/negocios/swot',
  'competidores':          '/negocios/concorrentes-ia',
  'planejador':            '/negocios/planejador',
  'referencias':           '/negocios/referencias',
  'analyzer':              '/ferramentas/caption',
  'brief':                 '/ferramentas/brief',
  'hashgen':               '/ferramentas/hashtags',
  'adcopy':                '/ferramentas/copy-anuncio',
  'roteiro':               '/ferramentas/roteiro',
  'iaassist':              '/ferramentas/assistente',
  'tendencias':            '/tendencias/moda',
  'monitor-concorrentes':  '/monitoramento/concorrentes',
  'monitor-crescimento':   '/monitoramento/crescimento',
  'calendar':              '/operacional/log-conteudo',
  'logsemanal':            '/operacional/log-semanal',
  'settings':              '/operacional/configuracoes',
  // Páginas de grupo (accordion headers)
  'grupo-marca':           '/marca',
  'grupo-estrategia':      '/estrategia',
  'grupo-performance':     '/performance',
  'grupo-relatorios':      '/relatorios',
  'grupo-negocios':        '/negocios',
  'grupo-ferramentas':     '/ferramentas',
  'grupo-tendencias':      '/tendencias',
  'grupo-monitoramento':   '/monitoramento',
  'grupo-operacional':     '/operacional',
};

// Índice reverso: path → panelId (gerado automaticamente)
const ROUTE_REVERSE = Object.fromEntries(Object.entries(ROUTE_MAP).map(([id,path])=>[path,id]));

// Resolve o panelId a partir do pathname atual
function panelFromPath(pathname) {
  // Normaliza trailing slash
  const p = pathname === '/' ? '/' : pathname.replace(/\/$/, '');
  return ROUTE_REVERSE[p] || null;
}

// ── ACCORDION — sidebar nav groups ──────────────────────────────────
// Lógica completamente separada da função go() e de qualquer decorator.
// toggleAccordion: só mexe no CSS do accordion (classe acc-open).
// A navegação para a página do grupo é feita por goGrupo() separadamente.

// Mapa: panelId → nome do accordion que deve abrir junto
const PANEL_ACCORDION_MAP = {
  'dna':'marca','linguagem':'marca','hashtags':'marca','competitors':'marca','grupo-marca':'marca',
  'decisao':'estrategia','testes':'estrategia','aprendizados':'estrategia','grupo-estrategia':'estrategia',
  'insights':'performance','organico':'performance','pago':'performance','publico':'performance',
  'metrics':'performance','metaads':'performance','grupo-performance':'performance',
  'analise-cruzada':'relatorios','grupo-relatorios':'relatorios',
  'canvas':'negocios','personas':'negocios','swot':'negocios','competidores':'negocios',
  'planejador':'negocios','referencias':'negocios','grupo-negocios':'negocios',
  'analyzer':'ferramentas','brief':'ferramentas','hashgen':'ferramentas','adcopy':'ferramentas',
  'roteiro':'ferramentas','iaassist':'ferramentas','grupo-ferramentas':'ferramentas',
  'tendencias':'tendencias','grupo-tendencias':'tendencias',
  'monitor-concorrentes':'monitoramento','monitor-crescimento':'monitoramento','grupo-monitoramento':'monitoramento',
  'calendar':'operacional','logsemanal':'operacional','settings':'operacional','grupo-operacional':'operacional',
};

// toggleAccordion: abre/fecha o accordion. Nada mais.
function toggleAccordion(grupo) {
  const acc = document.querySelector('.nav-accordion[data-accordion="' + grupo + '"]');
  if (!acc) return;
  acc.classList.toggle('acc-open');
  const header = acc.querySelector('.nav-accordion-header');
  if (header) header.setAttribute('aria-expanded', acc.classList.contains('acc-open') ? 'true' : 'false');
}

// goGrupo: navega para a página-resumo do grupo E garante que o accordion está aberto.
// Chamado pelo onclick do nav-accordion-header no HTML.
function goGrupo(grupo) {
  // Abre o accordion se ainda não estiver aberto
  const acc = document.querySelector('.nav-accordion[data-accordion="' + grupo + '"]');
  if (acc) {
    acc.classList.toggle('acc-open');
    const header = acc.querySelector('.nav-accordion-header');
    if (header) header.setAttribute('aria-expanded', acc.classList.contains('acc-open') ? 'true' : 'false');
  }
  // Navega para o painel do grupo via go() normal
  const grupoId = 'grupo-' + grupo;
  const panel = document.getElementById('p-' + grupoId);
  if (panel) window.go(grupoId, null);
}

// Abre o accordion correspondente quando go() é chamado para um painel qualquer
function openAccordionForPanel(panelId) {
  const grupo = PANEL_ACCORDION_MAP[panelId];
  if (!grupo) return;
  const acc = document.querySelector('.nav-accordion[data-accordion="' + grupo + '"]');
  if (acc) acc.classList.add('acc-open');
}

// ── NAVEGAÇÃO PRINCIPAL ──────────────────────────────────────────────
// go(id, el): ativa o painel com ID 'p-{id}' e marca o item de nav como ativo.
// Chamada pelos botões da sidebar com onclick="go('nome', this)".
// ⚠️ Esta função é decorada mais abaixo por decorateGoWithMonitoring()
//    para recarregar dados ao abrir painéis de monitoramento.
function go(id, el, skipHistory) {
  document.querySelectorAll('.panel').forEach(p=>p.classList.remove('active'));
  document.querySelectorAll('.nav-item').forEach(n=>{n.classList.remove('active');n.removeAttribute('aria-current');});
  const _p = document.getElementById('p-'+id);
  if(!_p) return;
  _p.classList.add('active');
  if(el){el.classList.add('active');el.setAttribute('aria-current','page');}
  else {
    // Quando navegando por URL (sem elemento de nav), ativa o item correspondente
    const navBtn = document.querySelector(`.nav-item[data-panel="${id}"]`);
    if(navBtn){navBtn.classList.add('active');navBtn.setAttribute('aria-current','page');}
  }
  // Abre o accordion correspondente ao painel navegado
  openAccordionForPanel(id);
  closeSidebar();
  // Atualiza painel de settings quando aberto
  if(id === 'settings') {
    updateHistoricoStats();
    updateGhStatus();
    const tkEl = document.getElementById('gh-token-input');
    const rpEl = document.getElementById('gh-repo-input');
    if(tkEl && store.ghToken) tkEl.value = store.ghToken;
    if(rpEl && store.ghRepo) rpEl.value = store.ghRepo;
  }
  // Sincroniza a URL sem recarregar a página
  if(!skipHistory) {
    const path = ROUTE_MAP[id] || '/';
    if(window.location.pathname !== path) {
      history.pushState({panelId:id}, '', path);
    }
  }
}

// Navegação pelo botão Voltar/Avançar do browser
window.addEventListener('popstate', function(e) {
  const id = (e.state && e.state.panelId) ? e.state.panelId : panelFromPath(location.pathname);
  if(id) go(id, null, true);
});

// ── ANÁLISE CRUZADA — NAVEGAÇÃO INTERNA ──────────────────────────────
// acGo(): alterna entre os sub-painéis (ac-overview, ac-funil, etc.)
function acGo(id, el){
  document.querySelectorAll('#p-analise-cruzada .ac-sub').forEach(s=>s.classList.remove('active'));
  document.querySelectorAll('#p-analise-cruzada .ac-tab').forEach(t=>t.classList.remove('active'));
  const target = document.getElementById(id);
  if(target) target.classList.add('active');
  if(el) el.classList.add('active');
}

// ── MOBILE SIDEBAR ──
function openSidebar(){
  document.getElementById('sidebar').classList.add('open');
  document.getElementById('sidebar-overlay').classList.add('open');
  const closeBtn = document.getElementById('close-sidebar');
  if(closeBtn) closeBtn.style.display='block';
}
function closeSidebar(){
  document.getElementById('sidebar').classList.remove('open');
  document.getElementById('sidebar-overlay').classList.remove('open');
  const closeBtn = document.getElementById('close-sidebar');
  if(closeBtn) closeBtn.style.display='none';
}

// ── HASHTAGS — CÓPIA ────────────────────────────────────────────────
// cpTag(): copia uma hashtag individual ao clicar e exibe feedback visual.
// copySet(): copia todas as hashtags de um set de uma vez, separadas por espaço.
function cpTag(el){navigator.clipboard.writeText(el.textContent).then(()=>{el.classList.add('copied');setTimeout(()=>el.classList.remove('copied'),1200)});}
function copySet(id){const tags=[...document.querySelectorAll('#'+id+' .tag')].map(t=>t.textContent).join(' ');navigator.clipboard.writeText(tags);}

// ── MÉTRICAS MANUAIS ─────────────────────────────────────────────────
// Salva seguidores, alcance e engajamento no store e re-renderiza os cards.
// Valores são formatados com toLocaleString para exibição (ex: 1.234).
function saveMetrics(){
  store.followers=document.getElementById('inp-followers').value;
  store.reach=document.getElementById('inp-reach').value;
  store.eng=document.getElementById('inp-eng').value;
  saveStore();
  renderMetrics();
}
function renderMetrics(){
  if(store.followers)document.getElementById('m-followers').textContent=Number(store.followers).toLocaleString('pt-BR');
  if(store.reach)document.getElementById('m-reach').textContent=Number(store.reach).toLocaleString('pt-BR');
  if(store.eng)document.getElementById('m-eng').textContent=store.eng+'%';
}

// ── LOG DE CONTEÚDO ──────────────────────────────────────────────────
// Registra cada post publicado com: data, plataforma, descrição, status,
// objetivo, métricas (alcance, curtidas, salvamentos, comentários) e avaliação.
//
// _logAval: estado global do botão de avaliação ('funcionou' | 'naofuncionou' | '')
// _logFilter: filtro ativo na timeline ('all' | status | avaliação)
//
// renderLogInsights(): analisa os logs e exibe padrões automáticos
//   (ex: "3 conteúdos funcionaram · 2x engajamento · 1x branding")
let _logAval = '';
function setAval(v) {
  _logAval = v;
  ['funcionou','naofuncionou'].forEach(a=>{
    const lbl = document.getElementById('aval-'+a+'-lbl');
    if(lbl) lbl.style.border = a===v
      ? (v==='funcionou'?'2px solid var(--green)':'2px solid var(--red)')
      : '1px solid var(--border2)';
  });
}

let _logFilter = 'all';
function filterLog(f) {
  _logFilter = f;
  document.querySelectorAll('[id^="lf-"]').forEach(b=>{b.style.borderColor='';b.style.color='';});
  const active = document.getElementById('lf-'+f);
  if(active){active.style.borderColor='var(--text)';active.style.color='var(--text)';}
  renderLogs();
}

function addLog(){
  const entry={
    date:document.getElementById('log-date').value,
    platform:document.getElementById('log-platform').value,
    desc:document.getElementById('log-desc').value,
    status:document.getElementById('log-status').value,
    objetivo:document.getElementById('log-objetivo').value,
    reach:document.getElementById('log-reach').value,
    likes:document.getElementById('log-likes').value,
    saves:document.getElementById('log-saves').value,
    comments:document.getElementById('log-comments').value,
    avaliacao:_logAval,
    insight:document.getElementById('log-insight').value.trim(),
    id:Date.now()
  };
  if(!entry.desc)return;
  store.logs=store.logs||[];
  store.logs.unshift(entry);
  saveStore();
  _logAval='';
  ['funcionou','naofuncionou'].forEach(a=>{
    const lbl=document.getElementById('aval-'+a+'-lbl');
    if(lbl) lbl.style.border='1px solid var(--border2)';
  });
  renderLogs();
  renderLogInsights();
  ['log-date','log-desc','log-reach','log-likes','log-saves','log-comments','log-insight'].forEach(id=>{
    const el=document.getElementById(id); if(el) el.value='';
  });
}

const statusPillMap = {
  ideia:'cs-ideia',producao:'cs-producao',publicado:'cs-publicado',
  testando:'cs-testando',bem:'cs-bem',mal:'cs-mal'
};
const statusLabels = {
  ideia:'Ideia',producao:'Em produção',publicado:'Publicado',
  testando:'Testando',bem:'Performando bem',mal:'Performando mal'
};

function renderLogs(){
  const logs=store.logs||[];
  const el=document.getElementById('log-timeline');
  if(!el) return;
  const filtered = _logFilter==='all' ? logs : logs.filter(l=>l.status===_logFilter || l.avaliacao===_logFilter);
  if(!filtered.length){el.innerHTML='<div style="font-size:14px;color:var(--dim);padding:8px 0">Nenhum post nesta categoria ainda.</div>';return;}
  el.innerHTML=filtered.map(l=>{
    const pill = statusPillMap[l.status]||'cs-ideia';
    const pilllabel = statusLabels[l.status]||l.status||'—';
    const avalSign = l.avaliacao==='funcionou'?'<span style="color:var(--green);font-weight:700;margin-left:8px">✓</span>'
                   : l.avaliacao==='naofuncionou'?'<span style="color:var(--red);font-weight:700;margin-left:8px">✗</span>':'';
    return `<div class="timeline-item">
      <div class="timeline-date">${l.date||'—'} · ${l.platform||''}</div>
      <div class="timeline-title" style="display:flex;align-items:center;gap:8px;flex-wrap:wrap">
        ${l.desc}${avalSign}
        <span class="cs-pill ${pill}">${pilllabel}</span>
        ${l.objetivo?`<span class="cs-pill cs-ideia">${l.objetivo}</span>`:''}
      </div>
      <div class="timeline-body">
        Alcance: ${l.reach||'—'} · Curtidas: ${l.likes||'—'} · Salvamentos: ${l.saves||'—'} · Comentários: ${l.comments||'—'}
        ${l.insight?`<br><em style="color:var(--dim)">${l.insight}</em>`:''}
      </div>
    </div>`;
  }).join('');
}

function renderLogInsights() {
  const logs = store.logs||[];
  const panel = document.getElementById('log-insights-panel');
  const list = document.getElementById('log-insights-list');
  if(!panel||!list) return;
  const insightLogs = logs.filter(l=>l.insight||(l.avaliacao==='funcionou'||l.avaliacao==='naofuncionou'));
  if(!insightLogs.length){panel.style.display='none';return;}
  panel.style.display='block';
  // agrupar por avaliação e gerar padrões
  const bem = logs.filter(l=>l.avaliacao==='funcionou');
  const mal = logs.filter(l=>l.avaliacao==='naofuncionou');
  const porObj = {};
  bem.forEach(l=>{if(l.objetivo){porObj[l.objetivo]=(porObj[l.objetivo]||0)+1;}});
  let html = '';
  if(bem.length) html += `<div class="timeline-body" style="margin-bottom:8px"><strong style="color:var(--green)">${bem.length} conteúdo(s) funcionaram.</strong> ${Object.entries(porObj).map(([k,v])=>`${v}x ${k}`).join(' · ')}</div>`;
  if(mal.length) html += `<div class="timeline-body" style="margin-bottom:8px"><strong style="color:var(--red)">${mal.length} conteúdo(s) não performaram.</strong></div>`;
  const insights = insightLogs.filter(l=>l.insight).map(l=>l.insight).slice(0,5);
  if(insights.length) html += insights.map(i=>`<div class="timeline-body" style="padding:6px 0;border-bottom:1px solid var(--border)">· ${i}</div>`).join('');
  list.innerHTML = html;
}

// ── DECISÃO DA SEMANA ────────────────────────────────────────────────
// Framework Stop / Continue / Test / Scale — registro semanal de direção.
// Histórico salvo em store.decisions (array, mais recente primeiro).
// deleteDecision() requer confirmação antes de apagar.
function saveDecision(){
  const entry={
    dateStart:document.getElementById('dec-date-start').value,
    dateEnd:document.getElementById('dec-date-end').value,
    stop:document.getElementById('dec-stop').value,
    continue:document.getElementById('dec-continue').value,
    test:document.getElementById('dec-test').value,
    scale:document.getElementById('dec-scale').value,
    id:Date.now()
  };
  if(!entry.stop && !entry.continue && !entry.test && !entry.scale)return;
  store.decisions=store.decisions||[];
  store.decisions.unshift(entry);
  saveStore();
  renderDecisions();
}
function deleteDecision(id){
  if(!confirm('Apagar esta decisão do histórico?'))return;
  store.decisions=(store.decisions||[]).filter(d=>d.id!==id);
  saveStore();
  renderDecisions();
}
function renderDecisions(){
  const decisions=store.decisions||[];
  const el=document.getElementById('decision-history');
  if(!decisions.length){el.innerHTML='<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma decisão registrada ainda.</div>';return;}
  el.innerHTML = '<div style="border-top:1px solid var(--border)">' + decisions.map((d,idx)=>`
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('dec',${idx})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">Semana ${d.dateStart||'—'} → ${d.dateEnd||'—'}</span>
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${[d.stop,d.continue,d.test,d.scale].filter(Boolean).join(' · ').slice(0,60)||'sem resumo'}</span>
        </div>
        <span id="acc-arrow-dec-${idx}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-dec-${idx}" style="display:none;padding:0 0 16px 0">
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
          ${d.stop?`<div style="padding:12px 14px;border:1px solid rgba(192,57,43,.25);background:var(--red-bg)"><div style="font-size:11px;letter-spacing:.18em;color:var(--red);text-transform:uppercase;margin-bottom:6px">Parar</div><div style="font-size:14px;color:var(--sub);line-height:1.65">${d.stop}</div></div>`:''}
          ${d.continue?`<div style="padding:12px 14px;border:1px solid rgba(46,125,94,.25);background:var(--green-bg)"><div style="font-size:11px;letter-spacing:.18em;color:var(--green);text-transform:uppercase;margin-bottom:6px">Continuar</div><div style="font-size:14px;color:var(--sub);line-height:1.65">${d.continue}</div></div>`:''}
          ${d.test?`<div style="padding:12px 14px;border:1px solid var(--border2);background:var(--bg3)"><div style="font-size:11px;letter-spacing:.18em;color:var(--accent);text-transform:uppercase;margin-bottom:6px">Testar</div><div style="font-size:14px;color:var(--sub);line-height:1.65">${d.test}</div></div>`:''}
          ${d.scale?`<div style="padding:12px 14px;border:1px solid rgba(112,144,208,.3);background:rgba(112,144,208,.04)"><div style="font-size:11px;letter-spacing:.18em;color:#7090d0;text-transform:uppercase;margin-bottom:6px">Escalar</div><div style="font-size:14px;color:var(--sub);line-height:1.65">${d.scale}</div></div>`:''}
        </div>
        <div style="margin-top:8px">
          <button onclick="deleteDecision(${d.id})" style="font-size:13px;padding:5px 12px;background:none;border:1px solid var(--red);color:var(--red);cursor:pointer;font-family:var(--sans)">Remover</button>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

// ── TESTES ATIVOS ──
function addTest(){
  const hyp=document.getElementById('test-hypothesis').value.trim();
  if(!hyp)return;
  const entry={
    hypothesis:hyp,
    variable:document.getElementById('test-variable').value,
    status:document.getElementById('test-status').value,
    result:document.getElementById('test-result').value,
    id:Date.now()
  };
  store.tests=store.tests||[];
  store.tests.unshift(entry);
  saveStore();
  renderTests();
  ['test-hypothesis','test-variable','test-result'].forEach(id=>{document.getElementById(id).value='';});
}
function renderTests(){
  const tests=store.tests||[];
  const el=document.getElementById('tests-rows');
  if(!el) return;
  if(!tests.length){el.innerHTML='';return;}
  el.innerHTML=tests.map(t=>{
    const pillClass=t.status==='ativo'?'status-ativo':t.status==='pausado'?'status-pausado':'status-concluido';
    return `<div class="test-row">
      <div class="test-cell"><strong>${t.hypothesis}</strong></div>
      <div class="test-cell">${t.variable||'—'}</div>
      <div class="test-cell"><span class="status-pill ${pillClass}">${t.status}</span></div>
      <div class="test-cell">${t.result||'—'}</div>
    </div>`;
  }).join('');
}

// ── APRENDIZADOS ──
function addLearn(){
  const content=document.getElementById('learn-content').value.trim();
  if(!content)return;
  const entry={
    type:document.getElementById('learn-type').value,
    date:document.getElementById('learn-date').value,
    content:content,
    id:Date.now()
  };
  store.learnings=store.learnings||[];
  store.learnings.unshift(entry);
  saveStore();
  renderLearnings();
  document.getElementById('learn-content').value='';
}
function renderLearnings(){
  const learnings=store.learnings||[];
  ['funcionou','nao-funcionou','padrao'].forEach(type=>{
    const el=document.getElementById('learn-'+type);
    if(!el) return;
    const filtered=learnings.filter(l=>l.type===type);
    if(!filtered.length){ el.innerHTML=''; return; }
    el.innerHTML=filtered.map(l=>`<div class="learn-item"><span class="marker">${l.date||'—'}</span><span><strong>${l.content}</strong></span></div>`).join('');
  });
}

// ── LOG SEMANAL ──
function addWeekLog(){
  const body=document.getElementById('wlog-body').value.trim();
  if(!body)return;
  const entry={
    date:document.getElementById('wlog-date').value,
    author:document.getElementById('wlog-author').value,
    body:body,
    decision:document.getElementById('wlog-decision').value,
    id:Date.now()
  };
  store.weekLogs=store.weekLogs||[];
  store.weekLogs.unshift(entry);
  saveStore();
  renderWeekLogs();
  ['wlog-date','wlog-author','wlog-body','wlog-decision'].forEach(id=>{document.getElementById(id).value='';});
}
function renderWeekLogs(){
  const logs=store.weekLogs||[];
  const el=document.getElementById('week-log-list');
  if(!logs.length){el.innerHTML='<div style="font-size:12px;color:var(--dim);padding:8px 0">Nenhuma semana registrada ainda.</div>';return;}
  el.innerHTML=logs.map(l=>`
    <div class="log-entry">
      <div class="log-entry-header">
        <span class="log-entry-date">Semana de ${l.date||'—'} ${l.author?'· '+l.author:''}</span>
      </div>
      <div class="log-entry-body" style="margin-bottom:${l.decision?'10px':'0'}">${l.body}</div>
      ${l.decision?`<div style="padding:8px 10px;border-left:2px solid var(--accent2);margin-top:8px;font-size:13px;color:var(--sub)"><div style="font-size:12px;letter-spacing:.14em;color:var(--dim);margin-bottom:3px">MUDANÇA / DECISÃO</div>${l.decision}</div>`:''}
    </div>
  `).join('');
}

// ── TEMA — MODO CLARO / ESCURO ───────────────────────────────────────
// Alterna a classe 'dark' no <html> e persiste no store.
// O CSS usa variáveis CSS para toda a troca de cores (ver styles.css → :root e html.dark).
function toggleTheme(){
  const isDark=document.documentElement.classList.toggle('dark');
  store.theme=isDark?'dark':'light';
  saveStore();
}

// ══════════════════════════════════════════════════════════════════════
// SISTEMA DE VERSIONAMENTO
// ══════════════════════════════════════════════════════════════════════
// Todos os painéis com conteúdo gerado por IA mantêm um histórico de versões
// salvo em localStorage com a chave VER_KEY.
//
// Estrutura de cada versão:
//   { id: timestamp, date: string, tipo: 'ia'|'manual'|'auto',
//     preview: string (primeiros 100 chars sem HTML), content: string (HTML completo) }
//
// Limite: 20 versões por painel. A mais recente fica no índice 0.
//
// saveVersion()     — salva só o preview (sem conteúdo restaurável)
// saveVersionFull() — salva preview + conteúdo HTML completo (restaurável)
// showVersoes()     — renderiza o accordion de versões no painel
// restoreVersion()  — sobrescreve o output atual com a versão selecionada
// deleteVersion()   — remove uma versão específica
// exportVersionPDF()— abre o conteúdo em nova aba para impressão/PDF
//
// ACCORDION UNIFICADO — o mesmo toggleAccordion() serve para todos os históricos.
// O namespace (ns) é o prefixo dos IDs gerados: 'dec', 'bmc', 'swot', 'ver_tendencias', etc.

function toggleHistory(ns, idx) {
  const body  = document.getElementById('acc-body-'+ns+'-'+idx);
  const arrow = document.getElementById('acc-arrow-'+ns+'-'+idx);
  if(!body) return;
  const open = body.style.display !== 'none';
  body.style.display  = open ? 'none' : 'block';
  if(arrow) arrow.textContent = open ? '▼' : '▲';
}

// ══════════════════════════════════════
const VER_KEY = 'bi_versions';

function saveVersion(panelId, preview, tipo) {
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  if(!all[panelId]) all[panelId] = [];
  all[panelId].unshift({
    id: Date.now(),
    date: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    tipo: tipo || 'manual',
    preview: preview || '—',
    content: ''
  });
  // manter máx. 20 versões por painel
  if(all[panelId].length > 20) all[panelId] = all[panelId].slice(0,20);
  localStorage.setItem(VER_KEY, JSON.stringify(all));
}

function saveVersionFull(panelId, content, tipo) {
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  if(!all[panelId]) all[panelId] = [];
  const preview = (content||'').replace(/<[^>]+>/g,'').slice(0,100)+'…';
  all[panelId].unshift({
    id: Date.now(),
    date: new Date().toLocaleString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    tipo: tipo || 'manual',
    preview: preview,
    content: content || ''
  });
  if(all[panelId].length > 20) all[panelId] = all[panelId].slice(0,20);
  localStorage.setItem(VER_KEY, JSON.stringify(all));
  // Sincroniza com GitHub em background (não bloqueia UI)
  if(store.ghToken && store.ghRepo) ghSyncUp();
}

function showVersoes(panelId) {
  const wrap = document.getElementById(panelId+'-versoes-wrap') ||
               document.querySelector('#p-'+panelId+' [id$="-versoes-wrap"]');
  if(!wrap) return;
  wrap.style.display = 'block';
  const list = document.getElementById(panelId+'-versoes-list') ||
               wrap.querySelector('[id$="-versoes-list"]');
  if(!list) return;
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  const vers = all[panelId] || [];
  if(!vers.length){
    list.innerHTML='<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma versão salva ainda.</div>';
    return;
  }
  list.innerHTML = '<div style="border-top:1px solid var(--border)">' + vers.map((v,i)=>`
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('ver_${panelId}',${i})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${v.date}</span>
          <span style="font-size:11px;padding:2px 8px;border:1px solid ${v.tipo==='ia'?'var(--text)':'var(--border2)'};color:${v.tipo==='ia'?'var(--text)':'var(--dim)'};letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${v.tipo==='ia'?'IA':'Manual'}</span>
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${v.preview}</span>
        </div>
        <span id="acc-arrow-ver_${panelId}-${i}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-ver_${panelId}-${i}" style="display:none;padding:0 0 16px 0">
        ${v.content
          ? `<div style="background:var(--bg2);border:1px solid var(--border);padding:16px;font-size:14px;color:var(--sub);line-height:1.85;max-height:320px;overflow-y:auto">${v.content}</div>`
          : `<div style="background:var(--bg3);border:1px solid var(--border);padding:14px;font-size:14px;color:var(--sub)">${v.preview}</div>`
        }
        <div style="display:flex;gap:8px;margin-top:8px;flex-wrap:wrap">
          ${v.content?`<button class="btn btn-primary" onclick="restoreVersion('${panelId}',${i})" style="font-size:13px;padding:6px 14px">Restaurar</button>`:''}
          <button class="btn" onclick="exportAnaliseTexto('${panelId}',${i})" style="font-size:13px;padding:6px 14px">⬇ Exportar</button>
          <button class="btn" onclick="deleteVersion('${panelId}',${i})" style="font-size:13px;padding:6px 14px;color:var(--red);border-color:var(--red)">Remover</button>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

// mapa de panelId → elemento de output (para casos onde o ID não segue o padrão "out-{id}")
const PANEL_OUTPUT_MAP = {
  'tendencias':   'tend-ai-output',
  'competidores': 'out-lancamentos',
  'planejador':   'out-pauta',
  'swot':         'swot-output',
  'analyzer':     'out-analyzer',
  'brief':        'out-brief',
  'hashgen':      'out-hgen',
  'adcopy':       'out-ad',
  'imgcopy':      'out-imgcopy',
  'roteiro':      'out-roteiro',
  'iaassist':     'out-assist'
};

function restoreVersion(panelId, idx) {
  if(!confirm('Restaurar esta versão? O conteúdo atual será substituído.')) return;
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  const ver = (all[panelId]||[])[idx];
  if(!ver || !ver.content) return;
  const outId = PANEL_OUTPUT_MAP[panelId] || ('out-'+panelId);
  const out = document.getElementById(outId) ||
              document.querySelector('#p-'+panelId+' .ai-output');
  if(out) {
    out.innerHTML = ver.content;
    out.style.display='block';
    // esconde placeholder se existir
    const ph = document.getElementById(panelId === 'tendencias' ? 'tend-placeholder' : panelId+'-placeholder');
    if(ph) ph.style.display='none';
  }
  markPanelUpdated(panelId);
  alert('Versão restaurada.');
}

function deleteVersion(panelId, idx) {
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  if(all[panelId]) all[panelId].splice(idx,1);
  localStorage.setItem(VER_KEY, JSON.stringify(all));
  showVersoes(panelId);
}

function exportVersionPDF(panelId, idx) {
  const all = JSON.parse(localStorage.getItem(VER_KEY)||'{}');
  const ver = (all[panelId]||[])[idx];
  if(!ver) return;
  const w = window.open('','_blank');
  w.document.write(`<html><head><title>Border · ${panelId} · ${ver.date}</title>
  <style>body{font-family:Helvetica,Arial,sans-serif;max-width:700px;margin:40px auto;font-size:15px;line-height:1.7;color:#212121}h1{font-size:22px;font-weight:700;margin-bottom:4px}p.sub{color:#757575;font-size:13px;margin-bottom:32px}</style>
  </head><body>
  <h1>Border · ${panelId}</h1><p class="sub">${ver.date} · ${ver.tipo==='ia'?'Gerado por IA':'Manual'}</p>
  <div>${ver.content||ver.preview}</div>
  </body></html>`);
  w.document.close();
  w.print();
}

// ══════════════════════════════════════════════════════════════════════
// EXPORTAR / IMPORTAR HISTÓRICO DE ANÁLISES
// ══════════════════════════════════════════════════════════════════════
// O histórico fica no localStorage (VER_KEY). Essas funções permitem
// exportar para JSON e reimportar — preservando análises entre sessões,
// dispositivos e limpezas de cache.

function exportHistorico() {
  const all = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
  const paneis = Object.keys(all);
  const totalVers = paneis.reduce((sum, p) => sum + (all[p]||[]).length, 0);
  if (!totalVers) { alert('Nenhuma análise salva ainda.'); return; }

  const payload = {
    exportado_em: new Date().toLocaleString('pt-BR'),
    total_paineis: paneis.length,
    total_versoes: totalVers,
    historico: all
  };
  const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `border-historico-${new Date().toISOString().slice(0,10)}.json`;
  a.click();
  URL.revokeObjectURL(url);
}

function importHistoricoClick() {
  document.getElementById('import-historico-file').click();
}

function importHistorico(input) {
  const file = input.files[0];
  if (!file) return;
  const msg = document.getElementById('historico-import-msg');
  const reader = new FileReader();
  reader.onload = function(e) {
    try {
      const data = JSON.parse(e.target.result);
      const historico = data.historico || data; // suporta formato com envelope ou raw
      const existente = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
      let adicionadas = 0;
      // Merge: para cada painel do arquivo, une com o existente (sem duplicar por id)
      Object.keys(historico).forEach(painel => {
        if (!existente[painel]) existente[painel] = [];
        const idsExistentes = new Set(existente[painel].map(v => v.id));
        const novas = (historico[painel] || []).filter(v => !idsExistentes.has(v.id));
        existente[painel] = [...novas, ...existente[painel]].slice(0, 20);
        adicionadas += novas.length;
      });
      localStorage.setItem(VER_KEY, JSON.stringify(existente));
      msg.style.color = 'var(--green)';
      msg.textContent = `✓ ${adicionadas} versões importadas com sucesso.`;
      updateHistoricoStats();
    } catch(err) {
      msg.style.color = 'var(--red)';
      msg.textContent = 'Erro ao ler o arquivo: ' + err.message;
    }
  };
  reader.readAsText(file);
  input.value = ''; // reset para permitir reimportar o mesmo arquivo
}

function updateGhStatus() {
  const msg = document.getElementById('gh-status-msg');
  const badge = document.getElementById('gh-sync-badge');
  if (!msg) return;
  if (store.ghToken && store.ghRepo) {
    msg.style.color = 'var(--green)';
    msg.textContent = `✓ Configurado · ${store.ghRepo}`;
    if (badge) { badge.style.color='var(--green)'; badge.textContent='● ativo'; }
  } else {
    msg.style.color = 'var(--dim)';
    msg.textContent = 'Não configurado — análises ficam apenas no browser.';
    if (badge) { badge.style.color='var(--dim)'; badge.textContent='○ inativo'; }
  }
}

function updateHistoricoStats() {
  const el = document.getElementById('historico-stats');
  if (!el) return;
  const all = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
  const paneis = Object.keys(all).filter(p => all[p].length > 0);
  const total = paneis.reduce((sum, p) => sum + all[p].length, 0);
  if (!total) { el.textContent = 'Nenhuma análise salva.'; return; }
  const mais_recente = paneis
    .flatMap(p => all[p])
    .sort((a, b) => b.id - a.id)[0];
  el.textContent = `${total} análise${total>1?'s':''} salva${total>1?'s':''} em ${paneis.length} painel${paneis.length>1?'is':''} · última: ${mais_recente?.date || '—'}`;
}

// Exporta uma versão específica como texto limpo (Markdown)
function exportAnaliseTexto(panelId, idx) {
  const all = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
  const ver = (all[panelId] || [])[idx];
  if (!ver) return;
  // converte HTML de volta para texto simples
  const div = document.createElement('div');
  div.innerHTML = ver.content || ver.preview;
  const texto = div.innerText || div.textContent || '';
  const blob = new Blob([`Border Ltd · ${panelId}\n${ver.date}\n\n${texto}`], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `border-${panelId}-${ver.date.replace(/[/:]/g,'-').replace(/ /g,'_')}.txt`;
  a.click();
  URL.revokeObjectURL(url);
}

// ── INIT SÍNCRONO (executa imediatamente, antes do DOMContentLoaded) ─
// Aplica tema e popula componentes simples antes do DOM estar 100% pronto.
// Tudo que depende de fetch ou dados complexos fica no DOMContentLoaded abaixo.
if(store.apiKey){document.getElementById('api-key-input').value=store.apiKey;saveKey(store.apiKey);}
// Pré-carrega configuração do GitHub no store se ainda não existir
if(!store.ghToken) store.ghToken = '';
if(!store.ghRepo)  store.ghRepo  = 'dupprehelena/border-board';
// Padrão: modo claro. Modo escuro só se explicitamente salvo no store.
if(store.theme==='dark') document.documentElement.classList.add('dark');
else document.documentElement.classList.remove('dark');
renderMetrics();
renderLogs();
renderLogInsights();
renderWeekLogs();

// inicializa termômetro de palavras na abertura
(function initTermometro(){
  const kws = TEND_KEYWORDS_BASE.map(k=>({...k,score:Math.max(30,Math.min(100,k.score+Math.floor(Math.random()*6-3)))})).sort((a,b)=>b.score-a.score);
  renderTermometro(kws);
})();

// define semana atual no planejador
(function initPauta(){
  const el=document.getElementById('pauta-semana');
  if(el){const d=new Date();d.setDate(d.getDate()-(d.getDay()||7)+1);el.value=d.toISOString().slice(0,10);}
})();

// ══════════════════════════════════════
// BANCO DE REFERÊNCIAS
// ══════════════════════════════════════
function addReferencia() {
  const tipo = document.getElementById('ref-tipo').value;
  const categoria = document.getElementById('ref-categoria').value;
  const conteudo = document.getElementById('ref-conteudo').value.trim();
  const nota = document.getElementById('ref-nota').value.trim();
  if(!conteudo) return;
  store.referencias = store.referencias || [];
  store.referencias.unshift({id:Date.now(), tipo, categoria, conteudo, nota});
  saveStore();
  document.getElementById('ref-conteudo').value='';
  document.getElementById('ref-nota').value='';
  document.getElementById('ref-add-form').style.display='none';
  renderReferencias('all');
}

function deleteReferencia(id) {
  store.referencias = (store.referencias||[]).filter(r=>r.id!==id);
  saveStore();
  renderReferencias(_refFilter||'all');
}

let _refFilter = 'all';
function filterRefs(tipo) {
  _refFilter = tipo;
  document.querySelectorAll('[id^="ref-filter-"]').forEach(b=>{
    b.style.borderColor='';b.style.color='';
  });
  const active = document.getElementById('ref-filter-'+tipo);
  if(active){active.style.borderColor='var(--text)';active.style.color='var(--text)';}
  renderReferencias(tipo);
}

function renderReferencias(filtro) {
  const refs = store.referencias || [];
  const filtered = filtro==='all' ? refs : refs.filter(r=>r.tipo===filtro);
  const lista = document.getElementById('ref-lista');
  const empty = document.getElementById('ref-empty');
  if(!lista) return;
  if(!filtered.length){
    lista.innerHTML='';
    if(empty) empty.style.display='block';
    return;
  }
  if(empty) empty.style.display='none';
  const tipoIcons={link:'↗',marca:'◈',hashtag:'#',imagem:'▣',nota:'◌'};
  lista.innerHTML = filtered.map(r=>`
    <div class="ref-item">
      <span class="ref-type">${tipoIcons[r.tipo]||'·'} ${r.tipo}</span>
      <div class="ref-content">
        ${r.tipo==='link'||r.tipo==='imagem'
          ? `<a href="${r.conteudo}" target="_blank">${r.conteudo}</a>`
          : `<strong>${r.conteudo}</strong>`}
        ${r.nota?`<div style="color:var(--dim);font-size:13px;margin-top:3px">${r.nota}</div>`:''}
        <div style="font-size:11px;color:var(--dim);margin-top:4px;letter-spacing:.08em;text-transform:uppercase">${r.categoria||''}</div>
      </div>
      <button class="ref-del" onclick="deleteReferencia(${r.id})" title="Remover">✕</button>
    </div>
  `).join('');
}

renderReferencias('all');

// inicializa footers, relógio e timestamp de deploy
startHeaderClock();
initDeployTs();
initAllFooters();


// ── FOLLOWERS EDITOR ──
const FOL_DEFAULTS = {class:'170K',bolovo:'214K',welcome:'120K',eden:'22K',dust:'154K IG / 11.4K TikTok',hist:'~15K'};
function editFollowers(key){
  const cur = (store.followers_data||{})[key];
  const inp = document.getElementById('fol-'+key+'-input');
  if(inp) inp.value = cur ? cur.value : FOL_DEFAULTS[key];
  document.getElementById('fol-'+key+'-display').style.display='none';
  const editEl = document.getElementById('fol-'+key+'-edit');
  editEl.style.display='flex';
  if(inp) inp.focus();
}
function cancelFollowers(key){
  document.getElementById('fol-'+key+'-display').style.display='';
  document.getElementById('fol-'+key+'-edit').style.display='none';
}
function saveFollowers(key){
  const inp = document.getElementById('fol-'+key+'-input');
  const val = (inp ? inp.value.trim() : '') || FOL_DEFAULTS[key];
  const today = new Date().toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
  store.followers_data = store.followers_data || {};
  store.followers_data[key] = {value: val, date: today};
  saveStore();
  renderFollowers();
  cancelFollowers(key);
}
function renderFollowers(){
  const fd = store.followers_data || {};
  Object.keys(FOL_DEFAULTS).forEach(key=>{
    const d = fd[key];
    const dispEl = document.getElementById('fol-'+key+'-display');
    const updEl = document.getElementById('fol-'+key+'-updated');
    if(dispEl && d) dispEl.textContent = d.value + ' seguidores';
    if(updEl) updEl.textContent = d ? 'atualizado '+d.date : '';
  });
}

// ── MONITORING DATA LOADER ───────────────────────────────────────────
// Helpers para popular elementos do DOM com dados do data.json.
// setText()        — preenche um elemento com texto (usa '—' se vazio)
// renderList()     — renderiza um array como lista de bullets
// renderBenchmark()— renderiza tabela de benchmark de concorrentes
function setText(id, val) {
  const el = document.getElementById(id);
  if(el) el.textContent = val || '—';
}

function renderList(containerId, items) {
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!items || items.length === 0) {
    el.innerHTML = '<div class="monitor-bullet">Sem dados disponíveis.</div>';
    return;
  }
  el.innerHTML = items.map(i => '<div class="monitor-bullet">' + i + '</div>').join('');
}

function renderBenchmark(containerId, items) {
  const el = document.getElementById(containerId);
  if(!el) return;
  if(!items || items.length === 0) { el.innerHTML = '<div class="monitor-empty">Sem dados.</div>'; return; }
  el.innerHTML = items.map(r =>
    '<div class="benchmark-row">' +
    '<span class="benchmark-brand">' + (r.name||'') + '</span>' +
    '<span class="benchmark-followers">' + (r.followers||'—') + '</span>' +
    '<span class="benchmark-note">' + (r.note||'') + '</span>' +
    '</div>'
  ).join('');
}

// ══════════════════════════════════════════════════════════════════════
// CARREGA CONTEÚDO AUTOMÁTICO DO data.json
// ══════════════════════════════════════════════════════════════════════
// loadAutoContent() é chamada dentro de loadMonitoringData() após o fetch.
// Recebe o objeto `d` (conteúdo do data.json já parseado).
//
// Conteúdos automáticos suportados:
//   d.tendencias_auto — análise de tendências pré-gerada
//   d.swot_auto       — análise SWOT pré-gerada
//   d.pauta_auto      — planejador editorial pré-gerado
//
// Para cada um, só substitui o conteúdo atual se NÃO houver uma atualização
// manual mais recente no localStorage — respeita edições do usuário.
//
// Para adicionar novo conteúdo automático ao data.json:
//   1. Adicione o campo em data.json seguindo o padrão { gerado_em, conteudo }
//   2. Adicione o bloco if(d.novo_campo) aqui com a lógica de injeção
//   3. Adicione os IDs correspondentes no index.html

function loadAutoContent(d) {  // não é async — não faz fetch, só popula o DOM
  // TENDÊNCIAS AUTO
  if(d.tendencias_auto) {
    const t = d.tendencias_auto;
    const badge = document.getElementById('tend-auto-badge');
    const info  = document.getElementById('tend-auto-info');
    const ts    = document.getElementById('tend-auto-ts');
    const aiOut = document.getElementById('tend-ai-output');
    const ph    = document.getElementById('tend-placeholder');
    if(badge) badge.style.display='inline';
    if(info)  { info.style.display='block'; }
    if(ts)    ts.textContent = t.gerado_em || '—';
    if(aiOut && t.conteudo) {
      aiOut.innerHTML = `<div class="ai-output" style="display:block">${t.conteudo}</div>`;
      if(ph) ph.style.display='none';
      // usa timestamp do data.json se não há atualização mais recente no localStorage
      const ups = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
      if(!ups['tendencias'] && t.gerado_em) {
        ups['tendencias'] = parseDataJsonTs(t.gerado_em);
        localStorage.setItem('bi_panel_updates', JSON.stringify(ups));
      }
      renderPanelFooter('tendencias');
    }
  }

  // SWOT AUTO
  if(d.swot_auto) {
    const s = d.swot_auto;
    const badge = document.getElementById('swot-auto-badge');
    const info  = document.getElementById('swot-auto-info');
    const ts    = document.getElementById('swot-auto-ts');
    if(badge) badge.style.display='inline';
    if(info)  info.style.display='flex';
    if(ts)    ts.textContent = s.gerado_em || '—';
    const fmt = arr => (arr||[]).map(i=>`<div style="padding:3px 0;border-bottom:1px solid rgba(128,128,128,.1)">${i}</div>`).join('');
    if(s.forcas)      { const el=document.getElementById('swot-s'); if(el) el.innerHTML=fmt(s.forcas); }
    if(s.fraquezas)   { const el=document.getElementById('swot-w'); if(el) el.innerHTML=fmt(s.fraquezas); }
    if(s.oportunidades){ const el=document.getElementById('swot-o'); if(el) el.innerHTML=fmt(s.oportunidades); }
    if(s.ameacas)     { const el=document.getElementById('swot-t'); if(el) el.innerHTML=fmt(s.ameacas); }
    if(s.narrativa) {
      const out=document.getElementById('swot-output');
      if(out) out.innerHTML=`<div class="card" style="margin-top:4px"><div class="card-label" style="margin-bottom:10px">Análise Estratégica Narrativa</div><div style="font-size:var(--fs-body);color:var(--sub);line-height:1.9">${s.narrativa.replace(/\n/g,'<br>')}</div></div>`;
    }
    // usa timestamp do data.json se não há atualização mais recente no localStorage
    const upsSwot = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
    if(!upsSwot['swot'] && s.gerado_em) {
      upsSwot['swot'] = parseDataJsonTs(s.gerado_em);
      localStorage.setItem('bi_panel_updates', JSON.stringify(upsSwot));
    }
    renderPanelFooter('swot');
  }

  // PAUTA AUTO
  if(d.pauta_auto) {
    const p = d.pauta_auto;
    const badge = document.getElementById('pauta-auto-badge');
    const info  = document.getElementById('pauta-auto-info');
    const ts    = document.getElementById('pauta-auto-ts');
    const out   = document.getElementById('out-pauta');
    const ph    = document.getElementById('pauta-placeholder');
    if(badge) badge.style.display='inline';
    if(info)  info.style.display='block';
    if(ts)    ts.textContent = p.gerado_em || '—';
    if(out && p.conteudo) {
      out.innerHTML=`<div class="ai-output" style="display:block">${p.conteudo}</div>`;
      if(ph) ph.style.display='none';
      // usa timestamp do data.json se não há atualização mais recente no localStorage
      const upsPauta = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
      if(!upsPauta['planejador'] && p.gerado_em) {
        upsPauta['planejador'] = parseDataJsonTs(p.gerado_em);
        localStorage.setItem('bi_panel_updates', JSON.stringify(upsPauta));
      }
      renderPanelFooter('planejador');
    }
  }
}

// converte "DD/MM/YYYY HH:MM" do data.json em timestamp Unix
function parseDataJsonTs(str) {
  if(!str) return Date.now();
  const m = str.match(/(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2}):(\d{2})/);
  if(!m) return Date.now();
  return new Date(+m[3], +m[2]-1, +m[1], +m[4], +m[5]).getTime();
}

async function loadMonitoringData() {
  try {
    const res = await fetch('data.json?t=' + Date.now());
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const d = await res.json();

    // disponibiliza os dados globalmente (usado pela home e outros módulos)
    window._boardData = d;

    // carrega conteúdo automático (tendências, swot, pauta)
    loadAutoContent(d);

    const m = d.monitoramento || {};

    // ── Cabeçalho — data de atualização ──
    if(d.lastUpdated) {
      const dt = new Date(d.lastUpdated + 'T12:00:00');
      const fmt = dt.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'});
      const updEl = document.getElementById('board-last-updated');
      const updDate = document.getElementById('board-updated-date');
      if(updEl) updEl.style.display='';
      if(updDate) updDate.textContent = fmt;
    }

    // ── Concorrentes ──
    const cc = m.concorrentes;
    if(cc) {
      document.getElementById('mc-loading').style.display = 'none';
      document.getElementById('mc-content').style.display = 'block';
      setText('mc-date', cc.date || '—');
      setText('mc-summary', cc.summary || '—');
      const cs = cc.companies || {};
      ['class_official','bolovo','welcome_sunny','back_to_eden','the_dust_company','hist'].forEach(function(key) {
        const pfx = key === 'class_official' ? 'mc-class' :
                    key === 'bolovo' ? 'mc-bolovo' :
                    key === 'welcome_sunny' ? 'mc-welcome' :
                    key === 'the_dust_company' ? 'mc-dust' :
                    key === 'hist' ? 'mc-hist' : 'mc-eden';
        const c = cs[key] || {};
        setText(pfx + '-novidades', c.novidades);
        setText(pfx + '-ads', c.ads);
        setText(pfx + '-growth', c.growth);
        setText(pfx + '-obs', c.observation);
      });
      renderList('mc-trends', cc.market_trends);
      renderList('mc-opportunities', cc.opportunities);
      const alerts = cc.alerts || [];
      const alertEl = document.getElementById('mc-alerts');
      if(alertEl) {
        if(alerts.length === 0) {
          alertEl.innerHTML = '<div class="monitor-bullet">Nenhum alerta esta semana.</div>';
        } else {
          alertEl.innerHTML = alerts.map(a => '<div class="monitor-alert">' + a + '</div>').join('');
        }
      }
      // registra last_updated usando a data do relatório
      const upsMc = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
      if(!upsMc['monitor-concorrentes'] && cc.date) {
        const parts = cc.date.split('-');
        if(parts.length===3) upsMc['monitor-concorrentes'] = new Date(+parts[0],+parts[1]-1,+parts[2]).getTime();
        localStorage.setItem('bi_panel_updates', JSON.stringify(upsMc));
      }
      renderPanelFooter('monitor-concorrentes');
      // Salva snapshot no histórico se ainda não existe registro para esta data
      const mcHistKey = 'bi_mc_last_saved';
      if(cc.date && localStorage.getItem(mcHistKey) !== cc.date) {
        const mcSnap = Object.entries(cc.companies||{}).map(([k,v])=>`<strong>${k.replace(/_/g,' ')}</strong>: ${v.novidades||'—'}`).join('<br>');
        saveVersionFull('monitor-concorrentes', `<div style="font-size:14px;color:var(--sub);line-height:1.9"><em>${cc.summary||''}</em><br><br>${mcSnap}</div>`, 'auto');
        localStorage.setItem(mcHistKey, cc.date);
        showVersoes('monitor-concorrentes');
      }
    } else {
      document.getElementById('mc-loading').style.display = 'none';
      document.getElementById('mc-error').style.display = 'block';
    }

    // ── Crescimento ──
    const cg = m.crescimento;
    if(cg) {
      document.getElementById('mg-loading').style.display = 'none';
      document.getElementById('mg-content').style.display = 'block';
      setText('mg-date', cg.date || '—');
      setText('mg-pulse', cg.pulse || '—');
      const men = cg.mentions || {};
      setText('mg-mentions-total', men.total);
      setText('mg-mentions-tone', men.tone);
      setText('mg-mentions-highlights', men.highlights);
      setText('mg-google', cg.google_presence);
      const hsh = cg.hashtags || {};
      setText('mg-hash-borderltd', hsh.borderltd);
      setText('mg-hash-street', hsh.streetalfaiataria);
      renderBenchmark('mg-benchmark', cg.benchmark);
      renderList('mg-trends', cg.trends);
      renderList('mg-keywords', cg.keywords);
      renderList('mg-calendar', cg.calendar);
      setText('mg-recommendation', cg.recommendation);
      // registra last_updated usando a data do relatório
      const upsMg = JSON.parse(localStorage.getItem('bi_panel_updates')||'{}');
      if(!upsMg['monitor-crescimento'] && cg.date) {
        const parts2 = cg.date.split('-');
        if(parts2.length===3) upsMg['monitor-crescimento'] = new Date(+parts2[0],+parts2[1]-1,+parts2[2]).getTime();
        localStorage.setItem('bi_panel_updates', JSON.stringify(upsMg));
      }
      renderPanelFooter('monitor-crescimento');
      // Salva snapshot no histórico se ainda não existe registro para esta data
      const mgHistKey = 'bi_mg_last_saved';
      if(cg.date && localStorage.getItem(mgHistKey) !== cg.date) {
        const mgSnap = `<strong>Pulse:</strong> ${cg.pulse||'—'}<br><strong>Menções:</strong> ${(cg.mentions||{}).total||'—'} · tom: ${(cg.mentions||{}).tone||'—'}<br><strong>Recomendação:</strong> ${cg.recommendation||'—'}`;
        saveVersionFull('monitor-crescimento', `<div style="font-size:14px;color:var(--sub);line-height:1.9">${mgSnap}</div>`, 'auto');
        localStorage.setItem(mgHistKey, cg.date);
        showVersoes('monitor-crescimento');
      }
    } else {
      document.getElementById('mg-loading').style.display = 'none';
      document.getElementById('mg-error').style.display = 'block';
    }
  } catch(e) {
    ['mc-loading','mg-loading'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) el.style.display = 'none';
    });
    ['mc-error','mg-error'].forEach(function(id){
      const el = document.getElementById(id);
      if(el) el.style.display = 'block';
    });
  }
  // sempre (re)inicializa a home após carregar os dados
  initHome();
}

// ── SEED DE HISTÓRICO (data_history.json) ────────────────────────────
// Carrega o histórico salvo em arquivo e injeta no localStorage como seed.
// Só injeta chaves que ainda não existem — nunca sobrescreve dados do usuário.
// Isso garante que o histórico persiste mesmo após limpeza de cache do browser.
async function seedHistoryFromFile() {
  try {
    const res = await fetch('data_history.json?t=' + Date.now());
    if (!res.ok) return;
    const h = await res.json();

    // Injeta bi_versions (histórico genérico: concorrentes, crescimento, tendências, pauta)
    if (h.bi_versions) {
      const existing = JSON.parse(localStorage.getItem(VER_KEY) || '{}');
      let changed = false;
      for (const [panelId, versions] of Object.entries(h.bi_versions)) {
        if (!existing[panelId] || existing[panelId].length === 0) {
          existing[panelId] = versions;
          changed = true;
        }
      }
      if (changed) localStorage.setItem(VER_KEY, JSON.stringify(existing));
    }

    // Injeta bi_swot_history
    if (h.bi_swot_history && h.bi_swot_history.length > 0) {
      const existingSwot = JSON.parse(localStorage.getItem('bi_swot_history') || '[]');
      if (existingSwot.length === 0) {
        localStorage.setItem('bi_swot_history', JSON.stringify(h.bi_swot_history));
      }
    }

    // Injeta marcadores de última versão salva (evita re-seed duplicado)
    if (h.bi_mc_last_saved && !localStorage.getItem('bi_mc_last_saved')) {
      localStorage.setItem('bi_mc_last_saved', h.bi_mc_last_saved);
    }
    if (h.bi_mg_last_saved && !localStorage.getItem('bi_mg_last_saved')) {
      localStorage.setItem('bi_mg_last_saved', h.bi_mg_last_saved);
    }
  } catch(e) {
    // Falha silenciosa — seed é opcional
  }
}

// ── INIT ASSÍNCRONO (DOMContentLoaded) ───────────────────────────────
// Executa quando todo o HTML foi parseado. Faz fetch, renderiza históricos
// e popula componentes que dependem de dados complexos ou do DOM completo.
document.addEventListener('DOMContentLoaded', async function() {
  // Restaura API key no input
  const _ki = document.getElementById('api-key-input');
  if(_ki && store.apiKey) { _ki.value = store.apiKey; saveKey(store.apiKey); }
  initHome();       // saudação e data imediatos; oportunidades atualizam após o fetch

  // Seed do histórico ANTES de renderizar (garante que os dados estarão disponíveis)
  await seedHistoryFromFile();

  // Sync com GitHub — puxa análises salvas de outros dispositivos/sessões
  if (store.ghToken && store.ghRepo) ghSyncDown();

  loadMonitoringData();
  renderFollowers();
  renderSWOTHistory();
  renderTendenciasHistory();
  renderCompetidoresHistory();
  showVersoes('planejador');
  renderCollectStatus();
  renderCanvasHistoryAccordion();
  renderDecisions();
  initCanvasDisplays();
  initMetaInputs();
  renderLearnings();
  renderTests();

  // ── ROTEAMENTO INICIAL ──────────────────────────────────────────────
  // Abre o painel correto conforme o pathname da URL atual.
  // Se a URL for /performance/organico, abre p-organico direto.
  const initId = panelFromPath(location.pathname);
  if(initId && initId !== 'home') {
    // Substitui o state sem criar nova entrada no histórico
    history.replaceState({panelId: initId}, '', location.pathname);
    go(initId, null, true);
  } else {
    // Home: garante que o state está registrado
    history.replaceState({panelId: 'home'}, '', '/');
  }
});

// ══════════════════════════════════════════════════════════════════════
// BUSINESS MODEL CANVAS — EDIÇÃO + HISTÓRICO
// ══════════════════════════════════════════════════════════════════════
// O Canvas é editável inline: clique em "Editar" em cada bloco, edite no
// textarea e salve. O valor anterior é automaticamente movido para o histórico.
//
// BMC_KEY       — chave do localStorage com o canvas atual
// BMC_HIST_KEY  — chave do localStorage com o histórico de edições (máx 50)
// BMC_DEFAULTS  — valores padrão (usados se o localStorage estiver vazio)
// BMC_LABELS    — labels legíveis de cada campo (para exibição no histórico)
//
// ⚠️ Para adicionar um novo campo ao Canvas:
//   1. Adicione a chave em BMC_DEFAULTS com o valor padrão
//   2. Adicione o label em BMC_LABELS
//   3. Adicione o bloco HTML em index.html seguindo o padrão dos outros campos
const BMC_KEY = 'border_bmc_v1';
const BMC_HIST_KEY = 'border_bmc_history_v1';

const BMC_DEFAULTS = {
  parceiros: `Criadores: Fotógrafos e criadores parceiros, Collabs estratégicas\nFornecedor chave: Confecção private label (lab77, ramps e RDV Caps), Fornecedor de embalagem (printi e mag), Fornecedor de brindes\nParceiro de distribuição: Correios, Jadlog, Transportadora, Lojas multimarcas (futuro)\nParceiro tecnológico: Plataforma de e-commerce (NuvemShop), Hostgator, Software de gestão ERP`,
  atividades: `Pesquisa e desenvolvimento de coleção\nCriação de modelagem própria\nPlanejamento de drops\nProdução em pequena escala\nMarketing narrativo\nGestão de comunidade\nGestão financeira e margem`,
  recursos: `Marca e identidade autoral\nEstúdio e criação própria\nMarketing narrativo e comunidade\nParcerias estratégicas\nPlataforma de e-commerce`,
  proposta: `Problemas/pontos de dor: Mulheres desfem não se veem representadas na moda tradicional; Falta de representatividade; Modelagens que não contemplam corpos diversos; Streetwear feminino padronizado ou hipersexualizado\nSolução: Modelagens autorais pensadas para corpos diversos; Streetwear com alfaiataria e estrutura; Drops limitados e numerados; Produção consciente e responsável\nBenefício Funcional: Caimento estruturado; Conforto + presença estética; Peças versáteis e duráveis\nBenefício Emocional: Autonomia estética; Sentimento de pertencimento; Validação de identidade\nDiferencial: Marca criada por mulher desfem; Produção em pequenas tiragens; Narrativa forte e coerente; Comunidade construída junto`,
  relacionamentos: `Atendimento próximo e transparente\nComunidade ativa\nPré-venda exclusiva / Lista VIP de drops\nConteúdo autoral sobre identidade\nParticipação em decisões (ex: votação de cores)\nClube Border — futuro\nConteúdo autoral recorrente\nHistórias das peças\nObjetivo: transformar cliente em comunidade`,
  canais: `Aquisição: Instagram, Tráfego pago, Conteúdo orgânico\nConversão: E-commerce próprio (NuvemShop), WhatsApp\nRetenção: Email marketing, Social media, Drops exclusivos`,
  segmentos: `Segmento primário: Mulheres desfem e pessoas de identidade não normativa; 23–38 anos; Vivem em capitais ou grandes centros; Valorizam estética street + alfaiataria; Buscam roupas que não sexualizem seus corpos; Renda média a média-alta; Compram marcas autorais independentes\nSegmento secundário: Pessoas do universo criativo (design, arte, música, audiovisual); Consumidores de moda autoral e independente; Comunidade LGBTQIA+ com afinidade estética`,
  custos: `Custos fixos: Plataforma e-commerce, Domínio, ERP, Contabilidade, Internet, Ferramentas (Google Workspace etc.)\nCustos variáveis: Produção por peça, Estamparia, Embalagem, Frete, Taxa de pagamento, Fotografia por drop, Impostos sobre venda — Meta: margem mínima 60–70%\nDespesas operacionais: Infraestrutura de home office (computador, internet, impressora)`,
  receitas: `Principal: Venda de peças em drops limitados — Estratégia: alta margem + baixa escala\nSecundárias (expansão futura): Collabs numeradas, Peças cápsula, Edição especial anual, Eventos pop-up`
};

const BMC_LABELS = {
  parceiros: 'Principais Parceiros',
  atividades: 'Atividades Chave',
  recursos: 'Recursos Chave',
  proposta: 'Proposta de Valor',
  relacionamentos: 'Relacionamentos com Clientes',
  canais: 'Canais',
  segmentos: 'Segmentos de Clientes',
  custos: 'Estrutura de Custos',
  receitas: 'Fontes de Receita'
};

function getBMC() {
  try { return JSON.parse(localStorage.getItem(BMC_KEY)) || {...BMC_DEFAULTS}; }
  catch(e) { return {...BMC_DEFAULTS}; }
}

function getBMCHistory() {
  try { return JSON.parse(localStorage.getItem(BMC_HIST_KEY)) || []; }
  catch(e) { return []; }
}

function startEditCanvas(field) {
  const display = document.getElementById('bmc-display-'+field);
  const editArea = document.getElementById('bmc-edit-'+field);
  const textarea = document.getElementById('bmc-textarea-'+field);
  const bmc = getBMC();
  textarea.value = bmc[field] || BMC_DEFAULTS[field];
  display.style.display = 'none';
  editArea.style.display = 'block';
  textarea.focus();
}

function cancelEditCanvas(field) {
  document.getElementById('bmc-display-'+field).style.display = 'block';
  document.getElementById('bmc-edit-'+field).style.display = 'none';
}

function saveEditCanvas(field) {
  const textarea = document.getElementById('bmc-textarea-'+field);
  const newVal = textarea.value.trim();
  if(!newVal) return;

  const bmc = getBMC();
  const oldVal = bmc[field] || BMC_DEFAULTS[field];

  // Salva no histórico antes de sobrescrever
  const history = getBMCHistory();
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) +
    ' ' + now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  history.unshift({
    field,
    fieldLabel: BMC_LABELS[field],
    date: dateStr,
    value: oldVal
  });
  // Limita histórico a 50 entradas
  if(history.length > 50) history.splice(50);
  localStorage.setItem(BMC_HIST_KEY, JSON.stringify(history));

  // Salva novo valor
  bmc[field] = newVal;
  localStorage.setItem(BMC_KEY, JSON.stringify(bmc));

  // Atualiza display
  renderCanvasField(field, newVal);
  cancelEditCanvas(field);
  renderCanvasHistoryAccordion();
}

function renderCanvasField(field, value) {
  const display = document.getElementById('bmc-display-'+field);
  if(!display) return;
  display.innerHTML = value
    .split('\n')
    .map(line => `<div style="padding:3px 0;border-bottom:1px solid var(--border);font-size:14px;color:var(--sub);line-height:1.6">${line || '&nbsp;'}</div>`)
    .join('');
}

function initCanvasDisplays() {
  const bmc = getBMC();
  Object.keys(BMC_DEFAULTS).forEach(field => {
    renderCanvasField(field, bmc[field] || BMC_DEFAULTS[field]);
  });
}

function renderCanvasHistoryAccordion() {
  const history = getBMCHistory();
  const container = document.getElementById('bmc-history-list');
  if(!container) return;
  if(!history.length) {
    container.innerHTML = '<div style="font-size:14px;color:var(--dim);padding:16px 0;text-align:center">Nenhuma edição registrada ainda.</div>';
    return;
  }
  container.innerHTML = '<div style="border-top:1px solid var(--border)">' + history.map((entry, idx) => `
    <div style="border-bottom:1px solid var(--border)">
      <button onclick="toggleHistory('bmc',${idx})" style="width:100%;background:none;border:none;padding:14px 0;display:flex;align-items:center;justify-content:space-between;cursor:pointer;font-family:var(--sans);text-align:left;gap:12px">
        <div style="display:flex;align-items:center;gap:12px;flex:1;min-width:0">
          <span style="font-size:14px;font-weight:600;color:var(--text)">${entry.date}</span>
          <span style="font-size:11px;padding:2px 8px;border:1px solid var(--border2);color:var(--dim);letter-spacing:.08em;text-transform:uppercase;white-space:nowrap">${entry.fieldLabel}</span>
          <span style="font-size:13px;color:var(--dim);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1">${entry.value.slice(0,60)}${entry.value.length>60?'…':''}</span>
        </div>
        <span id="acc-arrow-bmc-${idx}" style="color:var(--dim);font-size:12px;flex-shrink:0">▼</span>
      </button>
      <div id="acc-body-bmc-${idx}" style="display:none;padding:0 0 16px 0">
        <div style="background:var(--bg3);border:1px solid var(--border);padding:16px;font-size:14px;color:var(--sub);line-height:1.75;white-space:pre-wrap">${entry.value}</div>
        <div style="display:flex;gap:8px;margin-top:8px">
          <button class="btn btn-primary" onclick="restoreBMCEntry(${idx})" style="font-size:13px;padding:6px 14px">Restaurar esta versão</button>
          <button class="btn" onclick="deleteBMCEntry(${idx})" style="font-size:13px;padding:6px 14px;color:var(--red);border-color:var(--red)">Remover</button>
        </div>
      </div>
    </div>
  `).join('') + '</div>';
}

function restoreBMCEntry(idx) {
  if(!confirm('Restaurar esta versão? O conteúdo atual será movido para o histórico.')) return;
  const history = getBMCHistory();
  const entry = history[idx];
  if(!entry) return;
  // Simula salvar o valor restaurado (vai criar nova entrada no histórico)
  const bmc = getBMC();
  const oldVal = bmc[entry.field] || BMC_DEFAULTS[entry.field];
  const now = new Date();
  const dateStr = now.toLocaleDateString('pt-BR',{day:'2-digit',month:'2-digit',year:'numeric'}) + ' ' + now.toLocaleTimeString('pt-BR',{hour:'2-digit',minute:'2-digit'});
  history.unshift({ field:entry.field, fieldLabel:entry.fieldLabel, date:dateStr, value:oldVal });
  history.splice(51);
  bmc[entry.field] = entry.value;
  localStorage.setItem(BMC_KEY, JSON.stringify(bmc));
  localStorage.setItem(BMC_HIST_KEY, JSON.stringify(history));
  renderCanvasField(entry.field, entry.value);
  renderCanvasHistoryAccordion();
}

function deleteBMCEntry(idx) {
  const history = getBMCHistory();
  history.splice(idx, 1);
  localStorage.setItem(BMC_HIST_KEY, JSON.stringify(history));
  renderCanvasHistoryAccordion();
}

// ── INTERCEPTAÇÃO DA NAVEGAÇÃO PARA MONITORAMENTO ────────────────────
// Os painéis de monitoramento recarregam o data.json toda vez que são abertos,
// garantindo dados frescos sem precisar recarregar a página inteira.
// Implementado como decorator da função go() original para não quebrar a nav.
//
// ⚠️ PARA ESTAGIÁRIO: se precisar adicionar lógica "ao abrir painel X",
// adicione um novo `if(id === 'nome-do-painel')` aqui, ANTES do _origGo.
(function decorateGoWithMonitoring() {
  const _origGo = window.go;
  window.go = function(id, el) {
    // Recarrega dados de monitoramento ao entrar nesses painéis
    if(id === 'monitor-concorrentes' || id === 'monitor-crescimento') {
      loadMonitoringData();
    }
    if(_origGo) _origGo(id, el);
  };
})();


// ══════════════════════════════════════
// META ADS · GUIA — navegação de tabs + checklist
// ══════════════════════════════════════

const MA_CHECK_KEY = 'border-metaads-checklist';

const MA_CHECKS = {
  criativos: [
    'Resolução: todas as imagens em 1080px de largura mínimo? (Ideal: 1080×1350, 1080×1920, 1080×1080)',
    'Peso: cada arquivo abaixo de 4 MB?',
    'Proporção: criativos em 4:5 (vertical) para feed? (Melhor conversão para Border)',
    'Marca visível: logo Border clara? (Canto ou centro, mas VISÍVEL)',
    'CTA claro: "Comprar", "Ver Coleção", "Descobrir" está legível?',
    'Contraste: texto legível em qualquer fundo? (Teste thumb rule: veja de longe)',
    'Identidade visual: segue identidade Border? (Preto, branco, vermelho, amarelo)',
  ],
  copy: [
    'Headline: máx 40 caracteres com gancho/provocação?',
    'Descrição: máx 125 caracteres? (Ou deixar vazio e usar só headline)',
    'Voz: segue tom casual & relaxado da Border? (Não genérico, não corporate)',
    'Sem claims: não tem "ganhe rápido", "aproveite enquanto tiver", "últimas peças"? (Meta rejeita)',
    'Links alinhados: texto do anúncio bate com a landing page?',
  ],
  config: [
    'Público: selecionado conforme persona? (Marina, Camila ou Caio)',
    'Placement: definido ou automático? (Automático só com budget alto)',
    'Budget: alocado por persona ou equalizado?',
    'Duração: teste mínimo 3–5 dias antes de escalar',
    'Pixel: Pixel da Border instalado corretamente no site?',
  ],
};

function maGetChecks() {
  try { return JSON.parse(localStorage.getItem(MA_CHECK_KEY) || '{}'); } catch(e) { return {}; }
}
function maSaveChecks(state) {
  localStorage.setItem(MA_CHECK_KEY, JSON.stringify(state));
}

function maRenderChecks() {
  const state = maGetChecks();
  ['criativos','copy','config'].forEach(group => {
    const el = document.getElementById('ma-checks-' + group);
    if (!el) return;
    el.innerHTML = MA_CHECKS[group].map((text, i) => {
      const key = group + '_' + i;
      const checked = !!state[key];
      return `<div style="display:flex;align-items:flex-start;gap:12px;padding:12px 0;border-bottom:1px solid var(--border);cursor:pointer" onclick="maToggleCheck('${key}')">
        <div style="width:18px;height:18px;border:2px solid ${checked?'var(--text)':'var(--border2)'};background:${checked?'var(--text)':'transparent'};flex-shrink:0;display:flex;align-items:center;justify-content:center;margin-top:2px">
          ${checked?'<svg width="10" height="8" viewBox="0 0 10 8" fill="none"><path d="M1 4L4 7L9 1" stroke="var(--bg)" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>':''}
        </div>
        <div style="font-size:14px;color:var(--${checked?'dim':'text'});line-height:1.6;${checked?'text-decoration:line-through':''}">${text}</div>
      </div>`;
    }).join('');
  });
}

function maToggleCheck(key) {
  const state = maGetChecks();
  state[key] = !state[key];
  maSaveChecks(state);
  maRenderChecks();
}

function maCheckReset() {
  if (!confirm('Limpar todos os itens do checklist?')) return;
  maSaveChecks({});
  maRenderChecks();
}

function maTab(tab) {
  ['segmentacao','formatos','checklist','dicas'].forEach(t => {
    const el = document.getElementById('ma-' + t);
    if (el) el.style.display = t === tab ? 'block' : 'none';
    const btn = document.getElementById('ma-btn-' + t);
    if (btn) {
      btn.classList.toggle('btn-primary', t === tab);
      if (t !== tab) btn.classList.remove('btn-primary');
    }
  });
  if (tab === 'checklist') maRenderChecks();
}

// Inicializa quando o panel é aberto
const _maOrigGo = window.go;
window.go = function(id, el) {
  if (id === 'metaads') {
    maTab('segmentacao');
  }
  if (id === 'home') {
    initHome();
  }
  if (_maOrigGo) _maOrigGo(id, el);
};

// ══════════════════════════════════════
// HOME — DASHBOARD INICIAL
// ══════════════════════════════════════

// Navega da home para outro painel, ativando o item de nav correto
function homeGo(id) {
  const navBtn = document.querySelector('.nav-item[onclick*="go(\'' + id + '\'"]');
  go(id, navBtn || null);
}

function initHome() {
  // Saudação dinâmica
  const greetEl = document.getElementById('home-greeting');
  const subEl   = document.getElementById('home-date-sub');
  if (greetEl) {
    const h = new Date().getHours();
    const greet = h < 12 ? 'Bom dia, Helena.' : h < 18 ? 'Boa tarde, Helena.' : 'Boa noite, Helena.';
    greetEl.textContent = greet;
  }
  if (subEl) {
    const now = new Date();
    const opts = { weekday:'long', day:'2-digit', month:'long', year:'numeric' };
    subEl.textContent = now.toLocaleDateString('pt-BR', opts).replace(/^\w/, c => c.toUpperCase());
  }

  // Atualizações recentes: lê timestamps dos painéis + data do data.json
  homeRenderUpdates();

  // Oportunidades da semana: vem do data.json (swot_auto.oportunidades)
  homeRenderOportunidades();
}

function homeRenderUpdates() {
  const el = document.getElementById('home-updates-list');
  if (!el) return;

  // Painéis com timestamp salvo
  const ups = JSON.parse(localStorage.getItem('bi_panel_updates') || '{}');
  const labels = {
    'tendencias':           'Tendências da temporada',
    'swot':                 'SWOT semanal',
    'planejador':           'Pauta editorial',
    'monitor-concorrentes': 'Monitoramento · Concorrentes',
    'monitor-crescimento':  'Monitoramento · Crescimento',
    'influencers':          'Discovery · Influencers',
  };

  // Entradas fixas de data.json
  const staticUpdates = [];
  if (window._boardData) {
    const d = window._boardData;
    if (d.tendencias_auto && d.tendencias_auto.gerado_em)
      staticUpdates.push({ title: 'Tendências atualizadas pela IA', meta: d.tendencias_auto.gerado_em });
    if (d.swot_auto && d.swot_auto.gerado_em)
      staticUpdates.push({ title: 'SWOT semanal gerado', meta: d.swot_auto.gerado_em });
    if (d.pauta_auto && d.pauta_auto.gerado_em)
      staticUpdates.push({ title: 'Pauta editorial gerada', meta: d.pauta_auto.gerado_em });
    if (d.monitoramento && d.monitoramento.crescimento && d.monitoramento.crescimento.date)
      staticUpdates.push({ title: 'Dados de crescimento atualizados', meta: d.monitoramento.crescimento.date });
    if (d.monitoramento && d.monitoramento.concorrentes && d.monitoramento.concorrentes.date)
      staticUpdates.push({ title: 'Monitoramento de concorrentes', meta: d.monitoramento.concorrentes.date });
  }

  // Combina com timestamps do localStorage
  const dynamic = Object.entries(ups)
    .filter(([k]) => labels[k])
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([k, ts]) => ({ title: labels[k], meta: fmtTs(ts) }));

  // Prioriza dinâmicos, completa com estáticos
  const all = [...dynamic];
  for (const s of staticUpdates) {
    if (all.length >= 5) break;
    if (!all.find(x => x.title === s.title)) all.push(s);
  }

  if (all.length === 0) {
    el.innerHTML = `<div class="home-update-item"><div class="home-update-body"><div class="home-update-title" style="color:var(--dim)">Nenhuma atualização ainda.</div><div class="home-update-meta">Use os painéis para gerar análises com IA.</div></div></div>`;
    return;
  }

  el.innerHTML = all.map(item => `
    <div class="home-update-item">
      <div class="home-update-dot"></div>
      <div class="home-update-body">
        <div class="home-update-title">${item.title}</div>
        <div class="home-update-meta">${item.meta}</div>
      </div>
    </div>
  `).join('');
}

function homeRenderOportunidades() {
  const el = document.getElementById('home-oportunidades');
  if (!el) return;

  if (!window._boardData || !window._boardData.swot_auto || !window._boardData.swot_auto.oportunidades) {
    el.innerHTML = `<div class="home-oport-item"><div class="home-oport-text" style="color:var(--dim)">Nenhuma oportunidade carregada. Gere o SWOT semanal para ver os dados aqui.</div></div>`;
    return;
  }

  const ops = window._boardData.swot_auto.oportunidades;
  el.innerHTML = ops.map((op, i) => `
    <div class="home-oport-item">
      <div class="home-oport-num">Oportunidade ${i + 1}</div>
      <div class="home-oport-text">${op}</div>
    </div>
  `).join('');
}

// ══════════════════════════════════════════════════════════════════════
// MAPAS INTERATIVOS — canvas 2D com tooltip e click→card
// ══════════════════════════════════════════════════════════════════════
// Dois mapas: posicionamento (eixos street/alfaiataria × nicho/mainstream)
// e valor (ticket médio × audiência com bolhas por rigor construtivo).
//
// Interações:
//   hover  → tooltip flutuante com dados completos da marca
//   click  → rola até o card da marca na página (âncora por id)
//   filtro → botões que desvanecem marcas fora da categoria selecionada
//
// Para atualizar dados de uma marca, edite apenas o array COMP_BRANDS abaixo.
// Campo "cenario": 'atual' = Border como marca de camisetas (mercado real hoje)
//                  'futuro' = Border como street alfaiataria (horizonte estratégico)
//                  'ambos' = aparece nos dois mapas
// ══════════════════════════════════════════════════════════════════════

const COMP_BRANDS = [
  // ── BORDER (âncora — aparece nos dois cenários com posição diferente) ──
  {
    id: 'border',
    name: 'Border',
    cardId: null,
    // cenário atual: camisetas street nicho
    posX: 0.38, posY: 0.38,
    // cenário futuro: street alfaiataria nicho
    posX_futuro: 0.44, posY_futuro: 0.29,
    ticket: 220, audience: 246, rigor: 0.95,
    color: '#4285F4',
    colorDim: 'rgba(66,133,244,0.20)',
    bold: true,
    tag: 'border',
    cenario: 'ambos',
    tooltip: ['Border', 'street · camisetaria · queer masc', 'Ticket ~R$220 · ~246 seg.', 'Hoje: camisetas | Futuro: street alfaiataria']
  },

  // ══════════════════════════════════════════
  // CENÁRIO ATUAL — Border como marca de camisetas
  // Eixo horizontal: casual/básico → premium/conceitual
  // Eixo vertical: nicho → mainstream
  // ══════════════════════════════════════════
  {
    id: 'bolovo',
    name: 'Bolovo',
    cardId: 'comp-bolovo',
    posX: 0.62, posY: 0.72,
    ticket: 230, audience: 214000, rigor: 0.30,
    color: '#999999',
    colorDim: 'rgba(153,153,153,0.2)',
    bold: false,
    tag: 'direto',
    cenario: 'atual',
    tooltip: ['Bolovo', 'streetwear · mainstream · 214K', 'Ticket ~R$230 · camisetas/drops', '⚠ Concorrente direto de camisetaria']
  },
  {
    id: 'class-official',
    name: 'Class Official',
    cardId: 'comp-classofficial',
    posX: 0.72, posY: 0.78,
    ticket: 200, audience: 170000, rigor: 0.28,
    color: '#999999',
    colorDim: 'rgba(153,153,153,0.2)',
    bold: false,
    tag: 'direto',
    cenario: 'atual',
    tooltip: ['Class Official', 'streetwear · mainstream · 170K', 'Ticket ~R$200 · camisetas/estampas', '⚠ Concorrente direto de camisetaria']
  },
  {
    id: 'midas-touch',
    name: 'Midas Touch',
    cardId: 'comp-midastouch',
    posX: 0.55, posY: 0.62,
    ticket: 180, audience: 50000, rigor: 0.35,
    color: '#c8a030',
    colorDim: 'rgba(200,160,48,0.25)',
    bold: false,
    tag: 'direto',
    cenario: 'atual',
    tooltip: ['Midas Touch', 'streetwear · RJ · 2018 · ~50K', 'Ticket ~R$180 · gramatura pesada, oversized', '⚠ Concorrente direto — mesmo produto']
  },
  {
    id: 'dust-co',
    name: 'Dust Co.',
    cardId: 'comp-dustcompany',
    posX: 0.68, posY: 0.50,
    ticket: 280, audience: 154000, rigor: 0.55,
    color: '#e07030',
    colorDim: 'rgba(224,112,48,0.25)',
    bold: true,
    tag: 'ameaca',
    cenario: 'atual',
    tooltip: ['The Dust Company', 'street premium · 154K', 'Ticket ~R$280 · omnichannel robusto', '⚠ Concorrente de produto + modelagem próxima']
  },
  {
    id: 'welcome-sunny',
    name: 'Welcome Sunny',
    cardId: 'comp-welcomesunny',
    posX: 0.50, posY: 0.55,
    ticket: 280, audience: 120000, rigor: 0.55,
    color: '#aaaaaa',
    colorDim: 'rgba(170,170,170,0.2)',
    bold: false,
    tag: 'ameaca',
    cenario: 'atual',
    tooltip: ['Welcome Sunny', 'street nicho · fluido · 120K', 'Ticket ~R$280 · collab Hering 2025', 'Valida o nicho no mercado BR']
  },
  {
    id: 'pace',
    name: 'Pace',
    cardId: 'comp-pace',
    posX: 0.48, posY: 0.45,
    ticket: 260, audience: 42000, rigor: 0.62,
    color: '#60a878',
    colorDim: 'rgba(96,168,120,0.2)',
    bold: false,
    tag: 'monitorar',
    cenario: 'atual',
    tooltip: ['Pace', 'streetwear independente · BR · ~42K', 'Ticket ~R$260 · modelagem ampla', 'Monitorar — público street jovem sobreposto']
  },

  // ══════════════════════════════════════════
  // CENÁRIO FUTURO — Border como street alfaiataria
  // Eixo horizontal: street casual → alfaiataria
  // Eixo vertical: nicho → mainstream
  // ══════════════════════════════════════════
  {
    id: 'hist',
    name: 'HIST',
    cardId: null,
    posX: 0.52, posY: 0.36,
    ticket: 280, audience: 15000, rigor: 0.78,
    color: '#c0a880',
    colorDim: 'rgba(192,168,128,0.25)',
    bold: true,
    tag: 'ameaca',
    cenario: 'futuro',
    tooltip: ['HIST', 'How I See Things · SP · 2021', 'Ticket ~R$280 · ~15K seg.', 'Loja física: Pinheiros (H550)', '⚠ Maior ameaça no território futuro']
  },
  {
    id: 'desgosto',
    name: 'Desgosto',
    cardId: 'comp-desgosto',
    posX: 0.50, posY: 0.33,
    ticket: 240, audience: 28000, rigor: 0.72,
    color: '#8870c0',
    colorDim: 'rgba(136,112,192,0.25)',
    bold: false,
    tag: 'ameaca',
    cenario: 'futuro',
    tooltip: ['Desgosto', 'street nicho angular · SP · ~28K', 'Ticket ~R$240 · estética queer próxima', '⚠ Ameaça de identidade no futuro']
  },
  {
    id: 'piet',
    name: 'Piet',
    cardId: 'comp-piet',
    posX: 0.62, posY: 0.40,
    ticket: 320, audience: 85000, rigor: 0.70,
    color: '#5090d0',
    colorDim: 'rgba(80,144,208,0.2)',
    bold: false,
    tag: 'monitorar',
    cenario: 'futuro',
    tooltip: ['Piet', 'streetwear conceitual · SP · ~85K', 'Ticket ~R$320 · alfaiataria + street', 'Monitorar — sem recorte de gênero explícito']
  },
  {
    id: 'back-to-eden',
    name: 'Back to Eden',
    cardId: 'comp-backtoedem',
    posX: 0.37, posY: 0.18,
    ticket: 900, audience: 22000, rigor: 0.92,
    color: '#888888',
    colorDim: 'rgba(136,136,136,0.2)',
    bold: false,
    dashed: true,
    tag: 'monitorar',
    cenario: 'futuro',
    tooltip: ['Back to Eden', 'alfaiataria · nicho · ~22K', 'Ticket ~R$900 · rebranding em curso', 'Monitorar — alta alfaiataria, ticket distante']
  },
  {
    id: 'welcome-sunny-f',
    name: 'Welcome Sunny',
    cardId: 'comp-welcomesunny',
    posX: 0.46, posY: 0.52,
    ticket: 280, audience: 120000, rigor: 0.55,
    color: '#aaaaaa',
    colorDim: 'rgba(170,170,170,0.2)',
    bold: false,
    tag: 'monitorar',
    cenario: 'futuro',
    tooltip: ['Welcome Sunny', 'street · nicho/fluido · 120K', 'Valida a categoria no BR', 'Monitorar — pode pivotar para alfaiataria']
  },
  {
    id: 'dust-co-f',
    name: 'Dust Co.',
    cardId: 'comp-dustcompany',
    posX: 0.72, posY: 0.50,
    ticket: 280, audience: 154000, rigor: 0.55,
    color: '#e07030',
    colorDim: 'rgba(224,112,48,0.25)',
    bold: false,
    tag: 'monitorar',
    cenario: 'futuro',
    tooltip: ['The Dust Company', 'street premium · 154K', 'Ticket ~R$280 · sem recorte alfaiataria', 'Monitorar — se pivotar, entra no território']
  }
];

let _posFilter = 'all';
let _posCenario = 'atual'; // 'atual' | 'futuro'

function posFilterClick(btn, filter) {
  _posFilter = filter;
  document.querySelectorAll('.pos-filter-btn').forEach(b => b.classList.remove('btn-primary'));
  btn.classList.add('btn-primary');
  drawPosMap();
}

function posCenarioClick(btn, cenario) {
  _posCenario = cenario;
  document.querySelectorAll('.pos-cenario-btn').forEach(b => {
    b.style.background = 'none';
    b.style.color = 'var(--dim)';
    b.style.borderColor = 'var(--border)';
  });
  btn.style.background = cenario === 'atual' ? 'var(--accent)' : 'rgba(200,160,48,0.15)';
  btn.style.color = cenario === 'atual' ? '#fff' : '#c8a030';
  btn.style.borderColor = cenario === 'atual' ? 'var(--accent)' : '#c8a030';
  // descrições de cenário
  const dAtual = document.getElementById('cenario-desc-atual');
  const dFuturo = document.getElementById('cenario-desc-futuro');
  if (dAtual) dAtual.style.display = cenario === 'atual' ? 'block' : 'none';
  if (dFuturo) dFuturo.style.display = cenario === 'futuro' ? 'block' : 'none';
  // título do mapa
  const titleEl = document.getElementById('pos-map-title-label');
  if (titleEl) titleEl.textContent = cenario === 'atual'
    ? 'Mapa de posicionamento · visão atual · casual/premium × nicho/mainstream'
    : 'Mapa de posicionamento · visão futura · street/alfaiataria × nicho/mainstream';
  // reset filtro de tag ao trocar cenário
  _posFilter = 'all';
  document.querySelectorAll('.pos-filter-btn').forEach(b => b.classList.remove('btn-primary'));
  const allBtn = document.querySelector('.pos-filter-btn[data-filter="all"]');
  if (allBtn) allBtn.classList.add('btn-primary');
  // atualizar labels dos filtros conforme cenário
  _updateFilterLabels();
  drawPosMap();
  _updateMapReading();
}

function _updateFilterLabels() {
  const labelsAtual = { direto: 'Concorrente direto', ameaca: 'Ameaça direta', mainstream: 'Mainstream', monitorar: 'Monitorar' };
  const labelsFuturo = { direto: 'Direto', ameaca: 'Ameaça identidade', mainstream: 'Mainstream', monitorar: 'Monitorar' };
  const labels = _posCenario === 'atual' ? labelsAtual : labelsFuturo;
  document.querySelectorAll('.pos-filter-btn[data-filter]').forEach(b => {
    const f = b.getAttribute('data-filter');
    if (f && f !== 'all' && labels[f]) b.textContent = labels[f];
  });
}

function _updateMapReading() {
  const elAtual = document.getElementById('map-reading-atual');
  const elFuturo = document.getElementById('map-reading-futuro');
  if (elAtual) elAtual.style.display = _posCenario === 'atual' ? 'block' : 'none';
  if (elFuturo) elFuturo.style.display = _posCenario === 'futuro' ? 'block' : 'none';
}

// ── MAPA DE POSICIONAMENTO ───────────────────────────────────────────
function initPosMap() {
  const canvas = document.getElementById('canvas-pos');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth;
  const H = Math.round(W * 0.52);
  canvas.width = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width = W + 'px';
  canvas.style.height = H + 'px';
  canvas._dpr = dpr;
  canvas._W = W;
  canvas._H = H;
  drawPosMap();
  canvas.addEventListener('mousemove', onPosMouseMove);
  canvas.addEventListener('mouseleave', onPosMouseLeave);
  canvas.addEventListener('click', onPosClick);
}

function drawPosMap(hoverId) {
  // ── Estilo GA: fundo branco, quadrantes com tint sutil, eixos escuros, pontos coloridos
  const canvas = document.getElementById('canvas-pos');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = canvas._dpr || 1;
  const W = canvas._W, H = canvas._H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const PAD = { top: 40, right: 24, bottom: 40, left: 24 };
  const plotW = W - PAD.left - PAD.right;
  const plotH = H - PAD.top - PAD.bottom;
  const cx = PAD.left + plotW / 2;
  const cy = PAD.top + plotH / 2;

  // Fundo branco
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);

  // Quadrantes com tints diferentes — estilo dashboard analytics
  const quadDefs = [
    { x: PAD.left, y: PAD.top,  w: plotW/2, h: plotH/2, fill: 'rgba(66,133,244,0.04)'  }, // nicho alto
    { x: cx,       y: PAD.top,  w: plotW/2, h: plotH/2, fill: 'rgba(234,67,53,0.04)'   }, // mainstream alto
    { x: PAD.left, y: cy,       w: plotW/2, h: plotH/2, fill: 'rgba(52,168,83,0.04)'   }, // nicho baixo
    { x: cx,       y: cy,       w: plotW/2, h: plotH/2, fill: 'rgba(251,188,5,0.04)'   }, // mainstream baixo
  ];
  quadDefs.forEach(q => { ctx.fillStyle = q.fill; ctx.fillRect(q.x, q.y, q.w, q.h); });

  // Labels dos quadrantes — dinâmicos por cenário
  ctx.font = '600 11px Helvetica Neue, sans-serif';
  ctx.fillStyle = '#BDBDBD';
  ctx.textAlign = 'center';
  const isAtual = _posCenario === 'atual';
  if (isAtual) {
    [[cx - plotW/4, PAD.top + 18, 'PREMIUM · NICHO'],
     [cx + plotW/4, PAD.top + 18, 'PREMIUM · MAINSTREAM'],
     [cx - plotW/4, cy + plotH/2 - 10, 'CASUAL · NICHO'],
     [cx + plotW/4, cy + plotH/2 - 10, 'CASUAL · MAINSTREAM']
    ].forEach(([x,y,t]) => ctx.fillText(t, x, y));
  } else {
    [[cx - plotW/4, PAD.top + 18, 'ALFAIATARIA · NICHO'],
     [cx + plotW/4, PAD.top + 18, 'ALFAIATARIA · MAINSTREAM'],
     [cx - plotW/4, cy + plotH/2 - 10, 'STREET · NICHO'],
     [cx + plotW/4, cy + plotH/2 - 10, 'STREET · MAINSTREAM']
    ].forEach(([x,y,t]) => ctx.fillText(t, x, y));
  }

  // Eixos
  ctx.strokeStyle = '#DADCE0'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(cx, PAD.top); ctx.lineTo(cx, PAD.top + plotH); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(PAD.left, cy); ctx.lineTo(PAD.left + plotW, cy); ctx.stroke();

  // Labels dos eixos — dinâmicos por cenário
  ctx.font = '700 11px Helvetica Neue, sans-serif';
  ctx.fillStyle = '#5F6368';
  if (isAtual) {
    ctx.textAlign = 'center'; ctx.fillText('PREMIUM / CONCEITUAL', cx, PAD.top - 12);
    ctx.fillText('CASUAL / BÁSICO', cx, PAD.top + plotH + 26);
  } else {
    ctx.textAlign = 'center'; ctx.fillText('ALFAIATARIA', cx, PAD.top - 12);
    ctx.fillText('STREET', cx, PAD.top + plotH + 26);
  }
  ctx.textAlign = 'start'; ctx.fillText('NICHO', PAD.left + 6, cy - 8);
  ctx.textAlign = 'end'; ctx.fillText('MAINSTREAM', PAD.left + plotW - 6, cy - 8);

  // Território Border — posição e label dinâmicos por cenário
  ctx.save();
  ctx.strokeStyle = 'rgba(66,133,244,0.5)'; ctx.setLineDash([5,3]); ctx.lineWidth = 1.5;
  const bx = isAtual ? PAD.left + plotW * 0.28 : PAD.left + plotW * 0.37;
  const by = isAtual ? PAD.top + plotH * 0.28 : PAD.top + plotH * 0.18;
  const bw = plotW * 0.18, bh = plotH * 0.22;
  ctx.strokeRect(bx, by, bw, bh);
  ctx.setLineDash([]);
  ctx.fillStyle = 'rgba(66,133,244,0.06)'; ctx.fillRect(bx, by, bw, bh);
  ctx.font = '600 11px Helvetica Neue,sans-serif';
  ctx.fillStyle = 'rgba(66,133,244,0.7)';
  ctx.textAlign = 'center';
  ctx.fillText(isAtual ? 'Border hoje' : 'Border futuro', bx + bw/2, by + bh - 6);
  ctx.restore();

  // Filtrar marcas pelo cenário ativo
  const visibleBrands = COMP_BRANDS.filter(b => {
    if (b.id === 'border') return true;
    return b.cenario === _posCenario || b.cenario === 'ambos';
  });

  visibleBrands.forEach(b => {
    // posição: Border usa posX_futuro no cenário futuro
    const px = (b.id === 'border' && !isAtual && b.posX_futuro != null) ? b.posX_futuro : b.posX;
    const py = (b.id === 'border' && !isAtual && b.posY_futuro != null) ? b.posY_futuro : b.posY;
    const x = PAD.left + plotW * px;
    const y = PAD.top + plotH * py;
    const r = b.bold ? 9 : 6;
    const isHover = b.id === hoverId;
    const filtered = _posFilter !== 'all' && b.tag !== _posFilter && b.id !== 'border';
    ctx.save();
    ctx.globalAlpha = filtered ? 0.12 : 1;
    if (isHover) {
      ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2);
      ctx.fillStyle = b.color + '22'; ctx.fill();
    }
    if (b.dashed) {
      ctx.setLineDash([3,3]); ctx.strokeStyle = b.color; ctx.lineWidth = 1.5;
      ctx.beginPath(); ctx.arc(x, y, r + 4, 0, Math.PI * 2); ctx.stroke();
      ctx.setLineDash([]);
    }
    // Círculo com borda branca para separar do fundo
    ctx.beginPath(); ctx.arc(x, y, r + 1, 0, Math.PI * 2);
    ctx.fillStyle = '#fff'; ctx.fill();
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.fill();
    // Label
    ctx.font = b.bold ? '700 12px Helvetica Neue,sans-serif' : '500 12px Helvetica Neue,sans-serif';
    ctx.fillStyle = isHover ? b.color : '#3C4043';
    ctx.textAlign = 'start';
    ctx.fillText(b.name, x + r + 6, y + 4);
    ctx.restore();
  });
}

function _getPosHit(e) {
  const canvas = document.getElementById('canvas-pos');
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const W = canvas._W, H = canvas._H;
  const PAD = { top: 40, right: 24, bottom: 40, left: 24 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const isAtual = _posCenario === 'atual';
  const visible = COMP_BRANDS.filter(b => b.id === 'border' || b.cenario === _posCenario || b.cenario === 'ambos');
  return visible.find(b => {
    const px = (b.id === 'border' && !isAtual && b.posX_futuro != null) ? b.posX_futuro : b.posX;
    const py = (b.id === 'border' && !isAtual && b.posY_futuro != null) ? b.posY_futuro : b.posY;
    const bx = PAD.left + plotW * px, by = PAD.top + plotH * py;
    return Math.hypot(mx - bx, my - by) <= (b.bold ? 9 : 6) + 10;
  });
}

function onPosMouseMove(e) {
  const b = _getPosHit(e);
  const tip = document.getElementById('tooltip-pos');
  const canvas = document.getElementById('canvas-pos');
  if (b) {
    canvas.style.cursor = b.cardId ? 'pointer' : 'default';
    drawPosMap(b.id);
    tip.innerHTML = b.tooltip.map((t,i) => i===0
      ? `<strong style="font-size:14px;color:#fff;display:block;margin-bottom:4px">${t}</strong>`
      : `<span style="color:${t.startsWith('⚠')?'#e6a020':'#aaa'}">${t}</span>`
    ).join('<br>');
    const vw = window.innerWidth, tipW = 240;
    const left = e.clientX + 16 + tipW > vw ? e.clientX - tipW - 8 : e.clientX + 16;
    tip.style.left = left + 'px'; tip.style.top = (e.clientY - 10) + 'px';
    tip.style.display = 'block';
  } else {
    canvas.style.cursor = 'crosshair'; drawPosMap();
    tip.style.display = 'none';
  }
}
function onPosMouseLeave() { drawPosMap(); document.getElementById('tooltip-pos').style.display = 'none'; }
function onPosClick(e) {
  const b = _getPosHit(e);
  if (!b || !b.cardId) return;
  const el = document.getElementById(b.cardId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.style.outline = '2px solid ' + b.color;
    setTimeout(() => { el.style.outline = ''; }, 1800);
  }
}

// ── MAPA DE VALOR ────────────────────────────────────────────────────
function initValMap() {
  const canvas = document.getElementById('canvas-val');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth;
  const H = Math.round(W * 0.50);
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  canvas._dpr = dpr; canvas._W = W; canvas._H = H;
  drawValMap();
  canvas.addEventListener('mousemove', onValMouseMove);
  canvas.addEventListener('mouseleave', onValMouseLeave);
  canvas.addEventListener('click', onValClick);
}

function drawValMap(hoverId) {
  const canvas = document.getElementById('canvas-val');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const dpr = canvas._dpr || 1, W = canvas._W, H = canvas._H;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  const PAD = { top: 28, right: 20, bottom: 48, left: 72 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const audMax = 250000, tickMax = 1300, tickMin = 100;
  function xScale(aud) {
    const lv = Math.log10(Math.max(aud,100)), lmin = Math.log10(100), lmax = Math.log10(audMax);
    return PAD.left + plotW * ((lv - lmin) / (lmax - lmin));
  }
  function yScale(t) { return PAD.top + plotH * (1 - (t - tickMin) / (tickMax - tickMin)); }
  function rScale(r) { return 6 + r * 16; }

  // GA style — white background, plot area light gray
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, W, H);
  ctx.fillStyle = '#F8F9FA';
  ctx.fillRect(PAD.left, PAD.top, plotW, plotH);

  // Horizontal grid lines + Y labels
  [150, 300, 500, 800, 1200].forEach(t => {
    const y = yScale(t);
    ctx.strokeStyle = '#DADCE0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(PAD.left, y); ctx.lineTo(PAD.left + plotW, y); ctx.stroke();
    ctx.font = '12px Helvetica Neue,sans-serif'; ctx.fillStyle = '#5F6368';
    ctx.textAlign = 'end'; ctx.fillText('R$ ' + t, PAD.left - 8, y + 4);
  });

  // Vertical grid lines + X labels
  [{v:200,l:'~200'},{v:5000,l:'5K'},{v:20000,l:'20K'},{v:50000,l:'50K'},{v:120000,l:'120K'},{v:200000,l:'200K+'}].forEach(({v,l}) => {
    const x = xScale(v);
    ctx.strokeStyle = '#DADCE0'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, PAD.top + plotH); ctx.stroke();
    ctx.font = '12px Helvetica Neue,sans-serif'; ctx.fillStyle = '#5F6368';
    ctx.textAlign = 'center'; ctx.fillText(l, x, PAD.top + plotH + 18);
  });

  // Plot area border
  ctx.strokeStyle = '#BDBDBD'; ctx.lineWidth = 1.5;
  ctx.strokeRect(PAD.left, PAD.top, plotW, plotH);

  // Axis labels
  ctx.font = '600 12px Helvetica Neue,sans-serif'; ctx.fillStyle = '#5F6368';
  ctx.textAlign = 'center';
  ctx.fillText('AUDIÊNCIA (seguidores)', PAD.left + plotW / 2, H - 6);
  ctx.save(); ctx.translate(16, PAD.top + plotH / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText('TICKET MÉDIO (R$)', 0, 0); ctx.restore();

  // Zona de crescimento Border — blue GA accent
  const zx1 = xScale(100), zx2 = xScale(5000), zy1 = yScale(400), zy2 = yScale(150);
  ctx.save();
  ctx.fillStyle = 'rgba(66,133,244,0.07)'; ctx.strokeStyle = 'rgba(66,133,244,0.40)';
  ctx.setLineDash([4, 3]); ctx.lineWidth = 1.5;
  ctx.fillRect(zx1, zy1, zx2-zx1, zy2-zy1); ctx.strokeRect(zx1, zy1, zx2-zx1, zy2-zy1);
  ctx.setLineDash([]);
  ctx.font = '600 12px Helvetica Neue,sans-serif'; ctx.fillStyle = 'rgba(66,133,244,0.85)';
  ctx.textAlign = 'center'; ctx.fillText('zona de crescimento Border', zx1+(zx2-zx1)/2, zy2-8);
  ctx.restore();

  // Legend
  ctx.font = '500 12px Helvetica Neue,sans-serif'; ctx.fillStyle = '#5F6368'; ctx.textAlign = 'start';
  ctx.fillText('● tamanho = rigor construtivo percebido', PAD.left + 8, PAD.top + 16);

  // Brand dots — label positioning adaptativo para evitar sobreposição
  // excluir aliases de cenário futuro (welcome-sunny-f, dust-co-f) para não duplicar
  const _brandsUniq = COMP_BRANDS.filter(b => !b.id.endsWith('-f') || b.id === 'border');
  const sorted = [..._brandsUniq].sort((a,b) => a.rigor - b.rigor);
  // Pre-calcula posições para detectar sobreposição
  const positions = sorted.map(b => ({
    b, x: xScale(b.audience), y: yScale(b.ticket), r: rScale(b.rigor)
  }));
  // Placeholders para offset de labels — evitar colisão simples
  const labelOffsets = positions.map((p, i) => {
    // Tenta colocar label à direita; se próximo da borda direita, vai à esquerda
    const labelRight = p.x + p.r + 6 + 80 < W - PAD.right;
    return labelRight ? 'right' : 'left';
  });

  positions.forEach(({ b, x, y, r }, i) => {
    const isHover = b.id === hoverId;
    ctx.save();
    if (isHover) {
      ctx.beginPath(); ctx.arc(x, y, r + 10, 0, Math.PI * 2);
      ctx.fillStyle = b.colorDim || 'rgba(66,133,244,0.1)'; ctx.fill();
    }
    // Anel branco para separar bolhas sobrepostas
    ctx.beginPath(); ctx.arc(x, y, r + 2.5, 0, Math.PI * 2);
    ctx.fillStyle = '#FFFFFF'; ctx.fill();
    // Bolha
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.globalAlpha = 0.88; ctx.fill();
    ctx.globalAlpha = 1;
    // Borda para dar separação visual
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1.5; ctx.stroke();

    // Label — posição adaptativa
    const side = labelOffsets[i];
    const lx = side === 'right' ? x + r + 7 : x - r - 7;
    const align = side === 'right' ? 'start' : 'end';
    ctx.font = b.bold ? '700 12px Helvetica Neue,sans-serif' : '600 12px Helvetica Neue,sans-serif';
    ctx.fillStyle = isHover ? b.color : '#222';
    ctx.textAlign = align;
    // Fundo branco atrás do label para legibilidade sobre bolhas próximas
    const labelText = b.name;
    const lw = ctx.measureText(labelText).width;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const bgX = align === 'start' ? lx - 2 : lx - lw - 2;
    ctx.fillRect(bgX, y - 15, lw + 4, 14);
    ctx.fillStyle = isHover ? b.color : '#1a1a1a';
    ctx.fillText(labelText, lx, y - 4);

    // Ticket sub-label
    ctx.font = '500 11px Helvetica Neue,sans-serif';
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    const subText = 'R$' + b.ticket;
    const sw = ctx.measureText(subText).width;
    const sbX = align === 'start' ? lx - 2 : lx - sw - 2;
    ctx.fillRect(sbX, y, sw + 4, 12);
    ctx.fillStyle = '#555';
    ctx.fillText(subText, lx, y + 10);

    ctx.restore();
  });
}

function _getValHit(e) {
  const canvas = document.getElementById('canvas-val');
  const rect = canvas.getBoundingClientRect();
  const mx = e.clientX - rect.left, my = e.clientY - rect.top;
  const W = canvas._W, H = canvas._H;
  const PAD = { top: 28, right: 20, bottom: 48, left: 72 };
  const plotW = W - PAD.left - PAD.right, plotH = H - PAD.top - PAD.bottom;
  const audMax = 250000, tickMax = 1300, tickMin = 100;
  function xScale(aud) {
    const lv = Math.log10(Math.max(aud,100)), lmin = Math.log10(100), lmax = Math.log10(audMax);
    return PAD.left + plotW * ((lv - lmin) / (lmax - lmin));
  }
  function yScale(t) { return PAD.top + plotH * (1 - (t - tickMin) / (tickMax - tickMin)); }
  function rScale(r) { return 6 + r * 16; }
  return COMP_BRANDS.find(b => Math.hypot(mx - xScale(b.audience), my - yScale(b.ticket)) <= rScale(b.rigor) + 8);
}

function onValMouseMove(e) {
  const b = _getValHit(e);
  const tip = document.getElementById('tooltip-val');
  const canvas = document.getElementById('canvas-val');
  if (b) {
    canvas.style.cursor = b.cardId ? 'pointer' : 'default';
    drawValMap(b.id);
    tip.innerHTML = b.tooltip.map((t,i) => i===0
      ? `<strong style="font-size:14px;color:#fff;display:block;margin-bottom:4px">${t}</strong>`
      : `<span style="color:${t.startsWith('⚠')?'#e6a020':'#aaa'}">${t}</span>`
    ).join('<br>');
    const vw = window.innerWidth, tipW = 240;
    const left = e.clientX + 16 + tipW > vw ? e.clientX - tipW - 8 : e.clientX + 16;
    tip.style.left = left + 'px'; tip.style.top = (e.clientY - 10) + 'px';
    tip.style.display = 'block';
  } else {
    canvas.style.cursor = 'crosshair'; drawValMap();
    tip.style.display = 'none';
  }
}
function onValMouseLeave() { drawValMap(); document.getElementById('tooltip-val').style.display = 'none'; }
function onValClick(e) {
  const b = _getValHit(e);
  if (!b || !b.cardId) return;
  const el = document.getElementById(b.cardId);
  if (el) {
    el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.style.outline = '2px solid ' + b.color;
    setTimeout(() => { el.style.outline = ''; }, 1800);
  }
}

// ── Resolve IDs reais dos cards no DOM ──────────────────────────────
function _resolveCompCardIds() {
  const map = {
    'welcome-sunny': ['comp-welcomesunny','comp-welcome-sunny'],
    'back-to-eden':  ['comp-backtoedem','comp-back-to-eden'],
    'bolovo':        ['comp-bolovo'],
    'class-official':['comp-classofficial','comp-class-official'],
    'dust-co':       ['comp-dustcompany','comp-dustco'],
    'hist':          ['comp-hist'],
    'desgosto':      ['comp-desgosto'],
    'piet':          ['comp-piet'],
    'pace':          ['comp-pace']
  };
  COMP_BRANDS.forEach(b => {
    if (!map[b.id]) return;
    const found = map[b.id].find(id => document.getElementById(id));
    if (found) b.cardId = found;
  });
}

// ══════════════════════════════════════════════════════════════════════
// GRÁFICOS COMPARATIVOS — Ticket Médio, Modelagem, Público
// ══════════════════════════════════════════════════════════════════════

// ── GRÁFICO 1: TICKET MÉDIO (barras horizontais) ─────────────────────
function drawTicketChart() {
  const canvas = document.getElementById('canvas-ticket');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth;
  const brands = COMP_BRANDS.filter(b => b.id !== 'border' && !b.id.endsWith('-f')).sort((a,b) => b.ticket - a.ticket);
  const border = COMP_BRANDS.find(b => b.id === 'border');
  const BAR_H = 36, GAP = 8;
  const PAD = { top: 32, right: 72, bottom: 16, left: 126 };
  const H = PAD.top + (brands.length + 1) * (BAR_H + GAP) + PAD.bottom;
  canvas.width = W * dpr; canvas.height = H * dpr;
  canvas.style.width = W + 'px'; canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  const maxTicket = Math.max(...brands.map(b => b.ticket), border.ticket) * 1.12;
  const plotW = W - PAD.left - PAD.right;
  function xScale(t) { return PAD.left + plotW * (t / maxTicket); }

  // Grid vertical sutil + labels de eixo
  [200, 400, 600, 800, 1000].filter(v => v <= maxTicket).forEach(v => {
    const x = xScale(v);
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, PAD.top - 12); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
    ctx.font = '11px Helvetica Neue,sans-serif'; ctx.fillStyle = '#999';
    ctx.textAlign = 'center'; ctx.fillText('R$' + v, x, PAD.top - 2);
  });

  // Linha de referência da Border
  const bx = xScale(border.ticket);
  ctx.strokeStyle = 'rgba(66,133,244,0.5)'; ctx.setLineDash([5,3]); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(bx, PAD.top - 12); ctx.lineTo(bx, H - PAD.bottom); ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = '700 11px Helvetica Neue,sans-serif'; ctx.fillStyle = '#4285F4';
  ctx.textAlign = 'center'; ctx.fillText('Border', bx, PAD.top - 16);

  // Barras dos concorrentes
  brands.forEach((b, i) => {
    const y = PAD.top + i * (BAR_H + GAP);
    const bw = xScale(b.ticket) - PAD.left;

    // Faixa zebra
    ctx.fillStyle = i % 2 === 0 ? 'rgba(0,0,0,0.02)' : 'transparent';
    ctx.fillRect(0, y - 2, W, BAR_H + 4);

    // Faixa de referência Border (tom bem sutil)
    ctx.fillStyle = 'rgba(66,133,244,0.06)';
    ctx.fillRect(PAD.left, y, xScale(border.ticket) - PAD.left, BAR_H);

    // Barra principal — cor cheia com boa opacidade
    const fillColor = b.id === 'dust-co' ? 'rgba(224,112,48,0.85)'
      : b.id === 'hist'    ? 'rgba(192,168,128,0.85)'
      : b.id === 'desgosto'? 'rgba(136,112,192,0.85)'
      : b.id === 'piet'    ? 'rgba(80,144,208,0.85)'
      : b.id === 'pace'    ? 'rgba(96,168,120,0.85)'
      : b.id === 'back-to-eden' ? 'rgba(136,136,136,0.85)'
      : 'rgba(160,160,160,0.60)';
    ctx.fillStyle = fillColor;
    ctx.fillRect(PAD.left, y, bw, BAR_H);

    // Nome da marca — à esquerda da barra
    ctx.font = `${b.bold ? '700' : '500'} 13px Helvetica Neue,sans-serif`;
    ctx.fillStyle = b.id === 'dust-co' ? '#c85000'
      : b.id === 'hist' ? '#7a6840'
      : b.id === 'desgosto' ? '#6050a0'
      : b.id === 'piet' ? '#2060a0'
      : b.id === 'pace' ? '#30784a'
      : '#3C4043';
    ctx.textAlign = 'end';
    ctx.fillText(b.name, PAD.left - 8, y + BAR_H / 2 + 5);

    // Valor — à direita da barra, fundo contraste
    const valX = xScale(b.ticket);
    ctx.font = '700 13px Helvetica Neue,sans-serif';
    ctx.fillStyle = '#202124'; ctx.textAlign = 'start';
    ctx.fillText('R$' + b.ticket, valX + 6, y + BAR_H / 2 + 5);
  });

  // Border — barra final destacada
  const y = PAD.top + brands.length * (BAR_H + GAP);
  ctx.fillStyle = 'rgba(66,133,244,0.90)';
  ctx.fillRect(PAD.left, y, xScale(border.ticket) - PAD.left, BAR_H);
  ctx.font = '700 13px Helvetica Neue,sans-serif'; ctx.fillStyle = '#1a5fc8';
  ctx.textAlign = 'end'; ctx.fillText('Border', PAD.left - 8, y + BAR_H / 2 + 5);
  ctx.fillStyle = '#FFFFFF'; ctx.textAlign = 'start';
  ctx.fillText('R$' + border.ticket, PAD.left + 8, y + BAR_H / 2 + 5);
}

// ── GRÁFICO 2: MODELAGEM — Fichas por modelagem (Border) + comparativo ──
// Fonte Border: tabelas oficiais do site borderltd.com.br, tamanho M
//   Boxy     → Costela de Adão + Jibóia: comp 70,5 · peito 59 · manga 21
//   Oversize → Border—Crew:              comp 74   · largura 58 · manga 25
//   Regular  → Border Basic (Classic):   comp 74   · largura 54 · manga 24
// Fonte concorrentes: estimados com base em produtos (*).

// Atributos exibidos em cada ficha
const MODELAGEM_ATTRS = [
  { key: 'corte',      label: 'Corte',          type: 'text' },
  { key: 'comprimento',label: 'Comprimento cm',  type: 'bar', min: 62, max: 82 },
  { key: 'largura',    label: 'Peito/largura cm',type: 'bar', min: 50, max: 68 },
  { key: 'manga',      label: 'Manga cm',        type: 'bar', min: 18, max: 28 },
  { key: 'acabamento', label: 'Ombro',           type: 'text' },
  { key: 'cintura',    label: 'Cintura',         type: 'text' },
  { key: 'tecido',     label: 'Tecido / g/m²',  type: 'text' },
  { key: 'genero',     label: 'Grade',           type: 'text' },
];

// Três fichas Border (dados reais) + concorrentes (estimados)
const MODELAGEM_SECTIONS = [
  {
    title: 'Border — Boxy · Costela de Adão + Jibóia',
    subtitle: 'fonte: borderltd.com.br · medidas exatas tamanho M',
    columns: [
      { id: 'border-boxy', name: 'Border\nBoxy', color: '#4285F4', isBorder: true,
        corte: 'Boxy exclusiva — mais curta e quadrada que boxy padrão',
        comprimento: { val: 70.5, est: false },
        largura:     { val: 59,   est: false },
        manga:       { val: 21,   est: false },
        acabamento:  'Reforço ombro a ombro',
        cintura:     'Sem marcação — cai reto',
        tecido:      '100% algodão · 290g/m² · fio 40.1',
        genero:      'Sem gênero P→XG',
      },
      { id: 'dust-co', name: 'Dust Co.', color: '#e07030', isBorder: false,
        corte: 'Oversized reto',
        comprimento: { val: 74, est: true },
        largura:     { val: 62, est: true },
        manga:       { val: 24, est: true },
        acabamento:  'Drop shoulder*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~230g/m²*',
        genero:      'Masc/unissex*',
      },
      { id: 'hist', name: 'HIST', color: '#c0a880', isBorder: false,
        corte: 'Oversized longo / angular',
        comprimento: { val: 78, est: true },
        largura:     { val: 64, est: true },
        manga:       { val: 25, est: true },
        acabamento:  'Drop shoulder ext.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/mescla ~240g/m²*',
        genero:      'Sem gênero*',
      },
      { id: 'desgosto', name: 'Desgosto', color: '#8870c0', isBorder: false,
        corte: 'Fitted / angular',
        comprimento: { val: 65, est: true },
        largura:     { val: 52, est: true },
        manga:       { val: 21, est: true },
        acabamento:  'Set-in convenc.*',
        cintura:     'Leve marcação*',
        tecido:      'Algodão ~200g/m²*',
        genero:      'Femme/unissex*',
      },
      { id: 'piet', name: 'Piet', color: '#5090d0', isBorder: false,
        corte: 'Slim / alfaiatado',
        comprimento: { val: 70, est: true },
        largura:     { val: 54, est: true },
        manga:       { val: 22, est: true },
        acabamento:  'Set-in estrut.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/blend ~230g/m²*',
        genero:      'Masculina*',
      },
      { id: 'pace', name: 'Pace', color: '#60a878', isBorder: false,
        corte: 'Oversized street',
        comprimento: { val: 72, est: true },
        largura:     { val: 60, est: true },
        manga:       { val: 23, est: true },
        acabamento:  'Drop/set-in*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~220g/m²*',
        genero:      'Unissex*',
      },
    ]
  },
  {
    title: 'Border — Oversize · Border—Crew',
    subtitle: 'fonte: borderltd.com.br · medidas exatas tamanho M',
    columns: [
      { id: 'border-over', name: 'Border\nOversize', color: '#4285F4', isBorder: true,
        corte: 'Oversize (maior largura que a Boxy)',
        comprimento: { val: 74,   est: false },
        largura:     { val: 58,   est: false },
        manga:       { val: 25,   est: false },
        acabamento:  'Reforço ombro a ombro',
        cintura:     'Sem marcação — cai reto',
        tecido:      '100% algodão · 180g/m² · fio 30.1 penteado · Selo BCI',
        genero:      'Sem gênero P→XG',
      },
      { id: 'dust-co', name: 'Dust Co.', color: '#e07030', isBorder: false,
        corte: 'Oversized reto',
        comprimento: { val: 74, est: true },
        largura:     { val: 62, est: true },
        manga:       { val: 24, est: true },
        acabamento:  'Drop shoulder*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~230g/m²*',
        genero:      'Masc/unissex*',
      },
      { id: 'hist', name: 'HIST', color: '#c0a880', isBorder: false,
        corte: 'Oversized longo / angular',
        comprimento: { val: 78, est: true },
        largura:     { val: 64, est: true },
        manga:       { val: 25, est: true },
        acabamento:  'Drop shoulder ext.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/mescla ~240g/m²*',
        genero:      'Sem gênero*',
      },
      { id: 'desgosto', name: 'Desgosto', color: '#8870c0', isBorder: false,
        corte: 'Fitted / angular',
        comprimento: { val: 65, est: true },
        largura:     { val: 52, est: true },
        manga:       { val: 21, est: true },
        acabamento:  'Set-in convenc.*',
        cintura:     'Leve marcação*',
        tecido:      'Algodão ~200g/m²*',
        genero:      'Femme/unissex*',
      },
      { id: 'piet', name: 'Piet', color: '#5090d0', isBorder: false,
        corte: 'Slim / alfaiatado',
        comprimento: { val: 70, est: true },
        largura:     { val: 54, est: true },
        manga:       { val: 22, est: true },
        acabamento:  'Set-in estrut.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/blend ~230g/m²*',
        genero:      'Masculina*',
      },
      { id: 'pace', name: 'Pace', color: '#60a878', isBorder: false,
        corte: 'Oversized street',
        comprimento: { val: 72, est: true },
        largura:     { val: 60, est: true },
        manga:       { val: 23, est: true },
        acabamento:  'Drop/set-in*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~220g/m²*',
        genero:      'Unissex*',
      },
    ]
  },
  {
    title: 'Border — Regular · Border Basic',
    subtitle: 'fonte: borderltd.com.br · medidas exatas tamanho M',
    columns: [
      { id: 'border-reg', name: 'Border\nRegular', color: '#4285F4', isBorder: true,
        corte: 'Street regular — veste bem em todos os corpos',
        comprimento: { val: 74,   est: false },
        largura:     { val: 54,   est: false },
        manga:       { val: 24,   est: false },
        acabamento:  'Reforço ombro a ombro · ribana canelada',
        cintura:     'Sem marcação — caimento versátil',
        tecido:      '100% algodão · serigrafia',
        genero:      'Sem gênero P→XG',
      },
      { id: 'dust-co', name: 'Dust Co.', color: '#e07030', isBorder: false,
        corte: 'Oversized reto',
        comprimento: { val: 74, est: true },
        largura:     { val: 62, est: true },
        manga:       { val: 24, est: true },
        acabamento:  'Drop shoulder*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~230g/m²*',
        genero:      'Masc/unissex*',
      },
      { id: 'hist', name: 'HIST', color: '#c0a880', isBorder: false,
        corte: 'Oversized longo / angular',
        comprimento: { val: 78, est: true },
        largura:     { val: 64, est: true },
        manga:       { val: 25, est: true },
        acabamento:  'Drop shoulder ext.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/mescla ~240g/m²*',
        genero:      'Sem gênero*',
      },
      { id: 'desgosto', name: 'Desgosto', color: '#8870c0', isBorder: false,
        corte: 'Fitted / angular',
        comprimento: { val: 65, est: true },
        largura:     { val: 52, est: true },
        manga:       { val: 21, est: true },
        acabamento:  'Set-in convenc.*',
        cintura:     'Leve marcação*',
        tecido:      'Algodão ~200g/m²*',
        genero:      'Femme/unissex*',
      },
      { id: 'piet', name: 'Piet', color: '#5090d0', isBorder: false,
        corte: 'Slim / alfaiatado',
        comprimento: { val: 70, est: true },
        largura:     { val: 54, est: true },
        manga:       { val: 22, est: true },
        acabamento:  'Set-in estrut.*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão/blend ~230g/m²*',
        genero:      'Masculina*',
      },
      { id: 'pace', name: 'Pace', color: '#60a878', isBorder: false,
        corte: 'Oversized street',
        comprimento: { val: 72, est: true },
        largura:     { val: 60, est: true },
        manga:       { val: 23, est: true },
        acabamento:  'Drop/set-in*',
        cintura:     'Sem marcação*',
        tecido:      'Algodão ~220g/m²*',
        genero:      'Unissex*',
      },
    ]
  },
];

function drawModelagemChart() {
  const canvas = document.getElementById('canvas-modelagem');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth - 32;

  const attrs     = MODELAGEM_ATTRS;
  const sections  = MODELAGEM_SECTIONS;
  const COL_LABEL = 120;
  const N_COLS    = sections[0].columns.length;
  const COL_W     = Math.max(80, Math.floor((W - COL_LABEL) / N_COLS));
  const ROW_H     = 44;    // maior para acomodar fonte 12px + wrap
  const HEADER_H  = 52;    // cabeçalho de marcas
  const SEC_TITLE_H = 36;  // título da seção
  const GAP_H     = 16;    // espaço entre seções
  const FOOT_H    = 26;

  const SEC_H = SEC_TITLE_H + HEADER_H + attrs.length * ROW_H;
  const H = sections.length * SEC_H + (sections.length - 1) * GAP_H + FOOT_H + 8;

  canvas.width  = W * dpr;
  canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';

  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  // Fundo transparente — herda do container

  // ── Helpers ──
  function wrapText(text, x, startY, maxW, lineH, color, font) {
    ctx.font = font;
    ctx.fillStyle = color;
    ctx.textAlign = 'start';
    const words = text.split(' ');
    let line = '', ly = startY;
    words.forEach(w => {
      const test = line + (line ? ' ' : '') + w;
      if (ctx.measureText(test).width > maxW && line) {
        ctx.fillText(line, x, ly);
        ly += lineH;
        line = w;
      } else { line = test; }
    });
    if (line) ctx.fillText(line, x, ly);
  }

  // ── Renderizar cada seção ──
  sections.forEach((sec, si) => {
    const secY = si * (SEC_H + GAP_H);
    const brands = sec.columns;

    // Título da seção
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    ctx.fillRect(0, secY, W, SEC_TITLE_H);
    ctx.font = '600 12px Helvetica Neue,sans-serif';
    ctx.fillStyle = '#4285F4';
    ctx.textAlign = 'start';
    ctx.fillText(sec.title, 8, secY + 18);
    ctx.font = '400 12px Helvetica Neue,sans-serif';
    ctx.fillStyle = '#888';
    ctx.fillText(sec.subtitle, 8, secY + SEC_TITLE_H - 5);

    // Cabeçalho de colunas (marcas)
    const headerY = secY + SEC_TITLE_H;
    ctx.fillStyle = 'rgba(0,0,0,0.03)';
    ctx.fillRect(0, headerY, W, HEADER_H);

    brands.forEach((b, ci) => {
      const bx = COL_LABEL + ci * COL_W;
      // Destaque coluna Border
      if (b.isBorder) {
        ctx.fillStyle = 'rgba(66,133,244,0.06)';
        ctx.fillRect(bx, secY, COL_W, SEC_H);
      }
      const midX = bx + COL_W / 2;
      // Ponto
      ctx.beginPath();
      ctx.arc(midX, headerY + 12, 5, 0, Math.PI * 2);
      ctx.fillStyle = b.color;
      ctx.fill();
      // Nome (pode ter \n)
      const lines = b.name.split('\n');
      lines.forEach((l, li) => {
        ctx.font = (b.isBorder ? '700' : '500') + ' 12px Helvetica Neue,sans-serif';
        ctx.fillStyle = b.isBorder ? '#4285F4' : '#555';
        ctx.textAlign = 'center';
        ctx.fillText(l, midX, headerY + 24 + li * 11);
      });
    });

    // Linha divisória label/colunas no header
    ctx.strokeStyle = 'rgba(0,0,0,0.10)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(COL_LABEL, headerY);
    ctx.lineTo(COL_LABEL, headerY + HEADER_H);
    ctx.stroke();

    // Linhas de atributos
    attrs.forEach((attr, ri) => {
      const ry = headerY + HEADER_H + ri * ROW_H;

      // Zebra
      ctx.fillStyle = ri % 2 === 0 ? 'rgba(0,0,0,0.04)' : 'transparent';
      ctx.fillRect(0, ry, W, ROW_H);

      // Reaplica destaque Border sobre zebra
      brands.forEach((b, ci) => {
        if (b.isBorder) {
          ctx.fillStyle = 'rgba(66,133,244,0.04)';
          ctx.fillRect(COL_LABEL + ci * COL_W, ry, COL_W, ROW_H);
        }
      });

      // Label atributo
      ctx.font = '500 12px Helvetica Neue,sans-serif';
      ctx.fillStyle = '#888';
      ctx.textAlign = 'start';
      ctx.fillText(attr.label, 6, ry + ROW_H / 2 + 4);

      // Separador horizontal
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(0, ry + ROW_H);
      ctx.lineTo(W, ry + ROW_H);
      ctx.stroke();

      // Separador label
      ctx.strokeStyle = 'rgba(0,0,0,0.10)';
      ctx.beginPath();
      ctx.moveTo(COL_LABEL, ry);
      ctx.lineTo(COL_LABEL, ry + ROW_H);
      ctx.stroke();

      // Células
      brands.forEach((b, ci) => {
        const cx = COL_LABEL + ci * COL_W;
        const cellMid = ry + ROW_H / 2;

        if (attr.type === 'bar') {
          const d = b[attr.key];
          const { val, est } = d;
          const { min, max } = attr;
          const ratio = Math.max(0, Math.min(1, (val - min) / (max - min)));
          const barMaxW = COL_W - 26;
          const barW = Math.round(ratio * barMaxW);
          const barH = 6;
          const bxb = cx + 5;
          const byb = cellMid - barH - 2;

          ctx.fillStyle = 'rgba(0,0,0,0.08)';
          ctx.fillRect(bxb, byb, barMaxW, barH);
          ctx.fillStyle = b.isBorder ? b.color : b.color + (est ? '55' : '88');
          ctx.fillRect(bxb, byb, barW, barH);

          ctx.font = (b.isBorder ? '700' : '400') + ' 12px Helvetica Neue,sans-serif';
          ctx.fillStyle = b.isBorder ? b.color : (est ? '#777' : '#999');
          ctx.textAlign = 'start';
          ctx.fillText(val + (est ? '*' : '') + 'cm', bxb, byb + barH + 10);

        } else {
          wrapText(
            b[attr.key],
            cx + 4,
            ry + 14,
            COL_W - 8,
            15,
            b.isBorder ? b.color : '#888',
            (b.isBorder ? '600' : '400') + ' 12px Helvetica Neue,sans-serif'
          );
        }
      });
    });
  });

  // ── Rodapé global ──
  const footY = sections.length * (SEC_H + GAP_H) - GAP_H + 4;
  ctx.font = '400 12px Helvetica Neue,sans-serif';
  ctx.fillStyle = '#777';
  ctx.textAlign = 'start';
  ctx.fillText('* estimado com base em produtos identificados · medidas tamanho M · fonte Border: borderltd.com.br', 8, footY + 18);
}

// ── GRÁFICO 3: PÚBLICO (sobreposição com Border) ──────────────────────
const PUBLICO_DATA = [
  { id: 'border',       name: 'Border',      color: '#4285F4', isBorder: true,
    queer: 92, desfem: 90, masc: 88, jovem: 85, conceitual: 90, street: 82 },
  { id: 'dust-co',      name: 'Dust Co.',     color: '#e07030',
    queer: 35, desfem: 30, masc: 60, jovem: 75, conceitual: 40, street: 85 },
  { id: 'hist',         name: 'HIST',         color: '#c0a880',
    queer: 40, desfem: 50, masc: 45, jovem: 70, conceitual: 75, street: 70 },
  { id: 'desgosto',     name: 'Desgosto',     color: '#8870c0',
    queer: 55, desfem: 55, masc: 50, jovem: 80, conceitual: 60, street: 75 },
  { id: 'piet',         name: 'Piet',         color: '#5090d0',
    queer: 25, desfem: 20, masc: 70, jovem: 65, conceitual: 70, street: 65 },
  { id: 'pace',         name: 'Pace',         color: '#60a878',
    queer: 20, desfem: 25, masc: 55, jovem: 82, conceitual: 45, street: 80 },
];

function drawPublicoChart() {
  // Layout por marca: Border no topo como referência, concorrentes abaixo.
  // Cada bloco tem um cabeçalho com o nome da marca + barras por segmento.
  // Scroll vertical habilitado no container HTML — canvas cresce livremente.
  const canvas = document.getElementById('canvas-publico');
  if (!canvas) return;
  const dpr = window.devicePixelRatio || 1;
  const W = canvas.parentElement.clientWidth;

  const segments  = ['queer','desfem','masc','jovem','conceitual','street'];
  const segLabels = {
    queer:'Queer / LGBTQ+', desfem:'Desfem / andrógino',
    masc:'Masc convencional', jovem:'Jovem 18–32',
    conceitual:'Moda conceitual', street:'Street urbano'
  };

  const PAD     = { top: 12, right: 64, bottom: 48, left: 168 };
  const BAR_H   = 26;
  const BAR_GAP = 7;
  const HDR_H   = 38;
  const BLK_PAD = 18;
  const BLOCK_H = segments.length * (BAR_H + BAR_GAP) + 4;

  const allBrands = PUBLICO_DATA.filter(b => !b.isBorder);
  const border    = PUBLICO_DATA.find(b => b.isBorder);
  const plotW     = W - PAD.left - PAD.right;
  const totalBlocks = allBrands.length + 1;
  const H = PAD.top + totalBlocks * (HDR_H + BLOCK_H) + (totalBlocks - 1) * BLK_PAD + PAD.bottom;

  canvas.width  = W * dpr; canvas.height = H * dpr;
  canvas.style.width  = W + 'px';
  canvas.style.height = H + 'px';
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Linhas de grid verticais (0, 25, 50, 75, 100%)
  [0, 25, 50, 75, 100].forEach(pct => {
    const x = PAD.left + plotW * (pct / 100);
    ctx.strokeStyle = 'rgba(0,0,0,0.06)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, PAD.top); ctx.lineTo(x, H - PAD.bottom); ctx.stroke();
    if (pct > 0) {
      ctx.font = '11px Helvetica Neue,sans-serif'; ctx.fillStyle = '#bbb';
      ctx.textAlign = 'center'; ctx.fillText(pct + '%', x, H - PAD.bottom + 14);
    }
  });

  function drawBlock(b, yStart, isBorder) {
    // Cabeçalho — faixa colorida sutil
    ctx.fillStyle = isBorder ? 'rgba(66,133,244,0.10)' : 'rgba(0,0,0,0.035)';
    ctx.fillRect(0, yStart, W, HDR_H);

    // Ponto cor da marca
    ctx.beginPath();
    ctx.arc(PAD.left - 16, yStart + HDR_H / 2, 6, 0, Math.PI * 2);
    ctx.fillStyle = b.color; ctx.fill();

    // Nome
    ctx.font = (isBorder ? '800' : '700') + ' 14px Helvetica Neue,sans-serif';
    ctx.fillStyle = isBorder ? b.color : '#222';
    ctx.textAlign = 'start';
    ctx.fillText(isBorder ? b.name + ' · referência' : b.name, PAD.left, yStart + HDR_H / 2 + 5);

    segments.forEach((seg, si) => {
      const y       = yStart + HDR_H + si * (BAR_H + BAR_GAP) + 2;
      const val     = b[seg];
      const bVal    = border[seg];
      const bw      = plotW * (val / 100);
      const borderW = plotW * (bVal / 100);

      // Trilha de fundo
      ctx.fillStyle = 'rgba(0,0,0,0.05)';
      ctx.fillRect(PAD.left, y, plotW, BAR_H);

      if (isBorder) {
        // Barra Border sólida
        ctx.fillStyle = 'rgba(66,133,244,0.85)';
        ctx.fillRect(PAD.left, y, bw, BAR_H);
      } else {
        // Referência Border (ghost)
        ctx.fillStyle = 'rgba(66,133,244,0.14)';
        ctx.fillRect(PAD.left, y, borderW, BAR_H);
        // Barra do concorrente
        const hexR = parseInt(b.color.slice(1,3),16);
        const hexG = parseInt(b.color.slice(3,5),16);
        const hexB = parseInt(b.color.slice(5,7),16);
        ctx.fillStyle = `rgba(${hexR},${hexG},${hexB},0.70)`;
        ctx.fillRect(PAD.left, y, bw, BAR_H);
        // Sobreposição (interseção)
        const overlapW = plotW * (Math.min(val, bVal) / 100);
        ctx.fillStyle = `rgba(${hexR},${hexG},${hexB},0.35)`;
        ctx.fillRect(PAD.left, y, overlapW, BAR_H);
      }

      // Label do segmento — à esquerda, contraste forte
      ctx.font = '12px Helvetica Neue,sans-serif';
      ctx.fillStyle = '#555'; ctx.textAlign = 'end';
      ctx.fillText(segLabels[seg], PAD.left - 8, y + BAR_H / 2 + 5);

      // Valor % — à direita da barra, sempre legível
      const valX = PAD.left + Math.max(bw, isBorder ? 0 : borderW);
      ctx.font = (isBorder ? '700' : '600') + ' 12px Helvetica Neue,sans-serif';
      ctx.fillStyle = isBorder ? '#1a5fc8' : '#333'; ctx.textAlign = 'start';
      ctx.fillText(val + '%', PAD.left + bw + 6, y + BAR_H / 2 + 5);
    });
  }

  // Renderizar
  let yOff = PAD.top;
  drawBlock(border, yOff, true);
  yOff += HDR_H + BLOCK_H + BLK_PAD;

  allBrands.forEach(b => {
    ctx.strokeStyle = 'rgba(0,0,0,0.07)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, yOff - BLK_PAD / 2); ctx.lineTo(W, yOff - BLK_PAD / 2); ctx.stroke();
    drawBlock(b, yOff, false);
    yOff += HDR_H + BLOCK_H + BLK_PAD;
  });

  // Legenda no rodapé
  const legY = H - PAD.bottom + 20;
  const items = [
    { color: 'rgba(66,133,244,0.85)', label: 'Border (referência)' },
    { color: 'rgba(150,120,50,0.70)',  label: 'Concorrente (ex: HIST)' },
    { color: 'rgba(150,120,50,0.35)',  label: 'Sobreposição de público' },
    { color: 'rgba(66,133,244,0.14)',  label: 'Presença da Border (ghost)' },
  ];
  const legW = Math.floor(plotW / items.length);
  items.forEach((item, i) => {
    const lx = PAD.left + i * legW;
    ctx.fillStyle = item.color;
    ctx.fillRect(lx, legY, 18, 10);
    ctx.font = '11px Helvetica Neue,sans-serif';
    ctx.fillStyle = '#888'; ctx.textAlign = 'start';
    ctx.fillText(item.label, lx + 22, legY + 9);
  });
}

// ── ABAS DO PAINEL DE CONCORRENTES ───────────────────────────────────
function compTab(tab) {
  const panes = { mapas: 'comp-pane-mapas', cards: 'comp-pane-cards' };
  const tabs  = { mapas: 'comp-tab-mapas',  cards: 'comp-tab-cards'  };
  Object.keys(panes).forEach(k => {
    const pane = document.getElementById(panes[k]);
    const btn  = document.getElementById(tabs[k]);
    if (!pane || !btn) return;
    const active = k === tab;
    pane.style.display = active ? '' : 'none';
    btn.style.color       = active ? 'var(--accent)' : 'var(--dim)';
    btn.style.fontWeight  = active ? '600' : '400';
    btn.style.borderBottomColor = active ? 'var(--accent)' : 'transparent';
  });
  // Re-renderiza os gráficos ao voltar para a aba de mapas (width pode ter mudado)
  if (tab === 'mapas') requestAnimationFrame(() => initInteractiveMaps());
}

// ── inicialização e resize ───────────────────────────────────────────
function initInteractiveMaps() {
  _resolveCompCardIds();
  initPosMap();
  initValMap();
  drawTicketChart();
  drawModelagemChart();
  drawPublicoChart();
}

let _mapResizeTimer;
window.addEventListener('resize', () => {
  clearTimeout(_mapResizeTimer);
  _mapResizeTimer = setTimeout(initInteractiveMaps, 200);
});

// Hook na função go() para inicializar ao abrir o painel de concorrentes
const _origGoCompetitors = window.go;
window.go = function(id, el) {
  if (typeof _origGoCompetitors === 'function') _origGoCompetitors(id, el);
  if (id === 'competitors') requestAnimationFrame(() => initInteractiveMaps());
};

// Inicializa se o painel já estiver ativo na carga
document.addEventListener('DOMContentLoaded', () => {
  if (document.getElementById('p-competitors')?.classList.contains('active')) {
    initInteractiveMaps();
  }
  carregarListaRelatorios();
});

// ══════════════════════════════════════════════════════════════
// SISTEMA DE RELATÓRIOS — ANÁLISE DE DESEMPENHO
// Integração com Netlify Functions (API REST)
// ══════════════════════════════════════════════════════════════

const API_BASE = '/.netlify/functions/relatorios';

async function carregarRelatorios() {
  try {
    const response = await fetch(API_BASE, {
      method: 'GET',
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const dados = await response.json();
    return dados.relatorios || [];
  } catch (e) {
    console.error('Erro ao carregar relatórios:', e);
    return [];
  }
}

async function salvarRelatorioServidor(relatorio) {
  try {
    const response = await fetch(API_BASE, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(relatorio),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    const resultado = await response.json();
    return resultado.sucesso ? resultado.relatorio : null;
  } catch (e) {
    console.error('Erro ao salvar relatório:', e);
    return null;
  }
}

async function deletarRelatorioServidor(id) {
  try {
    const response = await fetch(API_BASE, {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    });

    if (!response.ok) throw new Error(`HTTP ${response.status}`);

    return true;
  } catch (e) {
    console.error('Erro ao deletar relatório:', e);
    return false;
  }
}

async function carregarListaRelatorios() {
  const relatorios = await carregarRelatorios();
  const lista = document.getElementById('relatorios-lista');

  if (!lista) return;

  if (relatorios.length === 0) {
    lista.innerHTML = '<p style="color:var(--dim)">Nenhum relatório adicionado ainda. Clique em "Adicionar Novo Relatório" para começar.</p>';
    return;
  }

  // Ordena por data decrescente
  relatorios.sort((a, b) => new Date(b.data) - new Date(a.data));

  lista.innerHTML = relatorios.map((r) => {
    const dataFormatada = new Date(r.data).toLocaleDateString('pt-BR');
    const resumoPreview = r.resumo.substring(0, 80) + (r.resumo.length > 80 ? '...' : '');
    return `
      <div style="background:var(--bg2);border:1px solid var(--border);padding:12px;border-radius:3px;margin-bottom:8px;cursor:pointer" onclick="abrirRelatorio('${r.id}')">
        <div style="font-size:12px;font-weight:500;color:var(--text);margin-bottom:4px">${r.titulo} · ${dataFormatada}</div>
        <div style="font-size:11px;color:var(--dim);line-height:1.6">${resumoPreview}</div>
      </div>
    `;
  }).join('');

  // Armazena relatórios em cache para acesso rápido
  window._relatoriosCache = relatorios;
}

function novoRelatorio() {
  document.getElementById('painel-adicionar').style.display = 'block';
  document.getElementById('painel-visualizacao').style.display = 'none';
  document.getElementById('rel-data').value = new Date().toISOString().split('T')[0];
}

function cancelarRelatorio() {
  document.getElementById('painel-adicionar').style.display = 'none';
  document.getElementById('rel-data').value = '';
  document.getElementById('rel-titulo').value = '';
  document.getElementById('rel-resumo').value = '';
  document.getElementById('rel-html').value = '';
}

async function salvarRelatorio() {
  const data = document.getElementById('rel-data').value;
  const titulo = document.getElementById('rel-titulo').value || 'Sem título';
  const resumo = document.getElementById('rel-resumo').value || 'Nenhum resumo fornecido';
  const html = document.getElementById('rel-html').value;

  if (!data) {
    alert('Por favor, defina uma data para o relatório.');
    return;
  }

  if (!html.trim()) {
    alert('Por favor, cole o HTML do relatório.');
    return;
  }

  const novoRelatorio = {
    data,
    titulo,
    resumo,
    html,
  };

  const resultado = await salvarRelatorioServidor(novoRelatorio);

  if (resultado) {
    cancelarRelatorio();
    await carregarListaRelatorios();
    alert('Relatório salvo com sucesso!');
  } else {
    alert('Erro ao salvar relatório. Tente novamente.');
  }
}

function abrirRelatorio(id) {
  const relatorios = window._relatoriosCache || [];
  const r = relatorios.find((rel) => rel.id === id);

  if (!r) return;

  const dataFormatada = new Date(r.data).toLocaleDateString('pt-BR');

  document.getElementById('rel-titulo-viz').textContent = r.titulo;
  document.getElementById('rel-data-viz').textContent = '📅 Semana de: ' + dataFormatada;
  document.getElementById('rel-resumo-viz').textContent = r.resumo;

  // Renderiza o HTML no iframe
  const iframe = document.getElementById('rel-iframe');
  iframe.srcdoc = r.html;

  document.getElementById('painel-adicionar').style.display = 'none';
  document.getElementById('painel-visualizacao').style.display = 'block';

  // Armazena ID para exclusão
  window._relatorioAberto = id;
}

function fecharVisualizacao() {
  document.getElementById('painel-visualizacao').style.display = 'none';
  document.getElementById('painel-adicionar').style.display = 'none';
  window._relatorioAberto = null;
}

async function excluirRelatorio() {
  if (window._relatorioAberto === null) return;

  if (!confirm('Tem certeza que deseja excluir este relatório? Esta ação não pode ser desfeita.')) {
    return;
  }

  const sucesso = await deletarRelatorioServidor(window._relatorioAberto);

  if (sucesso) {
    fecharVisualizacao();
    await carregarListaRelatorios();
    alert('Relatório excluído.');
  } else {
    alert('Erro ao excluir relatório. Tente novamente.');
  }
}

function importarRelatorio() {
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = '.html';

  arquivo.onchange = function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(event) {
      const html = event.target.result;
      document.getElementById('rel-html').value = html;

      // Tenta extrair título da tag <title> do HTML
      const titleMatch = html.match(/<title>([^<]+)<\/title>/i);
      if (titleMatch) {
        document.getElementById('rel-titulo').value = titleMatch[1];
      }

      document.getElementById('painel-adicionar').style.display = 'block';
      alert('HTML importado. Revise o título, data e resumo antes de salvar.');
    };
    reader.readAsText(file);
  };

  arquivo.click();
}
