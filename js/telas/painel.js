import { db, ctx } from '../app.js';
import { h, num, moeda, data, ler, hojeISO } from '../util.js';

let periodo = 'semana';
let deCustom = '', ateCustom = '';

// Datas em AAAA-MM-DD no fuso de São Paulo
function iso(d) { return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' }); }
function somaDias(isoData, n) { const d = new Date(isoData + 'T12:00:00'); d.setDate(d.getDate() + n); return iso(d); }
function intervalo() {
  const hoje = hojeISO();
  const dow = new Date(hoje + 'T12:00:00').getDay();            // 0 = domingo
  const segunda = somaDias(hoje, dow === 0 ? -6 : 1 - dow);
  if (periodo === 'semana') return [segunda, somaDias(segunda, 6), 'Esta semana'];
  if (periodo === 'proxima') return [somaDias(segunda, 7), somaDias(segunda, 13), 'Próxima semana'];
  if (periodo === 'mes') {
    const [a, m] = hoje.split('-').map(Number);
    const fim = iso(new Date(a, m, 0, 12));
    return [`${a}-${String(m).padStart(2, '0')}-01`, fim, 'Este mês'];
  }
  return [deCustom || hoje, ateCustom || deCustom || hoje, 'Período'];
}
const dentro = (d, [a, b]) => d && d >= a && d <= b;

export async function render(el) {
  const [cortes, sublotes, envios, retornos, estoque, fechamentos] = await Promise.all([
    ler(db.from('cortes').select('status')),
    ler(db.from('v_sublotes').select('qtd_saldo,disponivel_envio').gt('qtd_saldo', 0)),
    ler(db.from('v_envios').select('faccao,saldo,atraso,previsao,valor_unit').is('data_retorno', null)),
    ler(db.from('v_retornos').select('faccao,situacao,valor_a_pagar,data_conferencia,data_retorno').neq('situacao', 'PAGO')),
    ler(db.from('v_calandra_estoque').select('saldo,em_operacao')),
    ler(db.from('v_fechamentos').select('faccao,data_pagamento,valor_pago')),
  ]);
  const c = (s) => cortes.filter(x => x.status === s).length;
  const disp = sublotes.filter(s => s.disponivel_envio);
  const atrasados = envios.filter(e => e.atraso === 'Atrasado');
  const aPagar = retornos.filter(r => r.situacao === 'ABERTO');
  const aConferir = retornos.filter(r => r.situacao === 'A CONFERIR');

  // ---- período financeiro ----
  const per = intervalo();
  const [ini, fim, rotulo] = per;
  const previstoNoPeriodo = envios.filter(e => dentro(e.previsao, per));
  const vencidoAntes = envios.filter(e => e.previsao < ini);
  const valorEnvio = (e) => e.saldo * Number(e.valor_unit || 0);
  const conferidoNoPeriodo = aPagar.filter(r => dentro(r.data_conferencia, per));
  const pagosNoPeriodo = fechamentos.filter(f => dentro(f.data_pagamento, per));
  const soma = (l, f) => l.reduce((a, x) => a + f(x), 0);

  // quadro por facção
  const porFac = new Map();
  const add = (fac, campo, v) => { const x = porFac.get(fac) || { aPagar: 0, conferido: 0, previsto: 0, vencido: 0, pago: 0 }; x[campo] += v; porFac.set(fac, x); };
  aPagar.forEach(r => add(r.faccao, 'aPagar', Number(r.valor_a_pagar)));
  conferidoNoPeriodo.forEach(r => add(r.faccao, 'conferido', Number(r.valor_a_pagar)));
  previstoNoPeriodo.forEach(e => add(e.faccao, 'previsto', valorEnvio(e)));
  vencidoAntes.forEach(e => add(e.faccao, 'vencido', valorEnvio(e)));
  pagosNoPeriodo.forEach(f => add(f.faccao, 'pago', Number(f.valor_pago)));
  const linhas = [...porFac.entries()].filter(([, x]) => x.aPagar || x.previsto || x.vencido || x.pago)
    .sort((a, b) => (b[1].aPagar + b[1].previsto) - (a[1].aPagar + a[1].previsto));

  el.innerHTML = `
    <div class="cab"><div><h1>Olá, ${h(ctx.nome.split(' ')[0])}</h1><p>Resumo da produção agora.</p></div></div>
    <h2>Separação</h2>
    <div class="grade g4" style="margin-bottom:18px">
      <a class="kpi" href="#/corte"><div class="rot">Liberados p/ cortar</div><div class="val">${num(c('Liberado para Corte'))}</div></a>
      <a class="kpi alerta" href="#/corte"><div class="rot">Esperando calandra</div><div class="val">${num(c('Em Espera na Calandra') + c('Em Calandra'))}</div></a>
      <a class="kpi" href="#/lotes"><div class="rot">Sublotes p/ separar</div><div class="val">${num(disp.length)}</div></a>
      <a class="kpi" href="#/lotes"><div class="rot">Peças p/ separar</div><div class="val">${num(soma(disp, s => s.qtd_saldo))}</div></a>
    </div>
    <h2>Produção</h2>
    <div class="grade g4" style="margin-bottom:18px">
      <a class="kpi" href="#/calandra"><div class="rot">Calandra: aguardando operação</div><div class="val">${num(soma(estoque, s => Math.max(0, s.saldo)))}</div></a>
      <a class="kpi" href="#/calandra"><div class="rot">Calandra: em operação</div><div class="val">${num(soma(estoque, s => s.em_operacao))}</div></a>
      <a class="kpi" href="#/faccao"><div class="rot">Peças nas facções</div><div class="val">${num(soma(envios, e => e.saldo))}</div><div class="peq muted">inclui as atrasadas</div></a>
      <a class="kpi erro" href="#/faccao"><div class="rot">Peças atrasadas</div><div class="val">${num(soma(atrasados, e => e.saldo))}</div><div class="peq muted">em ${num(atrasados.length)} envio(s)</div></a>
    </div>

    <div class="cab" style="margin-top:6px"><h2 style="margin:0">Financeiro</h2>
      <div class="abas" style="margin:0">
        ${[['semana', 'Esta semana'], ['proxima', 'Próxima semana'], ['mes', 'Este mês'], ['custom', 'Escolher período']]
          .map(([k, r]) => `<button data-p="${k}" class="${periodo === k ? 'ativo' : ''}">${r}</button>`).join('')}
      </div></div>
    ${periodo === 'custom' ? `<div class="filtros"><label class="campo">De<input type="date" id="de" value="${ini}"></label>
      <label class="campo">Até<input type="date" id="ate" value="${fim}"></label></div>` : ''}
    <p class="muted peq" style="margin-top:0">${h(rotulo)}: ${data(ini)} a ${data(fim)}</p>
    <div class="grade g4" style="margin-bottom:12px">
      <a class="kpi ok" href="#/fechamento"><div class="rot">A pagar hoje (conferido)</div><div class="val" style="font-size:1.4rem">${moeda(soma(aPagar, r => Number(r.valor_a_pagar)))}</div>
        <div class="peq muted">${num(aPagar.length)} retorno(s) · ${num(aConferir.length)} a conferir</div></a>
      <a class="kpi" href="#/faccao"><div class="rot">Previsto no período</div><div class="val" style="font-size:1.4rem">${moeda(soma(previstoNoPeriodo, valorEnvio))}</div>
        <div class="peq muted">${num(soma(previstoNoPeriodo, e => e.saldo))} peças com retorno previsto</div></a>
      <a class="kpi erro" href="#/faccao"><div class="rot">Previsto já vencido</div><div class="val" style="font-size:1.4rem">${moeda(soma(vencidoAntes, valorEnvio))}</div>
        <div class="peq muted">retorno previsto antes de ${data(ini)}</div></a>
      <a class="kpi" href="#/fechamento"><div class="rot">Pago no período</div><div class="val" style="font-size:1.4rem">${moeda(soma(pagosNoPeriodo, f => Number(f.valor_pago)))}</div>
        <div class="peq muted">${num(pagosNoPeriodo.length)} fechamento(s)</div></a>
    </div>
    <p class="muted peq">"Previsto" = peças ainda na facção × preço combinado no envio, pela data de previsão de retorno (valor bruto, antes de defeitos).</p>
    <div class="tabela-wrap"><table>
      <thead><tr><th>Facção</th><th class="n">A pagar (conferido)</th><th class="n">Conferido no período</th><th class="n">Previsto no período</th><th class="n">Previsto vencido</th><th class="n">Pago no período</th></tr></thead>
      <tbody>${linhas.map(([fac, x]) => `<tr><td class="forte">${h(fac)}</td><td class="n">${moeda(x.aPagar)}</td><td class="n">${moeda(x.conferido)}</td>
        <td class="n">${moeda(x.previsto)}</td><td class="n" style="${x.vencido ? 'color:var(--erro)' : ''}">${moeda(x.vencido)}</td><td class="n">${moeda(x.pago)}</td></tr>`).join('')
        || '<tr><td colspan="6" class="vazio">Nada no período.</td></tr>'}</tbody></table></div>`;

  el.querySelectorAll('[data-p]').forEach(b => b.onclick = () => { periodo = b.dataset.p; render(el); });
  el.querySelector('#de')?.addEventListener('change', (e) => { deCustom = e.target.value; render(el); });
  el.querySelector('#ate')?.addEventListener('change', (e) => { ateCustom = e.target.value; render(el); });
}
