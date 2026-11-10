import { db, tem } from '../app.js';
import { h, moeda, chip, modal, ler, toast, msgErro, limparCache, formDados } from '../util.js';

const TABELAS = {
  produtos: { nome: 'Produtos', ordem: 'nome', campos: [
    { k: 'nome', r: 'Produto', req: true },
    { k: 'classificacao', r: 'Classificação', tipo: 'select', opcoes: ['Unitário', 'Conjunto'] },
    { k: 'categoria', r: 'Categoria' },
    { k: 'valor_cima', r: 'Valor parte de cima (R$)', tipo: 'number' },
    { k: 'valor_baixo', r: 'Valor parte de baixo (R$)', tipo: 'number' },
    { k: 'imagem_url', r: 'Link da imagem' },
  ], colunas: (x) => [h(x.nome), h(x.classificacao), h(x.categoria || ''), x.valor_cima != null ? moeda(x.valor_cima) : '—', x.valor_baixo != null ? moeda(x.valor_baixo) : '—', moeda(x.valor_faccao)],
    cab: ['Produto', 'Classif.', 'Categoria', 'Cima', 'Baixo', 'Valor facção'] },
  faccoes: { nome: 'Facções', ordem: 'nome', campos: [
    { k: 'nome', r: 'Nome', req: true }, { k: 'codigo', r: 'Código' }, { k: 'modelos', r: 'Modelos que faz' },
    { k: 'interna', r: 'Produção interna?', tipo: 'bool' },
  ], colunas: (x) => [h(x.nome), h(x.codigo || ''), h(x.modelos || ''), x.interna ? chip('Interna', 'info') : ''], cab: ['Nome', 'Código', 'Modelos', ''] },
  cores: { nome: 'Cores', ordem: 'nome', campos: [{ k: 'nome', r: 'Cor', req: true }], colunas: (x) => [h(x.nome)], cab: ['Cor'] },
  tamanhos: { nome: 'Tamanhos', ordem: 'ordem', campos: [{ k: 'nome', r: 'Tamanho', req: true }, { k: 'ordem', r: 'Ordem de exibição', tipo: 'number' }],
    colunas: (x) => [h(x.nome), x.ordem], cab: ['Tamanho', 'Ordem'] },
  operadores: { nome: 'Operadores', ordem: 'nome', campos: [{ k: 'nome', r: 'Nome', req: true }, { k: 'setor', r: 'Setor' }],
    colunas: (x) => [h(x.nome), h(x.setor || '')], cab: ['Nome', 'Setor'] },
};
let aba = 'produtos';
let mostrarInativos = false;

export async function render(el) {
  const t = TABELAS[aba], admin = tem('admin');
  let q = db.from(aba).select('*').order(t.ordem);
  if (!mostrarInativos) q = q.eq('ativo', true);
  const lista = await ler(q);
  el.innerHTML = `
    <div class="cab"><div><h1>Cadastros</h1><p>${admin ? 'Somente administradores podem alterar.' : 'Consulta.'}</p></div>
      ${admin ? `<button class="btn acento" id="novo">+ Novo</button>` : ''}</div>
    <div class="abas">${Object.entries(TABELAS).map(([k, v]) => `<button data-a="${k}" class="${aba === k ? 'ativo' : ''}">${v.nome}</button>`).join('')}</div>
    <label class="peq"><input type="checkbox" id="inat" ${mostrarInativos ? 'checked' : ''}> mostrar inativos</label>
    <div class="tabela-wrap" style="margin-top:8px"><table><thead><tr>${t.cab.map(c => `<th>${c}</th>`).join('')}<th>Status</th>${admin ? '<th></th>' : ''}</tr></thead>
      <tbody>${lista.map(x => `<tr>${t.colunas(x).map(c => `<td>${c}</td>`).join('')}<td>${x.ativo ? chip('Ativo', 'ok') : chip('Inativo', 'erro')}</td>
        ${admin ? `<td><button class="btn peq" data-ed="${x.id}">Editar</button></td>` : ''}</tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhum registro.</td></tr>'}</tbody></table></div>`;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; render(el); });
  el.querySelector('#inat').onchange = (e) => { mostrarInativos = e.target.checked; render(el); };
  el.querySelector('#novo')?.addEventListener('click', () => form(null, () => render(el)));
  el.querySelectorAll('[data-ed]').forEach(b => b.onclick = () => form(lista.find(x => String(x.id) === b.dataset.ed), () => render(el)));
}

function campo(c, v) {
  const val = v?.[c.k];
  if (c.tipo === 'select') return `<label class="campo">${c.r}<select name="${c.k}">${c.opcoes.map(o => `<option ${val === o ? 'selected' : ''}>${o}</option>`).join('')}</select></label>`;
  if (c.tipo === 'bool') return `<label class="campo"><input type="checkbox" name="${c.k}" ${val ? 'checked' : ''} style="width:auto;min-height:0"> ${c.r}</label>`;
  return `<label class="campo">${c.r}<input name="${c.k}" ${c.tipo === 'number' ? 'type="number" step="0.01" min="0"' : ''} value="${h(val ?? '')}" ${c.req ? 'required' : ''}></label>`;
}

function form(reg, depois) {
  const t = TABELAS[aba];
  modal({
    titulo: `${reg ? 'Editar' : 'Novo'} — ${t.nome}`,
    corpo: `<form id="fcad" class="grade">${t.campos.map(c => campo(c, reg)).join('')}
      ${reg ? `<label class="campo"><input type="checkbox" name="ativo" ${reg.ativo ? 'checked' : ''} style="width:auto;min-height:0"> Ativo</label>` : ''}</form>`,
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Salvar', classe: 'pri', acao: async (m) => {
        const f = m.querySelector('#fcad'); if (!f.reportValidity()) return false;
        const d = formDados(f), dados = {};
        t.campos.forEach(c => {
          if (c.tipo === 'bool') dados[c.k] = f[c.k].checked;
          else if (c.tipo === 'number') dados[c.k] = d[c.k] === '' ? null : Number(d[c.k]);
          else dados[c.k] = d[c.k] === '' ? null : d[c.k];
        });
        if (reg) dados.ativo = f.ativo.checked;
        const { error } = reg ? await db.from(aba).update(dados).eq('id', reg.id) : await db.from(aba).insert(dados);
        if (error) { toast(msgErro(error), 'erro'); return false; }
        limparCache(); toast('Salvo.', 'ok'); depois();
      }
    }]
  });
}
