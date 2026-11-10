import { db, tem } from '../app.js';
import { h, num, moeda, data, chip, modal, chamar, ler, cadastros, opcoes, toast, hojeISO, confirmar } from '../util.js';

let aba = 'aberto';
let fFac = '', fAtraso = '', busca = '';

export async function render(el) {
  const pode = tem('faccao');
  const cad = await cadastros(db);
  let lista;
  if (aba === 'conferir') {
    lista = await ler(db.from('v_retornos').select('*').eq('situacao', 'A CONFERIR').order('data_retorno'));
  } else {
    let q = db.from('v_envios').select('*').order('previsao').limit(500);
    q = aba === 'aberto' ? q.is('data_retorno', null) : q.not('data_retorno', 'is', null).order('data_retorno', { ascending: false });
    lista = await ler(q);
  }
  const filtrada = lista.filter(x => (!fFac || String(x.faccao_id) === fFac) && (!fAtraso || x.atraso === fAtraso)
    && (!busca || [x.lote, x.sublote, x.produto, x.cor, x.faccao].join(' ').toLowerCase().includes(busca.toLowerCase())));

  el.innerHTML = `
    <div class="cab"><div><h1>Gestão de Facção</h1><p>Acompanhe o que está nas facções, registre retornos e confira.</p></div></div>
    <div class="abas">
      <button data-a="aberto" class="${aba === 'aberto' ? 'ativo' : ''}">Em aberto</button>
      <button data-a="conferir" class="${aba === 'conferir' ? 'ativo' : ''}">Retornos a conferir</button>
      <button data-a="retornados" class="${aba === 'retornados' ? 'ativo' : ''}">Retornados</button>
    </div>
    <div class="filtros">
      <label class="campo">Facção<select id="ff">${opcoes(cad.faccoes, fFac, 'nome', 'id', 'Todas')}</select></label>
      ${aba !== 'conferir' ? `<label class="campo">Prazo<select id="fa"><option value="">Todos</option>
        ${(aba === 'aberto' ? ['Atrasado', 'No Prazo'] : ['Entregue no prazo', 'Entregue com atraso']).map(s => `<option ${fAtraso === s ? 'selected' : ''}>${s}</option>`).join('')}</select></label>` : ''}
      <label class="campo">Buscar<input id="fb" value="${h(busca)}" placeholder="Lote, produto, cor…"></label>
    </div>
    <div id="lista"></div>`;
  el.querySelectorAll('[data-a]').forEach(b => b.onclick = () => { aba = b.dataset.a; fAtraso = ''; render(el); });
  el.querySelector('#ff').onchange = (e) => { fFac = e.target.value; render(el); };
  el.querySelector('#fa')?.addEventListener('change', (e) => { fAtraso = e.target.value; render(el); });
  el.querySelector('#fb').onchange = (e) => { busca = e.target.value; render(el); };
  const alvo = el.querySelector('#lista');

  if (aba === 'conferir') {
    alvo.innerHTML = `<div class="lista-cards">${filtrada.map(r => `<div class="item">
      <div class="linha1"><div><div class="tit">${h(r.faccao)}</div><div class="det">${h(r.produto)} · ${h(r.cor || '')} · ${h(r.tamanho || '')}</div><div class="det">Lote ${h(r.lote)} · retorno ${data(r.data_retorno)}</div></div>${chip('A conferir', 'alerta')}</div>
      <div class="det" style="margin-top:8px">Cima: <b>${r.ret_cima}</b> (def. ${r.def_cima}, cons. ${r.cons_cima}) · Baixo: <b>${r.ret_baixo}</b> (def. ${r.def_baixo}, cons. ${r.cons_baixo})</div>
      <div class="det">Valor calculado: <b>${moeda(r.valor_a_pagar)}</b></div>
      ${pode ? `<div class="acoes" style="margin-top:10px"><button class="btn pri peq" data-conf="${r.id}">Conferir</button></div>` : ''}
    </div>`).join('') || '<div class="vazio">Nenhum retorno aguardando conferência.</div>'}</div>`;
    alvo.querySelectorAll('[data-conf]').forEach(b => b.onclick = () => formRetorno(null, filtrada.find(r => r.id === b.dataset.conf), () => render(el)));
    return;
  }

  const grupos = new Map();
  filtrada.forEach(e => { if (!grupos.has(e.faccao)) grupos.set(e.faccao, []); grupos.get(e.faccao).push(e); });
  alvo.innerHTML = [...grupos.entries()].map(([fac, itens]) => `
    <h2 style="margin-top:14px">${h(fac)} <span class="muted peq">${num(itens.reduce((a, e) => a + e.saldo, 0))} peças pendentes · ${itens.length} envio(s)</span></h2>
    <div class="lista-cards">${itens.map(e => cartao(e, pode)).join('')}</div>`).join('') || '<div class="vazio">Nenhum envio.</div>';

  alvo.querySelectorAll('[data-acao]').forEach(b => b.onclick = async () => {
    const e = filtrada.find(x => x.id === b.dataset.id);
    if (b.dataset.acao === 'retorno') formRetorno(e, null, () => render(el));
    if (b.dataset.acao === 'finalizar') finalizar(e, () => render(el));
    if (b.dataset.acao === 'ocorrencia') {
      const t = prompt('Ocorrência:', e.ocorrencia || ''); if (t === null) return;
      if (await chamar(db, 'registrar_ocorrencia', { p_envio_id: e.id, p_texto: t || null })) { toast('Ocorrência registrada.', 'ok'); render(el); }
    }
    if (b.dataset.acao === 'historico') historico(e);
  });
}

