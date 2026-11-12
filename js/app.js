import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { SUPABASE_URL, SUPABASE_KEY, SCHEMA, EMPRESA } from './config.js';
// Versão publicada: muda a cada atualização para o navegador não usar telas antigas do cache
const VERSAO = '202611120958'; // atualizar a cada publicação
import { h, toast } from './util.js';

export const db = createClient(SUPABASE_URL, SUPABASE_KEY, {
  db: { schema: SCHEMA },
  auth: { persistSession: true, autoRefreshToken: true }
});

export const ctx = { usuario: null, perfis: [], nome: '', email: '' };

export function tem(perfil) {
  return ctx.perfis.includes('admin') || ctx.perfis.includes(perfil);
}

// ---------- Menu / rotas ----------
const ROTAS = [
  { grupo: 'Início' },
  { hash: '#/painel', nome: 'Painel', ico: '📊', modulo: 'painel' },
  { grupo: 'Separação' },
  { hash: '#/corte', nome: '1 - Pedido de Corte', ico: '✂️', modulo: 'corte' },
  { hash: '#/lotes', nome: '2 - Lotes de Produção', ico: '📦', modulo: 'lotes' },
  { grupo: 'Produção' },
  { hash: '#/calandra', nome: 'Calandra', ico: '🔥', modulo: 'calandra' },
  { hash: '#/faccao', nome: 'Gestão de Facção', ico: '🧵', modulo: 'faccao' },
  { hash: '#/remessas', nome: 'Romaneios', ico: '🧾', modulo: 'remessas' },
  { hash: '#/consertos', nome: 'Consertos', ico: '🛠️', modulo: 'consertos' },
  { grupo: 'Gestão' },
  { hash: '#/fechamento', nome: 'Fechamento Facção', ico: '💰', modulo: 'fechamento' },
  { hash: '#/cadastros', nome: 'Cadastros', ico: '🗂️', modulo: 'cadastros' },
  { hash: '#/usuarios', nome: 'Usuários', ico: '👥', modulo: 'usuarios', perfil: 'admin' },
];

const cacheModulos = {};
async function carregarModulo(nome) {
  if (!cacheModulos[nome]) cacheModulos[nome] = await import(`./telas/${nome}.js?v=${VERSAO}`);
  return cacheModulos[nome];
}

function montarLayout() {
  const app = document.getElementById('app');
  const itens = ROTAS.filter(r => !r.perfil || tem(r.perfil)).map(r => r.grupo
    ? `<div class="grupo">${h(r.grupo)}</div>`
    : `<a href="${r.hash}" data-hash="${r.hash}"><span class="ico">${r.ico}</span>${h(r.nome)}</a>`).join('');
  app.innerHTML = `
    <div class="topo-mobile"><button id="abre-menu" aria-label="Abrir menu">☰</button><span class="t">${h(EMPRESA)}</span></div>
    <div class="layout">
      <aside class="lateral" id="lateral">
        <div class="marca">${h(EMPRESA)}<small>Gestão de Produção</small></div>
        <nav class="menu">${itens}</nav>
        <div class="usuario-box">
          <div class="nome">${h(ctx.nome)}</div>
          <div class="muted peq">${h(ctx.perfis.join(', '))}</div>
          <button class="btn peq" id="sair">Sair</button>
        </div>
      </aside>
      <main class="conteudo" id="conteudo"></main>
    </div>`;
  document.getElementById('sair').onclick = async () => { await db.auth.signOut(); location.hash = ''; location.reload(); };
  const lateral = document.getElementById('lateral');
  document.getElementById('abre-menu').onclick = () => {
    lateral.classList.add('aberta');
    const f = document.createElement('div'); f.className = 'fundo-menu';
    f.onclick = () => { lateral.classList.remove('aberta'); f.remove(); };
    document.body.appendChild(f);
  };
  lateral.querySelectorAll('.menu a').forEach(a => a.addEventListener('click', () => {
    lateral.classList.remove('aberta'); document.querySelector('.fundo-menu')?.remove();
  }));
}

let navSeq = 0;
async function navegar() {
  const hash = location.hash || '#/painel';
  const rota = ROTAS.find(r => r.hash && hash.startsWith(r.hash)) || ROTAS[1];
  document.querySelectorAll('.menu a').forEach(a => a.classList.toggle('ativo', a.dataset.hash === rota.hash));
  const el = document.getElementById('conteudo');
  if (rota.perfil && !tem(rota.perfil)) { el.innerHTML = '<div class="card">Acesso restrito.</div>'; return; }
  const seq = ++navSeq;
  el.innerHTML = '<div class="vazio"><div class="spinner" style="margin:auto"></div></div>';
  try {
    const mod = await carregarModulo(rota.modulo);
    if (seq !== navSeq) return;
    await mod.render(el);
  } catch (e) {
    console.error(e);
    el.innerHTML = `<div class="card erro-box">Erro ao abrir a tela: ${h(e.message || e)}</div>`;
  }
}
export function recarregarTela() { navegar(); }

