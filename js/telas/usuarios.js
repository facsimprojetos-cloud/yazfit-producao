import { db, ctx } from '../app.js';
import { h, dataHora, chip, modal, ler, toast, msgErro, chamar, confirmar } from '../util.js';

const PERFIS = [
  ['admin', 'Administrador (tudo)'], ['supervisor', 'Supervisor (editar e excluir qualquer lançamento)'], ['cadastros', 'Cadastros (produtos, facções, cores…)'], ['corte', 'Corte'], ['calandra', 'Calandra'],
  ['faccao', 'Facção / Lotes / Consertos'], ['financeiro', 'Financeiro'], ['consulta', 'Só consulta'],
];

export async function render(el) {
  const [usuarios, pendentes] = await Promise.all([
    ler(db.from('usuarios').select('*').order('nome')),
    chamar(db, 'contas_pendentes', {}).then(r => r || []),
  ]);
  el.innerHTML = `
    <div class="cab"><div><h1>Usuários</h1><p>Usuário novo entra com a senha <b>123456</b> e pode trocá-la em "Minha senha", no menu. Quem cria conta na tela de login aparece em "Aguardando liberação".</p></div>
      <button class="btn pri" id="novo-usuario">+ Novo usuário</button></div>
    ${pendentes.length ? `<div class="card"><h2>Aguardando liberação</h2>
      <div class="tabela-wrap"><table><thead><tr><th>E-mail</th><th>Criada em</th><th></th></tr></thead>
      <tbody>${pendentes.map(p => `<tr><td>${h(p.email)}</td><td>${dataHora(p.criado_em)}</td><td><button class="btn pri peq" data-lib="${p.id}">Liberar</button></td></tr>`).join('')}</tbody></table></div></div>` : ''}
    <div class="tabela-wrap"><table><thead><tr><th>Nome</th><th>E-mail</th><th>Perfis</th><th>Status</th><th></th></tr></thead>
      <tbody>${usuarios.map(u => `<tr><td class="forte">${h(u.nome)}</td><td>${h(u.email || '')}</td><td>${u.perfis.map(p => chip(p, p === 'admin' ? 'acento' : 'info')).join(' ')}</td>
        <td>${u.ativo ? chip('Ativo', 'ok') : chip('Inativo', 'erro')}</td><td style="white-space:nowrap"><button class="btn peq" data-ed="${u.id}">Editar</button> <button class="btn peq" data-senha="${u.id}">Redefinir senha</button></td></tr>`).join('')}</tbody></table></div>`;
  el.querySelectorAll('[data-lib]').forEach(b => b.onclick = () => form(null, pendentes.find(p => p.id === b.dataset.lib), () => render(el)));
  el.querySelector('#novo-usuario').onclick = () => form(null, null, () => render(el));
  el.querySelectorAll('[data-senha]').forEach(b => b.onclick = async () => {
    const u = usuarios.find(x => x.id === b.dataset.senha);
    const ok = await confirmar('Redefinir senha', `A senha de <b>${h(u.nome)}</b> (${h(u.email || '')}) volta a ser <b>123456</b>. Avise a pessoa para entrar e trocar em "Minha senha".`, 'Redefinir para 123456', 'perigo');
    if (!ok) return;
    const r = await chamar(db, 'redefinir_senha', { p_usuario: u.id });
    if (r) toast(`Senha de ${u.nome} redefinida para 123456.`, 'ok');
  });
  el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(usuarios.find(u => u.id === b.dataset.ed), null, () => render(el)));
}

function form(u, pend, depois) {
  const perfis = u?.perfis || [];
  modal({
    titulo: u ? `Editar ${u.nome}` : pend ? `Liberar ${pend.email}` : 'Novo usuário',
    corpo: `<form id="fu" class="grade">
      ${!u && !pend ? `<label class="campo">E-mail<input type="email" name="email" required></label>` : ''}
      <label class="campo">Nome<input name="nome" value="${h(u?.nome || '')}" required></label>
      <div><b>Perfis</b>${PERFIS.map(([k, r]) => `<label style="display:block;margin:6px 0"><input type="checkbox" name="perfil" value="${k}" ${perfis.includes(k) ? 'checked' : ''}> ${r}</label>`).join('')}</div>
      ${u ? `<label><input type="checkbox" name="ativo" ${u.ativo ? 'checked' : ''}> Acesso ativo</label>` : ''}
    </form>`,
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Salvar', classe: 'pri', acao: async (m) => {
        const f = m.querySelector('#fu'); if (!f.reportValidity()) return false;
        const sel = [...f.querySelectorAll('[name=perfil]:checked')].map(i => i.value);
        if (!sel.length) { toast('Marque ao menos um perfil.', 'erro'); return false; }
        if (u && u.id === ctx.usuario.id && (!sel.includes('admin') || !f.ativo.checked)) { toast('Você não pode remover o seu próprio acesso de administrador.', 'erro'); return false; }
        if (!u && !pend) {
          const { data, error } = await db.rpc('criar_usuario', { p_email: f.email.value.trim(), p_nome: f.nome.value.trim(), p_perfis: sel });
          if (error) { toast(msgErro(error), 'erro'); return false; }
          toast(data?.conta_existente
            ? 'Usuário liberado. Este e-mail já tinha conta, então a pessoa entra com a senha que já usa.'
            : 'Usuário criado. Senha inicial: 123456.', 'ok');
          return depois();
        }
        const { error } = u
          ? await db.from('usuarios').update({ nome: f.nome.value.trim(), perfis: sel, ativo: f.ativo.checked }).eq('id', u.id)
          : await db.from('usuarios').insert({ id: pend.id, email: pend.email, nome: f.nome.value.trim(), perfis: sel });
        if (error) { toast(msgErro(error), 'erro'); return false; }
        toast('Usuário salvo.', 'ok'); depois();
      }
    }]
  });
}