function cartao(e, pode) {
  const corAtraso = { 'Atrasado': 'erro', 'No Prazo': 'ok', 'Entregue no prazo': 'ok', 'Entregue com atraso': 'alerta' }[e.atraso];
  return `<div class="item">
    <div class="linha1"><div><div class="tit">${h(e.produto)}</div><div class="det">${h(e.cor || '')} · ${h(e.tamanho || '')} · Lote ${h(e.lote)}</div>
      <div class="det">Sublote ${h(e.sublote)} · Romaneio nº ${h(e.remessa_numero)}</div></div>
      <div style="text-align:right">${chip(e.atraso, corAtraso)}<div class="det">${chip(e.status, e.status === 'Retorno Parcial' ? 'alerta' : e.status === 'Retornou' ? 'ok' : 'info')}</div></div></div>
    <div class="nums"><div><b>${num(e.qtd)}</b><span>Enviado</span></div><div><b style="color:var(--ok)">${num(e.retornado)}</b><span>Retornado</span></div><div><b style="color:var(--alerta)">${num(e.saldo)}</b><span>Pendente</span></div></div>
    <div class="det">Envio ${data(e.data_envio)} · Previsão <b>${data(e.previsao)}</b>${e.dias_atraso > 0 ? ` · <span style="color:var(--erro)">${e.dias_atraso} dia(s) de atraso</span>` : ''}</div>
    ${e.classificacao === 'Conjunto' ? `<div class="det">Retorno cima/baixo: ${e.ret_cima} / ${e.ret_baixo}</div>` : ''}
    <div class="det">Valor: ${moeda(e.valor_total)}</div>
    ${e.ocorrencia ? `<div class="aviso-box">Ocorrência: ${h(e.ocorrencia)}</div>` : ''}
    <div class="acoes" style="margin-top:10px">
      ${pode && !e.data_retorno ? `<button class="btn pri peq" data-acao="retorno" data-id="${e.id}">Registrar retorno</button>
        <button class="btn peq" data-acao="ocorrencia" data-id="${e.id}">Ocorrência</button>
        ${e.qtd_retornos > 0 ? `<button class="btn peq" data-acao="finalizar" data-id="${e.id}">Finalizar</button>` : ''}` : ''}
      ${e.qtd_retornos > 0 ? `<button class="btn peq" data-acao="historico" data-id="${e.id}">Retornos (${e.qtd_retornos})</button>` : ''}
    </div></div>`;
}