// ---------- Autenticação ----------
function telaLogin(msg = '', tipo = 'erro') {
  const app = document.getElementById('app');
  app.innerHTML = `
    <div class="login"><div class="card">
      <div class="marca-login">${h(EMPRESA)}</div>
      <div class="sub">Gestão de Produção</div>
      ${msg ? `<div class="${tipo}-box">${h(msg)}</div>` : ''}
      <form id="f-login" class="grade">
        <label class="campo">E-mail<input type="email" name="email" required autocomplete="username"></label>
        <label class="campo">Senha<input type="password" name="senha" required minlength="6" autocomplete="current-password"></label>
        <button class="btn pri" type="submit">Entrar</button>
        <button class="btn" type="button" id="criar">Criar conta</button>
        <button class="btn peq" type="button" id="esqueci" style="border:0">Esqueci minha senha</button>
      </form>
    </div></div>`;
  const f = document.getElementById('f-login');
  f.onsubmit = async (ev) => {
    ev.preventDefault();
    const { email, senha } = Object.fromEntries(new FormData(f));
    const { error } = await db.auth.signInWithPassword({ email, password: senha });
    if (error) telaLogin(traduzErroAuth(error.message));
  };
  document.getElementById('criar').onclick = async () => {
    const { email, senha } = Object.fromEntries(new FormData(f));
    if (!email || !senha || senha.length < 6) return telaLogin('Preencha e-mail e uma senha de pelo menos 6 caracteres para criar a conta.');
    const { data, error } = await db.auth.signUp({ email, password: senha, options: { emailRedirectTo: location.origin + location.pathname } });
    if (error) return telaLogin(traduzErroAuth(error.message));
    if (!data.session) telaLogin('Conta criada. Confirme pelo link enviado ao seu e-mail e depois entre.', 'ok');
  };
  document.getElementById('esqueci').onclick = async () => {
    const { email } = Object.fromEntries(new FormData(f));
    if (!email) return telaLogin('Digite seu e-mail para receber o link de redefinição.');
    const { error } = await db.auth.resetPasswordForEmail(email, { redirectTo: location.origin + location.pathname });
    telaLogin(error ? traduzErroAuth(error.message) : 'Se o e-mail existir, enviamos um link de redefinição.', error ? 'erro' : 'ok');
  };
}

function traduzErroAuth(m) {
  if (/Invalid login credentials/i.test(m)) return 'E-mail ou senha incorretos.';
  if (/Email not confirmed/i.test(m)) return 'Confirme seu e-mail pelo link recebido antes de entrar.';
  if (/already registered/i.test(m)) return 'Este e-mail já tem conta. Use "Entrar".';
  if (/Password should be/i.test(m)) return 'A senha precisa ter pelo menos 6 caracteres.';
  return m;
}

function telaSemAcesso(status, email) {
  const app = document.getElementById('app');
  const semAdmin = !status.tem_admin;
  app.innerHTML = `
    <div class="login"><div class="card">
      <div class="marca-login">${h(EMPRESA)}</div>
      <div class="sub">${h(email)}</div>
      ${semAdmin ? `
        <div class="aviso-box">Nenhum administrador configurado ainda. Como primeiro acesso, você pode se tornar o administrador.</div>
        <form id="f-boot" class="grade">
          <label class="campo">Seu nome<input name="nome" required></label>
          <button class="btn pri">Tornar-me administrador</button>
        </form>` : status.usuario && !status.usuario.ativo
        ? `<div class="erro-box">Seu acesso está desativado. Fale com o administrador.</div>`
        : `<div class="aviso-box">Sua conta foi criada, mas ainda não foi liberada. Peça ao administrador para liberar seu acesso em <b>Usuários</b>.</div>`}
      <button class="btn" id="sair2" style="margin-top:10px;width:100%">Sair</button>
    </div></div>`;
  document.getElementById('sair2').onclick = async () => { await db.auth.signOut(); location.reload(); };
  const fb = document.getElementById('f-boot');
  if (fb) fb.onsubmit = async (ev) => {
    ev.preventDefault();
    const { error } = await db.rpc('bootstrap_admin', { p_nome: new FormData(fb).get('nome') });
    if (error) return toast(error.message, 'erro');
    location.reload();
  };
}

let iniciando = false;
async function iniciar() {
  if (iniciando) return;
  iniciando = true;
  try { await iniciarSessao(); } finally { iniciando = false; }
}
async function iniciarSessao() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) return telaLogin();
  const { data: status, error } = await db.rpc('status_sistema');
  if (error) {
    const msg = /schema must be one of|Invalid schema/i.test(error.message)
      ? 'O schema "yazfit" ainda não foi liberado na API do Supabase (Settings → Data API → Exposed schemas).'
      : error.message;
    document.getElementById('app').innerHTML = `<div class="login"><div class="card"><div class="erro-box">${h(msg)}</div>
      <button class="btn" onclick="location.reload()">Tentar novamente</button></div></div>`;
    return;
  }
  if (!status.usuario || !status.usuario.ativo) return telaSemAcesso(status, session.user.email);
  ctx.usuario = session.user; ctx.email = session.user.email;
  ctx.nome = status.usuario.nome; ctx.perfis = status.usuario.perfis || [];
  montarLayout();
  window.addEventListener('hashchange', navegar);
  navegar();
}

db.auth.onAuthStateChange((evento) => {
  if (evento === 'SIGNED_IN' && !ctx.usuario) iniciar();
  if (evento === 'PASSWORD_RECOVERY') {
    const nova = prompt('Digite a nova senha (mínimo 6 caracteres):');
    if (nova) db.auth.updateUser({ password: nova }).then(({ error }) => toast(error ? error.message : 'Senha alterada.', error ? 'erro' : 'ok'));
  }
});

iniciar();
