import { db, ctx } from '../app.js';
import { h, num, moeda, ler } from '../util.js';

export async function render(el) {
  const [cortes, sublotes, envios, retornos, estoque] = await Promise.all([
    ler(db.from('cortes').select('status')),
    ler(db.from('v_sublotes').select('qtd_saldo,disponivel_envio').gt('qtd_saldo', 0)),
    ler(db.from('v_envios').select('saldo,atraso,status,valor_total').is('data_retorno', null)),
    ler(db.from('v_retornos').select('situacao,valor_a_pagar').neq('situacao', 'PAGO')),
    ler(db.from('v_calandra_estoque').select('saldo,em_operacao')),
  ]);
  const c = (s) => cortes.filter(x => x.status === s).length;
  const disp = sublotes.filter(s => s.disponivel_envio);
  const atrasados = envios.filter(e => e.atraso === 'Atrasado');
  const aPagar = retornos.filter(r => r.situacao === 'ABERTO');
  const aConferir = retornos.filter(r => r.situacao === 'A CONFERIR');
  el.innerHTML = `
    <div class="cab"><div><h1>Olá, ${h(ctx.nome.split(' ')[0])}</h1><p>Resumo da produção agora.</p></div></div>
    <h2>Separação</h2>
    <div class="grade g4" style="margin-bottom:18px">
      <a class="kpi" href="#/corte"><div class="rot">Liberados p/ cortar</div><div class="val">${num(c('Liberado para Corte'))}</div></a>
      <a class="kpi alerta" href="#/corte"><div class="rot">Esperando calandra</div><div class="val">${num(c('Em Espera na Calandra') + c('Em Calandra'))}</div></a>
      <a class="kpi" href="#/lotes"><div class="rot">Sublotes p/ separar</div><div class="val">${num(disp.length)}</div></a>
      <a class="kpi" href="#/lotes"><div class="rot">Peças p/ separar</div><div class="val">${num(disp.reduce((a, s) => a + s.qtd_saldo, 0))}</div></a>
    </div>
    <h2>Produção</h2>
    <div class="grade g4" style="margin-bottom:18px">
      <a class="kpi" href="#/calandra"><div class="rot">Calandra: disponível</div><div class="val">${num(estoque.reduce((a, s) => a + Math.max(0, s.saldo), 0))}</div></a>
      <a class="kpi" href="#/calandra"><div class="rot">Calandra: em operação</div><div class="val">${num(estoque.reduce((a, s) => a + s.em_operacao, 0))}</div></a>
      <a class="kpi" href="#/faccao"><div class="rot">Peças nas facções</div><div class="val">${num(envios.reduce((a, e) => a + e.saldo, 0))}</div></a>
      <a class="kpi erro" href="#/faccao"><div class="rot">Envios atrasados</div><div class="val">${num(atrasados.length)}</div></a>
    </div>
    <h2>Financeiro</h2>
    <div class="grade g4">
      <a class="kpi alerta" href="#/faccao"><div class="rot">Retornos a conferir</div><div class="val">${num(aConferir.length)}</div></a>
      <a class="kpi" href="#/fechamento"><div class="rot">Retornos a pagar</div><div class="val">${num(aPagar.length)}</div></a>
      <a class="kpi ok" href="#/fechamento"><div class="rot">Valor a pagar</div><div class="val" style="font-size:1.4rem">${moeda(aPagar.reduce((a, r) => a + Number(r.valor_a_pagar), 0))}</div></a>
    </div>`;
}