// envio (novo retorno) OU retorno existente (conferência/edição)
async function formRetorno(envio, ret, depois) {
  let e = envio;
  if (!e) [e] = await ler(db.from('v_envios').select('*').eq('id', ret.envio_id));
  const temC = e.valor_cima != null, temB = e.valor_baixo != null;
  const restC = e.qtd - e.ret_cima + (ret ? ret.ret_cima : 0), restB = e.qtd - e.ret_baixo + (ret ? ret.ret_baixo : 0);
  const v = ret || { ret_cima: temC ? restC : 0, ret_baixo: temB ? restB : 0, def_cima: 0, def_baixo: 0, cons_cima: 0, cons_baixo: 0, data_retorno: hojeISO(), data_conferencia: hojeISO(), obs: '' };
  const parte = (rot, k, tem, max) => tem ? `<div class="card" style="margin:0"><h3>${rot}</h3>
      <label class="campo">Retornadas (máx. ${max})<input type="number" min="0" max="${max}" name="ret_${k}" value="${v['ret_' + k]}"></label>
      <label class="campo">Com defeito<input type="number" min="0" name="def_${k}" value="${v['def_' + k]}"></label>
      <label class="campo">Para conserto<input type="number" min="0" name="cons_${k}" value="${v['cons_' + k]}"></label></div>` : '';
  modal({
    titulo: ret ? 'Conferir retorno' : 'Registrar retorno', largo: true,
    corpo: `<p><b>${h(e.faccao)}</b> — ${h(e.produto)} · ${h(e.cor || '')} · ${h(e.tamanho || '')} · Lote ${h(e.lote)}<br>
        Enviado <b>${num(e.qtd)}</b> · já retornado ${temC && temB ? `cima ${e.ret_cima} / baixo ${e.ret_baixo}` : num(e.retornado)}</p>
      <form id="fr" class="grade">
        <div class="grade ${temC && temB ? 'g2' : ''}">${parte('Parte de cima', 'cima', temC, restC)}${parte('Parte de baixo', 'baixo', temB, restB)}</div>
        <div class="grade g2">
          <label class="campo">Data do retorno<input type="date" name="data_retorno" value="${v.data_retorno || ''}" required></label>
          <label class="campo">Data da conferência<input type="date" name="data_conferencia" value="${v.data_conferencia || ''}"></label>
        </div>
        <p class="muted peq">Sem data de conferência o retorno fica "A conferir" e não entra no pagamento. Defeito é descontado do valor; conserto gera uma pendência em Consertos.</p>
        <label class="campo">Observações / consertos<input name="obs" value="${h(v.obs || '')}"></label>
      </form>`,
    botoes: [{ texto: 'Cancelar' }, {
      texto: ret ? 'Salvar conferência' : 'Registrar', classe: 'pri', acao: async (m) => {
        const f = m.querySelector('#fr'); if (!f.reportValidity()) return false;
        const g = (n) => f[n] ? (+f[n].value || 0) : 0;
        const p = { p_data_retorno: f.data_retorno.value, p_data_conferencia: f.data_conferencia.value || null,
          p_ret_cima: g('ret_cima'), p_ret_baixo: g('ret_baixo'), p_def_cima: g('def_cima'), p_def_baixo: g('def_baixo'),
          p_cons_cima: g('cons_cima'), p_cons_baixo: g('cons_baixo'), p_obs: f.obs.value || null };
        if (p.p_def_cima > p.p_ret_cima || p.p_def_baixo > p.p_ret_baixo || p.p_cons_cima > p.p_ret_cima || p.p_cons_baixo > p.p_ret_baixo) {
          toast('Defeito/conserto não pode ser maior que o retornado.', 'erro'); return false; }
        const r = ret ? await chamar(db, 'atualizar_retorno', { p_retorno_id: ret.id, ...p })
                      : await chamar(db, 'registrar_retorno', { p_envio_id: e.id, ...p });
        if (!r) return false;
        toast('Retorno salvo.', 'ok'); depois();
      }
    }]
  });
}

function finalizar(e, depois) {
  modal({
    titulo: 'Finalizar envio',
    corpo: `<p>Encerrar o envio de <b>${h(e.produto)}</b> para <b>${h(e.faccao)}</b> com <b>${num(e.saldo)}</b> peça(s) pendente(s)? Use quando a facção não vai devolver o restante.</p>
      <label class="campo">Data<input type="date" id="dt" value="${hojeISO()}"></label>
      <label class="campo" style="margin-top:8px">Ocorrência (obrigatória)<input id="oc" value="${h(e.ocorrencia || '')}"></label>`,
    botoes: [{ texto: 'Cancelar' }, {
      texto: 'Finalizar', classe: 'pri', acao: async (m) => {
        const oc = m.querySelector('#oc').value.trim();
        if (oc.length < 3) { toast('Descreva a ocorrência.', 'erro'); return false; }
        const r = await chamar(db, 'finalizar_envio', { p_envio_id: e.id, p_data: m.querySelector('#dt').value, p_ocorrencia: oc });
        if (!r) return false; toast('Envio finalizado.', 'ok'); depois();
      }
    }]
  });
}

async function historico(e) {
  const rets = await ler(db.from('v_retornos').select('*').eq('envio_id', e.id).order('data_retorno'));
  modal({
    titulo: `Retornos — ${e.produto} (${e.faccao})`, largo: true,
    corpo: `<div class="tabela-wrap"><table><thead><tr><th>Retorno</th><th>Conferência</th><th class="n">Cima</th><th class="n">Baixo</th><th class="n">Defeito</th><th class="n">Conserto</th><th class="n">Valor</th><th>Situação</th></tr></thead>
      <tbody>${rets.map(r => `<tr><td>${data(r.data_retorno)}</td><td>${data(r.data_conferencia) || '—'}</td><td class="n">${r.ret_cima}</td><td class="n">${r.ret_baixo}</td>
        <td class="n">${r.def_cima + r.def_baixo}</td><td class="n">${r.cons_cima + r.cons_baixo}</td><td class="n">${moeda(r.valor_a_pagar)}</td>
        <td>${chip(r.situacao, r.situacao === 'PAGO' ? 'ok' : r.situacao === 'ABERTO' ? 'info' : 'alerta')}</td></tr>`).join('')}</tbody></table></div>`,
    botoes: [{ texto: 'Fechar' }]
  });
}
