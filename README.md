# YAZFIT — Gestão de Produção

App web (HTML + JavaScript puro) publicado no GitHub Pages, com banco no Supabase (projeto **PROJETOS**, schema **`yazfit`**).

Substitui o app AppSheet "PRODUÇÃO - YAZFITWEAR" e os web apps de Corte, Romaneio e Pagamentos.

## Módulos
| Menu | O que faz | Perfil |
|---|---|---|
| Painel | Resumo de corte, calandra, facções e pagamentos | todos |
| 1 - Pedido de Corte | Programa corte (cores × folhas, tamanhos × riscos), confirma, gera sublotes e etiquetas 100×150 mm | corte |
| 2 - Lotes de Produção | Seleciona sublotes e envia para facção (gera romaneio) | faccao |
| Calandra | Estoque peça a peça / tecido corrido, iniciar e concluir operações | calandra |
| Gestão de Facção | Envios em aberto, atraso, retorno parcial/total, conferência, ocorrência | faccao |
| Romaneios | Reimpressão e troca de facção (antes de qualquer retorno) | faccao |
| Consertos | Peças devolvidas para conserto | faccao |
| Fechamento Facção | Pagamento dos retornos conferidos, com desconto rateado | financeiro |
| Cadastros | Produtos, facções, cores, tamanhos, operadores | admin edita |
| Usuários | Libera contas e define perfis | admin |

## Primeiro acesso
1. Abra o app e clique em **Criar conta** (e-mail + senha). Confirme pelo e-mail.
2. Entre: como ainda não há administrador, a tela oferece **Tornar-me administrador**.
3. Os demais usuários criam conta e o admin libera em **Usuários**.

## Estrutura
```
index.html          página única
css/app.css         estilos (inclui layout de etiqueta e romaneio)
js/config.js        URL e chave pública do Supabase
js/app.js           login, menu e rotas
js/util.js          utilidades, modal, impressão
js/romaneio.js      impressão do romaneio
js/telas/*.js       uma tela por arquivo
```

As regras de negócio ficam no banco (funções `yazfit.*`); o front só chama essas funções e lê as views `v_*`.
