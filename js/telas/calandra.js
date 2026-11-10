import { db, tem } from '../app.js';
import { h, num, dataHora, chip, modal, chamar, ler, cadastros, opcoes, toast, confirmar } from '../util.js';

let aba = 'estoque';

export async function render(el) {
  const pode = tem('calandra');
  const [estoque, ops] = await Promise.all([
    ler(db.from('v_calandra_estoque').select('*').order('codigo')),
    ler(db.from('v_calandra_operacoes').select('*').order('inicio', { ascending: false }).limit(aba === 'historico' ? 300 : 200)),
  ]);
  const ativos = estoque.filter(e => e.saldo > 0 || e.em_operacao > 0);
  const emProd = ops.filter(o => o.status === 'Em Produção');

  el.innerHTML = `
    <div class="cab"><div><h1>Calandra</h1><p>Estoque aguardando calandra e operações em andamento.</p></div></div>
    <div class="grade g3" style="margin-bottom:14px">
      <div class="kpi alerta"><div class="rot">Disponível</div><div class="val">${num(ativos.reduce((a, e) => a + Math.max(0, e.saldo), 0))}</div></div>
      <div class="kpi"><div class="rot">Em operação</div><div class="val">${num(emProd.reduce((a, o) => a + o.qtd, 0))}</div></div>
      <div class="kpi ok"><div class="rot">Estoques ativos</div><div class="val">${num(ativos.length)}</div></div>
    </div>
    <div class="abas">
      <button data-a="estoque" class="${aba === 'estoque' ? 'ativo' : ''}">Estoque</button>
      <button data-a="operacao" class="${aba === 'operacao' ? 'ativo' : ''}">Em operação (${emProd.length})</button>
      <button data-a="historico" class="${aba === 'historico' ? 'ativo' : ''}">Histórico</button>
    </div>
    <div id="lista"></div>`;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; render(el); });
  const lista = el.querySelector('#lista');

  if (aba === 'estoque') {
    lista.innerHTML = `<div class="tabela-wrap"><table>
      <thead><tr><th>Estoque</th><th>Tipo</th><th>Produto | Cor | Tam.</th><th>Lotes de origem</th><th class="n">Qtd</th><th class="n">Em op.</th><th class="n">Realizado</th><th class="n">Saldo</th>${pode ? '<th></th>' : ''}</tr></thead>
      <tbody>${ativos.map(e => `<tr>
        <td class="forte">${h(e.codigo)}</td><td>${chip(e.tipo, 'acento')}</td><td>${h(e.descricao)}</td><td class="peq muted">${h(e.lotes_origem || '')}</td>
        <td class="n">${num(e.qtd)}</td><td class="n">${num(e.em_operacao)}</td><td class="n">${num(e.realizado)}</td><td class="n forte">${num(e.saldo)}</td>
        ${pode ? `<td>${e.saldo > 0 ? `<button class="btn pri peq" data-iniciar="${e.id}">▶ Iniciar</button>` : ''}</td>` : ''}</tr>`).join('')
        || '<tr><td colspan="9" class="vazio">Nenhum estoque aguardando calandra.</td></tr>'}</tbody></table></div>`;
    lista.querySelectorAll('[data-iniciar]').forEach(b => b.onclick = () => iniciar(estoque.find(e => e.id === b.dataset.iniciar), () => render(el)));
  } else {
    const linhas = aba === 'operacao' ? emProd : ops;
    lista.innerHTML = `<div class="tabela-wrap"><table>
      <thead><tr><th>Status</th><th>Estoque</th><th>Descrição</th><th class="n">Qtd</th><th>Operador</th><th>Início</th><th>Fim</th><th>Lote gerado</th>${pode ? '<th></th>' : ''}</tr></thead>
      <tbody>${linhas.map(o => `<tr>
        <td>${chip(o.status, o.status === 'Concluído' ? 'ok' : o.status === 'Cancelado' ? 'erro' : 'info')}</td>
        <td class="forte">${h(o.estoque)}</td><td>${h(o.descricao)}</td><td class="n">${num(o.qtd)}</td><td>${h(o.operador || '')}</td>
        <td>${dataHora(o.inicio)}</td><td>${dataHora(o.fim)}</td><td>${h(o.lote_operacional || '')}</td>
        ${pode ? `<td>${o.status === 'Em Produção' ? `<div class="acoes"><button class="btn pri peq" data-fim="${o.id}">■ Concluir</button><button class="btn peq perigo" data-cancel="${o.id}">Cancelar</button></div>` : ''}</td>` : ''}
      </tr>`).join('') || '<tr><td colspan="9" class="vazio">Nenhuma operação.</td></tr>'}</tbody></table></div>`;
    lista.querySelectorAll('[data-fim]').forEach(b => b.onclick = async () => {
      const o = ops.find(x => x.id === b.dataset.fim);
      if (!await confirmar('Concluir operação', `Concluir <b>${num(o.qtd)}</b> peças de <b>${h(o.descricao)}</b>?`)) return;
      const r = await chamar(db, 'concluir_operacao_calandra', { p_operacao_id: o.id });
      if (r) { toast(r.lote_operacional ? `Concluído. Lote ${r.lote_operacional} liberado para facção.` : 'Concluído. Pedido liberado para corte.', 'ok'); render(el); }
    });
    lista.querySelectorAll('[data-cancel]').forEach(b => b.onclick = async () => {
      const motivo = prompt('Motivo do cancelamento:'); if (!motivo) return;
      if (await chamar(db, 'cancelar_operacao_calandra', { p_operacao_id: b.dataset.cancel, p_motivo: motivo })) { toast('Operação cancelada.', 'ok'); render(el); }
    });
  }
}

async function iniciar(e, depois) {
  const cad = await cadastros(db);
  modal({
    titulo: `Iniciar calandra — ${e.codigo}`,
    corpo: `<p>${h(e.descricao)} · saldo disponível <b>${num(e.saldo)}</b></p>
      <div class="grade g2">
        <label class="campo">Quantidade<input type="number" id="q" min="1" max="${e.saldo}" value="${e.saldo}"></label>
        <label class="campo">Operador<select id="op">${opcoes(cad.operadores.filter(o => o.ativo), null, 'nome', 'id', '—')}</select></label>
      </div>
      <label class="campo" style="margin-top:10px">Observações<input id="obs"></label>`,
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Iniciar', classe: 'pri', acao: async (m) => {
        const q = +m.querySelector('#q').value;
        if (!(q > 0 && q <= e.saldo)) { toast(`Quantidade deve ser entre 1 e ${e.saldo}.`, 'erro'); return false; }
        const r = await chamar(db, 'iniciar_operacao_calandra', { p_estoque_id: e.id, p_qtd: q, p_operador_id: +m.querySelector('#op').value || null, p_obs: m.querySelector('#obs').value || null });
        if (!r) return false;
        toast('Operação iniciada.', 'ok'); aba = 'operacao'; depois();
      }
    }]
  });
}
